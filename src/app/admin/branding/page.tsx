'use client';
import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Palette, Check, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import MediaUploadCard from '@/components/ui/MediaUploadCard';
import { getPlatformSettings, savePlatformSettings } from '@/lib/finance';
import { isSupportedUploadFile, uploadPublicMedia } from '@/lib/media-upload';

const LOGO_UPLOAD = {
  accept: '.png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp',
  acceptedFormatsLabel: 'PNG, JPG, JPEG, WEBP',
  maxSizeBytes: 2 * 1024 * 1024,
  maxSizeLabel: '2 MB',
  allowedMimeTypes: ['image/png', 'image/jpeg', 'image/webp'],
  allowedExtensions: ['png', 'jpg', 'jpeg', 'webp'],
};

const FAVICON_UPLOAD = {
  accept: '.ico,.png,image/x-icon,image/vnd.microsoft.icon,image/png',
  acceptedFormatsLabel: 'ICO, PNG',
  maxSizeBytes: 512 * 1024,
  maxSizeLabel: '512 KB',
  allowedMimeTypes: ['image/png', 'image/x-icon', 'image/vnd.microsoft.icon'],
  allowedExtensions: ['ico', 'png'],
};

export default function AdminBrandingPage() {
  const router = useRouter();
  const [saved, setSaved] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [faviconFile, setFaviconFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState({ logo: 0, favicon: 0 });
  const [uploadErrors, setUploadErrors] = useState<{ logo?: string; favicon?: string }>({});
  const [settings, setSettings] = useState({
    app_name: 'Smart Pocket',
    tagline: 'Personal Finance, Simplified',
    primary_color: '#0f3460',
    accent_color: '#00b4d8',
    logo_url: '/assets/images/app_logo.png',
    favicon_url: '/favicon.ico',
    font_family: 'Plus Jakarta Sans',
  });

  useEffect(() => {
    getPlatformSettings()
      .then((data) => {
        if (data) {
          setSettings((s) => ({
            app_name: data.app_name || s.app_name,
            tagline: data.tagline || s.tagline,
            primary_color: data.primary_color || s.primary_color,
            accent_color: data.accent_color || s.accent_color,
            logo_url: data.logo_url || s.logo_url,
            favicon_url: data.favicon_url || s.favicon_url,
            font_family: data.font_family || s.font_family,
          }));
        }
      })
      .catch(console.error)
      .finally(() => setIsLoading(false));
  }, []);

  const handleFileSelection = (
    field: 'logo' | 'favicon',
    file: File | null
  ) => {
    const config = field === 'logo' ? LOGO_UPLOAD : FAVICON_UPLOAD;

    if (!file) {
      if (field === 'logo') setLogoFile(null);
      else setFaviconFile(null);
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
      if (field === 'logo') setLogoFile(file);
      else setFaviconFile(file);
      setUploadErrors((current) => ({ ...current, [field]: undefined }));
    } catch (error) {
      if (field === 'logo') setLogoFile(null);
      else setFaviconFile(null);
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

      if (logoFile) {
        try {
          const result = await uploadPublicMedia({
            file: logoFile,
            folder: 'branding',
            filePrefix: 'logo',
            maxSizeBytes: LOGO_UPLOAD.maxSizeBytes,
            allowedMimeTypes: LOGO_UPLOAD.allowedMimeTypes,
            allowedExtensions: LOGO_UPLOAD.allowedExtensions,
            onProgress: (progress) => setUploadProgress((current) => ({ ...current, logo: progress })),
          });
          nextSettings.logo_url = result.publicUrl;
          setUploadErrors((current) => ({ ...current, logo: undefined }));
        } catch (error) {
          setUploadErrors((current) => ({
            ...current,
            logo: error instanceof Error ? error.message : 'Logo upload failed.',
          }));
          throw error;
        }
      }

      if (faviconFile) {
        try {
          const result = await uploadPublicMedia({
            file: faviconFile,
            folder: 'branding',
            filePrefix: 'favicon',
            maxSizeBytes: FAVICON_UPLOAD.maxSizeBytes,
            allowedMimeTypes: FAVICON_UPLOAD.allowedMimeTypes,
            allowedExtensions: FAVICON_UPLOAD.allowedExtensions,
            onProgress: (progress) => setUploadProgress((current) => ({ ...current, favicon: progress })),
          });
          nextSettings.favicon_url = result.publicUrl;
          setUploadErrors((current) => ({ ...current, favicon: undefined }));
        } catch (error) {
          setUploadErrors((current) => ({
            ...current,
            favicon: error instanceof Error ? error.message : 'Favicon upload failed.',
          }));
          throw error;
        }
      }

      await savePlatformSettings(nextSettings);
      setSettings(nextSettings);
      setLogoFile(null);
      setFaviconFile(null);
      setUploadProgress({ logo: 0, favicon: 0 });
      setSaved(true);
      router.refresh();
      toast.success('Branding settings saved');
      setTimeout(() => setSaved(false), 2500);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to save');
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
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-700 text-foreground">Branding & Appearance</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Customize the look and feel of Smart Pocket</p>
          </div>
          <button onClick={handleSave} disabled={isSaving} className={`btn-primary ${saved ? 'bg-positive' : ''}`}>
            {isSaving ? <Loader2 size={15} className="animate-spin" /> : saved ? <Check size={15} /> : <Palette size={15} />}
            {saved ? 'Saved' : 'Save Settings'}
          </button>
        </div>

        <div className="card-elevated p-5 space-y-4">
          <h2 className="text-base font-600 text-foreground">App Identity</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-600 text-foreground mb-1.5">App Name</label>
              <input type="text" className="input-base" value={settings.app_name} onChange={(e) => setSettings((s) => ({ ...s, app_name: e.target.value }))} />
            </div>
            <div>
              <label className="block text-sm font-600 text-foreground mb-1.5">Tagline</label>
              <input type="text" className="input-base" value={settings.tagline} onChange={(e) => setSettings((s) => ({ ...s, tagline: e.target.value }))} />
            </div>
          </div>
        </div>

        <div className="card-elevated p-5 space-y-4">
          <h2 className="text-base font-600 text-foreground">Colors</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-600 text-foreground mb-1.5">Primary Color</label>
              <div className="flex items-center gap-3">
                <input type="color" value={settings.primary_color} onChange={(e) => setSettings((s) => ({ ...s, primary_color: e.target.value }))} className="w-10 h-10 rounded-lg border border-border cursor-pointer" />
                <input type="text" className="input-base flex-1 font-mono text-sm" value={settings.primary_color} onChange={(e) => setSettings((s) => ({ ...s, primary_color: e.target.value }))} />
              </div>
            </div>
            <div>
              <label className="block text-sm font-600 text-foreground mb-1.5">Accent Color</label>
              <div className="flex items-center gap-3">
                <input type="color" value={settings.accent_color} onChange={(e) => setSettings((s) => ({ ...s, accent_color: e.target.value }))} className="w-10 h-10 rounded-lg border border-border cursor-pointer" />
                <input type="text" className="input-base flex-1 font-mono text-sm" value={settings.accent_color} onChange={(e) => setSettings((s) => ({ ...s, accent_color: e.target.value }))} />
              </div>
            </div>
          </div>
        </div>

        <div className="card-elevated p-5 space-y-4">
          <h2 className="text-base font-600 text-foreground">Logo & Favicon</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <MediaUploadCard
              label="App Logo"
              value={settings.logo_url}
              onValueChange={(value) => setSettings((s) => ({ ...s, logo_url: value }))}
              selectedFile={logoFile}
              onFileSelect={(file) => handleFileSelection('logo', file)}
              accept={LOGO_UPLOAD.accept}
              acceptedFormatsLabel={LOGO_UPLOAD.acceptedFormatsLabel}
              maxSizeLabel={LOGO_UPLOAD.maxSizeLabel}
              isUploading={isSaving && !!logoFile}
              uploadProgress={uploadProgress.logo}
              error={uploadErrors.logo || null}
              previewVariant="wide"
              helperText="Shown across the app. Wide logos work best."
            />
            <MediaUploadCard
              label="Favicon"
              value={settings.favicon_url}
              onValueChange={(value) => setSettings((s) => ({ ...s, favicon_url: value }))}
              selectedFile={faviconFile}
              onFileSelect={(file) => handleFileSelection('favicon', file)}
              accept={FAVICON_UPLOAD.accept}
              acceptedFormatsLabel={FAVICON_UPLOAD.acceptedFormatsLabel}
              maxSizeLabel={FAVICON_UPLOAD.maxSizeLabel}
              isUploading={isSaving && !!faviconFile}
              uploadProgress={uploadProgress.favicon}
              error={uploadErrors.favicon || null}
              previewVariant="square"
              helperText="Square files are recommended."
            />
          </div>
        </div>

        <div className="card-elevated p-5 space-y-4">
          <h2 className="text-base font-600 text-foreground">Typography</h2>
          <div>
            <label className="block text-sm font-600 text-foreground mb-1.5">Font Family</label>
            <select className="input-base" value={settings.font_family} onChange={(e) => setSettings((s) => ({ ...s, font_family: e.target.value }))}>
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
