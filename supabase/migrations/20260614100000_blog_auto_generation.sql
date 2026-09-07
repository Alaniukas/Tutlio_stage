-- Automated SEO blog generation: keywords queue, settings, generation log.

ALTER TABLE public.blog_posts
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS generation_keyword text;

COMMENT ON COLUMN public.blog_posts.source IS 'manual | auto';
COMMENT ON COLUMN public.blog_posts.generation_keyword IS 'Keyword used when source=auto';

CREATE TABLE IF NOT EXISTS public.blog_auto_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enabled boolean NOT NULL DEFAULT false,
  interval_days integer NOT NULL DEFAULT 2 CHECK (interval_days >= 1 AND interval_days <= 30),
  last_run_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.blog_auto_settings (enabled, interval_days)
SELECT false, 2
WHERE NOT EXISTS (SELECT 1 FROM public.blog_auto_settings LIMIT 1);

CREATE TABLE IF NOT EXISTS public.blog_auto_keywords (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  keyword text NOT NULL,
  tag text NOT NULL DEFAULT '',
  enabled boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  last_used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_blog_auto_keywords_enabled_sort
  ON public.blog_auto_keywords (enabled, sort_order, last_used_at NULLS FIRST);

CREATE TABLE IF NOT EXISTS public.blog_generation_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid REFERENCES public.blog_posts(id) ON DELETE SET NULL,
  keyword text NOT NULL,
  status text NOT NULL CHECK (status IN ('success', 'failed')),
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_blog_generation_log_created
  ON public.blog_generation_log (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_blog_posts_generation_keyword
  ON public.blog_posts (generation_keyword, created_at DESC)
  WHERE generation_keyword IS NOT NULL;

ALTER TABLE public.blog_auto_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blog_auto_keywords ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blog_generation_log ENABLE ROW LEVEL SECURITY;

-- Service role only (admin API uses service role key).
