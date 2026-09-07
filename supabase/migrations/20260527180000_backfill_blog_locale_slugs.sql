-- Generate localized URL slugs from existing title_* columns (one-time backfill)
CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.blog_slugify(input text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT left(
    trim(both '-' FROM regexp_replace(
      regexp_replace(
        lower(extensions.unaccent(trim(coalesce(input, '')))),
        '[^a-z0-9]+', '-', 'g'
      ),
      '-+', '-', 'g'
    )),
    80
  );
$$;

UPDATE public.blog_posts SET slug_lt = public.blog_slugify(title_lt)
WHERE trim(coalesce(title_lt, '')) <> '' AND (slug_lt IS NULL OR trim(slug_lt) = '');

UPDATE public.blog_posts SET slug_en = public.blog_slugify(title_en)
WHERE trim(coalesce(title_en, '')) <> '' AND (slug_en IS NULL OR trim(slug_en) = '');

UPDATE public.blog_posts SET slug_pl = public.blog_slugify(title_pl)
WHERE trim(coalesce(title_pl, '')) <> '' AND (slug_pl IS NULL OR trim(slug_pl) = '');

UPDATE public.blog_posts SET slug_lv = public.blog_slugify(title_lv)
WHERE trim(coalesce(title_lv, '')) <> '' AND (slug_lv IS NULL OR trim(slug_lv) = '');

UPDATE public.blog_posts SET slug_ee = public.blog_slugify(title_ee)
WHERE trim(coalesce(title_ee, '')) <> '' AND (slug_ee IS NULL OR trim(slug_ee) = '');

UPDATE public.blog_posts SET slug_fr = public.blog_slugify(title_fr)
WHERE trim(coalesce(title_fr, '')) <> '' AND (slug_fr IS NULL OR trim(slug_fr) = '');

UPDATE public.blog_posts SET slug_es = public.blog_slugify(title_es)
WHERE trim(coalesce(title_es, '')) <> '' AND (slug_es IS NULL OR trim(slug_es) = '');

UPDATE public.blog_posts SET slug_de = public.blog_slugify(title_de)
WHERE trim(coalesce(title_de, '')) <> '' AND (slug_de IS NULL OR trim(slug_de) = '');

UPDATE public.blog_posts SET slug_se = public.blog_slugify(title_se)
WHERE trim(coalesce(title_se, '')) <> '' AND (slug_se IS NULL OR trim(slug_se) = '');

UPDATE public.blog_posts SET slug_dk = public.blog_slugify(title_dk)
WHERE trim(coalesce(title_dk, '')) <> '' AND (slug_dk IS NULL OR trim(slug_dk) = '');

UPDATE public.blog_posts SET slug_fi = public.blog_slugify(title_fi)
WHERE trim(coalesce(title_fi, '')) <> '' AND (slug_fi IS NULL OR trim(slug_fi) = '');

UPDATE public.blog_posts SET slug_no = public.blog_slugify(title_no)
WHERE trim(coalesce(title_no, '')) <> '' AND (slug_no IS NULL OR trim(slug_no) = '');

-- Keep universal slug in sync with Lithuanian canonical slug for legacy lookups
UPDATE public.blog_posts SET slug = slug_lt
WHERE slug_lt IS NOT NULL AND trim(slug_lt) <> '' AND slug IS DISTINCT FROM slug_lt;
