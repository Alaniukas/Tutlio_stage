export const DEFAULT_SUBSCRIPTION_TRIAL_DAYS = 7;
export const EXTENDED_SUBSCRIPTION_TRIAL_DAYS = 14;
export const EXTENDED_SUBSCRIPTION_TRIAL_CODE = 'TRIAL14D';

export function normalizeExtendedTrialPromoCode(code: string | null | undefined): string | undefined {
  return code?.trim().toUpperCase() === EXTENDED_SUBSCRIPTION_TRIAL_CODE
    ? EXTENDED_SUBSCRIPTION_TRIAL_CODE
    : undefined;
}

/**
 * Pricing translations predate variable trial lengths and contain the default
 * seven-day value. Keep those defaults unchanged while adapting campaign-page
 * copy. Dutch is the only supported locale that spells out the first "seven".
 */
export function withSubscriptionTrialDays(text: string, trialDays: number): string {
  if (trialDays === DEFAULT_SUBSCRIPTION_TRIAL_DAYS) return text;
  return text.replace(/\b(?:7|zeven)\b/gi, String(trialDays));
}
