import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import StudentDashboard from '@/pages/StudentDashboard';
import { invalidateCache, setCache } from '@/lib/dataCache';

const state = vi.hoisted(() => ({ deferProfile: false }));
const futureLesson = {
  id: 'lesson-1', student_id: 'student-1', tutor_id: 'tutor-1',
  start_time: new Date(Date.now() + 86_400_000).toISOString(),
  end_time: new Date(Date.now() + 90_000_000).toISOString(),
  status: 'active', paid: false, price: 25, topic: 'Mathematics',
  payment_status: 'pending', subject_id: null, meeting_link: null,
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
vi.mock('@/components/JoinLessonButton', () => ({ default: () => null }));
vi.mock('@/components/WhiteboardButton', () => ({ default: () => null }));
vi.mock('@/components/StatusBadge', () => ({ default: ({ treatUnpaidAsReserved }: { treatUnpaidAsReserved?: boolean }) =>
  <span>{treatUnpaidAsReserved ? 'status.reserved' : 'status.awaitingPayment'}</span> }));
vi.mock('@/lib/supabase', () => {
  const from = (table: string) => {
    const rows = () => {
      if (table === 'profiles') return [{ id: 'tutor-1', full_name: 'Tutor', organization_id: 'org-1', enable_per_lesson: true }];
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

beforeEach(() => { invalidateCache(); localStorage.clear(); state.deferProfile = false; });
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
