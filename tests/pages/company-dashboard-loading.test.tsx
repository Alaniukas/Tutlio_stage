import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import CompanyDashboard from '@/pages/company/CompanyDashboard';
import { getCached, invalidateCache, setCache } from '@/lib/dataCache';
import { rowQuery, type RowQueryLog } from '../fixtures/rowQuery';

const state = vi.hoisted(() => ({
  metricsGate: null as Promise<void> | null, paymentGate: null as Promise<void> | null,
  attentionGate: null as Promise<void> | null, failMetrics: false, failPayments: false,
  logs: [] as RowQueryLog[], selects: [] as string[],
}));
const orgId = 'b0a00000-7e57-4000-8000-000000000001';
const organization = { name: 'Loading QA', entity_type: 'company', tutor_license_count: 5,
  features: { trial_followup_alert: true }, enable_per_lesson: false, enable_monthly_billing: false };

vi.mock('@/contexts/OrgAdminAccessContext', () => ({ useOrgAdminAccess: () => ({
  membership: { organizationId: 'b0a00000-7e57-4000-8000-000000000001', organization: {
    name: 'Loading QA', entity_type: 'company', tutor_license_count: 5,
    features: { trial_followup_alert: true }, enable_per_lesson: false, enable_monthly_billing: false,
  } }, can: () => true,
}) }));
vi.mock('@/contexts/OrgEntityContext', () => ({ useOrgEntityType: () => 'company' }));
vi.mock('@/hooks/useMarketMoney', () => ({ useMarketMoney: () => ({ fmt: (value: number) => `€${value.toFixed(2)}` }) }));
vi.mock('@/hooks/useStudentRegistrationStatus', () => ({ useStudentRegistrationStatus: () => ({ enabled: false }) }));
vi.mock('@/hooks/useDismissibleDashboardItemIds', () => ({ useDismissibleDashboardItemIds: () => ({
  dismissedIds: new Set(), dismiss: vi.fn(), restoreAll: vi.fn(), ready: true,
}) }));
vi.mock('@/components/MarkStudentNoShowDialog', () => ({ default: () => null }));
vi.mock('@/lib/apiHelpers', () => ({ authHeaders: async () => ({}) }));
vi.mock('@/lib/orgVisibleTutors', () => ({ getOrgVisibleTutorsDeduped: async () => [
  { id: 'tutor', full_name: 'QA Tutor', has_active_license: true, payment_timing: 'before_lesson', payment_deadline_hours: 24 },
] }));
vi.mock('@/lib/supabase', () => ({ supabase: {
  from: (table: string) => {
    const query = rowQuery(table, () => {
      const now = Date.now();
      if (table === 'students') return [{ id: 'student', full_name: 'Upcoming Child', payment_model: 'prepaid' }];
      if (table === 'sessions') return [
        { id: 'paid', tutor_id: 'tutor', student_id: 'student', subject_id: 'math',
          start_time: new Date(now - 3600000).toISOString(), end_time: new Date(now - 1800000).toISOString(),
          price: 553, paid: true, status: 'completed', is_complimentary: false, topic: 'Completed lesson' },
        { id: 'upcoming', tutor_id: 'tutor', student_id: 'student', subject_id: 'math',
          start_time: new Date(now + 86400000).toISOString(), end_time: new Date(now + 90000000).toISOString(),
          price: 25, paid: false, status: 'active', is_complimentary: false, topic: 'Upcoming lesson' },
      ];
      if (table === 'subjects') return [{ id: 'math', name: 'Math', is_trial: false }];
      return [];
    }, state.logs);
    let select = '';
    const originalSelect = query.select;
    query.select = (columns: string, options: any) => {
      select = columns; state.selects.push(`${table}:${columns}`); return originalSelect(columns, options);
    };
    const originalThen = query.then;
    query.then = async (resolve: any, reject: any) => {
      if (table === 'sessions' && select.includes('exclude_from_lesson_count')) {
        await state.metricsGate;
        if (state.failMetrics) return resolve({ data: null, error: { message: 'HTTP 500' } });
      }
      if (table === 'lesson_packages') {
        await state.paymentGate;
        if (state.failPayments) return resolve({ data: null, error: { message: 'HTTP 522' } });
      }
      return originalThen(resolve, reject);
    };
    return query;
  },
} }));

function defer() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}
function cachedSnapshot() {
  return { complete: true, organizationId: orgId, orgIdForDismiss: orgId, orgName: organization.name,
    entityType: 'company', financeTotalsAccess: true, tutorLicenseCap: 5, licensedTutors: 1, activeTutors: 1,
    pendingInvites: 0, sessionsThisMonth: 1, upcomingSessions: 1, earningsThisMonth: 553, earningsTotal: 553,
    upcomingList: [], cancelledList: [], attentionList: [], overduePackages: [], recentPayments: [], tutorPayEntries: [] };
}
async function openPage() {
  await act(async () => { render(<MemoryRouter><CompanyDashboard /></MemoryRouter>); });
}
beforeEach(() => {
  invalidateCache(); state.logs = []; state.selects = [];
  state.metricsGate = state.paymentGate = state.attentionGate = null;
  state.failMetrics = state.failPayments = false;
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    await state.attentionGate;
    return { ok: true, json: async () => url.includes('trial-followup') ? { studentIds: [] } : { packages: [] } };
  }));
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => { vi.useRealTimers(); invalidateCache(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('company dashboard loading', () => {
  it('never renders preloaded zeroes or empty lists as a complete dashboard', async () => {
    const gate = defer(); state.metricsGate = gate.promise;
    setCache('company_dashboard', { organizationId: orgId, orgName: 'Loading QA', complete: false,
      earningsTotal: 0, upcomingList: [], attentionList: [], recentPayments: [] });
    await openPage();
    expect(screen.queryByRole('heading', { name: 'Sveiki, Loading QA' })).toBeNull();
    expect(screen.queryByText('€0.00')).toBeNull();
    expect(screen.getByRole('status')).toBeTruthy();
    await act(async () => gate.resolve());
    expect(await screen.findByRole('heading', { name: 'Sveiki, Loading QA' })).toBeTruthy();
    expect(screen.getAllByText('€553.00').length).toBeGreaterThan(0);
    expect(within(screen.getByRole('region', { name: 'Artimiausios pamokos' })).getByText('Upcoming Child')).toBeTruthy();
  });

  it('renders the overview while optional sections are slow, with honest section loading states', async () => {
    const payments = defer(), attention = defer();
    state.paymentGate = payments.promise; state.attentionGate = attention.promise;
    await openPage();
    expect(await screen.findByRole('heading', { name: 'Sveiki, Loading QA' })).toBeTruthy();
    expect(screen.getAllByText('€553.00').length).toBeGreaterThan(0);
    expect(within(screen.getByRole('region', { name: 'Naujausi mokėjimai' })).getByRole('status')).toBeTruthy();
    expect(within(screen.getByRole('region', { name: 'Reikia dėmesio' })).getByRole('status')).toBeTruthy();
    expect(getCached('company_dashboard')).toBeNull();
    await act(async () => { payments.resolve(); attention.resolve(); });
    await waitFor(() => expect(getCached<any>('company_dashboard')?.complete).toBe(true));
    expect(state.logs.some(log => log.table === 'organizations' || log.table === 'organization_admins' || log.table === 'school_payment_installments')).toBe(false);
    expect(state.selects.some(select => select.includes('('))).toBe(false);
  });

  it('preserves the last complete snapshot after a failed refresh', async () => {
    const previous = cachedSnapshot(); setCache('company_dashboard', previous); state.failMetrics = true;
    await openPage();
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getAllByText('€553.00').length).toBeGreaterThan(0);
    expect(getCached('company_dashboard')).toBe(previous);
  });

  it('shows a retry instead of publishing zeroes after a required read fails', async () => {
    state.failMetrics = true; await openPage();
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.queryByText('€0.00')).toBeNull();
    state.failMetrics = false;
    fireEvent.click(screen.getByRole('button', { name: 'Bandyti iš naujo' }));
    expect(await screen.findByRole('heading', { name: 'Sveiki, Loading QA' })).toBeTruthy();
  });

  it('does not label a failed payment section as empty or cache a partial result', async () => {
    state.failPayments = true; await openPage();
    const payments = await screen.findByRole('region', { name: 'Naujausi mokėjimai' });
    expect(await within(payments).findByRole('alert')).toBeTruthy();
    expect(within(payments).queryByText('Mokėjimų nėra')).toBeNull();
    expect(getCached('company_dashboard')).toBeNull();
  });

  it('ends a hung required read at 15 seconds and ignores its late result', async () => {
    vi.useFakeTimers(); const gate = defer(); state.metricsGate = gate.promise;
    await openPage();
    await act(async () => { await vi.advanceTimersByTimeAsync(15000); });
    expect(screen.getByRole('alert')).toBeTruthy();
    await act(async () => gate.resolve());
    expect(screen.queryByRole('heading', { name: 'Sveiki, Loading QA' })).toBeNull();
    expect(getCached('company_dashboard')).toBeNull();
  });

  it('ends hung optional sections without hiding the loaded overview', async () => {
    vi.useFakeTimers(); const gate = defer();
    state.paymentGate = state.attentionGate = gate.promise;
    await openPage();
    expect(screen.getByRole('heading', { name: 'Sveiki, Loading QA' })).toBeTruthy();
    await act(async () => { await vi.advanceTimersByTimeAsync(15000); });
    expect(screen.getAllByText('€553.00').length).toBeGreaterThan(0);
    expect(within(screen.getByRole('region', { name: 'Naujausi mokėjimai' })).getByRole('alert')).toBeTruthy();
    expect(within(screen.getByRole('region', { name: 'Reikia dėmesio' })).getByRole('alert')).toBeTruthy();
    expect(screen.queryByRole('status')).toBeNull();
    await act(async () => gate.resolve());
    expect(getCached('company_dashboard')).toBeNull();
  });

  it('does not use a complete snapshot from another organization', async () => {
    const gate = defer(); state.metricsGate = gate.promise;
    setCache('company_dashboard', { ...cachedSnapshot(), organizationId: 'other-org', orgName: 'Other Organization' });
    await openPage();
    expect(screen.queryByText(/Other Organization/)).toBeNull();
    expect(screen.queryByText('€553.00')).toBeNull();
    await act(async () => gate.resolve());
  });
});
