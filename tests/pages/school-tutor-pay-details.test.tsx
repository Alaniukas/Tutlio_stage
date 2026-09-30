import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import CompanyTutors from '../../src/pages/company/CompanyTutors';

const state = vi.hoisted(() => ({
  sessions: [] as any[],
  attendanceRows: [] as any[],
  attendanceError: false,
  manualConfirmation: false,
  orgLoading: false,
  orgError: false,
  entityType: 'school' as 'school' | 'company',
  defaultRate: 0,
  updates: [] as Record<string, unknown>[],
  tutor: { id: 'teacher', full_name: 'Teacher A', email: 'teacher@example.test', company_commission_percent: 0 as number | null },
}));
vi.mock('@/contexts/OrgEntityContext', () => ({ useOrgEntityType: () => state.entityType }));
vi.mock('@/hooks/useOrgFeatures', () => {
  const hasFeature = (key: string) => key === 'tutor_lesson_status_confirmation' && state.manualConfirmation;
  return { useOrgFeatures: () => ({ loading: state.orgLoading, error: state.orgError, hasFeature }) };
});
vi.mock('@/lib/dataCache', () => ({ getCached: () => null, setCache: () => {} }));
vi.mock('@/lib/preload', () => ({ COMPANY_TUTORS_CACHE_KEY: 'company_tutors' }));
vi.mock('@/lib/orgVisibleTutors', () => ({ getOrgVisibleTutors: async () => [state.tutor] }));
vi.mock('@/lib/apiHelpers', () => ({ authHeaders: async () => ({}) }));
vi.mock('@/components/company/BuyLicensesDialog', () => ({ default: () => null }));
vi.mock('@/lib/i18n', async () => {
  const { en } = await import('../../src/lib/i18n/en');
  const t = (key: string, params?: Record<string, string | number>) => Object.entries(params || {})
    .reduce((copy, [name, value]) => copy.replaceAll(`{${name}}`, String(value)), en[key] || key);
  return { useTranslation: () => ({ t, locale: 'en', dateFnsLocale: undefined }), buildLocalizedPath: (path: string) => path };
});
vi.mock('@/lib/supabase', () => ({ supabase: {
  auth: { getUser: async () => ({ data: { user: { id: 'admin' } } }) },
  from(table: string) {
    let from = 0, to = Infinity;
    const filters: Array<(row: any) => boolean> = [];
    const data = () => {
      const rows = table === 'profiles' ? [state.tutor]
        : table === 'organization_admins' ? [{ organization_id: 'school' }]
          : table === 'organizations' ? [{ tutor_license_count: 1, default_company_commission_percent: state.defaultRate }]
            : table === 'sessions' ? state.sessions : [];
      return rows.filter(row => filters.every(filter => filter(row))).slice(from, to + 1);
    };
    const query: any = {
      select: () => query,
      update: (patch: Record<string, unknown>) => {
        if (table === 'profiles') { state.updates.push(patch); Object.assign(state.tutor, patch); }
        return query;
      },
      eq: (key: string, value: unknown) => {
        if (table === 'sessions') filters.push(row =>
          (key === 'students.organization_id' ? row.students?.organization_id : row[key]) === value);
        return query;
      },
      in: (key: string, values: unknown[]) => {
        if (table === 'sessions') filters.push(row => values.includes(row[key]));
        return query;
      },
      gte: (key: string, value: string) => {
        if (table === 'sessions') filters.push(row => Date.parse(row[key]) >= Date.parse(value));
        return query;
      },
      lte: (key: string, value: string) => {
        if (table === 'sessions') filters.push(row => Date.parse(row[key]) <= Date.parse(value));
        return query;
      },
      order: () => query,
      range: (start: number, end: number) => { from = start; to = end; return query; },
      maybeSingle: async () => ({ data: data()[0] || null, error: null }),
      then: (resolve: any, reject: any) => Promise.resolve({ data: data(), error: null }).then(resolve, reject),
    };
    return query;
  },
} }));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-09-30T12:00:00.000Z'));
  state.sessions = [];
  state.attendanceRows = []; state.attendanceError = false;
  state.manualConfirmation = false;
  state.orgLoading = false; state.orgError = false;
  state.entityType = 'school'; state.defaultRate = 0; state.updates = [];
  state.tutor = { id: 'teacher', full_name: 'Teacher A', email: 'teacher@example.test', company_commission_percent: 0 };
  vi.stubGlobal('fetch', vi.fn(async (url: string) => url.startsWith('/api/school-tutor-attendance-pay?')
    ? { ok: !state.attendanceError, json: async () => ({ ok: !state.attendanceError, rows: state.attendanceRows }) }
    : { ok: true, json: async () => ({ data: null }) }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); });

function child(id: string, group: string, pay: number | null, status = 'completed') {
  const start = Date.now() - 2 * 86_400_000;
  return { id, student_id: id, class_group_id: group, tutor_id: 'teacher', status,
    students: { organization_id: 'school' },
    start_time: new Date(start).toISOString(), end_time: new Date(start + 3_600_000).toISOString(),
    status_confirmed_at: new Date(start + 3_660_000).toISOString(), tutor_pay_eur_snapshot: pay };
}
async function openDetails() {
  render(<CompanyTutors />);
  fireEvent.click((await screen.findByText('Teacher A')).closest('button')!);
  return within(await screen.findByRole('dialog'));
}

describe('school administrator teacher-pay details', () => {
  it('keeps an unset school teacher rate pending instead of using a positive organization default', async () => {
    state.tutor.company_commission_percent = null;
    state.defaultRate = 90;
    state.sessions = [child('first', 'group-a', null)];
    const dialog = await openDetails();
    expect(dialog.getByText('Pay rate pending')).toBeTruthy();
    expect(dialog.getByRole('alert').textContent).toContain('pay rates: 1');
    expect(dialog.queryByText('€90.00')).toBeNull();
    expect(dialog.queryByText('€0.00')).toBeNull();
    const rateInput = dialog.getByText('Commission').parentElement!.querySelector('input')!;
    expect(rateInput.value).toBe('');
  });

  it('preserves historical school pay when the teacher tariff is unset and the organization default differs', async () => {
    state.tutor.company_commission_percent = null;
    state.defaultRate = 90;
    state.attendanceRows = [{ ...child('unsigned', 'group-a', 45), source_kind: 'attendance' }];
    const dialog = await openDetails();
    expect(dialog.getByText('€45.00')).toBeTruthy();
    expect(dialog.queryByText('€90.00')).toBeNull();
    expect(dialog.queryByRole('alert')).toBeNull();
    expect(dialog.getByText('Commission').parentElement!.querySelector('input')!.value).toBe('');
  });

  it('does not configure an unset school tariff when saving an unrelated teacher field', async () => {
    state.tutor.company_commission_percent = null;
    state.defaultRate = 90;
    const dialog = await openDetails();
    expect(dialog.getByText('Commission').parentElement!.querySelector('input')!.value).toBe('');
    fireEvent.change(dialog.getByDisplayValue('Teacher A'), { target: { value: 'Teacher Revised' } });
    fireEvent.click(dialog.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(state.updates).toHaveLength(1);
    expect(state.updates[0]).toMatchObject({ full_name: 'Teacher Revised' });
    expect(state.updates[0]).not.toHaveProperty('company_commission_percent');
    expect(state.tutor.company_commission_percent).toBeNull();
  });

  it('preserves the existing organization default fallback for company teacher pay', async () => {
    state.entityType = 'company';
    state.tutor.company_commission_percent = null;
    state.defaultRate = 90;
    state.sessions = [child('first', 'group-a', null)];
    const dialog = await openDetails();
    expect(dialog.getByText('€90.00')).toBeTruthy();
    expect(dialog.getByText('Commission').parentElement!.querySelector('input')!.value).toBe('90');
  });

  it('includes an attendance-only meeting once with its stored rate in the annual teacher total', async () => {
    state.tutor.company_commission_percent = 90;
    state.attendanceRows = ['unsigned-first', 'unsigned-second'].map(id => ({ ...child(id, 'group-a', 45), source_kind: 'attendance' }));
    const dialog = await openDetails();
    expect(dialog.getByText('1')).toBeTruthy();
    expect(dialog.getByText('€45.00')).toBeTruthy();
    expect(vi.mocked(fetch).mock.calls.some(([url]) => String(url)
      === '/api/school-tutor-attendance-pay?tutorId=teacher&periodStart=2025-09-30&periodEnd=2026-09-30')).toBe(true);
  });

  it('includes standalone completed attendance with pending real children as one conducted meeting', async () => {
    state.manualConfirmation = true;
    state.sessions = [child('pending', 'group-a', 90, 'active'), child('cancelled', 'group-a', 90, 'cancelled')];
    state.attendanceRows = [{ ...child('unsigned', 'group-a', 45), source_kind: 'attendance' }];
    const dialog = await openDetails();
    expect(dialog.getByText('1')).toBeTruthy();
    expect(dialog.getByText('€45.00')).toBeTruthy();
  });

  it('does not open incomplete teacher earnings when the attendance pay source is unavailable', async () => {
    state.attendanceError = true;
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<CompanyTutors />);
    fireEvent.click((await screen.findByText('Teacher A')).closest('button')!);
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
    errorLog.mockRestore();
  });

  it('excludes a teacher previous-school real sessions from the current-school annual total', async () => {
    state.sessions = [child('current-child', 'current-school', 45), {
      ...child('old-child', 'old-school', 90), students: { organization_id: 'old-school' },
    }];
    const dialog = await openDetails();
    expect(dialog.getByText('1')).toBeTruthy();
    expect(dialog.getByText('€45.00')).toBeTruthy();
    expect(dialog.queryByText('€135.00')).toBeNull();
  });

  it.each([
    { name: 'loading', loading: true, error: false },
    { name: 'unavailable', loading: false, error: true },
  ])('does not calculate school earnings while the confirmation policy is $name', async ({ loading, error }) => {
    state.orgLoading = loading; state.orgError = error;
    state.sessions = [child('unconfirmed', 'group-a', 45)];
    render(<CompanyTutors />);
    const button = (await screen.findByText('Teacher A')).closest('button')!;
    expect(button.disabled).toBe(true);
    fireEvent.click(button);
    expect(screen.queryByRole('dialog')).toBeNull();
    if (error) expect(screen.getByRole('alert')).toBeTruthy();
  });

  it('requires confirmation for a custom school feature and ignores pending sibling pay', async () => {
    state.manualConfirmation = true;
    state.tutor.company_commission_percent = 45;
    state.sessions = [child('first', 'group-a', 45), child('second', 'group-a', 90)]
      .map(row => ({ ...row, status_confirmed_at: null }));
    let dialog = await openDetails();
    expect(dialog.getByText('0')).toBeTruthy();
    expect(dialog.getByText('€0.00')).toBeTruthy();

    cleanup();
    state.sessions[0].status_confirmed_at = '2026-09-28T13:00:00Z';
    dialog = await openDetails();
    expect(dialog.getByText('1')).toBeTruthy();
    expect(dialog.getByText('€45.00')).toBeTruthy();
    expect(dialog.queryByRole('alert')).toBeNull();
  });

  it('pays each meeting once using a known sibling snapshot and shows unresolved meetings separately', async () => {
    state.sessions = [child('first', 'group-a', null), child('second', 'group-a', 45), child('third', 'group-b', null)];
    const dialog = await openDetails();
    expect(dialog.getByText('2')).toBeTruthy();
    expect(dialog.getByText('€45.00')).toBeTruthy();
    expect(dialog.getByText('Total at known rates')).toBeTruthy();
    expect(dialog.getByRole('alert').textContent).toContain('pay rates: 1');
  });

  it('shows pending rather than zero when every meeting has unknown pay', async () => {
    state.sessions = [child('first', 'group-a', null), child('second', 'group-a', null)];
    const dialog = await openDetails();
    expect(dialog.getByText('Pay rate pending')).toBeTruthy();
    expect(dialog.queryByText('€0.00')).toBeNull();
  });

  it('preserves a known zero rate and counts a manual no-show meeting as a final outcome', async () => {
    state.defaultRate = 90;
    state.sessions = [child('first', 'group-a', 0, 'no_show')];
    const dialog = await openDetails();
    expect(dialog.getByText('1')).toBeTruthy();
    expect(dialog.getByText('€0.00')).toBeTruthy();
    expect(dialog.getByText('Lessons with a final outcome')).toBeTruthy();
    expect(dialog.queryByRole('alert')).toBeNull();
    expect(dialog.getByText('Commission').parentElement!.querySelector('input')!.value).toBe('0');
  });

  it('keeps a meeting pending when an active sibling outweighs a no-show child', async () => {
    state.sessions = [child('first', 'group-a', 45, 'no_show'), child('second', 'group-a', null, 'active')];
    const dialog = await openDetails();
    expect(dialog.getByText('0')).toBeTruthy();
    expect(dialog.queryByText('€45.00')).toBeNull();
  });

  it('labels the rolling annual period and includes prior months only within its Vilnius boundary', async () => {
    state.tutor.company_commission_percent = 45;
    const meeting = (id: string, start: string, end: string) => ({
      ...child(id, id, null), start_time: start, end_time: end,
    });
    state.sessions = [
      meeting('before-year', '2025-09-29T20:59:59.000Z', '2025-09-29T21:59:59.000Z'),
      meeting('year-boundary', '2025-09-29T21:00:00.000Z', '2025-09-29T22:00:00.000Z'),
      meeting('august', '2026-08-05T09:00:00.000Z', '2026-08-05T10:00:00.000Z'),
      meeting('september', '2026-09-05T09:00:00.000Z', '2026-09-05T10:00:00.000Z'),
      meeting('not-ended', '2026-09-30T11:30:00.000Z', '2026-09-30T12:30:00.000Z'),
    ];
    const dialog = await openDetails();
    expect(dialog.getByText('Date range: 2025-09-30 – 2026-09-30')).toBeTruthy();
    expect(dialog.getByText('3')).toBeTruthy();
    expect(dialog.getByText('€135.00')).toBeTruthy();
  });
});
