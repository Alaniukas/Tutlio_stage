# SEO deploy checklist — tutlio.pl promotion + full indexing (2026-06)

Companion to the code changes that promoted `tutlio.pl` to a canonical Polish
domain, made `/schools` indexable, fixed sitemap hreflang reciprocity, added
the bot 404 fallback, and switched about/contact to domain-flavored slugs.
Everything below happens **outside the codebase** (Vercel, DNS, Search Console).

## 1. Vercel + DNS for www.tutlio.pl (do this first)

The SEO layer now canonicalizes all Polish URLs to `https://www.tutlio.pl/...`.
That host must exist and serve the app before the next deploy is crawled.

1. Vercel → tutlio project → Settings → Domains:
   - Confirm `tutlio.pl` is attached. Add `www.tutlio.pl` as a domain.
   - Set `www.tutlio.pl` as the primary of the pair so `tutlio.pl` issues a
     308 redirect to `www.tutlio.pl` (same pattern as .com/.lt).
2. DNS at the registrar for `tutlio.pl`:
   - `www` CNAME → `cname.vercel-dns.com` (Vercel shows the exact target).
   - Apex `tutlio.pl` A record → `76.76.21.21` (or follow Vercel's current
     instructions if it suggests ALIAS/ANAME).
3. Wait for the TLS cert on `www.tutlio.pl` to be issued (Vercel does this
   automatically once DNS resolves).
4. Verify after deploy (expect every check to pass):

```bash
# Apex redirects to www
curl -sI https://tutlio.pl/ | grep -iE 'HTTP|location'        # 308 → https://www.tutlio.pl/

# Googlebot gets SSR HTML, 200, Polish content, pl canonical
curl -s -A "Googlebot" https://www.tutlio.pl/ | grep -iE 'canonical|robots|hreflang="pl"'

# The old 500 is gone
curl -s -o /dev/null -w "%{http_code}\n" -A "Googlebot" https://www.tutlio.pl/

# robots + sitemap are pl-flavored
curl -s https://www.tutlio.pl/robots.txt | grep Sitemap        # https://www.tutlio.pl/sitemap.xml
curl -s https://www.tutlio.pl/sitemap.xml | head -20           # pl <loc> URLs

# Schools pages SSR for bots on every domain
curl -s -o /dev/null -w "%{http_code}\n" -A "Googlebot" https://www.tutlio.com/schools
curl -s -A "Googlebot" https://www.tutlio.com/teachers | grep canonical   # → /schools

# Soft-404 fix: unknown URL returns a real 404 to bots
curl -s -o /dev/null -w "%{http_code}\n" -A "Googlebot" https://www.tutlio.com/no-such-page

# Alias redirects
curl -sI https://www.tutlio.com/apie-mus | grep -iE 'HTTP|location'   # 308 → /about
curl -sI https://www.tutlio.lt/about | grep -iE 'HTTP|location'       # 308 → /apie-mus
```

## 2. Google Search Console

### New property: tutlio.pl

1. Add a **Domain property** for `tutlio.pl` (DNS TXT verification at the
   registrar).
2. Submit `https://www.tutlio.pl/sitemap.xml` under Sitemaps.
3. URL Inspection → request indexing for:
   - `https://www.tutlio.pl/`
   - `https://www.tutlio.pl/pricing`
   - `https://www.tutlio.pl/schools`
   - `https://www.tutlio.pl/blog` (if Polish posts exist)

### Existing properties: tutlio.com and tutlio.lt

1. Resubmit `sitemap.xml` in both properties (content changed: schools URLs,
   /about & /contacts slugs, lastmod, reciprocal alternates).
2. Page indexing report → **Validate fix** on:
   - "Excluded by 'noindex' tag" (the /schools & /teachers failures)
   - "Page with redirect" (apex→www and blog-slug 301 noise)
   - "Crawled - currently not indexed" / "Discovered - currently not indexed"
3. URL Inspection → request indexing for the money pages on .com:
   - `/`, `/pricing`, `/schools`, `/about`, `/contacts`
   - the locale homepages: `/lv`, `/ee`, `/fr`, `/es`, `/de`, `/se`, `/dk`,
     `/fi`, `/no` (these were the bulk of "Discovered - not indexed")
   - same for `.lt`: `/`, `/pricing`, `/schools`, `/apie-mus`, `/kontaktai`
4. Note: `tutlio.com/pl/*` URLs will progressively report "Alternate page
   with proper canonical tag" as Google picks up the cross-domain canonical to
   `tutlio.pl/*` — that is the intended end state, not an error.

## 3. Optional but recommended

- **Bing Webmaster Tools**: register all three domains (bingbot already
  receives SSR) and submit the sitemaps. Easiest via "Import from GSC".
- **Backlink hygiene**: link `https://www.tutlio.pl` from any Polish
  marketing/social profiles to start building host-level signals.

## 5. Growth automation shipped in code (verify after deploy)

These are live once deployed — no setup needed, just verify:

- **IndexNow** (`api/indexnow-ping.ts`): cron every 6 h submits recently
  created/updated blog posts to Bing/Yandex/Seznam (and the Bing-backed AI
  search engines). Key file: `/8f3e9f035b622995d5cb1b8cc7f0aa7f.txt` on every
  domain. Verify: `curl https://www.tutlio.com/8f3e9f035b622995d5cb1b8cc7f0aa7f.txt`
- **Blog RSS feeds** (`api/blog-feed.ts`): `/blog/rss.xml` per domain,
  `/{locale}/blog/rss.xml` per locale, with autodiscovery `<link>` tags in all
  SSR pages and a reference in llms.txt.
- **Hard 404s everywhere**: the middleware matcher is now a catch-all, so
  *any* unknown dot-free URL (including `/en/junk` and deeper paths) returns
  HTTP 404 to bots instead of the noindex shell.
- **Pricing single source** (`src/lib/pricing.ts`): SPA pages, bot SSR,
  JSON-LD offers, and llms.txt all render from one constant — the llms.txt
  "Subscription Only €9.99" staleness (real price: €35) is fixed and guarded
  by tests. When Stripe prices change, update this one file.
- **Traffic source analytics**: migration
  `20260613100000_traffic_sources_referrer_buckets.sql` makes the admin-panel
  traffic sources classify referrers — `google (organic)`, `bing (organic)`,
  `ai: chatgpt`, `ai: perplexity`, `ai: copilot`, `ai: gemini`, `ai: claude`,
  social — instead of lumping everything without UTM into "direct". Apply with
  `npm run supabase:push`.

## 6. Post-deploy smoke check

Run after every production deploy (CI-friendly, exits 1 on failure):

```bash
npm run seo:smoke                            # all three domains
npm run seo:smoke -- https://www.tutlio.pl   # one domain
```

Checks per domain: robots.txt + sitemap, bot SSR (200/canonical/no-noindex),
human shell (noindex), /schools indexability, hard 404s (root + locale-prefixed),
about/contact 308 aliases, RSS feed, IndexNow key file, llms.txt.

## 4. Expectation setting

- The noindex/soft-404/redirect buckets should validate within 1–2 weeks.
- Absorption of the ~143 locale URLs into the index typically takes several
  weeks and scales with domain authority and per-locale content
  differentiation; the code changes maximize crawlability (locale footer
  links, reciprocal hreflang, honest lastmod) but do not guarantee indexing
  of every variant.
- Watch Settings → Crawl stats in GSC for the 404 share: it should rise
  briefly (bots discovering the new 404s) and then decay as garbage URLs
  drop out of the crawl queue.
