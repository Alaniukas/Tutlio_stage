import { describe, expect, it } from 'vitest';
import {
  resolveLandingNavbarExpandedWidth,
  resolveLandingNavbarLayout,
} from '@/components/LandingNavbar';

describe('landing navbar locale-aware layout', () => {
  it('lets long translated navigation expand beyond the old 1200px cap', () => {
    expect(resolveLandingNavbarLayout(1660, 1760)).toEqual({
      availableWidth: 1728,
      pillWidth: 1660,
      compact: false,
    });
  });

  it('uses the compact navigation when translated content cannot fit', () => {
    expect(resolveLandingNavbarLayout(1660, 1440)).toEqual({
      availableWidth: 1408,
      pillWidth: 1408,
      compact: true,
    });
  });

  it('keeps the compact navigation below the desktop breakpoint', () => {
    expect(resolveLandingNavbarLayout(600, 767).compact).toBe(true);
  });

  it('keeps an expanded width available for the scroll animation', () => {
    expect(resolveLandingNavbarExpandedWidth(1080, 1408)).toBe(1200);
    expect(resolveLandingNavbarExpandedWidth(1380, 1408)).toBe(1408);
  });
});
