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
import { buildSchoolFinanceWorkbook } from '@/lib/schoolFinanceXlsxExport';

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
      stripe_payment_intent_id: 'pi_123',
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
    const unpaid = filterSchoolFinanceRows(rows, { paymentStatus: 'unpaid', search: '', paidFrom: '', paidTo: '' });
    expect(unpaid.every((r) => r.paymentStatus !== 'paid')).toBe(true);
    const overdue = filterSchoolFinanceRows(rows, { paymentStatus: 'overdue', search: '', paidFrom: '', paidTo: '' });
    expect(overdue).toHaveLength(1);
    expect(overdue[0].paymentStatus).toBe('overdue');
  });

  it('searches by student name without diacritics', () => {
    const rows = buildSchoolFinanceRows(contracts, installments);
    const found = filterSchoolFinanceRows(rows, { paymentStatus: 'all', search: 'ona', paidFrom: '', paidTo: '' });
    expect(found.some((r) => r.studentName.includes('Ona'))).toBe(true);
  });

  it('filters by paid date period, not due date', () => {
    const rows = buildSchoolFinanceRows(contracts, installments);
    const july = filterSchoolFinanceRows(rows, {
      paymentStatus: 'all',
      search: '',
      paidFrom: '2026-07-01',
      paidTo: '2026-07-31',
    });
    expect(july).toHaveLength(0);

    const august = filterSchoolFinanceRows(rows, {
      paymentStatus: 'all',
      search: '',
      paidFrom: '2026-08-01',
      paidTo: '2026-08-31',
    });
    expect(august).toHaveLength(1);
    expect(august[0].installmentNumber).toBe(1);
    expect(august[0].paymentStatus).toBe('paid');
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

  it('requires a confirmed payment intent to classify a receipt as Stripe', () => {
    expect(inferPaymentMethod('paid', 'pi_1')).toBe('stripe');
    expect(inferPaymentMethod('paid', null)).toBe('manual');
    expect(inferPaymentMethod('pending', 'pi_1')).toBe('none');
    const manual = buildSchoolFinanceRows([], [{ ...installments[0], stripe_payment_intent_id: null }]);
    expect(manual[0].stripeCheckoutSessionId).toBe('cs_123');
    expect(manual[0].paymentMethod).toBe('manual');
    const stripe = buildSchoolFinanceRows([], [{ ...installments[0], stripe_checkout_session_id: null }]);
    expect(stripe[0].paymentMethod).toBe('stripe');
  });

  it('retains the 300 + 50 + 50 historical receipts without adding archived debt', async () => {
    const archivedAt = '2026-09-04T11:54:33Z';
    const archived = [300, 50, 50].map((amount, index) => ({
      ...contracts[0], id: `archive-${index}`, annual_fee: 1000,
      signing_status: index === 0 ? 'signed' : 'sent', archived_at: archivedAt,
    }));
    const historical = archived.map((contract, index) => ({
      ...installments[0], contract_id: contract.id, contract, amount: [300, 50, 50][index],
    }));
    const rows = buildSchoolFinanceRows([...contracts, ...archived, {
      ...contracts[0], id: 'archived-without-schedule', archived_at: archivedAt,
    }], [...installments, ...historical, {
      ...historical[0], installment_number: 2, amount: 666, payment_status: 'overdue',
    }]);
    const summary = summarizeSchoolFinanceRows(rows);
    expect(summary.totalPaid).toBe(550);
    expect(summary.totalOutstanding).toBe(500);
    expect(summary.contractsWithoutSchedule).toBe(1);
    expect(rows.filter(row => row.contractArchivedAt)).toHaveLength(3);
    const { headers, body } = schoolFinanceTableData(rows, t);
    expect(headers.at(-1)).toBe('school.archive.archivedAt');
    expect(body.filter(row => row.at(-1) === '2026-09-04')).toHaveLength(3);
    expect(schoolFinanceCsv(rows, t)).toContain('2026-09-04');
    const workbook = await buildSchoolFinanceWorkbook(rows, t, summary);
    const payments = workbook.getWorksheet('Mokėjimai')!;
    expect(payments.getRow(1).getCell(13).value).toBe('school.archive.archivedAt');
    const archiveRow = rows.findIndex(row => row.contractId === 'archive-1') + 2;
    expect(payments.getRow(archiveRow).getCell(13).value).toBe('2026-09-04');
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
