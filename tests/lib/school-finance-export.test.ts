import { describe, expect, it } from 'vitest';
import {
  buildSchoolFinanceRows,
  filterSchoolFinanceRows,
  inferPaymentMethod,
  isManualSignedFile,
  schoolFinanceCsv,
  schoolFinanceTableData,
  summarizeSchoolFinanceRows,
} from '@/lib/schoolFinanceExport';

const t = (key: string) => key;

describe('schoolFinanceExport', () => {
  const contracts = [
    {
      id: 'c1',
      contract_number: 'LV-001',
      annual_fee: 300,
      signing_status: 'signed',
      student: { full_name: 'Jonas Jonaitis', payer_name: 'Petras Petraitis', payer_email: 'p@example.com', email: 'j@example.com' },
    },
    {
      id: 'c2',
      contract_number: 'LV-002',
      annual_fee: 350,
      signing_status: 'signed',
      student: { full_name: 'Ona Onaitė', payer_name: 'Ona Onaitė', payer_email: 'o@example.com', email: 'o@example.com' },
    },
  ];

  const installments = [
    {
      contract_id: 'c1',
      installment_number: 1,
      amount: 150,
      due_date: '2026-09-01',
      payment_status: 'paid' as const,
      stripe_checkout_session_id: 'cs_123',
      paid_at: '2026-08-20T10:00:00.000Z',
      contract: contracts[0],
    },
    {
      contract_id: 'c1',
      installment_number: 2,
      amount: 150,
      due_date: '2026-12-01',
      payment_status: 'overdue' as const,
      stripe_checkout_session_id: null,
      paid_at: null,
      contract: contracts[0],
    },
  ];

  it('builds rows from installments and signed contracts without schedules', () => {
    const rows = buildSchoolFinanceRows(contracts, installments);
    expect(rows).toHaveLength(3);
    expect(rows.find((r) => r.contractId === 'c2')?.paymentStatus).toBe('no_schedule');
  });

  it('filters unpaid and overdue rows', () => {
    const rows = buildSchoolFinanceRows(contracts, installments);
    const unpaid = filterSchoolFinanceRows(rows, { paymentStatus: 'unpaid', search: '', dueFrom: '', dueTo: '' });
    expect(unpaid.every((r) => r.paymentStatus !== 'paid')).toBe(true);
    const overdue = filterSchoolFinanceRows(rows, { paymentStatus: 'overdue', search: '', dueFrom: '', dueTo: '' });
    expect(overdue).toHaveLength(1);
    expect(overdue[0].paymentStatus).toBe('overdue');
  });

  it('searches by student name without diacritics', () => {
    const rows = buildSchoolFinanceRows(contracts, installments);
    const found = filterSchoolFinanceRows(rows, { paymentStatus: 'all', search: 'ona', dueFrom: '', dueTo: '' });
    expect(found.some((r) => r.studentName.includes('Ona'))).toBe(true);
  });

  it('summarizes totals', () => {
    const rows = buildSchoolFinanceRows(contracts, installments);
    const summary = summarizeSchoolFinanceRows(rows);
    expect(summary.totalPaid).toBe(150);
    expect(summary.totalDue).toBe(650);
    expect(summary.totalInstallmentCount).toBe(2);
    expect(summary.paidCount).toBe(1);
    expect(summary.unpaidCount).toBe(2);
    expect(summary.overdueCount).toBe(1);
    expect(summary.contractsWithoutSchedule).toBe(1);
  });

  it('infers payment method from stripe session id', () => {
    expect(inferPaymentMethod('paid', 'cs_1')).toBe('stripe');
    expect(inferPaymentMethod('paid', null)).toBe('manual');
    expect(inferPaymentMethod('pending', 'cs_1')).toBe('none');
  });

  it('builds table data for export', () => {
    const rows = buildSchoolFinanceRows(contracts, installments);
    const { headers, body } = schoolFinanceTableData(rows.slice(0, 1), t);
    expect(headers).toContain('school.financeColStudent');
    expect(body[0][0]).toBe('Jonas Jonaitis');
  });

  it('exports CSV with BOM and headers', () => {
    const rows = buildSchoolFinanceRows(contracts, installments);
    const csv = schoolFinanceCsv(rows.slice(0, 1), t);
    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv).toContain('school.financeColStudent');
    expect(csv).toContain('Jonas Jonaitis');
  });

  it('accepts manual signed pdf and image files', () => {
    expect(isManualSignedFile(new File(['x'], 'scan.pdf', { type: 'application/pdf' }))).toBe(true);
    expect(isManualSignedFile(new File(['x'], 'photo.jpg', { type: 'image/jpeg' }))).toBe(true);
    expect(isManualSignedFile(new File(['x'], 'doc.docx', { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }))).toBe(false);
  });
});
