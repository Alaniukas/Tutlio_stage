import { describe, it, expect } from 'vitest';
import { detectAuthLocaleFromHost, resolveAuthEmailLocale } from '@/lib/auth-locale';
import { SUPPORTED_LOCALES } from '@/lib/i18n/locales';

describe('detectAuthLocaleFromHost', () => {
  it('returns pl for tutlio.pl and www', () => {
    expect(detectAuthLocaleFromHost('tutlio.pl')).toBe('pl');
    expect(detectAuthLocaleFromHost('www.tutlio.pl')).toBe('pl');
  });

  it('returns en for tutlio.com and www', () => {
    expect(detectAuthLocaleFromHost('tutlio.com')).toBe('en');
    expect(detectAuthLocaleFromHost('www.tutlio.com')).toBe('en');
  });

  it('returns lt for tutlio.lt and localhost', () => {
    expect(detectAuthLocaleFromHost('tutlio.lt')).toBe('lt');
    expect(detectAuthLocaleFromHost('www.tutlio.lt')).toBe('lt');
    expect(detectAuthLocaleFromHost('localhost')).toBe('lt');
  });
});

describe('selected auth email language', () => {
  it.each(SUPPORTED_LOCALES)('uses %s on the international domain', (locale) => {
    expect(resolveAuthEmailLocale(locale, 'www.tutlio.com')).toBe(locale);
  });

  it('keeps Polish-only behavior and rejects unsupported or non-string metadata', () => {
    expect(resolveAuthEmailLocale('he', 'www.tutlio.pl')).toBe('pl');
    expect(resolveAuthEmailLocale('he', 'www.tutlio.lt')).toBe('he');
    expect(resolveAuthEmailLocale('<script>', 'www.tutlio.com')).toBe('en');
    expect(resolveAuthEmailLocale({ locale: 'he' }, 'www.tutlio.com')).toBe('en');
  });
});
