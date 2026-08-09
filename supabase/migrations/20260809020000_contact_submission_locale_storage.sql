ALTER TABLE IF EXISTS public.contact_submissions
ADD COLUMN IF NOT EXISTS locale_code TEXT NOT NULL DEFAULT 'en';

ALTER TABLE IF EXISTS public.support_tickets
ADD COLUMN IF NOT EXISTS locale_code TEXT NOT NULL DEFAULT 'en';

NOTIFY pgrst, 'reload schema';
