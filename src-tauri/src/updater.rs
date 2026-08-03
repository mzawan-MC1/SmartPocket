use std::{
    fs,
    path::PathBuf,
    sync::{Arc, Mutex},
    thread,
    time::{Duration, SystemTime, UNIX_EPOCH},
};

use tauri::{AppHandle, Manager, Runtime};
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};
use tauri_plugin_updater::{Update, UpdaterExt};

const UPDATE_STATE_FILE_NAME: &str = "updater-state.json";
const AUTO_CHECK_DELAY_SECONDS: u64 = 5;
const AUTO_CHECK_INTERVAL_SECONDS: u64 = 60 * 60 * 24;
const MAIN_WINDOW_LABEL: &str = "main";
#[cfg(target_os = "windows")]
const APPMODEL_ERROR_NO_PACKAGE: i32 = 15700;
#[cfg(target_os = "windows")]
const ERROR_INSUFFICIENT_BUFFER: i32 = 122;

#[cfg(target_os = "windows")]
unsafe extern "system" {
    fn GetCurrentPackageFullName(package_full_name_length: *mut u32, package_full_name: *mut u16) -> i32;
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum UpdateCheckSource {
    Automatic,
    Manual,
}

#[derive(Default)]
struct UpdateRunState {
    in_progress: bool,
    downloaded_bytes: u64,
    content_length: Option<u64>,
}

#[derive(Clone, Default)]
pub struct NativeUpdaterState {
    inner: Arc<Mutex<UpdateRunState>>,
}

struct UpdateRunGuard<R: Runtime> {
    app: AppHandle<R>,
}

impl<R: Runtime> Drop for UpdateRunGuard<R> {
    fn drop(&mut self) {
        finish_update_run(&self.app);
    }
}

#[cfg(target_os = "windows")]
fn has_msix_package_identity() -> bool {
    let mut length = 0u32;
    let result = unsafe { GetCurrentPackageFullName(&mut length, std::ptr::null_mut()) };
    if result == APPMODEL_ERROR_NO_PACKAGE {
        return false;
    }

    matches!(result, ERROR_INSUFFICIENT_BUFFER | 0)
}

#[cfg(not(target_os = "windows"))]
fn has_msix_package_identity() -> bool {
    false
}

pub fn is_store_managed_runtime() -> bool {
    has_msix_package_identity()
}

pub fn log_store_managed_updates_message() {
    println!(
        "[SmartPocketDesktop] store-managed runtime detected; updates are managed by Microsoft Store"
    );
}

fn updater_state_file_path<R: Runtime>(app: &AppHandle<R>) -> Option<PathBuf> {
    app.path()
        .app_config_dir()
        .ok()
        .map(|dir| dir.join(UPDATE_STATE_FILE_NAME))
}

fn now_unix_seconds() -> Option<u64> {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .ok()
        .map(|duration| duration.as_secs())
}

fn read_last_check_timestamp<R: Runtime>(app: &AppHandle<R>) -> Option<u64> {
    let path = updater_state_file_path(app)?;
    let content = fs::read_to_string(path).ok()?;
    let value = serde_json::from_str::<serde_json::Value>(&content).ok()?;
    value
        .get("last_check_unix_seconds")
        .and_then(|item| item.as_u64())
}

fn write_last_check_timestamp<R: Runtime>(app: &AppHandle<R>, timestamp: u64) {
    let Some(path) = updater_state_file_path(app) else {
        return;
    };

    if let Some(parent) = path.parent() {
        if let Err(error) = fs::create_dir_all(parent) {
            println!(
                "[SmartPocketDesktop] updater could not create config directory: {}",
                error
            );
            return;
        }
    }

    let payload = serde_json::json!({
        "last_check_unix_seconds": timestamp,
    });

    let Ok(serialized) = serde_json::to_vec_pretty(&payload) else {
        return;
    };

    if let Err(error) = fs::write(path, serialized) {
        println!(
            "[SmartPocketDesktop] updater could not persist last-check timestamp: {}",
            error
        );
    }
}

fn should_skip_automatic_check<R: Runtime>(app: &AppHandle<R>) -> bool {
    let Some(now) = now_unix_seconds() else {
        return false;
    };

    let Some(last_check) = read_last_check_timestamp(app) else {
        return false;
    };

    now.saturating_sub(last_check) < AUTO_CHECK_INTERVAL_SECONDS
}

fn begin_update_run<R: Runtime>(app: &AppHandle<R>) -> bool {
    let state = app.state::<NativeUpdaterState>();
    let Ok(mut guard) = state.inner.lock() else {
        println!("[SmartPocketDesktop] updater state lock was poisoned");
        return false;
    };

    if guard.in_progress {
        return false;
    }

    guard.in_progress = true;
    guard.downloaded_bytes = 0;
    guard.content_length = None;
    true
}

fn finish_update_run<R: Runtime>(app: &AppHandle<R>) {
    let state = app.state::<NativeUpdaterState>();
    let Ok(mut guard) = state.inner.lock() else {
        return;
    };

    guard.in_progress = false;
    guard.downloaded_bytes = 0;
    guard.content_length = None;
}

fn record_download_progress<R: Runtime>(
    app: &AppHandle<R>,
    chunk_length: usize,
    content_length: Option<u64>,
) {
    let state = app.state::<NativeUpdaterState>();
    let Ok(mut guard) = state.inner.lock() else {
        return;
    };

    guard.downloaded_bytes = guard.downloaded_bytes.saturating_add(chunk_length as u64);
    guard.content_length = content_length;

    println!(
        "[SmartPocketDesktop] updater progress: downloaded {} bytes of {:?}",
        guard.downloaded_bytes, guard.content_length
    );
}

fn release_notes_summary(update: &Update) -> String {
    let notes = update
        .body
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or("No release notes were provided.");

    let mut summary = String::new();
    let mut line_count = 0;

    for line in notes.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }

        if !summary.is_empty() {
            summary.push('\n');
        }
        summary.push_str(trimmed);
        line_count += 1;

        if line_count >= 6 || summary.len() >= 500 {
            break;
        }
    }

    if summary.is_empty() {
        "No release notes were provided.".to_string()
    } else if summary.len() > 500 {
        format!("{}...", summary.chars().take(497).collect::<String>())
    } else {
        summary
    }
}

fn show_update_available_prompt<R: Runtime>(app: &AppHandle<R>, update: &Update) -> bool {
    let message = format!(
        "Smart Pocket {} is available.\n\nRelease notes:\n{}",
        update.version,
        release_notes_summary(update)
    );

    let mut builder = app
        .dialog()
        .message(message)
        .title("Update available")
        .kind(MessageDialogKind::Info)
        .buttons(MessageDialogButtons::OkCancelCustom(
            "Update now".to_string(),
            "Later".to_string(),
        ));

    if let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) {
        builder = builder.parent(&window);
    }

    builder.blocking_show()
}

fn show_info_dialog<R: Runtime>(app: &AppHandle<R>, title: &str, message: &str) {
    let mut builder = app
        .dialog()
        .message(message.to_string())
        .title(title.to_string())
        .kind(MessageDialogKind::Info);

    if let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) {
        builder = builder.parent(&window);
    }

    builder.show(|_| {});
}

fn show_error_dialog<R: Runtime>(app: &AppHandle<R>, title: &str, message: &str) {
    let mut builder = app
        .dialog()
        .message(message.to_string())
        .title(title.to_string())
        .kind(MessageDialogKind::Error);

    if let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) {
        builder = builder.parent(&window);
    }

    builder.show(|_| {});
}

async fn run_update_check<R: Runtime>(app: AppHandle<R>, source: UpdateCheckSource) {
    if is_store_managed_runtime() {
        log_store_managed_updates_message();
        return;
    }

    if source == UpdateCheckSource::Automatic && should_skip_automatic_check(&app) {
        return;
    }

    if !begin_update_run(&app) {
        if source == UpdateCheckSource::Manual {
            show_info_dialog(
                &app,
                "Check for updates",
                "An update check is already in progress.",
            );
        }
        return;
    }

    let _guard = UpdateRunGuard { app: app.clone() };

    if let Some(now) = now_unix_seconds() {
        write_last_check_timestamp(&app, now);
    }

    let update = match app.updater() {
        Ok(updater) => match updater.check().await {
            Ok(update) => update,
            Err(error) => {
                println!(
                    "[SmartPocketDesktop] updater check failed during {:?}: {}",
                    source, error
                );
                if source == UpdateCheckSource::Manual {
                    show_error_dialog(
                        &app,
                        "Update check failed",
                        "Smart Pocket could not check for updates. Please try again later.",
                    );
                }
                return;
            }
        },
        Err(error) => {
            println!(
                "[SmartPocketDesktop] updater initialization failed during {:?}: {}",
                source, error
            );
            if source == UpdateCheckSource::Manual {
                show_error_dialog(
                    &app,
                    "Update check failed",
                    "Smart Pocket could not initialize the updater. Please try again later.",
                );
            }
            return;
        }
    };

    let Some(update) = update else {
        if source == UpdateCheckSource::Manual {
            show_info_dialog(
                &app,
                "Check for updates",
                "Smart Pocket is already on the latest version.",
            );
        }
        return;
    };

    let prompt_app = app.clone();
    let prompt_update = update.clone();
    let approved = match tauri::async_runtime::spawn_blocking(move || {
        show_update_available_prompt(&prompt_app, &prompt_update)
    })
    .await
    {
        Ok(approved) => approved,
        Err(error) => {
            println!(
                "[SmartPocketDesktop] updater dialog failed during {:?}: {}",
                source, error
            );
            false
        }
    };

    if !approved {
        return;
    }

    let install_result = update
        .download_and_install(
            {
                let app = app.clone();
                move |chunk_length, content_length| {
                    record_download_progress(&app, chunk_length, content_length);
                }
            },
            || {
                println!("[SmartPocketDesktop] updater download finished");
            },
        )
        .await;

    match install_result {
        Ok(()) => {
            println!(
                "[SmartPocketDesktop] updater installed version {} successfully",
                update.version
            );
            app.restart();
        }
        Err(error) => {
            println!(
                "[SmartPocketDesktop] updater install failed for version {}: {}",
                update.version, error
            );
            show_error_dialog(
                &app,
                "Update failed",
                "Smart Pocket could not install the update. Please try again later.",
            );
        }
    }
}

pub fn schedule_automatic_check<R: Runtime>(app: &AppHandle<R>) {
    if is_store_managed_runtime() {
        log_store_managed_updates_message();
        return;
    }

    if cfg!(debug_assertions) {
        return;
    }

    let app_handle = app.clone();
    thread::spawn(move || {
        thread::sleep(Duration::from_secs(AUTO_CHECK_DELAY_SECONDS));
        tauri::async_runtime::block_on(run_update_check(app_handle, UpdateCheckSource::Automatic));
    });
}

pub fn trigger_manual_check<R: Runtime>(app: &AppHandle<R>) {
    if is_store_managed_runtime() {
        log_store_managed_updates_message();
        return;
    }

    let app_handle = app.clone();
    thread::spawn(move || {
        tauri::async_runtime::block_on(run_update_check(app_handle, UpdateCheckSource::Manual));
    });
}
