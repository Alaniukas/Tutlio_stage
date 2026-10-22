import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import CompanyStudents from '@/pages/company/CompanyStudents';
import { rowQuery, type RowQueryLog } from '../fixtures/rowQuery';

const state = vi.hoisted(() => ({
  cache: null as any, students: [] as any[], logs: [] as RowQueryLog[], selects: [] as string[],
  tutorLoad: vi.fn(), setCache: vi.fn(), subjectGate: null as Promise<void> | null,
  studentError: false,
}));
const orgId = 'b0a00000-7e57-4000-8000-000000000001';
vi.mock('@/lib/dataCache', () => ({
  getCached: (key: string) => key === 'company_students' ? state.cache : null,
  setCache: (...args: any[]) => { state.setCache(...args); if (args[0] === 'company_students') state.cache = args[1]; },
  invalidateCache: vi.fn(),
}));
vi.mock('@/lib/orgVisibleTutors', () => ({ getOrgVisibleTutors: (...args: any[]) => state.tutorLoad(...args) }));
vi.mock('@/lib/supabase', () => ({ supabase: {
  auth: { getSession: async () => ({ data: { session: { access_token: 'synthetic-token' } } }) },
  from: (table: string) => {
    const query = rowQuery(table, () => {
      if (table === 'students') return state.students;
      if (table === 'organizations') return [{ id: orgId, features: { trial_followup_alert: true } }];
      if (table === 'subjects') return [{ tutor_id: 'tutor', name: 'Matematika' }];
      return [];
    }, state.logs);
    query.or = () => query;
    const select = query.select;
    query.select = (columns: string) => { state.selects.push(`${table}:${columns}`); return select(columns); };
    const then = query.then;
    query.then = (resolve: any, reject: any) => {
      if (table === 'subjects' && state.subjectGate) return state.subjectGate.then(() => then(resolve, reject));
      if (table === 'students' && state.studentError) return Promise.resolve({ data: null, error: { message: 'HTTP 522' } }).then(resolve, reject);
      return then(resolve, reject);
    };
    return query;
  },
  rpc: async () => ({ data: [], error: null }),
} }));
vi.mock('@/contexts/OrgEntityContext', () => ({ useOrgEntityType: () => 'company' }));
vi.mock('@/contexts/UserContext', () => ({ useUser: () => ({ user: { id: 'admin' }, profile: null, loading: false }) }));
vi.mock('@/contexts/OrgAdminAccessContext', () => ({ useOrgAdminAccess: () => ({
  loading: false, membership: { organizationId: 'b0a00000-7e57-4000-8000-000000000001' }, isOwner: true,
  can: () => true, refresh: async () => {}, firstAllowedPath: () => '/company',
}) }));
vi.mock('@/hooks/useOrgFeatures', () => ({ useOrgFeatures: () => ({ loading: false, hasFeature: () => false }) }));
vi.mock('@/hooks/useMarketMoney', () => ({ useMarketMoney: () => ({ fmt: (value: unknown) => `€${value}` }) }));
vi.mock('@/hooks/useStudentRegistrationStatus', () => ({ useStudentRegistrationStatus: () => ({
  enabled: false, byStudentId: new Map(), states: [], error: null,
}) }));

const tutor = { id: 'tutor', full_name: 'Test Tutor' };
function student(name = 'Test Student') {
  return { id: name, organization_id: orgId, tutor_id: 'tutor', full_name: name,
    email: `${name.replaceAll(' ', '.')}@example.test`, payer_email: null, phone: null,
    linked_user_id: 'child-account', detached_at: null, invite_code: name, enrollment_status: 'active',
    created_at: '2026-10-01T00:00:00Z', grade: '5 klasė' };
}
async function openPage() {
  await act(async () => { render(<MemoryRouter><CompanyStudents /></MemoryRouter>); });
}
beforeEach(() => {
  state.cache = null; state.subjectGate = null; state.studentError = false;
  state.students = [student()]; state.logs = []; state.selects = [];
  state.tutorLoad.mockResolvedValue([tutor]);
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ studentIds: [], rows: [], plans: [] }) })));
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.clearAllMocks(); });

describe('company student roster loading', () => {
  it('shows students while subject labels and trial-followup badges are still pending', async () => {
    let finishSubjects!: () => void;
    let finishBadges!: (value: any) => void;
    state.subjectGate = new Promise(resolve => { finishSubjects = resolve; });
    const badges = new Promise(resolve => { finishBadges = resolve; });
    vi.stubGlobal('fetch', vi.fn((url: string) => url.includes('summary=trial-followup')
      ? badges : Promise.resolve({ ok: true, json: async () => ({ rows: [], plans: [] }) })));
    await openPage();
    expect((await screen.findAllByText('Test Student')).length).toBeGreaterThan(0);
    expect(screen.queryByText('Kraunama...')).toBeNull();
    expect(state.cache.students[0].tutor.full_name).toBe('Test Tutor');
    expect(state.selects.filter(select => select.startsWith('students:')).every(select => !select.includes('profiles'))).toBe(true);
    await act(async () => {
      finishSubjects();
      finishBadges({ ok: true, json: async () => ({ studentIds: [] }) });
    });
    await waitFor(() => expect(state.cache.tutors[0].subject_names).toEqual(['Matematika']));
  });

  it('stops on a tutor-list failure, avoids caching an empty roster and retries successfully', async () => {
    state.tutorLoad.mockRejectedValue(new Error('HTTP 522'));
    await openPage();
    expect((await screen.findByRole('alert')).textContent).toContain('Nepavyko įkelti mokinių');
    expect(state.logs.some(log => log.table === 'students')).toBe(false);
    expect(state.setCache).not.toHaveBeenCalled();
    state.tutorLoad.mockResolvedValue([tutor]);
    fireEvent.click(screen.getByRole('button', { name: 'Bandyti iš naujo' }));
    expect((await screen.findAllByText('Test Student')).length).toBeGreaterThan(0);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('preserves the cached list when refreshing student data fails', async () => {
    const previous = { students: [student('Cached Student')], tutors: [tutor], contractsByStudent: {} };
    state.cache = previous; state.studentError = true;
    await openPage();
    expect((await screen.findAllByText('Cached Student')).length).toBeGreaterThan(0);
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(state.cache).toBe(previous);
    expect(state.setCache).not.toHaveBeenCalled();
  });

  it('ends a hung load after 15 seconds and ignores its late result', async () => {
    vi.useFakeTimers();
    let finishTutors!: (value: any) => void;
    state.tutorLoad.mockImplementation(() => new Promise(resolve => { finishTutors = resolve; }));
    await openPage();
    expect(screen.getByText('Kraunama...')).toBeTruthy();
    const signal = state.tutorLoad.mock.calls[0][3].signal as AbortSignal;
    await act(async () => { await vi.advanceTimersByTimeAsync(15_000); });
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(signal.aborted).toBe(true);
    await act(async () => { finishTutors([tutor]); });
    expect(state.setCache).not.toHaveBeenCalled();
    expect(state.logs.some(log => log.table === 'students')).toBe(false);
  });
});
