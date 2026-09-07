import { LOCALE_FORMAT_TAGS } from './i18n/locales';
import { hasBlogSchema } from './i18n/localeRelease';
import type { Locale } from '@/lib/i18n/core';
import { buildLocalizedPath } from '@/lib/i18n';

/**
 * Resolves a localized blog field with fallback: current locale -> en -> lt.
 */
export function resolveField(post: Record<string, unknown>, field: string, locale: Locale): string {
  const val = post[`${field}_${locale}`];
  if (val && typeof val === 'string') return val;
  if (locale !== 'en') {
    const en = post[`${field}_en`];
    if (en && typeof en === 'string') return en;
  }
  const lt = post[`${field}_lt`];
  return (lt && typeof lt === 'string') ? lt : '';
}

/** Locale-specific URL slug, falling back to the universal slug column. */
export function postSlug(post: Record<string, unknown>, locale: Locale): string {
  const localized = post[`slug_${hasBlogSchema(locale) ? locale : 'en'}`];
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
