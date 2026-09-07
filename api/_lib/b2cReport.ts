// B2C monthly platform-fee summary helpers (pure — unit tested).
// Stripe fees come from platform_fee_ledger, Perlas fees from perlas_ledger.

export interface B2cStripeRow {
  platform_fee: number | string | null;
  gross_amount: number | string | null;
}

export interface B2cPerlasRow {
  platform_fee: number | string | null;
  perlas_fee: number | string | null;
  volume: number | string | null;
}

export interface B2cMonthlySummary {
  /** e.g. "2026-05" */
  periodLabel: string;
  stripe: { operations: number; feesEur: number; grossEur: number };
  perlas: { operations: number; feesEur: number; grossEur: number };
  totalOperations: number;
  totalFeesEur: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Parses ?month=YYYY-MM into a UTC [start, end) range; null when invalid. */
export function monthRangeUtc(month: string): { startIso: string; endIso: string } | null {
  const m = /^(\d{4})-(\d{2})$/.exec(String(month || '').trim());
  if (!m) return null;
  const year = Number(m[1]);
  const mon = Number(m[2]);
  if (mon < 1 || mon > 12 || year < 2000 || year > 2200) return null;
  const start = new Date(Date.UTC(year, mon - 1, 1));
  const end = new Date(Date.UTC(year, mon, 1));
  return { startIso: start.toISOString(), endIso: end.toISOString() };
}

/**
 * Aggregates the month's fee income collected from physical persons.
 * Stripe: the whole payer surcharge is stored in platform_fee.
 * Perlas: the payer surcharge is platform_fee + perlas_fee on top of the lesson price.
 */
export function summarizeB2cMonth(params: {
  month: string;
  stripeRows: B2cStripeRow[];
  perlasRows: B2cPerlasRow[];
}): B2cMonthlySummary {
  const num = (v: number | string | null | undefined) => {
    const n = Number(v ?? 0);
    return Number.isFinite(n) ? n : 0;
  };

  let stripeFees = 0;
  let stripeGross = 0;
  for (const r of params.stripeRows) {
    stripeFees += num(r.platform_fee);
    stripeGross += num(r.gross_amount);
  }

  let perlasFees = 0;
  let perlasGross = 0;
  for (const r of params.perlasRows) {
    perlasFees += num(r.platform_fee) + num(r.perlas_fee);
    perlasGross += num(r.volume);
  }

  return {
    periodLabel: params.month,
    stripe: { operations: params.stripeRows.length, feesEur: round2(stripeFees), grossEur: round2(stripeGross) },
    perlas: { operations: params.perlasRows.length, feesEur: round2(perlasFees), grossEur: round2(perlasGross) },
    totalOperations: params.stripeRows.length + params.perlasRows.length,
    totalFeesEur: round2(stripeFees + perlasFees),
  };
}

/** First and last calendar day of the month (for invoice periods). */
export function monthPeriodDates(month: string): { periodStart: string; periodEnd: string } | null {
  const m = /^(\d{4})-(\d{2})$/.exec(String(month || '').trim());
  if (!m) return null;
  const year = Number(m[1]);
  const mon = Number(m[2]);
  if (mon < 1 || mon > 12) return null;
  const lastDay = new Date(Date.UTC(year, mon, 0)).getUTCDate();
  const mm = String(mon).padStart(2, '0');
  return {
    periodStart: `${year}-${mm}-01`,
    periodEnd: `${year}-${mm}-${String(lastDay).padStart(2, '0')}`,
  };
}

/** CSV (semicolon-free, comma-separated, UTF-8) for accountants. */
export function b2cSummaryCsv(s: B2cMonthlySummary): string {
  const lines = [
    'Laikotarpis,Teikejas,Operaciju skaicius,Surinkta is fiziniu asmenu (EUR),Bendra apyvarta (EUR)',
    `${s.periodLabel},Stripe,${s.stripe.operations},${s.stripe.feesEur.toFixed(2)},${s.stripe.grossEur.toFixed(2)}`,
    `${s.periodLabel},Perlas Finance,${s.perlas.operations},${s.perlas.feesEur.toFixed(2)},${s.perlas.grossEur.toFixed(2)}`,
    `${s.periodLabel},Is viso,${s.totalOperations},${s.totalFeesEur.toFixed(2)},${(Math.round((s.stripe.grossEur + s.perlas.grossEur) * 100) / 100).toFixed(2)}`,
  ];
  return `\uFEFF${lines.join('\n')}\n`;
}
