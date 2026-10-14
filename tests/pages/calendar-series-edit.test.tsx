import type { ReactNode } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import CalendarPage from '@/pages/Calendar';
import { invalidateCache } from '@/lib/dataCache';

const state = vi.hoisted(() => ({
  rows: [] as Array<Record<string, any>>,
  writes: [] as Array<{ id: string; patch: Record<string, any> }>,
  deferRefresh: false,
  approval: false,
  releaseRefresh: null as (() => void) | null,
}));
vi.mock('@/lib/i18n', async () => {
  const { enUS } = await import('date-fns/locale');
  const t = (key: string) => key;
  return { useTranslation: () => ({ t, locale: 'en', dateFnsLocale: enUS }) };
});
vi.mock('@/contexts/UserContext', () => {
  const user = { id: 'tutor', email: 'tutor@example.com' };
  const profile = { id: user.id, organization_id: '3422031d-6e21-424d-980b-35a9c6d7b8f1' };
  return { useUser: () => ({ user, profile }) };
});
vi.mock('@/hooks/useOrgTutorPolicy', () => ({ useOrgTutorPolicy: () => ({
  loading: false, isOrgTutor: true, canCreateSessions: true, hideMoney: true,
  orgUsesLicenses: false, hasActiveLicense: true,
}) }));
vi.mock('@/hooks/useOrgFeatures', () => {
  const hasFeature = (key: string) => key === 'tutor_recurring_reschedule_approval' && state.approval;
  return { useOrgFeatures: () => ({ loading: false, entityType: 'company',
    organizationId: '3422031d-6e21-424d-980b-35a9c6d7b8f1', hasFeature, contactVisibility: {},
  }) };
});
vi.mock('@/hooks/useStudentRegistrationStatus', () => ({
  useStudentRegistrationStatus: () => ({ enabled: false, byStudentId: new Map() }),
}));
vi.mock('@/lib/preload', () => {
  const profile = { id: 'tutor', full_name: 'Tutor', organization_id: '3422031d-6e21-424d-980b-35a9c6d7b8f1' };
  const empty = async () => ({ data: [], error: null });
  return {
    dedupeAuthGetUser: async () => ({ id: 'tutor' }),
    tutorSidebarProfileDeduped: async () => ({ data: profile, error: null }),
    tutorCalendarFallbackProfileDeduped: async () => ({ data: profile, error: null }),
    orgSuspensionRowDeduped: async () => ({ data: { features: {} }, error: null }),
    organizationSubjectTemplatesDeduped: async () => ({ data: { org_subject_templates: [] }, error: null }),
    tutorStudentsRowsDeduped: async () => ({ data: [{ id: 'student', full_name: 'Ada', email: 'ada@example.com' }], error: null }),
    tutorSubjectsCalendarDeduped: async () => ({ data: [{ id: 'math', name: 'Math', is_group: false }], error: null }),
    tutorStudentPricingAllDeduped: empty, tutorSubjectPricesRowsAllDeduped: empty,
    tutorAvailabilityAllRowsDeduped: empty,
  };
});
vi.mock('@/components/Layout', () => ({ default: ({ children }: { children: ReactNode }) => <div>{children}</div> }));
vi.mock('@/components/SessionFiles', () => ({ default: () => null }));
vi.mock('@/components/WhiteboardButton', () => ({ default: () => null }));
vi.mock('@/components/AvailabilityManager', () => ({ default: () => null }));
vi.mock('@/lib/authSession', () => ({ resolveAccessToken: async () => 'tutor-token' }));
vi.mock('react-big-calendar', () => ({
  dateFnsLocalizer: () => ({}), Views: { WEEK: 'week', DAY: 'day', MONTH: 'month', AGENDA: 'agenda' },
  Calendar: ({ events, onSelectEvent }: { events: Array<{ id: string; start_time: Date }>; onSelectEvent: (event: unknown) => void }) =>
    <div>{events.map(event => <div key={event.id}>
      <button onClick={() => onSelectEvent(event)}>open {event.id}</button>
      <output data-testid={`date-${event.id}`}>{event.start_time.toISOString()}</output>
    </div>)}</div>,
}));
vi.mock('@/lib/email', () => ({ sendEmail: vi.fn(async () => true) }));
vi.mock('@/lib/supabase', () => {
  const from = (table: string) => {
    const filters: Array<(row: Record<string, any>) => boolean> = [];
    let patch: Record<string, any> | null = null;
    let offset = 0, limit = Infinity;
    const rows = () => {
      if (table === 'profiles') return [{ id: 'tutor', full_name: 'Tutor', organization_id: '3422031d-6e21-424d-980b-35a9c6d7b8f1' }];
      if (table === 'organizations') return [{ id: '3422031d-6e21-424d-980b-35a9c6d7b8f1', features: {} }];
      if (table === 'subjects') return [{ id: 'math', name: 'Math', is_trial: false }];
      if (table === 'students') return [{ id: 'student', full_name: 'Ada', email: 'ada@example.com' }];
      if (table === 'sessions') return state.rows;
      return [];
    };
    const resolveRows = async () => {
      if (!patch && table === 'sessions' && state.deferRefresh && state.writes.length) {
        await new Promise<void>(resolve => { state.releaseRefresh = resolve; });
      }
      const result = rows().filter(row => filters.every(filter => filter(row))).slice(offset, offset + limit);
      if (patch) for (const row of result) {
        state.writes.push({ id: row.id, patch }); Object.assign(row, patch);
      }
      return { data: structuredClone(result), error: null };
    };
    const query = {
      select: () => query, order: () => query,
      eq: (key: string, value: unknown) => { filters.push(row => row[key] === value); return query; },
      neq: (key: string, value: unknown) => { filters.push(row => row[key] !== value); return query; },
      in: (key: string, values: unknown[]) => { filters.push(row => values.includes(row[key])); return query; },
      not: (key: string, _operator: string, value: unknown) => { filters.push(row => row[key] !== value); return query; },
      gte: (key: string, value: string) => { filters.push(row => row[key] >= value); return query; },
      lte: (key: string, value: string) => { filters.push(row => row[key] <= value); return query; },
      lt: (key: string, value: string) => { filters.push(row => row[key] < value); return query; },
      gt: (key: string, value: string) => { filters.push(row => row[key] > value); return query; },
      limit: (value: number) => { limit = value; return query; },
      range: (start: number, end: number) => { offset = start; limit = end - start + 1; return query; },
      update: (value: Record<string, any>) => { patch = value; return query; },
      single: async () => ({ data: (await resolveRows()).data[0] ?? null, error: null }),
      maybeSingle: async () => ({ data: (await resolveRows()).data[0] ?? null, error: null }),
      then: (resolve: (value: unknown) => unknown) => resolveRows().then(resolve),
    };
    return query;
  };
  return { supabase: { from, auth: { getUser: async () => ({ data: { user: { id: 'tutor' } } }) } } };
});

beforeEach(() => {
  invalidateCache(); localStorage.clear(); state.writes = []; state.deferRefresh = false; state.approval = false;
  state.rows = [0, 7, 14].map((days, index) => ({
    id: `lesson-${index}`, tutor_id: 'tutor', student_id: 'student', subject_id: 'math', recurring_session_id: 'series',
    start_time: new Date(Date.now() + (days + 2) * 86_400_000).toISOString(),
    end_time: new Date(Date.now() + (days + 2) * 86_400_000 + 3_600_000).toISOString(),
    topic: 'Math', status: 'active', paid: true, price: 25, hidden_from_calendar: false,
    student: { full_name: 'Ada', email: 'ada@example.com' },
  }));
  vi.spyOn(window, 'alert').mockImplementation(() => {});
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (url === '/api/lesson-reschedule-approval') return new Response(JSON.stringify({ requests: [] }));
    if (url !== '/api/tutor-calendar-series-edit') throw new Error(`Unexpected fetch: ${url}`);
    const input = JSON.parse(String(init?.body));
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer tutor-token');
    const saved = state.rows.filter(row => row.recurring_session_id === 'series' && row.status === 'active');
    for (const row of saved) { state.writes.push({ id: row.id, patch: input.fields }); Object.assign(row, input.fields); }
    return new Response(JSON.stringify({ sessions: saved.map(({ id, start_time, end_time }) => ({ id, start_time, end_time })) }));
  }));
});
afterEach(async () => {
  cleanup(); state.deferRefresh = false; state.releaseRefresh?.(); state.releaseRefresh = null;
  await new Promise(resolve => setTimeout(resolve, 0));
  invalidateCache(); vi.restoreAllMocks(); vi.unstubAllGlobals();
});

async function edit(scope: 'single' | 'all_future', entry = 'cal.editBtn', lessonId = 'lesson-0') {
  render(<MemoryRouter><CalendarPage /></MemoryRouter>);
  fireEvent.click(await screen.findByText(`open ${lessonId}`));
  fireEvent.click(screen.getByText(entry));
  await screen.findByText('cal.saveEdit');
  fireEvent.click(screen.getByText(scope === 'single' ? 'cal.editThisOnly' : 'cal.editAllFuture'));
}

describe('SUP-C3526529 tutor calendar recurring series editor', () => {
  it.each(['cal.editBtn', 'cal.moveLesson'])('lets Pro Klasė tutors edit all future occurrences from %s', async entry => {
    await edit('all_future', entry);
    const topic = screen.getByPlaceholderText('cal.topicPlaceholder');
    fireEvent.change(topic, { target: { value: 'Algebra' } });
    fireEvent.click(screen.getByText('cal.saveEdit'));
    await waitFor(() => expect(state.writes).toHaveLength(3));
    expect(state.rows.every(row => row.topic === 'Algebra')).toBe(true);
    expect(window.alert).not.toHaveBeenCalled();
  });

  it('leaves future occurrences untouched when the tutor chooses this lesson only', async () => {
    await edit('single');
    fireEvent.change(screen.getByPlaceholderText('cal.topicPlaceholder'), { target: { value: 'Algebra' } });
    fireEvent.click(screen.getByText('cal.saveEdit'));
    await waitFor(() => expect(state.writes).toHaveLength(1));
    expect(state.rows.map(row => row.topic)).toEqual(['Algebra', 'Math', 'Math']);
  });

  it('keeps all original dates visible while a metadata-only edit refreshes in the background', async () => {
    state.deferRefresh = true;
    const dates = state.rows.map(row => row.start_time);
    await edit('all_future');
    fireEvent.change(screen.getByPlaceholderText('cal.topicPlaceholder'), { target: { value: 'Algebra' } });
    fireEvent.click(screen.getByText('cal.saveEdit'));
    await waitFor(() => expect(screen.queryByText('cal.saveEdit')).toBeNull());
    expect(dates.map((_, i) => screen.getByTestId(`date-lesson-${i}`).textContent)).toEqual(dates);
  });

  it('includes earlier upcoming lessons when editing from the middle of the series', async () => {
    await edit('all_future', 'cal.editBtn', 'lesson-1');
    fireEvent.change(screen.getByPlaceholderText('cal.topicPlaceholder'), { target: { value: 'Algebra' } });
    fireEvent.click(screen.getByText('cal.saveEdit'));
    await waitFor(() => expect(state.rows.every(row => row.topic === 'Algebra')).toBe(true));
  });
});
