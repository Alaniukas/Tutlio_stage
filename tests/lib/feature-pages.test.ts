import { describe, expect, it } from 'vitest';
import {
  FEATURE_PAGE_IDS,
  FEATURE_PAGES,
  isFeaturePageId,
} from '@/lib/featurePages';

describe('public marketing feature pages', () => {
  it('highlights the digital business card as the newest in-depth feature', () => {
    expect(FEATURE_PAGE_IDS[0]).toBe('digital-business-card');
    expect(FEATURE_PAGES['digital-business-card']).toMatchObject({
      path: '/features/digital-business-card',
      badgeKey: 'featuresIndex.newBadge',
    });
  });

  it('recognizes the digital business card route id', () => {
    expect(isFeaturePageId('digital-business-card')).toBe(true);
    expect(isFeaturePageId('not-a-feature')).toBe(false);
  });
});
