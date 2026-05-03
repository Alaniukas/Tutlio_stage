import { lt } from '../../src/lib/i18n/lt.js';
import { en } from '../../src/lib/i18n/en.js';

export type Locale = 'lt' | 'en';

const translations: Record<Locale, Record<string, string>> = { lt, en };

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

export function t(
  locale: Locale | string | undefined,
  key: string,
  params?: Record<string, string | number>,
): string {
  const lc: Locale = locale === 'en' ? 'en' : 'lt';
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

