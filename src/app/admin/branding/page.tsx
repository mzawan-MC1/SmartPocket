'use client';

import React, { useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { Check, Loader2, Palette } from 'lucide-react';
import { toast } from 'sonner';
import { usePlatformSettings } from '@/contexts/PlatformSettingsContext';
import { getPlatformSettings, savePlatformSettings } from '@/lib/finance';
import { isSupportedUploadFile, uploadPublicMedia } from '@/lib/media-upload';
import {
  resolveDesktopAppRelease,
  sanitizeDesktopMediaUrl,
  sanitizeDesktopStatusLabel,
  sanitizeDesktopUpdateNotes,
  sanitizeHttpsUrl,
} from '@/lib/desktop-downloads';
import {
  normalizePlatformSettings,
  type PlatformFontFamily,
  type PlatformSettingsSnapshot,
} from '@/lib/platform-settings';

const MediaUploadCard = dynamic(() => import('@/components/ui/MediaUploadCard'), {
  ssr: false,
  loading: () => <div className="rounded-2xl border border-border bg-muted/20 p-4 text-sm text-muted-foreground">Loading media uploader...</div>,
});

type BrandingUploadField =
  | 'logo_url'
  | 'compact_logo_url'
  | 'favicon_url'
  | 'apple_touch_icon_url'
  | 'email_logo_url'
  | 'organization_logo_url';

type UploadField = BrandingUploadField | 'desktop_app_hero_image_url';

type BrandingSettingsState = {
  app_name: string;
  short_brand_name: string;
  tagline: string;
  primary_color: string;
  accent_color: string;
  logo_url: string;
  compact_logo_url: string;
  favicon_url: string;
  apple_touch_icon_url: string;
  email_logo_url: string;
  organization_logo_url: string;
  font_family: PlatformFontFamily;
  desktop_app_hero_image_url: string;
  desktop_windows_available: boolean;
  desktop_windows_download_url: string;
  desktop_windows_version: string;
  desktop_windows_release_date: string;
  desktop_windows_status_label: string;
  desktop_macos_available: boolean;
  desktop_macos_download_url: string;
  desktop_macos_version: string;
  desktop_macos_release_date: string;
  desktop_macos_status_label: string;
  desktop_update_title: string;
  desktop_update_date: string;
  desktop_update_notes: string[];
};

const IMAGE_UPLOAD = {
  accept: '.png,.jpg,.jpeg,.webp,.svg,image/png,image/jpeg,image/webp,image/svg+xml',
  acceptedFormatsLabel: 'PNG, JPG, JPEG, WEBP, SVG',
  maxSizeBytes: 2 * 1024 * 1024,
  maxSizeLabel: '2 MB',
  allowedMimeTypes: ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'],
  allowedExtensions: ['png', 'jpg', 'jpeg', 'webp', 'svg'],
};

const FAVICON_UPLOAD = {
  accept: '.ico,.png,.svg,image/x-icon,image/vnd.microsoft.icon,image/png,image/svg+xml',
  acceptedFormatsLabel: 'ICO, PNG, SVG',
  maxSizeBytes: 512 * 1024,
  maxSizeLabel: '512 KB',
  allowedMimeTypes: ['image/png', 'image/x-icon', 'image/vnd.microsoft.icon', 'image/svg+xml'],
  allowedExtensions: ['ico', 'png', 'svg'],
};

const BRANDING_UPLOADS: Record<
  BrandingUploadField,
  {
    labelKey: string;
    helperTextKey: string;
    previewVariant: 'square' | 'wide';
    filePrefix: string;
    config: typeof IMAGE_UPLOAD | typeof FAVICON_UPLOAD;
  }
> = {
  logo_url: {
    labelKey: 'branding.uploads.logo.label',
    helperTextKey: 'branding.uploads.logo.helper',
    previewVariant: 'wide',
    filePrefix: 'logo',
    config: IMAGE_UPLOAD,
  },
  compact_logo_url: {
    labelKey: 'branding.uploads.compactLogo.label',
    helperTextKey: 'branding.uploads.compactLogo.helper',
    previewVariant: 'square',
    filePrefix: 'compact-logo',
    config: IMAGE_UPLOAD,
  },
  favicon_url: {
    labelKey: 'branding.uploads.favicon.label',
    helperTextKey: 'branding.uploads.favicon.helper',
    previewVariant: 'square',
    filePrefix: 'favicon',
    config: FAVICON_UPLOAD,
  },
  apple_touch_icon_url: {
    labelKey: 'branding.uploads.appleTouchIcon.label',
    helperTextKey: 'branding.uploads.appleTouchIcon.helper',
    previewVariant: 'square',
    filePrefix: 'apple-touch-icon',
    config: IMAGE_UPLOAD,
  },
  email_logo_url: {
    labelKey: 'branding.uploads.emailLogo.label',
    helperTextKey: 'branding.uploads.emailLogo.helper',
    previewVariant: 'wide',
    filePrefix: 'email-logo',
    config: IMAGE_UPLOAD,
  },
  organization_logo_url: {
    labelKey: 'branding.uploads.organizationLogo.label',
    helperTextKey: 'branding.uploads.organizationLogo.helper',
    previewVariant: 'wide',
    filePrefix: 'organization-logo',
    config: IMAGE_UPLOAD,
  },
};

const DESKTOP_HERO_UPLOAD = {
  labelKey: 'branding.desktop.heroImageLabel',
  helperTextKey: 'branding.desktop.heroImageHelper',
  previewVariant: 'wide' as const,
  filePrefix: 'desktop-app-hero',
  config: IMAGE_UPLOAD,
};

const DESKTOP_PLATFORM_FIELDS = [
  {
    platform: 'windows' as const,
    availableKey: 'desktop_windows_available' as const,
    downloadUrlKey: 'desktop_windows_download_url' as const,
    versionKey: 'desktop_windows_version' as const,
    releaseDateKey: 'desktop_windows_release_date' as const,
    statusKey: 'desktop_windows_status_label' as const,
  },
  {
    platform: 'macos' as const,
    availableKey: 'desktop_macos_available' as const,
    downloadUrlKey: 'desktop_macos_download_url' as const,
    versionKey: 'desktop_macos_version' as const,
    releaseDateKey: 'desktop_macos_release_date' as const,
    statusKey: 'desktop_macos_status_label' as const,
  },
] as const;

function isValidIsoDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function padDesktopUpdateNotes(notes: string[]) {
  const padded = [...notes];
  while (padded.length < 3) {
    padded.push('');
  }
  return padded.slice(0, 3);
}

function isMissingDesktopSettingsColumnError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return message.toLowerCase().includes('desktop_') && message.toLowerCase().includes('column');
}

function buildSettingsState(snapshot: PlatformSettingsSnapshot): BrandingSettingsState {
  const desktopRelease = resolveDesktopAppRelease(snapshot);
  const raw = snapshot.raw || {};
  const readRawString = (value: unknown, fallback = '') =>
    typeof value === 'string' ? value.trim() : fallback;
  const readRawBoolean = (value: unknown, fallback: boolean) =>
    typeof value === 'boolean' ? value : fallback;
  const readRawNotes = (value: unknown) =>
    Array.isArray(value)
      ? value.map((item) => (typeof item === 'string' ? item.trim() : '')).filter(Boolean)
      : [];
  const rawDesktopUpdateNotes = readRawNotes(raw.desktop_update_notes);

  return {
    app_name: snapshot.branding.appName,
    short_brand_name: snapshot.branding.shortBrandName,
    tagline: snapshot.branding.tagline,
    primary_color: snapshot.branding.primaryColor,
    accent_color: snapshot.branding.accentColor,
    logo_url: snapshot.branding.logoUrl,
    compact_logo_url: snapshot.branding.compactLogoUrl,
    favicon_url: snapshot.branding.faviconUrl,
    apple_touch_icon_url: snapshot.branding.appleTouchIconUrl,
    email_logo_url: snapshot.branding.emailLogoUrl,
    organization_logo_url: snapshot.branding.organizationLogoUrl,
    font_family: snapshot.branding.fontFamily,
    desktop_app_hero_image_url: readRawString(raw.desktop_app_hero_image_url),
    desktop_windows_available: readRawBoolean(raw.desktop_windows_available, desktopRelease.platforms.windows.enabled),
    desktop_windows_download_url: readRawString(raw.desktop_windows_download_url, desktopRelease.platforms.windows.directDownloadUrl || ''),
    desktop_windows_version: readRawString(raw.desktop_windows_version, desktopRelease.platforms.windows.version),
    desktop_windows_release_date: readRawString(raw.desktop_windows_release_date, desktopRelease.platforms.windows.releaseDate),
    desktop_windows_status_label: readRawString(raw.desktop_windows_status_label, desktopRelease.platforms.windows.statusLabel),
    desktop_macos_available: readRawBoolean(raw.desktop_macos_available, desktopRelease.platforms.macos.enabled),
    desktop_macos_download_url: readRawString(raw.desktop_macos_download_url, desktopRelease.platforms.macos.directDownloadUrl || ''),
    desktop_macos_version: readRawString(raw.desktop_macos_version, desktopRelease.platforms.macos.version),
    desktop_macos_release_date: readRawString(raw.desktop_macos_release_date, desktopRelease.platforms.macos.releaseDate),
    desktop_macos_status_label: readRawString(raw.desktop_macos_status_label, desktopRelease.platforms.macos.statusLabel),
    desktop_update_title: readRawString(raw.desktop_update_title, desktopRelease.latestUpdate.title),
    desktop_update_date: readRawString(raw.desktop_update_date, desktopRelease.latestUpdate.date),
    desktop_update_notes: padDesktopUpdateNotes(rawDesktopUpdateNotes.length > 0 ? rawDesktopUpdateNotes : desktopRelease.latestUpdate.notes),
  };
}

export default function AdminBrandingPage() {
  const router = useRouter();
  const platformSettings = usePlatformSettings();
  const { t } = useTranslation('admin');
  const [saved, setSaved] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedFiles, setSelectedFiles] = useState<Partial<Record<UploadField, File | null>>>({});
  const [uploadProgress, setUploadProgress] = useState<Partial<Record<UploadField, number>>>({});
  const [uploadErrors, setUploadErrors] = useState<Partial<Record<UploadField, string>>>({});
  const [settings, setSettings] = useState<BrandingSettingsState>(() => buildSettingsState(platformSettings));

  const uploadConfigs = useMemo(
    () => ({
      ...BRANDING_UPLOADS,
      desktop_app_hero_image_url: DESKTOP_HERO_UPLOAD,
    }),
    []
  );

  useEffect(() => {
    getPlatformSettings()
      .then((data) => {
        if (data) {
          setSettings(buildSettingsState(normalizePlatformSettings(data)));
        } else {
          setSettings(buildSettingsState(platformSettings));
        }
      })
      .catch(() => {
        toast.error(t('branding.toasts.loadFailed'));
      })
      .finally(() => setIsLoading(false));
  }, [platformSettings, t]);

  const handleFileSelection = (field: UploadField, file: File | null) => {
    const config = uploadConfigs[field].config;

    if (!file) {
      setSelectedFiles((current) => ({ ...current, [field]: null }));
      setUploadErrors((current) => ({ ...current, [field]: undefined }));
      setUploadProgress((current) => ({ ...current, [field]: 0 }));
      return;
    }

    try {
      isSupportedUploadFile({
        file,
        allowedMimeTypes: config.allowedMimeTypes,
        allowedExtensions: config.allowedExtensions,
        maxSizeBytes: config.maxSizeBytes,
      });
      setSelectedFiles((current) => ({ ...current, [field]: file }));
      setUploadErrors((current) => ({ ...current, [field]: undefined }));
    } catch (error) {
      setSelectedFiles((current) => ({ ...current, [field]: null }));
      setUploadErrors((current) => ({
        ...current,
        [field]: error instanceof Error ? error.message : t('branding.validation.invalidFile'),
      }));
    }
  };

  const validateDesktopSettings = (nextSettings: BrandingSettingsState) => {
    const validateOptionalDate = (value: string, label: string) => {
      const trimmed = value.trim();
      if (trimmed && !isValidIsoDate(trimmed)) {
        throw new Error(t('branding.validation.invalidDate', { field: label }));
      }
    };

    const validateOptionalHttpsLink = (value: string, label: string) => {
      const trimmed = value.trim();
      if (trimmed && !sanitizeHttpsUrl(trimmed)) {
        throw new Error(t('branding.validation.invalidHttpsUrl', { field: label }));
      }
    };

    const heroImageUrl = nextSettings.desktop_app_hero_image_url.trim();
    if (heroImageUrl && !sanitizeDesktopMediaUrl(heroImageUrl)) {
      throw new Error(t('branding.validation.invalidMediaUrl'));
    }

    validateOptionalHttpsLink(
      nextSettings.desktop_windows_download_url,
      t('branding.desktop.platforms.windows.downloadUrl')
    );
    validateOptionalHttpsLink(
      nextSettings.desktop_macos_download_url,
      t('branding.desktop.platforms.macos.downloadUrl')
    );
    validateOptionalDate(
      nextSettings.desktop_windows_release_date,
      t('branding.desktop.platforms.windows.releaseDate')
    );
    validateOptionalDate(
      nextSettings.desktop_macos_release_date,
      t('branding.desktop.platforms.macos.releaseDate')
    );
    validateOptionalDate(nextSettings.desktop_update_date, t('branding.desktop.latestUpdate.date'));
  };

  const handleSave = async () => {
    setIsSaving(true);

    try {
      const nextSettings = {
        ...settings,
        desktop_update_notes: [...settings.desktop_update_notes],
      };

      for (const field of Object.keys(uploadConfigs) as UploadField[]) {
        const selectedFile = selectedFiles[field];
        if (!selectedFile) {
          continue;
        }

        const upload = uploadConfigs[field];
        const result = await uploadPublicMedia({
          file: selectedFile,
          folder: 'branding',
          filePrefix: upload.filePrefix,
          maxSizeBytes: upload.config.maxSizeBytes,
          allowedMimeTypes: upload.config.allowedMimeTypes,
          allowedExtensions: upload.config.allowedExtensions,
          onProgress: (progress) =>
            setUploadProgress((current) => ({ ...current, [field]: progress })),
        });
        nextSettings[field] = result.publicUrl;
      }

      validateDesktopSettings(nextSettings);

      const payload = {
        app_name: nextSettings.app_name.trim(),
        short_brand_name: nextSettings.short_brand_name.trim(),
        tagline: nextSettings.tagline.trim(),
        primary_color: nextSettings.primary_color.trim(),
        accent_color: nextSettings.accent_color.trim(),
        logo_url: nextSettings.logo_url.trim(),
        compact_logo_url: nextSettings.compact_logo_url.trim(),
        favicon_url: nextSettings.favicon_url.trim(),
        apple_touch_icon_url: nextSettings.apple_touch_icon_url.trim(),
        email_logo_url: nextSettings.email_logo_url.trim(),
        organization_logo_url: nextSettings.organization_logo_url.trim(),
        font_family: nextSettings.font_family,
        desktop_app_hero_image_url: nextSettings.desktop_app_hero_image_url.trim(),
        desktop_windows_available: nextSettings.desktop_windows_available,
        desktop_windows_download_url: sanitizeHttpsUrl(nextSettings.desktop_windows_download_url) || null,
        desktop_windows_version: nextSettings.desktop_windows_version.trim(),
        desktop_windows_release_date: nextSettings.desktop_windows_release_date.trim() || null,
        desktop_windows_status_label: sanitizeDesktopStatusLabel(nextSettings.desktop_windows_status_label),
        desktop_macos_available: nextSettings.desktop_macos_available,
        desktop_macos_download_url: sanitizeHttpsUrl(nextSettings.desktop_macos_download_url) || null,
        desktop_macos_version: nextSettings.desktop_macos_version.trim(),
        desktop_macos_release_date: nextSettings.desktop_macos_release_date.trim() || null,
        desktop_macos_status_label: sanitizeDesktopStatusLabel(nextSettings.desktop_macos_status_label),
        desktop_update_title: nextSettings.desktop_update_title.trim(),
        desktop_update_date: nextSettings.desktop_update_date.trim() || null,
        desktop_update_notes: sanitizeDesktopUpdateNotes(nextSettings.desktop_update_notes),
      };

      await savePlatformSettings(payload);

      const normalized = normalizePlatformSettings(payload);
      const persistedState = buildSettingsState(normalized);
      setSettings(persistedState);
      setSelectedFiles({});
      setUploadProgress({});
      setUploadErrors({});
      setSaved(true);
      router.refresh();
      toast.success(t('branding.toasts.saved'));
      setTimeout(() => setSaved(false), 2500);
    } catch (error) {
      if (isMissingDesktopSettingsColumnError(error)) {
        toast.error(t('branding.toasts.desktopMigrationRequired'));
      } else {
        toast.error(error instanceof Error ? error.message : t('branding.toasts.saveFailed'));
      }
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 size={24} className="animate-spin text-accent" />
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-8 sm:pb-10">
      <div className="page-header">
        <div className="page-header-main">
          <h1 className="page-title">{t('branding.pageTitle')}</h1>
          <p className="page-subtitle">{t('branding.pageDescription', { appName: platformSettings.branding.appName })}</p>
        </div>
        <div className="page-header-actions">
          <button
            onClick={handleSave}
            disabled={isSaving}
            className={`btn-primary w-full sm:w-auto ${saved ? 'bg-positive' : ''}`}
          >
            {isSaving ? (
              <Loader2 size={15} className="animate-spin" />
            ) : saved ? (
              <Check size={15} />
            ) : (
              <Palette size={15} />
            )}
            {saved ? t('branding.actions.saved') : t('branding.actions.save')}
          </button>
        </div>
      </div>

      <div className="card-elevated space-y-4 p-5">
        <h2 className="text-base font-600 text-foreground">{t('branding.sections.identity')}</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-sm font-600 text-foreground">{t('branding.fields.brandName')}</label>
            <input
              type="text"
              className="input-base"
              value={settings.app_name}
              onChange={(event) =>
                setSettings((current) => ({ ...current, app_name: event.target.value }))
              }
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-600 text-foreground">{t('branding.fields.shortBrandName')}</label>
            <input
              type="text"
              className="input-base"
              value={settings.short_brand_name}
              onChange={(event) =>
                setSettings((current) => ({ ...current, short_brand_name: event.target.value }))
              }
            />
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1.5 block text-sm font-600 text-foreground">{t('branding.fields.tagline')}</label>
            <input
              type="text"
              className="input-base"
              value={settings.tagline}
              onChange={(event) =>
                setSettings((current) => ({ ...current, tagline: event.target.value }))
              }
            />
          </div>
        </div>
      </div>

      <div className="card-elevated space-y-4 p-5">
        <h2 className="text-base font-600 text-foreground">{t('branding.sections.colors')}</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-sm font-600 text-foreground">{t('branding.fields.primaryColor')}</label>
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={settings.primary_color}
                onChange={(event) =>
                  setSettings((current) => ({ ...current, primary_color: event.target.value }))
                }
                className="h-10 w-10 cursor-pointer rounded-lg border border-border"
              />
              <input
                type="text"
                className="input-base flex-1 font-mono text-sm"
                value={settings.primary_color}
                onChange={(event) =>
                  setSettings((current) => ({ ...current, primary_color: event.target.value }))
                }
              />
            </div>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-600 text-foreground">{t('branding.fields.accentColor')}</label>
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={settings.accent_color}
                onChange={(event) =>
                  setSettings((current) => ({ ...current, accent_color: event.target.value }))
                }
                className="h-10 w-10 cursor-pointer rounded-lg border border-border"
              />
              <input
                type="text"
                className="input-base flex-1 font-mono text-sm"
                value={settings.accent_color}
                onChange={(event) =>
                  setSettings((current) => ({ ...current, accent_color: event.target.value }))
                }
              />
            </div>
          </div>
        </div>
      </div>

      <div className="card-elevated space-y-4 p-5">
        <h2 className="text-base font-600 text-foreground">{t('branding.sections.assets')}</h2>
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {(Object.keys(BRANDING_UPLOADS) as BrandingUploadField[]).map((field) => {
            const upload = BRANDING_UPLOADS[field];
            return (
              <MediaUploadCard
                key={field}
                label={t(upload.labelKey)}
                value={settings[field]}
                onValueChange={(value) =>
                  setSettings((current) => ({ ...current, [field]: value }))
                }
                selectedFile={selectedFiles[field] || null}
                onFileSelect={(file) => handleFileSelection(field, file)}
                accept={upload.config.accept}
                acceptedFormatsLabel={upload.config.acceptedFormatsLabel}
                maxSizeLabel={upload.config.maxSizeLabel}
                isUploading={isSaving && !!selectedFiles[field]}
                uploadProgress={uploadProgress[field] || 0}
                error={uploadErrors[field] || null}
                previewVariant={upload.previewVariant}
                helperText={t(upload.helperTextKey)}
              />
            );
          })}
        </div>
      </div>

      <div className="card-elevated space-y-5 p-5">
        <div>
          <h2 className="text-base font-600 text-foreground">{t('branding.sections.desktop')}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t('branding.desktop.description')}</p>
        </div>

        <MediaUploadCard
          label={t(DESKTOP_HERO_UPLOAD.labelKey)}
          value={settings.desktop_app_hero_image_url}
          onValueChange={(value) =>
            setSettings((current) => ({ ...current, desktop_app_hero_image_url: value }))
          }
          selectedFile={selectedFiles.desktop_app_hero_image_url || null}
          onFileSelect={(file) => handleFileSelection('desktop_app_hero_image_url', file)}
          accept={DESKTOP_HERO_UPLOAD.config.accept}
          acceptedFormatsLabel={DESKTOP_HERO_UPLOAD.config.acceptedFormatsLabel}
          maxSizeLabel={DESKTOP_HERO_UPLOAD.config.maxSizeLabel}
          isUploading={isSaving && !!selectedFiles.desktop_app_hero_image_url}
          uploadProgress={uploadProgress.desktop_app_hero_image_url || 0}
          error={uploadErrors.desktop_app_hero_image_url || null}
          previewVariant={DESKTOP_HERO_UPLOAD.previewVariant}
          helperText={t(DESKTOP_HERO_UPLOAD.helperTextKey)}
        />

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {DESKTOP_PLATFORM_FIELDS.map((platformConfig) => {
            const translationPrefix = `branding.desktop.platforms.${platformConfig.platform}`;

            return (
              <div key={platformConfig.platform} className="rounded-2xl border border-border bg-card p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="text-sm font-700 text-foreground">{t(`${translationPrefix}.title`)}</h3>
                    <p className="mt-1 text-xs text-muted-foreground">{t(`${translationPrefix}.description`)}</p>
                  </div>
                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-border px-3 py-1.5 text-xs font-700 text-foreground">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-border text-accent focus:ring-accent"
                      checked={settings[platformConfig.availableKey]}
                      onChange={(event) =>
                        setSettings((current) => ({
                          ...current,
                          [platformConfig.availableKey]: event.target.checked,
                        }))
                      }
                    />
                    {t('branding.desktop.fields.available')}
                  </label>
                </div>

                <div className="mt-4 grid grid-cols-1 gap-4">
                  <div>
                    <label className="mb-1.5 block text-sm font-600 text-foreground">{t(`${translationPrefix}.downloadUrl`)}</label>
                    <input
                      type="url"
                      inputMode="url"
                      placeholder="https://"
                      className="input-base"
                      value={settings[platformConfig.downloadUrlKey]}
                      onChange={(event) =>
                        setSettings((current) => ({
                          ...current,
                          [platformConfig.downloadUrlKey]: event.target.value,
                        }))
                      }
                    />
                  </div>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <label className="mb-1.5 block text-sm font-600 text-foreground">{t(`${translationPrefix}.version`)}</label>
                      <input
                        type="text"
                        className="input-base"
                        value={settings[platformConfig.versionKey]}
                        onChange={(event) =>
                          setSettings((current) => ({
                            ...current,
                            [platformConfig.versionKey]: event.target.value,
                          }))
                        }
                      />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-sm font-600 text-foreground">{t(`${translationPrefix}.releaseDate`)}</label>
                      <input
                        type="date"
                        className="input-base"
                        value={settings[platformConfig.releaseDateKey]}
                        onChange={(event) =>
                          setSettings((current) => ({
                            ...current,
                            [platformConfig.releaseDateKey]: event.target.value,
                          }))
                        }
                      />
                    </div>
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-600 text-foreground">{t(`${translationPrefix}.statusLabel`)}</label>
                    <input
                      type="text"
                      className="input-base"
                      value={settings[platformConfig.statusKey]}
                      onChange={(event) =>
                        setSettings((current) => ({
                          ...current,
                          [platformConfig.statusKey]: event.target.value,
                        }))
                      }
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="rounded-2xl border border-border bg-card p-4">
          <h3 className="text-sm font-700 text-foreground">{t('branding.desktop.latestUpdate.title')}</h3>
          <p className="mt-1 text-xs text-muted-foreground">{t('branding.desktop.latestUpdate.description')}</p>
          <div className="mt-4 grid grid-cols-1 gap-4">
            <div>
              <label className="mb-1.5 block text-sm font-600 text-foreground">{t('branding.desktop.latestUpdate.updateTitle')}</label>
              <input
                type="text"
                className="input-base"
                value={settings.desktop_update_title}
                onChange={(event) =>
                  setSettings((current) => ({ ...current, desktop_update_title: event.target.value }))
                }
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-600 text-foreground">{t('branding.desktop.latestUpdate.date')}</label>
              <input
                type="date"
                className="input-base"
                value={settings.desktop_update_date}
                onChange={(event) =>
                  setSettings((current) => ({ ...current, desktop_update_date: event.target.value }))
                }
              />
            </div>
            <div className="grid grid-cols-1 gap-4">
              {settings.desktop_update_notes.map((note, index) => (
                <div key={`desktop-update-note-${index}`}>
                  <label className="mb-1.5 block text-sm font-600 text-foreground">
                    {t('branding.desktop.latestUpdate.noteLabel', { index: index + 1 })}
                  </label>
                  <input
                    type="text"
                    className="input-base"
                    value={note}
                    onChange={(event) =>
                      setSettings((current) => {
                        const nextNotes = [...current.desktop_update_notes];
                        nextNotes[index] = event.target.value;
                        return { ...current, desktop_update_notes: nextNotes };
                      })
                    }
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="card-elevated space-y-4 p-5">
        <h2 className="text-base font-600 text-foreground">{t('branding.sections.typography')}</h2>
        <div>
          <label className="mb-1.5 block text-sm font-600 text-foreground">{t('branding.fields.fontFamily')}</label>
          <select
            className="input-base"
            value={settings.font_family}
            onChange={(event) =>
              setSettings((current) => ({
                ...current,
                font_family: event.target.value as PlatformFontFamily,
              }))
            }
          >
            <option value="Plus Jakarta Sans">{t('branding.fonts.plusJakartaSans')}</option>
            <option value="Inter">{t('branding.fonts.inter')}</option>
            <option value="Poppins">{t('branding.fonts.poppins')}</option>
            <option value="Roboto">{t('branding.fonts.roboto')}</option>
          </select>
        </div>
      </div>
    </div>
  );
}
