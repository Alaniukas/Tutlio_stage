-- Switch auto blog cadence default to daily (1 day).

UPDATE public.blog_auto_settings
SET interval_days = 1, updated_at = now()
WHERE interval_days = 2;

ALTER TABLE public.blog_auto_settings
  ALTER COLUMN interval_days SET DEFAULT 1;
