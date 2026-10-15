import type { TutlioMarket } from './market.js';
import {
  isProKlaseOrg,
  paymentCheckoutBreakdownCents,
  type OrgFeeProfile,
} from './marketMoney.js';
import type { OrgPayerFeeSplit } from './orgPayerFeeSplit.js';

/** Invoice / Checkout line that matches the amount already due on the S.F. */
export const PAYER_ADMIN_FEE_LINE = 'Administravimo mokestis';

export const LEGACY_PLATFORM_FEE_LINE = 'Platformos administravimo mokestis';
export const LEGACY_PLATFORM_FEE_DESCRIPTION = 'Paslaugos teikėjas: MB „Tutlio“';

/** Pro Klasė customer invoices include the payer fee so Checkout can equal the S.F. */
export function orgPutsPayerAdminFeeOnInvoice(orgId?: string | null): boolean {
  return isProKlaseOrg(orgId);
}

export function stripePayerAdminFeeProductData(orgId?: string | null): {
  name: string;
  description?: string;
} {
  if (orgPutsPayerAdminFeeOnInvoice(orgId)) {
    return { name: PAYER_ADMIN_FEE_LINE };
  }
  return { name: LEGACY_PLATFORM_FEE_LINE, description: LEGACY_PLATFORM_FEE_DESCRIPTION };
}

export function stripePayerAdminFeeLineItem(
  orgId: string | null | undefined,
  currency: string,
  feesCents: number,
): {
  quantity: number;
  price_data: {
    currency: string;
    unit_amount: number;
    product_data: { name: string; description?: string };
  };
} {
  const product = stripePayerAdminFeeProductData(orgId);
  return {
    quantity: 1,
    price_data: {
      currency,
      unit_amount: feesCents,
      product_data: product.description
        ? { name: product.name, description: product.description }
        : { name: product.name },
    },
  };
}

export function payerAdminFeeEur(
  baseAmount: number,
  market: TutlioMarket = 'default',
  feeProfile?: OrgFeeProfile | null,
  feeSplit?: OrgPayerFeeSplit | null,
): number {
  if (!(baseAmount > 0)) return 0;
  return paymentCheckoutBreakdownCents(baseAmount, market, feeProfile, feeSplit).feesCents / 100;
}

type InvoiceLine = {
  description: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  sessionIds: string[];
};

export function appendPayerAdminFeeInvoiceLine<T extends InvoiceLine>(
  lineItems: T[],
  baseTotal: number,
  orgId: string | null | undefined,
  market: TutlioMarket = 'default',
  feeProfile?: OrgFeeProfile | null,
  feeSplit?: OrgPayerFeeSplit | null,
): { lineItems: T[]; totalAmount: number; adminFee: number } {
  if (!orgPutsPayerAdminFeeOnInvoice(orgId)) {
    return { lineItems, totalAmount: baseTotal, adminFee: 0 };
  }
  const adminFee = payerAdminFeeEur(baseTotal, market, feeProfile, feeSplit);
  if (adminFee <= 0) return { lineItems, totalAmount: baseTotal, adminFee: 0 };
  return {
    lineItems: [
      ...lineItems,
      {
        description: PAYER_ADMIN_FEE_LINE,
        quantity: 1,
        unitPrice: adminFee,
        totalPrice: adminFee,
        sessionIds: [],
      } as T,
    ],
    totalAmount: Math.round((baseTotal + adminFee) * 100) / 100,
    adminFee,
  };
}
