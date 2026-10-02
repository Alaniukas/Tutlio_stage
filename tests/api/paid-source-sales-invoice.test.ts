// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { issuePaidSourceSalesInvoice } from '../../api/_lib/paidSourceSalesInvoice';
import { checkoutChargeCurrency } from '../../api/_lib/marketMoney';

const payment = { sourceType: 'session' as const, sourceId: 'paid-lesson',
  checkoutId: 'cs_paid', baseAmount: 29, currency: 'eur' as const };
afterEach(() => vi.restoreAllMocks());

describe('shared verified payment invoicing', () => {
  it('sends payment evidence without trusting a caller-provided organization', async () => {
    const rpc = vi.fn(async () => ({ data: 'invoice', error: null }));
    expect(await issuePaidSourceSalesInvoice({ rpc } as any, payment)).toBe('invoice');
    expect(rpc).toHaveBeenCalledWith('issue_paid_source_sales_invoice', {
      p_source_type: 'session', p_source_id: 'paid-lesson', p_checkout_id: 'cs_paid', p_base_amount: 29, p_currency: 'EUR',
    });
  });

  it('does not issue an invoice without a checkout or a positive finite charge', async () => {
    const rpc = vi.fn();
    for (const input of [{ ...payment, checkoutId: null }, { ...payment, baseAmount: 0 },
      { ...payment, baseAmount: Number.NaN }]) {
      expect(await issuePaidSourceSalesInvoice({ rpc } as any, input)).toBeNull();
    }
    expect(rpc).not.toHaveBeenCalled();
  });

  it('keeps browser confirmation successful but makes database errors retryable by Stripe', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const rpc = vi.fn(async () => ({ data: null, error: { message: 'Temporary database failure' } }));
    expect(await issuePaidSourceSalesInvoice({ rpc } as any, payment)).toBeNull();
    await expect(issuePaidSourceSalesInvoice({ rpc } as any, payment, { retryOnError: true }))
      .rejects.toThrow('Temporary database failure');
  });

  it('reports incomplete invoice settings without retrying an unconfigured seller indefinitely', async () => {
    const log = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const rpc = vi.fn(async () => ({ data: null, error: { code: 'PT422', message: 'INVOICE_PROFILE_INCOMPLETE' } }));
    expect(await issuePaidSourceSalesInvoice({ rpc } as any, payment, { retryOnError: true })).toBeNull();
    expect(log).toHaveBeenCalled();
  });

  it('uses Stripe currency ahead of metadata, supports legacy checkouts and rejects unsupported charges', () => {
    expect(checkoutChargeCurrency({ currency: 'pln', metadata: { tutlio_currency: 'eur' } })).toBe('pln');
    expect(checkoutChargeCurrency({ metadata: { tutlio_currency: 'pln' } })).toBe('pln');
    expect(checkoutChargeCurrency({})).toBe('eur');
    expect(() => checkoutChargeCurrency({ currency: 'usd' })).toThrow('Unsupported lesson checkout currency');
  });
});
