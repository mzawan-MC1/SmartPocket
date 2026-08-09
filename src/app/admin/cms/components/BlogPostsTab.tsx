'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { CalendarDays, Eye, FilePlus2, Loader2, Pencil, Search, Sparkles, Square, Trash2, Play } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import Modal from '@/components/ui/Modal';
import CmsHtml from '@/components/cms/CmsHtml';
import RichTextEditor from '@/components/cms/RichTextEditor';
import MediaUploadCard from '@/components/ui/MediaUploadCard';
import { CONTENT_TRANSLATION_ENABLED_LANGS, type SupportedLanguage } from '@/i18n/registry';
import {
  deriveReadingTimeMinutes,
  normalizeTagList,
  slugifyCmsPageSlug,
  type CmsBlogAdminInput,
  type CmsPageRecord,
} from '@/lib/cms-pages';
import { isSupportedUploadFile, uploadPublicMedia } from '@/lib/media-upload';

type BlogPostListItem = CmsPageRecord & {
  can_delete: boolean;
  excerpt_resolved?: string;
  reading_time_minutes: number | null;
};

const COVER_IMAGE_UPLOAD = {
  accept: '.png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp',
  acceptedFormatsLabel: 'PNG, JPG, JPEG, WEBP',
  maxSizeBytes: 3 * 1024 * 1024,
  maxSizeLabel: '3 MB',
  allowedMimeTypes: ['image/png', 'image/jpeg', 'image/webp'],
  allowedExtensions: ['png', 'jpg', 'jpeg', 'webp'],
};

const EMPTY_FORM: CmsBlogAdminInput = {
  title: '',
  slug: '',
  content_html: '',
  content_type: 'blog',
  excerpt: '',
  cover_image_url: '',
  cover_image_alt: '',
  author_name: '',
  category: '',
  tags: [],
  is_featured: false,
  status: 'draft',
  is_enabled: true,
  show_in_header: false,
  show_in_footer: false,
  navigation_label: '',
  sort_order: 0,
  allow_delete: true,
  published_at: '',
  reading_time_minutes: null,
  seo_title: '',
  seo_description: '',
  seo_keywords: '',
  seo_image_url: '',
  og_title: '',
  og_description: '',
  twitter_title: '',
  twitter_description: '',
  twitter_image_url: '',
  canonical_url_override: '',
  robots_index: true,
  robots_follow: true,
};

type LocalizedImageState = {
  selectedFile: File | null;
  uploadProgress: number;
  uploadError: string | null;
  cover_image_url: string;
  seo_image_url: string;
  twitter_image_url: string;
};

function buildEmptyLocalizedImageStates(): Record<SupportedLanguage, LocalizedImageState> {
  const result = {} as Record<SupportedLanguage, LocalizedImageState>;
  for (const lang of CONTENT_TRANSLATION_ENABLED_LANGS) {
    result[lang] = {
      selectedFile: null,
      uploadProgress: 0,
      uploadError: null,
      cover_image_url: '',
      seo_image_url: '',
      twitter_image_url: '',
    };
  }
  return result;
}

function formatAdminDate(value: string | null, locale: string) {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(parsed);
}

function BlogEditorSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-3xl border border-border bg-card p-5 shadow-card sm:p-6">
      <div className="mb-5">
        <h3 className="text-base font-700 text-foreground">{title}</h3>
        {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}

export default function BlogPostsTab() {
  const { t, i18n } = useTranslation('portal');
  const tp = React.useCallback(
    (key: string, defaultValue: string, options?: Record<string, unknown>) =>
      t(key, { ns: 'portal', defaultValue, ...options }),
    [t]
  );

  const [posts, setPosts] = useState<BlogPostListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'draft' | 'published'>('all');
  const [featuredFilter, setFeaturedFilter] = useState<'all' | 'featured' | 'standard'>('all');
  const [enabledFilter, setEnabledFilter] = useState<'all' | 'enabled' | 'disabled'>('all');
  const [showPreview, setShowPreview] = useState(true);
  const [isNewPost, setIsNewPost] = useState(true);
  const [form, setForm] = useState<CmsBlogAdminInput>(EMPTY_FORM);
  const [tagInput, setTagInput] = useState('');
  const [coverImageFile, setCoverImageFile] = useState<File | null>(null);
  const [coverUploadProgress, setCoverUploadProgress] = useState(0);
  const [coverUploadError, setCoverUploadError] = useState<string | null>(null);
  const [translationStatuses, setTranslationStatuses] = useState<{ language: string; status: string; sourceHashMatch?: boolean; updatedAt?: string; errorMessage?: string }[]>([]);
  const [translationSourceHash, setTranslationSourceHash] = useState<string>('');
  const [isRegeneratingTranslations, setIsRegeneratingTranslations] = useState(false);
  const [isBackfilling, setIsBackfilling] = useState(false);
  const [localizedImageStates, setLocalizedImageStates] = useState<Record<SupportedLanguage, LocalizedImageState>>(
    buildEmptyLocalizedImageStates()
  );

  type WorkItem = { type: 'blog'; id: string; language: string };
  const [workQueue, setWorkQueue] = useState<WorkItem[]>([]);
  const [stopProcessing, setStopProcessing] = useState(false);
  const stopProcessingRef = React.useRef(false);
  const [processingProgress, setProcessingProgress] = useState({ completed: 0, total: 0 });
  const [isProcessingLoopRunning, setIsProcessingLoopRunning] = useState(false);

  type BackfillDialogState = {
    open: boolean;
    scope: 'all' | 'blog' | 'faq';
    completedScanCount: number;
    totalScannedEstimate: number;
    completedTranslations: number;
    pendingTranslations: number;
    failedTranslations: number;
    failures: any[];
    failedWorkSet: any[];
    pendingWork: any[];
    nextCursor: { blogCursor?: string; faqCategoryCursor?: string; faqItemCursor?: string } | null;
    stopBackfill: boolean;
    isStopped: boolean;
  };
  const [backfillDialog, setBackfillDialog] = useState<BackfillDialogState>({
    open: false,
    scope: 'blog',
    completedScanCount: 0,
    totalScannedEstimate: 0,
    completedTranslations: 0,
    pendingTranslations: 0,
    failedTranslations: 0,
    failures: [],
    failedWorkSet: [],
    pendingWork: [],
    nextCursor: null,
    stopBackfill: false,
    isStopped: false,
  });
  const stopBackfillRef = React.useRef(false);

  const loadPosts = React.useCallback(async (preferredId?: string | null) => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/admin/cms/blog-posts');
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json?.error || tp('adminBlog.errors.load', 'Failed to load blog posts.'));
      }

      const nextPosts = (json?.posts || []) as BlogPostListItem[];
      setPosts(nextPosts);

      const nextActiveId =
        preferredId && nextPosts.some((post) => post.id === preferredId)
          ? preferredId
          : nextPosts[0]?.id || null;

      if (!nextActiveId) {
        startNewPost();
        return;
      }

      const selectedPost = nextPosts.find((post) => post.id === nextActiveId)!;
      setIsNewPost(false);
      setActiveId(selectedPost.id);
      hydrateForm(selectedPost);
    } catch (error: any) {
      toast.error(error?.message || tp('adminBlog.errors.load', 'Failed to load blog posts.'));
    } finally {
      setIsLoading(false);
    }
  }, [tp]);

  useEffect(() => {
    void loadPosts();
  }, [loadPosts]);

  useEffect(() => {
    if (isNewPost || !activeId) return;
    void loadLocalizedImages(activeId);
  }, [activeId, isNewPost]);

  const filteredPosts = useMemo(() => {
    return posts.filter((post) => {
      const keyword = search.trim().toLowerCase();
      const matchesSearch =
        !keyword ||
        post.title.toLowerCase().includes(keyword) ||
        post.slug.toLowerCase().includes(keyword) ||
        (post.author_name || '').toLowerCase().includes(keyword) ||
        (post.category || '').toLowerCase().includes(keyword) ||
        (post.tags || []).some((tag) => tag.toLowerCase().includes(keyword));

      const matchesStatus = statusFilter === 'all' || post.status === statusFilter;
      const matchesEnabled =
        enabledFilter === 'all' ||
        (enabledFilter === 'enabled' ? post.is_enabled : !post.is_enabled);
      const matchesFeatured =
        featuredFilter === 'all' ||
        (featuredFilter === 'featured' ? post.is_featured : !post.is_featured);

      return matchesSearch && matchesStatus && matchesEnabled && matchesFeatured;
    });
  }, [enabledFilter, featuredFilter, posts, search, statusFilter]);

  const selectedPost = posts.find((post) => post.id === activeId) || null;

  function hydrateForm(post: BlogPostListItem) {
    setForm({
      title: post.title,
      slug: post.slug,
      content_html: post.content_html || '',
      content_type: 'blog',
      excerpt: post.excerpt || '',
      cover_image_url: post.cover_image_url || '',
      cover_image_alt: post.cover_image_alt || '',
      author_name: post.author_name || '',
      category: post.category || '',
      tags: post.tags || [],
      is_featured: post.is_featured,
      status: post.status,
      is_enabled: post.is_enabled,
      show_in_header: false,
      show_in_footer: false,
      navigation_label: '',
      sort_order: 0,
      allow_delete: true,
      published_at: post.published_at || '',
      reading_time_minutes: post.reading_time_minutes || null,
      seo_title: post.seo_title || '',
      seo_description: post.seo_description || '',
      seo_keywords: post.seo_keywords || '',
      seo_image_url: post.seo_image_url || '',
      og_title: post.og_title || '',
      og_description: post.og_description || '',
      twitter_title: post.twitter_title || '',
      twitter_description: post.twitter_description || '',
      twitter_image_url: post.twitter_image_url || '',
      canonical_url_override: post.canonical_url_override || '',
      robots_index: post.robots_index ?? true,
      robots_follow: post.robots_follow ?? true,
    });
    setTagInput((post.tags || []).join(', '));
    setCoverImageFile(null);
    setCoverUploadError(null);
    setCoverUploadProgress(0);
    setLocalizedImageStates(buildEmptyLocalizedImageStates());
    setTranslationStatuses([]);
    setTranslationSourceHash(String((post as any).en_source_version_hash || ''));
  }

  async function loadLocalizedImages(postId: string) {
    try {
      const res = await fetch(`/api/admin/cms/blog-posts/${postId}/localized-images`);
      if (!res.ok) {
        return;
      }
      const json = await res.json();
      const incoming = (json?.localized_images || {}) as Partial<
        Record<SupportedLanguage, { cover_image_url?: string; seo_image_url?: string; twitter_image_url?: string }>
      >;
      setLocalizedImageStates((current) => {
        const next = { ...current };
        for (const lang of CONTENT_TRANSLATION_ENABLED_LANGS) {
          const entry = incoming[lang];
          next[lang] = {
            selectedFile: null,
            uploadProgress: 0,
            uploadError: null,
            cover_image_url: String(entry?.cover_image_url || '').trim(),
            seo_image_url: String(entry?.seo_image_url || '').trim(),
            twitter_image_url: String(entry?.twitter_image_url || '').trim(),
          };
        }
        return next;
      });
    } catch {
    }
  }

  async function removeLocalizedImageOverride(lang: SupportedLanguage) {
    if (!activeId) return;
    try {
      const res = await fetch(
        `/api/admin/cms/blog-posts/${activeId}/localized-images?lang=${encodeURIComponent(lang)}`,
        { method: 'DELETE' }
      );
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json?.error || 'Failed to remove override.');
      }
      setLocalizedImageStates((current) => ({
        ...current,
        [lang]: {
          selectedFile: null,
          uploadProgress: 0,
          uploadError: null,
          cover_image_url: '',
          seo_image_url: '',
          twitter_image_url: '',
        },
      }));
      toast.success(tp('adminBlog.toasts.localizedOverrideRemoved', 'Localized image override removed.', { lng: lang }));
    } catch (error: any) {
      toast.error(error?.message || tp('adminBlog.errors.localizedOverrideRemove', 'Failed to remove override.'));
    }
  }

  function startNewPost() {
    setIsNewPost(true);
    setActiveId(null);
    setForm(EMPTY_FORM);
    setTagInput('');
    setCoverImageFile(null);
    setCoverUploadError(null);
    setCoverUploadProgress(0);
    setLocalizedImageStates(buildEmptyLocalizedImageStates());
    setTranslationStatuses([]);
    setTranslationSourceHash('');
    setWorkQueue([]);
    setProcessingProgress({ completed: 0, total: 0 });
    setStopProcessing(false);
    stopProcessingRef.current = false;
  }

  function selectPost(post: BlogPostListItem) {
    setIsNewPost(false);
    setActiveId(post.id);
    hydrateForm(post);
    setWorkQueue([]);
    setProcessingProgress({ completed: 0, total: 0 });
    setStopProcessing(false);
    stopProcessingRef.current = false;
  }

  async function loadBlogTranslationStatus(postId: string) {
    try {
      const res = await fetch(`/api/admin/cms/blog-posts/${postId}/translation-status`);
      if (res.ok) {
        const json = await res.json();
        if (Array.isArray(json?.statuses)) {
          setTranslationStatuses(json.statuses);
        }
        if (json?.sourceHash) {
          setTranslationSourceHash(json.sourceHash);
        }
      }
    } catch {
    }
  }

  async function processWorkQueue(initialQueue: WorkItem[]) {
    if (initialQueue.length === 0) return;

    setStopProcessing(false);
    stopProcessingRef.current = false;
    setIsProcessingLoopRunning(true);
    setProcessingProgress({ completed: 0, total: initialQueue.length });
    let currentQueue = [...initialQueue];
    let completedCount = 0;
    let consecutiveFailures = 0;

    while (!stopProcessingRef.current && currentQueue.length > 0) {
      const item = currentQueue[0];

      setTranslationStatuses((prev) =>
        prev.map((s) =>
          s.language === item.language
            ? { ...s, status: 'pending', errorMessage: undefined }
            : s
        )
      );

      try {
        const res = await fetch('/api/admin/content/auto-translate/process-next', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ item }),
        });
        const json = await res.json();
        const completedItem = json?.completedItem;

        if (completedItem) {
          if (!completedItem.success) {
            consecutiveFailures += 1;
            toast.warning(
              tp(
                'adminBlog.toasts.translationFailedPerLang',
                '{{language}} translation failed: {{message}}',
                {
                  language: completedItem.language.toUpperCase(),
                  message: completedItem.errorMessage || 'Unknown error',
                }
              )
            );
            setTranslationStatuses((prev) =>
              prev.map((s) =>
                s.language === completedItem.language
                  ? { ...s, status: 'failed', errorMessage: completedItem.errorMessage }
                  : s
              )
            );
            if (consecutiveFailures >= 3) {
              stopProcessingRef.current = true;
              setStopProcessing(true);
              setIsProcessingLoopRunning(false);
              toast.error(
                tp(
                  'adminBlog.toasts.circuitBreakerStop',
                  'Processing stopped after 3 consecutive translation failures. Check logs and retry manually when ready.'
                )
              );
              break;
            }
          } else {
            consecutiveFailures = 0;
            setTranslationStatuses((prev) =>
              prev.map((s) =>
                s.language === completedItem.language
                  ? { ...s, status: 'current', sourceHashMatch: true, errorMessage: undefined }
                  : s
              )
            );
          }
        } else {
          consecutiveFailures += 1;
          if (consecutiveFailures >= 3) {
            stopProcessingRef.current = true;
            setStopProcessing(true);
            setIsProcessingLoopRunning(false);
            toast.error(
              tp(
                'adminBlog.toasts.circuitBreakerStop',
                'Processing stopped after 3 consecutive translation failures. Check logs and retry manually when ready.'
              )
            );
            break;
          }
        }

        currentQueue = currentQueue.slice(1);
        setWorkQueue(currentQueue);
        completedCount += 1;
        setProcessingProgress({ completed: completedCount, total: initialQueue.length });

        if (completedCount % 2 === 0 && activeId) {
          await loadBlogTranslationStatus(activeId);
        }
      } catch (error: any) {
        consecutiveFailures += 1;
        toast.warning(
          tp(
            'adminBlog.toasts.translationFailedPerLang',
            '{{language}} translation failed: {{message}}',
            {
              language: item.language.toUpperCase(),
              message: error?.message || 'Unknown error',
            }
          )
        );
        currentQueue = currentQueue.slice(1);
        setWorkQueue(currentQueue);
        completedCount += 1;
        setProcessingProgress({ completed: completedCount, total: initialQueue.length });
        if (consecutiveFailures >= 3) {
          stopProcessingRef.current = true;
          setStopProcessing(true);
          setIsProcessingLoopRunning(false);
          toast.error(
            tp(
              'adminBlog.toasts.circuitBreakerStop',
              'Processing stopped after 3 consecutive translation failures. Check logs and retry manually when ready.'
            )
          );
          break;
        }
      }
    }

    if (activeId) {
      await loadBlogTranslationStatus(activeId);
    }
    setIsProcessingLoopRunning(false);
    setWorkQueue([]);
  }

  const handleFieldChange = <K extends keyof CmsBlogAdminInput>(key: K, value: CmsBlogAdminInput[K]) => {
    setForm((current) => ({
      ...current,
      [key]:
        key === 'slug'
          ? slugifyCmsPageSlug(String(value))
          : key === 'tags'
            ? normalizeTagList(value as string[] | string)
            : value,
    }));
  };

  const handleTitleChange = (title: string) => {
    setForm((current) => ({
      ...current,
      title,
      slug: current.slug ? current.slug : slugifyCmsPageSlug(title),
    }));
  };

  const liveReadingTime = useMemo(
    () => deriveReadingTimeMinutes(form.content_html, form.reading_time_minutes),
    [form.content_html, form.reading_time_minutes]
  );

  async function maybeUploadCoverImage() {
    if (!coverImageFile) {
      return {
        coverImageUrl: form.cover_image_url,
        seoImageUrl: form.seo_image_url,
        twitterImageUrl: form.twitter_image_url,
      };
    }

    try {
      setCoverUploadError(null);
      isSupportedUploadFile({
        file: coverImageFile,
        allowedMimeTypes: COVER_IMAGE_UPLOAD.allowedMimeTypes,
        allowedExtensions: COVER_IMAGE_UPLOAD.allowedExtensions,
        maxSizeBytes: COVER_IMAGE_UPLOAD.maxSizeBytes,
      });

      const result = await uploadPublicMedia({
        file: coverImageFile,
        folder: 'blog',
        filePrefix: form.slug || 'blog-cover',
        maxSizeBytes: COVER_IMAGE_UPLOAD.maxSizeBytes,
        allowedMimeTypes: COVER_IMAGE_UPLOAD.allowedMimeTypes,
        allowedExtensions: COVER_IMAGE_UPLOAD.allowedExtensions,
        onProgress: setCoverUploadProgress,
      });

      return {
        coverImageUrl: result.publicUrl,
        seoImageUrl: form.seo_image_url || result.publicUrl,
        twitterImageUrl: form.twitter_image_url || result.publicUrl,
      };
    } catch (error: any) {
      const message = error?.message || tp('adminBlog.errors.coverUpload', 'Failed to upload the cover image.');
      setCoverUploadError(message);
      throw new Error(message);
    }
  }

  async function maybeUploadLocalizedCoverImages(): Promise<
    Partial<Record<SupportedLanguage, { cover_image_url: string; seo_image_url: string; twitter_image_url: string }>>
  > {
    const result: Partial<
      Record<SupportedLanguage, { cover_image_url: string; seo_image_url: string; twitter_image_url: string }>
    > = {};

    for (const lang of CONTENT_TRANSLATION_ENABLED_LANGS) {
      const state = localizedImageStates[lang];
      const file = state.selectedFile;

      let coverUrl = state.cover_image_url;

      if (file) {
        try {
          setLocalizedImageStates((current) => ({
            ...current,
            [lang]: { ...current[lang], uploadError: null, uploadProgress: 0 },
          }));
          isSupportedUploadFile({
            file,
            allowedMimeTypes: COVER_IMAGE_UPLOAD.allowedMimeTypes,
            allowedExtensions: COVER_IMAGE_UPLOAD.allowedExtensions,
            maxSizeBytes: COVER_IMAGE_UPLOAD.maxSizeBytes,
          });

          const uploadResult = await uploadPublicMedia({
            file,
            folder: 'blog',
            filePrefix: `${form.slug || 'blog-cover'}-${lang}`,
            maxSizeBytes: COVER_IMAGE_UPLOAD.maxSizeBytes,
            allowedMimeTypes: COVER_IMAGE_UPLOAD.allowedMimeTypes,
            allowedExtensions: COVER_IMAGE_UPLOAD.allowedExtensions,
            onProgress: (progress) => {
              setLocalizedImageStates((current) => ({
                ...current,
                [lang]: { ...current[lang], uploadProgress: progress },
              }));
            },
          });
          coverUrl = uploadResult.publicUrl;
        } catch (error: any) {
          const message =
            error?.message ||
            tp('adminBlog.errors.localizedCoverUpload', 'Failed to upload the {{language}} cover image.', {
              language: lang.toUpperCase(),
            });
          setLocalizedImageStates((current) => ({
            ...current,
            [lang]: { ...current[lang], uploadError: message },
          }));
          throw new Error(message);
        }
      }

      const seoUrl = state.seo_image_url;
      const twitterUrl = state.twitter_image_url;
      const hasAny = coverUrl.trim() || seoUrl.trim() || twitterUrl.trim();
      if (hasAny) {
        result[lang] = {
          cover_image_url: coverUrl.trim(),
          seo_image_url: seoUrl.trim(),
          twitter_image_url: twitterUrl.trim(),
        };
      }
    }

    return result;
  }

  async function savePost(regenerateTranslations = false) {
    setIsSaving(true);
    if (regenerateTranslations) setIsRegeneratingTranslations(true);

    try {
      const uploadedImages = await maybeUploadCoverImage();
      const localizedImagesUploaded = await maybeUploadLocalizedCoverImages();
      const payload: CmsBlogAdminInput = {
        ...form,
        content_type: 'blog',
        tags: normalizeTagList(tagInput),
        reading_time_minutes: liveReadingTime,
        cover_image_url: uploadedImages.coverImageUrl,
        seo_image_url: uploadedImages.seoImageUrl,
        twitter_image_url: uploadedImages.twitterImageUrl,
      };

      const endpoint = isNewPost ? '/api/admin/cms/blog-posts' : `/api/admin/cms/blog-posts/${activeId}`;
      const method = isNewPost ? 'POST' : 'PATCH';
      const body: any = { ...payload };
      body.localized_images = localizedImagesUploaded;
      if (regenerateTranslations && !isNewPost) {
        body.regenerate_translations = true;
      }
      const res = await fetch(endpoint, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();

      if (!res.ok) {
        throw new Error(json?.error || tp('adminBlog.errors.save', 'Failed to save the blog post.'));
      }

      setTranslationSourceHash(json?.translation?.sourceHash || '');
      setTranslationStatuses(Array.isArray(json?.translation?.statuses) ? json.translation.statuses : []);
      const hasFailed = (json?.translation?.perLanguage || []).some((p: any) => p.status === 'failed');
      if (hasFailed) {
        const failedLangs = ((json.translation.perLanguage || []) as any[])
          .filter((p) => p.status === 'failed')
          .map((p) => p.language)
          .join(', ');
        toast.warning(
          tp(
            'adminBlog.toasts.savedWithFailedTranslations',
            'Saved. Translations failed for: {{languages}}.',
            { languages: failedLangs }
          )
        );
      } else if (regenerateTranslations) {
        toast.success(tp('adminBlog.toasts.regenerated', 'Translations regenerated.'));
      } else {
        toast.success(
          isNewPost
            ? tp('adminBlog.toasts.created', 'Blog post created.')
            : tp('adminBlog.toasts.updated', 'Blog post updated.')
        );
      }
      const nextId = json?.post?.id || activeId;
      await loadPosts(nextId);
      setIsNewPost(false);
      setCoverImageFile(null);
      setCoverUploadProgress(0);
      setLocalizedImageStates((current) => {
        const next = { ...current };
        for (const lang of CONTENT_TRANSLATION_ENABLED_LANGS) {
          next[lang] = { ...next[lang], selectedFile: null, uploadProgress: 0, uploadError: null };
        }
        return next;
      });

      const pendingWork = json?.translation?.pendingWork === true;
      const scheduledLanguages = Array.isArray(json?.translation?.scheduledLanguages)
        ? json.translation.scheduledLanguages
        : [];
      if ((pendingWork || scheduledLanguages.length > 0) && nextId) {
        const langsToProcess =
          scheduledLanguages.length > 0
            ? scheduledLanguages
            : CONTENT_TRANSLATION_ENABLED_LANGS.filter((l) =>
                (json?.translation?.statuses || []).some(
                  (s: any) => s.language === l && (s.status === 'pending' || s.status === 'missing' || s.status === 'outdated')
                )
              );
        const queue: WorkItem[] = langsToProcess.map((L: string) => ({
          type: 'blog',
          id: nextId,
          language: L,
        }));
        if (queue.length > 0) {
          void processWorkQueue(queue);
        }
      }
    } catch (error: any) {
      toast.error(error?.message || tp('adminBlog.errors.save', 'Failed to save the blog post.'));
    } finally {
      setIsSaving(false);
      setIsRegeneratingTranslations(false);
    }
  }

  async function runBackfillStageB(scope: 'all' | 'blog' | 'faq', pendingWork: any[]): Promise<void> {
    let localPending = [...pendingWork];
    let consecutiveFailures = 0;

    while (!stopBackfillRef.current && localPending.length > 0) {
      const item = localPending.shift()!;

      setBackfillDialog((prev) => ({
        ...prev,
        pendingTranslations: localPending.length,
        pendingWork: localPending,
      }));

      try {
        const res = await fetch('/api/admin/content/auto-translate/process-next', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ item }),
        });
        const json = await res.json();
        const completedItem = json?.completedItem;

        if (completedItem && completedItem.success) {
          consecutiveFailures = 0;
          setBackfillDialog((prev) => ({
            ...prev,
            completedTranslations: prev.completedTranslations + 1,
          }));
        } else {
          consecutiveFailures += 1;
          setBackfillDialog((prev) => ({
            ...prev,
            failedTranslations: prev.failedTranslations + 1,
            failures: [...prev.failures, item],
            failedWorkSet: [...prev.failedWorkSet, item],
          }));
          if (completedItem?.errorMessage) {
            toast.warning(
              tp(
                'adminBlog.toasts.translationFailedPerLang',
                '{{language}} translation failed: {{message}}',
                {
                  language: completedItem.language?.toUpperCase() || '?',
                  message: completedItem.errorMessage || 'Unknown error',
                }
              )
            );
          }
          if (consecutiveFailures >= 3) {
            stopBackfillRef.current = true;
            setBackfillDialog((prev) => ({
              ...prev,
              stopBackfill: true,
              isStopped: true,
              pendingTranslations: localPending.length,
              pendingWork: localPending,
            }));
            toast.error(
              tp(
                'adminBlog.toasts.circuitBreakerStop',
                'Processing stopped after 3 consecutive translation failures. Check logs and retry manually when ready.'
              )
            );
            break;
          }
        }
      } catch (e: any) {
        consecutiveFailures += 1;
        setBackfillDialog((prev) => ({
          ...prev,
          failedTranslations: prev.failedTranslations + 1,
          failures: [...prev.failures, item],
          failedWorkSet: [...prev.failedWorkSet, item],
        }));
        if (consecutiveFailures >= 3) {
          stopBackfillRef.current = true;
          setBackfillDialog((prev) => ({
            ...prev,
            stopBackfill: true,
            isStopped: true,
            pendingTranslations: localPending.length,
            pendingWork: localPending,
          }));
          toast.error(
            tp(
              'adminBlog.toasts.circuitBreakerStop',
              'Processing stopped after 3 consecutive translation failures. Check logs and retry manually when ready.'
            )
          );
          break;
        }
      }
    }
  }

  async function runBackfillLoop(scope: 'all' | 'blog' | 'faq') {
    setBackfillDialog((prev) => ({ ...prev, stopBackfill: false, isStopped: false }));
    stopBackfillRef.current = false;
    let cursor = backfillDialog.nextCursor;
    let completedScanCount = backfillDialog.completedScanCount;
    let nextCursor = cursor;

    while (!stopBackfillRef.current) {
      if (stopBackfillRef.current) break;

      try {
        const res = await fetch('/api/admin/content/auto-translate/backfill', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            scope,
            cursor: nextCursor,
            batchSize: 5,
          }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error || tp('adminBlog.errors.backfill', 'Backfill failed.'));

        completedScanCount += json?.completedScanCount || 0;
        nextCursor = json?.nextCursor || {};
        const totalRemaining = json?.totalRemainingEstimate || 0;
        const failures = json?.failures || [];
        const scheduledWorkItems = json?.scheduledWorkItems || [];
        const failedWorkFromStage = [...scheduledWorkItems];

        setBackfillDialog((prev) => ({
          ...prev,
          completedScanCount,
          totalScannedEstimate: completedScanCount + totalRemaining,
          pendingTranslations: failedWorkFromStage.length,
          failures: [...prev.failures, ...failures],
          pendingWork: failedWorkFromStage,
          nextCursor: nextCursor || null,
        }));

        await runBackfillStageB(scope, failedWorkFromStage);

        const hasMore =
          nextCursor &&
          (nextCursor.blogCursor || nextCursor.faqCategoryCursor || nextCursor.faqItemCursor);

        if (!hasMore) {
          break;
        }
      } catch (e: any) {
        toast.error(e?.message || tp('adminBlog.errors.backfill', 'Backfill failed.'));
        break;
      }
    }

    const stopped = stopBackfillRef.current;
    if (stopped) {
      setBackfillDialog((prev) => ({
        ...prev,
        stopBackfill: true,
        isStopped: true,
        pendingTranslations: 0,
        pendingWork: [],
      }));
      toast.info(tp('adminBlog.toasts.backfillStopped', 'Backfill stopped by user.'));
    } else {
      if (backfillDialog.failedWorkSet.length === 0) {
        setBackfillDialog((prev) => ({
          ...prev,
          open: false,
          nextCursor: null,
          stopBackfill: false,
          isStopped: false,
        }));
        setIsBackfilling(false);
        toast.success(tp('adminBlog.toasts.backfillDone', 'Backfill finished. Existing translations preserved.'));
      } else {
        setBackfillDialog((prev) => ({
          ...prev,
          stopBackfill: true,
          isStopped: true,
          pendingTranslations: 0,
          pendingWork: [],
        }));
        toast.info(tp('adminBlog.toasts.backfillDoneWithFailures', 'Backfill scan complete. Some translations failed. Use Retry to retry them.'));
      }
    }
    if (activeId) await loadPosts(activeId);
  }

  async function resumeBackfill() {
    const scope = backfillDialog.scope;

    if (backfillDialog.failedWorkSet.length > 0) {
      await retryBackfillFailures();
      return;
    }

    setBackfillDialog((prev) => ({
      ...prev,
      stopBackfill: false,
      isStopped: false,
    }));
    stopBackfillRef.current = false;
    void runBackfillLoop(scope);
  }

  async function retryBackfillFailures() {
    const scope = backfillDialog.scope;
    const snapshot = [...backfillDialog.failedWorkSet];

    if (snapshot.length === 0) return;

    setBackfillDialog((prev) => ({
      ...prev,
      stopBackfill: false,
      isStopped: false,
      failedWorkSet: [],
      failedTranslations: 0,
      pendingTranslations: snapshot.length,
      pendingWork: snapshot,
    }));
    stopBackfillRef.current = false;

    let todo = [...snapshot];
    let stillFailed = [] as typeof snapshot;
    while (!stopBackfillRef.current && todo.length > 0) {
      const item = todo.shift()!;

      setBackfillDialog((prev) => ({
        ...prev,
        pendingTranslations: todo.length,
        pendingWork: todo,
      }));

      let success = false;
      try {
        const res = await fetch('/api/admin/content/auto-translate/process-next', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ item }),
        });
        const json = await res.json();
        const completedItem = json?.completedItem;
        success = Boolean(completedItem && completedItem.success);
      } catch {}

      if (success) {
        setBackfillDialog((prev) => ({
          ...prev,
          completedTranslations: prev.completedTranslations + 1,
        }));
      } else {
        stillFailed.push(item);
        setBackfillDialog((prev) => ({
          ...prev,
          failedTranslations: prev.failedTranslations + 1,
        }));
      }
    }

    if (stillFailed.length > 0) {
      setBackfillDialog((prev) => ({
        ...prev,
        failedWorkSet: stillFailed,
      }));
    }

    if (stopBackfillRef.current) {
      setBackfillDialog((prev) => ({
        ...prev,
        isStopped: true,
        stopBackfill: true,
        pendingWork: [],
        pendingTranslations: 0,
      }));
      toast.info(tp('adminBlog.toasts.backfillStopped', 'Backfill stopped by user.'));
    } else {
      if (stillFailed.length === 0) {
        setBackfillDialog((prev) => ({
          ...prev,
          stopBackfill: false,
          isStopped: false,
        }));
        stopBackfillRef.current = false;
        void runBackfillLoop(scope);
      } else {
        setBackfillDialog((prev) => ({
          ...prev,
          isStopped: true,
          stopBackfill: true,
          pendingWork: [],
          pendingTranslations: 0,
        }));
        toast.info(tp('adminBlog.toasts.retryPassComplete', 'Retry pass complete. Some items still failed; retry again when ready.'));
      }
    }
  }

  async function runBackfill(scope: 'all' | 'blog' | 'faq' = 'blog') {
    setBackfillDialog({
      open: true,
      scope,
      completedScanCount: 0,
      totalScannedEstimate: 0,
      completedTranslations: 0,
      pendingTranslations: 0,
      failedTranslations: 0,
      failures: [],
      failedWorkSet: [],
      pendingWork: [],
      nextCursor: null,
      stopBackfill: false,
      isStopped: false,
    });
    setIsBackfilling(true);
    void runBackfillLoop(scope);
  }

  async function patchPost(post: BlogPostListItem, payload: Partial<CmsBlogAdminInput>, successMessage: string) {
    try {
      const res = await fetch(`/api/admin/cms/blog-posts/${post.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          ...post,
          content_type: 'blog',
          excerpt: post.excerpt || '',
          cover_image_url: post.cover_image_url || '',
          cover_image_alt: post.cover_image_alt || '',
          author_name: post.author_name || '',
          category: post.category || '',
          tags: post.tags || [],
          is_featured: post.is_featured,
          seo_title: post.seo_title || '',
          seo_description: post.seo_description || '',
          seo_keywords: post.seo_keywords || '',
          seo_image_url: post.seo_image_url || '',
          og_title: post.og_title || '',
          og_description: post.og_description || '',
          twitter_title: post.twitter_title || '',
          twitter_description: post.twitter_description || '',
          twitter_image_url: post.twitter_image_url || '',
          canonical_url_override: post.canonical_url_override || '',
          robots_index: post.robots_index ?? true,
          robots_follow: post.robots_follow ?? true,
          show_in_header: false,
          show_in_footer: false,
          navigation_label: '',
          sort_order: 0,
          allow_delete: true,
          ...payload,
        }),
      });
      const json = await res.json();

      if (!res.ok) {
        throw new Error(json?.error || tp('adminBlog.errors.update', 'Failed to update the blog post.'));
      }

      toast.success(successMessage);
      await loadPosts(post.id);
    } catch (error: any) {
      toast.error(error?.message || tp('adminBlog.errors.update', 'Failed to update the blog post.'));
    }
  }

  async function deletePost(post: BlogPostListItem) {
    if (!window.confirm(tp('adminBlog.actions.confirmDelete', 'Delete "{{title}}"? This cannot be undone.', {
      title: post.title,
    }))) {
      return;
    }

    try {
      const res = await fetch(`/api/admin/cms/blog-posts/${post.id}`, {
        method: 'DELETE',
      });
      const json = await res.json();

      if (!res.ok) {
        throw new Error(json?.error || tp('adminBlog.errors.delete', 'Failed to delete the blog post.'));
      }

      toast.success(tp('adminBlog.toasts.deleted', 'Blog post deleted.'));
      await loadPosts();
    } catch (error: any) {
      toast.error(error?.message || tp('adminBlog.errors.delete', 'Failed to delete the blog post.'));
    }
  }

  const slugPreview = `/blog/${form.slug || 'your-post-slug'}`;
  const seoTitlePreview = form.seo_title || form.title || tp('adminBlog.preview.untitled', 'Untitled blog post');
  const seoDescriptionPreview =
    form.seo_description ||
    form.excerpt ||
    tp('adminBlog.preview.descriptionFallback', 'Write a clear summary that helps readers and search engines understand the post.');
  const normalizedTags = useMemo(() => normalizeTagList(tagInput), [tagInput]);
  const locale = i18n.resolvedLanguage || i18n.language || 'en';
  const previewDateLabel = formatAdminDate(form.published_at || null, locale);
  const postCountLabel = tp('adminBlog.sidebar.postCount', '{{count}} posts', { count: filteredPosts.length });

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[360px_minmax(0,1fr)] 2xl:grid-cols-[380px_minmax(0,1fr)]">
      <div className="space-y-4 xl:sticky xl:top-6 xl:self-start">
        <div className="card-elevated space-y-4 p-4 sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-700 text-foreground">
                {tp('adminBlog.sidebar.title', 'Blog Management')}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {tp('adminBlog.sidebar.description', 'Create and manage blog posts for your public website.')}
              </p>
            </div>
            <button type="button" onClick={startNewPost} className="btn-primary whitespace-nowrap py-2 text-xs">
              <FilePlus2 size={14} />
              {tp('adminBlog.actions.add', 'New Post')}
            </button>
          </div>

          <div className="rounded-2xl border border-border bg-muted/30 px-3 py-3 text-xs text-muted-foreground">
            <span className="font-700 text-foreground">{postCountLabel}</span>
            <span className="mx-2 text-border">•</span>
            {tp('adminBlog.sidebar.listHint', 'Filter by status, visibility, or featured placement.')}
          </div>

          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={tp('adminBlog.filters.searchPlaceholder', 'Search title, slug, author, category, or tag...')}
              className="input-base pl-9"
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label className="mb-1.5 block text-xs font-700 uppercase tracking-[0.16em] text-muted-foreground">
                {tp('adminBlog.filters.statusLabel', 'Status')}
              </label>
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}
                className="input-base text-sm"
              >
                <option value="all">{tp('adminBlog.filters.allStatuses', 'All statuses')}</option>
                <option value="published">{tp('adminBlog.status.published', 'Published')}</option>
                <option value="draft">{tp('adminBlog.status.draft', 'Draft')}</option>
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-700 uppercase tracking-[0.16em] text-muted-foreground">
                {tp('adminBlog.filters.visibilityLabel', 'Visibility')}
              </label>
              <select
                value={enabledFilter}
                onChange={(event) => setEnabledFilter(event.target.value as typeof enabledFilter)}
                className="input-base text-sm"
              >
                <option value="all">{tp('adminBlog.filters.allVisibility', 'All visibility')}</option>
                <option value="enabled">{tp('adminBlog.status.enabled', 'Enabled')}</option>
                <option value="disabled">{tp('adminBlog.status.disabled', 'Disabled')}</option>
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-700 uppercase tracking-[0.16em] text-muted-foreground">
                {tp('adminBlog.filters.featuredLabel', 'Featured')}
              </label>
              <select
                value={featuredFilter}
                onChange={(event) => setFeaturedFilter(event.target.value as typeof featuredFilter)}
                className="input-base text-sm"
              >
                <option value="all">{tp('adminBlog.filters.allFeatured', 'All featured states')}</option>
                <option value="featured">{tp('adminBlog.status.featured', 'Featured')}</option>
                <option value="standard">{tp('adminBlog.status.standard', 'Standard')}</option>
              </select>
            </div>
          </div>
        </div>

        <div className="card-elevated space-y-3 p-3">
          <div className="flex items-center justify-between px-1 pt-1">
            <div>
              <h3 className="text-sm font-700 text-foreground">
                {tp('adminBlog.sidebar.listTitle', 'Posts')}
              </h3>
              <p className="text-xs text-muted-foreground">
                {tp('adminBlog.sidebar.listDescription', 'Select a post to edit its content, publishing settings, and SEO.')}
              </p>
            </div>
          </div>
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 size={22} className="animate-spin text-accent" />
            </div>
          ) : filteredPosts.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-muted/20 px-4 py-12 text-center">
              <p className="text-sm font-700 text-foreground">{tp('adminBlog.empty.title', 'No blog posts found')}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {tp('adminBlog.empty.description', 'Adjust the filters or create your first blog post.')}
              </p>
              <button type="button" onClick={startNewPost} className="btn-secondary mt-4 py-2 text-xs">
                <FilePlus2 size={14} />
                {tp('adminBlog.empty.action', 'Create Post')}
              </button>
            </div>
          ) : (
            filteredPosts.map((post) => (
              <button
                key={post.id}
                type="button"
                onClick={() => selectPost(post)}
                className={`w-full rounded-2xl border p-4 text-left transition-colors ${
                  activeId === post.id && !isNewPost
                    ? 'border-accent bg-accent/5'
                    : 'border-border hover:border-accent/40'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <p className="truncate text-sm font-700 text-foreground">{post.title}</p>
                    <p className="truncate text-xs text-muted-foreground">{`/blog/${post.slug}`}</p>
                    {post.category || formatAdminDate(post.published_at || post.updated_at, locale) ? (
                      <p className="truncate text-[11px] text-muted-foreground">
                        {[post.category, formatAdminDate(post.published_at || post.updated_at, locale)]
                          .filter(Boolean)
                          .join(' • ')}
                      </p>
                    ) : null}
                  </div>
                  <span className={`rounded-full px-2 py-1 text-[10px] font-700 uppercase ${
                    post.status === 'published' ? 'bg-positive-soft text-positive' : 'bg-warning/10 text-warning'
                  }`}>
                    {post.status === 'published'
                      ? tp('adminBlog.status.published', 'Published')
                      : tp('adminBlog.status.draft', 'Draft')}
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                  <span className={`rounded-full px-2 py-0.5 ${post.is_enabled ? 'bg-info-soft text-info' : 'bg-muted text-muted-foreground'}`}>
                    {post.is_enabled
                      ? tp('adminBlog.status.enabled', 'Enabled')
                      : tp('adminBlog.status.disabled', 'Disabled')}
                  </span>
                  {post.is_featured ? (
                    <span className="rounded-full bg-warning/10 px-2 py-0.5 text-warning">
                      {tp('adminBlog.status.featured', 'Featured')}
                    </span>
                  ) : null}
                  {post.category ? <span className="rounded-full bg-muted px-2 py-0.5">{post.category}</span> : null}
                  {formatAdminDate(post.published_at || post.updated_at, locale) ? (
                    <span className="rounded-full bg-muted px-2 py-0.5">
                      {formatAdminDate(post.published_at || post.updated_at, locale)}
                    </span>
                  ) : null}
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      <div className={showPreview ? 'grid grid-cols-1 gap-6 2xl:grid-cols-[minmax(0,1fr)_340px]' : 'space-y-6'}>
        <div className="space-y-6">
          <div className="card-elevated space-y-5 p-5 sm:p-6">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-lg font-700 text-foreground">
                {isNewPost
                  ? tp('adminBlog.editor.createTitle', 'Create Blog Post')
                  : tp('adminBlog.editor.editTitle', 'Edit Blog Post')}
              </h2>
              <p className="text-sm text-muted-foreground">
                {tp('adminBlog.editor.description', 'Organize the post details, publishing settings, content, and metadata in one place.')}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {!isNewPost && selectedPost ? (
                <>
                  <button
                    type="button"
                    onClick={() =>
                      patchPost(
                        selectedPost,
                        { status: selectedPost.status === 'published' ? 'draft' : 'published' },
                        selectedPost.status === 'published'
                          ? tp('adminBlog.toasts.unpublished', 'Blog post moved to draft.')
                          : tp('adminBlog.toasts.published', 'Blog post published.')
                      )
                    }
                    className="btn-secondary py-2 text-xs"
                  >
                    {selectedPost.status === 'published'
                      ? tp('adminBlog.actions.unpublish', 'Unpublish')
                      : tp('adminBlog.actions.publish', 'Publish')}
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      patchPost(
                        selectedPost,
                        { is_enabled: !selectedPost.is_enabled },
                        selectedPost.is_enabled
                          ? tp('adminBlog.toasts.disabled', 'Blog post disabled.')
                          : tp('adminBlog.toasts.enabled', 'Blog post enabled.')
                      )
                    }
                    className="btn-secondary py-2 text-xs"
                  >
                    {selectedPost.is_enabled
                      ? tp('adminBlog.actions.disable', 'Disable')
                      : tp('adminBlog.actions.enable', 'Enable')}
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      patchPost(
                        selectedPost,
                        { is_featured: !selectedPost.is_featured },
                        selectedPost.is_featured
                          ? tp('adminBlog.toasts.unfeatured', 'Blog post removed from featured.')
                          : tp('adminBlog.toasts.featured', 'Blog post featured on the homepage.')
                      )
                    }
                    className="btn-secondary py-2 text-xs"
                  >
                    <Sparkles size={14} />
                    {selectedPost.is_featured
                      ? tp('adminBlog.actions.unfeature', 'Unfeature')
                      : tp('adminBlog.actions.feature', 'Feature')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowPreview((current) => !current)}
                    className="btn-secondary py-2 text-xs"
                  >
                    <Eye size={14} />
                    {showPreview
                      ? tp('adminBlog.actions.hidePreview', 'Hide Preview')
                      : tp('adminBlog.actions.showPreview', 'Preview')}
                  </button>
                  <button
                    type="button"
                    onClick={() => deletePost(selectedPost)}
                    className="btn-secondary py-2 text-xs"
                  >
                    <Trash2 size={14} />
                    {tp('adminBlog.actions.delete', 'Delete')}
                  </button>
                </>
              ) : null}
              <button type="button" onClick={() => void savePost()} disabled={isSaving} className="btn-primary py-2 text-xs">
                {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Pencil size={14} />}
                {isNewPost
                  ? tp('adminBlog.actions.create', 'Create Post')
                  : tp('adminBlog.actions.save', 'Save Changes')}
              </button>
              {!isNewPost && activeId ? (
                <>
                  <button
                    type="button"
                    onClick={() => void savePost(true)}
                    disabled={isSaving}
                    className="btn-secondary py-2 text-xs"
                    title={tp('adminBlog.actions.regenerateHint', 'Regenerate all language translations from the latest English.')}
                  >
                    {isRegeneratingTranslations ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                    {tp('adminBlog.actions.regenerate', 'Regenerate translations')}
                  </button>
                </>
              ) : null}
              <button
                type="button"
                onClick={() => void runBackfill('blog')}
                disabled={isBackfilling || isSaving}
                className="btn-secondary py-2 text-xs"
                title={tp('adminBlog.actions.backfillHint', 'Controlled backfill: translates only missing/outdated blog entries; preserves English + existing current translations.')}
              >
                {isBackfilling ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                {tp('adminBlog.actions.backfill', 'Backfill Blog translations')}
              </button>
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
            {tp('adminBlog.notice', 'Create and manage blog posts for your public website. Save drafts, schedule publishing details, and review the preview before sharing.')}
          </div>
          </div>

          <BlogEditorSection
            title={tp('adminBlog.sections.basic.title', 'Basic Details')}
            description={tp('adminBlog.sections.basic.description', 'Set the core information readers and search engines will use to identify the post.')}
          >
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-sm font-600 text-foreground">{tp('adminBlog.fields.title', 'Title')}</label>
              <input
                value={form.title}
                onChange={(event) => handleTitleChange(event.target.value)}
                className="input-base"
                placeholder={tp('adminBlog.placeholders.title', 'How Smart Pocket helps you stay on top of spending')}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-600 text-foreground">{tp('adminBlog.fields.slug', 'Slug')}</label>
              <input
                value={form.slug}
                onChange={(event) => handleFieldChange('slug', event.target.value)}
                className="input-base font-mono"
                placeholder="smart-pocket-blog-post"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                {tp('adminBlog.fields.slugPreview', 'Public URL')}: {slugPreview}
              </p>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-600 text-foreground">{tp('adminBlog.fields.author', 'Author name')}</label>
              <input
                value={form.author_name}
                onChange={(event) => handleFieldChange('author_name', event.target.value)}
                className="input-base"
                placeholder={tp('adminBlog.placeholders.author', 'Smart Pocket Team')}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-600 text-foreground">{tp('adminBlog.fields.category', 'Category')}</label>
              <input
                value={form.category}
                onChange={(event) => handleFieldChange('category', event.target.value)}
                className="input-base"
                placeholder={tp('adminBlog.placeholders.category', 'Budgeting')}
              />
            </div>
            <div className="lg:col-span-2">
              <label className="mb-1.5 block text-sm font-600 text-foreground">{tp('adminBlog.fields.excerpt', 'Excerpt')}</label>
              <textarea
                rows={4}
                value={form.excerpt}
                onChange={(event) => handleFieldChange('excerpt', event.target.value)}
                className="input-base resize-none"
                placeholder={tp('adminBlog.placeholders.excerpt', 'Summarize the key point in one or two short paragraphs.')}
              />
            </div>
            <div className="lg:col-span-2">
              <label className="mb-1.5 block text-sm font-600 text-foreground">{tp('adminBlog.fields.tags', 'Tags / hashtags')}</label>
              <input
                value={tagInput}
                onChange={(event) => {
                  setTagInput(event.target.value);
                  handleFieldChange('tags', normalizeTagList(event.target.value));
                }}
                className="input-base"
                placeholder={tp('adminBlog.placeholders.tags', 'budgeting, receipts, money habits')}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                {tp('adminBlog.fields.tagsHint', 'Separate each tag with a comma.')}
              </p>
            </div>
            </div>
          </BlogEditorSection>

          <BlogEditorSection
            title={tp('adminBlog.sections.publishing.title', 'Publishing Settings')}
            description={tp('adminBlog.sections.publishing.description', 'Control visibility, homepage featuring, timing, and reading time from one grouped panel.')}
          >
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-sm font-600 text-foreground">{tp('adminBlog.fields.publishDate', 'Publish date')}</label>
              <div className="relative">
                <CalendarDays size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="datetime-local"
                  value={form.published_at ? form.published_at.slice(0, 16) : ''}
                  onChange={(event) => handleFieldChange('published_at', event.target.value ? new Date(event.target.value).toISOString() : '')}
                  className="input-base pl-10"
                />
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-600 text-foreground">{tp('adminBlog.fields.readingTime', 'Reading time (minutes)')}</label>
              <input
                type="number"
                min={1}
                value={form.reading_time_minutes || ''}
                onChange={(event) => handleFieldChange('reading_time_minutes', event.target.value ? Number(event.target.value) : null)}
                className="input-base"
                placeholder={String(liveReadingTime)}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                {tp('adminBlog.fields.readingTimeHint', 'Leave blank to derive it automatically from the content.')}
              </p>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 lg:col-span-2">
              <label className="flex items-start gap-3 rounded-2xl border border-border bg-muted/20 px-4 py-3 text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={form.is_enabled}
                  onChange={(event) => handleFieldChange('is_enabled', event.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-border accent-accent"
                />
                <span>
                  <span className="block font-700">{tp('adminBlog.fields.enabled', 'Enabled')}</span>
                  <span className="block text-xs text-muted-foreground">
                    {tp('adminBlog.fields.enabledHint', 'Visible to the public when the post is published.')}
                  </span>
                </span>
              </label>
              <label className="flex items-start gap-3 rounded-2xl border border-border bg-muted/20 px-4 py-3 text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={form.is_featured}
                  onChange={(event) => handleFieldChange('is_featured', event.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-border accent-accent"
                />
                <span>
                  <span className="block font-700">{tp('adminBlog.fields.featured', 'Featured on homepage')}</span>
                  <span className="block text-xs text-muted-foreground">
                    {tp('adminBlog.fields.featuredHint', 'Show this post in the featured blog section on the homepage.')}
                  </span>
                </span>
              </label>
              <label className="flex items-start gap-3 rounded-2xl border border-border bg-muted/20 px-4 py-3 text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={form.status === 'published'}
                  onChange={(event) => handleFieldChange('status', event.target.checked ? 'published' : 'draft')}
                  className="mt-0.5 h-4 w-4 rounded border-border accent-accent"
                />
                <span>
                  <span className="block font-700">{tp('adminBlog.fields.published', 'Published')}</span>
                  <span className="block text-xs text-muted-foreground">
                    {tp('adminBlog.fields.publishedHint', 'Draft posts stay hidden until you publish them.')}
                  </span>
                </span>
              </label>
            </div>
            </div>
          </BlogEditorSection>

          <BlogEditorSection
            title={tp('adminBlog.sections.cover.title', 'Cover Image')}
            description={tp('adminBlog.sections.cover.description', 'Upload or paste the main article image and keep the alt text nearby for accessibility.')}
          >
            <div className="space-y-4">
              <MediaUploadCard
                label={tp('adminBlog.fields.coverImage', 'Cover image')}
                value={form.cover_image_url}
                onValueChange={(value) => handleFieldChange('cover_image_url', value)}
                selectedFile={coverImageFile}
                onFileSelect={(file) => setCoverImageFile(file)}
                accept={COVER_IMAGE_UPLOAD.accept}
                acceptedFormatsLabel={COVER_IMAGE_UPLOAD.acceptedFormatsLabel}
                maxSizeLabel={COVER_IMAGE_UPLOAD.maxSizeLabel}
                isUploading={isSaving && Boolean(coverImageFile)}
                uploadProgress={coverUploadProgress}
                error={coverUploadError}
                helperText={tp('adminBlog.fields.coverImageHint', 'The same image can also populate the social preview fields if they are blank.')}
              />

              <div>
                <label className="mb-1.5 block text-sm font-600 text-foreground">{tp('adminBlog.fields.coverImageAlt', 'Cover image alt text')}</label>
                <input
                  value={form.cover_image_alt}
                  onChange={(event) => handleFieldChange('cover_image_alt', event.target.value)}
                  className="input-base"
                  placeholder={tp('adminBlog.placeholders.coverAlt', 'A short description for readers and accessibility')}
                />
              </div>
            </div>
          </BlogEditorSection>

          {CONTENT_TRANSLATION_ENABLED_LANGS.map((lang) => {
            const state = localizedImageStates[lang];
            const hasAnyOverride =
              state.cover_image_url?.trim() ||
              state.seo_image_url?.trim() ||
              state.twitter_image_url?.trim() ||
              state.selectedFile;
            return (
              <BlogEditorSection
                key={lang}
                title={`Localized image — ${lang.toUpperCase()}`}
                description="Per-language cover and social image overrides. Leave blank to inherit the default English images."
              >
                <div className="space-y-4">
                  <MediaUploadCard
                    label={`${lang.toUpperCase()} cover image override`}
                    value={state.cover_image_url}
                    onValueChange={(value) =>
                      setLocalizedImageStates((current) => ({
                        ...current,
                        [lang]: { ...current[lang], cover_image_url: value },
                      }))
                    }
                    selectedFile={state.selectedFile}
                    onFileSelect={(file) =>
                      setLocalizedImageStates((current) => ({
                        ...current,
                        [lang]: { ...current[lang], selectedFile: file },
                      }))
                    }
                    accept={COVER_IMAGE_UPLOAD.accept}
                    acceptedFormatsLabel={COVER_IMAGE_UPLOAD.acceptedFormatsLabel}
                    maxSizeLabel={COVER_IMAGE_UPLOAD.maxSizeLabel}
                    isUploading={isSaving && Boolean(state.selectedFile)}
                    uploadProgress={state.uploadProgress}
                    error={state.uploadError}
                    previewVariant="wide"
                    helperText={tp(
                      'adminBlog.fields.localizedCoverHint',
                      'Optional localized cover for {{language}} readers.',
                      { language: lang.toUpperCase() }
                    )}
                  />

                  <div className="grid grid-cols-1 gap-4">
                    <div>
                      <label className="mb-1.5 block text-sm font-600 text-foreground">
                        {`${lang.toUpperCase()} SEO / Open Graph image URL`}
                      </label>
                      <input
                        value={state.seo_image_url}
                        onChange={(event) =>
                          setLocalizedImageStates((current) => ({
                            ...current,
                            [lang]: { ...current[lang], seo_image_url: event.target.value },
                          }))
                        }
                        className="input-base"
                        placeholder={tp(
                          'adminBlog.placeholders.localizedSeoImage',
                          'Optional override for social share preview'
                        )}
                      />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-sm font-600 text-foreground">
                        {`${lang.toUpperCase()} Twitter card image URL`}
                      </label>
                      <input
                        value={state.twitter_image_url}
                        onChange={(event) =>
                          setLocalizedImageStates((current) => ({
                            ...current,
                            [lang]: { ...current[lang], twitter_image_url: event.target.value },
                          }))
                        }
                        className="input-base"
                        placeholder={tp(
                          'adminBlog.placeholders.localizedTwitterImage',
                          'Optional override for Twitter/X card preview'
                        )}
                      />
                    </div>
                  </div>

                  {hasAnyOverride ? (
                    <div className="flex items-center justify-end">
                      <button
                        type="button"
                        onClick={() => {
                          if (
                            !window.confirm(
                              tp(
                                'adminBlog.actions.confirmRemoveLocalizedOverride',
                                'Remove all image overrides for {{language}}?',
                                { language: lang.toUpperCase() }
                              )
                            )
                          ) {
                            return;
                          }
                          void removeLocalizedImageOverride(lang);
                        }}
                        className="btn-secondary py-2 text-xs text-muted-foreground hover:text-negative"
                      >
                        <Trash2 size={14} />
                        {tp('adminBlog.actions.removeLocalizedOverride', 'Remove override')}
                      </button>
                    </div>
                  ) : null}
                </div>
              </BlogEditorSection>
            );
          })}

          <BlogEditorSection
            title={tp('adminBlog.sections.content.title', 'Blog Content')}
            description={tp('adminBlog.sections.content.description', 'Use headings, short paragraphs, bullets, and quotes for better readability.')}
          >
            <RichTextEditor
              value={form.content_html}
              onChange={(nextValue) => handleFieldChange('content_html', nextValue)}
              placeholder={tp('adminBlog.placeholders.content', 'Write the blog post content...')}
              toolbarClassName="gap-2.5 px-4 py-3"
              editorClassName="min-h-[420px] px-5 py-5 leading-7"
            />
          </BlogEditorSection>

          <BlogEditorSection
            title={tp('adminBlog.seo.title', 'SEO & Social Metadata')}
            description={tp('adminBlog.seo.description', 'Keep search metadata and social sharing details tidy and easy to review.')}
          >
            <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
              <div className="rounded-2xl border border-border bg-muted/20 p-4">
                <div className="mb-4">
                  <h4 className="text-sm font-700 text-foreground">{tp('adminBlog.seo.groups.search.title', 'Search SEO')}</h4>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {tp('adminBlog.seo.groups.search.description', 'Use concise titles and descriptions to help search results stay clear and readable.')}
                  </p>
                </div>
                <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-600 text-foreground">{tp('adminBlog.seo.fields.seoTitle', 'SEO title')}</label>
                <input value={form.seo_title} onChange={(event) => handleFieldChange('seo_title', event.target.value)} className="input-base" />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-600 text-foreground">{tp('adminBlog.seo.fields.canonicalUrl', 'Canonical URL')}</label>
                <input
                  value={form.canonical_url_override}
                  onChange={(event) => handleFieldChange('canonical_url_override', event.target.value)}
                  className="input-base"
                  placeholder={tp('adminBlog.seo.placeholders.canonicalUrl', 'Optional override')}
                />
              </div>
              <div className="lg:col-span-2">
                <label className="mb-1.5 block text-sm font-600 text-foreground">{tp('adminBlog.seo.fields.seoDescription', 'SEO description')}</label>
                <textarea value={form.seo_description} onChange={(event) => handleFieldChange('seo_description', event.target.value)} rows={3} className="input-base resize-none" />
              </div>
              <div className="lg:col-span-2">
                <label className="mb-1.5 block text-sm font-600 text-foreground">{tp('adminBlog.seo.fields.keywords', 'SEO keywords')}</label>
                <input value={form.seo_keywords} onChange={(event) => handleFieldChange('seo_keywords', event.target.value)} className="input-base" />
              </div>
                </div>
              </div>
              <div className="rounded-2xl border border-border bg-muted/20 p-4">
                <div className="mb-4">
                  <h4 className="text-sm font-700 text-foreground">{tp('adminBlog.seo.groups.social.title', 'Social Sharing')}</h4>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {tp('adminBlog.seo.groups.social.description', 'Set the title, description, and images people will see when the post is shared.')}
                  </p>
                </div>
                <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-600 text-foreground">{tp('adminBlog.seo.fields.ogTitle', 'Open Graph title')}</label>
                <input value={form.og_title} onChange={(event) => handleFieldChange('og_title', event.target.value)} className="input-base" />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-600 text-foreground">{tp('adminBlog.seo.fields.ogDescription', 'Open Graph description')}</label>
                <input value={form.og_description} onChange={(event) => handleFieldChange('og_description', event.target.value)} className="input-base" />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-600 text-foreground">{tp('adminBlog.seo.fields.ogImage', 'Open Graph image')}</label>
                <input value={form.seo_image_url} onChange={(event) => handleFieldChange('seo_image_url', event.target.value)} className="input-base" />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-600 text-foreground">{tp('adminBlog.seo.fields.twitterTitle', 'Twitter title')}</label>
                <input value={form.twitter_title} onChange={(event) => handleFieldChange('twitter_title', event.target.value)} className="input-base" />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-600 text-foreground">{tp('adminBlog.seo.fields.twitterDescription', 'Twitter description')}</label>
                <input value={form.twitter_description} onChange={(event) => handleFieldChange('twitter_description', event.target.value)} className="input-base" />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-600 text-foreground">{tp('adminBlog.seo.fields.twitterImage', 'Twitter image')}</label>
                <input value={form.twitter_image_url} onChange={(event) => handleFieldChange('twitter_image_url', event.target.value)} className="input-base" />
              </div>
                </div>
              </div>
            </div>
          </BlogEditorSection>

          <BlogEditorSection
            title={tp('adminBlog.translation.title', 'Translation status')}
            description={tp('adminBlog.translation.description', 'English is the single source of truth. Saved translations appear here; per-language failures preserve prior valid translations.')}
          >
            <div className="flex flex-wrap items-center gap-2">
              {translationStatuses.length > 0 ? (
                translationStatuses.map((row) => {
                  const displayStatus =
                    row.status === 'current' && row.sourceHashMatch === false
                      ? 'outdated'
                      : row.status || 'missing';
                  const label =
                    displayStatus === 'current'
                      ? tp('adminBlog.translation.statusCurrent', 'Current')
                      : displayStatus === 'outdated' || (row.status === 'current' && row.sourceHashMatch === false)
                      ? tp('adminBlog.translation.statusOutdated', 'Missing/Outdated')
                      : displayStatus === 'failed'
                      ? tp('adminBlog.translation.statusFailed', 'Failed')
                      : displayStatus === 'pending'
                      ? tp('adminBlog.translation.statusPending', 'Translating')
                      : tp('adminBlog.translation.statusMissing', 'Missing/Outdated');
                  const chipClass =
                    displayStatus === 'current'
                      ? 'bg-positive-soft text-positive'
                      : displayStatus === 'failed'
                      ? 'bg-danger-soft text-danger'
                      : displayStatus === 'pending'
                      ? 'bg-info-soft text-info'
                      : 'bg-warning/10 text-warning';
                  return (
                    <span
                      key={row.language}
                      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-700 uppercase tracking-[0.14em] ${chipClass}`}
                      title={row.errorMessage ? `${row.language}: ${row.errorMessage}` : row.language}
                    >
                      <span>{row.language.toUpperCase()}</span>
                      <span className="opacity-80">{label}</span>
                    </span>
                  );
                })
              ) : (
                <span className="rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">
                  {tp('adminBlog.translation.noStatuses', 'No statuses yet. Translations run automatically after save.')}
                </span>
              )}
              {translationSourceHash ? (
                <span className="ml-auto rounded-full bg-muted px-3 py-1 font-mono text-[10px] text-muted-foreground">
                  EN {translationSourceHash.slice(0, 8)}
                </span>
              ) : null}
            </div>
            {isProcessingLoopRunning ? (
              <div className="mt-4 space-y-2 rounded-2xl border border-border bg-muted/30 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-xs font-600 text-foreground">
                    {tp(
                      'adminBlog.translation.progressCount',
                      '{{completed}} of {{total}} languages processed',
                      {
                        completed: processingProgress.completed,
                        total: processingProgress.total,
                      }
                    )}
                  </p>
                  <button
                    type="button"
                    onClick={() => { setStopProcessing(true); stopProcessingRef.current = true; }}
                    className="btn-secondary !h-7 !min-h-0 !rounded-xl !px-2.5 !py-0 !text-[11px] !gap-1"
                  >
                    <Square size={11} />
                    {tp('adminBlog.actions.stopProcessing', 'Stop')}
                  </button>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-accent transition-all duration-300"
                    style={{
                      width: `${processingProgress.total > 0 ? Math.min(100, Math.round((processingProgress.completed / processingProgress.total) * 100)) : 0}%`,
                    }}
                  />
                </div>
              </div>
            ) : null}
          </BlogEditorSection>

          {!isNewPost && selectedPost?.status === 'published' && selectedPost.is_enabled ? (
            <div className="flex flex-wrap items-center gap-3">
              <Link href={`/blog/${selectedPost.slug}`} target="_blank" className="btn-secondary py-2 text-xs">
                <Eye size={14} />
                {tp('adminBlog.actions.openLive', 'Open Live Post')}
              </Link>
              <p className="text-xs text-muted-foreground">
                {tp('adminBlog.actions.openLiveHint', 'Published and enabled posts open in a new tab.')}
              </p>
            </div>
          ) : null}
        </div>

        {showPreview ? (
          <aside className="space-y-4 2xl:sticky 2xl:top-6 2xl:self-start">
            <div className="card-elevated space-y-4 p-5">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-700 text-foreground">{tp('adminBlog.preview.title', 'Preview')}</h3>
                  <p className="text-sm text-muted-foreground">{tp('adminBlog.preview.description', 'Review how the article and search snippets may look before publishing.')}</p>
                </div>
                <span className="rounded-full bg-muted px-2 py-1 text-xs text-muted-foreground">{slugPreview}</span>
              </div>
              <article className="overflow-hidden rounded-3xl border border-border bg-background">
                {form.cover_image_url ? (
                  <img
                    src={form.cover_image_url}
                    alt={form.cover_image_alt || form.title || tp('adminBlog.preview.imageAltFallback', 'Blog cover image')}
                    className="aspect-[16/9] w-full object-cover"
                  />
                ) : null}
                <div className="space-y-4 p-5">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    {form.category ? <span className="rounded-full bg-muted px-2.5 py-1">{form.category}</span> : null}
                    {previewDateLabel ? <span>{previewDateLabel}</span> : null}
                    <span>{tp('adminBlog.preview.readingTime', '{{count}} min read', { count: liveReadingTime })}</span>
                  </div>
                  <h4 className="text-2xl font-800 text-foreground">
                    {form.title || tp('adminBlog.preview.untitled', 'Untitled blog post')}
                  </h4>
                  {form.excerpt ? <p className="text-sm leading-6 text-muted-foreground">{form.excerpt}</p> : null}
                  {normalizedTags.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {normalizedTags.map((tag) => (
                        <span key={tag} className="rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground">
                          #{tag}
                        </span>
                      ))}
                    </div>
                  ) : null}
                  <div className="rounded-2xl border border-border bg-muted/20 p-4">
                    <p className="text-xs font-700 uppercase tracking-[0.16em] text-muted-foreground">
                      {tp('adminBlog.preview.articleCardTitle', 'Article Preview')}
                    </p>
                    <div className="mt-3 grid gap-2 text-sm text-muted-foreground">
                      <p><span className="font-700 text-foreground">{tp('adminBlog.preview.metaAuthor', 'Author')}:</span> {form.author_name || tp('adminBlog.preview.metaFallback', 'Not set')}</p>
                      <p><span className="font-700 text-foreground">{tp('adminBlog.preview.metaCategory', 'Category')}:</span> {form.category || tp('adminBlog.preview.metaFallback', 'Not set')}</p>
                      <p><span className="font-700 text-foreground">{tp('adminBlog.preview.metaPublishDate', 'Publish date')}:</span> {previewDateLabel || tp('adminBlog.preview.metaFallback', 'Not set')}</p>
                      <p><span className="font-700 text-foreground">{tp('adminBlog.preview.metaTags', 'Tags')}:</span> {normalizedTags.join(', ') || tp('adminBlog.preview.metaFallback', 'Not set')}</p>
                    </div>
                  </div>
                </div>
              </article>
            </div>

            <div className="card-elevated space-y-4 p-5">
              <div>
                <h3 className="text-base font-700 text-foreground">{tp('adminBlog.preview.seoCardTitle', 'SEO preview')}</h3>
                <p className="text-sm text-muted-foreground">
                  {tp('adminBlog.preview.seoCardDescription', 'How the post is likely to appear in search and social contexts.')}
                </p>
              </div>
              <div className="rounded-2xl border border-border bg-background p-4">
                <p className="truncate text-xs text-emerald-700">{slugPreview}</p>
                <p className="mt-2 text-lg font-700 text-[#1a0dab]">{seoTitlePreview}</p>
                <p className="mt-2 text-sm text-muted-foreground">{seoDescriptionPreview}</p>
              </div>
              <div className="rounded-2xl border border-border bg-background p-4">
                <p className="text-xs font-700 uppercase tracking-[0.16em] text-muted-foreground">
                  {tp('adminBlog.preview.socialCardTitle', 'Social card preview')}
                </p>
                <div className="mt-3 rounded-2xl border border-border bg-muted/20 p-3">
                  <p className="text-sm font-700 text-foreground">
                    {form.og_title || form.twitter_title || seoTitlePreview}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {form.og_description || form.twitter_description || seoDescriptionPreview}
                  </p>
                </div>
              </div>
              <div className="rounded-2xl border border-border bg-background p-4 text-sm text-muted-foreground">
                <p><span className="font-700 text-foreground">{tp('adminBlog.preview.metaCanonical', 'Canonical')}:</span> {form.canonical_url_override || slugPreview}</p>
                <p className="mt-2"><span className="font-700 text-foreground">{tp('adminBlog.preview.metaOgImage', 'Open Graph image')}:</span> {form.seo_image_url || tp('adminBlog.preview.metaFallback', 'Not set')}</p>
                <p className="mt-2"><span className="font-700 text-foreground">{tp('adminBlog.preview.metaTwitterImage', 'Twitter image')}:</span> {form.twitter_image_url || tp('adminBlog.preview.metaFallback', 'Not set')}</p>
              </div>
            </div>
          </aside>
        ) : null}
      </div>

      <Modal
        isOpen={backfillDialog.open}
        onClose={() => {}}
        title={tp('adminBlog.backfill.title', 'Backfill translations')}
        description={tp(
          'adminBlog.backfill.description',
          'Scans all Blog content from the beginning and translates missing or outdated entries. Safe to stop and resume within this open session. If you refresh or close the page, the next run safely re-scans from the start (already-current translations are skipped without duplication).'
        )}
        size="md"
      >
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-2xl border border-border bg-muted/20 p-4">
              <p className="text-xs font-700 uppercase tracking-[0.14em] text-muted-foreground">
                {tp('adminBlog.backfill.scannedLabel', 'Scanned content')}
              </p>
              <p className="mt-2 text-2xl font-800 text-info">
                {backfillDialog.completedScanCount}
                <span className="text-sm font-500 text-muted-foreground">
                  {' / '}{backfillDialog.totalScannedEstimate || '—'}
                </span>
              </p>
            </div>
            <div className="rounded-2xl border border-border bg-muted/20 p-4">
              <p className="text-xs font-700 uppercase tracking-[0.14em] text-muted-foreground">
                {tp('adminBlog.backfill.completedLabel', 'Completed translations')}
              </p>
              <p className="mt-2 text-2xl font-800 text-positive">
                {backfillDialog.completedTranslations}
              </p>
            </div>
            <div className="rounded-2xl border border-border bg-muted/20 p-4">
              <p className="text-xs font-700 uppercase tracking-[0.14em] text-muted-foreground">
                {tp('adminBlog.backfill.pendingLabel', 'Pending translations')}
              </p>
              <p className="mt-2 text-2xl font-800 text-warning">
                {backfillDialog.pendingTranslations}
              </p>
            </div>
            <div className="rounded-2xl border border-border bg-muted/20 p-4">
              <p className="text-xs font-700 uppercase tracking-[0.14em] text-muted-foreground">
                {tp('adminBlog.backfill.failedLabel', 'Failed translations')}
              </p>
              <p className="mt-2 text-2xl font-800 text-danger">
                {backfillDialog.failedTranslations}
              </p>
            </div>
          </div>

          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-accent transition-all duration-300"
              style={{
                width: `${(backfillDialog.completedTranslations + backfillDialog.pendingTranslations + backfillDialog.failedTranslations) > 0
                    ? Math.min(
                        100,
                        Math.round(
                          (backfillDialog.completedTranslations /
                            (backfillDialog.completedTranslations + backfillDialog.pendingTranslations + backfillDialog.failedTranslations)) *
                            100
                        )
                      )
                    : 0
                  }%`,
              }}
            />
          </div>

          <div className="flex flex-wrap justify-end gap-2">
            {!backfillDialog.isStopped ? (
              <button
                type="button"
                className="btn-secondary"
                onClick={() => {
                  setBackfillDialog((prev) => ({ ...prev, stopBackfill: true }));
                  stopBackfillRef.current = true;
                }}
              >
                <Square size={14} />
                {tp('adminBlog.actions.stopBackfill', 'Stop')}
              </button>
            ) : null}
            {backfillDialog.isStopped ? (
              <button
                type="button"
                className="btn-secondary"
                onClick={() => void resumeBackfill()}
              >
                <Play size={14} />
                {tp('adminBlog.actions.resumeBackfill', 'Resume')}
              </button>
            ) : null}
            {backfillDialog.failedWorkSet.length > 0 ? (
              <button
                type="button"
                className="btn-secondary"
                onClick={() => void retryBackfillFailures()}
              >
                <Sparkles size={14} />
                {tp('adminBlog.actions.retryFailures', 'Retry failures')}
                <span className="rounded-full bg-danger-soft px-1.5 py-0.5 text-[10px] font-700 text-danger">
                  {backfillDialog.failedWorkSet.length}
                </span>
              </button>
            ) : null}
            <button
              type="button"
              className="btn-primary"
              onClick={() => {
                setBackfillDialog((prev) => ({ ...prev, stopBackfill: true, open: false }));
                stopBackfillRef.current = true;
                setIsBackfilling(false);
              }}
            >
              <Square size={14} />
              {tp('adminBlog.actions.closeBackfill', 'Stop and close')}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
