import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import CompanyInvoices from '@/pages/company/CompanyInvoices';

type Row = Record<string, any>;
type Filter = { column: string; operator: 'eq' | 'gte' | 'lte'; value: unknown };

const state = vi.hoisted(() => ({
  invoices: [] as Row[],
  invoiceQueries: [] as Filter[][],
  tutors: [] as Row[],
}));

vi.mock('@/lib/dataCache', () => ({ getCached: () => null, setCache: vi.fn() }));
vi.mock('@/lib/orgVisibleTutors', () => ({ getOrgVisibleTutors: async () => state.tutors }));
vi.mock('@/lib/apiHelpers', () => ({ authHeaders: async () => ({ 'Content-Type': 'application/json' }) }));
vi.mock('@/lib/i18n', () => ({
  useTranslation: () => ({
    t: (key: string, params?: { count?: string }) => params?.count ? `${key} ${params.count}` : key,
  }),
}));
vi.mock('@/components/InvoiceSettingsForm', () => ({ default: () => null }));
vi.mock('@/components/CreateInvoiceModal', () => ({ default: () => null }));
vi.mock('@/components/school/SchoolMonthlyInvoiceDialog', () => ({ default: () => null }));
vi.mock('@/components/ui/month-filter-input', () => ({
  MonthFilterInput: ({ value, onChange }: { value: string; onChange: (value: string) => void }) => (
    <input aria-label="Invoice month" type="month" value={value} onChange={event => onChange(event.target.value)} />
  ),
}));
vi.mock('@/components/ui/date-input', () => ({
  DateInput: ({ value, onChange, min }: { value: string; onChange: (event: any) => void; min?: string }) => (
    <input type="date" value={value} min={min} onChange={onChange} />
  ),
}));
vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: { getUser: async () => ({ data: { user: { id: 'admin' } } }) },
    from: (table: string) => {
      const filters: Filter[] = [];
      const result = () => {
        if (table === 'invoices') state.invoiceQueries.push([...filters]);
        const rows = table === 'invoices' ? state.invoices
          : table === 'organization_admins' ? [{ user_id: 'admin', organization_id: 'org' }]
          : table === 'organizations' ? [{ id: 'org', name: 'Organization', entity_type: 'company', features: {} }]
          : table === 'profiles' ? state.tutors
          : [];
        return {
          data: rows.filter(row => filters.every(({ column, operator, value }) => {
            if (operator === 'gte') return row[column] >= value!;
            if (operator === 'lte') return row[column] <= value!;
            return row[column] === value;
          })),
          error: null,
        };
      };
      const query: any = new Proxy({}, {
        get: (_target, method) => {
          if (method === 'then') return (resolve: (value: unknown) => unknown) => Promise.resolve(result()).then(resolve);
          if (method === 'single' || method === 'maybeSingle') return async () => {
            const value = result();
            return { ...value, data: value.data[0] || null };
          };
          if (method === 'eq' || method === 'gte' || method === 'lte') {
            return (column: string, value: unknown) => {
              filters.push({ column, operator: method, value });
              return query;
            };
          }
          return () => query;
        },
      });
      return query;
    },
  },
}));

async function expectInvoiceCount(count: number) {
  await waitFor(() => expect(screen.getAllByRole('checkbox', {
    name: /^(SEP|OCT)-\d+$/,
  })).toHaveLength(count));
}

describe('Company invoice period filters', () => {
  beforeEach(() => {
    state.invoiceQueries = [];
    state.tutors = [];
    state.invoices = [
      ...Array.from({ length: 9 }, (_, index) => ({ month: '09', prefix: 'SEP', index })),
      ...Array.from({ length: 10 }, (_, index) => ({ month: '10', prefix: 'OCT', index })),
    ].map(({ month, prefix, index }) => ({
      id: `${prefix}-${index + 1}`,
      invoice_number: `${prefix}-${index + 1}`,
      organization_id: 'org',
      issue_date: `2026-${month}-01`,
      created_at: `2026-${month}-01T08:00:00Z`,
      buyer_snapshot: { name: 'Parent' },
      issued_by_user_id: 'admin',
      total_amount: 10,
      status: 'paid',
      origin: 'generated',
    }));
  });

  afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it('asks before bulk teacher regeneration and cancelling does not create invoices', async () => {
    state.tutors = [{ id: 'teacher', full_name: 'Teacher One', company_commission_percent: 45 }];
    const regeneration = { invoiceIds: ['old'], invoiceNumbers: ['SF-OLD'], token: 'signed-preview' };
    const posts: any[] = [];
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: any) => {
      const body = JSON.parse(init.body); posts.push(body);
      return { ok: true, json: async () => body.precheckOnly
        ? { canGenerate: false, reason: 'duplicate', regeneration }
        : { invoiceIds: ['new'], count: 1 } };
    }));
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    render(<CompanyInvoices />);
    fireEvent.click(await screen.findByRole('button', { name: 'invoices.tabTutors' }));
    await screen.findByText('Teacher One');
    fireEvent.click(screen.getByLabelText('invoices.selectAll'));
    fireEvent.click(await screen.findByRole('button', { name: 'invoices.generateForTutors 1' }));
    await waitFor(() => expect(confirm).toHaveBeenCalledOnce());
    expect(posts.filter(body => !body.precheckOnly)).toHaveLength(0);
    fireEvent.click(await screen.findByRole('button', { name: 'invoices.generateForTutors 1' }));
    await waitFor(() => expect(posts.filter(body => !body.precheckOnly)).toHaveLength(1));
    expect(posts.find(body => !body.precheckOnly).regeneration).toEqual(regeneration);
  });

  it('includes October when a September month filter is extended to a two-month date range', async () => {
    const { container } = render(<CompanyInvoices />);
    await expectInvoiceCount(19);

    fireEvent.change(screen.getByLabelText('Invoice month'), { target: { value: '2026-09' } });
    await expectInvoiceCount(9);
    fireEvent.click(screen.getByRole('button', { name: 'invoices.periodModeRange' }));
    await expectInvoiceCount(9);
    fireEvent.change(container.querySelectorAll('input[type="date"]')[1], { target: { value: '2026-10-31' } });

    await expectInvoiceCount(19);
    expect(screen.getByText('OCT-10')).toBeTruthy();
    expect(state.invoiceQueries.at(-1)).not.toContainEqual({ column: 'issue_date', operator: 'lte', value: '2026-09-30' });

    fireEvent.click(screen.getByRole('button', { name: 'invoices.periodModeMonth' }));
    await expectInvoiceCount(9);
    expect(screen.queryByText('OCT-10')).toBeNull();
  });

  it('honors an October-only range while the earlier September month choice remains stored', async () => {
    const { container } = render(<CompanyInvoices />);
    await expectInvoiceCount(19);
    fireEvent.change(screen.getByLabelText('Invoice month'), { target: { value: '2026-09' } });
    await expectInvoiceCount(9);
    fireEvent.click(screen.getByRole('button', { name: 'invoices.periodModeRange' }));
    fireEvent.change(container.querySelectorAll('input[type="date"]')[1], { target: { value: '2026-10-31' } });
    fireEvent.change(container.querySelectorAll('input[type="date"]')[0], { target: { value: '2026-10-01' } });

    await expectInvoiceCount(10);
    expect(screen.queryByText('SEP-1')).toBeNull();
    expect(screen.getByText('OCT-1')).toBeTruthy();
  });

  it('shows the invoice currency and warns when organization invoice settings are missing', async () => {
    state.invoices[0] = { ...state.invoices[0], total_amount: 50, pdf_meta: { currency: 'PLN' } };
    render(<CompanyInvoices />);
    await expectInvoiceCount(19);
    expect(screen.getByText(/50\.00 PLN/)).toBeTruthy();
    expect(screen.queryByText(/€50\.00/)).toBeNull();
    expect(screen.getByText('invoices.orgProfileIncomplete')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'invoices.openOrgSettings' })).toBeTruthy();
  });
});
