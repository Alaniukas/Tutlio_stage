import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { rowQuery } from '../fixtures/rowQuery';
import { PRO_KLASE_QA_ORG_ID } from '../../src/lib/marketMoney';

const state = vi.hoisted(() => ({ tables: {} as Record<string, any[]>, fetch: vi.fn(), invalidate: vi.fn(),
  canEdit: true, failure: '', badResult: false }));
vi.mock('@/lib/dataCache', () => ({ getCached: () => null, setCache: () => {}, invalidateCache: state.invalidate }));
vi.mock('@/lib/orgVisibleTutors', () => ({ getOrgVisibleTutors: async () => state.tables.profiles }));
vi.mock('@/lib/apiHelpers', () => ({ authHeaders: async () => ({ 'Content-Type': 'application/json' }) }));
vi.mock('@/contexts/OrgAdminAccessContext', () => ({ useOptionalOrgAdminAccess: () => ({ can: () => state.canEdit }) }));
vi.mock('@/lib/supabase', () => ({ supabase: {
  auth: { getUser: async () => ({ data: { user: { id: 'admin' } } }) },
  from: (table: string) => rowQuery(table, table => state.tables[table] || []),
} }));
vi.mock('@/components/InvoiceSettingsForm', () => ({ default: () => null }));
vi.mock('@/components/CreateInvoiceModal', () => ({ default: () => null }));
vi.mock('@/components/school/SchoolMonthlyInvoiceDialog', () => ({ default: () => null }));
vi.mock('@/components/ui/month-filter-input', () => ({ MonthFilterInput: (props: any) =>
  <input aria-label="Invoice month" type="month" value={props.value} onChange={event => props.onChange(event.target.value)} /> }));
vi.mock('@/components/ui/date-input', () => ({ DateInput: (props: any) => <input type="date" {...props} /> }));
import CompanyInvoices from '../../src/pages/company/CompanyInvoices';

const tutorId = 'b0a00000-7e57-4000-8000-000000000003';
const invoiceId = 'b0a00000-7e57-4000-8000-000000000020';
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-09T12:00:00Z'));
  state.canEdit = true; state.failure = ''; state.badResult = false; state.invalidate.mockReset();
  state.tables = { profiles: [{ id: tutorId, full_name: 'Dominykas Smaliukas', company_commission_percent: 14 }],
    organization_admins: [{ user_id: 'admin', organization_id: PRO_KLASE_QA_ORG_ID }],
    organizations: [{ id: PRO_KLASE_QA_ORG_ID, name: 'Organization', entity_type: 'company', features: {}, invoice_issuer_mode: 'both' }],
    invoice_profiles: [{ organization_id: PRO_KLASE_QA_ORG_ID, entity_type: 'mb', business_name: 'Organization',
      company_code: '123', address: 'Vilnius', contact_email: 'org@example.test' }],
    invoices: [{ id: invoiceId, invoice_number: 'SF-001', organization_id: PRO_KLASE_QA_ORG_ID, issued_by_user_id: 'admin',
      seller_snapshot: { name: 'Dominykas Smaliukas' }, buyer_snapshot: { name: 'Organization' }, total_amount: 28,
      issue_date: '2026-10-02', created_at: '2026-10-02T12:00:00Z', status: 'issued', origin: 'generated',
      pdf_meta: { invoiceKind: 'tutor_pay', tutorId } }] };
  state.fetch.mockReset().mockImplementation(async (url: string, init: any) => {
    const body = init?.body ? JSON.parse(init.body) : {};
    if (url === '/api/generate-invoice') return { ok: true, json: async () => ({ canGenerate: true, candidateCount: 2, candidateTotal: 28 }) };
    if (url !== '/api/company-invoice-update') throw new Error(`Unexpected request ${url}`);
    if (state.failure) return { ok: false, status: 409, json: async () => ({ error: 'Conflict' }) };
    if (state.badResult) return { ok: true, status: 200, json: async () => ({ invoice: { id: 'wrong-invoice', status: 'paid' } }) };
    const invoice = { ...state.tables.invoices[0], ...(body.action === 'mark_paid'
      ? { status: 'paid' } : { invoice_number: body.invoiceNumber.toUpperCase() }) };
    state.tables.invoices[0] = invoice;
    return { ok: true, status: 200, json: async () => ({ invoice }) };
  });
  vi.stubGlobal('fetch', state.fetch);
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('admin invoice payment persistence and number correction', () => {
  it('shows the beneficiary name even when the administrator issued the invoice', async () => {
    render(<CompanyInvoices />);
    expect(await screen.findByText(/Dominykas Smaliukas/)).toBeTruthy();
  });
  it('saves paid state through the server and retains it after reloading the page', async () => {
    const view = render(<CompanyInvoices />);
    fireEvent.click(await screen.findByRole('button', { name: 'Pažymėti kaip apmokėtą' }));
    expect(await screen.findByText('Apmokėta', { exact: true, selector: 'span' })).toBeTruthy();
    expect(state.invalidate).toHaveBeenCalledWith('company_invoices');
    const request = state.fetch.mock.calls.find(([url]) => url === '/api/company-invoice-update')!;
    expect(JSON.parse(request[1].body)).toEqual({ action: 'mark_paid', invoiceId });
    view.unmount(); render(<CompanyInvoices />);
    expect(await screen.findByText('Apmokėta', { exact: true, selector: 'span' })).toBeTruthy();
    expect(screen.queryByText('Išrašyta', { exact: true, selector: 'span' })).toBeNull();
  });
  it.each(['conflict', 'unverified'])('keeps an invoice issued when the save is %s', async failure => {
    state.failure = failure === 'conflict' ? 'conflict' : ''; state.badResult = failure === 'unverified';
    render(<CompanyInvoices />);
    fireEvent.click(await screen.findByRole('button', { name: 'Pažymėti kaip apmokėtą' }));
    expect(await screen.findByText('Nepavyko išsaugoti')).toBeTruthy();
    expect(screen.getByText('Išrašyta', { exact: true, selector: 'span' })).toBeTruthy();
    expect(screen.queryByText('Apmokėta', { exact: true, selector: 'span' })).toBeNull();
    expect(state.invalidate).not.toHaveBeenCalled();
  });
  it('corrects the repeated number with a suggested tutor series and preserves paid status on reload', async () => {
    state.tables.invoices[0].status = 'paid';
    const view = render(<CompanyInvoices />);
    fireEvent.click(await screen.findByRole('button', { name: 'Keisti numerį SF-001' }));
    const dialog = within(screen.getByRole('dialog'));
    expect((dialog.getByLabelText('Naujas sąskaitos numeris') as HTMLInputElement).value).toBe('DOMSMA-001');
    fireEvent.click(dialog.getByRole('button', { name: 'Išsaugoti' }));
    expect(await screen.findByText('DOMSMA-001', { exact: true })).toBeTruthy();
    expect(state.invalidate).toHaveBeenCalledWith('company_invoices');
    const request = state.fetch.mock.calls.find(([url]) => url === '/api/company-invoice-update')!;
    expect(JSON.parse(request[1].body)).toEqual({ action: 'change_number', invoiceId,
      expectedNumber: 'SF-001', invoiceNumber: 'DOMSMA-001' });
    view.unmount(); render(<CompanyInvoices />);
    expect(await screen.findByText('DOMSMA-001', { exact: true })).toBeTruthy();
    expect(screen.getByText('Apmokėta', { exact: true, selector: 'span' })).toBeTruthy();
  });
  it('keeps the correction dialog and old number visible when another invoice already uses the number', async () => {
    state.failure = 'conflict';
    render(<CompanyInvoices />);
    fireEvent.click(await screen.findByRole('button', { name: 'Keisti numerį SF-001' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Išsaugoti' }));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Šis numeris jau naudojamas');
    expect(screen.getByText('SF-001', { exact: true })).toBeTruthy();
    expect(state.invalidate).not.toHaveBeenCalled();
  });
  it('hides the save and correction controls without finance.edit', async () => {
    state.canEdit = false;
    render(<CompanyInvoices />); await screen.findByText('SF-001', { exact: true });
    expect(screen.queryByRole('button', { name: 'Pažymėti kaip apmokėtą' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Keisti numerį SF-001' })).toBeNull();
  });
  it('uses the previous full calendar month and server totals for pending tutor invoices', async () => {
    render(<CompanyInvoices />);
    fireEvent.click(await screen.findByRole('button', { name: 'Korepetitoriai', exact: true }));
    await waitFor(() => expect(state.fetch.mock.calls.filter(([url]) => url === '/api/generate-invoice').length).toBeGreaterThan(0));
    const request = state.fetch.mock.calls.filter(([url]) => url === '/api/generate-invoice').at(-1)!;
    expect(JSON.parse(request[1].body)).toMatchObject({ periodStart: '2026-09-01', periodEnd: '2026-09-30', precheckOnly: true });
    expect(screen.getByText(/€28\.00/)).toBeTruthy();
  });
});
