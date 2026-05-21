import type { Locale as FullLocale } from './seo-routing.js';
import { LOCALES } from './seo-routing.js';
import { lt } from '../../src/lib/i18n/lt.js';
import { en } from '../../src/lib/i18n/en.js';
import { pl } from '../../src/lib/i18n/pl.js';
import { lv } from '../../src/lib/i18n/lv.js';
import { ee } from '../../src/lib/i18n/ee.js';
import { fr } from '../../src/lib/i18n/fr.js';
import { es } from '../../src/lib/i18n/es.js';
import { de } from '../../src/lib/i18n/de.js';
import { se } from '../../src/lib/i18n/se.js';
import { dk } from '../../src/lib/i18n/dk.js';
import { fi } from '../../src/lib/i18n/fi.js';
import { no } from '../../src/lib/i18n/no.js';

export type Locale = FullLocale;

export function isValidLocale(v: unknown): v is Locale {
  return typeof v === 'string' && (LOCALES as readonly string[]).includes(v);
}

const translations: Record<Locale, Record<string, string>> = {
  lt, en, pl, lv, ee, fr, es, de, se, dk, fi, no,
};

/** Server funkcijose kai kur bundle neįtraukia naujausių raktų – būtiniausi el. pašto fragmentai čia visada. */
const EMAIL_SERVER_FALLBACKS: Partial<Record<Locale, Record<string, string>>> = {
  lt: {
    'em.manualPayInstructionsLead':
      'Pamoką apmokėkite pagal žemiau pateiktus korepetitoriaus duomenis iki nurodyto termino (kortele per platformą šio korepetitoriaus mokėjimas negalimas).',
    'em.manualPayPortalHint':
      'Po pavedimo ar kito mokėjimo korepetitorius pažymės pamoką apmokėtą sistemoje — būseną pamatysite „Pamokų“ puslapyje Tutlio aplikacijoje.',
    'em.btnStudentSessionsPay': 'Atidaryti pamokų puslapį',
    'em.btnParentLessonsPay': 'Atidaryti mokinio pamokų peržiūrą',
  },
  en: {
    'em.manualPayInstructionsLead':
      'Pay using your tutor\'s instructions below before the deadline. This tutor does not accept card checkout on the platform.',
    'em.manualPayPortalHint':
      'After you pay, your tutor marks the lesson in Tutlio — you can track status on your Lessons page.',
    'em.btnStudentSessionsPay': 'Open my lessons page',
    'em.btnParentLessonsPay': 'Open lesson overview',
  },
};

const DEFAULT_FROM_EMAIL = process.env.FROM_EMAIL || 'Tutlio <onboarding@tutlio.lt>';

/** Extract the bare email address from a `Display Name <addr>` string. */
function extractEmailAddress(from: string): string {
  const match = from.match(/<([^>]+)>/);
  return match ? match[1] : from;
}

/** Localized "from" for Resend: uses `em.emailSenderName` + the address from FROM_EMAIL env. */
export function localizedFromEmail(locale: Locale | string | undefined): string {
  const senderName = t(locale, 'em.emailSenderName');
  const addr = extractEmailAddress(DEFAULT_FROM_EMAIL);
  return `${senderName} <${addr}>`;
}

export function t(
  locale: Locale | string | undefined,
  key: string,
  params?: Record<string, string | number>,
): string {
  const lc: Locale = isValidLocale(locale) ? locale : 'lt';
  let text =
    translations[lc]?.[key] ??
    EMAIL_SERVER_FALLBACKS[lc]?.[key] ??
    translations.en[key] ??
    EMAIL_SERVER_FALLBACKS.en?.[key] ??
    translations.lt[key] ??
    EMAIL_SERVER_FALLBACKS.lt?.[key] ??
    key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      text = text.replaceAll(`{${k}}`, String(v));
    }
  }
  return text;
}

