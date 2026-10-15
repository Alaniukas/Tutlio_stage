import { describe, expect, it } from 'vitest';
import {
  appendPayerAdminFeeInvoiceLine,
  orgPutsPayerAdminFeeOnInvoice,
  PAYER_ADMIN_FEE_LINE,
  stripePayerAdminFeeLineItem,
  stripePayerAdminFeeProductData,
} from '../../src/lib/invoiceAdminFee';
import {
  MANO_KOREPETITORIUS_ORG_ID,
  orgFeeProfile,
  PRO_KLASE_ORG_ID,
  PRO_KLASE_QA_ORG_ID,
} from '../../src/lib/marketMoney';

describe('Pro Klasė payer admin fee on invoices and Checkout', () => {
  const profile = orgFeeProfile(PRO_KLASE_ORG_ID);

  it('applies only to Pro Klasė orgs', () => {
    expect(orgPutsPayerAdminFeeOnInvoice(PRO_KLASE_ORG_ID)).toBe(true);
    expect(orgPutsPayerAdminFeeOnInvoice(PRO_KLASE_QA_ORG_ID)).toBe(true);
    expect(orgPutsPayerAdminFeeOnInvoice(MANO_KOREPETITORIUS_ORG_ID)).toBe(false);
    expect(orgPutsPayerAdminFeeOnInvoice(null)).toBe(false);
  });

  it('names the Stripe line Administravimo mokestis for Pro Klasė, without Tutlio as the seller', () => {
    expect(stripePayerAdminFeeProductData(PRO_KLASE_ORG_ID)).toEqual({ name: PAYER_ADMIN_FEE_LINE });
    expect(stripePayerAdminFeeLineItem(PRO_KLASE_ORG_ID, 'eur', 45)).toEqual({
      quantity: 1,
      price_data: {
        currency: 'eur',
        unit_amount: 45,
        product_data: { name: PAYER_ADMIN_FEE_LINE },
      },
    });
    expect(stripePayerAdminFeeProductData(MANO_KOREPETITORIUS_ORG_ID)).toEqual({
      name: 'Platformos administravimo mokestis',
      description: 'Paslaugos teikėjas: MB „Tutlio“',
    });
  });

  it('appends the same fee to the S.F. as Checkout charges for a 10 EUR lesson', () => {
    const lines = [{
      description: 'Matematika',
      quantity: 1,
      unitPrice: 10,
      totalPrice: 10,
      sessionIds: ['s1'],
    }];
    const result = appendPayerAdminFeeInvoiceLine(lines, 10, PRO_KLASE_ORG_ID, 'default', profile);
    expect(result.adminFee).toBeGreaterThan(0);
    expect(result.totalAmount).toBeCloseTo(10 + result.adminFee, 2);
    expect(result.lineItems.at(-1)).toMatchObject({
      description: PAYER_ADMIN_FEE_LINE,
      quantity: 1,
      unitPrice: result.adminFee,
      totalPrice: result.adminFee,
    });
  });

  it('does not change Mano Korepetitorius invoice lines', () => {
    const lines = [{
      description: 'Matematika',
      quantity: 1,
      unitPrice: 10,
      totalPrice: 10,
      sessionIds: ['s1'],
    }];
    const result = appendPayerAdminFeeInvoiceLine(lines, 10, MANO_KOREPETITORIUS_ORG_ID, 'default', null);
    expect(result).toEqual({ lineItems: lines, totalAmount: 10, adminFee: 0 });
  });
});
