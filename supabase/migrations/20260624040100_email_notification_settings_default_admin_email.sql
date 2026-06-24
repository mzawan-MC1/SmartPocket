UPDATE public.email_notification_settings
SET admin_notification_email = NULL
WHERE singleton_lock = true
  AND admin_notification_email = 'saaspersonalexp@gmail.com'
  AND updated_at = created_at;

NOTIFY pgrst, 'reload schema';
