import type { Locale } from '@/lib/i18n/core';
import { t } from '@/lib/i18n/core';
import type { Platform } from '@/lib/platform';
import { DEFAULT_PLATFORM } from '@/lib/platform';
import { getSeoMeta } from '@/lib/seoMeta';

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
  if (platform === DEFAULT_PLATFORM) {
    const meta = getSeoMeta(locale, 'landing');
    applyPageDocumentMeta(meta.title, meta.description);
    return;
  }
  const tagline = t(locale, 'landing.heroBadge', undefined, platform);
  applyPageDocumentMeta(`Tutlio - ${tagline}`, tagline);
}

/** Page-specific title + meta tags for public marketing pages (SPA navigation). */
export function applyPageDocumentMeta(title: string, description: string): void {
  document.title = title;
  setMeta('name', 'description', description);
  setMeta('property', 'og:title', title);
  setMeta('property', 'og:description', description);
  setMeta('name', 'twitter:title', title);
  setMeta('name', 'twitter:description', description);
}

/** Keep client-side navigations aligned with the canonical URL emitted by the
 * crawler renderer. This is primarily for browser tools and share extensions;
 * search crawlers receive the same value in server HTML. */
export function applyCanonicalDocumentMeta(canonicalUrl: string): void {
  let canonical = document.head.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
  if (!canonical) {
    canonical = document.createElement('link');
    canonical.rel = 'canonical';
    document.head.appendChild(canonical);
  }
  canonical.href = canonicalUrl;
  setMeta('property', 'og:url', canonicalUrl);
}
