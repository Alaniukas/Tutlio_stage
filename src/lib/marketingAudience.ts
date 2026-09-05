export type MarketingAudience = 'solo' | 'agency';

const STORAGE_KEY = 'tutlio-marketing-audience';

/**
 * Each audience has its own landing URL so the B2C and B2B pitches never
 * share a page: `/` speaks to tutoring agencies and schools, `/for-tutors`
 * to solo tutors. Paths are locale-less; wrap with buildLocalizedPath().
 */
export const SOLO_LANDING_PATH = '/for-tutors';
export const AGENCY_LANDING_PATH = '/';

export function landingPathForAudience(audience: MarketingAudience | 'solo' | 'biz'): string {
  return audience === 'solo' ? SOLO_LANDING_PATH : AGENCY_LANDING_PATH;
}

export function marketingAudienceFromLanding(audience: 'solo' | 'biz'): MarketingAudience {
  return audience === 'biz' ? 'agency' : 'solo';
}

export function resolveLandingAudience(
  preferredAudience?: 'solo' | 'biz',
): 'solo' | 'biz' {
  if (preferredAudience) return preferredAudience;
  return readStoredMarketingAudience() === 'agency' ? 'biz' : 'solo';
}

export function readStoredMarketingAudience(): MarketingAudience | null {
  if (typeof window === 'undefined') return null;

  try {
    const stored = window.sessionStorage.getItem(STORAGE_KEY);
    return stored === 'solo' || stored === 'agency' ? stored : null;
  } catch {
    return null;
  }
}

export function storeMarketingAudience(audience: MarketingAudience) {
  if (typeof window === 'undefined') return;

  try {
    window.sessionStorage.setItem(STORAGE_KEY, audience);
  } catch {
    // The selected audience is a convenience only; navigation still works
    // when storage is disabled because landing CTAs also include a query param.
  }
}

export function resolveMarketingAudience(value?: string | null): MarketingAudience {
  if (value === 'agency' || value === 'biz') return 'agency';
  if (value === 'solo') return 'solo';
  return readStoredMarketingAudience() ?? 'solo';
}
