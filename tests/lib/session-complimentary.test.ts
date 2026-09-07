import { describe, expect, it } from 'vitest';
import { isComplimentarySession, sessionClientRevenueEur } from '../../src/lib/sessionComplimentary';

describe('sessionComplimentary', () => {
  it('treats missing flag as not complimentary', () => {
    expect(isComplimentarySession({})).toBe(false);
    expect(isComplimentarySession({ is_complimentary: false })).toBe(false);
    expect(isComplimentarySession(null)).toBe(false);
  });

  it('zeros client revenue for complimentary lessons even if price is set', () => {
    expect(sessionClientRevenueEur({ price: 25, is_complimentary: true })).toBe(0);
    expect(sessionClientRevenueEur({ price: 25, is_complimentary: false })).toBe(25);
  });
});
