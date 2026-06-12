// Per-counterparty B2C commission invoice math (pure — unit tested).
// One monthly invoice per client (agency or individual tutor) covering the
// Tutlio intermediation fees of that month. The fees were already deducted
// at settlement time, so every invoice is issued as PAID (offset/užskaita).

import { lithuanianMonthLabel } from './b2bInvoice.js';

export type B2cCounterpartyType = 'org' | 'tutor';

export interface B2cCounterpartyFees {
  counterpartyType: B2cCounterpartyType;
  counterpartyId: string;
  stripeFeesEur: number;
  stripeOperations: number;
  perlasFeesEur: number;
  perlasOperations: number;
}

export interface B2cLedgerStripeRow {
  organization_id?: string | null;
  tutor_id?: string | null;
  platform_fee: number | string | null;
}

export interface B2cLedgerPerlasRow {
  entity_type?: string | null;
  entity_id?: string | null;
  platform_fee: number | string | null;
  perlas_fee: number | string | null;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

const num = (v: number | string | null | undefined) => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

/**
 * Groups the month's fee ledger rows by counterparty.
 * Stripe rows attribute to the organization when present, otherwise the tutor;
 * Perlas rows carry an explicit entity. Rows without any counterparty are
 * counted separately (they stay visible in the CSV summary).
 */
export function groupB2cFeesByCounterparty(params: {
  stripeRows: B2cLedgerStripeRow[];
  perlasRows: B2cLedgerPerlasRow[];
}): { counterparties: B2cCounterpartyFees[]; unattributedOperations: number } {
  const byKey = new Map<string, B2cCounterpartyFees>();
  let unattributed = 0;

  const entryFor = (type: B2cCounterpartyType, id: string): B2cCounterpartyFees => {
    const key = `${type}:${id}`;
    let entry = byKey.get(key);
    if (!entry) {
      entry = {
        counterpartyType: type,
        counterpartyId: id,
        stripeFeesEur: 0,
        stripeOperations: 0,
        perlasFeesEur: 0,
        perlasOperations: 0,
      };
      byKey.set(key, entry);
    }
    return entry;
  };

  for (const r of params.stripeRows) {
    const fee = num(r.platform_fee);
    if (fee <= 0) continue;
    const type: B2cCounterpartyType | null = r.organization_id ? 'org' : r.tutor_id ? 'tutor' : null;
    if (!type) {
      unattributed += 1;
      continue;
    }
    const entry = entryFor(type, (r.organization_id || r.tutor_id) as string);
    entry.stripeFeesEur = round2(entry.stripeFeesEur + fee);
    entry.stripeOperations += 1;
  }

  for (const r of params.perlasRows) {
    const fee = num(r.platform_fee) + num(r.perlas_fee);
    if (fee <= 0) continue;
    const type = r.entity_type === 'org' ? 'org' : r.entity_type === 'tutor' ? 'tutor' : null;
    if (!type || !r.entity_id) {
      unattributed += 1;
      continue;
    }
    const entry = entryFor(type, r.entity_id);
    entry.perlasFeesEur = round2(entry.perlasFeesEur + fee);
    entry.perlasOperations += 1;
  }

  return { counterparties: [...byKey.values()], unattributedOperations: unattributed };
}

export interface B2cCommissionInvoiceLines {
  lineItems: { description: string; quantity: number; unitPrice: number; totalPrice: number }[];
  totalAmount: number;
  /** Equal to totalAmount — the fee was already deducted at settlement. */
  deductedAmount: number;
  amountDue: 0;
}

/**
 * Single simple line per the accountant's request:
 * "Tutlio tarpininkavimo mokesčiai (<mėnuo>): x suma", issued as paid.
 */
export function buildB2cCommissionLines(params: {
  month: string;
  fees: Pick<B2cCounterpartyFees, 'stripeFeesEur' | 'perlasFeesEur'>;
}): B2cCommissionInvoiceLines {
  const total = round2(num(params.fees.stripeFeesEur) + num(params.fees.perlasFeesEur));
  return {
    lineItems: [
      {
        description: `Tutlio tarpininkavimo mokesčiai (${lithuanianMonthLabel(params.month)})`,
        quantity: 1,
        unitPrice: total,
        totalPrice: total,
      },
    ],
    totalAmount: total,
    deductedAmount: total,
    amountDue: 0,
  };
}

/** Rendered on the PDF below the totals (first line bold). */
export const B2C_PAID_NOTE: string[] = [
  'SĄSKAITA APMOKĖTA (užskaitos būdu)',
  'Tarpininkavimo mokestis išskaičiuotas atsiskaitymų metu — papildomai mokėti nieko nereikia.',
];

/** B2C series number, separate from the B2B sequence (TUT-00001). */
export function formatB2cInvoiceNumber(seq: number): string {
  return `TUT-B2C-${String(seq).padStart(5, '0')}`;
}
