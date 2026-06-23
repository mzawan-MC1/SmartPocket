-- Add the missing global SEO keywords field used by /admin/seo.

ALTER TABLE public.platform_settings
ADD COLUMN IF NOT EXISTS keywords TEXT;

NOTIFY pgrst, 'reload schema';