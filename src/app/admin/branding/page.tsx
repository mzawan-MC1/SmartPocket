'use client';

import React, { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { Check, Loader2, Palette } from 'lucide-react';
import { toast } from 'sonner';
import { usePlatformSettings } from '@/contexts/PlatformSettingsContext';
import { getPlatformSettings, savePlatformSettings } from '@/lib/finance';
import { isSupportedUploadFile, uploadPublicMedia } from '@/lib/media-upload';

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
    label: string;
    helperText: string;
    previewVariant: 'square' | 'wide';
    filePrefix: string;
    config: typeof IMAGE_UPLOAD | typeof FAVICON_UPLOAD;
  }
> = {
  logo_url: {
    label: 'Primary Logo',
    helperText: 'Used in the public header, footer, auth screens, and app chrome.',
    previewVariant: 'wide',
    filePrefix: 'logo',
    config: IMAGE_UPLOAD,
  },
  compact_logo_url: {
    label: 'Compact Logo / Mark',
    helperText: 'Used for tighter spaces such as compact branding surfaces and icon-first layouts.',
    previewVariant: 'square',
    filePrefix: 'compact-logo',
    config: IMAGE_UPLOAD,
  },
  favicon_url: {
    label: 'Favicon',
    helperText: 'Used for browser tabs and shortcut icons.',
    previewVariant: 'square',
    filePrefix: 'favicon',
    config: FAVICON_UPLOAD,
  },
  apple_touch_icon_url: {
    label: 'Apple Touch Icon',
    helperText: 'Used when Smart Pocket is saved to an iPhone or iPad home screen.',
    previewVariant: 'square',
    filePrefix: 'apple-touch-icon',
    config: IMAGE_UPLOAD,
  },
  email_logo_url: {
    label: 'Email Logo',
    helperText: 'Used in branded email layouts and Supabase email template guidance.',
    previewVariant: 'wide',
    filePrefix: 'email-logo',
    config: IMAGE_UPLOAD,
  },
  organization_logo_url: {
    label: 'Structured Data Logo',
    helperText: 'Used in Organization schema and other machine-readable brand surfaces.',
    previewVariant: 'wide',
    filePrefix: 'organization-logo',
    config: IMAGE_UPLOAD,
  },
};

export default function AdminBrandingPage() {
  const router = useRouter();
  const { branding } = usePlatformSettings();
  const [saved, setSaved] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedFiles, setSelectedFiles] = useState<Partial<Record<BrandingUploadField, File | null>>>({});
  const [uploadProgress, setUploadProgress] = useState<Partial<Record<BrandingUploadField, number>>>({});
  const [uploadErrors, setUploadErrors] = useState<Partial<Record<BrandingUploadField, string>>>({});
  const [settings, setSettings] = useState({
    app_name: 'Smart Pocket',
    short_brand_name: 'Smart Pocket',
    tagline: 'Personal Finance, Simplified',
    primary_color: '#0f3460',
    accent_color: '#00b4d8',
    logo_url: '/assets/images/app_logo.png',
    compact_logo_url: '/assets/images/smart-pocket-mark.svg',
    favicon_url: '/favicon.ico',
    apple_touch_icon_url: '/assets/images/smart-pocket-icon.svg',
    email_logo_url: '/assets/images/app_logo.png',
    organization_logo_url: '/assets/images/app_logo.png',
    font_family: 'Plus Jakarta Sans',
  });

  useEffect(() => {
    getPlatformSettings()
      .then((data) => {
        if (data) {
          setSettings((current) => ({
            ...current,
            app_name: data.app_name || current.app_name,
            short_brand_name: data.short_brand_name || data.app_name || current.short_brand_name,
            tagline: data.tagline || current.tagline,
            primary_color: data.primary_color || current.primary_color,
            accent_color: data.accent_color || current.accent_color,
            logo_url: data.logo_url || current.logo_url,
            compact_logo_url: data.compact_logo_url || data.logo_url || current.compact_logo_url,
            favicon_url: data.favicon_url || current.favicon_url,
            apple_touch_icon_url:
              data.apple_touch_icon_url || data.favicon_url || current.apple_touch_icon_url,
            email_logo_url: data.email_logo_url || data.logo_url || current.email_logo_url,
            organization_logo_url:
              data.organization_logo_url || data.logo_url || current.organization_logo_url,
            font_family: data.font_family || current.font_family,
          }));
        }
      })
      .catch(console.error)
      .finally(() => setIsLoading(false));
  }, []);

  const handleFileSelection = (field: BrandingUploadField, file: File | null) => {
    const config = BRANDING_UPLOADS[field].config;

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
        [field]: error instanceof Error ? error.message : 'Invalid file.',
      }));
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const nextSettings = { ...settings };

      for (const field of Object.keys(BRANDING_UPLOADS) as BrandingUploadField[]) {
        const selectedFile = selectedFiles[field];
        if (!selectedFile) {
          continue;
        }

        const upload = BRANDING_UPLOADS[field];
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

      await savePlatformSettings(nextSettings);
      setSettings(nextSettings);
      setSelectedFiles({});
      setUploadProgress({});
      setUploadErrors({});
      setSaved(true);
      router.refresh();
      toast.success('Branding settings saved');
      setTimeout(() => setSaved(false), 2500);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save branding settings.');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 size={24} className="animate-spin text-accent" />
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-8 sm:pb-10">
      <div className="page-header">
        <div className="page-header-main">
          <h1 className="page-title">Branding & Appearance</h1>
          <p className="page-subtitle">
            Centralize the production brand surfaces used across {branding.appName}.
          </p>
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
            {saved ? 'Saved' : 'Save Settings'}
          </button>
        </div>
      </div>

      <div className="card-elevated p-5 space-y-4">
        <h2 className="text-base font-600 text-foreground">Brand Identity</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-600 text-foreground mb-1.5">Brand Name</label>
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
            <label className="block text-sm font-600 text-foreground mb-1.5">Short Brand Name</label>
            <input
              type="text"
              className="input-base"
              value={settings.short_brand_name}
              onChange={(event) =>
                setSettings((current) => ({
                  ...current,
                  short_brand_name: event.target.value,
                }))
              }
            />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-sm font-600 text-foreground mb-1.5">Tagline</label>
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

      <div className="card-elevated p-5 space-y-4">
        <h2 className="text-base font-600 text-foreground">Brand Colours</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-600 text-foreground mb-1.5">Primary Colour</label>
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={settings.primary_color}
                onChange={(event) =>
                  setSettings((current) => ({ ...current, primary_color: event.target.value }))
                }
                className="w-10 h-10 rounded-lg border border-border cursor-pointer"
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
            <label className="block text-sm font-600 text-foreground mb-1.5">Accent Colour</label>
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={settings.accent_color}
                onChange={(event) =>
                  setSettings((current) => ({ ...current, accent_color: event.target.value }))
                }
                className="w-10 h-10 rounded-lg border border-border cursor-pointer"
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

      <div className="card-elevated p-5 space-y-4">
        <h2 className="text-base font-600 text-foreground">Brand Assets</h2>
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {(Object.keys(BRANDING_UPLOADS) as BrandingUploadField[]).map((field) => {
            const upload = BRANDING_UPLOADS[field];
            return (
              <MediaUploadCard
                key={field}
                label={upload.label}
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
                helperText={upload.helperText}
              />
            );
          })}
        </div>
      </div>

      <div className="card-elevated p-5 space-y-4">
        <h2 className="text-base font-600 text-foreground">Typography</h2>
        <div>
          <label className="block text-sm font-600 text-foreground mb-1.5">Font Family</label>
          <select
            className="input-base"
            value={settings.font_family}
            onChange={(event) =>
              setSettings((current) => ({ ...current, font_family: event.target.value }))
            }
          >
            <option value="Plus Jakarta Sans">Plus Jakarta Sans (Default)</option>
            <option value="Inter">Inter</option>
            <option value="Poppins">Poppins</option>
            <option value="Roboto">Roboto</option>
          </select>
        </div>
      </div>
    </div>
  );
}
