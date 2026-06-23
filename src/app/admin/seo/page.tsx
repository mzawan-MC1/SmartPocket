'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Globe, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import MediaUploadCard from '@/components/ui/MediaUploadCard';
import { getApprovedSocialPreviewAsset } from '@/lib/platform-settings';
import { getPlatformSettings, savePlatformSettings } from '@/lib/finance';
import { isSupportedUploadFile, uploadPublicMedia } from '@/lib/media-upload';

const SOCIAL_IMAGE_UPLOAD = {
  accept: '.png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp',
  acceptedFormatsLabel: 'PNG, JPG, JPEG, WEBP',
  maxSizeBytes: 2 * 1024 * 1024,
  maxSizeLabel: '2 MB',
  allowedMimeTypes: ['image/png', 'image/jpeg', 'image/webp'],
  allowedExtensions: ['png', 'jpg', 'jpeg', 'webp'],
};

export default function AdminSeoPage() {
  const router = useRouter();
  const [saved, setSaved] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [ogImageFile, setOgImageFile] = useState<File | null>(null);
  const [ogImageProgress, setOgImageProgress] = useState(0);
  const [ogImageError, setOgImageError] = useState<string | null>(null);
  const [settings, setSettings] = useState({
    site_title: 'Smart Pocket — Personal Finance, Simplified',
    title_template: '%s | Smart Pocket',
    site_description:
      'Smart Pocket helps you track income, expenses, budgets, and financial accounts with professional reporting and a clean mobile-first interface.',
    keywords: 'personal finance, budgeting, expense tracking, money management',
    canonical_url: 'https://1smartpocket.com',
    og_title: 'Smart Pocket — Personal Finance, Simplified',
    og_description:
      'Smart Pocket helps you track income, expenses, budgets, and financial accounts with professional reporting and a clean mobile-first interface.',
    og_image: '/assets/images/smart-pocket-social-card.png',
    twitter_title: 'Smart Pocket — Personal Finance, Simplified',
    twitter_description:
      'Smart Pocket helps you track income, expenses, budgets, and financial accounts with professional reporting and a clean mobile-first interface.',
    twitter_image: '/assets/images/smart-pocket-social-card.png',
    twitter_handle: '@smartpocket',
    google_analytics_id: '',
    google_tag_manager_id: '',
    google_site_verification: '',
    bing_site_verification: '',
    robots_index: true,
    robots_follow: true,
    sitemap_enabled: true,
    organization_name: 'Smart Pocket',
    organization_legal_name: '',
    organization_description:
      'Smart Pocket helps you track income, expenses, budgets, and financial accounts with professional reporting and a clean mobile-first interface.',
    default_language: 'en',
    social_twitter: '',
    social_linkedin: '',
    social_github: '',
  });

  useEffect(() => {
    getPlatformSettings()
      .then((data) => {
        if (!data) return;
        const blockedSocialFallbackSources = [
          data.logo_url || '',
          data.compact_logo_url || '',
          data.favicon_url || '',
          data.apple_touch_icon_url || '',
          data.pwa_icon_192_url || '',
          data.pwa_icon_512_url || '',
        ];
        const approvedOgImage =
          getApprovedSocialPreviewAsset(data.og_image || '', blockedSocialFallbackSources) ||
          getApprovedSocialPreviewAsset(data.social_image_url || '', blockedSocialFallbackSources);
        const approvedTwitterImage =
          getApprovedSocialPreviewAsset(data.twitter_image || '', blockedSocialFallbackSources) ||
          approvedOgImage;
        setSettings((current) => ({
          ...current,
          site_title: data.site_title || current.site_title,
          title_template: data.title_template || current.title_template,
          site_description: data.site_description || current.site_description,
          keywords: Array.isArray(data.keywords)
            ? data.keywords.join(', ')
            : data.keywords || current.keywords,
          canonical_url: data.canonical_url || current.canonical_url,
          og_title: data.og_title || data.site_title || current.og_title,
          og_description: data.og_description || data.site_description || current.og_description,
          og_image: approvedOgImage || current.og_image,
          twitter_title: data.twitter_title || data.og_title || data.site_title || current.twitter_title,
          twitter_description:
            data.twitter_description || data.og_description || data.site_description || current.twitter_description,
          twitter_image: approvedTwitterImage || current.twitter_image,
          twitter_handle: data.twitter_handle || current.twitter_handle,
          google_analytics_id: data.google_analytics_id || current.google_analytics_id,
          google_tag_manager_id: data.google_tag_manager_id || current.google_tag_manager_id,
          google_site_verification: data.google_site_verification || current.google_site_verification,
          bing_site_verification: data.bing_site_verification || current.bing_site_verification,
          robots_index: data.robots_index ?? current.robots_index,
          robots_follow: data.robots_follow ?? current.robots_follow,
          sitemap_enabled: data.sitemap_enabled ?? current.sitemap_enabled,
          organization_name: data.organization_name || data.app_name || current.organization_name,
          organization_legal_name: data.organization_legal_name || current.organization_legal_name,
          organization_description: data.organization_description || data.site_description || current.organization_description,
          default_language: data.default_language || current.default_language,
          social_twitter: data.social_twitter || current.social_twitter,
          social_linkedin: data.social_linkedin || current.social_linkedin,
          social_github: data.social_github || current.social_github,
        }));
      })
      .catch((error) => {
        toast.error(error instanceof Error ? error.message : 'Failed to load SEO settings.');
      })
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
        allowedMimeTypes: SOCIAL_IMAGE_UPLOAD.allowedMimeTypes,
        allowedExtensions: SOCIAL_IMAGE_UPLOAD.allowedExtensions,
        maxSizeBytes: SOCIAL_IMAGE_UPLOAD.maxSizeBytes,
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
        const result = await uploadPublicMedia({
          file: ogImageFile,
          folder: 'branding',
          filePrefix: 'seo-social-image',
          maxSizeBytes: SOCIAL_IMAGE_UPLOAD.maxSizeBytes,
          allowedMimeTypes: SOCIAL_IMAGE_UPLOAD.allowedMimeTypes,
          allowedExtensions: SOCIAL_IMAGE_UPLOAD.allowedExtensions,
          onProgress: setOgImageProgress,
        });
        nextSettings.og_image = result.publicUrl;
        if (!nextSettings.twitter_image.trim()) {
          nextSettings.twitter_image = result.publicUrl;
        }
      }

      await savePlatformSettings({
        ...nextSettings,
        keywords: nextSettings.keywords
          .split(',')
          .map((keyword) => keyword.trim())
          .filter(Boolean),
      });

      setSettings(nextSettings);
      setOgImageFile(null);
      setOgImageProgress(0);
      setSaved(true);
      router.refresh();
      toast.success('SEO settings saved.');
      setTimeout(() => setSaved(false), 2500);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save SEO settings.');
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
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-700 text-foreground">SEO Settings</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Control metadata, canonical URLs, verification tags, social previews, and analytics readiness from one place.
          </p>
        </div>
        <button onClick={handleSave} disabled={isSaving} className={`btn-primary ${saved ? 'bg-positive' : ''}`}>
          {isSaving ? <Loader2 size={15} className="animate-spin" /> : saved ? <Check size={15} /> : <Globe size={15} />}
          {saved ? 'Saved' : 'Save Settings'}
        </button>
      </div>

      <div className="card-elevated p-5 space-y-4">
        <h2 className="text-base font-600 text-foreground">Global Metadata</h2>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div>
            <label className="block text-sm font-600 text-foreground mb-1.5">Default Site Title</label>
            <input
              type="text"
              className="input-base"
              value={settings.site_title}
              onChange={(event) => setSettings((current) => ({ ...current, site_title: event.target.value }))}
            />
          </div>
          <div>
            <label className="block text-sm font-600 text-foreground mb-1.5">Title Template</label>
            <input
              type="text"
              className="input-base"
              value={settings.title_template}
              onChange={(event) => setSettings((current) => ({ ...current, title_template: event.target.value }))}
            />
          </div>
          <div className="lg:col-span-2">
            <label className="block text-sm font-600 text-foreground mb-1.5">Default Meta Description</label>
            <textarea
              rows={3}
              className="input-base resize-none"
              value={settings.site_description}
              onChange={(event) => setSettings((current) => ({ ...current, site_description: event.target.value }))}
            />
          </div>
          <div>
            <label className="block text-sm font-600 text-foreground mb-1.5">Canonical Site URL</label>
            <input
              type="url"
              className="input-base"
              value={settings.canonical_url}
              onChange={(event) => setSettings((current) => ({ ...current, canonical_url: event.target.value }))}
            />
          </div>
          <div>
            <label className="block text-sm font-600 text-foreground mb-1.5">Default Locale</label>
            <select
              className="input-base"
              value={settings.default_language}
              onChange={(event) => setSettings((current) => ({ ...current, default_language: event.target.value }))}
            >
              <option value="en">English</option>
              <option value="ar">Arabic</option>
              <option value="fr">French</option>
              <option value="ru">Russian</option>
            </select>
          </div>
          <div className="lg:col-span-2">
            <label className="block text-sm font-600 text-foreground mb-1.5">Keywords</label>
            <input
              type="text"
              className="input-base"
              value={settings.keywords}
              onChange={(event) => setSettings((current) => ({ ...current, keywords: event.target.value }))}
              placeholder="personal finance, budgeting, expense tracking"
            />
          </div>
        </div>
      </div>

      <div className="card-elevated p-5 space-y-4">
        <h2 className="text-base font-600 text-foreground">Open Graph & X</h2>
        <MediaUploadCard
          label="Default Social Image"
          value={settings.og_image}
          onValueChange={(value) => setSettings((current) => ({ ...current, og_image: value }))}
          selectedFile={ogImageFile}
          onFileSelect={handleOgImageSelection}
          accept={SOCIAL_IMAGE_UPLOAD.accept}
          acceptedFormatsLabel={SOCIAL_IMAGE_UPLOAD.acceptedFormatsLabel}
          maxSizeLabel={SOCIAL_IMAGE_UPLOAD.maxSizeLabel}
          isUploading={isSaving && !!ogImageFile}
          uploadProgress={ogImageProgress}
          error={ogImageError}
          previewVariant="wide"
          helperText="Use a 1200 x 630 image for WhatsApp, Facebook, LinkedIn, and X previews."
        />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div>
            <label className="block text-sm font-600 text-foreground mb-1.5">Default Open Graph Title</label>
            <input
              type="text"
              className="input-base"
              value={settings.og_title}
              onChange={(event) => setSettings((current) => ({ ...current, og_title: event.target.value }))}
            />
          </div>
          <div>
            <label className="block text-sm font-600 text-foreground mb-1.5">Default Open Graph Description</label>
            <textarea
              rows={3}
              className="input-base resize-none"
              value={settings.og_description}
              onChange={(event) => setSettings((current) => ({ ...current, og_description: event.target.value }))}
            />
          </div>
          <div>
            <label className="block text-sm font-600 text-foreground mb-1.5">Twitter/X Title</label>
            <input
              type="text"
              className="input-base"
              value={settings.twitter_title}
              onChange={(event) => setSettings((current) => ({ ...current, twitter_title: event.target.value }))}
            />
          </div>
          <div>
            <label className="block text-sm font-600 text-foreground mb-1.5">Twitter/X Description</label>
            <textarea
              rows={3}
              className="input-base resize-none"
              value={settings.twitter_description}
              onChange={(event) => setSettings((current) => ({ ...current, twitter_description: event.target.value }))}
            />
          </div>
          <div>
            <label className="block text-sm font-600 text-foreground mb-1.5">Twitter/X Image URL</label>
            <input
              type="url"
              className="input-base"
              value={settings.twitter_image}
              onChange={(event) => setSettings((current) => ({ ...current, twitter_image: event.target.value }))}
            />
          </div>
          <div>
            <label className="block text-sm font-600 text-foreground mb-1.5">Twitter/X Handle</label>
            <input
              type="text"
              className="input-base"
              placeholder="@smartpocket"
              value={settings.twitter_handle}
              onChange={(event) => setSettings((current) => ({ ...current, twitter_handle: event.target.value }))}
            />
          </div>
        </div>
      </div>

      <div className="card-elevated p-5 space-y-4">
        <h2 className="text-base font-600 text-foreground">Verification & Analytics</h2>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div>
            <label className="block text-sm font-600 text-foreground mb-1.5">Google Search Console Verification</label>
            <input
              type="text"
              className="input-base"
              value={settings.google_site_verification}
              onChange={(event) => setSettings((current) => ({ ...current, google_site_verification: event.target.value }))}
            />
          </div>
          <div>
            <label className="block text-sm font-600 text-foreground mb-1.5">Bing Verification</label>
            <input
              type="text"
              className="input-base"
              value={settings.bing_site_verification}
              onChange={(event) => setSettings((current) => ({ ...current, bing_site_verification: event.target.value }))}
            />
          </div>
          <div>
            <label className="block text-sm font-600 text-foreground mb-1.5">GA4 Measurement ID</label>
            <input
              type="text"
              className="input-base"
              placeholder="G-XXXXXXXXXX"
              value={settings.google_analytics_id}
              onChange={(event) => setSettings((current) => ({ ...current, google_analytics_id: event.target.value }))}
            />
          </div>
          <div>
            <label className="block text-sm font-600 text-foreground mb-1.5">Google Tag Manager Container ID</label>
            <input
              type="text"
              className="input-base"
              placeholder="GTM-XXXXXXX"
              value={settings.google_tag_manager_id}
              onChange={(event) => setSettings((current) => ({ ...current, google_tag_manager_id: event.target.value }))}
            />
          </div>
        </div>
      </div>

      <div className="card-elevated p-5 space-y-4">
        <h2 className="text-base font-600 text-foreground">Organization Schema</h2>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div>
            <label className="block text-sm font-600 text-foreground mb-1.5">Organization Name</label>
            <input
              type="text"
              className="input-base"
              value={settings.organization_name}
              onChange={(event) => setSettings((current) => ({ ...current, organization_name: event.target.value }))}
            />
          </div>
          <div>
            <label className="block text-sm font-600 text-foreground mb-1.5">Legal Name</label>
            <input
              type="text"
              className="input-base"
              value={settings.organization_legal_name}
              onChange={(event) => setSettings((current) => ({ ...current, organization_legal_name: event.target.value }))}
            />
          </div>
          <div className="lg:col-span-2">
            <label className="block text-sm font-600 text-foreground mb-1.5">Organization Description</label>
            <textarea
              rows={3}
              className="input-base resize-none"
              value={settings.organization_description}
              onChange={(event) => setSettings((current) => ({ ...current, organization_description: event.target.value }))}
            />
          </div>
          <div>
            <label className="block text-sm font-600 text-foreground mb-1.5">Social Profile URL: X</label>
            <input
              type="url"
              className="input-base"
              value={settings.social_twitter}
              onChange={(event) => setSettings((current) => ({ ...current, social_twitter: event.target.value }))}
            />
          </div>
          <div>
            <label className="block text-sm font-600 text-foreground mb-1.5">Social Profile URL: LinkedIn</label>
            <input
              type="url"
              className="input-base"
              value={settings.social_linkedin}
              onChange={(event) => setSettings((current) => ({ ...current, social_linkedin: event.target.value }))}
            />
          </div>
          <div>
            <label className="block text-sm font-600 text-foreground mb-1.5">Social Profile URL: GitHub</label>
            <input
              type="url"
              className="input-base"
              value={settings.social_github}
              onChange={(event) => setSettings((current) => ({ ...current, social_github: event.target.value }))}
            />
          </div>
        </div>
      </div>

      <div className="card-elevated p-5 space-y-4">
        <h2 className="text-base font-600 text-foreground">Indexing Controls</h2>
        {[
          {
            key: 'robots_index' as const,
            label: 'Allow Public Indexing',
            description: 'Disabling this sets the global robots metadata to noindex for the public site.',
          },
          {
            key: 'robots_follow' as const,
            label: 'Allow Follow',
            description: 'Controls whether crawlers should follow links on indexable public pages.',
          },
          {
            key: 'sitemap_enabled' as const,
            label: 'Enable Sitemap',
            description: 'Keeps the App Router sitemap available at /sitemap.xml.',
          },
        ].map((item) => (
          <div key={item.key} className="flex items-center justify-between rounded-xl border border-border p-3">
            <div>
              <p className="text-sm font-600 text-foreground">{item.label}</p>
              <p className="text-xs text-muted-foreground">{item.description}</p>
            </div>
            <button
              onClick={() => setSettings((current) => ({ ...current, [item.key]: !current[item.key] }))}
              className={`relative h-5 w-10 rounded-full transition-colors ${settings[item.key] ? 'bg-accent' : 'bg-muted'}`}
              aria-label={`Toggle ${item.label}`}
            >
              <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all duration-200 ${settings[item.key] ? 'start-5' : 'start-0.5'}`} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
