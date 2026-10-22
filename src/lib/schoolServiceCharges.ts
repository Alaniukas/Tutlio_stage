import type { MonthlyInvoiceLineInput } from './schoolMonthlyInvoiceLines.js';

export const SCHOOL_SERVICE_CHARGES_FEATURE = 'school_service_charges';

export function schoolServiceChargesEnabled(features: Record<string, unknown> | null | undefined, entityType?: string | null): boolean {
  return (!entityType || entityType === 'school') && features?.[SCHOOL_SERVICE_CHARGES_FEATURE] === true;
}

export type SchoolServiceTemplate = {
  id: string;
  name: string;
  unit_price_eur: number;
  is_active: boolean;
  version: number;
};

export type SchoolServiceCharge = {
  id: string;
  student_id: string;
  template_id?: string | null;
  description: string;
  unit_price_eur: number;
  quantity: number;
  service_date: string;
  invoice_month: string;
  internal_note?: string | null;
  cancelled_at?: string | null;
  invoice_id?: string | null;
  version: number;
  invoice?: { invoice_number?: string | null; payment_status?: string | null } | null;
};

export type SchoolServiceInvoiceLine = MonthlyInvoiceLineInput & {
  source: 'service';
  studentId: string;
  studentName: string;
  serviceChargeId: string;
  serviceChargeVersion: number;
  serviceDate: string;
  subjectId?: undefined;
  tutorId?: undefined;
  sessionIds: string[];
  originalAmountEur: number;
  discountAmountEur: number;
};

export function validServiceDate(value: unknown): value is string {
  return typeof value === 'string' && /^20\d{2}-\d{2}-\d{2}$/.test(value)
    && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}

export function validServicePrice(value: unknown): boolean {
  if (typeof value !== 'number' && typeof value !== 'string') return false;
  const price = Number(value);
  return Number.isFinite(price) && price > 0 && price <= 9999
    && Math.abs(price * 100 - Math.round(price * 100)) < 0.000001;
}

export function parseServiceChargeInput(input: Record<string, unknown>) {
  const description = String(input.description || '').trim();
  const quantity = Number(input.quantity);
  const month = String(input.invoiceMonth || '');
  const invoiceMonth = /^20\d{2}-(0[1-9]|1[0-2])$/.test(month) ? `${month}-01` : '';
  const internalNote = String(input.internalNote || '').trim();
  if (!description || description.length > 160 || !validServicePrice(input.unitPriceEur)
    || !Number.isInteger(quantity) || quantity < 1 || quantity > 100
    || !validServiceDate(input.serviceDate) || !validServiceDate(invoiceMonth) || internalNote.length > 1000) {
    throw new Error('school.services.invalid');
  }
  return { description, unit_price_eur: Math.round(Number(input.unitPriceEur) * 100) / 100,
    quantity, service_date: input.serviceDate, invoice_month: invoiceMonth, internal_note: internalNote || null };
}

/** Charges have no lesson, contract, tutor pay or inherited lesson discount. */
export function buildSchoolServiceInvoiceLines(
  charges: SchoolServiceCharge[],
  students: Map<string, { full_name?: string | null }>,
  replaceableInvoiceIds: Set<string> = new Set(),
): SchoolServiceInvoiceLine[] {
  return [...new Map(charges.map(charge => [charge.id, charge])).values()]
    .filter(charge => !charge.cancelled_at && (!charge.invoice_id || replaceableInvoiceIds.has(charge.invoice_id)))
    .sort((a, b) => a.service_date.localeCompare(b.service_date) || a.id.localeCompare(b.id))
    .map(charge => {
      const amount = Math.round(Number(charge.unit_price_eur) * 100) * Number(charge.quantity) / 100;
      return { source: 'service', serviceChargeId: charge.id, serviceChargeVersion: charge.version,
        serviceDate: charge.service_date, studentId: charge.student_id,
        studentName: students.get(charge.student_id)?.full_name || '', description: charge.description,
        unitPriceEur: Number(charge.unit_price_eur), quantity: Number(charge.quantity),
        originalAmountEur: amount, discountAmountEur: 0, amountEur: amount, sessionIds: [] };
    });
}
