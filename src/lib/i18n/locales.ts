/** Locale identifiers shared by the browser UI and server-side support agent. */
export const SUPPORTED_LOCALES = [
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

export type Locale = (typeof SUPPORTED_LOCALES)[number];

/** English language names used in Luna's server-side response instruction. */
export const SUPPORT_LOCALE_NAMES: Record<Locale, string> = {
  lt: 'Lithuanian',
  en: 'English',
  pl: 'Polish',
  lv: 'Latvian',
  ee: 'Estonian',
  fr: 'French',
  es: 'Spanish',
  de: 'German',
  se: 'Swedish',
  dk: 'Danish',
  fi: 'Finnish',
  no: 'Norwegian',
  nl: 'Dutch',
};
