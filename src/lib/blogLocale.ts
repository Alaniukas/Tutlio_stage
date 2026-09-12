import { LOCALE_FORMAT_TAGS } from './i18n/locales';
import { blogLocaleColumn, hasBlogSchema } from './i18n/localeRelease';
import type { Locale } from '@/lib/i18n/core';
import { buildLocalizedPath } from '@/lib/i18n';

/**
 * Resolves a localized blog field with fallback: current locale -> en -> lt.
 */
export function resolveField(post: Record<string, unknown>, field: string, locale: Locale): string {
  const safeLocale = hasBlogSchema(locale) ? locale : 'en';
  const val = post[blogLocaleColumn(field as 'title' | 'excerpt' | 'content' | 'slug', safeLocale)];
  if (val && typeof val === 'string') return val;
  if (locale !== 'en') {
    const en = post[blogLocaleColumn(field as 'title' | 'excerpt' | 'content' | 'slug', 'en')];
    if (en && typeof en === 'string') return en;
  }
  const lt = post[blogLocaleColumn(field as 'title' | 'excerpt' | 'content' | 'slug', 'lt')];
  return (lt && typeof lt === 'string') ? lt : '';
}

/** Locale-specific URL slug, falling back to the universal slug column. */
export function postSlug(post: Record<string, unknown>, locale: Locale): string {
  const localized = post[blogLocaleColumn('slug', hasBlogSchema(locale) ? locale : 'en')];
  if (typeof localized === 'string' && localized.trim()) return localized.trim();
  return String(post.slug || '');
}

/** Localized path to a blog post, e.g. `/se/blog/my-slug`. */
export function blogPostPath(post: Record<string, unknown>, locale: Locale): string {
  return buildLocalizedPath(`/blog/${postSlug(post, locale)}`, locale);
}

const DATE_LOCALE_MAP = LOCALE_FORMAT_TAGS;

export function formatBlogDate(date: string, locale: Locale, opts?: Intl.DateTimeFormatOptions): string {
  return new Date(date).toLocaleDateString(DATE_LOCALE_MAP[locale] || 'lt-LT', opts);
}
