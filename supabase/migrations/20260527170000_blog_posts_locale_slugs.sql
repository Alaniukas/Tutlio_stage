-- Add per-locale slug columns for SEO-friendly localized blog URLs
ALTER TABLE public.blog_posts
  ADD COLUMN IF NOT EXISTS slug_lt text,
  ADD COLUMN IF NOT EXISTS slug_en text,
  ADD COLUMN IF NOT EXISTS slug_pl text,
  ADD COLUMN IF NOT EXISTS slug_lv text,
  ADD COLUMN IF NOT EXISTS slug_ee text,
  ADD COLUMN IF NOT EXISTS slug_fr text,
  ADD COLUMN IF NOT EXISTS slug_es text,
  ADD COLUMN IF NOT EXISTS slug_de text,
  ADD COLUMN IF NOT EXISTS slug_se text,
  ADD COLUMN IF NOT EXISTS slug_dk text,
  ADD COLUMN IF NOT EXISTS slug_fi text,
  ADD COLUMN IF NOT EXISTS slug_no text;

-- Backfill slug_lt from the existing universal slug column
UPDATE public.blog_posts SET slug_lt = slug WHERE slug_lt IS NULL;

-- Indexes for locale-specific slug lookups (partial: only non-null)
CREATE INDEX IF NOT EXISTS idx_blog_posts_slug_lt ON public.blog_posts (slug_lt) WHERE slug_lt IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_blog_posts_slug_en ON public.blog_posts (slug_en) WHERE slug_en IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_blog_posts_slug_pl ON public.blog_posts (slug_pl) WHERE slug_pl IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_blog_posts_slug_lv ON public.blog_posts (slug_lv) WHERE slug_lv IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_blog_posts_slug_ee ON public.blog_posts (slug_ee) WHERE slug_ee IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_blog_posts_slug_fr ON public.blog_posts (slug_fr) WHERE slug_fr IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_blog_posts_slug_es ON public.blog_posts (slug_es) WHERE slug_es IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_blog_posts_slug_de ON public.blog_posts (slug_de) WHERE slug_de IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_blog_posts_slug_se ON public.blog_posts (slug_se) WHERE slug_se IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_blog_posts_slug_dk ON public.blog_posts (slug_dk) WHERE slug_dk IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_blog_posts_slug_fi ON public.blog_posts (slug_fi) WHERE slug_fi IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_blog_posts_slug_no ON public.blog_posts (slug_no) WHERE slug_no IS NOT NULL;
