use std::{
    fs,
    path::PathBuf,
    sync::{Arc, Mutex},
};

use tauri::{AppHandle, Manager, Runtime, Url, WebviewUrl, WebviewWindow, WebviewWindowBuilder, WindowEvent};
use tauri_plugin_deep_link::DeepLinkExt;
use tauri_plugin_opener::{Builder as OpenerPluginBuilder, OpenerExt};

const DEV_APP_URL: &str = "http://localhost:4028";
const PROD_APP_URL: &str = "https://1smartpocket.com";
const DESKTOP_ENTRY_PATH: &str = "/sign-up-login?desktop=1";
const DESKTOP_OAUTH_LAUNCH_PATH: &str = "/desktop/oauth-launch";
const DESKTOP_INTERNAL_CALLBACK_PATH: &str = "/auth/desktop-callback";
const MAIN_WINDOW_LABEL: &str = "main";
const DESKTOP_CALLBACK_SCHEME: &str = "smartpocket";
const DESKTOP_CALLBACK_HOST: &str = "auth";
const DESKTOP_CALLBACK_PATH: &str = "/callback";
const SUPABASE_FALLBACK_ORIGIN: &str = "https://xrltdfxnyyxzztktvotj.supabase.co";
const DEFAULT_WINDOW_WIDTH: f64 = 1280.0;
const DEFAULT_WINDOW_HEIGHT: f64 = 820.0;
const MIN_WINDOW_WIDTH: f64 = 1024.0;
const MIN_WINDOW_HEIGHT: f64 = 700.0;
const WINDOW_STATE_FILE_NAME: &str = "window-state.json";

#[derive(Clone, Debug)]
struct PersistedWindowState {
    width: f64,
    height: f64,
    x: Option<f64>,
    y: Option<f64>,
    maximized: bool,
}

impl Default for PersistedWindowState {
    fn default() -> Self {
        Self {
            width: DEFAULT_WINDOW_WIDTH,
            height: DEFAULT_WINDOW_HEIGHT,
            x: None,
            y: None,
            maximized: false,
        }
    }
}

fn main_app_origin() -> &'static str {
    if cfg!(debug_assertions) {
        DEV_APP_URL
    } else {
        PROD_APP_URL
    }
}

fn main_window_url() -> WebviewUrl {
    WebviewUrl::External(
        format!("{}{}", main_app_origin(), DESKTOP_ENTRY_PATH)
            .parse()
            .expect("invalid Smart Pocket desktop URL"),
    )
}

fn main_window_external_url() -> Url {
    format!("{}{}", main_app_origin(), DESKTOP_ENTRY_PATH)
        .parse()
        .expect("invalid Smart Pocket desktop URL")
}

fn window_state_file_path<R: Runtime>(app: &AppHandle<R>) -> Option<PathBuf> {
    app.path()
        .app_config_dir()
        .ok()
        .map(|dir| dir.join(WINDOW_STATE_FILE_NAME))
}

fn parse_window_state(content: &str) -> Option<PersistedWindowState> {
    let value = serde_json::from_str::<serde_json::Value>(content).ok()?;
    let width = value
        .get("width")
        .and_then(|item| item.as_f64())
        .filter(|width| width.is_finite())
        .map(|width| width.max(MIN_WINDOW_WIDTH))
        .unwrap_or(DEFAULT_WINDOW_WIDTH);
    let height = value
        .get("height")
        .and_then(|item| item.as_f64())
        .filter(|height| height.is_finite())
        .map(|height| height.max(MIN_WINDOW_HEIGHT))
        .unwrap_or(DEFAULT_WINDOW_HEIGHT);
    let x = value
        .get("x")
        .and_then(|item| item.as_f64())
        .filter(|x| x.is_finite());
    let y = value
        .get("y")
        .and_then(|item| item.as_f64())
        .filter(|y| y.is_finite());
    let maximized = value
        .get("maximized")
        .and_then(|item| item.as_bool())
        .unwrap_or(false);

    Some(PersistedWindowState {
        width,
        height,
        x,
        y,
        maximized,
    })
}

fn load_window_state<R: Runtime>(app: &AppHandle<R>) -> PersistedWindowState {
    let Some(path) = window_state_file_path(app) else {
        return PersistedWindowState::default();
    };

    fs::read_to_string(path)
        .ok()
        .and_then(|content| parse_window_state(&content))
        .unwrap_or_default()
}

fn write_window_state<R: Runtime>(app: &AppHandle<R>, state: &PersistedWindowState) {
    let Some(path) = window_state_file_path(app) else {
        return;
    };

    if let Some(parent) = path.parent() {
        if fs::create_dir_all(parent).is_err() {
            return;
        }
    }

    let value = serde_json::json!({
        "width": state.width.max(MIN_WINDOW_WIDTH),
        "height": state.height.max(MIN_WINDOW_HEIGHT),
        "x": state.x,
        "y": state.y,
        "maximized": state.maximized,
    });

    let Ok(serialized) = serde_json::to_vec_pretty(&value) else {
        return;
    };

    let _ = fs::write(path, serialized);
}

fn capture_window_state<R: Runtime>(
    window: &WebviewWindow<R>,
    previous_state: &PersistedWindowState,
) -> PersistedWindowState {
    let mut next_state = previous_state.clone();
    let is_maximized = window.is_maximized().unwrap_or(false);
    next_state.maximized = is_maximized;

    if is_maximized || window.is_minimized().unwrap_or(false) {
        return next_state;
    }

    let scale_factor = window.scale_factor().unwrap_or(1.0).max(1.0);

    if let Ok(size) = window.inner_size() {
        next_state.width = ((size.width as f64) / scale_factor).max(MIN_WINDOW_WIDTH);
        next_state.height = ((size.height as f64) / scale_factor).max(MIN_WINDOW_HEIGHT);
    }

    if let Ok(position) = window.outer_position() {
        next_state.x = Some((position.x as f64) / scale_factor);
        next_state.y = Some((position.y as f64) / scale_factor);
    }

    next_state
}

fn persist_window_state<R: Runtime>(
    app: &AppHandle<R>,
    window: &WebviewWindow<R>,
    state_store: &Arc<Mutex<PersistedWindowState>>,
) {
    let previous_state = match state_store.lock() {
        Ok(state) => state.clone(),
        Err(_) => return,
    };

    let next_state = capture_window_state(window, &previous_state);
    write_window_state(app, &next_state);

    if let Ok(mut state) = state_store.lock() {
        *state = next_state;
    }
}

fn should_persist_window_event(event: &WindowEvent) -> bool {
    matches!(
        event,
        WindowEvent::Resized(_) | WindowEvent::Moved(_) | WindowEvent::CloseRequested { .. } | WindowEvent::Destroyed
    )
}

fn is_allowed_app_navigation(url: &Url) -> bool {
    let expected_origin = Url::parse(main_app_origin()).expect("invalid Smart Pocket app origin");
    url.scheme() == expected_origin.scheme()
        && url.host_str() == expected_origin.host_str()
        && url.port_or_known_default() == expected_origin.port_or_known_default()
}

fn configured_supabase_origin() -> Url {
    let configured = std::env::var("NEXT_PUBLIC_SUPABASE_URL")
        .ok()
        .or_else(|| option_env!("NEXT_PUBLIC_SUPABASE_URL").map(str::to_string))
        .unwrap_or_else(|| SUPABASE_FALLBACK_ORIGIN.to_string());

    let parsed = Url::parse(&configured)
        .or_else(|_| Url::parse(SUPABASE_FALLBACK_ORIGIN))
        .expect("invalid Supabase origin");

    let scheme = parsed.scheme().to_string();
    let host = parsed.host_str().expect("missing Supabase host").to_string();
    let port = parsed.port();
    let mut origin = Url::parse(&format!("{scheme}://{host}")).expect("invalid Supabase origin");
    if let Some(port) = port {
        origin.set_port(Some(port)).expect("invalid Supabase port");
    }
    origin
}

fn safe_next_path(next: &str) -> Option<String> {
    let base = Url::parse("https://smartpocket.local").ok()?;
    let parsed = Url::options().base_url(Some(&base)).parse(next).ok()?;

    if parsed.scheme() != "https" || parsed.host_str() != Some("smartpocket.local") {
        return None;
    }

    let path = parsed.path();
    if !path.starts_with('/') || path.starts_with("//") {
        return None;
    }
    if path == "/api" || path.starts_with("/api/") {
        return None;
    }
    if path.starts_with("/sign-up-login") || path.starts_with("/auth/") {
        return None;
    }

    let mut value = path.to_string();
    if let Some(query) = parsed.query() {
        value.push('?');
        value.push_str(query);
    }
    if let Some(fragment) = parsed.fragment() {
        value.push('#');
        value.push_str(fragment);
    }

    Some(value)
}

fn get_single_query_value(url: &Url, key: &str) -> Result<Option<String>, &'static str> {
    let values: Vec<String> = url
        .query_pairs()
        .filter(|(name, _)| name == key)
        .map(|(_, value)| value.into_owned())
        .collect();

    match values.len() {
        0 => Ok(None),
        1 => Ok(values.into_iter().next()),
        _ => Err("The desktop sign-in callback contained duplicate parameters."),
    }
}

fn is_safe_callback_token(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 64
        && value
            .chars()
            .all(|ch| ch.is_ascii_alphanumeric() || ch == '_' || ch == '-')
}

fn is_safe_pkce_code(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 2048
        && value
            .chars()
            .all(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '-' | '_' | '.' | '~'))
}

fn is_safe_signup_method(value: &str) -> bool {
    matches!(value, "google" | "apple" | "magic_link" | "email_link")
}

fn build_auth_error_url(code: &str, message: &str) -> Url {
    let mut url = Url::parse(&format!("{}{}", main_app_origin(), DESKTOP_ENTRY_PATH))
        .expect("invalid Smart Pocket auth error URL");
    url.query_pairs_mut()
        .append_pair("authError", code)
        .append_pair("authMessage", message);
    url
}

fn build_internal_callback_url(callback_url: &Url) -> Result<Url, &'static str> {
    if callback_url.scheme() != DESKTOP_CALLBACK_SCHEME
        || callback_url.host_str() != Some(DESKTOP_CALLBACK_HOST)
        || callback_url.path() != DESKTOP_CALLBACK_PATH
    {
        return Err("The desktop sign-in callback was invalid. Please try again.");
    }

    let code = get_single_query_value(callback_url, "code")?;
    let error = get_single_query_value(callback_url, "error")?;
    let error_description = get_single_query_value(callback_url, "error_description")?;
    let next = get_single_query_value(callback_url, "next")?;
    let auth_type = get_single_query_value(callback_url, "type")?;
    let signup_method = get_single_query_value(callback_url, "signup_method")?;

    if code.is_some() == error.is_some() {
        return Err("The Google sign-in callback was incomplete. Please try again.");
    }

    let mut url = Url::parse(&format!("{}{}", main_app_origin(), DESKTOP_INTERNAL_CALLBACK_PATH))
        .expect("invalid Smart Pocket callback target");
    {
        let mut query = url.query_pairs_mut();
        if let Some(code) = code {
            if !is_safe_pkce_code(&code) {
                return Err("The Google sign-in callback included an invalid code.");
            }
            query.append_pair("code", &code);
        }
        if let Some(error) = error {
            if !is_safe_callback_token(&error) {
                return Err("The Google sign-in callback included an invalid error.");
            }
            query.append_pair("error", &error);
        }
        if let Some(error_description) = error_description {
            if !error_description.is_empty() {
                query.append_pair("error_description", &error_description);
            }
        }
        if let Some(next) = next {
            let safe_next = safe_next_path(&next)
                .ok_or("The requested post-login page was invalid. Please try again.")?;
            query.append_pair("next", &safe_next);
        }
        if let Some(auth_type) = auth_type {
            if !is_safe_callback_token(&auth_type) {
                return Err("The Google sign-in callback included an invalid type.");
            }
            query.append_pair("type", &auth_type);
        }
        if let Some(signup_method) = signup_method {
            if !is_safe_signup_method(&signup_method) {
                return Err("The Google sign-in callback included an invalid signup method.");
            }
            query.append_pair("signup_method", &signup_method);
        }
    }

    Ok(url)
}

fn is_desktop_auth_callback_url(url: &Url) -> bool {
    if url.scheme() != DESKTOP_CALLBACK_SCHEME
        || url.host_str() != Some(DESKTOP_CALLBACK_HOST)
        || url.path() != DESKTOP_CALLBACK_PATH
    {
        return false;
    }

    match get_single_query_value(url, "next") {
        Ok(Some(next)) => safe_next_path(&next).is_some(),
        Ok(None) => true,
        Err(_) => false,
    }
}

fn is_desktop_browser_completion_url(url: &Url) -> bool {
    if url.scheme() != "https"
        || url.host_str() != Some("1smartpocket.com")
        || url.path() != "/auth/desktop-browser-complete"
    {
        return false;
    }

    if !url.username().is_empty()
        || url.password().is_some()
        || url.port().is_some()
        || url.fragment().is_some()
    {
        return false;
    }

    for (key, _) in url.query_pairs() {
        if !matches!(key.as_ref(), "next" | "type" | "signup_method") {
            return false;
        }
    }

    match get_single_query_value(url, "next") {
        Ok(Some(next)) if safe_next_path(&next).is_some() => {}
        Ok(Some(_)) => return false,
        Ok(None) => {}
        Err(_) => return false,
    }

    match get_single_query_value(url, "type") {
        Ok(Some(auth_type)) if is_safe_callback_token(&auth_type) => {}
        Ok(Some(_)) => return false,
        Ok(None) => {}
        Err(_) => return false,
    }

    match get_single_query_value(url, "signup_method") {
        Ok(Some(signup_method)) if is_safe_signup_method(&signup_method) => {}
        Ok(Some(_)) => return false,
        Ok(None) => {}
        Err(_) => return false,
    }

    true
}

fn validate_oauth_launch_target(url: &Url) -> Result<(), &'static str> {
    let expected_origin = configured_supabase_origin();

    if url.scheme() != expected_origin.scheme()
        || url.host_str() != expected_origin.host_str()
        || url.port_or_known_default() != expected_origin.port_or_known_default()
    {
        return Err("Google sign-in returned an invalid OAuth origin.");
    }

    if url.path() != "/auth/v1/authorize" {
        return Err("Google sign-in returned an invalid OAuth path.");
    }

    match get_single_query_value(url, "provider") {
        Ok(Some(provider)) if provider == "google" => {}
        _ => return Err("Google sign-in returned an invalid provider."),
    }

    match get_single_query_value(url, "redirect_to") {
        Ok(Some(redirect_to)) => {
            let redirect_url = redirect_to
                .parse::<Url>()
                .map_err(|_| "Google sign-in returned an invalid callback URL.")?;

            if !is_desktop_auth_callback_url(&redirect_url)
                && !is_desktop_browser_completion_url(&redirect_url)
            {
                return Err("Google sign-in returned an invalid callback URL.");
            }
        }
        _ => return Err("Google sign-in returned an incomplete callback URL."),
    }

    Ok(())
}

fn extract_oauth_launch_target(url: &Url) -> Result<Url, &'static str> {
    let Some(target) = get_single_query_value(url, "url")? else {
        return Err("Google sign-in did not return an OAuth URL.");
    };

    let target_url = target
        .parse::<Url>()
        .map_err(|_| "Google sign-in returned an invalid OAuth URL.")?;

    validate_oauth_launch_target(&target_url)?;
    Ok(target_url)
}

fn is_external_website_url(url: &Url) -> bool {
    matches!(url.scheme(), "http" | "https") && !is_allowed_app_navigation(url)
}

fn focus_main_window<R: Runtime>(window: &WebviewWindow<R>) {
    let _ = window.show();
    let _ = window.unminimize();
    let _ = window.set_focus();
}

fn navigate_main_window<R: Runtime>(window: &WebviewWindow<R>, url: Url) {
    focus_main_window(window);
    let _ = window.navigate(url);
}

fn log_desktop_callback_url(url: &Url) {
    println!("[SmartPocketDesktop] received deep-link URL: {}", url);
}

fn handle_desktop_callback<R: Runtime>(app: &AppHandle<R>, callback_url: &Url) {
    log_desktop_callback_url(callback_url);

    let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) else {
        return;
    };

    match build_internal_callback_url(callback_url) {
        Ok(target_url) => {
            println!("[SmartPocketDesktop] callback navigation target: {}", target_url);
            navigate_main_window(&window, target_url);
        }
        Err(message) => navigate_main_window(&window, build_auth_error_url("callback_error", message)),
    }
}

fn handle_desktop_callback_value<R: Runtime>(app: &AppHandle<R>, raw_url: &str) -> bool {
    let Ok(url) = raw_url.parse::<Url>() else {
        return false;
    };

    if url.scheme() != DESKTOP_CALLBACK_SCHEME {
        return false;
    }

    handle_desktop_callback(app, &url);
    true
}

fn register_desktop_callback_handler<R: Runtime>(app: &AppHandle<R>) {
    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    {
        let _ = app.deep_link().register_all();

        let app_handle = app.clone();
        app.deep_link().on_open_url(move |event| {
            for url in event.urls() {
                handle_desktop_callback(&app_handle, &url);
            }
        });

        if let Ok(Some(urls)) = app.deep_link().get_current() {
            for url in urls {
                handle_desktop_callback(app, &url);
            }
        }
    }
}

fn handle_navigation<R: Runtime>(app: &AppHandle<R>, url: &Url) -> bool {
    if is_allowed_app_navigation(url) && url.path() == DESKTOP_OAUTH_LAUNCH_PATH {
        match extract_oauth_launch_target(url) {
            Ok(target_url) => {
                if let Err(_error) = app.opener().open_url(target_url.as_str(), None::<&str>) {
                    if let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) {
                        navigate_main_window(
                            &window,
                            build_auth_error_url(
                                "oauth_provider_error",
                                "Google sign-in could not be opened in your browser. Please try again.",
                            ),
                        );
                    }
                }
            }
            Err(message) => {
                if let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) {
                    navigate_main_window(&window, build_auth_error_url("oauth_provider_error", message));
                }
            }
        }

        return false;
    }

    if is_allowed_app_navigation(url) {
        return true;
    }

    if is_external_website_url(url) {
        let _ = app.opener().open_url(url.as_str(), None::<&str>);
        return false;
    }

    false
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            let handled_deep_link = args
                .iter()
                .any(|arg| handle_desktop_callback_value(app, arg));

            if !handled_deep_link {
                if let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) {
                    focus_main_window(&window);
                }
            }
        }))
        .plugin(tauri_plugin_deep_link::init())
        .plugin(OpenerPluginBuilder::new().open_js_links_on_click(false).build())
        .setup(|app| {
            let mut main_window = app
                .config()
                .app
                .windows
                .iter()
                .find(|window| window.label == MAIN_WINDOW_LABEL)
                .cloned()
                .expect("missing main window config");

            main_window.url = main_window_url();
            println!(
                "[SmartPocketDesktop] initial desktop URL: {}",
                main_window_external_url()
            );
            let app_handle = app.handle().clone();
            let callback_handle = app.handle().clone();
            let persisted_state = load_window_state(&app.handle().clone());
            let window_state_store = Arc::new(Mutex::new(persisted_state.clone()));

            let builder = WebviewWindowBuilder::from_config(app, &main_window)?
                .on_navigation(move |url| handle_navigation(&app_handle, url))
                .inner_size(
                    persisted_state.width.max(MIN_WINDOW_WIDTH),
                    persisted_state.height.max(MIN_WINDOW_HEIGHT),
                )
                .maximized(persisted_state.maximized);

            let builder = match (persisted_state.x, persisted_state.y) {
                (Some(x), Some(y)) => builder.position(x, y),
                _ => builder.center(),
            };

            let main_window = builder.build()?;

            let state_handle = app.handle().clone();
            let state_store = window_state_store.clone();
            main_window.on_window_event(move |event| {
                if !should_persist_window_event(event) {
                    return;
                }

                if let Some(window) = state_handle.get_webview_window(MAIN_WINDOW_LABEL) {
                    persist_window_state(&state_handle, &window, &state_store);
                }
            });

            focus_main_window(&main_window);
            register_desktop_callback_handler(&callback_handle);

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Smart Pocket desktop shell");
}
