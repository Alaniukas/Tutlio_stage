# SEO post-deploy checklist (2026-07)

Manual steps after deploying the SEO/GEO/blog auto-publish changes.

## 1. Enable daily blog publishing

1. Open `/admin` → Auto SEO blog panel.
2. Turn on **Auto-generavimas įjungtas**.
3. Turn on **Auto-publish (be el. laiško)**.
4. Leave **El. laiškas draft peržiūrai** OFF (unless you want manual review).
5. Confirm Vercel env vars: `GEMINI_API_KEY` or `BLOG_AI_API_URL` + `BLOG_AI_API_KEY`, `CRON_SECRET`.

Cron schedule: `0 5 * * *` UTC ≈ **08:00 LT (summer)** / 07:00 LT (winter).

## 2. Google Search Console

For each property (`tutlio.lt`, `tutlio.com`, `tutlio.pl`):

1. Resubmit `https://www.<domain>/sitemap.xml`.
2. URL Inspection → Request indexing for:
   - `/`, `/pricing`, `/schools`, `/blog`, `/features`
   - LT: `/apie-mus`, `/kontaktai`
   - EN: `/about`, `/contacts`
3. Check Page indexing report for "Excluded by noindex" regressions.

## 3. Bing Webmaster Tools

1. Add/verify `tutlio.lt`, `tutlio.com`, `tutlio.pl`.
2. IndexNow key file is already at `public/8f3e9f035b622995d5cb1b8cc7f0aa7f.txt`.
3. New blog posts are pinged automatically on publish.

## 4. Verify deployment

```bash
# Landing meta (LT)
curl -s -A "Googlebot" https://www.tutlio.lt/ | grep -iE 'canonical|description|korepetitor'

# llms.txt (LT domain)
curl -s https://www.tutlio.lt/llms.txt | head -20

# OG image exists
curl -sI https://www.tutlio.com/og-image.jpg | grep HTTP

# Blog in sitemap
curl -s https://www.tutlio.lt/sitemap.xml | grep blog
```

## 5. Blog keywords

Add 30+ commercial keywords in Admin → Auto SEO blog, e.g.:

- korepetitorių platforma
- pamokų tvarkaraštis online
- tutoring management software
- tutor scheduling software
- korepetavimo mokyklos valdymas

Mix education topics (current) with product-intent keywords for GEO.
