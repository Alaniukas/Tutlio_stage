import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import StudentSessions from '@/pages/StudentSessions';
import { invalidateCache } from '@/lib/dataCache';

const state = vi.hoisted(() => ({ model: null as string | null, monthly: true }));

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
vi.mock('@/components/SessionFiles', () => ({ default: () => null }));
vi.mock('@/components/JoinLessonButton', () => ({ default: () => null }));
vi.mock('@/components/WhiteboardButton', () => ({ default: () => null }));
vi.mock('@/components/StatusBadge', () => ({ default: () => null }));

vi.mock('@/lib/supabase', () => {
  const from = (table: string) => {
    const rows = () => {
      if (table === 'profiles') return [{ id: 'tutor-1', organization_id: 'org-1', enable_per_lesson: true }];
      if (table === 'organizations') return [{ id: 'org-1', enable_per_lesson: true, enable_monthly_billing: state.monthly, features: {} }];
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
      then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: rows(), error: null }).then(resolve),
    };
    return query;
  };
  const channel = { on: () => channel, subscribe: () => channel };
  return { supabase: {
    from,
    rpc: async () => ({ data: [{
      id: 'student-1', full_name: 'Ada', email: 'student@example.com',
      payment_payer: 'student', payment_model: state.model,
      tutor_id: 'tutor-1', tutor_organization_entity_type: 'company',
    }], error: null }),
    channel: () => channel, removeChannel: () => {},
  } };
});

beforeEach(() => { invalidateCache(); localStorage.clear(); state.model = null; state.monthly = true; });
afterEach(() => { cleanup(); invalidateCache(); });

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
