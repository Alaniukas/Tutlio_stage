import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import { buildCompanyPaymentReport, filterPaymentReport, paymentReportDay, validPaymentReportPeriod,
  type ReportSessionSource, type ReportPackageSource, type ReportInvoiceSource } from '@/lib/companyPaymentReport';
import { paymentReportCsv, paymentReportTable, paymentReportXlsx } from '@/lib/companyPaymentReportExport';

const student = { id: 's1', organization_id: 'org', full_name: 'Mantas', payer_name: 'Asta', payer_email: 'asta@example.test', payer_phone: '+37060000000' };
const session = (override: Partial<ReportSessionSource> = {}): ReportSessionSource => ({
  id: 'lesson', student_id: 's1', tutor_id: 't1', start_time: '2026-09-01T09:00:00Z', end_time: '2026-09-01T10:00:00Z',
  created_at: '2026-08-20T12:00:00Z', status: 'completed', paid: true, price: 20, subjects: { is_trial: false }, ...override,
});
const pkg = (override: Partial<ReportPackageSource> = {}): ReportPackageSource => ({
  id: 'pkg', student_id: 's1', tutor_id: 't1', total_lessons: 4, total_price: 80, paid: true, payment_status: 'paid',
  paid_at: '2026-09-02T09:00:00Z', created_at: '2026-09-01T12:00:00Z', subjects: { is_trial: false }, ...override,
});
const invoice = (override: Partial<ReportInvoiceSource> = {}): ReportInvoiceSource => ({
  id: 'inv', invoice_number: 'PK-001', issue_date: '2026-09-02', created_at: '2026-09-02T09:00:00Z', total_amount: 80,
  status: 'paid', invoice_line_items: [{ session_ids: ['pkg', 'lesson', 'lesson2'] }], ...override,
});
const build = (override: Partial<Parameters<typeof buildCompanyPaymentReport>[0]> = {}) => buildCompanyPaymentReport({
  students: [student], sessions: [], packages: [], invoices: [], ledger: [], batches: [], tutors: [{ id: 't1', full_name: 'Jonas' }],
  now: '2026-10-07T12:00:00Z', ...override,
});

describe('company payment report', () => {
  it('reports an invoiced package once, with history spanning tutors and before the selected period', () => {
    const rows = build({
      students: [student, { ...student, id: 's2', full_name: ' mantas ', tutor_id: 't2' }, { ...student, id: 'sibling', full_name: 'Ieva' }],
      sessions: [session({ lesson_package_id: 'pkg' }), session({ id: 'lesson2', student_id: 's2', tutor_id: 't2', start_time: '2026-09-04T09:00:00Z', lesson_package_id: 'pkg' }),
        session({ id: 'cancelled', student_id: 's2', status: 'cancelled', paid: false }), session({ id: 'absent', status: 'no_show', paid: false }),
        session({ id: 'sibling-lesson', student_id: 'sibling', paid: false })],
      packages: [pkg({ manual_sales_invoice_id: 'inv' })], invoices: [invoice()],
      tutors: [{ id: 't1', full_name: 'Jonas' }, { id: 't2', full_name: 'Ona' }],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ type: 'package', packageLessons: 4, amount: 80, invoiceNumber: 'PK-001', payerPhone: '+37060000000', paidAt: '2026-09-02T09:00:00Z' });
    expect(rows[0].tutors.map(tutor => tutor.name)).toEqual(['Jonas', 'Ona']);
    expect(rows[0].students).toHaveLength(1);
    expect(rows[0].students[0]).toMatchObject({ completedLessons: 2, cancelledLessons: 1, noShowLessons: 1,
      firstLessonAt: '2026-09-01T09:00:00Z', firstPackagePurchased: true, firstPackagePaidAt: '2026-09-02T09:00:00Z' });
    const filtered = filterPaymentReport(rows, { start: '2026-09-02', end: '2026-09-02', dateBasis: 'paid' });
    expect(filtered[0].students[0].completedLessons).toBe(2);
  });
  it('recognizes a one-lesson trial package even when its invoice source is a session', () => {
    const rows = build({ sessions: [session({ lesson_package_id: 'pkg', subjects: { is_trial: true } })],
      packages: [pkg({ total_lessons: 1, total_price: 10, subjects: { is_trial: true }, manual_sales_invoice_id: 'inv' })],
      invoices: [invoice({ total_amount: 10, source_session_id: 'lesson', invoice_line_items: [{ session_ids: ['lesson', 'pkg'] }],
        pdf_meta: { paymentSourceType: 'session', paymentSourceId: 'lesson', paidAt: '2026-08-28T12:00:00Z' } })] });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ type: 'trial', packageLessons: null });
    expect(rows[0].students[0]).toMatchObject({ trialPaid: true, trialPaidAt: '2026-08-28T12:00:00Z', firstPackagePurchased: false });
  });
  it('keeps trial and package conversion facts per child on a mixed invoice', () => {
    const rows = build({
      students: [student, { ...student, id: 'sibling', full_name: 'Ieva' }],
      sessions: [session({ id: 'trial', student_id: 'sibling', subjects: { is_trial: true }, paid: false })],
      packages: [pkg({ paid: false, payment_status: 'pending' })],
      invoices: [invoice({ invoice_line_items: [{ session_ids: ['pkg', 'trial'] }], pdf_meta: { paidAt: '2026-09-05T12:00:00Z' } })],
    });
    expect(rows[0].type).toBe('mixed');
    expect(rows[0].students.find(child => child.name === 'Ieva')).toMatchObject({ trialPaid: true, firstPackagePurchased: false });
    expect(rows[0].students.find(child => child.name === 'Mantas')).toMatchObject({ trialPaid: false, firstPackagePurchased: true });
  });
  it('uses verified payment dates without treating reserved lessons as payments or inventing historical dates', () => {
    const rows = build({ sessions: [session({ id: 'reserved', paid: false, payment_status: 'confirmed' }),
      session({ id: 'free', is_complimentary: true }), session({ id: 'older' }), session({ id: 'recent', subjects: { is_trial: true } })],
      ledger: [{ source_type: 'session', source_id: 'recent', paid_at: '2026-10-06T21:30:00Z', currency: 'PLN', base_amount: 100, gross_amount: 110 }] });
    expect(rows.map(row => row.id)).toEqual(['session:older', 'session:recent']);
    expect(rows.find(row => row.id === 'session:older')?.paidAt).toBeNull();
    const filtered = filterPaymentReport(rows, { start: '2026-10-07', end: '2026-10-07', dateBasis: 'paid' });
    expect(filtered).toHaveLength(1);
    expect(filtered[0]).toMatchObject({ amount: 100, currency: 'PLN', type: 'trial' });
  });
  it('excludes tutor remuneration, retains cancelled invoices and does not guess students from payer email', () => {
    const rows = build({ invoices: [invoice({ invoice_line_items: [], buyer_snapshot: { name: 'Historical payer', email: student.payer_email }, status: 'cancelled' }),
      invoice({ id: 'salary', pdf_meta: { invoiceKind: 'tutor_pay' } }), invoice({ id: 'salary-legacy', seller_user_id: 't1' })] });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ status: 'cancelled', students: [], payerName: 'Historical payer', payerEmail: student.payer_email });
  });
  it('does not count a monthly billing batch and its lessons as separate payments', () => {
    const rows = build({ sessions: [session({ payment_batch_id: 'batch' })],
      invoices: [invoice({ billing_batch_id: 'batch', invoice_line_items: [{ session_ids: ['lesson'] }], status: 'issued', total_amount: 20 })],
      batches: [{ id: 'batch', paid: true, total_amount: 20, paid_at: '2026-09-03T09:00:00Z', created_at: '2026-09-02T09:00:00Z' }] });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ type: 'lesson', status: 'paid', paidAt: '2026-09-03T09:00:00Z' });
  });
  it('keeps refunded packages out of conversion facts, and filters type, tutor, search and status together', () => {
    const rows = build({ packages: [pkg({ payment_status: 'refunded' }), pkg({ id: 'pending', paid: false, payment_status: 'pending' })] });
    expect(rows[0].students[0].firstPackagePurchased).toBe(false);
    expect(filterPaymentReport(rows, { start: '', end: '', dateBasis: 'issued', type: 'package', status: 'pending', tutorId: 't1', search: 'asta@example' })).toHaveLength(1);
  });
  it('recognizes an invoiced refund even if the historical invoice still says paid', () => {
    const rows = build({ packages: [pkg({ manual_sales_invoice_id: 'inv', payment_status: 'refunded' })], invoices: [invoice()] });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ status: 'refunded', paidAt: null });
    expect(rows[0].students[0].firstPackagePurchased).toBe(false);
  });
  it('finds historical invoice batch links from lessons when billing_batch_id was not saved on the invoice', () => {
    const rows = build({ sessions: [session({ payment_batch_id: 'batch' })],
      invoices: [invoice({ invoice_line_items: [{ session_ids: ['lesson'] }], status: 'issued', total_amount: 20 })],
      batches: [{ id: 'batch', paid: true, total_amount: 20, paid_at: '2026-09-03T09:00:00Z', created_at: '2026-09-02T09:00:00Z' }] });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ type: 'lesson', status: 'paid', paidAt: '2026-09-03T09:00:00Z' });
  });
  it('validates date boundaries and uses Vilnius calendar days across daylight saving changes', () => {
    expect(validPaymentReportPeriod('2026-02-30', '2026-03-01')).toBe(false);
    expect(validPaymentReportPeriod('2026-10-10', '2026-10-07')).toBe(false);
    expect(validPaymentReportPeriod('', '')).toBe(true);
    expect(paymentReportDay('2026-10-24T21:30:00Z')).toBe('2026-10-25');
    expect(paymentReportDay('2026-10-25T22:30:00Z')).toBe('2026-10-26');
  });
});

describe('company payment exports', () => {
  const t = (key: string) => key;
  it('exports every requested field, preserves CSV quoting and protects cells from formulas', () => {
    const rows = build({ students: [{ ...student, full_name: '=HYPERLINK("bad")', payer_name: 'Asta; "B"\nC' }], packages: [pkg()] });
    const table = paymentReportTable(rows, t);
    expect(table.headers).toHaveLength(21);
    expect(table.values[0]).toHaveLength(21);
    const csv = paymentReportCsv(rows, t);
    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv).toContain("\"'=HYPERLINK(\"\"bad\"\")\"");
    expect(csv).toContain('"Asta; ""B""\nC"');
    expect(csv).toContain('"\'+37060000000"');
    expect(table.values[0][8]).toBe(80);
  });
  it('writes typed amounts, counts and calendar dates into a filterable Excel sheet', async () => {
    const rows = build({ packages: [pkg({ manual_sales_invoice_id: 'inv' })], invoices: [invoice()] });
    const buffer = await paymentReportXlsx(rows, t);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    const sheet = workbook.worksheets[0];
    expect(sheet.getCell('I2').value).toBe(80);
    expect(sheet.getCell('H2').value).toBe(4);
    expect(sheet.getCell('K2').value).toEqual(new Date('2026-09-02T00:00:00Z'));
    expect(sheet.getCell('L2').value).toEqual(new Date('2026-09-02T00:00:00Z'));
    expect(sheet.getCell('K2').numFmt).toBe('yyyy-mm-dd');
    expect(sheet.getCell('N2').value).toBeNull();
    expect(sheet.getCell('N2').numFmt).not.toBe('yyyy-mm-dd');
    expect(sheet.getCell('S2').numFmt).not.toBe('yyyy-mm-dd');
    expect(sheet.getCell('E2').value).toBe('+37060000000');
    expect(sheet.getCell('I2').numFmt).toBe('#,##0.00');
    expect(sheet.views[0]).toMatchObject({ state: 'frozen', ySplit: 1 });
    expect(sheet.autoFilter).toBe('A1:U2');
  });
});
