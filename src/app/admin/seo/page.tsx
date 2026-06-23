'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Globe, Loader2, Search } from 'lucide-react';
import { toast } from 'sonner';
import MediaUploadCard from '@/components/ui/MediaUploadCard';
import { getPlatformSettings, savePlatformSettings } from '@/lib/finance';
import {
  DEFAULT_PLATFORM_SETTINGS,
  getApprovedSocialPreviewAsset,
  normalizeSeoKeywordList,
} from '@/lib/platform-settings';
import { isSupportedUploadFile, uploadPublicMedia } from '@/lib/media-upload';

type SeoAdminTab = 'global' | 'pages' | 'verification' | 'organization' | 'robots';

type SeoSettingsForm = {
  site_title: string;
  title_template: string;
  site_description: string;
  keywords: string;
  canonical_url: string;
  default_language: string;
  og_title: string;
  og_description: string;
  og_image: string;
  twitter_title: string;
  twitter_description: string;
  twitter_image: string;
  twitter_handle: string;
  google_analytics_id: string;
  google_tag_manager_id: string;
  google_site_verification: string;
  bing_site_verification: string;
  robots_index: boolean;
  robots_follow: boolean;
  sitemap_enabled: boolean;
  organization_name: string;
  organization_legal_name: string;
  organization_description: string;
  social_twitter: string;
  social_linkedin: string;
  social_github: string;
  home_seo_title: string;
  home_seo_description: string;
  home_seo_keywords: string;
  home_og_title: string;
  home_og_description: string;
  home_social_image_url: string;
  home_twitter_title: string;
  home_twitter_description: string;
  home_twitter_image: string;
  home_robots_index: boolean;
  home_robots_follow: boolean;
};

type SeoPageKind = 'home' | 'fixed' | 'cms';

type SeoPageRecord = {
  id: string;
  title: string;
  slug: string;
  pathname: string;
  status: 'draft' | 'published';
  is_enabled: boolean;
  page_kind: 'fixed' | 'cms';
  seo_title: string | null;
  seo_description: string | null;
  seo_keywords: string | null;
  seo_image_url: string | null;
  og_title: string | null;
  og_description: string | null;
  twitter_title: string | null;
  twitter_description: string | null;
  twitter_image_url: string | null;
  canonical_url_override: string | null;
  robots_index: boolean | null;
  robots_follow: boolean | null;
};

type PageSeoForm = {
  seo_title: string;
  seo_description: string;
  seo_keywords: string;
  seo_image_url: string;
  og_title: string;
  og_description: string;
  twitter_title: string;
  twitter_description: string;
  twitter_image_url: string;
  canonical_url_override: string;
  robots_index: boolean;
  robots_follow: boolean;
};

const SOCIAL_IMAGE_UPLOAD = {
  accept: '.png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp',
  acceptedFormatsLabel: 'PNG, JPG, JPEG, WEBP',
  maxSizeBytes: 2 * 1024 * 1024,
  maxSizeLabel: '2 MB',
  allowedMimeTypes: ['image/png', 'image/jpeg', 'image/webp'],
  allowedExtensions: ['png', 'jpg', 'jpeg', 'webp'],
};

const TABS: Array<{ id: SeoAdminTab; label: string }> = [
  { id: 'global', label: 'Global Defaults' },
  { id: 'pages', label: 'Page SEO' },
  { id: 'verification', label: 'Verification & Analytics' },
  { id: 'organization', label: 'Organization' },
  { id: 'robots', label: 'Robots' },
];

function joinKeywords(value: unknown) {
  return normalizeSeoKeywordList(value, []).join(', ');
}

function buildDefaultSettingsForm(): SeoSettingsForm {
  return {
    site_title: DEFAULT_PLATFORM_SETTINGS.seo.siteTitle,
    title_template: DEFAULT_PLATFORM_SETTINGS.seo.titleTemplate,
    site_description: DEFAULT_PLATFORM_SETTINGS.seo.siteDescription,
    keywords: DEFAULT_PLATFORM_SETTINGS.seo.keywords.join(', '),
    canonical_url: DEFAULT_PLATFORM_SETTINGS.seo.canonicalUrl,
    default_language: DEFAULT_PLATFORM_SETTINGS.localization.defaultLanguage,
    og_title: DEFAULT_PLATFORM_SETTINGS.seo.ogTitle,
    og_description: DEFAULT_PLATFORM_SETTINGS.seo.ogDescription,
    og_image: DEFAULT_PLATFORM_SETTINGS.seo.ogImage,
    twitter_title: DEFAULT_PLATFORM_SETTINGS.seo.twitterTitle,
    twitter_description: DEFAULT_PLATFORM_SETTINGS.seo.twitterDescription,
    twitter_image: DEFAULT_PLATFORM_SETTINGS.seo.twitterImage,
    twitter_handle: DEFAULT_PLATFORM_SETTINGS.seo.twitterHandle,
    google_analytics_id: '',
    google_tag_manager_id: '',
    google_site_verification: '',
    bing_site_verification: '',
    robots_index: DEFAULT_PLATFORM_SETTINGS.seo.robotsIndex,
    robots_follow: DEFAULT_PLATFORM_SETTINGS.seo.robotsFollow,
    sitemap_enabled: DEFAULT_PLATFORM_SETTINGS.seo.sitemapEnabled,
    organization_name: DEFAULT_PLATFORM_SETTINGS.seo.organizationName,
    organization_legal_name: DEFAULT_PLATFORM_SETTINGS.seo.organizationLegalName,
    organization_description: DEFAULT_PLATFORM_SETTINGS.seo.organizationDescription,
    social_twitter: '',
    social_linkedin: '',
    social_github: '',
    home_seo_title: DEFAULT_PLATFORM_SETTINGS.seo.home.title,
    home_seo_description: DEFAULT_PLATFORM_SETTINGS.seo.home.description,
    home_seo_keywords: '',
    home_og_title: DEFAULT_PLATFORM_SETTINGS.seo.home.ogTitle,
    home_og_description: DEFAULT_PLATFORM_SETTINGS.seo.home.ogDescription,
    home_social_image_url: DEFAULT_PLATFORM_SETTINGS.seo.home.socialImage,
    home_twitter_title: DEFAULT_PLATFORM_SETTINGS.seo.home.twitterTitle,
    home_twitter_description: DEFAULT_PLATFORM_SETTINGS.seo.home.twitterDescription,
    home_twitter_image: DEFAULT_PLATFORM_SETTINGS.seo.home.twitterImage,
    home_robots_index: DEFAULT_PLATFORM_SETTINGS.seo.home.robotsIndex,
    home_robots_follow: DEFAULT_PLATFORM_SETTINGS.seo.home.robotsFollow,
  };
}

function buildHomePageForm(settings: SeoSettingsForm): PageSeoForm {
  return {
    seo_title: settings.home_seo_title,
    seo_description: settings.home_seo_description,
    seo_keywords: settings.home_seo_keywords,
    seo_image_url: settings.home_social_image_url,
    og_title: settings.home_og_title,
    og_description: settings.home_og_description,
    twitter_title: settings.home_twitter_title,
    twitter_description: settings.home_twitter_description,
    twitter_image_url: settings.home_twitter_image,
    canonical_url_override: '',
    robots_index: settings.home_robots_index,
    robots_follow: settings.home_robots_follow,
  };
}

function buildCmsPageForm(page: SeoPageRecord, settings: SeoSettingsForm): PageSeoForm {
  return {
    seo_title: page.seo_title || '',
    seo_description: page.seo_description || '',
    seo_keywords: joinKeywords(page.seo_keywords),
    seo_image_url: page.seo_image_url || '',
    og_title: page.og_title || '',
    og_description: page.og_description || '',
    twitter_title: page.twitter_title || '',
    twitter_description: page.twitter_description || '',
    twitter_image_url: page.twitter_image_url || '',
    canonical_url_override: page.canonical_url_override || '',
    robots_index: page.robots_index ?? settings.robots_index,
    robots_follow: page.robots_follow ?? settings.robots_follow,
  };
}

export default function AdminSeoPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<SeoAdminTab>('global');
  const [settings, setSettings] = useState<SeoSettingsForm>(buildDefaultSettingsForm);
  const [pages, setPages] = useState<SeoPageRecord[]>([]);
  const [selectedPageId, setSelectedPageId] = useState('home');
  const [pageSearch, setPageSearch] = useState('');
  const [pageForm, setPageForm] = useState<PageSeoForm>(() => buildHomePageForm(buildDefaultSettingsForm()));
  const [savedScope, setSavedScope] = useState<'global' | 'page' | null>(null);
  const [isSavingGlobal, setIsSavingGlobal] = useState(false);
  const [isSavingPage, setIsSavingPage] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [ogImageFile, setOgImageFile] = useState<File | null>(null);
  const [ogImageProgress, setOgImageProgress] = useState(0);
  const [ogImageError, setOgImageError] = useState<string | null>(null);

  useEffect(() => {
    async function loadSeoData() {
      try {
        const [platformData, pagesResponse] = await Promise.all([
          getPlatformSettings(),
          fetch('/api/admin/seo/pages'),
        ]);

        const pagesJson = await pagesResponse.json();
        if (!pagesResponse.ok) {
          throw new Error(pagesJson?.error || 'Failed to load page SEO records.');
        }

        const nextSettings = buildDefaultSettingsForm();

        if (platformData) {
          const blockedSocialFallbackSources = [
            platformData.logo_url || '',
            platformData.compact_logo_url || '',
            platformData.favicon_url || '',
            platformData.apple_touch_icon_url || '',
            platformData.pwa_icon_192_url || '',
            platformData.pwa_icon_512_url || '',
          ];
          const approvedOgImage =
            getApprovedSocialPreviewAsset(platformData.og_image || '', blockedSocialFallbackSources) ||
            getApprovedSocialPreviewAsset(platformData.social_image_url || '', blockedSocialFallbackSources) ||
            nextSettings.og_image;
          const approvedTwitterImage =
            getApprovedSocialPreviewAsset(platformData.twitter_image || '', blockedSocialFallbackSources) ||
            approvedOgImage;
          const approvedHomeImage =
            getApprovedSocialPreviewAsset(platformData.home_social_image_url || '', blockedSocialFallbackSources) ||
            approvedOgImage;
          const approvedHomeTwitterImage =
            getApprovedSocialPreviewAsset(platformData.home_twitter_image || '', blockedSocialFallbackSources) ||
            approvedHomeImage ||
            approvedTwitterImage;

          setSettings({
            site_title: platformData.site_title || nextSettings.site_title,
            title_template: platformData.title_template || nextSettings.title_template,
            site_description: platformData.site_description || nextSettings.site_description,
            keywords: joinKeywords(platformData.keywords) || nextSettings.keywords,
            canonical_url: platformData.canonical_url || nextSettings.canonical_url,
            default_language: platformData.default_language || nextSettings.default_language,
            og_title: platformData.og_title || platformData.site_title || nextSettings.og_title,
            og_description:
              platformData.og_description ||
              platformData.site_description ||
              nextSettings.og_description,
            og_image: approvedOgImage,
            twitter_title:
              platformData.twitter_title ||
              platformData.og_title ||
              platformData.site_title ||
              nextSettings.twitter_title,
            twitter_description:
              platformData.twitter_description ||
              platformData.og_description ||
              platformData.site_description ||
              nextSettings.twitter_description,
            twitter_image: approvedTwitterImage,
            twitter_handle: platformData.twitter_handle || nextSettings.twitter_handle,
            google_analytics_id:
              platformData.google_analytics_id || nextSettings.google_analytics_id,
            google_tag_manager_id:
              platformData.google_tag_manager_id || nextSettings.google_tag_manager_id,
            google_site_verification:
              platformData.google_site_verification || nextSettings.google_site_verification,
            bing_site_verification:
              platformData.bing_site_verification || nextSettings.bing_site_verification,
            robots_index: platformData.robots_index ?? nextSettings.robots_index,
            robots_follow: platformData.robots_follow ?? nextSettings.robots_follow,
            sitemap_enabled: platformData.sitemap_enabled ?? nextSettings.sitemap_enabled,
            organization_name:
              platformData.organization_name ||
              platformData.app_name ||
              nextSettings.organization_name,
            organization_legal_name:
              platformData.organization_legal_name || nextSettings.organization_legal_name,
            organization_description:
              platformData.organization_description ||
              platformData.site_description ||
              nextSettings.organization_description,
            social_twitter: platformData.social_twitter || nextSettings.social_twitter,
            social_linkedin: platformData.social_linkedin || nextSettings.social_linkedin,
            social_github: platformData.social_github || nextSettings.social_github,
            home_seo_title:
              platformData.home_seo_title ||
              platformData.site_title ||
              nextSettings.home_seo_title,
            home_seo_description:
              platformData.home_seo_description ||
              platformData.site_description ||
              nextSettings.home_seo_description,
            home_seo_keywords: joinKeywords(platformData.home_seo_keywords),
            home_og_title:
              platformData.home_og_title ||
              platformData.og_title ||
              platformData.site_title ||
              nextSettings.home_og_title,
            home_og_description:
              platformData.home_og_description ||
              platformData.og_description ||
              platformData.site_description ||
              nextSettings.home_og_description,
            home_social_image_url: approvedHomeImage,
            home_twitter_title:
              platformData.home_twitter_title ||
              platformData.home_og_title ||
              platformData.twitter_title ||
              platformData.og_title ||
              platformData.site_title ||
              nextSettings.home_twitter_title,
            home_twitter_description:
              platformData.home_twitter_description ||
              platformData.home_og_description ||
              platformData.twitter_description ||
              platformData.og_description ||
              platformData.site_description ||
              nextSettings.home_twitter_description,
            home_twitter_image: approvedHomeTwitterImage,
            home_robots_index: platformData.home_robots_index ?? (platformData.robots_index ?? nextSettings.home_robots_index),
            home_robots_follow: platformData.home_robots_follow ?? (platformData.robots_follow ?? nextSettings.home_robots_follow),
          });
        }

        setPages((pagesJson?.pages || []) as SeoPageRecord[]);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Failed to load SEO settings.');
      } finally {
        setIsLoading(false);
      }
    }

    void loadSeoData();
  }, []);

  const selectedPage = useMemo(() => {
    if (selectedPageId === 'home') {
      return {
        id: 'home',
        title: 'Home / Landing Page',
        slug: 'home',
        pathname: '/home',
        page_kind: 'home' as SeoPageKind,
      };
    }

    const page = pages.find((entry) => entry.id === selectedPageId);
    if (!page) {
      return null;
    }

    return {
      ...page,
      page_kind: page.page_kind as SeoPageKind,
    };
  }, [pages, selectedPageId]);

  useEffect(() => {
    if (!selectedPage) {
      setSelectedPageId('home');
      setPageForm(buildHomePageForm(settings));
      return;
    }

    if (selectedPage.page_kind === 'home') {
      setPageForm(buildHomePageForm(settings));
      return;
    }

    const livePage = pages.find((entry) => entry.id === selectedPage.id);
    if (livePage) {
      setPageForm(buildCmsPageForm(livePage, settings));
    }
  }, [pages, selectedPage, settings]);

  const filteredPages = useMemo(() => {
    const homeEntry = {
      id: 'home',
      title: 'Home / Landing Page',
      slug: 'home',
      pathname: '/home',
      page_kind: 'home' as SeoPageKind,
    };
    const query = pageSearch.trim().toLowerCase();
    const allPages = [
      homeEntry,
      ...pages.map((page) => ({
        ...page,
        page_kind: page.page_kind as SeoPageKind,
      })),
    ];

    if (!query) {
      return allPages;
    }

    return allPages.filter((page) =>
      page.title.toLowerCase().includes(query) ||
      page.pathname.toLowerCase().includes(query)
    );
  }, [pageSearch, pages]);

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

  const handleSaveGlobalSeo = async () => {
    setIsSavingGlobal(true);
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
        site_title: nextSettings.site_title.trim(),
        title_template: nextSettings.title_template.trim(),
        site_description: nextSettings.site_description.trim(),
        keywords: normalizeSeoKeywordList(nextSettings.keywords, []),
        canonical_url: nextSettings.canonical_url.trim(),
        default_language: nextSettings.default_language,
        og_title: nextSettings.og_title.trim(),
        og_description: nextSettings.og_description.trim(),
        og_image: nextSettings.og_image.trim(),
        social_image_url: nextSettings.og_image.trim(),
        twitter_title: nextSettings.twitter_title.trim(),
        twitter_description: nextSettings.twitter_description.trim(),
        twitter_image: nextSettings.twitter_image.trim(),
        twitter_handle: nextSettings.twitter_handle.trim(),
        google_analytics_id: nextSettings.google_analytics_id.trim(),
        google_tag_manager_id: nextSettings.google_tag_manager_id.trim(),
        google_site_verification: nextSettings.google_site_verification.trim(),
        bing_site_verification: nextSettings.bing_site_verification.trim(),
        robots_index: nextSettings.robots_index,
        robots_follow: nextSettings.robots_follow,
        sitemap_enabled: nextSettings.sitemap_enabled,
        organization_name: nextSettings.organization_name.trim(),
        organization_legal_name: nextSettings.organization_legal_name.trim(),
        organization_description: nextSettings.organization_description.trim(),
        social_twitter: nextSettings.social_twitter.trim(),
        social_linkedin: nextSettings.social_linkedin.trim(),
        social_github: nextSettings.social_github.trim(),
        home_seo_title: nextSettings.home_seo_title.trim(),
        home_seo_description: nextSettings.home_seo_description.trim(),
        home_seo_keywords: normalizeSeoKeywordList(nextSettings.home_seo_keywords, []),
        home_og_title: nextSettings.home_og_title.trim(),
        home_og_description: nextSettings.home_og_description.trim(),
        home_social_image_url: nextSettings.home_social_image_url.trim(),
        home_twitter_title: nextSettings.home_twitter_title.trim(),
        home_twitter_description: nextSettings.home_twitter_description.trim(),
        home_twitter_image: nextSettings.home_twitter_image.trim(),
        home_robots_index: nextSettings.home_robots_index,
        home_robots_follow: nextSettings.home_robots_follow,
      });

      setSettings(nextSettings);
      setOgImageFile(null);
      setOgImageProgress(0);
      setSavedScope('global');
      router.refresh();
      toast.success('Global SEO settings saved.');
      setTimeout(() => setSavedScope((current) => (current === 'global' ? null : current)), 2500);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save SEO settings.');
    } finally {
      setIsSavingGlobal(false);
    }
  };

  const handleSavePageSeo = async () => {
    if (!selectedPage) {
      return;
    }

    setIsSavingPage(true);
    try {
      if (selectedPage.page_kind === 'home') {
        await savePlatformSettings({
          home_seo_title: pageForm.seo_title.trim(),
          home_seo_description: pageForm.seo_description.trim(),
          home_seo_keywords: normalizeSeoKeywordList(pageForm.seo_keywords, []),
          home_og_title: pageForm.og_title.trim(),
          home_og_description: pageForm.og_description.trim(),
          home_social_image_url: pageForm.seo_image_url.trim(),
          home_twitter_title: pageForm.twitter_title.trim(),
          home_twitter_description: pageForm.twitter_description.trim(),
          home_twitter_image: pageForm.twitter_image_url.trim(),
          home_robots_index: pageForm.robots_index,
          home_robots_follow: pageForm.robots_follow,
        });

        setSettings((current) => ({
          ...current,
          home_seo_title: pageForm.seo_title,
          home_seo_description: pageForm.seo_description,
          home_seo_keywords: pageForm.seo_keywords,
          home_og_title: pageForm.og_title,
          home_og_description: pageForm.og_description,
          home_social_image_url: pageForm.seo_image_url,
          home_twitter_title: pageForm.twitter_title,
          home_twitter_description: pageForm.twitter_description,
          home_twitter_image: pageForm.twitter_image_url,
          home_robots_index: pageForm.robots_index,
          home_robots_follow: pageForm.robots_follow,
        }));
      } else {
        const response = await fetch(`/api/admin/seo/pages/${selectedPage.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(pageForm),
        });
        const json = await response.json();
        if (!response.ok) {
          throw new Error(json?.error || 'Failed to save page SEO.');
        }

        const updatedPage = json?.page as SeoPageRecord;
        setPages((current) =>
          current.map((page) => (page.id === updatedPage.id ? updatedPage : page))
        );
      }

      setSavedScope('page');
      router.refresh();
      toast.success(`${selectedPage.title} SEO saved.`);
      setTimeout(() => setSavedScope((current) => (current === 'page' ? null : current)), 2500);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save page SEO.');
    } finally {
      setIsSavingPage(false);
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
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-700 text-foreground">SEO Control Centre</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Manage global defaults, Home SEO, fixed-route SEO, and live CMS page metadata from one place.
          </p>
        </div>
        {activeTab === 'pages' ? (
          <button
            onClick={handleSavePageSeo}
            disabled={isSavingPage || !selectedPage}
            className={`btn-primary ${savedScope === 'page' ? 'bg-positive' : ''}`}
          >
            {isSavingPage ? (
              <Loader2 size={15} className="animate-spin" />
            ) : savedScope === 'page' ? (
              <Check size={15} />
            ) : (
              <Globe size={15} />
            )}
            {savedScope === 'page' ? 'Saved' : `Save ${selectedPage?.title || 'Page'} SEO`}
          </button>
        ) : (
          <button
            onClick={handleSaveGlobalSeo}
            disabled={isSavingGlobal}
            className={`btn-primary ${savedScope === 'global' ? 'bg-positive' : ''}`}
          >
            {isSavingGlobal ? (
              <Loader2 size={15} className="animate-spin" />
            ) : savedScope === 'global' ? (
              <Check size={15} />
            ) : (
              <Globe size={15} />
            )}
            {savedScope === 'global' ? 'Saved' : 'Save Global SEO'}
          </button>
        )}
      </div>

      <div className="flex items-center gap-1 overflow-x-auto rounded-xl bg-muted p-1">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-3 py-2 rounded-lg text-xs font-600 whitespace-nowrap transition-all ${
              activeTab === tab.id
                ? 'bg-card text-foreground shadow-card'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'global' ? (
        <div className="space-y-6">
          <div className="card-elevated p-5 space-y-4">
            <h2 className="text-base font-600 text-foreground">Global Defaults</h2>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <div>
                <label className="block text-sm font-600 text-foreground mb-1.5">Site Title</label>
                <input
                  type="text"
                  className="input-base"
                  value={settings.site_title}
                  onChange={(event) =>
                    setSettings((current) => ({ ...current, site_title: event.target.value }))
                  }
                />
              </div>
              <div>
                <label className="block text-sm font-600 text-foreground mb-1.5">Title Template</label>
                <input
                  type="text"
                  className="input-base"
                  value={settings.title_template}
                  onChange={(event) =>
                    setSettings((current) => ({ ...current, title_template: event.target.value }))
                  }
                />
              </div>
              <div className="lg:col-span-2">
                <label className="block text-sm font-600 text-foreground mb-1.5">Default Meta Description</label>
                <textarea
                  rows={3}
                  className="input-base resize-none"
                  value={settings.site_description}
                  onChange={(event) =>
                    setSettings((current) => ({ ...current, site_description: event.target.value }))
                  }
                />
              </div>
              <div className="lg:col-span-2">
                <label className="block text-sm font-600 text-foreground mb-1.5">Default Meta Keywords</label>
                <input
                  type="text"
                  className="input-base"
                  value={settings.keywords}
                  onChange={(event) =>
                    setSettings((current) => ({ ...current, keywords: event.target.value }))
                  }
                  placeholder="personal finance, budgeting, expense tracking"
                />
              </div>
              <div>
                <label className="block text-sm font-600 text-foreground mb-1.5">Canonical Site URL</label>
                <input
                  type="url"
                  className="input-base"
                  value={settings.canonical_url}
                  onChange={(event) =>
                    setSettings((current) => ({ ...current, canonical_url: event.target.value }))
                  }
                />
              </div>
              <div>
                <label className="block text-sm font-600 text-foreground mb-1.5">Default Locale</label>
                <select
                  className="input-base"
                  value={settings.default_language}
                  onChange={(event) =>
                    setSettings((current) => ({ ...current, default_language: event.target.value }))
                  }
                >
                  <option value="en">English</option>
                  <option value="ar">Arabic</option>
                  <option value="fr">French</option>
                  <option value="ru">Russian</option>
                </select>
              </div>
            </div>
          </div>

          <div className="card-elevated p-5 space-y-4">
            <h2 className="text-base font-600 text-foreground">Open Graph & X</h2>
            <MediaUploadCard
              label="Default Social Image"
              value={settings.og_image}
              onValueChange={(value) =>
                setSettings((current) => ({ ...current, og_image: value }))
              }
              selectedFile={ogImageFile}
              onFileSelect={handleOgImageSelection}
              accept={SOCIAL_IMAGE_UPLOAD.accept}
              acceptedFormatsLabel={SOCIAL_IMAGE_UPLOAD.acceptedFormatsLabel}
              maxSizeLabel={SOCIAL_IMAGE_UPLOAD.maxSizeLabel}
              isUploading={isSavingGlobal && !!ogImageFile}
              uploadProgress={ogImageProgress}
              error={ogImageError}
              previewVariant="wide"
              helperText="This is the only admin-owned default social image. It falls back to the built-in social card when empty."
            />
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <div>
                <label className="block text-sm font-600 text-foreground mb-1.5">Default Open Graph Title</label>
                <input
                  type="text"
                  className="input-base"
                  value={settings.og_title}
                  onChange={(event) =>
                    setSettings((current) => ({ ...current, og_title: event.target.value }))
                  }
                />
              </div>
              <div>
                <label className="block text-sm font-600 text-foreground mb-1.5">Default Open Graph Description</label>
                <textarea
                  rows={3}
                  className="input-base resize-none"
                  value={settings.og_description}
                  onChange={(event) =>
                    setSettings((current) => ({ ...current, og_description: event.target.value }))
                  }
                />
              </div>
              <div>
                <label className="block text-sm font-600 text-foreground mb-1.5">Twitter/X Title</label>
                <input
                  type="text"
                  className="input-base"
                  value={settings.twitter_title}
                  onChange={(event) =>
                    setSettings((current) => ({ ...current, twitter_title: event.target.value }))
                  }
                />
              </div>
              <div>
                <label className="block text-sm font-600 text-foreground mb-1.5">Twitter/X Description</label>
                <textarea
                  rows={3}
                  className="input-base resize-none"
                  value={settings.twitter_description}
                  onChange={(event) =>
                    setSettings((current) => ({
                      ...current,
                      twitter_description: event.target.value,
                    }))
                  }
                />
              </div>
              <div>
                <label className="block text-sm font-600 text-foreground mb-1.5">Twitter/X Image URL</label>
                <input
                  type="url"
                  className="input-base"
                  value={settings.twitter_image}
                  onChange={(event) =>
                    setSettings((current) => ({ ...current, twitter_image: event.target.value }))
                  }
                />
              </div>
              <div>
                <label className="block text-sm font-600 text-foreground mb-1.5">Twitter/X Handle</label>
                <input
                  type="text"
                  className="input-base"
                  placeholder="@smartpocket"
                  value={settings.twitter_handle}
                  onChange={(event) =>
                    setSettings((current) => ({ ...current, twitter_handle: event.target.value }))
                  }
                />
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {activeTab === 'pages' ? (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
          <div className="space-y-4">
            <div className="card-elevated p-4 space-y-4">
              <div>
                <h2 className="text-base font-700 text-foreground">Page SEO</h2>
                <p className="text-xs text-muted-foreground">
                  Home, Contact, Privacy, Terms, and enabled published CMS pages live here.
                </p>
              </div>
              <div className="relative">
                <Search
                  size={14}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                />
                <input
                  value={pageSearch}
                  onChange={(event) => setPageSearch(event.target.value)}
                  placeholder="Search page SEO..."
                  className="input-base pl-9"
                />
              </div>
            </div>

            <div className="card-elevated p-3 space-y-3">
              {filteredPages.map((page) => (
                <button
                  key={page.id}
                  type="button"
                  onClick={() => setSelectedPageId(page.id)}
                  className={`w-full rounded-2xl border p-4 text-left transition-colors ${
                    selectedPageId === page.id
                      ? 'border-accent bg-accent/5'
                      : 'border-border hover:border-accent/40'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-700 text-foreground">{page.title}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{page.pathname}</p>
                    </div>
                    <span className="rounded-full bg-muted px-2 py-1 text-[10px] font-700 uppercase text-muted-foreground">
                      {page.page_kind}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-6">
            <div className="card-elevated p-5 space-y-5">
              <div>
                <h2 className="text-lg font-700 text-foreground">
                  {selectedPage?.title || 'Page SEO'}
                </h2>
                <p className="text-sm text-muted-foreground">
                  SEO metadata stays independent from visible page copy and landing-page sections.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <div>
                  <label className="block text-sm font-600 text-foreground mb-1.5">Meta Title</label>
                  <input
                    value={pageForm.seo_title}
                    onChange={(event) =>
                      setPageForm((current) => ({ ...current, seo_title: event.target.value }))
                    }
                    className="input-base"
                  />
                </div>
                <div>
                  <label className="block text-sm font-600 text-foreground mb-1.5">Meta Description</label>
                  <textarea
                    rows={3}
                    value={pageForm.seo_description}
                    onChange={(event) =>
                      setPageForm((current) => ({
                        ...current,
                        seo_description: event.target.value,
                      }))
                    }
                    className="input-base resize-none"
                  />
                </div>
                <div className="lg:col-span-2">
                  <label className="block text-sm font-600 text-foreground mb-1.5">Meta Keywords</label>
                  <input
                    value={pageForm.seo_keywords}
                    onChange={(event) =>
                      setPageForm((current) => ({ ...current, seo_keywords: event.target.value }))
                    }
                    className="input-base"
                    placeholder="keyword one, keyword two"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <div>
                  <label className="block text-sm font-600 text-foreground mb-1.5">Open Graph Title Override</label>
                  <input
                    value={pageForm.og_title}
                    onChange={(event) =>
                      setPageForm((current) => ({ ...current, og_title: event.target.value }))
                    }
                    className="input-base"
                  />
                </div>
                <div>
                  <label className="block text-sm font-600 text-foreground mb-1.5">Open Graph Description Override</label>
                  <textarea
                    rows={3}
                    value={pageForm.og_description}
                    onChange={(event) =>
                      setPageForm((current) => ({
                        ...current,
                        og_description: event.target.value,
                      }))
                    }
                    className="input-base resize-none"
                  />
                </div>
                <div className="lg:col-span-2">
                  <label className="block text-sm font-600 text-foreground mb-1.5">Open Graph / Social Image Override</label>
                  <input
                    type="url"
                    value={pageForm.seo_image_url}
                    onChange={(event) =>
                      setPageForm((current) => ({
                        ...current,
                        seo_image_url: event.target.value,
                      }))
                    }
                    className="input-base"
                    placeholder="/assets/images/smart-pocket-social-card.png"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <div>
                  <label className="block text-sm font-600 text-foreground mb-1.5">Twitter/X Title Override</label>
                  <input
                    value={pageForm.twitter_title}
                    onChange={(event) =>
                      setPageForm((current) => ({
                        ...current,
                        twitter_title: event.target.value,
                      }))
                    }
                    className="input-base"
                  />
                </div>
                <div>
                  <label className="block text-sm font-600 text-foreground mb-1.5">Twitter/X Description Override</label>
                  <textarea
                    rows={3}
                    value={pageForm.twitter_description}
                    onChange={(event) =>
                      setPageForm((current) => ({
                        ...current,
                        twitter_description: event.target.value,
                      }))
                    }
                    className="input-base resize-none"
                  />
                </div>
                <div className="lg:col-span-2">
                  <label className="block text-sm font-600 text-foreground mb-1.5">Twitter/X Image Override</label>
                  <input
                    type="url"
                    value={pageForm.twitter_image_url}
                    onChange={(event) =>
                      setPageForm((current) => ({
                        ...current,
                        twitter_image_url: event.target.value,
                      }))
                    }
                    className="input-base"
                  />
                </div>
              </div>

              {selectedPage?.page_kind !== 'home' ? (
                <div>
                  <label className="block text-sm font-600 text-foreground mb-1.5">Canonical URL Override</label>
                  <input
                    type="url"
                    value={pageForm.canonical_url_override}
                    onChange={(event) =>
                      setPageForm((current) => ({
                        ...current,
                        canonical_url_override: event.target.value,
                      }))
                    }
                    className="input-base"
                    placeholder="Optional. Leave blank unless a custom canonical is genuinely needed."
                  />
                </div>
              ) : null}

              <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                {[
                  {
                    key: 'robots_index' as const,
                    label: 'Allow Indexing',
                    description: 'Turn off to output noindex for this page.',
                  },
                  {
                    key: 'robots_follow' as const,
                    label: 'Allow Follow',
                    description: 'Turn off to output nofollow for this page.',
                  },
                ].map((item) => (
                  <div
                    key={item.key}
                    className="flex items-center justify-between rounded-xl border border-border p-3"
                  >
                    <div>
                      <p className="text-sm font-600 text-foreground">{item.label}</p>
                      <p className="text-xs text-muted-foreground">{item.description}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        setPageForm((current) => ({
                          ...current,
                          [item.key]: !current[item.key],
                        }))
                      }
                      className={`relative h-5 w-10 rounded-full transition-colors ${
                        pageForm[item.key] ? 'bg-accent' : 'bg-muted'
                      }`}
                    >
                      <span
                        className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all duration-200 ${
                          pageForm[item.key] ? 'start-5' : 'start-0.5'
                        }`}
                      />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {activeTab === 'verification' ? (
        <div className="card-elevated p-5 space-y-4">
          <h2 className="text-base font-600 text-foreground">Verification & Analytics</h2>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div>
              <label className="block text-sm font-600 text-foreground mb-1.5">Google Search Console Verification</label>
              <input
                type="text"
                className="input-base"
                value={settings.google_site_verification}
                onChange={(event) =>
                  setSettings((current) => ({
                    ...current,
                    google_site_verification: event.target.value,
                  }))
                }
              />
            </div>
            <div>
              <label className="block text-sm font-600 text-foreground mb-1.5">Bing Verification</label>
              <input
                type="text"
                className="input-base"
                value={settings.bing_site_verification}
                onChange={(event) =>
                  setSettings((current) => ({
                    ...current,
                    bing_site_verification: event.target.value,
                  }))
                }
              />
            </div>
            <div>
              <label className="block text-sm font-600 text-foreground mb-1.5">GA4 Measurement ID</label>
              <input
                type="text"
                className="input-base"
                placeholder="G-XXXXXXXXXX"
                value={settings.google_analytics_id}
                onChange={(event) =>
                  setSettings((current) => ({
                    ...current,
                    google_analytics_id: event.target.value,
                  }))
                }
              />
            </div>
            <div>
              <label className="block text-sm font-600 text-foreground mb-1.5">Google Tag Manager Container ID</label>
              <input
                type="text"
                className="input-base"
                placeholder="GTM-XXXXXXX"
                value={settings.google_tag_manager_id}
                onChange={(event) =>
                  setSettings((current) => ({
                    ...current,
                    google_tag_manager_id: event.target.value,
                  }))
                }
              />
            </div>
          </div>
        </div>
      ) : null}

      {activeTab === 'organization' ? (
        <div className="card-elevated p-5 space-y-4">
          <h2 className="text-base font-600 text-foreground">Organization</h2>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div>
              <label className="block text-sm font-600 text-foreground mb-1.5">Organization Name</label>
              <input
                type="text"
                className="input-base"
                value={settings.organization_name}
                onChange={(event) =>
                  setSettings((current) => ({
                    ...current,
                    organization_name: event.target.value,
                  }))
                }
              />
            </div>
            <div>
              <label className="block text-sm font-600 text-foreground mb-1.5">Legal Name</label>
              <input
                type="text"
                className="input-base"
                value={settings.organization_legal_name}
                onChange={(event) =>
                  setSettings((current) => ({
                    ...current,
                    organization_legal_name: event.target.value,
                  }))
                }
              />
            </div>
            <div className="lg:col-span-2">
              <label className="block text-sm font-600 text-foreground mb-1.5">Organization Description</label>
              <textarea
                rows={3}
                className="input-base resize-none"
                value={settings.organization_description}
                onChange={(event) =>
                  setSettings((current) => ({
                    ...current,
                    organization_description: event.target.value,
                  }))
                }
              />
            </div>
            <div>
              <label className="block text-sm font-600 text-foreground mb-1.5">Social Profile URL: X</label>
              <input
                type="url"
                className="input-base"
                value={settings.social_twitter}
                onChange={(event) =>
                  setSettings((current) => ({ ...current, social_twitter: event.target.value }))
                }
              />
            </div>
            <div>
              <label className="block text-sm font-600 text-foreground mb-1.5">Social Profile URL: LinkedIn</label>
              <input
                type="url"
                className="input-base"
                value={settings.social_linkedin}
                onChange={(event) =>
                  setSettings((current) => ({ ...current, social_linkedin: event.target.value }))
                }
              />
            </div>
            <div>
              <label className="block text-sm font-600 text-foreground mb-1.5">Social Profile URL: GitHub</label>
              <input
                type="url"
                className="input-base"
                value={settings.social_github}
                onChange={(event) =>
                  setSettings((current) => ({ ...current, social_github: event.target.value }))
                }
              />
            </div>
          </div>
        </div>
      ) : null}

      {activeTab === 'robots' ? (
        <div className="card-elevated p-5 space-y-4">
          <h2 className="text-base font-600 text-foreground">Robots & Indexing</h2>
          {[
            {
              key: 'robots_index' as const,
              label: 'Allow Public Indexing',
              description: 'Sets the global public-site default for index or noindex.',
            },
            {
              key: 'robots_follow' as const,
              label: 'Allow Follow',
              description: 'Sets the global public-site default for follow or nofollow.',
            },
            {
              key: 'sitemap_enabled' as const,
              label: 'Enable Sitemap',
              description: 'Keeps the public sitemap available at /sitemap.xml.',
            },
          ].map((item) => (
            <div
              key={item.key}
              className="flex items-center justify-between rounded-xl border border-border p-3"
            >
              <div>
                <p className="text-sm font-600 text-foreground">{item.label}</p>
                <p className="text-xs text-muted-foreground">{item.description}</p>
              </div>
              <button
                type="button"
                onClick={() =>
                  setSettings((current) => ({ ...current, [item.key]: !current[item.key] }))
                }
                className={`relative h-5 w-10 rounded-full transition-colors ${
                  settings[item.key] ? 'bg-accent' : 'bg-muted'
                }`}
              >
                <span
                  className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all duration-200 ${
                    settings[item.key] ? 'start-5' : 'start-0.5'
                  }`}
                />
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
