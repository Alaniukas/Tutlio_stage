import type { InputHTMLAttributes } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  entityType: 'school' as 'school' | 'company' | null,
  orgError: false,
  organizationId: 'school',
  manualConfirmation: false,
  rate: 0 as number | null,
  rows: [] as any[],
  attendanceRows: [] as any[],
  attendanceError: false,
  attendanceRequests: [] as string[],
  invoices: [] as any[],
  pageCap: 2,
  queries: [] as Array<{ table: string; select: string; filters: Array<[string, string, unknown]>; range?: [number, number] }>,
  from: vi.fn(),
  precheck: { ok: true, code: undefined as string | undefined },
  posts: [] as any[],
}));

const translate = (key: string, params?: Record<string, unknown>) => `${key}${params ? `:${Object.values(params).join(',')}` : ''}`;
vi.mock('@/lib/i18n', () => ({ useTranslation: () => ({ t: translate, dateFnsLocale: undefined }) }));
vi.mock('@/contexts/UserContext', () => ({ useUser: () => ({ profile: { organization_id: state.organizationId } }) }));
vi.mock('@/hooks/useOrgFeatures', () => ({ useOrgFeatures: () => ({
  hasFeature: (key: string) => key === 'tutor_lesson_status_confirmation' && state.manualConfirmation,
  organizationId: state.organizationId, entityType: state.entityType, loading: false, error: state.orgError,
}) }));
vi.mock('@/hooks/useOrgTutorPolicy', () => ({ useOrgTutorPolicy: () => ({
  payPerLessonEur: state.rate, loading: false, invoiceIssuerMode: 'both',
}) }));
vi.mock('@/lib/preload', () => ({ dedupeAuthGetUser: async () => ({ id: 'teacher' }) }));
vi.mock('@/lib/apiHelpers', () => ({ authHeaders: async () => ({ 'Content-Type': 'application/json' }) }));
vi.mock('@/lib/fetchOrgTutorInvoicesDeduped', () => ({ fetchOrgTutorInvoicesDeduped: async () => ({
  ok: true, data: { invoices: state.invoices, periodInvoices: state.invoices },
}) }));
vi.mock('@/lib/supabase', () => ({ supabase: {
  from: (...args: unknown[]) => state.from(...args),
  auth: { getUser: async () => ({ data: { user: { id: 'teacher' } } }) },
} }));
vi.mock('@/components/InvoiceSettingsForm', () => ({ default: () => null }));
vi.mock('@/components/ui/date-input', () => ({ DateInput: (props: InputHTMLAttributes<HTMLInputElement>) => <input {...props} type="date" /> }));
vi.mock('@/components/ui/month-input', () => ({ MonthInput: (props: InputHTMLAttributes<HTMLInputElement>) => <input {...props} type="month" /> }));

import OrgTutorFinanceSummary from '@/components/OrgTutorFinanceSummary';
import CreateInvoiceModal from '@/components/CreateInvoiceModal';

function query(table: string) {
  const request = { table, select: '', filters: [] as Array<[string, string, unknown]>, range: undefined as [number, number] | undefined };
  state.queries.push(request);
  const q = {
    select(value: string) { request.select = value; return q; },
    eq(column: string, value: unknown) { request.filters.push(['eq', column, value]); return q; },
    in(column: string, value: unknown) { request.filters.push(['in', column, value]); return q; },
    gte(column: string, value: unknown) { request.filters.push(['gte', column, value]); return q; },
    lte(column: string, value: unknown) { request.filters.push(['lte', column, value]); return q; },
    order() { return q; },
    range(from: number, to: number) { request.range = [from, to]; return q; },
    maybeSingle: async () => ({ data: table === 'profiles' ? {
      organization_id: state.organizationId, full_name: 'Teacher', company_commission_percent: state.rate,
      company_commission_by_subject: {},
    } : { name: 'School' }, error: null }),
    then(resolve: (value: unknown) => unknown) {
      let data = table === 'sessions' ? state.rows : [];
      for (const [kind, column, value] of request.filters) {
        if (kind === 'eq') data = data.filter(row =>
          (column === 'students.organization_id' ? row.students?.organization_id ?? state.organizationId : row[column]) === value);
        if (kind === 'in') data = data.filter(row => (value as unknown[]).includes(row[column]));
      }
      if (request.range) data = data.slice(request.range[0], Math.min(request.range[1] + 1, request.range[0] + state.pageCap));
      return Promise.resolve({ data, error: null }).then(resolve);
    },
  };
  return q;
}

function groupRows(pay: number | null = 45, group = 'group', day = '15') {
  return Array.from({ length: 6 }, (_, index) => ({
    id: `${group}-${index}`, tutor_id: 'teacher', student_id: `child-${index}`, class_group_id: group,
    subject_id: 'subject', subjects: { name: 'Lithuanian', is_group: true },
    class_group: { name: 'Grade 5 group', calendar_name: '5kl. A' },
    students: { full_name: `Child ${index}` }, status: index === 5 ? 'no_show' : 'completed',
    no_show_reason: index === 5 ? 'student_absent' : null, status_confirmed_at: '2026-09-15T11:00:00Z',
    start_time: `2026-09-${day}T09:00:00Z`, end_time: `2026-09-${day}T10:00:00Z`,
    tutor_pay_eur_snapshot: pay, price: 2.63,
  }));
}

function reportedSeptemberRows() {
  return Array.from({ length: 28 }, (_, occurrence) => {
    const day = String(occurrence + 1).padStart(2, '0');
    return groupRows(45, 'month-group-' + (occurrence % 4), day)
      .slice(0, occurrence === 0 ? 6 : 5)
      .map((row, child) => ({
        ...row,
        id: 'september-' + occurrence + '-' + child,
        status: occurrence < 15 && child === 0 ? 'no_show' : 'completed',
        no_show_reason: occurrence < 15 && child === 0 ? 'student_absent' : null,
        status_confirmed_at: '2026-09-' + day + 'T10:01:00Z',
      }));
  }).flat();
}

async function preview() {
  render(<CreateInvoiceModal isOpen isOrgTutor onClose={() => {}} />);
  const dates = document.querySelectorAll<HTMLInputElement>('input[type=date]');
  fireEvent.change(dates[0], { target: { value: '2026-09-01' } });
  fireEvent.change(dates[1], { target: { value: '2026-09-30' } });
  const button = await screen.findByRole('button', { name: 'invoiceCreate.preview' });
  await waitFor(() => expect((button as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(button);
}

beforeEach(() => {
  state.entityType = 'school'; state.orgError = false; state.rate = 0; state.organizationId = 'school'; state.manualConfirmation = false;
  state.rows = groupRows(); state.queries = []; state.posts = [];
  state.attendanceRows = []; state.attendanceError = false; state.attendanceRequests = [];
  state.invoices = [];
  state.pageCap = 2; state.precheck = { ok: true, code: undefined };
  state.from.mockReset(); state.from.mockImplementation(query);
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.stubGlobal('alert', vi.fn());
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (url.startsWith('/api/school-tutor-attendance-pay?')) {
      state.attendanceRequests.push(url);
      return { ok: !state.attendanceError, json: async () => ({ ok: !state.attendanceError, rows: state.attendanceRows }) };
    }
    if (url.startsWith('/api/invoice-settings')) return { ok: true, json: async () => ({ data: {
      entity_type: 'individuali_veikla', activity_number: 'TEST', contact_email: 'teacher@example.invalid',
    } }) };
    if (url === '/api/generate-invoice') {
      const body = JSON.parse(String(init?.body)); state.posts.push(body);
      return body.precheckOnly
        ? { ok: state.precheck.ok, json: async () => ({ code: state.precheck.code, error: 'Server pay review' }) }
        : { ok: true, json: async () => ({ count: 1 }) };
    }
    throw new Error(`Unexpected endpoint ${url}`);
  }));
});

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('school teacher Finance', () => {
  it('shows only own remuneration even if an old API returns automatic and related customer invoices', async () => {
    state.entityType = 'company'; state.rate = 20; state.rows = [];
    state.invoices = [
      { id: 'client', invoice_number: 'SF-001', issued_by_user_id: 'teacher', buyer_snapshot: { name: 'Ruste' },
        total_amount: 10.40, status: 'paid', issue_date: '2026-08-26', pdf_meta: null },
      { id: 'own', invoice_number: 'MY-PAY', issued_by_user_id: 'admin', buyer_snapshot: { name: 'Organization' },
        total_amount: 100, status: 'issued', issue_date: '2026-08-26', pdf_meta: { invoiceKind: 'tutor_pay', tutorId: 'teacher' } },
      { id: 'other', invoice_number: 'OTHER-PAY', issued_by_user_id: 'admin', buyer_snapshot: { name: 'Organization' },
        total_amount: 200, status: 'paid', issue_date: '2026-08-26', pdf_meta: { invoiceKind: 'tutor_pay', tutorId: 'another' } },
    ];
    render(<OrgTutorFinanceSummary />);
    expect(await screen.findByText('MY-PAY')).toBeTruthy();
    expect(screen.queryByText('SF-001')).toBeNull();
    expect(screen.queryByText('OTHER-PAY')).toBeNull();
    expect(document.body.textContent).not.toContain('Ruste');
    expect(document.body.textContent).not.toContain('10.40');
  });
  it('includes a completed attendance-only meeting once at its stored historical rate', async () => {
    state.rows = [];
    state.rate = 90;
    state.manualConfirmation = true;
    state.attendanceRows = groupRows().map(row => ({ ...row, source_kind: 'attendance', status: 'completed', students: undefined }));
    render(<OrgTutorFinanceSummary />);
    const label = await screen.findByText(/^orgFinance.schoolFinalizedLessons/);
    expect(label.nextElementSibling?.textContent).toBe('1');
    expect(screen.getByText('€45.00')).toBeTruthy();
    expect(screen.queryByText('€270.00')).toBeNull();
    expect(state.attendanceRequests.every(url => new URL(url, 'https://local.test').searchParams.get('tutorId') === 'teacher')).toBe(true);
  });

  it('keeps historical attendance pay visible when the current school base rate is unset', async () => {
    state.rows = [];
    state.rate = null;
    state.attendanceRows = [{ ...groupRows()[0], id: 'historical-attendance', source_kind: 'attendance', students: undefined }];
    render(<OrgTutorFinanceSummary />);
    const label = await screen.findByText(/^orgFinance.schoolFinalizedLessons/);
    expect(label.nextElementSibling?.textContent).toBe('1');
    expect(screen.getByText('€45.00')).toBeTruthy();
    expect(screen.getByText('orgFinance.schoolPayPending')).toBeTruthy();
    expect(screen.queryByText('€0.00')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('shows pending school pay rather than zero when both current and historical rates are unknown', async () => {
    state.rate = null;
    state.rows = groupRows(null);
    render(<OrgTutorFinanceSummary />);
    const label = await screen.findByText(/^orgFinance.schoolFinalizedLessons/);
    expect(label.nextElementSibling?.textContent).toBe('1');
    expect(screen.getAllByText('orgFinance.schoolPayPending')).toHaveLength(2);
    expect(screen.getByRole('alert').textContent).toContain('orgFinance.schoolUnresolvedPay:1');
    expect(screen.queryByText('€0.00')).toBeNull();
  });

  it('still reports a company pay policy error when the current rate is unavailable', async () => {
    state.entityType = 'company';
    state.rate = null;
    render(<OrgTutorFinanceSummary />);
    expect((await screen.findByRole('alert')).textContent).toBe('common.error');
    expect(state.queries.filter(row => row.table === 'sessions')).toEqual([]);
    expect(state.attendanceRequests).toEqual([]);
  });

  it('keeps organization load failures visible even when school attendance has a known rate', async () => {
    state.orgError = true;
    state.rate = null;
    state.attendanceRows = [{ ...groupRows()[0], id: 'historical-attendance', source_kind: 'attendance', students: undefined }];
    render(<OrgTutorFinanceSummary />);
    expect((await screen.findByRole('alert')).textContent).toBe('common.error');
    expect(screen.queryByText('€45.00')).toBeNull();
    expect(state.attendanceRequests).toEqual([]);
  });

  it('fails closed if standalone attendance pay cannot be loaded', async () => {
    state.attendanceError = true;
    render(<OrgTutorFinanceSummary />);
    expect(await screen.findByText('common.error')).toBeTruthy();
    expect(screen.queryByText('€45.00')).toBeNull();
  });

  it('preserves already earned attendance-only pay after a same-child active session is materialized', async () => {
    state.manualConfirmation = true;
    state.rate = 90;
    state.rows = [];
    state.attendanceRows = [{ ...groupRows()[0], id: 'earlier-attendance', source_kind: 'attendance', status: 'completed', students: undefined }];
    render(<OrgTutorFinanceSummary />);
    let label = await screen.findByText(/^orgFinance.schoolFinalizedLessons/);
    expect(label.nextElementSibling?.textContent).toBe('1');
    expect(screen.getByText('€45.00')).toBeTruthy();
    cleanup();

    state.rows = [{ ...groupRows()[0], id: 'later-materialized', status: 'active', status_confirmed_at: null, tutor_pay_eur_snapshot: 90 }];
    render(<OrgTutorFinanceSummary />);
    label = await screen.findByText(/^orgFinance.schoolFinalizedLessons/);
    expect(label.nextElementSibling?.textContent).toBe('1');
    expect(screen.getByText('€45.00')).toBeTruthy();
  });

  it('excludes a teacher previous-school sessions from the current-school pay summary', async () => {
    state.rows = [
      ...groupRows(90, 'old-school').map(row => ({ ...row, students: { ...row.students, organization_id: 'old-school' } })),
      ...groupRows(30, 'current-school').map(row => ({ ...row, students: { ...row.students, organization_id: state.organizationId } })),
    ];
    render(<OrgTutorFinanceSummary />);
    const label = await screen.findByText(/^orgFinance.schoolFinalizedLessons/);
    expect(label.nextElementSibling?.textContent).toBe('1');
    expect(screen.getByText('€30.00')).toBeTruthy();
    expect(screen.queryByText('€120.00')).toBeNull();
    expect(state.queries.filter(row => row.table === 'sessions').every(row => row.select.includes('students!inner(organization_id)'))).toBe(true);
  });

  it.each([
    { name: 'Laisvi vaikai', organizationId: '2dd745fc-20e7-4bc1-a5cd-a89cfe22ec17', feature: false },
    { name: 'a school using the confirmation feature', organizationId: 'school', feature: true },
  ])('counts stored completed $name meetings even without a confirmation stamp', async ({ organizationId, feature }) => {
    state.organizationId = organizationId;
    state.manualConfirmation = feature;
    state.rate = 45;
    state.rows.forEach((row) => { row.status_confirmed_at = null; row.tutor_pay_eur_snapshot = 45; });
    render(<OrgTutorFinanceSummary />);
    const label = await screen.findByText(/^orgFinance.schoolFinalizedLessons/);
    expect(label.nextElementSibling?.textContent).toBe('1');
    expect(screen.getByText('€45.00')).toBeTruthy();
  });
  it('matches the reported 28 meetings and €1260 instead of 126 attended children and €5670', async () => {
    state.rate = 45;
    state.pageCap = 17;
    state.rows = reportedSeptemberRows();
    expect(state.rows.filter(row => row.status === 'completed')).toHaveLength(126);
    expect(state.rows.filter(row => row.status === 'no_show')).toHaveLength(15);

    render(<OrgTutorFinanceSummary />);
    fireEvent.change(document.querySelector<HTMLInputElement>('input[type=month]')!, { target: { value: '2026-09' } });
    const label = await screen.findByText(/^orgFinance.schoolFinalizedLessons/);
    expect(label.nextElementSibling?.textContent).toBe('28');
    expect(screen.getByText('€1260.00')).toBeTruthy();
    expect(screen.queryByText('€5670.00')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('counts and pays one meeting across paginated child rows using its historical rate', async () => {
    render(<OrgTutorFinanceSummary />);
    const month = document.querySelector<HTMLInputElement>('input[type=month]')!;
    fireEvent.change(month, { target: { value: '2026-09' } });
    const label = await screen.findByText(/^orgFinance.schoolFinalizedLessons/);
    expect(label.nextElementSibling?.textContent).toBe('1');
    expect(screen.getByText('€45.00')).toBeTruthy();
    expect(screen.getByText('orgFinance.schoolCurrentPayRate:0.00')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
    const queries = state.queries.filter(row => row.table === 'sessions');
    expect(queries.map(row => row.range?.[0])).toContain(6);
    expect(queries.some(row => row.filters.some(filter => filter[0] === 'gte' && filter[1] === 'start_time' && new Date(String(filter[2])).toISOString() === '2026-08-31T21:00:00.000Z'))).toBe(true);
    expect(queries.every(row => row.select.includes('no_show_reason'))).toBe(true);
  });

  it('labels a partial known total and displays the unresolved meeting count', async () => {
    state.rows = [...groupRows(), ...groupRows(null, 'missing', '16')];
    render(<OrgTutorFinanceSummary />);
    const label = await screen.findByText(/^orgFinance.schoolFinalizedLessons/);
    expect(label.nextElementSibling?.textContent).toBe('2');
    expect(screen.getByText('€45.00')).toBeTruthy();
    expect(screen.getByText('orgFinance.schoolKnownPayTotal')).toBeTruthy();
    expect((await screen.findByRole('alert')).textContent).toContain('orgFinance.schoolUnresolvedPay:1');
  });

  it('shows unknown compensation as pending while keeping the meeting count', async () => {
    state.rows = groupRows(null);
    render(<OrgTutorFinanceSummary />);
    const label = await screen.findByText(/^orgFinance.schoolFinalizedLessons/);
    expect(label.nextElementSibling?.textContent).toBe('1');
    expect(screen.getByText('orgFinance.schoolPayPending')).toBeTruthy();
    expect(screen.queryByText('€0.00')).toBeNull();
  });

  it('does not fall back to per-child counting when organization type fails to load', async () => {
    state.entityType = null; state.orgError = true;
    render(<OrgTutorFinanceSummary />);
    expect((await screen.findByRole('alert')).textContent).toBe('common.error');
    expect(state.queries.filter(row => row.table === 'sessions')).toEqual([]);
    expect(screen.queryByText(/^orgFinance.schoolFinalizedLessons/)).toBeNull();
  });

  it('keeps a group with manual no-show and active children pending until a final meeting outcome', async () => {
    state.rate = 45;
    state.rows = groupRows().map((row, index) => ({ ...row, status: index === 0 ? 'no_show' : 'active' }));
    render(<OrgTutorFinanceSummary />);
    const label = await screen.findByText(/^orgFinance.schoolFinalizedLessons/);
    expect(label.nextElementSibling?.textContent).toBe('0');
    expect(screen.getByText('€0.00')).toBeTruthy();
    expect(state.queries.filter(row => row.table === 'sessions').every(row => !row.filters.some(filter => filter[1] === 'status'))).toBe(true);
  });
});

describe('school teacher invoice preview', () => {
  it('generates one attendance-only meeting with separate attendance IDs and no synthetic session ID', async () => {
    state.rows = [];
    state.rate = 90;
    state.attendanceRows = groupRows().map(row => ({ ...row, source_kind: 'attendance', status: 'completed', students: undefined }));
    await preview();
    expect(await screen.findByText(/invoiceCreate.sessionsCount:1 \| common.total: €45.00/)).toBeTruthy();
    expect(screen.getByText('5kl. A')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'invoiceCreate.generate' }));
    await waitFor(() => expect(state.posts.filter(row => !row.precheckOnly)).toHaveLength(1));
    const request = state.posts.find(row => !row.precheckOnly);
    expect(request.attendanceIds).toEqual(state.attendanceRows.map(row => row.id));
    expect(request.sessionIds).toBeUndefined();
    expect(state.attendanceRequests).toContain('/api/school-tutor-attendance-pay?tutorId=teacher&periodStart=2026-09-01&periodEnd=2026-09-30');
  });

  it('counts a standalone attended child with pending/cancelled real siblings once and sends both source types', async () => {
    state.manualConfirmation = true;
    state.rows = groupRows().slice(0, 2).map((row, index) => ({ ...row, status: index ? 'cancelled' : 'active', status_confirmed_at: null, tutor_pay_eur_snapshot: 90 }));
    state.attendanceRows = [{ ...groupRows()[2], id: 'standalone-fact', source_kind: 'attendance', status: 'completed', students: undefined }];
    await preview();
    expect(await screen.findByText(/invoiceCreate.sessionsCount:1 \| common.total: €45.00/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'invoiceCreate.generate' }));
    await waitFor(() => expect(state.posts.filter(row => !row.precheckOnly)).toHaveLength(1));
    expect(state.posts.find(row => !row.precheckOnly)).toMatchObject({
      sessionIds: state.rows.map(row => row.id), attendanceIds: ['standalone-fact'],
    });
  });

  it('does not show an incomplete payable preview if the attendance endpoint fails', async () => {
    state.attendanceError = true;
    await preview();
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'invoiceCreate.generate' })).toBeNull();
  });

  it('retains the earlier attendance source beside a later pending session in the generated invoice request', async () => {
    state.manualConfirmation = true;
    state.rate = 90;
    state.rows = [{ ...groupRows()[0], id: 'later-materialized', status: 'active', status_confirmed_at: null, tutor_pay_eur_snapshot: 90 }];
    state.attendanceRows = [{ ...groupRows()[0], id: 'earlier-attendance', source_kind: 'attendance', status: 'completed', students: undefined }];
    await preview();
    expect(await screen.findByText(/invoiceCreate.sessionsCount:1 \| common.total: €45.00/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'invoiceCreate.generate' }));
    await waitFor(() => expect(state.posts.filter(row => !row.precheckOnly)).toHaveLength(1));
    expect(state.posts.find(row => !row.precheckOnly)).toMatchObject({
      sessionIds: ['later-materialized'], attendanceIds: ['earlier-attendance'],
    });
  });

  it('blocks a later confirmed €90 session from silently replacing an earlier €45 attendance rate', async () => {
    state.manualConfirmation = true;
    state.rate = 90;
    state.rows = [{ ...groupRows()[0], id: 'confirmed-later', tutor_pay_eur_snapshot: 90 }];
    state.attendanceRows = [{ ...groupRows()[0], id: 'earlier-attendance', source_kind: 'attendance', status: 'completed', pay_evidence_only: true, students: undefined }];
    await preview();
    expect(await screen.findByText(/invoiceCreate.sessionsCount:1 \| orgFinance.schoolKnownPayTotal: orgFinance.schoolPayPending/)).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toContain('orgFinance.schoolUnresolvedPay:1');
    const generate = screen.getByRole('button', { name: 'invoiceCreate.generate' });
    expect((generate as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(generate);
    expect(state.posts.filter(row => !row.precheckOnly)).toHaveLength(0);
  });

  it('does not invoice a teacher previous-school real sessions to the current school', async () => {
    const current = groupRows(30, 'current-school').map(row => ({ ...row, students: { ...row.students, organization_id: state.organizationId } }));
    state.rows = [
      ...groupRows(90, 'old-school').map(row => ({ ...row, students: { ...row.students, organization_id: 'old-school' } })),
      ...current,
    ];
    await preview();
    expect(await screen.findByText(/invoiceCreate.sessionsCount:1 \| common.total: €30.00/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'invoiceCreate.generate' }));
    await waitFor(() => expect(state.posts.filter(row => !row.precheckOnly)).toHaveLength(1));
    expect(state.posts.find(row => !row.precheckOnly).sessionIds).toEqual(current.map(row => row.id));
  });

  it('invoices stored completed meetings without a confirmation stamp', async () => {
    state.manualConfirmation = true;
    state.rate = 45;
    state.rows.forEach((row) => { row.status_confirmed_at = null; row.tutor_pay_eur_snapshot = 45; });
    await preview();
    expect(await screen.findByText(/invoiceCreate.sessionsCount:1 \| common.total: €45.00/)).toBeTruthy();
    expect(screen.queryByText('€90.00')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'invoiceCreate.generate' }));
    await waitFor(() => expect(state.posts.filter(row => !row.precheckOnly)).toHaveLength(1));
    expect(state.posts.find(row => !row.precheckOnly).sessionIds).toEqual(state.rows.map(row => row.id));
  });

  it('matches the same September amount and retains all 141 attendance rows when issuing', async () => {
    state.rate = 45;
    state.pageCap = 17;
    state.rows = reportedSeptemberRows();
    await preview();
    expect(await screen.findByText(/invoiceCreate.sessionsCount:28 \| common.total: €1260.00/)).toBeTruthy();
    expect(screen.queryByText('€5670.00')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'invoiceCreate.generate' }));
    await waitFor(() => expect(state.posts.filter(row => !row.precheckOnly)).toHaveLength(1));
    const issuedIds = state.posts.find(row => !row.precheckOnly).sessionIds;
    expect(issuedIds).toHaveLength(141);
    expect(new Set(issuedIds)).toEqual(new Set(state.rows.map(row => row.id)));
  });

  it('renders one payable group meeting and sends every child source ID when generating', async () => {
    state.rows[4].status = 'active';
    await preview();
    expect(await screen.findByText(/invoiceCreate.sessionsCount:1 \| common.total: €45.00/)).toBeTruthy();
    expect(screen.getByText('5kl. A')).toBeTruthy();
    expect(screen.queryByText('Child 0')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'invoiceCreate.generate' }));
    await waitFor(() => expect(state.posts.filter(row => !row.precheckOnly)).toHaveLength(1));
    expect(state.posts.find(row => !row.precheckOnly).sessionIds).toEqual(state.rows.map(row => row.id));
    const queries = state.queries.filter(row => row.table === 'sessions');
    expect(queries.map(row => row.range?.[0])).toEqual([0, 2, 4, 6]);
    expect(new Date(String(queries[0].filters.find(filter => filter[0] === 'gte' && filter[1] === 'start_time')?.[2])).toISOString()).toBe('2026-08-31T21:00:00.000Z');
    expect(new Date(String(queries[0].filters.find(filter => filter[0] === 'lte' && filter[1] === 'start_time')?.[2])).toISOString()).toBe('2026-09-30T20:59:59.999Z');
  });

  it('does not offer an invoice for a no-show child while its sibling outcomes remain active', async () => {
    state.rate = 45;
    state.rows = groupRows().map((row, index) => ({ ...row, status: index === 0 ? 'no_show' : 'active' }));
    await preview();
    expect(await screen.findByText('invoiceCreate.noSessions')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'invoiceCreate.generate' })).toBeNull();
    expect(state.posts.filter(row => !row.precheckOnly)).toHaveLength(0);
  });

  it('still renders a grouped partial preview when server precheck rejects missing rates and blocks issuance', async () => {
    state.rows = [...groupRows(), ...groupRows(null, 'missing', '16')];
    state.precheck = { ok: false, code: 'SCHOOL_TUTOR_PAY_UNRESOLVED' };
    await preview();
    expect(await screen.findByText(/invoiceCreate.sessionsCount:2 \| orgFinance.schoolKnownPayTotal: €45.00/)).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toContain('orgFinance.schoolUnresolvedPay:1');
    expect(screen.getByText('orgFinance.schoolPayPending')).toBeTruthy();
    const generate = screen.getByRole('button', { name: 'invoiceCreate.generate' });
    expect((generate as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(generate);
    expect(state.posts.filter(row => !row.precheckOnly)).toHaveLength(0);
  });

  it('preserves company per-child invoices and explicit zero snapshots', async () => {
    state.entityType = 'company'; state.rows = groupRows(0); state.rate = 45;
    await preview();
    expect(await screen.findByText(/invoiceCreate.sessionsCount:6 \| common.total: €0.00/)).toBeTruthy();
    expect(screen.getByText('Child 0')).toBeTruthy();
    expect(screen.queryByText('orgFinance.schoolPayPending')).toBeNull();
    expect((screen.getByRole('button', { name: 'invoiceCreate.generate' }) as HTMLButtonElement).disabled).toBe(false);
  });
});
