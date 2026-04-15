import { lt } from './lt';
import { en } from './en';
import { pl } from './pl';
import { lv } from './lv';
import { ee } from './ee';
import { resolvePlatformTranslation } from './platformOverrides';
import { type Platform, DEFAULT_PLATFORM } from '@/lib/platform';

export type Locale = 'lt' | 'en' | 'pl' | 'lv' | 'ee';

export const SUPPORTED_LOCALES: Locale[] = ['lt', 'en', 'pl', 'lv', 'ee'];

export const LOCALE_LABELS: Record<Locale, string> = {
  lt: 'LT',
  en: 'EN',
  pl: 'PL',
  lv: 'LV',
  ee: 'EE',
};

export const LOCALE_NAMES: Record<Locale, string> = {
  lt: 'Lietuvių',
  en: 'English',
  pl: 'Polski',
  lv: 'Latviešu',
  ee: 'Eesti',
};

const translations: Record<Locale, Record<string, string>> = { lt, en, pl, lv, ee };

export function t(
  locale: Locale,
  key: string,
  params?: Record<string, string | number>,
  platform: Platform = DEFAULT_PLATFORM,
): string {
  let text = translations[locale]?.[key] ?? translations.en[key] ?? translations.lt[key] ?? key;
  if (platform !== DEFAULT_PLATFORM) {
    text = resolvePlatformTranslation(platform, locale, key, text);
  }
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      text = text.replaceAll(`{${k}}`, String(v));
    }
  }
  return text;
}

export function detectLocaleFromHost(host: string): Locale {
  if (host.includes('tutlio.com')) return 'en';
  return 'lt';
}

export function isValidLocale(value: string): value is Locale {
  return SUPPORTED_LOCALES.includes(value as Locale);
}
