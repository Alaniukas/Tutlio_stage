/**
 * tutlio.pl enterprise license tiers in PLN — mirrors EUR volume bands
 * (€49 admin + €10→€6/license) at ~4.3× subscription FX.
 */
export const ENTERPRISE_PLN = {
  adminFeeMonthly: 210,
  tiersMode: 'volume' as const,
  maxSelfServe: 60,
  tiers: [
    { upTo: 10, unit: 43 },
    { upTo: 20, unit: 39 },
    { upTo: 30, unit: 34 },
    { upTo: 40, unit: 32 },
    { upTo: 50, unit: 30 },
    { upTo: 60, unit: 26 },
  ],
} as const;

export function enterprisePlnTierDefs() {
  const { adminFeeMonthly, tiers } = ENTERPRISE_PLN;
  const adminCents = Math.round(adminFeeMonthly * 100);
  return tiers.map((tier) => ({
    upTo: tier.upTo,
    unitAmountCents: Math.round(tier.unit * 100),
    flatAmountCents: adminCents,
  }));
}

/** Stripe tiered prices require a final catch-all band (up_to: inf). Checkout caps at maxSelfServe. */
export function enterprisePlnStripeTiers() {
  const defs = enterprisePlnTierDefs();
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
