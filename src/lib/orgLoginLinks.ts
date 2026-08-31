import { isManoKorepetitoriusOrg, isMoksloVaisiaiOrg, isProKlaseOrg } from '@/lib/marketMoney';

export const ORG_LOGIN_PORTALS = ['student', 'parent', 'tutor'] as const;
export type OrgLoginPortal = (typeof ORG_LOGIN_PORTALS)[number];

export function parseOrgLoginPortal(raw: string | null | undefined): OrgLoginPortal | null {
  const v = String(raw || '').trim().toLowerCase();
  return (ORG_LOGIN_PORTALS as readonly string[]).includes(v) ? (v as OrgLoginPortal) : null;
}

export function orgLoginPath(slug: string, portal: OrgLoginPortal): string {
  const safe = slug.trim();
  return `/login?org=${encodeURIComponent(safe)}&portal=${portal}`;
}

export function orgLoginEmbedPath(slug: string): string {
  return `/embed/org-login?org=${encodeURIComponent(slug.trim())}`;
}

export function orgLoginWidgetSrc(origin: string, slug: string, locale?: string): string {
  const base = origin.replace(/\/$/, '');
  const loc = locale ? `&locale=${encodeURIComponent(locale)}` : '';
  return `${base}/api/org-login-widget?slug=${encodeURIComponent(slug.trim())}${loc}`;
}

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
  if (isManoKorepetitoriusOrg(opts.orgId) || isManoKorepetitoriusOrg(opts.slug)) {
    return opts.locale === 'en'
      ? 'Quality individual lessons and attention for every student. Experienced tutors, a clear learning plan, and ongoing communication with parents — in person in Vilnius and online across Lithuania.'
      : 'Kokybiškos individualios pamokos ir dėmesys kiekvienam mokiniui. Patyrę korepetitoriai, aiškus mokymosi planas ir nuolatinis ryšys su tėvais — gyvai Vilniuje ir nuotoliu visoje Lietuvoje.';
  }
  if (isMoksloVaisiaiOrg(opts.orgId) || isMoksloVaisiaiOrg(opts.slug)) {
    return opts.locale === 'en'
      ? 'Professional online tutors. Individual attention for every student, experienced teachers, and a clear learning plan.'
      : 'Profesionalūs korepetitoriai nuotoliu. Individualus dėmesys kiekvienam mokiniui, patyrę mokytojai ir aiškus mokymosi planas.';
  }
  return '';
}

export function orgLoginButtonLabels(locale?: string): Record<OrgLoginPortal, string> {
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
