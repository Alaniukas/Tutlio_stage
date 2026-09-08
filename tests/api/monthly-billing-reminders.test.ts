import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ enabled: false, model: null as string | null, orgError: null as any }));
const fetchMock = vi.hoisted(() => vi.fn());
vi.mock('../../api/_lib/cronAuth.js', () => ({ requireCronAuth: () => true }));
vi.mock('../../api/_lib/reminderOptOut.js', () => ({ isReminderOptedOut: async () => false }));
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ from: (table: string) => {
    const session = {
      id: 'lesson', start_time: new Date(Date.now() + 24.25 * 3600000).toISOString(),
      end_time: new Date(Date.now() - 3600000).toISOString(), price: 30,
      tutor: { organization_id: 'org', enable_per_lesson: true, payment_timing: 'after_lesson' },
      student: { payment_model: state.model, email: 'test@example.com' },
    };
    const result = table === 'sessions' ? { data: [session], error: null }
      : { data: [{ id: 'org', enable_per_lesson: state.enabled, entity_type: 'company' }], error: state.orgError };
    const chain: any = { then: (resolve: any) => Promise.resolve(result).then(resolve) };
    for (const method of ['select', 'eq', 'is', 'gte', 'lte', 'lt', 'or', 'limit', 'in', 'update']) chain[method] = () => chain;
    return chain;
  } }),
}));

describe.each(['payment-deadline-warnings', 'payment-after-lesson-reminders'])('%s monthly billing', (endpoint) => {
  beforeEach(() => {
    state.enabled = false; state.model = null; state.orgError = null;
    fetchMock.mockReset(); vi.stubGlobal('fetch', fetchMock);
  });

  it.each([null, 'monthly_billing', 'prepaid_packages'])('does not send or mark a reminder for %s', async (model) => {
    state.model = model;
    const handler = endpoint === 'payment-deadline-warnings'
      ? (await import('../../api/payment-deadline-warnings')).default
      : (await import('../../api/payment-after-lesson-reminders')).default;
    const res: any = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    await handler({ method: 'GET', headers: {} } as any, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ skipped: 1 }));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('stops when organization settings cannot be read', async () => {
    state.orgError = { message: 'Unavailable' };
    const handler = endpoint === 'payment-deadline-warnings'
      ? (await import('../../api/payment-deadline-warnings')).default
      : (await import('../../api/payment-after-lesson-reminders')).default;
    const res: any = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    await handler({ method: 'GET', headers: {} } as any, res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
