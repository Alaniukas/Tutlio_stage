import type { Locale } from '@/lib/i18n/core';
import { t } from '@/lib/i18n/core';
import type { Platform } from '@/lib/platform';
import { DEFAULT_PLATFORM } from '@/lib/platform';

function escapeCssIdent(key: string): string {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
    return CSS.escape(key);
  }
  // Very old browsers / embedded WebViews without CSS.escape — keep selectors safe for simple meta keys.
  return key.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function setMeta(attr: 'name' | 'property', key: string, content: string) {
  const esc = escapeCssIdent(key);
  const sel =
    attr === 'name'
      ? `meta[name="${esc}"]`
      : `meta[property="${esc}"]`;
  let el = document.head.querySelector(sel) as HTMLMetaElement | null;
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

/** Default SEO title + meta tags for the current UI locale (SPA shell). */
export function applyDefaultDocumentMeta(locale: Locale, platform: Platform = DEFAULT_PLATFORM): void {
  const tagline = t(locale, 'landing.heroBadge', undefined, platform);
  const fullTitle = `Tutlio - ${tagline}`;
  document.title = fullTitle;
  setMeta('name', 'description', tagline);
  setMeta('property', 'og:title', fullTitle);
  setMeta('property', 'og:description', tagline);
  setMeta('name', 'twitter:title', fullTitle);
  setMeta('name', 'twitter:description', tagline);
}
