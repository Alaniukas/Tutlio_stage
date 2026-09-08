import { beforeEach, describe, expect, it, vi } from 'vitest';

const retrievePrice = vi.fn();

vi.mock('stripe', () => ({
  default: class StripeMock {
    prices = { retrieve: retrievePrice };
  },
}));

function response() {
  const result: { statusCode?: number; body?: unknown } = {};
  return {
    status(code: number) {
      result.statusCode = code;
      return this;
    },
    json(body: unknown) {
      result.body = body;
      return this;
    },
    result,
  };
}

describe('GET /api/enterprise-license-pricing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    process.env.STRIPE_SECRET_KEY = 'sk_test_123';
    process.env.STRIPE_ENTERPRISE_PRICE_ID = 'price_missing';
  });

  it('uses canonical pricing and warns once when the configured Stripe price is missing', async () => {
    retrievePrice.mockRejectedValue(Object.assign(new Error('No such price'), { code: 'resource_missing' }));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const handler = (await import('../../api/enterprise-license-pricing')).default;

    const first = response();
    await handler({ method: 'GET', headers: { host: 'www.tutlio.lt' }, query: {} } as any, first as any);
    const second = response();
    await handler({ method: 'GET', headers: { host: 'www.tutlio.lt' }, query: {} } as any, second as any);

    expect(first.result.statusCode).toBe(200);
    expect(first.result.body).toMatchObject({ currency: 'eur', tiersMode: 'volume' });
    expect(second.result.statusCode).toBe(200);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(error).not.toHaveBeenCalled();
  });

  it('keeps unexpected Stripe failures visible as errors while returning fallback pricing', async () => {
    retrievePrice.mockRejectedValue(new Error('Stripe transport failed'));
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const handler = (await import('../../api/enterprise-license-pricing')).default;
    const res = response();

    await handler({ method: 'GET', headers: { host: 'www.tutlio.lt' }, query: {} } as any, res as any);

    expect(res.result.statusCode).toBe(200);
    expect(error).toHaveBeenCalledWith('[enterprise-license-pricing] Error:', 'Stripe transport failed');
  });
});
