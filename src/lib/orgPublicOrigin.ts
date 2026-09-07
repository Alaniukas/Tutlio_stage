/**
 * Canonical public origin for an organization's locale — invite links must
 * land on the org's market domain (Pro Klasė → tutlio.lt) no matter which
 * domain the admin happens to be browsing. Keep in sync with middleware.ts
 * CANONICAL_ORIGINS.
 */
export function orgCanonicalOrigin(preferredLocale: string | null | undefined): string | null {
  const locale = (preferredLocale || '').trim().toLowerCase();
  if (locale === 'lt') return 'https://www.tutlio.lt';
  if (locale === 'pl') return 'https://www.tutlio.pl';
  if (locale === 'en') return 'https://www.tutlio.com';
  return null; // unknown / unset — caller falls back to window.location.origin
}
