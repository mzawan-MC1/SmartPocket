'use client';
import React, { useState, useEffect } from 'react';
import { Check, Loader2, Globe } from 'lucide-react';
import { toast } from 'sonner';
import MediaUploadCard from '@/components/ui/MediaUploadCard';
import { getPlatformSettings, savePlatformSettings } from '@/lib/finance';
import { isSupportedUploadFile, uploadPublicMedia } from '@/lib/media-upload';

const OG_IMAGE_UPLOAD = {
  accept: '.png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp',
  acceptedFormatsLabel: 'PNG, JPG, JPEG, WEBP',
  maxSizeBytes: 2 * 1024 * 1024,
  maxSizeLabel: '2 MB',
  allowedMimeTypes: ['image/png', 'image/jpeg', 'image/webp'],
  allowedExtensions: ['png', 'jpg', 'jpeg', 'webp'],
};

export default function AdminSeoPage() {
  const [saved, setSaved] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [ogImageFile, setOgImageFile] = useState<File | null>(null);
  const [ogImageProgress, setOgImageProgress] = useState(0);
  const [ogImageError, setOgImageError] = useState<string | null>(null);
  const [settings, setSettings] = useState({
    site_title: 'Smart Pocket — Personal Finance, Simplified',
    site_description: 'Smart Pocket helps you track income, expenses, budgets, and financial accounts with professional reporting and a clean mobile-first interface.',
    og_image: '/assets/images/app_logo.png',
    twitter_handle: '@smartpocket',
    google_analytics_id: '',
    canonical_url: process.env.NEXT_PUBLIC_SITE_URL || 'https://smartpocke9976.builtwithrocket.new',
    robots_index: true,
    sitemap_enabled: true,
  });

  useEffect(() => {
    getPlatformSettings()
      .then((data) => {
        if (data) {
          setSettings((s) => ({
            site_title: data.site_title || s.site_title,
            site_description: data.site_description || s.site_description,
            og_image: data.og_image || s.og_image,
            twitter_handle: data.twitter_handle || s.twitter_handle,
            google_analytics_id: data.google_analytics_id || s.google_analytics_id,
            canonical_url: data.canonical_url || s.canonical_url,
            robots_index: data.robots_index ?? s.robots_index,
            sitemap_enabled: data.sitemap_enabled ?? s.sitemap_enabled,
          }));
        }
      })
      .catch(console.error)
      .finally(() => setIsLoading(false));
  }, []);

  const handleOgImageSelection = (file: File | null) => {
    if (!file) {
      setOgImageFile(null);
      setOgImageError(null);
      setOgImageProgress(0);
      return;
    }

    try {
      isSupportedUploadFile({
        file,
        allowedMimeTypes: OG_IMAGE_UPLOAD.allowedMimeTypes,
        allowedExtensions: OG_IMAGE_UPLOAD.allowedExtensions,
        maxSizeBytes: OG_IMAGE_UPLOAD.maxSizeBytes,
      });
      setOgImageFile(file);
      setOgImageError(null);
    } catch (error) {
      setOgImageFile(null);
      setOgImageError(error instanceof Error ? error.message : 'Invalid file.');
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const nextSettings = { ...settings };

      if (ogImageFile) {
        try {
          const result = await uploadPublicMedia({
            file: ogImageFile,
            folder: 'branding',
            filePrefix: 'og-image',
            maxSizeBytes: OG_IMAGE_UPLOAD.maxSizeBytes,
            allowedMimeTypes: OG_IMAGE_UPLOAD.allowedMimeTypes,
            allowedExtensions: OG_IMAGE_UPLOAD.allowedExtensions,
            onProgress: setOgImageProgress,
          });
          nextSettings.og_image = result.publicUrl;
          setOgImageError(null);
        } catch (error) {
          setOgImageError(error instanceof Error ? error.message : 'OG image upload failed.');
          throw error;
        }
      }

      await savePlatformSettings(nextSettings);
      setSettings(nextSettings);
      setOgImageFile(null);
      setOgImageProgress(0);
      setSaved(true);
      toast.success('SEO settings saved');
      setTimeout(() => setSaved(false), 2500);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64"><Loader2 size={24} className="animate-spin text-accent" /></div>
    );
  }

  return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-700 text-foreground">SEO Settings</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Meta tags, Open Graph, and search engine configuration</p>
          </div>
          <button onClick={handleSave} disabled={isSaving} className={`btn-primary ${saved ? 'bg-positive' : ''}`}>
            {isSaving ? <Loader2 size={15} className="animate-spin" /> : saved ? <Check size={15} /> : <Globe size={15} />}
            {saved ? 'Saved' : 'Save Settings'}
          </button>
        </div>

        <div className="card-elevated p-5 space-y-4">
          <h2 className="text-base font-600 text-foreground">Meta Tags</h2>
          <div>
            <label className="block text-sm font-600 text-foreground mb-1.5">Site Title</label>
            <input type="text" className="input-base" value={settings.site_title} onChange={(e) => setSettings((s) => ({ ...s, site_title: e.target.value }))} />
            <p className="text-xs text-muted-foreground mt-1">{settings.site_title.length}/60 characters</p>
          </div>
          <div>
            <label className="block text-sm font-600 text-foreground mb-1.5">Meta Description</label>
            <textarea rows={3} className="input-base resize-none" value={settings.site_description} onChange={(e) => setSettings((s) => ({ ...s, site_description: e.target.value }))} />
            <p className="text-xs text-muted-foreground mt-1">{settings.site_description.length}/160 characters</p>
          </div>
          <div>
            <label className="block text-sm font-600 text-foreground mb-1.5">Canonical URL</label>
            <input type="url" className="input-base" value={settings.canonical_url} onChange={(e) => setSettings((s) => ({ ...s, canonical_url: e.target.value }))} />
          </div>
        </div>

        <div className="card-elevated p-5 space-y-4">
          <h2 className="text-base font-600 text-foreground">Open Graph & Social</h2>
          <MediaUploadCard
            label="OG Image"
            value={settings.og_image}
            onValueChange={(value) => setSettings((s) => ({ ...s, og_image: value }))}
            selectedFile={ogImageFile}
            onFileSelect={handleOgImageSelection}
            accept={OG_IMAGE_UPLOAD.accept}
            acceptedFormatsLabel={OG_IMAGE_UPLOAD.acceptedFormatsLabel}
            maxSizeLabel={OG_IMAGE_UPLOAD.maxSizeLabel}
            isUploading={isSaving && !!ogImageFile}
            uploadProgress={ogImageProgress}
            error={ogImageError}
            previewVariant="wide"
            helperText="Used for social sharing previews."
          />
          <div>
            <label className="block text-sm font-600 text-foreground mb-1.5">Twitter Handle</label>
            <input type="text" className="input-base" placeholder="@yourhandle" value={settings.twitter_handle} onChange={(e) => setSettings((s) => ({ ...s, twitter_handle: e.target.value }))} />
          </div>
          <div>
            <label className="block text-sm font-600 text-foreground mb-1.5">Google Analytics ID</label>
            <input type="text" className="input-base" placeholder="G-XXXXXXXXXX" value={settings.google_analytics_id} onChange={(e) => setSettings((s) => ({ ...s, google_analytics_id: e.target.value }))} />
          </div>
        </div>

        <div className="card-elevated p-5 space-y-4">
          <h2 className="text-base font-600 text-foreground">Indexing</h2>
          {[
            { key: 'robots_index' as const, label: 'Allow search engine indexing', desc: 'Adds index, follow to robots meta tag' },
            { key: 'sitemap_enabled' as const, label: 'Enable XML sitemap', desc: 'Generates /sitemap.xml for search engines' },
          ].map((item) => (
            <div key={item.key} className="flex items-center justify-between p-3 rounded-xl border border-border">
              <div>
                <p className="text-sm font-600 text-foreground">{item.label}</p>
                <p className="text-xs text-muted-foreground">{item.desc}</p>
              </div>
              <button
                onClick={() => setSettings((s) => ({ ...s, [item.key]: !s[item.key] }))}
                className={`relative w-10 h-5 rounded-full transition-colors cursor-pointer ${settings[item.key] ? 'bg-accent' : 'bg-muted'}`}
                aria-label={`Toggle ${item.label}`}
              >
                <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all duration-200 ${settings[item.key] ? 'start-5' : 'start-0.5'}`} />
              </button>
            </div>
          ))}
        </div>
      </div>
  );
}
