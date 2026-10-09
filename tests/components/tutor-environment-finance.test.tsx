import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { qaAdjustments, qaClock, qaExpected, qaInvoiceProfiles, qaOrganizations, qaProfiles, qaSessions } from '../fixtures/tutor-environment-finance';
import { rowQuery } from '../fixtures/rowQuery';
import type { InputHTMLAttributes } from 'react';

const state = vi.hoisted(() => ({ company: 0, tables: {} as Record<string, any[]>, failedTable: '' }));
vi.mock('@/contexts/UserContext', () => ({ useUser: () => ({ profile: state.tables.profiles[state.company] }) }));
vi.mock('@/hooks/useOrgFeatures', () => ({ useOrgFeatures: () => ({ organizationId: state.tables.organizations[state.company].id,
  entityType: 'company', hasFeature: () => false, loading: false, error: false }) }));
vi.mock('@/hooks/useOrgTutorPolicy', () => ({ useOrgTutorPolicy: () => ({ payPerLessonEur: state.company === 0 ? 14 : 18,
  loading: false, invoiceIssuerMode: 'tutor' }) }));
vi.mock('@/lib/preload', () => ({ dedupeAuthGetUser: async () => ({ id: state.tables.profiles[state.company].id }) }));
vi.mock('@/lib/apiHelpers', () => ({ authHeaders: async () => ({ Authorization: 'Bearer qa' }) }));
vi.mock('@/lib/fetchOrgTutorInvoicesDeduped', () => ({ fetchOrgTutorInvoicesDeduped: async () => ({ ok: true, data: { invoices: [], periodInvoices: [] } }) }));
vi.mock('@/lib/supabase', () => ({ supabase: { from: (table: string) => {
  const query = rowQuery(table, table => state.tables[table] || []);
  if (table === state.failedTable) query.then = (resolve: any, reject: any) => Promise.resolve({ data: null, error: new Error('Pay adjustments unavailable') }).then(resolve, reject);
  return query;
},
  auth: { getUser: async () => ({ data: { user: { id: state.tables.profiles[state.company].id } } }) } } }));
vi.mock('@/components/InvoiceSettingsForm', () => ({ default: () => null }));
vi.mock('@/components/ui/date-input', () => ({ DateInput: (props: InputHTMLAttributes<HTMLInputElement>) => <input {...props} type="date" /> }));
import OrgTutorFinanceSummary from '../../src/components/OrgTutorFinanceSummary';
import CreateInvoiceModal from '../../src/components/CreateInvoiceModal';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date(qaClock));
  state.tables = { profiles: qaProfiles, organizations: qaOrganizations, sessions: qaSessions, tutor_adjustments: qaAdjustments };
  state.failedTable = '';
  vi.stubGlobal('fetch', vi.fn(async (url: string) => ({ ok: true, json: async () => url.startsWith('/api/invoice-settings')
    ? { data: qaInvoiceProfiles[state.company] } : { canGenerate: true } })));
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('pay stays consistent in both assigned tutor environments', () => {
  it('shows the original fine and its manual correction even when their net amount is zero', async () => {
    state.company = 0;
    state.tables.tutor_adjustments = [...qaAdjustments, { ...qaAdjustments[0], id: 'manual-correction',
      type: 'penalty_manual', amount_eur: 10, reason: 'Baudos korekcija' }];
    render(<OrgTutorFinanceSummary />);
    await screen.findByText('Baudos korekcija');
    expect(within(screen.getByRole('region', { name: 'Atlygio suvestinė' })).getAllByText('€44.00')).toHaveLength(2);
    const adjustments = within(screen.getByRole('region', { name: 'Baudos ir koregavimai' }));
    expect(adjustments.getByText('Testinis koregavimas')).toBeTruthy();
    expect(adjustments.getByText('Baudos korekcija')).toBeTruthy();
    expect(adjustments.getByText('€-10.00')).toBeTruthy();
    expect(adjustments.getByText('+€10.00')).toBeTruthy();
  });
  it('keeps the Pro Klasė tutor summary scoped to the current organization', async () => {
    state.company = 0;
    state.tables.sessions = [...qaSessions, { ...qaSessions[0], id: 'foreign-session',
      students: { organization_id: 'another-org' } }];
    render(<OrgTutorFinanceSummary />);
    expect(await screen.findByText('€34.00')).toBeTruthy();
    expect(screen.queryByText('€48.00')).toBeNull();
  });
  it.each([0, 1])('hides a previous pay total when company %i selects an invalid period', async company => {
    state.company = company;
    render(<OrgTutorFinanceSummary />);
    await screen.findByText(`€${qaExpected[company].total.toFixed(2)}`);
    fireEvent.click(screen.getByRole('button', { name: 'Laikotarpis', exact: true }));
    const dates = document.querySelectorAll<HTMLInputElement>('input[type=date]');
    fireEvent.change(dates[0], { target: { value: '2026-10-10' } });
    expect(await screen.findByText('Pradžios data negali būti vėlesnė už pabaigos datą.')).toBeTruthy();
    expect(screen.queryByText(`€${qaExpected[company].total.toFixed(2)}`)).toBeNull();
  });
  it('does not preview an overstated total when adjustments fail to load', async () => {
    state.company = 0; state.failedTable = 'tutor_adjustments';
    render(<CreateInvoiceModal isOpen isOrgTutor onClose={() => {}} />);
    const preview = screen.getByRole('button', { name: 'Peržiūrėti pamokas' });
    await waitFor(() => expect((preview as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(preview);
    expect(await screen.findByText('Pay adjustments unavailable')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Generuoti S.F.' })).toBeNull();
  });
  it.each([0, 1])('shows the correct company %i earnings with mixed lessons and different customer prices', async company => {
    state.company = company;
    render(<OrgTutorFinanceSummary />);
    expect(await screen.findByText(`€${qaExpected[company].total.toFixed(2)}`)).toBeTruthy();
    expect(screen.queryByText(`€${qaExpected[1 - company].total.toFixed(2)}`)).toBeNull();
    if (company === 0) expect(within(screen.getByRole('region', { name: 'Atlygio suvestinė' })).getByText('€-10.00')).toBeTruthy();
  });
  it.each([0, 1])('previews company %i invoice at the same total as earnings, including adjustments and historical rates', async company => {
    state.company = company;
    render(<CreateInvoiceModal isOpen isOrgTutor onClose={() => {}} />);
    const dates = document.querySelectorAll<HTMLInputElement>('input[type=date]');
    fireEvent.change(dates[0], { target: { value: '2026-10-01' } });
    fireEvent.change(dates[1], { target: { value: '2026-10-31' } });
    const preview = screen.getByRole('button', { name: 'Peržiūrėti pamokas' });
    await waitFor(() => expect((preview as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(preview);
    const dialog = within(screen.getByRole('dialog'));
    await waitFor(() => expect(dialog.getByText(new RegExp(`: €${qaExpected[company].total.toFixed(2)}`))).toBeTruthy());
    expect(dialog.getByText(qaOrganizations[company].name)).toBeTruthy();
    expect(dialog.queryByText(qaOrganizations[1 - company].name)).toBeNull();
  });
});
