import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Readable } from 'node:stream';
const state = vi.hoisted(() => ({ event: null as any, update: vi.fn(), writeError: false, retrieve: vi.fn(), list: vi.fn() }));
vi.mock('stripe', () => ({ default: class {
  webhooks = { constructEvent: () => state.event };
  subscriptions = { retrieve: state.retrieve, list: state.list };
} }));
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ from: () => {
  const chain: any = {
    select: () => chain, eq: () => chain,
    maybeSingle: async () => ({ data: { id: 'profile' } }),
    update: (value: any) => { state.update(value); return chain; },
    throwOnError: async () => { if (state.writeError) throw new Error('Database unavailable'); return { error: null }; },
  };
  return chain;
} }) }));
vi.mock('../../api/_lib/enterpriseLicenseWebhook', () => ({
  syncEnterpriseLicenseSubscription: async () => false,
  handleEnterpriseLicenseSubscriptionDeleted: async () => false,
  handleEnterpriseCheckoutCompleted: vi.fn(),
}));
import handler from '../../api/stripe-webhook';

const period = 1790000000;
function subscription(root = false) {
  return { id: 'sub', customer: 'cus', status: 'active', metadata: {},
    ...(root ? { current_period_end: period } : {}),
    items: { data: [{ ...(root ? {} : { current_period_end: period }), price: { id: 'price', recurring: { interval: 'month' } } }] },
  };
}
async function request(type: string, object: any) {
  state.event = { type, data: { object } };
  const req = Object.assign(Readable.from(['{}']), { method: 'POST', headers: { 'stripe-signature': 'test' } });
  const res: any = { statusCode: 200, status(code: number) { this.statusCode = code; return this; }, json: vi.fn(), send: vi.fn() };
  await handler(req as any, res);
  return res;
}
beforeEach(() => {
  vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_fixture'); vi.stubEnv('STRIPE_WEBHOOK_SECRET', 'whsec_fixture');
  vi.stubEnv('SUPABASE_URL', 'https://fixture.supabase.co'); vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'fixture');
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Unexpected external request'); }));
  state.update.mockReset(); state.writeError = false;
  state.retrieve.mockReset().mockResolvedValue(subscription());
  state.list.mockReset().mockResolvedValue({ data: [] });
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe('Stripe subscription webhook period regression', () => {
  it.each(['customer.subscription.created', 'customer.subscription.updated', 'customer.subscription.deleted'])('%s accepts item-level periods', async (type) => {
    expect((await request(type, subscription())).statusCode).toBe(200);
    expect(state.update).toHaveBeenCalledWith(expect.objectContaining({ subscription_current_period_end: new Date(period * 1000).toISOString() }));
  });
  it('still processes older signed event shapes', async () => {
    expect((await request('customer.subscription.updated', subscription(true))).statusCode).toBe(200);
    expect(state.update).toHaveBeenCalledTimes(1);
  });
  it('uses the replacement active subscription after deletion', async () => {
    state.list.mockResolvedValue({ data: [{ ...subscription(), id: 'replacement' }] });
    expect((await request('customer.subscription.deleted', subscription())).statusCode).toBe(200);
    expect(state.update).toHaveBeenCalledWith(expect.objectContaining({ stripe_subscription_id: 'replacement' }));
  });
  it('handles subscription checkout completion', async () => {
    const res = await request('checkout.session.completed', { mode: 'subscription', customer: 'cus', subscription: 'sub', customer_email: 'fixture@example.com', metadata: {} });
    expect(res.statusCode).toBe(200);
    expect(state.update).toHaveBeenCalledWith(expect.objectContaining({ subscription_current_period_end: new Date(period * 1000).toISOString() }));
  });
  it('does not acknowledge invalid dates or database failures as successful delivery', async () => {
    const invalid = subscription();
    delete (invalid.items.data[0] as any).current_period_end;
    expect((await request('customer.subscription.updated', invalid)).statusCode).toBe(500);
    expect(state.update).not.toHaveBeenCalled();
    state.writeError = true;
    expect((await request('customer.subscription.updated', subscription())).statusCode).toBe(500);
  });
});
