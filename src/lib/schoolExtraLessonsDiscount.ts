import { sessionYmdVilnius } from './schoolExtraLessonsBilling.js';
import type { SchoolDiscountType } from './schoolDiscountAgreement.js';

export type ExtraLessonsDiscountAgreement = {
  id: string;
  agreement_number: string;
  subject_id: string | null;
  tutor_id: string | null;
  discount_type: SchoolDiscountType;
  discount_value: number | string;
  valid_from: string;
  valid_until: string;
  accepted_at: string | null;
  note?: string | null;
};

export type DiscountableLesson = {
  id: string;
  start_time: string;
  subject_id: string | null;
  tutor_id: string | null;
};

export type ExtraLessonsDiscountResult = {
  subtotalEur: number;
  discountAmountEur: number;
  totalEur: number;
  discountNote: string | null;
};

/** Contract ID is checked by the caller; teacher and subject changes do not cancel its addendum. */
export function discountExtraLessonsBill(
  grossEur: number,
  unitPriceEur: number,
  billedSessionIds: string[],
  sessions: DiscountableLesson[],
  agreements: ExtraLessonsDiscountAgreement[],
): ExtraLessonsDiscountResult {
  const cents = (value: number) => Math.round(value * 100);
  const grossCents = cents(grossEur);
  const unitCents = cents(unitPriceEur);
  const billed = new Set(billedSessionIds);
  const seen = new Set<string>();
  const eligibleByAgreement = new Map<string, { agreement: ExtraLessonsDiscountAgreement; grossCents: number }>();

  for (const session of sessions) {
    if (!billed.has(session.id) || seen.has(session.id)) continue;
    seen.add(session.id);
    const day = sessionYmdVilnius(session.start_time);
    const agreement = agreements
      .filter((candidate) => candidate.accepted_at
        && Date.parse(session.start_time) >= Date.parse(candidate.accepted_at)
        && day >= candidate.valid_from && day <= candidate.valid_until)
      .sort((a, b) => Date.parse(b.accepted_at!) - Date.parse(a.accepted_at!))[0];
    if (!agreement) continue;
    const current = eligibleByAgreement.get(agreement.id);
    eligibleByAgreement.set(agreement.id, {
      agreement,
      grossCents: (current?.grossCents || 0) + unitCents,
    });
  }

  let discountCents = 0;
  const notes: string[] = [];
  for (const { agreement, grossCents: eligibleCents } of eligibleByAgreement.values()) {
    const value = Number(agreement.discount_value);
    if (!Number.isFinite(value) || value <= 0) continue;
    const amount = agreement.discount_type === 'percent'
      ? Math.round(eligibleCents * Math.min(value, 100) / 100)
      : cents(value);
    discountCents += Math.min(eligibleCents, amount);
    notes.push([agreement.agreement_number, agreement.note].filter(Boolean).join(': '));
  }
  discountCents = Math.min(grossCents, discountCents);
  return {
    subtotalEur: grossCents / 100,
    discountAmountEur: discountCents / 100,
    totalEur: (grossCents - discountCents) / 100,
    discountNote: notes.join('; ') || null,
  };
}
