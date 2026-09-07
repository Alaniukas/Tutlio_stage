/** Legacy 13-locale baseline. Do not add releases here: use localeRelease.ts.
 * Retained for dictionary coverage and backwards compatibility only. */
export const LEGACY_LOCALES = [
  'lt',
  'en',
  'pl',
  'lv',
  'ee',
  'fr',
  'es',
  'de',
  'se',
  'dk',
  'fi',
  'no',
  'nl',
] as const;

/** @deprecated Historical name; release decisions belong in localeRelease.ts. */
export const TRANSLATED_LOCALES = LEGACY_LOCALES;

/** Locales added after the legacy baseline. Their UI is released independently,
 * while native-copy review and search publication remain separately gated. */
export const PENDING_TRANSLATION_LOCALES = [
  'th',
  'tr',
  'zh-hk',
  'it',
  'pt',
  'ro',
  'cs',
  'el',
  'hu',
  'bg',
  'hr',
  'sk',
  'sl',
  'hi',
  'ko',
  'ja',
  'id',
  'ar',
  'pt-br',
  'es-mx',
  'fil',
  'he',
  'uk',
] as const;

export const SUPPORTED_LOCALES = [...TRANSLATED_LOCALES, ...PENDING_TRANSLATION_LOCALES] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];
export type TranslatedLocale = (typeof TRANSLATED_LOCALES)[number];

export function isTranslatedLocale(locale: string): locale is TranslatedLocale {
  return (TRANSLATED_LOCALES as readonly string[]).includes(locale);
}

export const LOCALE_LABELS: Record<Locale, string> = {
  th: 'TH',
  tr: 'TR',
  'zh-hk': 'HK',
  'lt': 'LT',
  'en': 'EN',
  'pl': 'PL',
  'lv': 'LV',
  'ee': 'EE',
  'fr': 'FR',
  'es': 'ES',
  'de': 'DE',
  'se': 'SE',
  'dk': 'DK',
  'fi': 'FI',
  'no': 'NO',
  'nl': 'NL',
  'it': 'IT',
  'pt': 'PT',
  'ro': 'RO',
  'cs': 'CS',
  'el': 'EL',
  'hu': 'HU',
  'bg': 'BG',
  'hr': 'HR',
  'sk': 'SK',
  'sl': 'SL',
  'hi': 'HI',
  'ko': 'KO',
  'ja': 'JA',
  'id': 'ID',
  'ar': 'AR',
  'pt-br': 'PT-BR',
  'es-mx': 'ES-MX',
  'fil': 'FIL',
  'he': 'HE',
  'uk': 'UA',
};

export const LOCALE_NAMES: Record<Locale, string> = {
  th: 'ไทย',
  tr: 'Türkçe',
  'zh-hk': '繁體中文（香港）',
  uk: 'Українська',
  'lt': 'Lietuvių',
  'en': 'English',
  'pl': 'Polski',
  'lv': 'Latviešu',
  'ee': 'Eesti',
  'fr': 'Français',
  'es': 'Español',
  'de': 'Deutsch',
  'se': 'Svenska',
  'dk': 'Dansk',
  'fi': 'Suomi',
  'no': 'Norsk',
  'nl': 'Nederlands',
  'it': 'Italiano',
  'pt': 'Português',
  'ro': 'Română',
  'cs': 'Čeština',
  'el': 'Ελληνικά',
  'hu': 'Magyar',
  'bg': 'Български',
  'hr': 'Hrvatski',
  'sk': 'Slovenčina',
  'sl': 'Slovenščina',
  'hi': 'हिन्दी',
  'ko': '한국어',
  'ja': '日本語',
  'id': 'Bahasa Indonesia',
  'ar': 'العربية',
  'pt-br': 'Português (Brasil)',
  'es-mx': 'Español (México)',
  'fil': 'Filipino',
  'he': 'עברית',
};

/** English names for the support agent's response-language instruction. */
export const SUPPORT_LOCALE_NAMES: Record<Locale, string> = {
  th: 'Thai',
  tr: 'Turkish',
  'zh-hk': 'Traditional Chinese (Hong Kong)',
  uk: 'Ukrainian',
  'lt': 'Lithuanian',
  'en': 'English',
  'pl': 'Polish',
  'lv': 'Latvian',
  'ee': 'Estonian',
  'fr': 'French',
  'es': 'Spanish',
  'de': 'German',
  'se': 'Swedish',
  'dk': 'Danish',
  'fi': 'Finnish',
  'no': 'Norwegian',
  'nl': 'Dutch',
  'it': 'Italian',
  'pt': 'Portuguese',
  'ro': 'Romanian',
  'cs': 'Czech',
  'el': 'Greek',
  'hu': 'Hungarian',
  'bg': 'Bulgarian',
  'hr': 'Croatian',
  'sk': 'Slovak',
  'sl': 'Slovenian',
  'hi': 'Hindi',
  'ko': 'Korean',
  'ja': 'Japanese',
  'id': 'Indonesian',
  'ar': 'Arabic',
  'pt-br': 'Brazilian Portuguese',
  'es-mx': 'Mexican Spanish',
  'fil': 'Filipino',
  'he': 'Hebrew',
};

/** BCP 47 tags for Intl formatting; URL slugs retain historical ee/se/dk codes. */
export const LOCALE_FORMAT_TAGS: Record<Locale, string> = {
  // Keep booking years Gregorian rather than Intl's default Buddhist calendar.
  th: 'th-TH-u-ca-gregory',
  tr: 'tr-TR',
  'zh-hk': 'zh-HK',
  uk: 'uk-UA',
  'lt': 'lt-LT',
  'en': 'en-US',
  'pl': 'pl-PL',
  'lv': 'lv-LV',
  'ee': 'et-EE',
  'fr': 'fr-FR',
  'es': 'es-ES',
  'de': 'de-DE',
  'se': 'sv-SE',
  'dk': 'da-DK',
  'fi': 'fi-FI',
  'no': 'nb-NO',
  'nl': 'nl-NL',
  'it': 'it-IT',
  'pt': 'pt-PT',
  'ro': 'ro-RO',
  'cs': 'cs-CZ',
  'el': 'el-GR',
  'hu': 'hu-HU',
  'bg': 'bg-BG',
  'hr': 'hr-HR',
  'sk': 'sk-SK',
  'sl': 'sl-SI',
  'hi': 'hi-IN',
  'ko': 'ko-KR',
  'ja': 'ja-JP',
  'id': 'id-ID',
  // Lesson dates stay Gregorian, matching date-fns and stored booking dates.
  'ar': 'ar-SA-u-ca-gregory',
  'pt-br': 'pt-BR',
  'es-mx': 'es-MX',
  'fil': 'fil-PH',
  'he': 'he-IL-u-ca-gregory',
};

export function htmlLanguageCode(locale: Locale): string {
  if (locale.includes('-')) return LOCALE_FORMAT_TAGS[locale];
  if (locale === 'no') return 'no';
  return LOCALE_FORMAT_TAGS[locale].split('-')[0];
}

export function localeDirection(locale: Locale): 'ltr' | 'rtl' {
  return locale === 'ar' || locale === 'he' ? 'rtl' : 'ltr';
}

/** Static copy outside the dictionaries keeps a safe English default. */
export function withEnglishLocaleFallback<T>(values: { en: T } & Partial<Record<Locale, T>>): Record<Locale, T> {
  return Object.fromEntries(SUPPORTED_LOCALES.map((locale) => [locale, values[locale] ?? values.en])) as Record<Locale, T>;
}
