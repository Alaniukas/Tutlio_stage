/** Shared config for enterprise self-serve license billing. */

export function getEnterprisePriceId(): string | undefined {
  const id = process.env.STRIPE_ENTERPRISE_PRICE_ID?.trim();
  return id || undefined;
}

/** Self-serve bounds: counts above maxSelfServe go through sales contact instead. */
export function getEnterpriseLicenseBounds(): { minLicenses: number; maxSelfServe: number } {
  const min = Math.max(1, Math.floor(Number(process.env.ENTERPRISE_MIN_LICENSES) || 1));
  const max = Math.max(min, Math.floor(Number(process.env.ENTERPRISE_MAX_SELF_SERVE_LICENSES) || 200));
  return { minLicenses: min, maxSelfServe: max };
}
