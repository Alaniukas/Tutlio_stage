import { isManoKorepetitoriusOrg } from './marketMoney.js';
import { formatLessonDateTime, type PvmLessonDetail } from './pvmEducationInvoice.js';

export const CLASSIC_LT_TUTOR_LAYOUT = 'classic_lt_tutor' as const;

export type ClassicLtTutorPdfMeta = {
  layout: typeof CLASSIC_LT_TUTOR_LAYOUT;
  lessonDetails: PvmLessonDetail[];
  hidePlatformFooter: true;
  issuedByName: string;
};

export function isManoKorepetitoriusTutorInvoice(
  isOrgTutor: boolean,
  organizationId?: string | null,
): boolean {
  return isOrgTutor && isManoKorepetitoriusOrg(organizationId);
}

export function formatClassicLtSum(n: number): string {
  return `${(Math.round(Number(n) * 100) / 100).toFixed(2).replace('.', ',')}`;
}

/** Lesson extract prices in the sample use whole euros without decimals. */
export function formatClassicLtLessonPrice(n: number): string {
  const v = Math.round(Number(n) * 100) / 100;
  if (Number.isInteger(v)) return `${v} Eur`;
  return `${formatClassicLtSum(v)} Eur`;
}

export function classicLtTutorSellerLines(seller: {
  name?: string | null;
  personalCode?: string | null;
  activityNumber?: string | null;
  address?: string | null;
  iban?: string | null;
}): string[] {
  const lines = [`Vardas, pavardė: ${String(seller.name || '').trim() || '—'}`];
  const personal = String(seller.personalCode || '').trim();
  if (personal) lines.push(`Asmens kodas: ${personal}`);
  const activity = String(seller.activityNumber || '').trim();
  if (activity) lines.push(`Ind. veiklos Nr.: ${activity}`);
  const address = String(seller.address || '').trim();
  if (address) lines.push(`Adresas: ${address}`);
  const iban = String(seller.iban || '').trim();
  if (iban) lines.push(`Sąsk. Nr.: ${iban}`);
  return lines;
}

export function classicLtTutorBuyerLines(buyer: {
  name?: string | null;
  companyCode?: string | null;
  vatCode?: string | null;
  address?: string | null;
}): string[] {
  const lines = [`Pavadinimas: ${String(buyer.name || '').trim() || '—'}`];
  const code = String(buyer.companyCode || '').trim();
  if (code) lines.push(`Įmonės kodas: ${code}`);
  const vat = String(buyer.vatCode || '').trim();
  if (vat) lines.push(`PVM kodas: ${vat}`);
  const address = String(buyer.address || '').trim();
  if (address) lines.push(`Adresas: ${address}`);
  return lines;
}

export function buildClassicLtTutorLessonDetails(
  sessions: Array<{
    start_time?: string;
    price?: number | null;
    subjects?: { name?: string } | null;
  }>,
  lessonPayEur: (session: { price?: number | null }) => number,
): PvmLessonDetail[] {
  return [...sessions]
    .sort((a, b) => new Date(a.start_time || 0).getTime() - new Date(b.start_time || 0).getTime())
    .map((s) => ({
      subject: (s.subjects as { name?: string } | null)?.name || 'Pamoka',
      price: Math.round(lessonPayEur(s) * 100) / 100,
      datetime: formatLessonDateTime(String(s.start_time || '')),
    }));
}

export function buildClassicLtTutorPdfMeta(opts: {
  sessions: Array<{
    start_time?: string;
    price?: number | null;
    subjects?: { name?: string } | null;
  }>;
  issuedByName: string;
  lessonPayEur: (session: { price?: number | null }) => number;
}): ClassicLtTutorPdfMeta {
  return {
    layout: CLASSIC_LT_TUTOR_LAYOUT,
    lessonDetails: buildClassicLtTutorLessonDetails(opts.sessions, opts.lessonPayEur),
    hidePlatformFooter: true,
    issuedByName: String(opts.issuedByName || '').trim() || '—',
  };
}

export function parseClassicLtTutorPdfMeta(raw: unknown): ClassicLtTutorPdfMeta | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;
  if (obj.layout !== CLASSIC_LT_TUTOR_LAYOUT) return null;
  return {
    layout: CLASSIC_LT_TUTOR_LAYOUT,
    hidePlatformFooter: true,
    issuedByName: String(obj.issuedByName || '').trim() || '—',
    lessonDetails: Array.isArray(obj.lessonDetails)
      ? obj.lessonDetails.map((row) => {
          const r = (row || {}) as Record<string, unknown>;
          return {
            subject: String(r.subject || 'Pamoka'),
            price: Number(r.price) || 0,
            datetime: String(r.datetime || ''),
          };
        })
      : [],
  };
}
