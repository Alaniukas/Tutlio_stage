import { beforeEach, describe, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({ create: vi.fn(), from: vi.fn(), pkg: {} as any }));
vi.mock('stripe', () => ({ default: class { checkout = { sessions: { create: mock.create } }; } }));
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ from: mock.from }) }));
vi.mock('../../api/_lib/public-origin.js', () => ({ publicOriginFromRequest: () => 'https://tutlio.pl' }));
import handler from '../../api/pay-package';

beforeEach(() => {
  vi.clearAllMocks();
  mock.pkg = { id: 'pool', tutor_id: 'tutor', student_id: 'student', total_lessons: 9, total_price: 243,
    pool_organization_id: '3422031d-6e21-424d-980b-35a9c6d7b8f1', paid: false, active: true, payment_status: 'pending',
    payment_method: 'stripe', expires_at: '2099-10-01T00:00Z', students: { full_name: 'Student' },
    profiles: { full_name: 'Tutor', organization_id: 'changed-org' } };
  mock.create.mockResolvedValue({ id: 'checkout', url: 'https://checkout.stripe.com/test' });
  mock.from.mockImplementation((table: string) => {
    const data = table === 'lesson_packages' ? mock.pkg : table === 'organizations'
      ? { stripe_account_id: 'org-account', stripe_onboarding_complete: true, name: 'Pro Klase', slug: 'proklase' }
      : [{ total_lessons: 4, price_per_lesson: 27, subjects: { name: 'Lithuanian' } }, { total_lessons: 5, price_per_lesson: 27, subjects: { name: 'Maths' } }];
    const q: any = { then: (resolve: any) => Promise.resolve({ data, error: null }).then(resolve) };
    for (const method of ['select','eq','single','order','update']) q[method] = vi.fn(() => q);
    return q;
  });
});
async function pay() {
  const res: any = { status: vi.fn(), send: vi.fn(), json: vi.fn(), redirect: vi.fn() };
  res.status.mockReturnValue(res);
  await handler({ method: 'GET', query: { package: 'pool' }, headers: {} } as any, res);
  return res;
}
describe('pooled package payment', () => {
  it('creates one checkout with the 4+5 EUR breakdown and one organization destination', async () => {
    await pay();
    const [checkout, options] = mock.create.mock.calls[0];
    expect(checkout.line_items.slice(0, 2).map((row: any) => [row.quantity, row.price_data.unit_amount, row.price_data.currency]))
      .toEqual([[4, 2700, 'eur'], [5, 2700, 'eur']]);
    expect(checkout.payment_intent_data.transfer_data).toEqual({ destination: 'org-account', amount: 24300 });
    expect(checkout.metadata.tutlio_package_id).toBe('pool');
    expect(options.idempotencyKey).toBe('package-checkout:pool:initial');
    const orgQuery = mock.from.mock.results[mock.from.mock.calls.findIndex(([table]) => table === 'organizations')].value;
    expect(orgQuery.eq).toHaveBeenCalledWith('id', mock.pkg.pool_organization_id);
  });
  it('uses the same provider idempotency key for concurrent initial requests', async () => {
    await Promise.all([pay(), pay()]);
    expect(mock.create.mock.calls.map(call => call[1].idempotencyKey)).toEqual(['package-checkout:pool:initial','package-checkout:pool:initial']);
  });
  it('never collects payment for an expired package', async () => {
    mock.pkg.expires_at = '2000-01-01T00:00Z';
    expect((await pay()).status).toHaveBeenCalledWith(409);
    expect(mock.create).not.toHaveBeenCalled();
  });
});
