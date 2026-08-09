import { beforeEach, describe, expect, it } from 'vitest';
import {
  marketingAudienceFromLanding,
  readStoredMarketingAudience,
  resolveLandingAudience,
  resolveMarketingAudience,
  storeMarketingAudience,
} from '@/lib/marketingAudience';

describe('marketing audience selection', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  it('maps the landing labels to pricing audiences', () => {
    expect(marketingAudienceFromLanding('solo')).toBe('solo');
    expect(marketingAudienceFromLanding('biz')).toBe('agency');
  });

  it('lets the URL selection take precedence over stored state', () => {
    storeMarketingAudience('agency');
    expect(resolveMarketingAudience('solo')).toBe('solo');
    expect(resolveMarketingAudience('agency')).toBe('agency');
  });

  it('uses the stored audience when pricing is opened without a query', () => {
    storeMarketingAudience('agency');
    expect(readStoredMarketingAudience()).toBe('agency');
    expect(resolveMarketingAudience()).toBe('agency');
  });

  it('defaults a new visitor to solo pricing', () => {
    expect(resolveMarketingAudience()).toBe('solo');
  });

  it('opens the school landing in agency mode even after a solo visit', () => {
    storeMarketingAudience('solo');
    expect(resolveLandingAudience('biz')).toBe('biz');
  });

  it('restores the remembered audience on the default landing', () => {
    storeMarketingAudience('agency');
    expect(resolveLandingAudience()).toBe('biz');
  });
});
