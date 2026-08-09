export type MarketingAudience = 'solo' | 'agency';

const STORAGE_KEY = 'tutlio-marketing-audience';

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
