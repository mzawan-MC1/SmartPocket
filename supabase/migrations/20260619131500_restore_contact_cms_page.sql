-- ============================================================
-- Smart Pocket — Restore standalone contact CMS page
-- Migration: 20260619131500_restore_contact_cms_page.sql
-- Recreates the protected contact CMS page if it was removed by
-- earlier marketing-page cleanup, without touching Privacy/Terms.
-- ============================================================

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
  'Contact Us',
  'contact',
  '<p>Have a question, support request, or business inquiry? Use the form below and our team will get back to you as soon as possible.</p><p>You can also use the contact details below, which are managed from Platform Settings.</p>',
  'published',
  true,
  'Contact Smart Pocket',
  'Contact Smart Pocket for support, privacy, billing, or general inquiries.',
  false,
  false,
  'Contact',
  20,
  true,
  false,
  CURRENT_TIMESTAMP
WHERE NOT EXISTS (
  SELECT 1
  FROM public.cms_pages existing
  WHERE LOWER(existing.slug) = 'contact'
);
