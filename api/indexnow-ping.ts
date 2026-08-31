import type { VercelRequest, VercelResponse } from './types';
import { createClient } from '@supabase/supabase-js';
import { seoLocalesForPath } from '../src/lib/i18n/localeRelease.js';
import { requireCronAuth } from './_lib/cronAuth.js';
import { type Locale, buildCanonicalUrl } from './_lib/seo-routing.js';

/**
 * IndexNow key — intentionally public (the protocol verifies ownership by
 * fetching https://<host>/<key>.txt, served from public/<key>.txt on every
 * Tutlio domain). Keep in sync with that file's name and contents.
 */
export const INDEXNOW_KEY = '8f3e9f035b622995d5cb1b8cc7f0aa7f';

const INDEXNOW_ENDPOINT = 'https://api.indexnow.org/indexnow';

/** Must stay in sync with the vercel.json cron schedule (every 6 hours). */
const LOOKBACK_MS = 6 * 60 * 60 * 1000;

function getSupabase() {
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

function postSlug(post: Record<string, unknown>, locale: Locale): string {
  return (post[`slug_${locale}`] as string) || (post.slug as string);
}

/**
 * Cron: submit recently created/updated blog posts to IndexNow so Bing,
 * Yandex, Seznam (and the AI search engines that consume Bing's index —
 * ChatGPT/Copilot among them) pick up changes within minutes instead of
 * waiting for a recrawl. Google ignores IndexNow; it relies on the sitemap.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!requireCronAuth(req, res)) return;

  const supabase = getSupabase();
  if (!supabase) return res.status(200).json({ submitted: 0, reason: 'supabase not configured' });

  const since = new Date(Date.now() - LOOKBACK_MS).toISOString();
  const { data: posts, error } = await supabase
    .from('blog_posts')
    .select('*')
    .eq('status', 'published')
    .or(`updated_at.gte.${since},published_at.gte.${since}`);

  if (error) {
    console.error('indexnow-ping query error:', error);
    return res.status(500).json({ error: error.message });
  }
  if (!posts?.length) return res.status(200).json({ submitted: 0 });

  // IndexNow requires one submission per host; canonical URLs span all three domains.
  const urlsByHost = new Map<string, string[]>();
  for (const post of posts) {
    for (const locale of seoLocalesForPath('/blog')) {
      if (!post[`title_${locale}`]) continue;
      const url = buildCanonicalUrl(`/blog/${postSlug(post, locale)}`, locale);
      const host = new URL(url).host;
      const list = urlsByHost.get(host) || [];
      list.push(url);
      urlsByHost.set(host, list);
    }
  }

  const results: Record<string, number> = {};
  for (const [host, urlList] of urlsByHost) {
    try {
      const resp = await fetch(INDEXNOW_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify({
          host,
          key: INDEXNOW_KEY,
          keyLocation: `https://${host}/${INDEXNOW_KEY}.txt`,
          urlList,
        }),
      });
      results[host] = resp.status;
    } catch (e) {
      console.error(`indexnow-ping submit failed for ${host}:`, e);
      results[host] = 0;
    }
  }

  const submitted = [...urlsByHost.values()].reduce((n, list) => n + list.length, 0);
  return res.status(200).json({ submitted, posts: posts.length, results });
}
