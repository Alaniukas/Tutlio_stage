import type { Locale } from './seo-routing.js';
import { esc } from './seo-routing.js';
import { t, translationKeys } from './ssr-i18n.js';

export type LegalDoc = 'dpa' | 'priv' | 'tos';

const DOC_PATHS: Record<LegalDoc, string> = {
  dpa: '/dpa',
  priv: '/privacy-policy',
  tos: '/terms',
};

export function legalPath(doc: LegalDoc): string {
  return DOC_PATHS[doc];
}

/** Trusted CMS strings — allow basic inline HTML from locale bundles. */
function inlineHtml(s: string): string {
  return s
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/\son\w+="[^"]*"/gi, '')
    .replace(/\son\w+='[^']*'/gi, '');
}

function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, '');
}

function isMainSectionTitle(key: string, prefix: string): boolean {
  const rest = key.slice(prefix.length + 1);
  return /^s\d+Title$/.test(rest);
}

function isSubSectionTitle(key: string, prefix: string): boolean {
  const rest = key.slice(prefix.length + 1);
  return /^s\d+_\d+Title$/.test(rest) || /^s\d+[a-z]Title$/.test(rest);
}

export function renderLegalBody(locale: Locale, doc: LegalDoc): string {
  const prefix = doc;
  const skip = new Set([`${prefix}.title`, `${prefix}.subtitle`]);
  const keys = translationKeys(locale, prefix).filter((k) => !skip.has(k));

  let html = `<article class="legal">`;
  html += `<p class="legal-sub">${inlineHtml(t(locale, `${prefix}.subtitle`))}</p>`;

  let inList = false;
  for (const key of keys) {
    const raw = t(locale, key);
    if (!raw) continue;

    if (/Li\d+$/.test(key)) {
      if (!inList) {
        html += '<ul>';
        inList = true;
      }
      html += `<li>${inlineHtml(raw)}</li>`;
      continue;
    }
    if (inList) {
      html += '</ul>';
      inList = false;
    }

    if (key.endsWith('Title')) {
      if (isMainSectionTitle(key, prefix)) {
        html += `<h2>${esc(stripTags(raw))}</h2>`;
      } else if (isSubSectionTitle(key, prefix)) {
        html += `<h3>${esc(stripTags(raw))}</h3>`;
      } else {
        html += `<h3>${esc(stripTags(raw))}</h3>`;
      }
    } else if (/p\d/.test(key) || key.endsWith('note') || key.endsWith('consentText')) {
      html += `<p>${inlineHtml(raw)}</p>`;
    } else if (key.endsWith('BoxTitle')) {
      html += `<p><strong>${esc(stripTags(raw))}</strong></p>`;
    } else if (/Label$/.test(key)) {
      html += `<p>${inlineHtml(raw)}</p>`;
    } else {
      html += `<p>${inlineHtml(raw)}</p>`;
    }
  }
  if (inList) html += '</ul>';
  html += '</article>';
  return html;
}

export function legalTitle(locale: Locale, doc: LegalDoc): string {
  return t(locale, `${doc}.title`);
}
