import { describe, it, expect } from 'vitest';
import {
  buildPublicAppUrl,
  buildTutorRegisterInviteUrl,
  defaultLocaleForOrigin,
  inviteEmailLocale,
} from '../../api/_lib/public-origin.js';

describe('invite public URLs', () => {
  it('defaults tutlio.com to EN without path prefix', () => {
    expect(defaultLocaleForOrigin('https://www.tutlio.com')).toBe('en');
    const url = buildPublicAppUrl('https://www.tutlio.com', '/parent-register', {
      searchParams: { token: 'abc' },
    });
    expect(url).toBe('https://www.tutlio.com/parent-register?token=abc');
  });

  it('defaults tutlio.lt to LT without path prefix', () => {
    expect(defaultLocaleForOrigin('https://tutlio.lt')).toBe('lt');
    const url = buildPublicAppUrl('https://tutlio.lt', '/book/XYZ');
    expect(url).toBe('https://tutlio.lt/book/XYZ');
  });

  it('adds /en prefix on tutlio.lt when UI locale is EN', () => {
    const url = buildPublicAppUrl('https://tutlio.lt', '/parent-register', {
      locale: 'en',
      searchParams: { token: 't1' },
    });
    expect(url).toBe('https://tutlio.lt/en/parent-register?token=t1');
  });

  it('builds tutor register link with org_token on matching domain', () => {
    expect(buildTutorRegisterInviteUrl('https://tutlio.com', 'ABCD2345')).toBe(
      'https://tutlio.com/register?org_token=ABCD2345',
    );
    expect(buildTutorRegisterInviteUrl('https://tutlio.lt', 'ABCD2345', { uiLocale: 'en' })).toBe(
      'https://tutlio.lt/en/register?org_token=ABCD2345',
    );
  });

  it('maps invite email locale from domain and UI', () => {
    expect(inviteEmailLocale('en', 'https://tutlio.lt')).toBe('en');
    expect(inviteEmailLocale(undefined, 'https://tutlio.com')).toBe('en');
    expect(inviteEmailLocale(undefined, 'https://tutlio.lt')).toBe('lt');
    expect(inviteEmailLocale('pl', 'https://tutlio.pl')).toBe('pl');
    expect(inviteEmailLocale('de', 'https://tutlio.com')).toBe('de');
    expect(inviteEmailLocale('fr', 'https://tutlio.lt')).toBe('fr');
    expect(inviteEmailLocale(undefined, 'https://tutlio.pl')).toBe('pl');
  });
});
