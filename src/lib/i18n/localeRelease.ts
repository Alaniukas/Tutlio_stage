import { SUPPORTED_LOCALES, LEGACY_LOCALES, PENDING_TRANSLATION_LOCALES, type Locale } from './locales.js';

/** Public application language options. Search publication remains independently
 * gated below so releasing the UI cannot index English-fallback legal, school or
 * blog content. See docs/LOCALE_PRODUCTION_READINESS.md.
 */
export const UI_RELEASED_LOCALES: readonly Locale[] = [...SUPPORTED_LOCALES];

/** Actual database columns, independent of UI and search publication. */
export const BLOG_SCHEMA_LOCALES = [...SUPPORTED_LOCALES] as const;
export type BlogSchemaLocale = (typeof BLOG_SCHEMA_LOCALES)[number];

export type BlogLocaleField = 'title' | 'excerpt' | 'content' | 'slug';

/**
 * PostgreSQL column suffixes cannot safely use our hyphenated URL locale codes.
 * Keep this mapping centralized so `zh-hk`, `pt-br`, and `es-mx` are stored as
 * `*_zh_hk`, `*_pt_br`, and `*_es_mx` everywhere.
 */
export function blogLocaleColumn(field: BlogLocaleField, locale: BlogSchemaLocale): string {
  return `${field}_${locale.replace(/-/g, '_')}`;
}

/** A public article must never mix a native title with fallback body copy. */
export function hasCompleteBlogLocale(
  post: Record<string, unknown>,
  locale: BlogSchemaLocale,
): boolean {
  return (['title', 'excerpt', 'content', 'slug'] as const).every(
    (field) => String(post[blogLocaleColumn(field, locale)] || '').trim().length > 0,
  );
}

/** These files/copy must exist before adding a locale; never derive from SEO. */
export const LOCALIZED_ASSET_LOCALES: readonly Locale[] = [...LEGACY_LOCALES];
export const PLATFORM_COPY_LOCALES: readonly Locale[] = [...LEGACY_LOCALES];

/**
 * 2026-09-12: every registered locale renders fully localized marketing,
 * feature, schools, public-page and blog HTML. Legal pages stay on the legacy
 * 13 until their reviewed legal copy is released.
 */
const ALL_LOCALES: readonly Locale[] = [...LEGACY_LOCALES, ...PENDING_TRANSLATION_LOCALES];

export const SEO_LOCALES_BY_SURFACE: Record<SeoSurface, readonly Locale[]> = {
  marketing: [...ALL_LOCALES],
  schools: [...ALL_LOCALES],
  legal: [...LEGACY_LOCALES],
  publicPage: [...ALL_LOCALES],
  blog: [...BLOG_SCHEMA_LOCALES],
  // Competitor comparisons are hand-written per market rather than translated
  // UI copy, so only the three domain languages are published to search.
  compare: ['en', 'lt', 'pl'],
};
export type SeoSurface = 'marketing' | 'schools' | 'legal' | 'publicPage' | 'blog' | 'compare';

/** Known dictionaries that are still withheld from public selectors. */
export const DRAFT_UI_LOCALES = SUPPORTED_LOCALES.filter(
  (locale) => !UI_RELEASED_LOCALES.includes(locale),
);

export function selectableLocales(includeDrafts = false): readonly Locale[] {
  return includeDrafts ? [...UI_RELEASED_LOCALES, ...DRAFT_UI_LOCALES] : UI_RELEASED_LOCALES;
}

export function hasBlogSchema(locale: string): locale is BlogSchemaLocale {
  return (BLOG_SCHEMA_LOCALES as readonly string[]).includes(locale);
}

export function hasLocalizedAssets(locale: Locale): boolean {
  return LOCALIZED_ASSET_LOCALES.includes(locale);
}

export function seoSurfaceForPath(path: string): SeoSurface {
  const segments = path.split(/[?#]/)[0].split('/').filter(Boolean);
  if ((SUPPORTED_LOCALES as readonly string[]).includes(segments[0])) segments.shift();
  if (segments[0] === 'schools') return 'schools';
  if (segments[0] === 'compare') return 'compare';
  if (['privacy-policy', 'terms', 'dpa'].includes(segments[0])) return 'legal';
  if (segments[0] === 'blog') return 'blog';
  if (['tutor', 'korepetitorius'].includes(segments[0])) return 'publicPage';
  return 'marketing';
}

export function seoLocalesForPath(path: string): readonly Locale[] {
  const surface = seoSurfaceForPath(path);
  const locales = SEO_LOCALES_BY_SURFACE[surface];
  // Search publication must never cause a query against nonexistent blog columns.
  return surface === 'blog' ? locales.filter(hasBlogSchema) : locales;
}

export function isSeoPublished(locale: Locale, path: string): boolean {
  return seoLocalesForPath(path).includes(locale);
}
