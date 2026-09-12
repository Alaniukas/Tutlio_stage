import { describe, expect, it } from 'vitest';
import pageRender from '../../api/page-render.js';
import { TUTOR_PLANS, TUTOR_PLANS_USD, eur, usd } from '../../src/lib/pricing.js';
import { SUBSCRIPTION_PLN } from '../../src/lib/subscriptionPricing.js';
import { formatPln } from '../../src/lib/formatPln.js';

function mockReq(query: Record<string, string>, host: string) {
  return { method: 'GET', query, headers: { host } } as any;
}

function mockRes() {
  const res = {
    statusCode: 0,
    body: '',
    headers: {} as Record<string, string | number>,
    setHeader(k: string, v: string | number) { res.headers[k.toLowerCase()] = v; return res; },
    status(c: number) { res.statusCode = c; return res; },
    send(b: string) { res.body = String(b); return res; },
    writeHead(c: number, h?: Record<string, string>) { res.statusCode = c; Object.assign(res.headers, h || {}); return res; },
    end() { return res; },
    json(o: unknown) { res.body = JSON.stringify(o); return res; },
    redirect(c: number, u: string) { res.statusCode = c; res.headers.location = u; return res; },
  };
  return res;
}

describe('crawler pricing follows the subscription currency of the locale', () => {
  it('quotes USD on the pricing page and in the SoftwareApplication offers for a USD locale', async () => {
    const pricing = mockRes();
    await pageRender(mockReq({ page: 'pricing', locale: 'tr' }, 'www.tutlio.com'), pricing);
    expect(pricing.statusCode).toBe(200);
    expect(pricing.body).toContain(usd(TUTOR_PLANS_USD.monthly.pricePerMonth));
    expect(pricing.body).toContain(usd(TUTOR_PLANS_USD.subscriptionOnly.pricePerMonth));
    expect(pricing.body).not.toContain(eur(TUTOR_PLANS.monthly.pricePerMonthEur));

    const landing = mockRes();
    await pageRender(mockReq({ page: 'landing', locale: 'tr' }, 'www.tutlio.com'), landing);
    expect(landing.body).toContain('"priceCurrency":"USD"');
    expect(landing.body).toContain(`"price":"${TUTOR_PLANS_USD.monthly.pricePerMonth.toFixed(2)}"`);
    expect(landing.body).not.toContain('"priceCurrency":"EUR"');
  });

  it('keeps euro-area newcomers on EUR', async () => {
    const pricing = mockRes();
    await pageRender(mockReq({ page: 'pricing', locale: 'it' }, 'www.tutlio.com'), pricing);
    expect(pricing.body).toContain(eur(TUTOR_PLANS.monthly.pricePerMonthEur));
    expect(pricing.body).not.toContain('$');

    const landing = mockRes();
    await pageRender(mockReq({ page: 'landing', locale: 'it' }, 'www.tutlio.com'), landing);
    expect(landing.body).toContain('"priceCurrency":"EUR"');
  });

  it('keeps Poland on PLN', async () => {
    const pricing = mockRes();
    await pageRender(mockReq({ page: 'pricing', locale: 'pl' }, 'www.tutlio.pl'), pricing);
    expect(pricing.body).toContain(formatPln(SUBSCRIPTION_PLN.monthly));
    expect(pricing.body).not.toContain('$');
  });
});
