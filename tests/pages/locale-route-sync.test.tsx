import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { I18nContext, getStoredLocale, storeLocale } from '@/lib/i18n';
import type { Locale } from '@/lib/i18n';
import LocaleRouteSync from '@/components/LocaleRouteSync';
import { applyLocalePublicationMeta } from '@/lib/documentMeta';
import { SEO_LOCALES_BY_SURFACE } from '@/lib/i18n/localeRelease';
import { PlatformProvider } from '@/contexts/PlatformContext';
import type { Platform } from '@/lib/platform';

vi.mock('@/lib/analytics', () => ({ initAnalytics: vi.fn(), trackPageview: vi.fn() }));
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

function sync(url: string, locale: Locale = 'en', platform: Platform = 'tutors') {
  const setLocale = vi.fn();
  render(<MemoryRouter initialEntries={[url]}><I18nContext.Provider value={{
    locale, setLocale, t: (key) => key, tHtml: (key) => key, dateFnsLocale: undefined,
  }}><PlatformProvider platform={platform}><LocaleRouteSync /></PlatformProvider></I18nContext.Provider></MemoryRouter>);
  return setLocale;
}

describe('language navigation', () => {
  it('preserves stronger existing crawler restrictions and later page-owned changes', () => {
    const meta = document.createElement('meta');
    meta.name = 'robots'; meta.content = 'index, nofollow, noarchive';
    document.head.appendChild(meta);
    try {
      const restore = applyLocalePublicationMeta('he', '/he/login');
      expect(meta.content).toBe('noindex, nofollow, noarchive');
      restore();
      expect(meta.content).toBe('index, nofollow, noarchive');
      const restoreAgain = applyLocalePublicationMeta('he', '/he/login');
      meta.content = 'noindex, nofollow, nosnippet';
      restoreAgain();
      expect(meta.content).toBe('noindex, nofollow, nosnippet');
    } finally { meta.remove(); }
  });
  it('keeps an existing none directive unchanged', () => {
    const meta = document.createElement('meta');
    meta.name = 'robots'; meta.content = 'none'; document.head.appendChild(meta);
    try {
      const restore = applyLocalePublicationMeta('ar', '/ar/login');
      expect(meta.content).toBe('none');
      restore();
      expect(meta.content).toBe('none');
    } finally { meta.remove(); }
  });
  it('restores the language carried by an account email URL', () => {
    expect(sync('/reset-password?lang=he')).toHaveBeenCalledWith('he');
  });
  it('gives the path priority over the query and ignores unknown query values', () => {
    expect(sync('/ar/login?lang=he')).toHaveBeenCalledWith('ar');
    cleanup();
    expect(sync('/login?lang=unknown')).not.toHaveBeenCalled();
  });
  it('marks draft pages noindex and removes its temporary tag on unmount', () => {
    sync('/he/login', 'he');
    expect(document.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe('noindex, follow');
    cleanup();
    expect(document.querySelector('meta[name="robots"]')).toBeNull();
  });
  it('does not publish legal fallback pages when marketing is released', () => {
    const prior = SEO_LOCALES_BY_SURFACE.marketing;
    SEO_LOCALES_BY_SURFACE.marketing = [...prior, 'it'];
    try {
      const restore = applyLocalePublicationMeta('it', '/it/terms');
      expect(document.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe('noindex, follow');
      restore();
      applyLocalePublicationMeta('it', '/it/pricing')();
      expect(document.querySelector('meta[name="robots"]')).toBeNull();
      sync('/it/pricing', 'it', 'schools');
      expect(document.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe('noindex, follow');
    } finally {
      SEO_LOCALES_BY_SURFACE.marketing = prior;
    }
  });
  it('keeps locale selection usable if browser storage is unavailable', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new DOMException('Blocked', 'SecurityError'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('Blocked', 'SecurityError'); });
    expect(getStoredLocale()).toBeNull();
    expect(() => storeLocale('he')).not.toThrow();
  });
});
