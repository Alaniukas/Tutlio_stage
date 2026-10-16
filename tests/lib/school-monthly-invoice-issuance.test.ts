import { describe, expect, it } from 'vitest';
import {
  isReplaceableSchoolMonthlyInvoice,
  schoolMonthlyInvoicesIssuedForStudents,
  schoolMonthlySupplementalInvoiceNote,
} from '../../src/lib/schoolMonthlyInvoiceIssuance';

const students = new Set(['child1']);
const pending = {
  id: 'inv1',
  invoice_number: 'PAM-828',
  student_id: 'child1',
  period_start: '2026-09-01',
  period_end: '2026-09-30',
  billing_model: 'actual',
  payment_status: 'pending',
  total_eur: 236,
};

describe('school monthly invoice issuance lock', () => {
  it('allows regeneration only before the invoice email is sent', () => {
    expect(isReplaceableSchoolMonthlyInvoice(pending, '2026-09-01', '2026-09-30', students)).toBe(true);
    expect(isReplaceableSchoolMonthlyInvoice({
      ...pending,
      invoice_email_sent_at: '2026-10-04T12:00:00Z',
    }, '2026-09-01', '2026-09-30', students)).toBe(false);
  });

  it('surfaces emailed invoices for the forming list even when they are still unpaid', () => {
    expect(schoolMonthlyInvoicesIssuedForStudents([{
      ...pending,
      invoice_email_sent_at: '2026-10-04T12:00:00Z',
    }], '2026-09-01', '2026-09-30', students).map((row) => row.invoice_number)).toEqual(['PAM-828']);
  });

  it('explains a supplemental invoice from the already emailed numbers', () => {
    expect(schoolMonthlySupplementalInvoiceNote([])).toBeNull();
    expect(schoolMonthlySupplementalInvoiceNote([{ invoice_number: 'PAM-800', total_eur: 96 }]))
      .toContain('PAM-800 (96,00 €)');
  });
});
