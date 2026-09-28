import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import StudentSessions from '@/pages/StudentSessions';
import StudentSchedule from '@/pages/StudentSchedule';
import { invalidateCache } from '@/lib/dataCache';

type LessonFixture = {
  id: string;
  student_id: string;
  start_time: string;
  end_time: string;
  status: string;
  topic: string;
  recurring_session_id: string | null;
  class_group_id: string | null;
  cancellation_penalty_amount: number;
  penalty_resolution: string | null;
  paid: boolean;
  price: number;
};

const state = vi.hoisted(() => ({ lessons: [] as LessonFixture[] }));

vi.mock('@/lib/i18n', async () => {
  const { enUS } = await import('date-fns/locale');
  const t = (key: string) => key;
  return { useTranslation: () => ({ t, tHtml: t, locale: 'en', dateFnsLocale: enUS }) };
});
vi.mock('@/contexts/UserContext', () => ({ useUser: () => ({ user: { id: 'family-user', email: 'family@example.com' } }) }));
vi.mock('@/contexts/StudentPolicyContext', () => ({ useStudentPolicy: () => ({
  resolved: true, actionsDisabled: true, rescheduleDisabled: true, bookingDisabled: false,
}) }));
vi.mock('@/hooks/useMarketMoney', () => ({ useMarketMoney: () => ({
  fmt: (amount: number) => `${amount} EUR`, formatLessonCharge: (amount: number) => `${amount} EUR`, isPl: false,
}) }));
vi.mock('@/hooks/useStudentPaymentBlock', () => ({ useStudentPaymentBlock: () => ({ blocked: false, loading: false, refetch: async () => {} }) }));
vi.mock('@/lib/apiHelpers', () => ({ authHeaders: async () => ({ 'Content-Type': 'application/json', Authorization: 'Bearer family-token' }) }));
vi.mock('@/lib/studentLessonPackagesLight', () => ({ fetchStudentActiveLessonPackagesDeduped: async () => [], fetchSubjectNamesByIds: async () => ({}) }));
vi.mock('@/lib/preload', () => ({ rpcGetStudentProfilesDeduped: async () => ({ data: [{
  id: 'child', full_name: 'Ada', tutor_id: null, organization_id: 'school', tutor_organization_entity_type: 'school',
}], error: null }) }));
vi.mock('@/components/StudentLayout', () => ({ default: ({ children }: { children: ReactNode }) => <div>{children}</div> }));
vi.mock('@/components/ParentLayout', () => ({ default: ({ children }: { children: ReactNode }) => <div>{children}</div> }));
vi.mock('@/components/parent/ParentChildSwitcher', () => ({ default: () => null }));
vi.mock('@/components/SessionFiles', () => ({ default: () => null }));
vi.mock('@/components/JoinLessonButton', () => ({ default: () => null }));
vi.mock('@/components/WhiteboardButton', () => ({ default: () => null }));
vi.mock('@/components/StatusBadge', () => ({ default: ({ status }: { status: string }) => <span>{status}</span> }));
vi.mock('react-big-calendar', () => ({
  Views: { DAY: 'day', WEEK: 'week', MONTH: 'month' },
  dateFnsLocalizer: () => ({}),
  Calendar: ({ events, onSelectEvent }: {
    events: Array<{ sessionId: string; title: string; occupied: boolean; isCancelled?: boolean }>;
    onSelectEvent: (event: unknown) => void;
  }) => <div aria-label="calendar">{events.map((event) => (
    <button key={event.sessionId} data-occupied={event.occupied} onClick={() => onSelectEvent(event)}>{event.title}</button>
  ))}</div>,
}));

vi.mock('@/lib/supabase', () => {
  const student = { id: 'child', full_name: 'Ada', tutor_id: null, organization_id: 'school', tutor_organization_entity_type: 'school' };
  const from = (table: string) => {
    const filters: Array<(row: Record<string, unknown>) => boolean> = [];
    const rows = () => {
      const data: Record<string, unknown>[] = table === 'sessions' ? state.lessons
        : table === 'students' ? [student]
        : table === 'parent_students' ? [{ id: 'parent-link', parent_id: 'parent', student_id: 'child', students: student }]
        : table === 'organizations' ? [{ id: 'school', entity_type: 'school', features: { disable_student_reschedule_cancel: true } }]
        : [];
      return data.filter((row) => filters.every((filter) => filter(row)));
    };
    const query = {
      select: () => query,
      eq: (key: string, value: unknown) => { filters.push((row) => row[key] === value); return query; },
      in: (key: string, values: unknown[]) => { filters.push((row) => values.includes(row[key])); return query; },
      gte: () => query, lte: () => query, order: () => query, limit: () => query,
      maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
      single: async () => ({ data: rows()[0] ?? null, error: null }),
      then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: rows(), error: null }).then(resolve),
    };
    return query;
  };
  const channel = { on: () => channel, subscribe: () => channel };
  return { supabase: {
    from,
    rpc: async (name: string) => ({ data: name === 'get_parent_profile_id_by_user_id' ? 'parent' : [student], error: null }),
    channel: () => channel, removeChannel: () => {},
    auth: { getSession: async () => ({ data: { session: { access_token: 'family-token' } } }) },
  } };
});

function lesson(id: string, topic: string, day: number, status = 'cancelled'): LessonFixture {
  const start = new Date();
  start.setDate(start.getDate() + day);
  start.setHours(14, 0, 0, 0);
  return {
    id, topic, student_id: 'child', start_time: start.toISOString(), end_time: new Date(start.getTime() + 3_600_000).toISOString(),
    status, recurring_session_id: 'school-year-series', class_group_id: null,
    cancellation_penalty_amount: 0, penalty_resolution: null, paid: false, price: 25,
  };
}

beforeEach(() => {
  invalidateCache();
  localStorage.clear();
  state.lessons = [lesson('cancelled-first', 'Cancelled maths', 1), lesson('cancelled-later', 'Cancelled later maths', 8), lesson('active', 'Active maths', 15, 'active')];
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  vi.spyOn(window, 'alert').mockImplementation(() => {});
  vi.stubGlobal('fetch', vi.fn(async (url: string, options?: RequestInit) => {
    if (url !== '/api/delete-session') throw new Error(`Unexpected request: ${url}`);
    const body = JSON.parse(String(options?.body)) as { sessionId: string; deleteScope: string };
    const target = state.lessons.find((row) => row.id === body.sessionId)!;
    const deletedSessionIds = state.lessons.filter((row) => row.status === 'cancelled' &&
      (body.deleteScope === 'single' ? row.id === target.id : row.recurring_session_id === target.recurring_session_id))
      .map((row) => row.id);
    state.lessons = state.lessons.filter((row) => !deletedSessionIds.includes(row.id));
    return { ok: true, json: async () => ({ success: true, deletedCount: deletedSessionIds.length, deletedSessionIds }) };
  }));
});
afterEach(() => { cleanup(); invalidateCache(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('family lesson deletion', () => {
  it.each(['/student/sessions', '/parent/lessons?studentId=child'])('%s lets the family delete one cancelled recurring occurrence without deleting its siblings', async (route) => {
    render(<MemoryRouter initialEntries={[route]}><StudentSessions /></MemoryRouter>);
    fireEvent.click(await screen.findByText('Cancelled maths'));
    fireEvent.click(screen.getByRole('button', { name: 'cal.deleteSession' }));
    fireEvent.click(screen.getByRole('button', { name: 'cal.deleteOnlyThis' }));
    expect(fetch).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'cal.delete', exact: true }));

    await waitFor(() => expect(screen.queryByText('Cancelled maths')).toBeNull());
    expect(screen.getByText('Cancelled later maths')).toBeTruthy();
    expect(screen.getByText('Active maths')).toBeTruthy();
    expect(fetch).toHaveBeenCalledWith('/api/delete-session', expect.objectContaining({
      body: JSON.stringify({ sessionId: 'cancelled-first', deleteScope: 'single' }),
    }));
    expect(window.confirm).not.toHaveBeenCalled();
  });

  it.each(['/student/schedule', '/parent/calendar?studentId=child'])('%s shows cancelled lessons without blocking availability and lets the family clean up the cancelled series', async (route) => {
    render(<MemoryRouter initialEntries={[route]}><StudentSchedule /></MemoryRouter>);
    const event = await screen.findByRole('button', { name: 'Cancelled maths · status.cancelled' });
    expect(event.getAttribute('data-occupied')).toBe('false');
    fireEvent.click(event);
    fireEvent.click(screen.getByRole('button', { name: 'cal.deleteSession' }));
    fireEvent.click(screen.getByRole('button', { name: 'cal.deleteAllRemaining' }));
    expect(fetch).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'cal.delete', exact: true }));

    await waitFor(() => expect(screen.queryByRole('button', { name: 'Cancelled maths · status.cancelled' })).toBeNull());
    expect(screen.queryByRole('button', { name: 'Cancelled later maths · status.cancelled' })).toBeNull();
    expect(state.lessons.map((row) => row.id)).toEqual(['active']);
    expect(fetch).toHaveBeenCalledWith('/api/delete-session', expect.objectContaining({
      body: JSON.stringify({ sessionId: 'cancelled-first', deleteScope: 'all' }),
    }));
    expect(window.confirm).not.toHaveBeenCalled();
  });

  it('keeps pending cancellation charges out of the family deletion flow', async () => {
    state.lessons[0].cancellation_penalty_amount = 10;
    state.lessons[0].penalty_resolution = 'pending';
    render(<MemoryRouter initialEntries={['/student/sessions']}><StudentSessions /></MemoryRouter>);
    fireEvent.click(await screen.findByText('Cancelled maths'));
    expect(screen.queryByRole('button', { name: 'cal.deleteSession' })).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('keeps active lessons on the cancellation flow', async () => {
    render(<MemoryRouter initialEntries={['/parent/calendar?studentId=child']}><StudentSchedule /></MemoryRouter>);
    fireEvent.click(await screen.findByRole('button', { name: 'stuSched.childLesson' }));
    expect(screen.queryByRole('button', { name: 'cal.deleteSession' })).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });
});
