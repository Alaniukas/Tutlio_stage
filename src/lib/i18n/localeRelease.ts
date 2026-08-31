import { SUPPORTED_LOCALES, LEGACY_LOCALES, type Locale } from './locales.js';

/** Public application language options. Search publication remains independently
 * gated below so releasing the UI cannot index English-fallback legal, school or
 * blog content. See docs/LOCALE_PRODUCTION_READINESS.md.
 */
export const UI_RELEASED_LOCALES: readonly Locale[] = [...SUPPORTED_LOCALES];

/** Actual database columns, independent of UI and search publication. */
export const BLOG_SCHEMA_LOCALES = [...LEGACY_LOCALES] as const;
export type BlogSchemaLocale = (typeof BLOG_SCHEMA_LOCALES)[number];

/** These files/copy must exist before adding a locale; never derive from SEO. */
export const LOCALIZED_ASSET_LOCALES: readonly Locale[] = [...LEGACY_LOCALES];
export const PLATFORM_COPY_LOCALES: readonly Locale[] = [...LEGACY_LOCALES];

export const SEO_LOCALES_BY_SURFACE: Record<SeoSurface, readonly Locale[]> = {
  marketing: [...LEGACY_LOCALES],
  schools: [...LEGACY_LOCALES],
  legal: [...LEGACY_LOCALES],
  publicPage: [...LEGACY_LOCALES],
  blog: [...LEGACY_LOCALES],
};
export type SeoSurface = 'marketing' | 'schools' | 'legal' | 'publicPage' | 'blog';

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
