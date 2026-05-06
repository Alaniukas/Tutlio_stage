import type { Locale } from '@/lib/i18n/core';

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

const DATE_LOCALE_MAP: Partial<Record<Locale, string>> = {
  lt: 'lt-LT', en: 'en-US', pl: 'pl-PL', lv: 'lv-LV', ee: 'et-EE',
};

export function formatBlogDate(date: string, locale: Locale, opts?: Intl.DateTimeFormatOptions): string {
  return new Date(date).toLocaleDateString(DATE_LOCALE_MAP[locale] || 'lt-LT', opts);
}
