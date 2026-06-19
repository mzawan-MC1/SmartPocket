-- ============================================================
-- Smart Pocket — Cleanup marketing CMS pages
-- Migration: 20260619124500_cleanup_marketing_cms_pages.sql
-- Removes standalone CMS records for marketing sections that now
-- live exclusively on the homepage.
-- ============================================================

UPDATE public.cms_pages
SET
  show_in_header = false,
  show_in_footer = false,
  is_protected_system_page = false,
  allow_delete = true
WHERE slug IN ('about', 'features', 'pricing', 'contact');

DELETE FROM public.cms_pages
WHERE slug IN ('about', 'features', 'pricing', 'contact');
