import { interpolateTranslation } from '../../src/lib/i18n/interpolate.js';
import { it } from '../../src/lib/i18n/it.js';
import { fil } from '../../src/lib/i18n/fil.js';
import { th } from '../../src/lib/i18n/th.js';
import { tr } from '../../src/lib/i18n/tr.js';
import { zhHk } from '../../src/lib/i18n/zh-hk.js';
import { pt } from '../../src/lib/i18n/pt.js';
import { ro } from '../../src/lib/i18n/ro.js';
import { cs } from '../../src/lib/i18n/cs.js';
import { el } from '../../src/lib/i18n/el.js';
import { hu } from '../../src/lib/i18n/hu.js';
import { bg } from '../../src/lib/i18n/bg.js';
import { hr } from '../../src/lib/i18n/hr.js';
import { sk } from '../../src/lib/i18n/sk.js';
import { sl } from '../../src/lib/i18n/sl.js';
import { hi } from '../../src/lib/i18n/hi.js';
import { ko } from '../../src/lib/i18n/ko.js';
import { ja } from '../../src/lib/i18n/ja.js';
import { id } from '../../src/lib/i18n/id.js';
import { ar } from '../../src/lib/i18n/ar.js';
import { he } from '../../src/lib/i18n/he.js';
import { uk } from '../../src/lib/i18n/uk.js';
import { ptBr } from '../../src/lib/i18n/pt-br.js';
import { esMx } from '../../src/lib/i18n/es-mx.js';
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
import { nl } from '../../src/lib/i18n/nl.js';

export type Locale = FullLocale;

export function isValidLocale(v: unknown): v is Locale {
  return typeof v === 'string' && (LOCALES as readonly string[]).includes(v);
}

const translations: Record<Locale, Record<string, string>> = {
  th,
  'zh-hk': zhHk,
  lt, en, pl, lv, ee, fr, es, de, se, dk, fi, no, nl,
  'it': it,
  fil,
  tr,
  'pt': pt,
  'ro': ro,
  'cs': cs,
  'el': el,
  'hu': hu,
  'bg': bg,
  'hr': hr,
  'sk': sk,
  'sl': sl,
  'hi': hi,
  'ko': ko,
  'ja': ja,
  'id': id,
  'ar': ar,
  he,
  uk,
  'pt-br': ptBr,
  'es-mx': esMx,
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
    'em.packageReqHeaderSubProKlase':
      'Pastebėjus netikslumų apskaičiuotame pakete arba kilus klausimų, prašome susisiekti su administracija.',
    'em.packageReqBodyProKlase': 'Apmokėkite pamokų paketą, skirtą suplanuotoms pamokoms.',
    'em.packageHowBodyProKlase':
      'Įsigydami pamokų paketą, apmokėsite visas einamajam mėnesiui suplanuotas pamokas. Jeigu negalėsite dalyvauti kurioje nors apmokėtoje pamokoje, ją visuomet galėsite perkelti į kitą laiką, iš anksto suderinę su korepetitoriumi.<br/><br/>Jeigu mėnesio eigoje norėsite papildomų pamokų, už jas galėsite atsiskaityti atskirai.',
    'em.packageProKlaseEmailLabel': 'El. paštas:',
    'em.packageProKlasePhoneLabel': 'Tel. nr.:',
  },
  en: {
    'em.manualPayInstructionsLead':
      'Pay using your tutor\'s instructions below before the deadline. This tutor does not accept card checkout on the platform.',
    'em.manualPayPortalHint':
      'After you pay, your tutor marks the lesson in Tutlio — you can track status on your Lessons page.',
    'em.btnStudentSessionsPay': 'Open my lessons page',
    'em.btnParentLessonsPay': 'Open lesson overview',
    'em.packageReqHeaderSubProKlase':
      'If you notice inaccuracies in the calculated package or have questions, please contact the administration.',
    'em.packageReqBodyProKlase': 'Please pay for the lesson package for the scheduled lessons.',
    'em.packageHowBodyProKlase':
      'By purchasing a lesson package, you pay for all lessons scheduled for the current month. If you cannot attend a paid lesson, you can always reschedule it by arranging a new time with the tutor in advance.<br/><br/>If you want additional lessons during the month, you can pay for them separately.',
    'em.packageProKlaseEmailLabel': 'Email:',
    'em.packageProKlasePhoneLabel': 'Phone:',
  },
};

const DEFAULT_FROM_EMAIL = process.env.FROM_EMAIL || 'Tutlio <onboarding@tutlio.lt>';

/** Extract the bare email address from a `Display Name <addr>` string. */
function extractEmailAddress(from: string): string {
  const match = from.match(/<([^>]+)>/);
  return match ? match[1] : from;
}

/** Localized "from" for Resend: uses `em.emailSenderName` + the address from FROM_EMAIL env. */
export function localizedFromEmail(
  locale: Locale | string | undefined,
  opts?: { senderName?: string | null },
): string {
  const senderName = String(opts?.senderName || '').trim() || t(locale, 'em.emailSenderName');
  const addr = extractEmailAddress(DEFAULT_FROM_EMAIL);
  return `${senderName} <${addr}>`;
}

export function t(
  locale: Locale | string | undefined,
  key: string,
  params?: Record<string, string | number>,
): string {
  const lc: Locale = isValidLocale(locale) ? locale : 'lt';
  const text =
    translations[lc]?.[key] ??
    EMAIL_SERVER_FALLBACKS[lc]?.[key] ??
    translations.en[key] ??
    EMAIL_SERVER_FALLBACKS.en?.[key] ??
    translations.lt[key] ??
    EMAIL_SERVER_FALLBACKS.lt?.[key] ??
    key;
  return interpolateTranslation(text, params);
}
