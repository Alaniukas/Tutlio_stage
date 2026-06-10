import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { isAllowedRedirectUrl } from '../../api/_lib/public-origin';

const prevAppUrl = process.env.APP_URL;
const prevViteAppUrl = process.env.VITE_APP_URL;

beforeEach(() => {
  delete process.env.APP_URL;
  delete process.env.VITE_APP_URL;
});

afterEach(() => {
  if (prevAppUrl === undefined) delete process.env.APP_URL;
  else process.env.APP_URL = prevAppUrl;
  if (prevViteAppUrl === undefined) delete process.env.VITE_APP_URL;
  else process.env.VITE_APP_URL = prevViteAppUrl;
});

describe('isAllowedRedirectUrl — open-redirect guard for password reset', () => {
  it('allows the Tutlio production domains (incl. www and subdomains)', () => {
    expect(isAllowedRedirectUrl('https://tutlio.lt/auth/callback?next=/reset-password')).toBe(true);
    expect(isAllowedRedirectUrl('https://www.tutlio.lt/auth/callback')).toBe(true);
    expect(isAllowedRedirectUrl('https://tutlio.com/auth/callback')).toBe(true);
    expect(isAllowedRedirectUrl('https://www.tutlio.com/auth/callback')).toBe(true);
    expect(isAllowedRedirectUrl('https://tutlio.pl/auth/callback')).toBe(true);
  });

  it('rejects arbitrary external origins', () => {
    expect(isAllowedRedirectUrl('https://evil.com/phish')).toBe(false);
    expect(isAllowedRedirectUrl('https://evil.com/tutlio.lt')).toBe(false);
  });

  it('rejects lookalike domains', () => {
    expect(isAllowedRedirectUrl('https://tutlio.lt.evil.com/auth/callback')).toBe(false);
    expect(isAllowedRedirectUrl('https://nottutlio.lt/auth/callback')).toBe(false);
    expect(isAllowedRedirectUrl('https://tutlio-lt.com/auth/callback')).toBe(false);
  });

  it('allows http only for localhost development', () => {
    expect(isAllowedRedirectUrl('http://localhost:3000/auth/callback')).toBe(true);
    expect(isAllowedRedirectUrl('http://127.0.0.1:3000/auth/callback')).toBe(true);
    expect(isAllowedRedirectUrl('http://tutlio.lt/auth/callback')).toBe(false);
    expect(isAllowedRedirectUrl('http://evil.com/x')).toBe(false);
  });

  it('rejects non-http(s) schemes and malformed URLs', () => {
    expect(isAllowedRedirectUrl('javascript:alert(1)')).toBe(false);
    expect(isAllowedRedirectUrl('data:text/html,x')).toBe(false);
    expect(isAllowedRedirectUrl('not a url')).toBe(false);
    expect(isAllowedRedirectUrl('')).toBe(false);
  });

  it('allows the configured APP_URL origin', () => {
    process.env.APP_URL = 'https://staging.tutlio.dev';
    expect(isAllowedRedirectUrl('https://staging.tutlio.dev/auth/callback')).toBe(true);
    expect(isAllowedRedirectUrl('https://other.tutlio.dev/auth/callback')).toBe(false);
  });

  it('allows the origin serving the request (preview deployments)', () => {
    expect(
      isAllowedRedirectUrl(
        'https://tutlio-git-feature.vercel.app/auth/callback',
        'https://tutlio-git-feature.vercel.app',
      ),
    ).toBe(true);
    expect(
      isAllowedRedirectUrl('https://attacker.vercel.app/auth/callback', 'https://tutlio-git-feature.vercel.app'),
    ).toBe(false);
  });
});
