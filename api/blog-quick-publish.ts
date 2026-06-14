import type { VercelRequest, VercelResponse } from './types.js';
import { createClient } from '@supabase/supabase-js';
import { supabaseServiceRoleClientOptions } from './_lib/supabaseServiceRoleClientOptions.js';
import { verifyBlogPublishToken } from './_lib/blogPublishToken.js';
import { publishAutoBlogPost } from './_lib/blogAutoGenerate.js';
import { buildCanonicalUrl, buildPath, canonicalDomain } from './_lib/seo-routing.js';
import { publicOriginFromRequest } from './_lib/public-origin.js';
import { INDEXNOW_KEY } from './indexnow-ping.js';

const INDEXNOW_ENDPOINT = 'https://api.indexnow.org/indexnow';

function getSupabase() {
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, supabaseServiceRoleClientOptions() as any);
}

async function pingIndexNowForUrls(urls: string[]) {
  const urlsByHost = new Map<string, string[]>();
  for (const url of urls) {
    try {
      const host = new URL(url).host;
      const list = urlsByHost.get(host) || [];
      list.push(url);
      urlsByHost.set(host, list);
    } catch {
      /* skip invalid */
    }
  }
  for (const [host, urlList] of urlsByHost) {
    await fetch(INDEXNOW_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({
        host,
        key: INDEXNOW_KEY,
        keyLocation: `https://${host}/${INDEXNOW_KEY}.txt`,
        urlList,
      }),
    }).catch((e) => console.error('[blog-quick-publish] IndexNow failed:', e));
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).send('Method not allowed');

  const postId = typeof req.query.id === 'string' ? req.query.id.trim() : '';
  const token = typeof req.query.t === 'string' ? req.query.t.trim() : '';

  if (!postId || !verifyBlogPublishToken(token, postId)) {
    return res.status(400).send('Invalid or expired publish link');
  }

  const supabase = getSupabase();
  if (!supabase) return res.status(503).send('Server not configured');

  const { data: before } = await supabase
    .from('blog_posts')
    .select('id, status, source, slug_lt, slug, title_lt, title_en, title_pl')
    .eq('id', postId)
    .maybeSingle();

  const result = await publishAutoBlogPost(supabase as any, postId);
  if (!result.ok) {
    return res.status(400).send(result.error || 'Publish failed');
  }

  const slugLt = result.slugLt || before?.slug_lt || before?.slug || '';
  const origin = publicOriginFromRequest(req);
  const livePath = buildPath(`/blog/${slugLt}`, 'lt', canonicalDomain('lt'));
  const liveUrl = `${origin}${livePath}`;
  const canonicalLiveUrl = buildCanonicalUrl(`/blog/${slugLt}`, 'lt');

  if (before?.status !== 'published') {
    const urls = ['lt', 'en', 'pl']
      .map((loc) => {
        const slugKey = loc === 'lt' ? slugLt : (before as any)?.[`slug_${loc}`] || slugLt;
        return buildCanonicalUrl(`/blog/${slugKey}`, loc as 'lt' | 'en' | 'pl');
      })
      .filter(Boolean);
    void pingIndexNowForUrls(urls);
  }

  const adminUrl = `${origin.replace(/\/$/, '')}/admin`;
  const html = `<!DOCTYPE html><html lang="lt"><head><meta charset="utf-8"/><meta http-equiv="refresh" content="3;url=${liveUrl.replace(/"/g, '%22')}"/><title>Publikuota</title></head><body style="font-family:sans-serif;padding:2rem;text-align:center;max-width:640px;margin:0 auto"><h1>Straipsnis publikuotas ✓</h1><p style="color:#374151;line-height:1.6">Peržiūrėkite straipsnį čia:</p><p><a href="${liveUrl.replace(/"/g, '%22')}" style="color:#4f46e5;font-weight:700">${liveUrl.replace(/</g, '&lt;')}</a></p>${liveUrl !== canonicalLiveUrl ? `<p style="color:#6b7280;font-size:13px;margin-top:16px">Production URL (po deploy): <a href="${canonicalLiveUrl.replace(/"/g, '%22')}">${canonicalLiveUrl.replace(/</g, '&lt;')}</a></p>` : ''}<p style="margin-top:24px"><a href="${adminUrl.replace(/"/g, '%22')}" style="color:#6b7280;font-size:14px">Admin panel →</a></p></body></html>`;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  return res.status(200).send(html);
}
