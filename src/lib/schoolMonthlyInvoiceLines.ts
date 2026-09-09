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
  source: InvoiceLineSource;
  consultationId?: string | null;
  sessionId?: string | null;
};

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
  return Math.round(lines.reduce((sum, l) => sum + l.amountEur, 0) * 100) / 100;
}

export function shouldIssueInvoice(lines: MonthlyInvoiceLineInput[]): boolean {
  return lines.length > 0;
}
