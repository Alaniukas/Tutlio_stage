import type { VercelRequest, VercelResponse } from './types';
import {
  detectDomain,
  detectLocale,
  buildCanonicalUrl,
  renderShell,
  preloadSsrLocales,
  webPageJsonLd,
  esc,
} from './_lib/ssr-shell.js';
import { isSsrMethod, rejectSsrMethod, sendSsrHtml } from './_lib/ssr-http.js';
import {
  type LegalDoc,
  legalPath,
  legalTitle,
  renderLegalBody,
} from './_lib/legal-ssr.js';

const DOCS: Record<string, LegalDoc> = {
  dpa: 'dpa',
  'privacy-policy': 'priv',
  terms: 'tos',
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!isSsrMethod(req.method)) return rejectSsrMethod(res);

  const page = typeof req.query.page === 'string' ? req.query.page : '';
  const doc = DOCS[page];
  if (!doc) return res.status(404).send('Not found');

  const domain = detectDomain(req);
  const locale = detectLocale(req);
  await preloadSsrLocales(locale, 'en', 'lt');

  const path = legalPath(doc);
  const rawTitle = legalTitle(locale, doc);
  const title = `${rawTitle} | Tutlio`;
  const description = rawTitle;
  const body = `<div class="hero"><h1>${esc(rawTitle)}</h1></div><div class="section">${renderLegalBody(locale, doc)}</div>`;
  const jsonLd = webPageJsonLd({
    name: title,
    description,
    url: buildCanonicalUrl(path, locale),
  });

  const homeUrl = buildCanonicalUrl('/', locale);
  const html = renderShell({
    locale,
    domain,
    path,
    title,
    description,
    body,
    jsonLd,
    breadcrumbs: [
      { name: 'Tutlio', url: homeUrl },
      { name: rawTitle, url: buildCanonicalUrl(path, locale) },
    ],
  });

  sendSsrHtml(req, res, html, {
    'Content-Type': 'text/html; charset=utf-8',
    'Content-Language': locale,
    'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
  });
}
