-- Auto-publish and optional draft email notification for SEO blog cron.

ALTER TABLE public.blog_auto_settings
  ADD COLUMN IF NOT EXISTS auto_publish boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_on_draft boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.blog_auto_settings.auto_publish IS 'When true, cron publishes posts immediately instead of saving drafts';
COMMENT ON COLUMN public.blog_auto_settings.notify_on_draft IS 'When true and auto_publish is false, send draft-ready email after generation';

UPDATE public.blog_auto_settings
SET auto_publish = COALESCE(auto_publish, true),
    notify_on_draft = COALESCE(notify_on_draft, false);
