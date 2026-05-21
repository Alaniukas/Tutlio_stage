import { describe, it, expect } from 'vitest';
import { detectAuthLocaleFromHost } from '@/lib/auth-locale';

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
