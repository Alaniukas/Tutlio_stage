import type { InAppSupportPortal } from './inAppSupport.js';

export type SupportNavLocale = 'lt' | 'en' | 'pl';

export function resolveSupportNavLocale(locale: string): SupportNavLocale {
  const code = String(locale || 'en').toLowerCase().split(/[-_]/, 1)[0];
  if (code === 'lt' || code === 'pl') return code;
  return 'en';
}

const PATH_LABELS: Record<string, Record<SupportNavLocale, string>> = {
  dashboard: { lt: 'Pagrindinis', en: 'Dashboard', pl: 'Panel' },
  calendar: { lt: 'Kalendorius', en: 'Calendar', pl: 'Kalendarz' },
  groups: { lt: 'Grupės', en: 'Groups', pl: 'Grupy' },
  recordings: { lt: 'Įrašai', en: 'Recordings', pl: 'Nagrania' },
  students: { lt: 'Mokiniai', en: 'Students', pl: 'Uczniowie' },
  sessions: { lt: 'Pamokos', en: 'Sessions', pl: 'Lekcje' },
  schedule: { lt: 'Tvarkaraštis', en: 'Schedule', pl: 'Harmonogram' },
  messages: { lt: 'Žinutės', en: 'Messages', pl: 'Wiadomości' },
  finance: { lt: 'Finansai', en: 'Finance', pl: 'Finanse' },
  invoices: { lt: 'Sąskaitos', en: 'Invoices', pl: 'Faktury' },
  contracts: { lt: 'Sutartys', en: 'Contracts', pl: 'Umowy' },
  payments: { lt: 'Mokėjimai', en: 'Payments', pl: 'Płatności' },
  tutors: { lt: 'Korepetitoriai', en: 'Tutors', pl: 'Korepetytorzy' },
  teachers: { lt: 'Mokytojai', en: 'Teachers', pl: 'Nauczyciele' },
  stats: { lt: 'Statistika', en: 'Statistics', pl: 'Statystyki' },
  settings: { lt: 'Pamokų nustatymai', en: 'Lesson settings', pl: 'Ustawienia lekcji' },
  support: { lt: 'Pagalba', en: 'Support', pl: 'Pomoc' },
  login: { lt: 'prisijungimo puslapį', en: 'login page', pl: 'stronę logowania' },
};

export const SUPPORT_NAVIGATION_AGENT_RULES = [
  'When you explain where to click or how to navigate, speak like a human teammate guiding someone through the product menu.',
  'Never mention URL paths, slugs, query strings, route names, or technical links such as /school/groups, /company/payments, or /groups/link.',
  'Describe the journey with the exact sidebar or menu labels the user sees, in the answer language. Use short step chains such as "Grupės → pasirinkite grupę → Mokiniai" or "Finance → Payments".',
  'Say "left menu", "open", "select", or "then" instead of "go to /...".',
  'Internal reference material may contain paths for routing only; translate those into menu language before answering.',
  'When verifiedSupportContext lists menu labels for this portal, answer navigation questions confidently with those labels. Never say you cannot confirm the menu path for standard sidebar areas such as students, calendar, finance, messages, groups, or contracts.',
  'Only say a function is unavailable when it is missing from the verified enabled-function list. Do not refuse navigation help for core areas that are listed there.',
].join(' ');

function pathLabel(segment: string, locale: SupportNavLocale, entityType: 'company' | 'school' | null): string {
  if (segment === 'tutors' && entityType === 'school') {
    return PATH_LABELS.teachers[locale];
  }
  return PATH_LABELS[segment]?.[locale] || segment;
}

export function buildSupportMenuLabels(input: {
  portal: InAppSupportPortal;
  entityType: 'company' | 'school' | null;
  locale: string;
}): string {
  const locale = resolveSupportNavLocale(input.locale);
  const isSchool = input.entityType === 'school';
  const staffLabel = isSchool ? PATH_LABELS.teachers[locale] : PATH_LABELS.tutors[locale];

  const organizationItems = [
    PATH_LABELS.dashboard[locale],
    staffLabel,
    PATH_LABELS.students[locale],
    PATH_LABELS.sessions[locale],
    PATH_LABELS.schedule[locale],
    PATH_LABELS.messages[locale],
    PATH_LABELS.groups[locale],
    PATH_LABELS.recordings[locale],
    PATH_LABELS.stats[locale],
    PATH_LABELS.contracts[locale],
    PATH_LABELS.payments[locale],
    PATH_LABELS.finance[locale],
  ];

  const tutorItems = [
    PATH_LABELS.dashboard[locale],
    PATH_LABELS.calendar[locale],
    PATH_LABELS.groups[locale],
    PATH_LABELS.recordings[locale],
    PATH_LABELS.students[locale],
    PATH_LABELS.messages[locale],
    PATH_LABELS.finance[locale],
    PATH_LABELS.invoices[locale],
  ];

  const studentItems = [
    PATH_LABELS.dashboard[locale],
    PATH_LABELS.sessions[locale],
    PATH_LABELS.messages[locale],
    PATH_LABELS.finance[locale],
    PATH_LABELS.recordings[locale],
  ];

  const parentItems = [
    PATH_LABELS.dashboard[locale],
    PATH_LABELS.sessions[locale],
    PATH_LABELS.messages[locale],
    PATH_LABELS.finance[locale],
    PATH_LABELS.recordings[locale],
  ];

  const items = input.portal === 'organization'
    ? organizationItems
    : input.portal === 'tutor'
      ? tutorItems
      : input.portal === 'student'
        ? studentItems
        : parentItems;

  return [
    '# Verified menu labels for navigation answers',
    `- Answer language: ${locale}.`,
    `- Portal: ${input.portal}${isSchool ? ' (school)' : input.entityType === 'company' ? ' (company)' : ''}.`,
    `- Use only these sidebar/menu labels when pointing the user somewhere: ${items.join(', ')}.`,
    '- Chain steps with "→" or short sentences, never with URL slashes.',
  ].join('\n');
}

function replacePathMatch(
  match: string,
  locale: SupportNavLocale,
  entityType: 'company' | 'school' | null,
): string {
  const cleaned = match.replace(/\?.*$/, '').replace(/^https?:\/\/[^/]+/i, '');
  const segments = cleaned.split('/').filter(Boolean).filter((part) => !['school', 'company', 'student', 'parent'].includes(part));
  if (segments.length === 0) return match;
  const labels = segments.map((segment) => pathLabel(segment, locale, entityType));
  return labels.join(' → ');
}

const STUDENT_CONTACTS_QUERY = /\b(kontakt|contact|telefon|el\.?\s*pa[sš]t|email|mok[eė]toj|student|mokin\w*|uczni\w*|informac\w*)/i;

/** Deterministic navigation answer when the AI turn fails but the question is clear. */
export function buildStudentContactsNavigationReply(
  locale: string,
  entityType: 'company' | 'school' | null,
): string {
  const navLocale = resolveSupportNavLocale(locale);
  const studentsLabel = PATH_LABELS.students[navLocale];
  const messages: Record<SupportNavLocale, string> = {
    lt: `Kairėje meniu atidarykite ${studentsLabel}, sąraše pasirinkite mokinį ir atsidariusioje kortelėje rasite kontaktus: mokinio el. paštą, mokėtojo duomenis ir telefono numerius.`,
    en: `Open ${studentsLabel} from the left menu, choose the student from the list, and their profile card shows contact details such as email, payer information, and phone numbers.`,
    pl: `Otwórz ${studentsLabel} z lewego menu, wybierz ucznia z listy, a na karcie profilu zobaczysz dane kontaktowe, w tym e-mail, dane płatnika i numery telefonów.`,
  };
  if (entityType === 'school' && navLocale === 'lt') {
    return messages.lt;
  }
  return messages[navLocale];
}

export function isStudentContactsNavigationQuestion(query: string): boolean {
  return STUDENT_CONTACTS_QUERY.test(query);
}

/** Last-resort cleanup when the model still echoes a route. */
export function humanizeSupportNavigationReply(
  value: string,
  locale = 'en',
  entityType: 'company' | 'school' | null = null,
): string {
  const navLocale = resolveSupportNavLocale(locale);
  return value
    .replace(/\s*—\s*/g, ' - ')
    .replace(/(?:https?:\/\/[^\s]+)?\/(?:school|company|student|parent)?\/[a-z0-9/?=&._-]+/gi, (match) => (
      replacePathMatch(match, navLocale, entityType)
    ))
    .replace(/(^|[\s(,])\/([a-z][a-z0-9-]*(?:\/[a-z][a-z0-9-]*)?)/gi, (match, prefix, path) => (
      `${prefix}${replacePathMatch(`/${path}`, navLocale, entityType)}`
    ))
    .replace(/\s+at\s+(?=[,.]|$)/gi, ' ')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}
