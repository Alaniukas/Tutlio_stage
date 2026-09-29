import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import StudentSchedule from '@/pages/StudentSchedule';
import { invalidateCache } from '@/lib/dataCache';

const state = vi.hoisted(() => ({ orgLookupFails: false, blocked: false, insert: vi.fn() }));
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
  Calendar: ({ backgroundEvents, onSelectSlot }: {
    backgroundEvents: Array<{ start: Date }>;
    onSelectSlot: (slot: { start: Date }) => void;
  }) => <button onClick={() => onSelectSlot({ start: backgroundEvents[0].start })} disabled={!backgroundEvents.length}>Open available slot</button>,
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
      if (table === 'subjects') return [{
        id: 'subject-1', tutor_id: 'tutor-1', name: 'Mathematics',
        price: 25, duration_minutes: 60, color: '#888888', grade_min: null, grade_max: null,
      }];
      if (table === 'availability') return [{
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
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ slots: [] }) })));
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
});
