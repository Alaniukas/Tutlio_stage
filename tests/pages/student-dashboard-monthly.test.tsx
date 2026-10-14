import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import StudentDashboard from '@/pages/StudentDashboard';
import { invalidateCache, setCache } from '@/lib/dataCache';

const state = vi.hoisted(() => ({
  deferProfile: false,
  tutorLink: null as string | null,
  studentLink: null as string | null,
  subjectLink: null as string | null,
}));
const futureLesson = {
  id: 'lesson-1', student_id: 'student-1', tutor_id: 'tutor-1',
  start_time: new Date(Date.now() + 86_400_000).toISOString(),
  end_time: new Date(Date.now() + 90_000_000).toISOString(),
  status: 'active', paid: false, price: 25, topic: 'Mathematics',
  payment_status: 'pending', subject_id: null as string | null, meeting_link: null as string | null,
};

vi.mock('@/lib/i18n', async () => {
  const { enUS } = await import('date-fns/locale');
  const t = (key: string) => key;
  return { useTranslation: () => ({ t, locale: 'en', dateFnsLocale: enUS }) };
});
vi.mock('@/contexts/UserContext', () => ({ useUser: () => ({ user: { id: 'user-1', email: 'student@example.com' } }) }));
vi.mock('@/contexts/StudentPolicyContext', () => ({ useStudentPolicy: () => ({
  resolved: true, actionsDisabled: false, rescheduleDisabled: false, bookingDisabled: false,
}) }));
vi.mock('@/hooks/useStudentPaymentBlock', () => ({ useStudentPaymentBlock: () => ({ blocked: false, loading: false }) }));
vi.mock('@/lib/studentLessonPackagesLight', () => ({
  fetchStudentActiveLessonPackagesDeduped: async () => [], fetchSubjectNamesByIds: async () => ({}),
}));
vi.mock('@/lib/preload', () => ({
  rpcGetStudentProfilesDeduped: async () => state.deferProfile
    ? new Promise(() => {})
    : { data: [{
      id: 'student-1', full_name: 'Ada', email: 'student@example.com', grade: null,
      tutor_id: 'tutor-1', tutor_full_name: 'Tutor', payment_payer: 'student', payment_model: null,
      tutor_organization_entity_type: 'company',
    }], error: null },
}));
vi.mock('@/components/StudentLayout', () => ({ default: ({ children }: { children: ReactNode }) => <div>{children}</div> }));
vi.mock('@/components/SessionFiles', () => ({ default: () => null }));
vi.mock('@/lib/joinTracking', () => ({ recordJoinClick: vi.fn() }));
vi.mock('@/components/WhiteboardButton', () => ({ default: () => null }));
vi.mock('@/components/StatusBadge', () => ({ default: ({ treatUnpaidAsReserved }: { treatUnpaidAsReserved?: boolean }) =>
  <span>{treatUnpaidAsReserved ? 'status.reserved' : 'status.awaitingPayment'}</span> }));
vi.mock('@/lib/supabase', () => {
  const from = (table: string) => {
    const rows = () => {
      if (table === 'profiles') return [{ id: 'tutor-1', full_name: 'Tutor', organization_id: 'org-1', enable_per_lesson: true, personal_meeting_link: state.tutorLink }];
      if (table === 'students') return [{ id: 'student-1', personal_meeting_link: state.studentLink }];
      if (table === 'subjects') return [{ id: 'subject-1', meeting_link: state.subjectLink }];
      if (table === 'organizations') return [{ id: 'org-1', entity_type: 'company', enable_per_lesson: true, enable_monthly_billing: true, features: {} }];
      if (table === 'sessions') return [futureLesson];
      return [];
    };
    const query = {
      select: () => query, eq: () => query, in: () => query, gte: () => query,
      order: () => query, limit: () => query,
      single: async () => ({ data: rows()[0] ?? null, error: null }),
      maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
      then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: rows(), error: null }).then(resolve),
    };
    return query;
  };
  return { supabase: { from, rpc: async () => ({ data: null, error: null }) } };
});

beforeEach(() => {
  invalidateCache(); localStorage.clear(); state.deferProfile = false;
  state.tutorLink = null; state.studentLink = null; state.subjectLink = null;
  futureLesson.meeting_link = null; futureLesson.subject_id = null;
  futureLesson.start_time = new Date(Date.now() + 86_400_000).toISOString();
  futureLesson.end_time = new Date(Date.now() + 90_000_000).toISOString();
});
afterEach(() => { cleanup(); invalidateCache(); });

describe('student dashboard monthly lesson payment status', () => {
  it('keeps a preloaded future lesson reserved while billing policy is unresolved', () => {
    state.deferProfile = true;
    setCache('student_dashboard', { student: { full_name: 'Ada', grade: null, tutor: null }, sessions: [futureLesson] });
    render(<MemoryRouter><StudentDashboard /></MemoryRouter>);
    expect(screen.getAllByText('status.reserved').length).toBeGreaterThan(0);
    expect(screen.queryByText('status.awaitingPayment')).toBeNull();
  });

  it('shows the monthly explanation for an inherited monthly student after policy load', async () => {
    render(<MemoryRouter><StudentDashboard /></MemoryRouter>);
    fireEvent.click(await screen.findByText('Mathematics'));
    await waitFor(() => expect(screen.getByText('stuSess.monthlyBillingNote')).toBeTruthy());
    expect(screen.queryByText('studentDash.stripePayBtn')).toBeNull();
  });
});

describe('student dashboard lesson joining', () => {
  it.each([
    { source: 'tutor', expected: 'https://meet.example/tutor' },
    { source: 'student', expected: 'https://meet.example/student' },
    { source: 'subject', expected: 'https://meet.example/subject' },
    { source: 'session', expected: 'https://meet.example/session' },
  ])('shows the $source link on the upcoming card and lesson dialog', async ({ source, expected }) => {
    state.tutorLink = source === 'subject' ? null : 'https://meet.example/tutor';
    if (source === 'student') state.studentLink = expected;
    if (source === 'subject') {
      state.subjectLink = expected;
      futureLesson.subject_id = 'subject-1';
    }
    if (source === 'session') futureLesson.meeting_link = expected;
    futureLesson.start_time = new Date(Date.now() + 20 * 60_000).toISOString();
    futureLesson.end_time = new Date(Date.now() + 80 * 60_000).toISOString();

    const { container } = render(<MemoryRouter><StudentDashboard /></MemoryRouter>);
    await waitFor(() => expect(container.querySelector('a[href="' + expected + '"]')).toBeTruthy());
    fireEvent.click(screen.getByText('Mathematics'));
    expect(screen.getByRole('dialog').querySelector('a[href="' + expected + '"]')).toBeTruthy();
  });

});
