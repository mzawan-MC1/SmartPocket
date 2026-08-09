-- ============================================================
-- Smart Pocket — Expand FAQ Translation Languages to 8
-- Migration: 20260808000000_faq_language_expand_8_locales.sql
--
-- Adds tr (Türkçe), zh-CN (简体中文), es (Español), pt-BR (Português (Brasil))
-- alongside the existing en/ar/fr/ru support for faq_category_translations and
-- faq_item_translations language_code CHECK constraints.
--
-- Idempotent: DROP CONSTRAINT IF EXISTS, then re-create in a fresh 8-entry CHECK.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. faq_category_translations
-- ------------------------------------------------------------
ALTER TABLE public.faq_category_translations
  DROP CONSTRAINT IF EXISTS faq_category_translations_language_check;

ALTER TABLE public.faq_category_translations
  ADD CONSTRAINT faq_category_translations_language_check
  CHECK (language_code IN ('en', 'ar', 'fr', 'ru', 'tr', 'zh-CN', 'es', 'pt-BR'));

-- ------------------------------------------------------------
-- 2. faq_item_translations
-- ------------------------------------------------------------
ALTER TABLE public.faq_item_translations
  DROP CONSTRAINT IF EXISTS faq_item_translations_language_check;

ALTER TABLE public.faq_item_translations
  ADD CONSTRAINT faq_item_translations_language_check
  CHECK (language_code IN ('en', 'ar', 'fr', 'ru', 'tr', 'zh-CN', 'es', 'pt-BR'));

COMMIT;
