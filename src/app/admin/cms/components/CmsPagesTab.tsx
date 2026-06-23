'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Eye, FilePlus2, Loader2, Pencil, Search, ShieldAlert, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import CmsHtml from '@/components/cms/CmsHtml';
import RichTextEditor from '@/components/cms/RichTextEditor';
import {
  slugifyCmsPageSlug,
  type CmsPageInput,
  type CmsPageListItem,
} from '@/lib/cms-pages';

const EMPTY_FORM: CmsPageInput = {
  title: '',
  slug: '',
  content_html: '',
  status: 'draft',
  is_enabled: true,
  show_in_header: false,
  show_in_footer: false,
  navigation_label: '',
  sort_order: 0,
  allow_delete: true,
};

export default function CmsPagesTab() {
  const [pages, setPages] = useState<CmsPageListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'draft' | 'published'>('all');
  const [enabledFilter, setEnabledFilter] = useState<'all' | 'enabled' | 'disabled'>('all');
  const [showPreview, setShowPreview] = useState(true);
  const [form, setForm] = useState<CmsPageInput>(EMPTY_FORM);
  const [isNewPage, setIsNewPage] = useState(true);

  const loadPages = async (preferredId?: string | null) => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/admin/cms/pages');
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json?.error || 'Failed to load CMS pages.');
      }

      const nextPages = (json?.pages || []) as CmsPageListItem[];
      setPages(nextPages);

      const nextActiveId =
        preferredId && nextPages.some((page) => page.id === preferredId)
          ? preferredId
          : nextPages[0]?.id || null;

      if (!nextActiveId) {
        setIsNewPage(true);
        setActiveId(null);
        setForm(EMPTY_FORM);
        return;
      }

      const selectedPage = nextPages.find((page) => page.id === nextActiveId)!;
      setIsNewPage(false);
      setActiveId(selectedPage.id);
      hydrateForm(selectedPage);
    } catch (error: any) {
      toast.error(error?.message || 'Failed to load CMS pages.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadPages();
  }, []);

  const filteredPages = useMemo(() => {
    return pages.filter((page) => {
      const matchesSearch =
        !search ||
        page.title.toLowerCase().includes(search.toLowerCase()) ||
        page.slug.toLowerCase().includes(search.toLowerCase()) ||
        (page.navigation_label || '').toLowerCase().includes(search.toLowerCase());

      const matchesStatus = statusFilter === 'all' || page.status === statusFilter;
      const matchesEnabled =
        enabledFilter === 'all' ||
        (enabledFilter === 'enabled' ? page.is_enabled : !page.is_enabled);

      return matchesSearch && matchesStatus && matchesEnabled;
    });
  }, [enabledFilter, pages, search, statusFilter]);

  const selectedPage = pages.find((page) => page.id === activeId) || null;

  function hydrateForm(page: CmsPageListItem) {
    setForm({
      title: page.title,
      slug: page.slug,
      content_html: page.content_html || '',
      status: page.status,
      is_enabled: page.is_enabled,
      show_in_header: page.show_in_header,
      show_in_footer: page.show_in_footer,
      navigation_label: page.navigation_label || '',
      sort_order: page.sort_order || 0,
      allow_delete: page.allow_delete,
    });
  }

  const selectPage = (page: CmsPageListItem) => {
    setIsNewPage(false);
    setActiveId(page.id);
    hydrateForm(page);
  };

  const startNewPage = () => {
    setIsNewPage(true);
    setActiveId(null);
    setForm(EMPTY_FORM);
  };

  const handleFieldChange = <K extends keyof CmsPageInput>(key: K, value: CmsPageInput[K]) => {
    setForm((current) => ({
      ...current,
      [key]:
        key === 'slug'
          ? slugifyCmsPageSlug(String(value))
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

  const savePage = async () => {
    setIsSaving(true);
    try {
      const endpoint = isNewPage ? '/api/admin/cms/pages' : `/api/admin/cms/pages/${activeId}`;
      const method = isNewPage ? 'POST' : 'PATCH';
      const res = await fetch(endpoint, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const json = await res.json();

      if (!res.ok) {
        throw new Error(json?.error || 'Failed to save page.');
      }

      const nextId = json?.page?.id || activeId;
      toast.success(isNewPage ? 'Page created.' : 'Page updated.');
      await loadPages(nextId);
      setIsNewPage(false);
    } catch (error: any) {
      toast.error(error?.message || 'Failed to save page.');
    } finally {
      setIsSaving(false);
    }
  };

  const patchPage = async (page: CmsPageListItem, payload: Partial<CmsPageInput>, successMessage: string) => {
    try {
      const res = await fetch(`/api/admin/cms/pages/${page.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: page.title,
          slug: page.slug,
          content_html: page.content_html,
          status: page.status,
          is_enabled: page.is_enabled,
          show_in_header: page.show_in_header,
          show_in_footer: page.show_in_footer,
          navigation_label: page.navigation_label || '',
          sort_order: page.sort_order,
          allow_delete: page.allow_delete,
          ...payload,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json?.error || 'Failed to update page.');
      }

      toast.success(successMessage);
      await loadPages(page.id);
    } catch (error: any) {
      toast.error(error?.message || 'Failed to update page.');
    }
  };

  const deletePage = async (page: CmsPageListItem) => {
    if (!page.can_delete) {
      toast.error('Protected system pages cannot be deleted.');
      return;
    }

    if (!window.confirm(`Delete "${page.title}"? This action cannot be undone.`)) {
      return;
    }

    try {
      const res = await fetch(`/api/admin/cms/pages/${page.id}`, {
        method: 'DELETE',
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json?.error || 'Failed to delete page.');
      }

      toast.success('Page deleted.');
      await loadPages();
    } catch (error: any) {
      toast.error(error?.message || 'Failed to delete page.');
    }
  };

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
      <div className="space-y-4">
        <div className="card-elevated p-4 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-700 text-foreground">Legal &amp; Content Pages</h2>
              <p className="text-xs text-muted-foreground">Manage Privacy, Terms, Contact, Cookie Policy, Refund Policy, and other long-form standalone pages.</p>
            </div>
            <button type="button" onClick={startNewPage} className="btn-primary text-xs py-2">
              <FilePlus2 size={14} />
              Add Page
            </button>
          </div>

          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search title, slug, nav label..."
              className="input-base pl-9"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}
              className="input-base text-sm"
            >
              <option value="all">All statuses</option>
              <option value="published">Published</option>
              <option value="draft">Draft</option>
            </select>
            <select
              value={enabledFilter}
              onChange={(event) => setEnabledFilter(event.target.value as typeof enabledFilter)}
              className="input-base text-sm"
            >
              <option value="all">All visibility</option>
              <option value="enabled">Enabled</option>
              <option value="disabled">Disabled</option>
            </select>
          </div>
        </div>

        <div className="card-elevated p-3 space-y-3">
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 size={22} className="animate-spin text-accent" />
            </div>
          ) : filteredPages.length === 0 ? (
            <div className="py-12 text-center">
              <p className="text-sm font-600 text-foreground">No pages found</p>
              <p className="text-xs text-muted-foreground mt-1">Adjust the filters or create a new page.</p>
            </div>
          ) : (
            filteredPages.map((page) => (
              <button
                key={page.id}
                type="button"
                onClick={() => selectPage(page)}
                className={`w-full rounded-2xl border p-4 text-left transition-colors ${
                  activeId === page.id && !isNewPage
                    ? 'border-accent bg-accent/5'
                    : 'border-border hover:border-accent/40'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-700 text-foreground">{page.title}</p>
                      {page.is_protected_system_page ? (
                        <ShieldAlert size={14} className="text-warning" />
                      ) : null}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">/{page.slug}</p>
                  </div>
                  <span className={`rounded-full px-2 py-1 text-[10px] font-700 uppercase ${
                    page.status === 'published' ? 'bg-positive-soft text-positive' : 'bg-warning/10 text-warning'
                  }`}>
                    {page.status}
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                  <span className={`rounded-full px-2 py-0.5 ${page.is_enabled ? 'bg-info-soft text-info' : 'bg-muted text-muted-foreground'}`}>
                    {page.is_enabled ? 'Enabled' : 'Disabled'}
                  </span>
                  {page.show_in_header ? <span className="rounded-full bg-muted px-2 py-0.5">Header</span> : null}
                  {page.show_in_footer ? <span className="rounded-full bg-muted px-2 py-0.5">Footer</span> : null}
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      <div className="space-y-6">
        <div className="card-elevated p-5 space-y-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-lg font-700 text-foreground">
                {isNewPage ? 'Create Content Page' : `Edit: ${selectedPage?.title || 'Content Page'}`}
              </h2>
              <p className="text-sm text-muted-foreground">
                Draft, publish, disable, preview, and protect long-form standalone pages from a single place.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {!isNewPage && selectedPage ? (
                <>
                  <button
                    type="button"
                    onClick={() =>
                      patchPage(
                        selectedPage,
                        { status: selectedPage.status === 'published' ? 'draft' : 'published' },
                        selectedPage.status === 'published' ? 'Page unpublished.' : 'Page published.'
                      )
                    }
                    className="btn-secondary text-xs py-2"
                  >
                    {selectedPage.status === 'published' ? 'Unpublish' : 'Publish'}
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      patchPage(
                        selectedPage,
                        { is_enabled: !selectedPage.is_enabled },
                        selectedPage.is_enabled ? 'Page disabled.' : 'Page enabled.'
                      )
                    }
                    className="btn-secondary text-xs py-2"
                  >
                    {selectedPage.is_enabled ? 'Disable' : 'Enable'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowPreview((current) => !current)}
                    className="btn-secondary text-xs py-2"
                  >
                    <Eye size={14} />
                    {showPreview ? 'Hide Preview' : 'Preview'}
                  </button>
                  <button
                    type="button"
                    onClick={() => deletePage(selectedPage)}
                    disabled={!selectedPage.can_delete}
                    className="btn-secondary text-xs py-2 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Trash2 size={14} />
                    Delete
                  </button>
                </>
              ) : null}
              <button type="button" onClick={() => void savePage()} disabled={isSaving} className="btn-primary text-xs py-2">
                {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Pencil size={14} />}
                {isNewPage ? 'Create Page' : 'Save Changes'}
              </button>
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
            Marketing sections such as About, Features, and Pricing are managed on the Home page. SEO metadata now lives only in `/admin/seo`.
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div>
              <label className="block text-sm font-600 text-foreground mb-1.5">Page title</label>
              <input
                value={form.title}
                onChange={(event) => handleTitleChange(event.target.value)}
                className="input-base"
                placeholder="Privacy Policy"
              />
            </div>
            <div>
              <label className="block text-sm font-600 text-foreground mb-1.5">Slug</label>
              <input
                value={form.slug}
                onChange={(event) => handleFieldChange('slug', event.target.value)}
                className="input-base font-mono"
                placeholder="privacy-policy"
              />
            </div>
            <div>
              <label className="block text-sm font-600 text-foreground mb-1.5">Navigation label</label>
              <input
                value={form.navigation_label}
                onChange={(event) => handleFieldChange('navigation_label', event.target.value)}
                className="input-base"
                placeholder="Privacy"
              />
            </div>
            <div>
              <label className="block text-sm font-600 text-foreground mb-1.5">Sort order</label>
              <input
                type="number"
                value={form.sort_order}
                onChange={(event) => handleFieldChange('sort_order', Number(event.target.value))}
                className="input-base"
              />
            </div>
            <div>
              <label className="block text-sm font-600 text-foreground mb-1.5">Status</label>
              <select
                value={form.status}
                onChange={(event) => handleFieldChange('status', event.target.value as CmsPageInput['status'])}
                className="input-base"
              >
                <option value="draft">Draft</option>
                <option value="published">Published</option>
              </select>
            </div>
            <div className="flex flex-wrap items-center gap-5 pt-8">
              <label className="flex items-center gap-2 text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={form.is_enabled}
                  onChange={(event) => handleFieldChange('is_enabled', event.target.checked)}
                  className="h-4 w-4 rounded border-border accent-accent"
                />
                Enabled
              </label>
              <label className="flex items-center gap-2 text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={form.show_in_header}
                  onChange={(event) => handleFieldChange('show_in_header', event.target.checked)}
                  className="h-4 w-4 rounded border-border accent-accent"
                />
                Show in header
              </label>
              <label className="flex items-center gap-2 text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={form.show_in_footer}
                  onChange={(event) => handleFieldChange('show_in_footer', event.target.checked)}
                  className="h-4 w-4 rounded border-border accent-accent"
                />
                Show in footer
              </label>
              <label className="flex items-center gap-2 text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={form.allow_delete}
                  onChange={(event) => handleFieldChange('allow_delete', event.target.checked)}
                  disabled={Boolean(selectedPage?.is_protected_system_page && !selectedPage?.allow_delete)}
                  className="h-4 w-4 rounded border-border accent-accent"
                />
                Allow delete
              </label>
            </div>
          </div>

          <div>
            <label className="block text-sm font-600 text-foreground mb-1.5">Rich-text content</label>
            <RichTextEditor
              value={form.content_html}
              onChange={(nextValue) => handleFieldChange('content_html', nextValue)}
            />
          </div>

          {selectedPage?.is_protected_system_page ? (
            <div className="rounded-2xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-warning">
              This is a protected system page. You can edit content, status, and visibility here, while SEO remains managed in `/admin/seo`.
            </div>
          ) : null}

          {!isNewPage && selectedPage?.status === 'published' && selectedPage.is_enabled ? (
            <div className="flex flex-wrap items-center gap-3">
              <Link href={`/${selectedPage.slug}`} target="_blank" className="btn-secondary text-xs py-2">
                <Eye size={14} />
                Open Live Page
              </Link>
              <p className="text-xs text-muted-foreground">Live pages open in a new tab.</p>
            </div>
          ) : null}
        </div>

        {showPreview ? (
          <div className="card-elevated p-5">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="text-base font-700 text-foreground">Preview</h3>
                <p className="text-sm text-muted-foreground">Sanitized public output preview.</p>
              </div>
              <span className="rounded-full bg-muted px-2 py-1 text-xs text-muted-foreground">
                /{form.slug || 'new-page'}
              </span>
            </div>
            <div className="rounded-2xl border border-border bg-background px-6 py-8">
              <h1 className="text-3xl font-700 text-foreground mb-4">{form.title || 'Untitled Page'}</h1>
              <CmsHtml
                html={form.content_html}
                className="prose prose-slate max-w-none text-muted-foreground [&_a]:text-accent [&_h1]:text-foreground [&_h2]:text-foreground [&_h3]:text-foreground"
              />
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
