import { isProKlaseOrg } from './marketMoney.js';

export function resolveOrgLoginDescription(opts: {
  slug?: string | null;
  orgId?: string | null;
  custom?: string | null;
  locale?: string;
}): string {
  const custom = String(opts.custom || '').trim();
  if (custom) return custom;
  if (isProKlaseOrg(opts.orgId) || isProKlaseOrg(opts.slug)) {
    return opts.locale === 'en'
      ? 'We learn at your pace. Individual online lessons for grades 1–12 — selected tutors, a clear plan, and measurable progress.'
      : 'Mokomės tavo ritmu. Individualios online pamokos 1–12 klasei — atrinkti korepetitoriai, aiškus planas ir matuojama pažanga.';
  }
  return '';
}

export function orgLoginButtonLabels(locale?: string): Record<'student' | 'parent' | 'tutor', string> {
  if (locale === 'en') {
    return {
      student: 'Student login',
      parent: 'Parent login',
      tutor: 'Tutor login',
    };
  }
  return {
    student: 'Prisijungti mokiniui',
    parent: 'Prisijungti tėvui',
    tutor: 'Prisijungti korepetitoriui',
  };
}
