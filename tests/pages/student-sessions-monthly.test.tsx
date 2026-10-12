import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import StudentSessions from '@/pages/StudentSessions';
import { invalidateCache } from '@/lib/dataCache';
import { MOKSLO_VAISIAI_ORG_ID } from '@/lib/marketMoney';

const state = vi.hoisted(() => ({
  model: null as string | null, monthly: true, orgId: 'org-1',
  features: {} as Record<string, unknown>, reschedule: vi.fn(), moveStart: '', moveEnd: '',
}));

vi.mock('@/lib/i18n', async () => {
  const { enUS } = await import('date-fns/locale');
  const t = (key: string) => key;
  return { useTranslation: () => ({ t, tHtml: t, locale: 'en', dateFnsLocale: enUS }) };
});
vi.mock('@/contexts/UserContext', () => ({ useUser: () => ({ user: { id: 'user-1', email: 'student@example.com' } }) }));
vi.mock('@/contexts/StudentPolicyContext', () => ({ useStudentPolicy: () => ({
  resolved: true, actionsDisabled: false, rescheduleDisabled: false, bookingDisabled: false,
}) }));
vi.mock('@/hooks/useMarketMoney', () => ({ useMarketMoney: () => ({
  fmt: (amount: number) => `${amount} EUR`, formatLessonCharge: (amount: number) => `${amount} EUR`, isPl: false,
}) }));
vi.mock('@/lib/studentLessonPackagesLight', () => ({
  fetchStudentActiveLessonPackagesDeduped: async () => [], fetchSubjectNamesByIds: async () => ({}),
}));
vi.mock('@/components/StudentLayout', () => ({ default: ({ children }: { children: ReactNode }) => <div>{children}</div> }));
vi.mock('@/components/ParentLayout', () => ({ default: ({ children }: { children: ReactNode }) => <div>{children}</div> }));
vi.mock('@/components/parent/ParentChildSwitcher', () => ({ default: () => null }));
vi.mock('@/lib/apiHelpers', () => ({ authHeaders: async () => ({ Authorization: 'Bearer test-token' }) }));
vi.mock('@/lib/email', () => ({ sendEmail: async () => true }));
vi.mock('@/components/SessionFiles', () => ({ default: () => null }));
vi.mock('@/components/JoinLessonButton', () => ({ default: () => null }));
vi.mock('@/components/WhiteboardButton', () => ({ default: () => null }));
vi.mock('@/components/StatusBadge', () => ({ default: () => null }));

vi.mock('@/lib/supabase', () => {
  const from = (table: string) => {
    const rows = () => {
      if (table === 'profiles') return [{ id: 'tutor-1', organization_id: state.orgId, enable_per_lesson: true, min_booking_hours: 1 }];
      if (table === 'organizations') return [{ id: state.orgId, enable_per_lesson: true, enable_monthly_billing: state.monthly, features: state.features }];
      if (table === 'parent_students') return [{ student_id: 'student-1', students: { id: 'student-1', full_name: 'Ada' } }];
      if (table === 'availability') {
        const move = new Date(state.moveStart);
        return [{ specific_date: `${move.getFullYear()}-${String(move.getMonth() + 1).padStart(2, '0')}-${String(move.getDate()).padStart(2, '0')}`,
          is_recurring: false, start_time: '10:00', end_time: '11:00', subject_ids: [] }];
      }
      if (table === 'sessions') return [{
        id: 'lesson-1', student_id: 'student-1', tutor_id: 'tutor-1',
        start_time: new Date(Date.now() + 86_400_000).toISOString(),
        end_time: new Date(Date.now() + 90_000_000).toISOString(),
        status: 'active', paid: false, price: 25, topic: 'Mathematics', payment_status: 'pending',
        subject_id: null, lesson_package_id: null,
      }];
      return [];
    };
    const query = {
      select: () => query, eq: () => query, in: () => query, gte: () => query,
      order: () => query, limit: () => query,
      maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
      single: async () => ({ data: rows()[0] ?? null, error: null }),
      then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: rows(), error: null }).then(resolve),
    };
    return query;
  };
  const channel = { on: () => channel, subscribe: () => channel };
  return { supabase: {
    from,
    rpc: async (name: string, args: unknown) => {
      if (name === 'student_reschedule_session') {
        state.reschedule(args);
        return { data: { success: true }, error: null };
      }
      return { data: [{
      id: 'student-1', full_name: 'Ada', email: 'student@example.com',
      payment_payer: 'student', payment_model: state.model,
      tutor_id: 'tutor-1', tutor_organization_entity_type: 'company',
    }], error: null };
    },
    channel: () => channel, removeChannel: () => {},
  } };
});

beforeEach(() => {
  invalidateCache(); localStorage.clear(); state.model = null; state.monthly = true;
  state.orgId = 'org-1'; state.features = {}; state.reschedule.mockReset();
  const move = new Date();
  move.setDate(move.getDate() + 2); move.setHours(10, 0, 0, 0);
  state.moveStart = move.toISOString(); state.moveEnd = new Date(move.getTime() + 3_600_000).toISOString();
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => [] })));
});
afterEach(() => { cleanup(); invalidateCache(); vi.unstubAllGlobals(); });

describe('student lesson list under monthly billing', () => {
  it('labels an inherited monthly lesson for invoice and hides pay prompts', async () => {
    render(<MemoryRouter initialEntries={['/student/sessions']}><StudentSessions /></MemoryRouter>);
    expect(await screen.findByText('stuSess.invoiceShort')).toBeTruthy();
    expect(screen.queryByText('(stuSess.paymentPendingShort)')).toBeNull();
    expect(screen.queryByText('stuSess.awaitingPayment')).toBeNull();

    fireEvent.click(screen.getByText('Mathematics'));
    await waitFor(() => expect(screen.getByText('stuSess.monthlyBillingNote')).toBeTruthy());
  });

  it('keeps per-lesson payment labels for an explicit per-lesson student', async () => {
    state.model = 'per_lesson';
    render(<MemoryRouter initialEntries={['/student/sessions']}><StudentSessions /></MemoryRouter>);
    expect(await screen.findByText('(stuSess.paymentPendingShort)')).toBeTruthy();
    expect(screen.getByText('stuSess.awaitingPayment')).toBeTruthy();
    expect(screen.queryByText('stuSess.invoiceShort')).toBeNull();
  });
});

describe('MV family lesson actions', () => {
  beforeEach(() => {
    state.orgId = MOKSLO_VAISIAI_ORG_ID;
    state.features = { disable_student_cancel: true, disable_student_reschedule: false };
  });

  it.each(['/student/sessions', '/parent/lessons?studentId=student-1'])('allows a complete reschedule and hides cancellation on %s', async (path) => {
    render(<MemoryRouter initialEntries={[path]}><StudentSessions /></MemoryRouter>);
    fireEvent.click(await screen.findByText('Mathematics'));
    const move = await screen.findByRole('button', { name: 'studentDash.reschedule' });
    expect(screen.queryByRole('button', { name: 'stuSess.cancelBtn' })).toBeNull();
    expect(screen.getByRole('link', { name: 'info@mokslovaisiai.lt' }).getAttribute('href')).toBe('mailto:info@mokslovaisiai.lt');
    fireEvent.click(move);
    fireEvent.click(await screen.findByRole('button', { name: '10:00' }));
    fireEvent.click(await screen.findByRole('button', { name: 'studentDash.reschedule' }));
    await screen.findByRole('heading', { name: 'stuSess.rescheduledSuccessTitle' });
    expect(state.reschedule).toHaveBeenCalledWith({
      p_session_id: 'lesson-1', p_new_start_time: state.moveStart, p_new_end_time: state.moveEnd,
    });
    expect(vi.mocked(fetch).mock.calls.some(([url]) => String(url).includes('/api/cancel-session'))).toBe(false);
  });

  it.each(['cancel', 'cancel_after_payment'])('ignores a stale %s navigation request', async (flow) => {
    render(<MemoryRouter initialEntries={[{ pathname: '/student/sessions', state: { sessionId: 'lesson-1', flow } }]}><StudentSessions /></MemoryRouter>);
    await screen.findByRole('button', { name: 'studentDash.reschedule' });
    expect(screen.queryByRole('button', { name: 'stuSess.cancelBtn' })).toBeNull();
    expect(screen.queryByText('stuSess.cancelSession')).toBeNull();
    expect(screen.queryByText('stuSess.confirmCancel')).toBeNull();
  });

  it('preserves cancellation for another org that only restricts rescheduling', async () => {
    state.orgId = 'another-org';
    state.features = { disable_student_reschedule: true };
    render(<MemoryRouter initialEntries={['/student/sessions']}><StudentSessions /></MemoryRouter>);
    fireEvent.click(await screen.findByText('Mathematics'));
    expect(await screen.findByRole('button', { name: 'stuSess.cancelBtn' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'studentDash.reschedule' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'info@mokslovaisiai.lt' })).toBeNull();
  });
});
