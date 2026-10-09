import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import CompanyInvoices from '@/pages/company/CompanyInvoices';

const state = vi.hoisted(() => ({
  entityType: 'school',
  schoolError: false,
  queries: [] as Array<{ table: string; filters: Array<[string, unknown]>; from: number }>,
  schoolInvoices: [] as any[],
  singleDownload: vi.fn(async () => true),
  zipDownload: vi.fn(async () => ({ downloaded: 4, failedIds: [] as string[] })),
}));

vi.mock('@/lib/dataCache', () => ({ getCached: () => null, setCache: vi.fn() }));
vi.mock('@/lib/orgVisibleTutors', () => ({ getOrgVisibleTutors: async () => [] }));
vi.mock('@/lib/apiHelpers', () => ({ authHeaders: async () => ({ Authorization: 'Bearer admin' }) }));
vi.mock('@/lib/i18n', () => ({ useTranslation: () => ({
  t: (key: string, params?: { count?: string }) => params?.count ? `${key} ${params.count}` : key,
}) }));
vi.mock('@/lib/downloadInvoicesZip', () => ({
  downloadInvoicePdfFile: (...args: any[]) => state.singleDownload(...args),
  downloadInvoicesAsZip: (...args: any[]) => state.zipDownload(...args),
}));
vi.mock('@/components/InvoiceSettingsForm', () => ({ default: () => null }));
vi.mock('@/components/CreateInvoiceModal', () => ({ default: () => null }));
vi.mock('@/components/school/SchoolMonthlyInvoiceDialog', () => ({ default: () => null }));
vi.mock('@/components/ui/month-filter-input', () => ({
  MonthFilterInput: ({ value, onChange }: any) => (
    <input aria-label="Invoice month" type="month" value={value} onChange={event => onChange(event.target.value)} />
  ),
}));
vi.mock('@/components/ui/date-input', () => ({
  DateInput: ({ value, onChange }: any) => <input type="date" value={value} onChange={onChange} />,
}));
vi.mock('@/lib/supabase', () => ({ supabase: {
  auth: { getUser: async () => ({ data: { user: { id: 'admin' } } }) },
  from: (table: string) => {
    const request = { table, filters: [] as Array<[string, unknown]>, from: 0 };
    state.queries.push(request);
    const predicates: Array<(row: any) => boolean> = [];
    const result = () => {
      const rows = table === 'organization_admins' ? [{ user_id: 'admin', organization_id: 'org' }]
        : table === 'organizations' ? [{ id: 'org', name: 'School', entity_type: state.entityType,
          features: { school_monthly_invoices: false } }]
        : table === 'invoice_profiles' ? [{ organization_id: 'org', business_name: 'School' }]
        : table === 'invoices' ? [{ id: 'teacher-pay', organization_id: 'org', invoice_number: 'TEACHER-1',
          issue_date: '2026-10-01', created_at: '2026-10-01T08:00:00Z', buyer_snapshot: { name: 'School' },
          issued_by_user_id: 'teacher', total_amount: 100, status: 'issued' }]
        : table === 'school_monthly_invoices' ? state.schoolInvoices : [];
      const filtered = rows.filter(row => predicates.every(predicate => predicate(row)));
      return { data: table === 'school_monthly_invoices' ? filtered.slice(request.from, request.from + 2) : filtered,
        error: table === 'school_monthly_invoices' && state.schoolError ? { message: 'Unavailable' } : null };
    };
    const query: any = new Proxy({}, { get: (_target, method) => {
      if (method === 'then') return (resolve: any) => Promise.resolve(result()).then(resolve);
      if (method === 'single' || method === 'maybeSingle') return async () => ({ ...result(), data: result().data[0] || null });
      if (method === 'eq' || method === 'gte' || method === 'lte') return (column: string, value: any) => {
        request.filters.push([column, value]);
        predicates.push(row => method === 'eq' ? row[column] === value : method === 'gte' ? row[column] >= value : row[column] <= value);
        return query;
      };
      if (method === 'not') return (column: string, _operator: string, value: unknown) => {
        predicates.push(row => row[column] != value); return query;
      };
      if (method === 'range') return (from: number) => { request.from = from; return query; };
      return () => query;
    } });
    return query;
  },
} }));

beforeEach(() => {
  state.entityType = 'school'; state.schoolError = false; state.queries = [];
  state.singleDownload.mockClear(); state.zipDownload.mockClear();
  state.schoolInvoices = [
    { id: 'payer-pending', invoice_number: 'PAM-1', payment_status: 'pending', created_at: '2026-10-04T09:00:00Z', pdf_path: 'school-monthly/org/1.pdf' },
    { id: 'payer-paid', invoice_number: 'PAM-2', payment_status: 'paid', created_at: '2026-10-05T09:00:00Z', pdf_path: 'school-monthly/org/2.pdf' },
    { id: 'payer-cancelled', invoice_number: 'PAM-3', payment_status: 'cancelled', created_at: '2026-09-28T09:00:00Z', pdf_path: 'school-monthly/org/3.pdf' },
    { id: 'no-pdf', invoice_number: 'PAM-4', payment_status: 'pending', created_at: '2026-10-07T09:00:00Z', pdf_path: null },
    { id: 'legacy-cancelled', invoice_number: null, payment_status: 'cancelled', created_at: '2026-10-01T09:00:00Z', pdf_path: null },
  ].map(row => ({ ...row, organization_id: 'org', total_eur: 36,
    student: { full_name: 'Student', payer_name: 'School', payer_email: 'parent@example.test' } }));
  state.schoolInvoices.push({ ...state.schoolInvoices[0], id: 'foreign', invoice_number: 'FOREIGN-1', organization_id: 'other' });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('school payer invoices in the organization invoice list', () => {
  it('loads every numbered payer invoice alongside tutor invoices, including when new billing is disabled', async () => {
    render(<CompanyInvoices />);
    await screen.findByText('PAM-4');
    for (const number of ['TEACHER-1', 'PAM-1', 'PAM-2', 'PAM-3']) expect(screen.getByText(number)).toBeTruthy();
    expect(screen.queryByText('FOREIGN-1')).toBeNull();
    expect(screen.getAllByRole('checkbox')).toHaveLength(6); // select all, teacher, 4 numbered payer invoices
    expect(state.queries.filter(query => query.table === 'school_monthly_invoices').map(query => query.from)).toEqual([0, 2, 4]);
    expect(state.queries.filter(query => query.table === 'school_monthly_invoices').every(query =>
      query.filters.some(([column, value]) => column === 'organization_id' && value === 'org'))).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'invoices.buyerKindPayer' }));
    expect(screen.queryByText('TEACHER-1')).toBeNull();
    expect(screen.getByText('PAM-1')).toBeTruthy(); // payer name matching school must still be a payer
    const payerRow = screen.getByText('PAM-1').closest('.rounded-xl') as HTMLElement;
    expect(within(payerRow).queryByTitle('invoices.delete')).toBeNull();
    expect(within(payerRow).queryByTitle('invoices.markPaid')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'invoices.buyerKindOrg' }));
    expect(screen.getByText('TEACHER-1')).toBeTruthy();
    expect(screen.queryByText('PAM-1')).toBeNull();
  });

  it('applies paid, issued and cancelled filters to payer payment statuses', async () => {
    render(<CompanyInvoices />);
    await screen.findByText('PAM-4');
    fireEvent.click(screen.getByRole('button', { name: 'invoices.statusPaid' }));
    await waitFor(() => expect(screen.queryByText('PAM-1')).toBeNull());
    expect(screen.getByText('PAM-2')).toBeTruthy();
    expect(screen.queryByText('TEACHER-1')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'invoices.statusIssued' }));
    await screen.findByText('PAM-1');
    expect(screen.queryByText('PAM-2')).toBeNull();
    expect(screen.getByText('PAM-4')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'invoices.statusCancelled' }));
    await screen.findByText('PAM-3');
    expect(screen.queryByText('PAM-4')).toBeNull();
  });

  it('uses the issue date for filters and allows stored canonical PDFs without file path metadata', async () => {
    const { container } = render(<CompanyInvoices />);
    await screen.findByText('PAM-4');
    fireEvent.click(screen.getByRole('button', { name: 'invoices.buyerKindPayer' }));
    fireEvent.change(screen.getByLabelText('Invoice month'), { target: { value: '2026-09' } });
    await waitFor(() => expect(screen.queryByText('PAM-1')).toBeNull());
    expect(screen.getByText('PAM-3')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'invoices.periodModeRange' }));
    fireEvent.change(container.querySelectorAll('input[type="date"]')[1], { target: { value: '2026-10-31' } });
    await screen.findByText('PAM-4');

    const row = screen.getByText('PAM-1').closest('.rounded-xl') as HTMLElement;
    fireEvent.click(within(row).getByRole('button', { name: 'invoices.downloadPdf' }));
    await waitFor(() => expect(state.singleDownload).toHaveBeenCalledWith(expect.objectContaining({
      id: 'payer-pending', source: 'school_monthly', total_amount: 36, issue_date: '2026-10-04',
    }), { Authorization: 'Bearer admin' }));
    const missingRow = screen.getByText('PAM-4').closest('.rounded-xl') as HTMLElement;
    const missingPathDownload = within(missingRow).getByRole('button', { name: 'invoices.downloadPdf' }) as HTMLButtonElement;
    expect(missingPathDownload.disabled).toBe(false);
    fireEvent.click(missingPathDownload);
    await waitFor(() => expect(state.singleDownload).toHaveBeenCalledWith(expect.objectContaining({
      id: 'no-pdf', source: 'school_monthly',
    }), { Authorization: 'Bearer admin' }));
    fireEvent.click(screen.getByLabelText('invoices.selectAll'));
    fireEvent.click(screen.getByRole('button', { name: 'invoices.downloadSelected 4' }));
    await waitFor(() => expect(state.zipDownload).toHaveBeenCalledOnce());
    expect(state.zipDownload.mock.calls[0][0].map((invoice: any) => invoice.id)).toEqual(['payer-cancelled', 'payer-pending', 'payer-paid', 'no-pdf']);
  });

  it('shows a load error instead of silently hiding payer invoices', async () => {
    state.schoolError = true;
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<CompanyInvoices />);
    expect((await screen.findByRole('alert')).textContent).toBe('common.error');
    expect(screen.getByText('TEACHER-1')).toBeTruthy();
  });

  it('keeps company organizations on their existing invoice source', async () => {
    state.entityType = 'company';
    render(<CompanyInvoices />);
    await screen.findByText('TEACHER-1');
    expect(state.queries.some(query => query.table === 'school_monthly_invoices')).toBe(false);
    expect(screen.queryByText('PAM-1')).toBeNull();
  });
});
