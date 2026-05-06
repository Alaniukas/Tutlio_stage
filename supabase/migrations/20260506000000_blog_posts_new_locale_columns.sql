-- Add blog_posts columns for new locales: fr, es, de, se, dk, fi, no
ALTER TABLE public.blog_posts
  ADD COLUMN IF NOT EXISTS title_fr  text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS title_es  text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS title_de  text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS title_se  text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS title_dk  text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS title_fi  text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS title_no  text NOT NULL DEFAULT '';

ALTER TABLE public.blog_posts
  ADD COLUMN IF NOT EXISTS excerpt_fr  text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS excerpt_es  text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS excerpt_de  text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS excerpt_se  text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS excerpt_dk  text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS excerpt_fi  text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS excerpt_no  text NOT NULL DEFAULT '';

ALTER TABLE public.blog_posts
  ADD COLUMN IF NOT EXISTS content_fr  text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS content_es  text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS content_de  text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS content_se  text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS content_dk  text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS content_fi  text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS content_no  text NOT NULL DEFAULT '';
