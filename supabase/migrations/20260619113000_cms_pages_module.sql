-- ============================================================
-- Smart Pocket — CMS Pages Module
-- Migration: 20260619113000_cms_pages_module.sql
-- Adds database-backed CMS pages with protected system pages.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.cms_pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  slug TEXT NOT NULL,
  content_html TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft',
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  seo_title TEXT DEFAULT '',
  seo_description TEXT DEFAULT '',
  show_in_header BOOLEAN NOT NULL DEFAULT false,
  show_in_footer BOOLEAN NOT NULL DEFAULT false,
  navigation_label TEXT DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_protected_system_page BOOLEAN NOT NULL DEFAULT false,
  allow_delete BOOLEAN NOT NULL DEFAULT true,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT cms_pages_status_check CHECK (status IN ('draft', 'published')),
  CONSTRAINT cms_pages_slug_format_check CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$')
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_cms_pages_slug_unique
  ON public.cms_pages (LOWER(slug));

CREATE INDEX IF NOT EXISTS idx_cms_pages_status_enabled
  ON public.cms_pages (status, is_enabled, sort_order);

ALTER TABLE public.cms_pages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_read_cms_pages" ON public.cms_pages;
CREATE POLICY "public_read_cms_pages"
ON public.cms_pages
FOR SELECT
TO public
USING (status = 'published' AND is_enabled = true);

DROP POLICY IF EXISTS "admin_manage_cms_pages" ON public.cms_pages;
CREATE POLICY "admin_manage_cms_pages"
ON public.cms_pages
FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

CREATE OR REPLACE FUNCTION public.prevent_protected_cms_page_delete()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.is_protected_system_page = true AND COALESCE(OLD.allow_delete, false) = false THEN
    RAISE EXCEPTION 'Protected system pages cannot be deleted.';
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS prevent_protected_cms_page_delete_trigger ON public.cms_pages;
CREATE TRIGGER prevent_protected_cms_page_delete_trigger
  BEFORE DELETE ON public.cms_pages
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_protected_cms_page_delete();

DROP TRIGGER IF EXISTS update_cms_pages_updated_at ON public.cms_pages;
CREATE TRIGGER update_cms_pages_updated_at
  BEFORE UPDATE ON public.cms_pages
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.cms_pages (
  title,
  slug,
  content_html,
  status,
  is_enabled,
  seo_title,
  seo_description,
  show_in_header,
  show_in_footer,
  navigation_label,
  sort_order,
  is_protected_system_page,
  allow_delete,
  published_at
)
SELECT
  seed.title,
  seed.slug,
  seed.content_html,
  'published',
  true,
  seed.seo_title,
  seed.seo_description,
  seed.show_in_header,
  seed.show_in_footer,
  seed.navigation_label,
  seed.sort_order,
  true,
  false,
  CURRENT_TIMESTAMP
FROM (
  VALUES
    (
      'Privacy Policy',
      'privacy',
      '<p>Use this page to manage your Privacy Policy content.</p>',
      'Privacy Policy | Smart Pocket',
      'Learn how Smart Pocket collects, uses, and protects personal and financial information.',
      false,
      true,
      'Privacy Policy',
      100
    ),
    (
      'Terms of Service',
      'terms',
      '<p>Use this page to manage your Terms of Service content.</p>',
      'Terms of Service | Smart Pocket',
      'Read the terms that govern access to and use of Smart Pocket.',
      false,
      true,
      'Terms of Service',
      110
    ),
    (
      'About Smart Pocket',
      'about',
      '<p>Use this page to introduce Smart Pocket, its mission, and its story.</p>',
      'About Smart Pocket',
      'Learn more about Smart Pocket and the mission behind the platform.',
      true,
      true,
      'About',
      10
    ),
    (
      'Contact Us',
      'contact',
      '<p>Use this page to manage introductory contact content above the contact form.</p>',
      'Contact Smart Pocket',
      'Contact Smart Pocket for support, privacy, or general inquiries.',
      true,
      true,
      'Contact',
      20
    ),
    (
      'Features',
      'features',
      '<p>Use this page to manage the headline and rich content shown above the features experience.</p>',
      'Features | Smart Pocket',
      'Explore Smart Pocket features for budgeting, tracking, reports, and secure finance management.',
      true,
      true,
      'Features',
      30
    ),
    (
      'Pricing',
      'pricing',
      '<p>Use this page to manage the headline and rich content shown above the pricing experience.</p>',
      'Pricing | Smart Pocket',
      'See Smart Pocket pricing, plan differences, and what is included in each plan.',
      true,
      true,
      'Pricing',
      40
    )
) AS seed(
  title,
  slug,
  content_html,
  seo_title,
  seo_description,
  show_in_header,
  show_in_footer,
  navigation_label,
  sort_order
)
WHERE NOT EXISTS (
  SELECT 1
  FROM public.cms_pages existing
  WHERE LOWER(existing.slug) = LOWER(seed.slug)
);
