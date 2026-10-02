import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const state = vi.hoisted(() => ({
  paymentModel: 'monthly_billing' as string | null,
  paidHistory: false,
  paymentPayer: 'student',
  pendingPackage: false,
}));

vi.mock('@/components/StudentLayout', () => ({ default: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock('@/lib/preload', () => ({
  dedupeAuthGetUser: async () => ({ id: 'user-1', email: 'student@example.com' }),
  rpcGetStudentProfilesDeduped: async () => ({ data: [{
    id: 'student-1', tutor_id: null, payment_model: state.paymentModel,
    payment_payer: state.paymentPayer, email: 'student@example.com', payer_email: 'parent@example.com',
  }] }),
}));
vi.mock('@/lib/i18n', () => ({ useTranslation: () => ({ t: (key: string) => key, dateFnsLocale: undefined }) }));
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from(table: string) {
      let paid = false;
      const query: any = {
        select: () => query,
        in: () => query,
        order: () => query,
        not: () => query,
        gt: () => query,
        eq(column: string, value: unknown) {
          if (column === 'paid') paid = value === true;
          return query;
        },
        limit: async () => {
          if (table === 'lesson_packages') return { data: state.pendingPackage ? [{
            id: 'shared-offer', total_lessons: 4, total_price: 132, paid: false,
            payment_status: 'pending', payment_method: 'stripe', subject: { name: 'Paketas' },
          }] : [] };
          if (table === 'invoices') return { data: [] };
          if (table === 'profiles') return { data: [{
            id: 'tutor-1', organization_id: 'org-1',
            enable_per_lesson: true, enable_monthly_billing: false,
          }] };
          if (table === 'organizations') return { data: [{
            id: 'org-1', enable_per_lesson: true, enable_monthly_billing: true,
          }] };
          if (table === 'sessions' && paid) return { data: state.paidHistory ? [{
            id: 'paid-session', student_id: 'student-1', tutor_id: 'tutor-1',
            start_time: '2026-08-01T16:00:00Z', price: 25, paid: true,
            topic: 'Ankstesnė pamoka', subject: { name: 'Ankstesnė pamoka', is_trial: false },
          }] : [] };
          if (table === 'sessions') return { data: [{
            id: 'session-1', student_id: 'student-1', tutor_id: 'tutor-1',
            start_time: '2030-10-01T16:00:00Z', price: 25, paid: false,
            topic: 'Matematika', subject: { name: 'Matematika', is_trial: false },
          }] };
          throw new Error(`Unexpected table ${table}`);
        },
        then(resolve: (value: unknown) => void) {
          return query.limit().then(resolve);
        },
      };
      return query;
    },
  },
}));

import StudentPayments from '../../src/pages/StudentPayments';

describe('student payment page and monthly lessons', () => {
  beforeEach(() => {
    state.paymentModel = 'monthly_billing';
    state.paidHistory = false;
    state.paymentPayer = 'student';
    state.pendingPackage = false;
  });

  it.each(['student', 'parent'])('shows the package pay link in the student account when the designated payer is %s', async (payer) => {
    state.paymentPayer = payer;
    state.pendingPackage = true;
    render(<MemoryRouter><StudentPayments /></MemoryRouter>);
    const link = await screen.findByRole('link', { name: 'stuPay.payNow' });
    expect(link.getAttribute('href')).toContain('/api/pay-package?package=shared-offer');
  });

  it('does not offer a future monthly lesson for immediate payment', async () => {
    render(<MemoryRouter><StudentPayments /></MemoryRouter>);
    await screen.findByText('stuPay.pendingTitle');
    await waitFor(() => expect(screen.queryByText('stuPay.pendingLessonsTitle')).toBeNull());
    expect(screen.queryByText('stuPay.payNow')).toBeNull();
  });

  it('retains the pay action for an explicitly per-lesson student', async () => {
    state.paymentModel = 'per_lesson';
    render(<MemoryRouter><StudentPayments /></MemoryRouter>);
    expect(await screen.findByText('stuPay.pendingLessonsTitle')).toBeTruthy();
    expect(screen.getByText('stuPay.payNow')).toBeTruthy();
  });

  it('keeps paid lesson history after switching from per-lesson to monthly billing', async () => {
    state.paidHistory = true;
    render(<MemoryRouter><StudentPayments /></MemoryRouter>);
    expect(await screen.findByText('Ankstesnė pamoka')).toBeTruthy();
    expect(screen.getByText('stuPay.paidBadge')).toBeTruthy();
    expect(screen.queryByText('stuPay.payNow')).toBeNull();
  });
});
