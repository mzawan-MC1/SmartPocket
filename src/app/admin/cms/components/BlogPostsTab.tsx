'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { CalendarDays, Eye, FilePlus2, Loader2, Pencil, Search, Sparkles, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import CmsHtml from '@/components/cms/CmsHtml';
import RichTextEditor from '@/components/cms/RichTextEditor';
import MediaUploadCard from '@/components/ui/MediaUploadCard';
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

export default function BlogPostsTab() {
  const { t } = useTranslation('portal');
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
  }

  function startNewPost() {
    setIsNewPost(true);
    setActiveId(null);
    setForm(EMPTY_FORM);
    setTagInput('');
    setCoverImageFile(null);
    setCoverUploadError(null);
    setCoverUploadProgress(0);
  }

  function selectPost(post: BlogPostListItem) {
    setIsNewPost(false);
    setActiveId(post.id);
    hydrateForm(post);
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

  async function savePost() {
    setIsSaving(true);

    try {
      const uploadedImages = await maybeUploadCoverImage();
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
      const res = await fetch(endpoint, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();

      if (!res.ok) {
        throw new Error(json?.error || tp('adminBlog.errors.save', 'Failed to save the blog post.'));
      }

      const nextId = json?.post?.id || activeId;
      toast.success(
        isNewPost
          ? tp('adminBlog.toasts.created', 'Blog post created.')
          : tp('adminBlog.toasts.updated', 'Blog post updated.')
      );
      await loadPosts(nextId);
      setIsNewPost(false);
      setCoverImageFile(null);
      setCoverUploadProgress(0);
    } catch (error: any) {
      toast.error(error?.message || tp('adminBlog.errors.save', 'Failed to save the blog post.'));
    } finally {
      setIsSaving(false);
    }
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

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
      <div className="space-y-4">
        <div className="card-elevated space-y-4 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-700 text-foreground">
                {tp('adminBlog.sidebar.title', 'Blog Management')}
              </h2>
              <p className="text-xs text-muted-foreground">
                {tp('adminBlog.sidebar.description', 'Create, feature, and manage blog posts from the same CMS source of truth.')}
              </p>
            </div>
            <button type="button" onClick={startNewPost} className="btn-primary py-2 text-xs">
              <FilePlus2 size={14} />
              {tp('adminBlog.actions.add', 'Add Post')}
            </button>
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
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}
              className="input-base text-sm"
            >
              <option value="all">{tp('adminBlog.filters.allStatuses', 'All statuses')}</option>
              <option value="published">{tp('adminBlog.status.published', 'Published')}</option>
              <option value="draft">{tp('adminBlog.status.draft', 'Draft')}</option>
            </select>
            <select
              value={enabledFilter}
              onChange={(event) => setEnabledFilter(event.target.value as typeof enabledFilter)}
              className="input-base text-sm"
            >
              <option value="all">{tp('adminBlog.filters.allVisibility', 'All visibility')}</option>
              <option value="enabled">{tp('adminBlog.status.enabled', 'Enabled')}</option>
              <option value="disabled">{tp('adminBlog.status.disabled', 'Disabled')}</option>
            </select>
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

        <div className="card-elevated space-y-3 p-3">
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 size={22} className="animate-spin text-accent" />
            </div>
          ) : filteredPosts.length === 0 ? (
            <div className="py-12 text-center">
              <p className="text-sm font-700 text-foreground">{tp('adminBlog.empty.title', 'No blog posts found')}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {tp('adminBlog.empty.description', 'Adjust the filters or create your first blog post.')}
              </p>
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
                  <div className="min-w-0">
                    <p className="truncate text-sm font-700 text-foreground">{post.title}</p>
                    <p className="mt-1 truncate text-xs text-muted-foreground">{`/blog/${post.slug}`}</p>
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
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      <div className="space-y-6">
        <div className="card-elevated space-y-5 p-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-lg font-700 text-foreground">
                {isNewPost
                  ? tp('adminBlog.editor.createTitle', 'Create Blog Post')
                  : tp('adminBlog.editor.editTitle', 'Edit Blog Post')}
              </h2>
              <p className="text-sm text-muted-foreground">
                {tp('adminBlog.editor.description', 'Draft, publish, feature, optimize, and preview public blog content.')}
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
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
            {tp('adminBlog.notice', 'Blog posts reuse the existing CMS table, metadata fields, and public SEO pipeline.')}
          </div>

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
              <p className="mt-1 text-xs text-muted-foreground">{slugPreview}</p>
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
            <div className="lg:col-span-2">
              <label className="mb-1.5 block text-sm font-600 text-foreground">{tp('adminBlog.fields.excerpt', 'Excerpt')}</label>
              <textarea
                rows={3}
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
            </div>
            <div className="flex flex-wrap items-center gap-5 pt-4 lg:col-span-2">
              <label className="flex items-center gap-2 text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={form.is_enabled}
                  onChange={(event) => handleFieldChange('is_enabled', event.target.checked)}
                  className="h-4 w-4 rounded border-border accent-accent"
                />
                {tp('adminBlog.fields.enabled', 'Enabled')}
              </label>
              <label className="flex items-center gap-2 text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={form.is_featured}
                  onChange={(event) => handleFieldChange('is_featured', event.target.checked)}
                  className="h-4 w-4 rounded border-border accent-accent"
                />
                {tp('adminBlog.fields.featured', 'Featured on homepage')}
              </label>
              <label className="flex items-center gap-2 text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={form.status === 'published'}
                  onChange={(event) => handleFieldChange('status', event.target.checked ? 'published' : 'draft')}
                  className="h-4 w-4 rounded border-border accent-accent"
                />
                {tp('adminBlog.fields.published', 'Published')}
              </label>
            </div>
          </div>

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

          <div>
            <label className="mb-1.5 block text-sm font-600 text-foreground">{tp('adminBlog.fields.content', 'Blog content')}</label>
            <RichTextEditor
              value={form.content_html}
              onChange={(nextValue) => handleFieldChange('content_html', nextValue)}
              placeholder={tp('adminBlog.placeholders.content', 'Write the blog post content...')}
            />
          </div>

          <div className="space-y-4 rounded-2xl border border-border bg-muted/30 p-4">
            <div>
              <h3 className="text-base font-700 text-foreground">{tp('adminBlog.seo.title', 'SEO & social metadata')}</h3>
              <p className="text-sm text-muted-foreground">
                {tp('adminBlog.seo.description', 'These fields reuse the existing metadata system for canonical, Open Graph, and Twitter output.')}
              </p>
            </div>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
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
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(280px,0.8fr)]">
            <div className="card-elevated p-5">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h3 className="text-base font-700 text-foreground">{tp('adminBlog.preview.title', 'Article preview')}</h3>
                  <p className="text-sm text-muted-foreground">{tp('adminBlog.preview.description', 'Sanitized public output preview.')}</p>
                </div>
                <span className="rounded-full bg-muted px-2 py-1 text-xs text-muted-foreground">{slugPreview}</span>
              </div>
              <article className="mx-auto max-w-3xl">
                {form.cover_image_url ? (
                  <img
                    src={form.cover_image_url}
                    alt={form.cover_image_alt || form.title || tp('adminBlog.preview.imageAltFallback', 'Blog cover image')}
                    className="mb-6 aspect-[16/9] w-full rounded-3xl object-cover"
                  />
                ) : null}
                <div className="mb-4 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  {form.category ? <span className="rounded-full bg-muted px-2.5 py-1">{form.category}</span> : null}
                  {form.author_name ? <span>{form.author_name}</span> : null}
                  <span>{tp('adminBlog.preview.readingTime', '{{count}} min read', { count: liveReadingTime })}</span>
                </div>
                <h1 className="mb-3 text-3xl font-800 text-foreground">{form.title || tp('adminBlog.preview.untitled', 'Untitled blog post')}</h1>
                {form.excerpt ? <p className="mb-6 text-lg text-muted-foreground">{form.excerpt}</p> : null}
                <CmsHtml
                  html={form.content_html}
                  className="prose prose-slate max-w-none text-muted-foreground [&_a]:text-accent [&_blockquote]:border-l-4 [&_blockquote]:border-accent/40 [&_blockquote]:pl-4 [&_h1]:text-foreground [&_h2]:text-foreground [&_h3]:text-foreground [&_h4]:text-foreground [&_li]:my-1"
                />
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
              <div className="rounded-2xl border border-border bg-background p-4 text-sm text-muted-foreground">
                <p><span className="font-700 text-foreground">{tp('adminBlog.preview.metaAuthor', 'Author')}:</span> {form.author_name || tp('adminBlog.preview.metaFallback', 'Not set')}</p>
                <p className="mt-2"><span className="font-700 text-foreground">{tp('adminBlog.preview.metaCategory', 'Category')}:</span> {form.category || tp('adminBlog.preview.metaFallback', 'Not set')}</p>
                <p className="mt-2"><span className="font-700 text-foreground">{tp('adminBlog.preview.metaTags', 'Tags')}:</span> {normalizeTagList(tagInput).join(', ') || tp('adminBlog.preview.metaFallback', 'Not set')}</p>
                <p className="mt-2"><span className="font-700 text-foreground">{tp('adminBlog.preview.metaCanonical', 'Canonical')}:</span> {form.canonical_url_override || slugPreview}</p>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
