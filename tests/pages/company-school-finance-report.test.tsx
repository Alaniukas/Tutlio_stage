import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import CompanySchoolFinanceReport from '@/pages/company/CompanySchoolFinanceReport';

const state = vi.hoisted(() => ({ hook: vi.fn(), export: vi.fn(), reload: vi.fn() }));
vi.mock('@/hooks/useSchoolPaymentsData', () => ({ useSchoolPaymentsData: (...args: any[]) => state.hook(...args) }));
vi.mock('@/lib/schoolFinanceXlsxExport', () => ({ downloadSchoolFinanceXlsx: (...args: any[]) => state.export(...args) }));
vi.mock('@/lib/i18n', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

beforeEach(() => {
  vi.clearAllMocks();
  const active = { id: 'active', annual_fee: 100, signing_status: 'signed', contract_number: 'SUT-A', student: { full_name: 'Current student' } };
  const installments = [100, 300, 50, 50].map((amount, index) => ({
    id: `receipt-${index}`, contract_id: index === 0 ? 'active' : `archived-${index}`, installment_number: 1,
    amount, payment_status: 'paid', paid_at: '2026-07-28', due_date: '2026-08-01', stripe_payment_intent_id: 'pi_paid',
    contract: index === 0 ? active : { ...active, id: `archived-${index}`, contract_number: `SUT-${index}`, archived_at: '2026-09-04', signing_status: 'sent' },
  }));
  state.hook.mockReturnValue({ orgName: 'Demo school', contracts: [active], installments, loading: false, error: false, reload: state.reload });
  state.export.mockResolvedValue(undefined);
});
afterEach(cleanup);

function renderReport() {
  return render(<MemoryRouter initialEntries={['/school/finance?tab=report']}><CompanySchoolFinanceReport /></MemoryRouter>);
}

describe('school finance report', () => {
  it('includes historical receipts, identifies archived contracts on screen and print, and links to their archive', () => {
    renderReport();
    expect(state.hook).toHaveBeenCalledWith({ includePaidHistory: true });
    expect(screen.getAllByText('€500.00').length).toBeGreaterThan(0);
    expect(screen.getAllByText('school.archive.archivedAt: 2026-09-04')).toHaveLength(6);
    expect(screen.getByRole('link', { name: 'school.archive.title' }).getAttribute('href')).toBe('/school/finance?tab=contract-archive');
  });

  it('exports the same historical receipts and totals shown in the report', async () => {
    renderReport();
    fireEvent.click(screen.getByRole('button', { name: 'school.financeExportXlsx' }));
    await waitFor(() => expect(state.export).toHaveBeenCalledOnce());
    const [rows, , summary] = state.export.mock.calls[0];
    expect(rows.filter((row: any) => row.contractArchivedAt)).toHaveLength(3);
    expect(summary.totalPaid).toBe(500);
  });

  it('offers a retry instead of displaying incomplete totals when loading fails', () => {
    state.hook.mockReturnValue({ ...state.hook(), error: true });
    renderReport();
    expect(screen.getByRole('alert').textContent).toContain('companyPaymentReport.loadError');
    expect(screen.queryByText('€500.00')).toBeNull();
    expect(screen.queryByRole('button', { name: 'school.financeExportXlsx' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'companyPaymentReport.retry' }));
    expect(state.reload).toHaveBeenCalledOnce();
  });
});
