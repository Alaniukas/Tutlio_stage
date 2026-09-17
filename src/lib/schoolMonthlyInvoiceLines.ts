export type InvoiceLineSource =
  | 'extra_base'
  | 'extra_overage'
  | 'lesson'
  | 'consultation_free'
  | 'consultation_paid'
  | 'discount';

export type MonthlyInvoiceLineInput = {
  description: string;
  unitPriceEur: number;
  quantity: number;
  amountEur: number;
  /** Amount before a discount. Defaults to amountEur for legacy rows. */
  originalAmountEur?: number;
  discountType?: 'percent' | 'amount' | null;
  discountValue?: number | null;
  discountAmountEur?: number;
  discountNote?: string | null;
  source: InvoiceLineSource;
  consultationId?: string | null;
  sessionId?: string | null;
  sessionIds?: string[];
};

export type SchoolLessonInvoiceSession = {
  id: string;
  subjectId: string;
  subjectName: string;
  tutorId: string;
  tutorName: string;
  unitPriceEur: number;
};

export type SchoolLessonDiscountInput = {
  type: 'percent' | 'amount';
  value: number;
  subjectId: string;
  tutorId?: string | null;
  note?: string | null;
};

export type SchoolLessonInvoiceLine = MonthlyInvoiceLineInput & {
  source: 'lesson';
  subjectId: string;
  tutorId: string;
  subjectName: string;
  tutorName: string;
  originalAmountEur: number;
  discountAmountEur: number;
  sessionIds: string[];
};

const money = (value: number): number => Math.round((Number(value) || 0) * 100) / 100;

export function invoiceLineDiscount(
  originalAmountEur: number,
  discount: Pick<SchoolLessonDiscountInput, 'type' | 'value'> | null | undefined,
): { discountAmountEur: number; amountEur: number; label: string | null } {
  const gross = Math.max(0, money(originalAmountEur));
  if (!discount) return { discountAmountEur: 0, amountEur: gross, label: null };
  const value = Math.max(0, Number(discount.value) || 0);
  const rawDiscount = discount.type === 'percent' ? gross * Math.min(100, value) / 100 : value;
  const discountAmountEur = Math.min(gross, money(rawDiscount));
  return {
    discountAmountEur,
    amountEur: money(gross - discountAmountEur),
    label: discount.type === 'percent'
      ? `${money(Math.min(100, value)).toLocaleString('lt-LT')} %`
      : `${money(Math.min(gross, value)).toFixed(2).replace('.', ',')} €`,
  };
}

/** Groups a student's lessons into the rows used by the Laisvi vaikai monthly invoice. */
export function buildSchoolLessonInvoiceLines(
  sessions: SchoolLessonInvoiceSession[],
  discounts: SchoolLessonDiscountInput[] = [],
): SchoolLessonInvoiceLine[] {
  const grouped = new Map<string, SchoolLessonInvoiceSession[]>();
  for (const session of sessions) {
    const key = [session.subjectId, session.tutorId, money(session.unitPriceEur)].join(':');
    const current = grouped.get(key) || [];
    current.push(session);
    grouped.set(key, current);
  }

  return [...grouped.values()].map((rows) => {
    const first = rows[0];
    const quantity = rows.length;
    const unitPriceEur = money(first.unitPriceEur);
    const originalAmountEur = money(unitPriceEur * quantity);
    const discount = discounts.find((candidate) => (
      candidate.subjectId === first.subjectId
      && (!candidate.tutorId || candidate.tutorId === first.tutorId)
    ));
    const applied = invoiceLineDiscount(originalAmountEur, discount);
    return {
      description: `${first.subjectName} - mokytojas ${first.tutorName}`,
      subjectId: first.subjectId,
      tutorId: first.tutorId,
      subjectName: first.subjectName,
      tutorName: first.tutorName,
      unitPriceEur,
      quantity,
      originalAmountEur,
      discountType: discount?.type || null,
      discountValue: discount?.value ?? null,
      discountAmountEur: applied.discountAmountEur,
      discountNote: discount?.note || null,
      amountEur: applied.amountEur,
      source: 'lesson' as const,
      sessionIds: rows.map((row) => row.id),
    };
  }).sort((a, b) => a.description.localeCompare(b.description, 'lt'));
}

export function invoiceLinesSubtotal(lines: MonthlyInvoiceLineInput[]): number {
  return money(lines.reduce((sum, line) => sum + Number(line.originalAmountEur ?? line.amountEur), 0));
}

export function invoiceLinesDiscountTotal(lines: MonthlyInvoiceLineInput[]): number {
  return money(lines.reduce((sum, line) => sum + Number(line.discountAmountEur || 0), 0));
}

export function buildLessonLineDescription(
  subjectName: string,
  tutorName: string,
  discountPercent?: number | null,
): { description: string; unitPriceEur: number; amountEur: number; source: InvoiceLineSource } {
  const base = `${subjectName} - mokytoja ${tutorName}`.replace(/mokytoja\s+(\S+)/i, (m, name) => {
    return `mokytojas ${name}`;
  });
  const pct = Number(discountPercent) || 0;
  if (pct >= 100) {
    return {
      description: `${subjectName} - mokytojas ${tutorName} — Nuolaida 100%`,
      unitPriceEur: 0,
      amountEur: 0,
      source: 'discount',
    };
  }
  if (pct > 0) {
    return {
      description: `${subjectName} - mokytojas ${tutorName} — Nuolaida ${pct}%`,
      unitPriceEur: 0,
      amountEur: 0,
      source: 'discount',
    };
  }
  return { description: base, unitPriceEur: 0, amountEur: 0, source: 'lesson' };
}

export function buildConsultationFreeLine(
  label: string,
): MonthlyInvoiceLineInput {
  return {
    description: label,
    unitPriceEur: 0,
    quantity: 1,
    amountEur: 0,
    source: 'consultation_free',
  };
}

export function buildConsultationPaidLine(
  label: string,
  unitPriceEur: number,
  quantity = 1,
): MonthlyInvoiceLineInput {
  const amount = Math.round(unitPriceEur * quantity * 100) / 100;
  return {
    description: label,
    unitPriceEur,
    quantity,
    amountEur: amount,
    source: 'consultation_paid',
  };
}

export function invoiceLinesTotal(lines: MonthlyInvoiceLineInput[]): number {
  return money(lines.reduce((sum, l) => sum + l.amountEur, 0));
}

export function shouldIssueInvoice(lines: MonthlyInvoiceLineInput[]): boolean {
  return lines.length > 0;
}
