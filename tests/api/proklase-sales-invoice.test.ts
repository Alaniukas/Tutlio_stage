// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { tryIssueProKlasePaidSourceInvoice } from '../../api/_lib/proKlaseSalesInvoice';
import { tryIssueSalesInvoiceForStripePackage } from '../../api/_lib/issuePackageSalesInvoice';

const org = '3422031d-6e21-424d-980b-35a9c6d7b8f1';
const payment = { organizationId: org, sourceType: 'session' as const, sourceId: 'paid-lesson', checkoutId: 'cs_paid', baseAmountEur: 29 };
afterEach(() => vi.restoreAllMocks());

describe('Pro Klasė invoice integration', () => {
  it('sends verified payment evidence to the atomic invoice RPC', async () => {
    const rpc = vi.fn(async () => ({ data: 'invoice', error: null }));
    expect(await tryIssueProKlasePaidSourceInvoice({ rpc } as any, payment)).toBe('invoice');
    expect(rpc).toHaveBeenCalledWith('issue_proklase_paid_source_invoice', {
      p_source_type: 'session', p_source_id: 'paid-lesson', p_checkout_id: 'cs_paid', p_base_amount: 29,
    });
  });

  it('keeps other organizations and invalid payment inputs out of this invoice flow', async () => {
    const rpc = vi.fn();
    for (const input of [{ ...payment, organizationId: 'other-org' }, { ...payment, checkoutId: null },
      { ...payment, baseAmountEur: 0 }, { ...payment, baseAmountEur: Number.NaN }]) {
      expect(await tryIssueProKlasePaidSourceInvoice({ rpc } as any, input)).toBeNull();
    }
    expect(rpc).not.toHaveBeenCalled();
  });

  it('logs an invoice failure without failing an already paid checkout', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const rpc = vi.fn(async () => ({ data: null, error: { message: 'Temporary database failure' } }));
    expect(await tryIssueProKlasePaidSourceInvoice({ rpc } as any, payment)).toBeNull();
    expect(log).toHaveBeenCalled();
  });

  it('routes the legacy package webhook helper through the same locked invoice operation', async () => {
    const rpc = vi.fn(async () => ({ data: 'invoice', error: null }));
    const query = { select: vi.fn(), eq: vi.fn(), single: vi.fn(async () => ({ data: { id: 'tutor', organization_id: org } })) };
    query.select.mockReturnValue(query); query.eq.mockReturnValue(query);
    const from = vi.fn(() => query);
    await tryIssueSalesInvoiceForStripePackage({ from, rpc } as any, {
      id: 'paid-package', tutor_id: 'tutor', total_price: 60, total_lessons: 2,
      payment_method: 'stripe', stripe_checkout_session_id: 'cs_paid',
    });
    expect(from).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('issue_proklase_paid_source_invoice', {
      p_source_type: 'package', p_source_id: 'paid-package', p_checkout_id: 'cs_paid', p_base_amount: 60,
    });
  });
});
