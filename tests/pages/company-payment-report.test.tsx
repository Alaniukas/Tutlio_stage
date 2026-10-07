import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import CompanyPaymentReport from '@/pages/company/CompanyPaymentReport';
import { paymentReportDay, type PaymentReportRow } from '@/lib/companyPaymentReport';

const { download, exportExcel } = vi.hoisted(() => ({ download: vi.fn(), exportExcel: vi.fn() }));
vi.mock('@/lib/apiHelpers', () => ({ authHeaders: vi.fn().mockResolvedValue({ Authorization: 'Bearer token' }) }));
vi.mock('@/lib/i18n', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@/components/ui/date-input', () => ({ DateInput: ({ onChange, ...props }: any) => <input type="date" {...props} onChange={onChange} /> }));
vi.mock('@/lib/companyPaymentReportExport', async importOriginal => ({
  ...await importOriginal<typeof import('@/lib/companyPaymentReportExport')>(), downloadPaymentReport: download, paymentReportXlsx: exportExcel,
}));

const row = (index: number): PaymentReportRow => ({
  id: `i${index}`, invoiceId: `i${index}`, invoiceNumber: `PK-${index}`, students: [{ id: `s${index}`, name: `Student ${index}`,
    firstLessonAt: '2026-01-02T12:00:00Z', completedLessons: 4, cancelledLessons: 1, noShowLessons: 0,
    trialPaid: true, trialPaidAt: '2026-01-02T12:00:00Z', firstPackagePurchased: true, firstPackagePaidAt: '2026-02-02T12:00:00Z' }],
  payerName: 'Asta', payerEmail: 'payer@example.test', payerPhone: '+37060000000', tutors: [{ id: 't1', name: 'Jonas' }],
  type: index === 54 ? 'trial' : 'package', packageLessons: 4, amount: 80, currency: 'EUR', issueDate: paymentReportDay(new Date().toISOString()),
  createdAt: new Date().toISOString(), paidAt: new Date().toISOString(), status: 'paid',
});

describe('company payment report page', () => {
  beforeEach(() => { download.mockReset(); exportExcel.mockReset().mockResolvedValue(new ArrayBuffer(8)); });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
  it('exports every matching row across pages and applies the same type and search filters', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ rows: Array.from({ length: 55 }, (_, index) => row(index)) }) });
    vi.stubGlobal('fetch', fetchMock);
    render(<CompanyPaymentReport />);
    const table = await screen.findByRole('table');
    await waitFor(() => expect(within(table).getAllByRole('row')).toHaveLength(51));
    fireEvent.click(screen.getByRole('button', { name: 'CSV' }));
    await waitFor(() => expect(download).toHaveBeenCalled());
    expect(download.mock.calls[0][0]).toContain('PK-54');
    fireEvent.change(screen.getByLabelText('companyPaymentReport.type'), { target: { value: 'trial' } });
    expect(within(table).getAllByRole('row')).toHaveLength(2);
    expect(within(table).getByText('Student 54')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('companyPaymentReport.search'), { target: { value: 'missing name' } });
    expect(screen.getByText('companyPaymentReport.empty')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'CSV' }) as HTMLButtonElement).disabled).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    fireEvent.change(screen.getByLabelText('companyPaymentReport.search'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Excel' }));
    await waitFor(() => expect(exportExcel).toHaveBeenCalled());
    expect(exportExcel.mock.calls[0][0]).toHaveLength(1);
    expect(exportExcel.mock.calls[0][0][0].type).toBe('trial');
    await waitFor(() => expect(download).toHaveBeenCalledWith(expect.any(ArrayBuffer), 'xlsx', expect.any(String)));
  });
  it('disables export for invalid periods', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ rows: [row(1)] }) }));
    render(<CompanyPaymentReport />);
    await screen.findByText('Student 1');
    fireEvent.change(screen.getByLabelText('companyPaymentReport.start'), { target: { value: '2026-12-31' } });
    fireEvent.change(screen.getByLabelText('companyPaymentReport.end'), { target: { value: '2026-01-01' } });
    expect(screen.getByRole('alert').textContent).toContain('companyPaymentReport.invalidPeriod');
    expect((screen.getByRole('button', { name: 'Excel' }) as HTMLButtonElement).disabled).toBe(true);
  });
  it('shows a retryable error instead of a successful empty report', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
    render(<CompanyPaymentReport />);
    expect((await screen.findByRole('alert')).textContent).toContain('companyPaymentReport.loadError');
    expect(screen.getByRole('button', { name: 'companyPaymentReport.retry' })).toBeTruthy();
    expect((screen.getByRole('button', { name: 'CSV' }) as HTMLButtonElement).disabled).toBe(true);
  });
});
