import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import CompanyTvarkarastis from '@/pages/company/CompanyTvarkarastis';
import { companyTvarkarastisCacheKey, getCached, invalidateCache } from '@/lib/dataCache';

const state = vi.hoisted(() => ({
  orgId: '3422031d-6e21-424d-980b-35a9c6d7b8f1',
  metadata: vi.fn(), availability: vi.fn(), sessionRead: vi.fn(),
  signals: [] as AbortSignal[],
}));
vi.mock('@/lib/orgScheduleData', () => ({ loadOrgScheduleMetadata: state.metadata }));
vi.mock('@/lib/availabilityData', () => ({ loadAvailabilityForTutorIds: state.availability }));
vi.mock('@/contexts/OrgEntityContext', () => ({ useOrgEntityType: () => 'company' }));
vi.mock('@/contexts/UserContext', () => ({ useUser: () => ({ user: { id: 'admin' } }) }));
vi.mock('@/contexts/OrgAdminAccessContext', () => ({ useOrgAdminAccess: () => ({ isOwner: true, loading: false, can: () => true }) }));
vi.mock('@/hooks/useOrgFeatures', () => ({ useOrgFeatures: () => ({
  organizationId: state.orgId, loading: false, hasFeature: () => false, schoolOrgCalendar: null,
}) }));
vi.mock('@/hooks/useMarketMoney', () => ({ useMarketMoney: () => ({ fmt: (value: unknown) => String(value) }) }));
vi.mock('@/hooks/useStudentRegistrationStatus', () => {
  const registration = { enabled: false, byStudentId: new Map(), loading: false };
  return { useStudentRegistrationStatus: () => registration };
});
vi.mock('react-big-calendar', () => ({
  Views: { DAY: 'day', WEEK: 'week', MONTH: 'month', AGENDA: 'agenda' },
  dateFnsLocalizer: () => ({}),
  Calendar: ({ events }: { events: Array<{ id: string }> }) => <div data-testid="calendar">{events.map(event => <span key={event.id}>{event.id}</span>)}</div>,
}));
vi.mock('@/components/FindTutorModal', () => ({ default: () => null }));
vi.mock('@/components/StudentRegistrationAlert', () => ({ default: () => null }));
vi.mock('@/lib/supabase', () => ({ supabase: {
  from: (table: string) => {
    let from = 0;
    let signal: AbortSignal | undefined;
    const query: any = new Proxy({}, { get: (_target, key) => {
      if (key === 'then') return (resolve: any, reject: any) => Promise.resolve().then(() => {
        if (signal) state.signals.push(signal);
        return table === 'sessions' ? state.sessionRead(from) : { data: { features: {} }, error: null };
      }).then(resolve, reject);
      if (key === 'range') return (start: number) => { from = start; return query; };
      if (key === 'abortSignal') return (value: AbortSignal) => { signal = value; return query; };
      return () => query;
    } });
    return query;
  },
} }));

const metadata = () => ({
  orgTutors: [{ id: 'tutor', full_name: 'Tutor', email: 'tutor@example.test' }],
  students: [{ id: 'student', tutor_id: 'tutor', full_name: 'Student' }],
  subjects: [{ id: 'subject', tutor_id: 'tutor', name: 'Maths', duration_minutes: 60, price: 29 }],
  individualPricing: [], tutorSubjectPrices: [], dynamicPricingRules: [], orgSubjectTemplates: [], orgUsesLicenses: false,
});
const lesson = {
  id: 'synthetic-lesson', tutor_id: 'tutor', student_id: 'student', subject_id: 'subject',
  start_time: '2026-10-22T16:55:00+03:00', end_time: '2026-10-22T17:55:00+03:00',
  status: 'active', paid: false, price: 29, student: { full_name: 'Student' },
};

beforeEach(() => {
  vi.clearAllMocks(); invalidateCache(); localStorage.clear(); state.signals.length = 0;
  state.metadata.mockResolvedValue(metadata());
  state.availability.mockResolvedValue([]);
  state.sessionRead.mockImplementation((from: number) => ({ data: from === 0 ? [lesson] : [], error: null }));
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.useRealTimers(); invalidateCache(); });

describe('Organization calendar error and retry flow', () => {
  it('loads students and lessons even when availability fails', async () => {
    state.availability.mockRejectedValue(new Error('522'));
    render(<CompanyTvarkarastis />);
    expect(await screen.findByText('synthetic-lesson')).toBeTruthy();
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(getCached<any>(companyTvarkarastisCacheKey(state.orgId))?.students).toHaveLength(1);
    expect(getCached<any>(companyTvarkarastisCacheKey(state.orgId))?.metaComplete).toBe(true);
  });

  it('rejects a failed final page without displaying a partial calendar, then retries successfully', async () => {
    state.sessionRead.mockImplementation((from: number) => from === 0
      ? { data: [lesson], error: null } : { data: null, error: { message: '522' } });
    render(<CompanyTvarkarastis />);
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.queryByText('synthetic-lesson')).toBeNull();
    state.sessionRead.mockImplementation((from: number) => ({ data: from === 0 ? [lesson] : [], error: null }));
    await waitFor(() => expect((screen.getByRole('button', { name: 'Bandyti dar kartą' }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole('button', { name: 'Bandyti dar kartą' }));
    expect(await screen.findByText('synthetic-lesson')).toBeTruthy();
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
  });

  it('retries failed metadata without publishing a successful empty roster to cache', async () => {
    state.metadata.mockRejectedValueOnce(new Error('522'));
    render(<CompanyTvarkarastis />);
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(getCached(companyTvarkarastisCacheKey(state.orgId))).toBeNull();
    expect(state.availability).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Bandyti dar kartą' }));
    expect(await screen.findByText('synthetic-lesson')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('finishes a hung session load after 15 seconds and aborts the transport', async () => {
    vi.useFakeTimers();
    state.sessionRead.mockReturnValue(new Promise(() => {}));
    render(<CompanyTvarkarastis />);
    await act(async () => {});
    await act(async () => { await vi.advanceTimersByTimeAsync(15_000); });
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(state.signals.length).toBeGreaterThan(0);
    expect(state.signals.every(signal => signal.aborted)).toBe(true);
  });

  it('keeps the current calendar after a failed background refresh', async () => {
    render(<CompanyTvarkarastis />);
    expect(await screen.findByText('synthetic-lesson')).toBeTruthy();
    state.sessionRead.mockResolvedValue({ data: null, error: { message: '522' } });
    fireEvent.focus(window);
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByText('synthetic-lesson')).toBeTruthy();
  });

  it('does not show the previous period as the requested period after a failed navigation', async () => {
    render(<CompanyTvarkarastis />);
    expect(await screen.findByText('synthetic-lesson')).toBeTruthy();
    state.sessionRead.mockResolvedValue({ data: null, error: { message: '522' } });
    fireEvent.click(screen.getByRole('button', { name: 'Kitas laikotarpis' }));
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.queryByText('synthetic-lesson')).toBeNull();
  });

  it('shows loaded lessons while a hung availability read reaches its own deadline', async () => {
    vi.useFakeTimers();
    state.availability.mockReturnValue(new Promise(() => {}));
    render(<CompanyTvarkarastis />);
    await act(async () => {});
    expect(screen.getByText('synthetic-lesson')).toBeTruthy();
    await act(async () => { await vi.advanceTimersByTimeAsync(15_000); });
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.getByText('synthetic-lesson')).toBeTruthy();
    expect(getCached<any>(companyTvarkarastisCacheKey(state.orgId))?.students).toHaveLength(1);
  });

  it('ignores an unmounted metadata response instead of overwriting the next page cache', async () => {
    let resolvePrevious!: (value: unknown) => void;
    state.metadata.mockReturnValueOnce(new Promise(resolve => { resolvePrevious = resolve; }));
    const first = render(<CompanyTvarkarastis />);
    first.unmount();
    const next = { ...metadata(), students: [{ id: 'next-student', full_name: 'Next student' }] };
    // Let the old shared request settle after unmount, then reopen the page.
    await act(async () => { resolvePrevious(metadata()); });
    expect(getCached(companyTvarkarastisCacheKey(state.orgId))).toBeNull();
    state.metadata.mockResolvedValue(next);
    render(<CompanyTvarkarastis />);
    expect(await screen.findByText('synthetic-lesson')).toBeTruthy();
    expect(getCached<any>(companyTvarkarastisCacheKey(state.orgId))?.students[0].id).toBe('next-student');
  });
});
