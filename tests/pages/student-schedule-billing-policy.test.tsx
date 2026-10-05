import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import StudentSchedule from '@/pages/StudentSchedule';
import { invalidateCache } from '@/lib/dataCache';

const state = vi.hoisted(() => ({
  orgLookupFails: false, blocked: false, insert: vi.fn(),
  availability: null as Record<string, unknown>[] | null,
  subjects: null as Record<string, unknown>[] | null,
  occupied: [] as Record<string, unknown>[],
  busyLookupFails: false,
}));
const tomorrow = new Date();
tomorrow.setDate(tomorrow.getDate() + 1);
const availabilityDate = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`;

vi.mock('@/lib/i18n', async () => {
  const { enUS } = await import('date-fns/locale');
  const t = (key: string) => key;
  return { useTranslation: () => ({ t, tHtml: t, locale: 'en', dateFnsLocale: enUS }) };
});
vi.mock('@/contexts/UserContext', () => ({ useUser: () => ({ user: { id: 'student-user', email: 'student@example.com' } }) }));
vi.mock('@/contexts/StudentPolicyContext', () => ({ useStudentPolicy: () => ({
  resolved: true, actionsDisabled: false, rescheduleDisabled: false, bookingDisabled: false,
}) }));
vi.mock('@/hooks/useStudentPaymentBlock', () => ({ useStudentPaymentBlock: () => ({
  blocked: state.blocked, loading: false, refetch: async () => {},
}) }));
vi.mock('@/lib/studentLessonPackagesLight', () => ({
  fetchStudentActiveLessonPackagesDeduped: async () => [], fetchSubjectNamesByIds: async () => ({}),
}));
vi.mock('@/lib/preload', () => ({ rpcGetStudentProfilesDeduped: async () => ({ data: [{
  id: 'student-1', full_name: 'Ada', email: 'student@example.com', grade: null,
  tutor_id: 'tutor-1', payment_model: null, payment_payer: 'student',
  tutor_organization_entity_type: 'company',
}], error: null }) }));
vi.mock('@/components/StudentLayout', () => ({ default: ({ children }: { children: ReactNode }) => <div>{children}</div> }));
vi.mock('@/components/ParentLayout', () => ({ default: ({ children }: { children: ReactNode }) => <div>{children}</div> }));
vi.mock('@/components/SessionFiles', () => ({ default: () => null }));
vi.mock('@/components/JoinLessonButton', () => ({ default: () => null }));
vi.mock('@/components/WhiteboardButton', () => ({ default: () => null }));
vi.mock('@/components/StatusBadge', () => ({ default: () => null }));
vi.mock('react-big-calendar', () => ({
  Views: { DAY: 'day', WEEK: 'week', MONTH: 'month' },
  dateFnsLocalizer: () => ({}),
  Calendar: ({ backgroundEvents, events, onSelectSlot }: {
    backgroundEvents: Array<{ start: Date; end: Date }>;
    events: Array<{ occupied: boolean }>;
    onSelectSlot: (slot: { start: Date }) => void;
  }) => <>
    <output data-testid="free-times">{JSON.stringify(backgroundEvents.map(e => [
      `${e.start.getHours()}:${e.start.getMinutes()}`, `${e.end.getHours()}:${e.end.getMinutes()}`,
    ]))}</output>
    <output data-testid="busy-count">{events.filter(e => e.occupied).length}</output>
    <button onClick={() => onSelectSlot({ start: backgroundEvents[0].start })} disabled={!backgroundEvents.length}>Open available slot</button>
  </>,
}));
vi.mock('@/lib/supabase', () => {
  const from = (table: string) => {
    const rows = () => {
      if (table === 'profiles') return [{
        id: 'tutor-1', full_name: 'Tutor', organization_id: 'org-1',
        enable_per_lesson: true, enable_monthly_billing: false, min_booking_hours: 1,
      }];
      if (table === 'organizations') return state.orgLookupFails ? [] : [{
        id: 'org-1', entity_type: 'company', features: {},
        enable_per_lesson: false, enable_monthly_billing: true,
      }];
      if (table === 'subjects') return state.subjects ?? [{
        id: 'subject-1', tutor_id: 'tutor-1', name: 'Mathematics',
        price: 25, duration_minutes: 60, color: '#888888', grade_min: null, grade_max: null,
      }];
      if (table === 'availability') return state.availability ?? [{
        id: 'availability-1', tutor_id: 'tutor-1', day_of_week: null,
        start_time: '10:00', end_time: '12:00', is_recurring: false,
        specific_date: availabilityDate, subject_ids: [],
      }];
      return [];
    };
    const query = {
      select: () => query, eq: () => query, in: () => query,
      gte: () => query, lte: () => query, order: () => query, limit: () => query,
      insert: (value: unknown) => { state.insert(value); return query; },
      maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
      single: async () => ({ data: rows()[0] ?? null, error: null }),
      then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: rows(), error: null }).then(resolve),
    };
    return query;
  };
  return { supabase: {
    from, rpc: async () => ({ data: null, error: null }),
    auth: { getSession: async () => ({ data: { session: { access_token: 'student-token' } } }) },
  } };
});

beforeEach(() => {
  invalidateCache();
  localStorage.clear();
  state.orgLookupFails = false;
  state.blocked = false;
  state.insert.mockReset();
  state.availability = null;
  state.subjects = null;
  state.occupied = [];
  state.busyLookupFails = false;
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: !state.busyLookupFails, json: async () => ({ slots: state.occupied }) })));
});
afterEach(() => { cleanup(); invalidateCache(); vi.unstubAllGlobals(); });

async function chooseAvailableTime() {
  const openSlot = await screen.findByRole('button', { name: 'Open available slot' });
  await waitFor(() => expect(openSlot.hasAttribute('disabled')).toBe(false));
  fireEvent.click(openSlot);
  fireEvent.click(await screen.findByRole('button', { name: /Mathematics/ }));
  fireEvent.click(await screen.findByRole('button', { name: '10:00' }));
}

describe('student schedule billing policy lookup', () => {
  it('blocks booking and payment demands when the organization lookup fails', async () => {
    state.orgLookupFails = true;
    state.blocked = true;
    render(<MemoryRouter initialEntries={['/student/schedule']}><StudentSchedule /></MemoryRouter>);

    await waitFor(() => expect(screen.getByText('stuSched.calendarError')).toBeTruthy());
    expect(screen.queryByText('stuSched.mustPayTitle')).toBeNull();
    await chooseAvailableTime();
    expect(screen.getByRole('button', { name: 'stuSched.confirm' }).hasAttribute('disabled')).toBe(true);
    expect(state.insert).not.toHaveBeenCalled();
  });

  it('allows booking after a valid monthly organization policy is loaded', async () => {
    render(<MemoryRouter initialEntries={['/student/schedule']}><StudentSchedule /></MemoryRouter>);

    await chooseAvailableTime();
    expect(screen.getByRole('button', { name: 'stuSched.confirm' }).hasAttribute('disabled')).toBe(false);
    expect(screen.queryByText('stuSched.mustPayTitle')).toBeNull();
  });

  it('still shows a verified overdue monthly invoice block', async () => {
    state.blocked = true;
    render(<MemoryRouter initialEntries={['/student/schedule']}><StudentSchedule /></MemoryRouter>);

    await waitFor(() => expect(screen.getByText('stuSched.mustPayTitle')).toBeTruthy());
    expect(screen.getByRole('button', { name: 'stuSched.payBtn' })).toBeTruthy();
  });

  it('shows a date-specific free interval once when weekly and duplicate rules also exist', async () => {
    const specific = {
      id: 'specific', tutor_id: 'tutor-1', day_of_week: null, is_recurring: false,
      start_time: '10:00', end_time: '12:00', specific_date: availabilityDate,
    };
    state.availability = [
      { ...specific, id: 'weekly', is_recurring: true, specific_date: null,
        day_of_week: tomorrow.getDay(), start_time: '08:00', end_time: '22:00',
        start_date: availabilityDate, end_date: availabilityDate },
      specific,
      { ...specific, id: 'legacy-duplicate' },
    ];
    render(<MemoryRouter initialEntries={['/student/schedule']}><StudentSchedule /></MemoryRouter>);

    await waitFor(() => expect(screen.getByTestId('free-times').textContent).toBe('[["10:0","12:0"]]'));
  });

  it('shows overlapping free-time rules as one interval, including a nested legacy row', async () => {
    const specific = {
      id: 'specific', tutor_id: 'tutor-1', day_of_week: null, is_recurring: false,
      start_time: '10:00', end_time: '12:00', specific_date: availabilityDate,
    };
    state.availability = [
      specific,
      { ...specific, id: 'overlapping', start_time: '11:00', end_time: '13:00' },
      { ...specific, id: 'nested', start_time: '10:30', end_time: '11:30' },
    ];
    render(<MemoryRouter initialEntries={['/student/schedule']}><StudentSchedule /></MemoryRouter>);

    await waitFor(() => expect(screen.getByTestId('free-times').textContent).toBe('[["10:0","13:0"]]'));
  });

  it('merges overlapping free-time remainders without covering an occupied lesson', async () => {
    const specific = {
      id: 'specific', tutor_id: 'tutor-1', day_of_week: null, is_recurring: false,
      start_time: '10:00', end_time: '12:00', specific_date: availabilityDate,
    };
    state.availability = [
      specific,
      { ...specific, id: 'overlapping', start_time: '11:00', end_time: '13:00' },
    ];
    state.occupied = [{
      id: 'another-child', subject_id: 'subject-1',
      start_time: `${availabilityDate}T11:30:00`, end_time: `${availabilityDate}T12:00:00`,
    }];
    render(<MemoryRouter initialEntries={['/student/schedule']}><StudentSchedule /></MemoryRouter>);

    await waitFor(() => expect(screen.getByTestId('busy-count').textContent).toBe('1'));
    expect(screen.getByTestId('free-times').textContent).toBe('[["10:0","11:30"],["12:0","13:0"]]');
  });

  it('keeps subject boundaries when booking from a merged display interval', async () => {
    const mathematics = {
      id: 'subject-1', tutor_id: 'tutor-1', name: 'Mathematics',
      price: 25, duration_minutes: 60, color: '#888888', grade_min: null, grade_max: null,
    };
    state.subjects = [mathematics, { ...mathematics, id: 'physics', name: 'Physics' }];
    const specific = {
      id: 'math-time', tutor_id: 'tutor-1', day_of_week: null, is_recurring: false,
      start_time: '10:00', end_time: '11:00', specific_date: availabilityDate, subject_ids: ['subject-1'],
    };
    state.availability = [specific, {
      ...specific, id: 'physics-time', start_time: '11:00', end_time: '13:00', subject_ids: ['physics'],
    }];
    render(<MemoryRouter initialEntries={['/student/schedule']}><StudentSchedule /></MemoryRouter>);

    await waitFor(() => expect(screen.getByTestId('free-times').textContent).toBe('[["10:0","13:0"]]'));
    await chooseAvailableTime();
    expect(screen.queryByRole('button', { name: '11:00' })).toBeNull();
    expect(screen.queryByRole('button', { name: '12:00' })).toBeNull();
    expect(screen.getByRole('button', { name: 'stuSched.confirm' }).hasAttribute('disabled')).toBe(false);
  });

  it('blocks another child\'s lesson even when its subject is outside the grade filter', async () => {
    state.occupied = [{
      id: 'another-child', subject_id: 'subject-outside-grade', available_spots: 3,
      start_time: `${availabilityDate}T10:00:00`, end_time: `${availabilityDate}T12:00:00`,
    }];
    render(<MemoryRouter initialEntries={['/student/schedule']}><StudentSchedule /></MemoryRouter>);

    await waitFor(() => expect(screen.getByTestId('busy-count').textContent).toBe('1'));
    expect(screen.getByTestId('free-times').textContent).toBe('[]');
    expect(screen.getByRole('button', { name: 'Open available slot' }).hasAttribute('disabled')).toBe(true);
  });

  it('does not revive weekly availability when a date override excludes the child\'s subjects', async () => {
    const specific = {
      id: 'specific', tutor_id: 'tutor-1', day_of_week: null, is_recurring: false,
      start_time: '10:00', end_time: '12:00', specific_date: availabilityDate,
      subject_ids: ['subject-outside-grade'],
    };
    state.availability = [
      { ...specific, id: 'weekly', is_recurring: true, specific_date: null,
        day_of_week: tomorrow.getDay(), subject_ids: [],
        start_date: availabilityDate, end_date: availabilityDate },
      specific,
    ];
    state.occupied = [{
      id: 'evening-lesson', subject_id: 'subject-1',
      start_time: `${availabilityDate}T17:00:00`, end_time: `${availabilityDate}T18:00:00`,
    }];
    render(<MemoryRouter initialEntries={['/student/schedule']}><StudentSchedule /></MemoryRouter>);

    await waitFor(() => expect(screen.getByTestId('busy-count').textContent).toBe('1'));
    expect(screen.getByTestId('free-times').textContent).toBe('[]');
  });

  it('does not advertise free time when other children\'s bookings fail to load', async () => {
    state.busyLookupFails = true;
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<MemoryRouter initialEntries={['/student/schedule']}><StudentSchedule /></MemoryRouter>);

    await screen.findByText('stuSched.calendarError');
    expect(screen.getByTestId('free-times').textContent).toBe('[]');
    errorLog.mockRestore();
  });

  it('slices the free calendar interval around another child\'s booking', async () => {
    state.occupied = [{
      id: 'another-child', subject_id: 'subject-1',
      start_time: `${availabilityDate}T10:30:00`, end_time: `${availabilityDate}T11:30:00`,
    }];
    render(<MemoryRouter initialEntries={['/student/schedule']}><StudentSchedule /></MemoryRouter>);

    await waitFor(() => expect(screen.getByTestId('busy-count').textContent).toBe('1'));
    expect(screen.getByTestId('free-times').textContent).toBe('[["10:0","10:30"],["11:30","12:0"]]');
  });
});
