-- Add Dutch (nl) as a supported UI locale and blog-content locale.

DO $$
DECLARE
  constraint_row record;
BEGIN
  FOR constraint_row IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.profiles'::regclass
      AND contype = 'c'
      AND conname LIKE '%preferred_locale%'
  LOOP
    EXECUTE 'ALTER TABLE public.profiles DROP CONSTRAINT ' || quote_ident(constraint_row.conname);
  END LOOP;
END $$;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_preferred_locale_check
  CHECK (preferred_locale IS NULL OR preferred_locale IN ('lt', 'en', 'pl', 'lv', 'ee', 'fr', 'es', 'de', 'se', 'dk', 'fi', 'no', 'nl'));

DO $$
DECLARE
  constraint_row record;
BEGIN
  FOR constraint_row IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.organizations'::regclass
      AND contype = 'c'
      AND conname LIKE '%preferred_locale%'
  LOOP
    EXECUTE 'ALTER TABLE public.organizations DROP CONSTRAINT ' || quote_ident(constraint_row.conname);
  END LOOP;
END $$;

ALTER TABLE public.organizations
  ADD CONSTRAINT organizations_preferred_locale_check
  CHECK (preferred_locale IS NULL OR preferred_locale IN ('lt', 'en', 'pl', 'lv', 'ee', 'fr', 'es', 'de', 'se', 'dk', 'fi', 'no', 'nl'));

ALTER TABLE public.blog_posts
  ADD COLUMN IF NOT EXISTS title_nl text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS excerpt_nl text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS content_nl text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS slug_nl text;

CREATE INDEX IF NOT EXISTS idx_blog_posts_slug_nl
  ON public.blog_posts (slug_nl)
  WHERE slug_nl IS NOT NULL;
