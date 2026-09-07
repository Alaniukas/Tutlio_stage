import { describe, expect, it } from 'vitest';
import { canonicalHostRedirectUrl } from '../../src/lib/market';

describe('canonicalHostRedirectUrl (apex → www)', () => {
  it('redirects bare apex tutlio domains to their www host, preserving path/query/hash', () => {
    expect(canonicalHostRedirectUrl('https://tutlio.pl/admin')).toBe('https://www.tutlio.pl/admin');
    expect(canonicalHostRedirectUrl('https://tutlio.lt/pricing?ref=ads')).toBe('https://www.tutlio.lt/pricing?ref=ads');
    expect(canonicalHostRedirectUrl('https://tutlio.com/blog/post#section')).toBe('https://www.tutlio.com/blog/post#section');
  });

  it('normalizes an uppercase apex host to a lowercase www host', () => {
    expect(canonicalHostRedirectUrl('https://TUTLIO.PL/admin')).toBe('https://www.tutlio.pl/admin');
  });

  it('returns null for hosts that are already canonical www', () => {
    expect(canonicalHostRedirectUrl('https://www.tutlio.pl/admin')).toBeNull();
    expect(canonicalHostRedirectUrl('https://www.tutlio.lt/')).toBeNull();
    expect(canonicalHostRedirectUrl('https://www.tutlio.com/blog')).toBeNull();
  });

  it('leaves localhost, preview deployments and unrelated hosts untouched', () => {
    expect(canonicalHostRedirectUrl('http://localhost:3000/admin')).toBeNull();
    expect(canonicalHostRedirectUrl('https://tutlio-git-main.vercel.app/admin')).toBeNull();
    expect(canonicalHostRedirectUrl('https://app.tutlio.pl/admin')).toBeNull();
    expect(canonicalHostRedirectUrl('https://example.com/')).toBeNull();
  });

  it('returns null for malformed input', () => {
    expect(canonicalHostRedirectUrl('not a url')).toBeNull();
    expect(canonicalHostRedirectUrl('')).toBeNull();
  });
});
