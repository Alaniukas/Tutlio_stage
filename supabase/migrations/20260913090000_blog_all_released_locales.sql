-- Publish native blog articles in every released Tutlio locale.
-- URL locale codes containing hyphens use underscore-safe PostgreSQL suffixes.

DO $$
DECLARE
  locale_suffix text;
  slug_column text;
BEGIN
  FOREACH locale_suffix IN ARRAY ARRAY[
    'th', 'tr', 'zh_hk', 'it', 'pt', 'ro', 'cs', 'el', 'hu', 'bg', 'hr',
    'sk', 'sl', 'hi', 'ko', 'ja', 'id', 'ar', 'pt_br', 'es_mx', 'fil', 'he', 'uk'
  ]
  LOOP
    EXECUTE format(
      'ALTER TABLE public.blog_posts ADD COLUMN IF NOT EXISTS %I text NOT NULL DEFAULT %L',
      'title_' || locale_suffix,
      ''
    );
    EXECUTE format(
      'ALTER TABLE public.blog_posts ADD COLUMN IF NOT EXISTS %I text NOT NULL DEFAULT %L',
      'excerpt_' || locale_suffix,
      ''
    );
    EXECUTE format(
      'ALTER TABLE public.blog_posts ADD COLUMN IF NOT EXISTS %I text NOT NULL DEFAULT %L',
      'content_' || locale_suffix,
      ''
    );
    EXECUTE format(
      'ALTER TABLE public.blog_posts ADD COLUMN IF NOT EXISTS %I text',
      'slug_' || locale_suffix
    );

    slug_column := 'slug_' || locale_suffix;
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS %I ON public.blog_posts (%I) WHERE %I IS NOT NULL',
      'idx_blog_posts_' || slug_column,
      slug_column,
      slug_column
    );
  END LOOP;
END
$$;

COMMENT ON COLUMN public.blog_posts.title_zh_hk IS 'Traditional Chinese (Hong Kong) blog title';
COMMENT ON COLUMN public.blog_posts.title_pt_br IS 'Brazilian Portuguese blog title';
COMMENT ON COLUMN public.blog_posts.title_es_mx IS 'Mexican Spanish blog title';
