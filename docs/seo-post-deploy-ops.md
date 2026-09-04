# SEO post-deploy and ongoing operations (2026-08)

The repository covers the technical SEO contract. Indexing, rankings, native
editorial quality, backlinks, and Search Console validation still require the
operational work below after a production deployment.

## 1. Deploy prerequisites

1. Confirm `www.tutlio.lt`, `www.tutlio.pl`, and `www.tutlio.com` are attached
   to the same Vercel production project and each apex redirects to `www` in a
   single permanent hop.
2. Apply the locale/database migrations before deploying the application. A
   published public tutor page is intentionally omitted from the sitemap if
   its table is not available yet.
3. Confirm production has the Supabase service-role variables required by the
   sitemap, blog renderer, and public-page renderer.
4. Deploy only through the normal reviewed production process.
5. Run `npm test -- tests/api/esm-import-extensions.test.ts` before every
   deploy. Vercel executes `api/*.ts` as Node ESM without bundling, so one
   relative import without a `.js` extension (or a `@/` alias) in any module
   an API function loads crashes that function at cold start with
   `FUNCTION_INVOCATION_FAILED`. Vitest and `tsc` resolve those imports and
   never notice; on 2026-09-05 this took down the crawler render of the home,
   pricing, about, contact, blog and tutor pages plus `sitemap.xml`.
   For the runtime proof, `npm run verify:api-esm` compiles every function the
   way Vercel does and imports each one under Node ESM; it must print
   "All API functions resolve their imports" before you deploy.

## 2. Automated production verification

Run after every production deploy:

```bash
npm run seo:smoke
npm run seo:smoke -- https://www.tutlio.com
```

The check covers robots/sitemap discovery, semantic crawler HTML, canonical
redirects, browser SPA isolation, hard crawler 404s, schools pages, RSS,
IndexNow, and `llms.txt`.

Also spot-check one unknown crawler and one real browser-style request:

```bash
curl -s -A "NewSearchCrawler/1.0" https://www.tutlio.com/fr | grep -iE 'canonical|hreflang|robots'
curl -s -H 'Sec-Fetch-Mode: navigate' -H 'Sec-Fetch-Dest: document' -A 'Mozilla/5.0' https://www.tutlio.com/fr | grep -i noindex
```

For public pages, replace `real-slug` with a published profile:

```bash
curl -s -A Googlebot https://www.tutlio.com/fr/tutor/real-slug | grep -iE 'canonical|ProfilePage|<h1'
curl -s -A Googlebot https://www.tutlio.lt/korepetitorius/demo | grep -i noindex
curl -s https://www.tutlio.com/sitemap.xml | grep '/tutor/'
```

Validate representative pages with Schema.org Validator and Google Rich
Results Test. Use a landing page, pricing page, blog article, and published
public tutor page.

## 3. Google Search Console

Maintain Domain properties for `tutlio.lt`, `tutlio.pl`, and `tutlio.com`.
After this deployment:

1. Submit each domain's own `/sitemap.xml` again.
2. Inspect the canonical money pages and request indexing:
   - `.lt`: `/`, `/pricing`, `/schools`, `/features`, `/apie-mus`, `/kontaktai`
   - `.pl`: `/`, `/pricing`, `/schools`, `/features`, `/about`, `/contacts`
   - `.com`: `/`, `/pricing`, `/schools`, `/features`, `/about`, `/contacts`
3. Inspect every `.com` locale home and its pricing page:
   - `/lv`, `/ee`, `/fr`, `/es`, `/de`, `/se`, `/dk`, `/fi`, `/no`, `/nl`
   - the matching `/{locale}/pricing` URL
4. Inspect one published public tutor page per active market. Confirm Google's
   selected canonical equals the declared self-canonical.
5. Validate fixes for soft 404, duplicate canonical, crawled-not-indexed, and
   excluded-by-noindex groups. Login, account, checkout, and demo URLs should
   remain excluded.

Do not request indexing for locale blog listings with no native articles. The
renderer and sitemap deliberately expose a locale blog only once native
content exists.

## 4. Bing and discovery services

1. Import all three properties into Bing Webmaster Tools and submit each
   sitemap.
2. Verify the IndexNow key file on each domain. Blog publishing already sends
   IndexNow notifications.
3. Keep the locale RSS feeds reachable and monitor feed errors after changes
   to blog routing.

## 5. Native content requirements

Technical localization is not a substitute for market-specific content.

1. Have a native speaker review the search titles, descriptions, landing copy,
   pricing copy, and email/UI additions before paid acquisition in a market.
2. Publish original articles for each active locale. Do not index machine-only
   fallback translations; use locally researched search intent, examples,
   terminology, currency, and regulations.
3. Build topic clusters around tutor scheduling, tutoring management software,
   payments/invoicing, waitlists, parent portals, and tutoring-school
   operations. Link each article to the relevant feature/pricing page and to
   two related articles.
4. Keep one page-level H1, descriptive H2/H3 headings, useful image alt text,
   named author/editor, publication and modification dates, and source links
   where factual claims need support.
5. Avoid thin programmatic pages, keyword stuffing, fabricated reviews, and
   schema claims that are not visible or true on the page.

## 6. Authority and local relevance

For each target market, earn relevant links and mentions from tutor
associations, education directories, partner schools, integrations, and real
customer case studies. Keep the linked domain aligned with the canonical
market: Lithuanian links to `.lt`, Polish links to `.pl`, and other locales to
their `.com/{locale}` URLs.

## 7. Performance and monitoring

1. Monitor Core Web Vitals separately for `.lt`, `.pl`, and `.com` locale
   groups. Prioritize LCP below 2.5 s, INP below 200 ms, and CLS below 0.1 at
   the 75th percentile.
2. Weekly: review crawl errors, sitemap processing, selected canonicals,
   security/manual-action reports, and index coverage changes.
3. Monthly: compare clicks, impressions, CTR, average position, conversions,
   and branded/non-branded queries by page and country—not only total traffic.
4. Refresh page copy and `lastmod` only when content materially changes.
5. Keep this checklist and `scripts/seo-smoke.mjs` in the release process.

SEO has no one-time "perfect" state. The technical layer prevents avoidable
indexing mistakes; sustained native content, authority, performance, and
measurement determine whether each locale earns visibility.

## 8. Architecture follow-up

The current Vite application keeps the interactive SPA for browser navigation
and serves semantic HTML to known bots plus crawler-like clients without Fetch
Metadata. This is safe for the existing product, but Google describes dynamic
rendering as a workaround rather than the preferred long-term architecture.

When the marketing frontend is next re-platformed, move public marketing,
blog, feature, legal, school, and tutor-profile routes to universal SSR or
static generation with hydration, so every user agent receives the same
initial semantic document:

https://developers.google.com/search/docs/crawling-indexing/javascript/dynamic-rendering
