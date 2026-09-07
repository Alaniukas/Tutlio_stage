-- Read-only preflight. Run against the explicitly approved release database.
-- Both preference rows must report ready=true before enabling draft UI options.
WITH expected(locale) AS (
  VALUES ('lt'), ('en'), ('pl'), ('lv'), ('ee'), ('fr'), ('es'), ('de'),
    ('se'), ('dk'), ('fi'), ('no'), ('nl'), ('it'), ('pt'), ('ro'), ('cs'),
    ('el'), ('hu'), ('bg'), ('hr'), ('sk'), ('sl'), ('hi'), ('ko'), ('ja'),
    ('id'), ('ar'), ('pt-br'), ('es-mx'), ('fil'), ('he'), ('uk'),
    ('zh-hk'), ('tr'), ('th')
), checks AS (
  SELECT target.table_name, pg_get_constraintdef(c.oid) AS definition, c.convalidated
  FROM (VALUES ('profiles'), ('organizations')) AS target(table_name)
  LEFT JOIN pg_constraint c
    ON c.conrelid = to_regclass('public.' || target.table_name)
    AND c.conname = target.table_name || '_preferred_locale_check'
    AND c.contype = 'c'
), preference_results AS (
SELECT table_name,
  definition IS NOT NULL AND bool_and(convalidated AND strpos(definition, quote_literal(locale)) > 0) AS ready,
  array_agg(locale ORDER BY locale) FILTER (WHERE definition IS NULL OR strpos(definition, quote_literal(locale)) = 0) AS missing_locales,
  definition
FROM checks CROSS JOIN expected
GROUP BY table_name, definition
),

-- Blog schema is deliberately a separate release surface. This checks only the
-- existing 13-language columns, not whether individual posts have reviewed copy.
locales(locale) AS (
  VALUES ('lt'), ('en'), ('pl'), ('lv'), ('ee'), ('fr'), ('es'), ('de'),
    ('se'), ('dk'), ('fi'), ('no'), ('nl')
), fields(field) AS (VALUES ('title'), ('excerpt'), ('content'), ('slug')), blog_result AS (
SELECT array_agg(field || '_' || locale ORDER BY locale, field) FILTER (WHERE column_name IS NULL) AS missing_blog_columns
FROM locales CROSS JOIN fields
LEFT JOIN information_schema.columns
  ON table_schema = 'public' AND table_name = 'blog_posts' AND column_name = field || '_' || locale
)
SELECT (SELECT json_agg(preference_results ORDER BY table_name) FROM preference_results) AS preferences,
  (SELECT missing_blog_columns FROM blog_result) AS missing_blog_columns;
