/**
 * tutlio.lt enterprise license tiers in EUR — volume bands for the pricing
 * slider and npm run stripe:setup-enterprise (STRIPE_ENTERPRISE_PRICE_ID).
 *
 * Volume: all licenses bill at the tier matching total quantity (e.g. 50 → €7 each).
 * Admin fee is on every Stripe tier so it applies regardless of quantity band.
 */
export const ENTERPRISE_EUR = {
  adminFeeMonthly: 49,
  tiersMode: 'volume' as const,
  /** Self-serve checkout cap; above this → contact sales. */
  maxSelfServe: 60,
  tiers: [
    { upTo: 10, unit: 10 },
    { upTo: 20, unit: 9 },
    { upTo: 30, unit: 8 },
    { upTo: 40, unit: 7.5 },
    { upTo: 50, unit: 7 },
    { upTo: 60, unit: 6 },
  ],
} as const;

export function enterpriseEurTierDefs() {
  const { adminFeeMonthly, tiers } = ENTERPRISE_EUR;
  const adminCents = Math.round(adminFeeMonthly * 100);
  return tiers.map((tier) => ({
    upTo: tier.upTo,
    unitAmountCents: Math.round(tier.unit * 100),
    flatAmountCents: adminCents,
  }));
}

/** Stripe tiered prices require a final catch-all band (up_to: inf). Checkout caps at maxSelfServe. */
export function enterpriseEurStripeTiers() {
  const defs = enterpriseEurTierDefs();
  const last = defs[defs.length - 1]!;
  return [
    ...defs.map((tier) => ({
      up_to: tier.upTo as number,
      unit_amount: tier.unitAmountCents,
      flat_amount: tier.flatAmountCents,
    })),
    {
      up_to: 'inf' as const,
      unit_amount: last.unitAmountCents,
      flat_amount: 0,
    },
  ];
}
