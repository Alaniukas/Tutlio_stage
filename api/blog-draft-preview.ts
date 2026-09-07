import type { VercelRequest, VercelResponse } from './types.js';
import { createClient } from '@supabase/supabase-js';
import { supabaseServiceRoleClientOptions } from './_lib/supabaseServiceRoleClientOptions.js';
import { verifyBlogPublishToken, blogQuickPublishUrl } from './_lib/blogPublishToken.js';
import { markdownToEmailHtml } from './_lib/blogMarkdownEmail.js';
import { publicOriginFromRequest } from './_lib/public-origin.js';
import { buildPath, canonicalDomain } from './_lib/seo-routing.js';

function getSupabase() {
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, supabaseServiceRoleClientOptions() as any);
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).send('Method not allowed');

  const postId = typeof req.query.id === 'string' ? req.query.id.trim() : '';
  const token = typeof req.query.t === 'string' ? req.query.t.trim() : '';

  if (!postId || !verifyBlogPublishToken(token, postId)) {
    return res.status(400).send('Invalid or expired preview link');
  }

  const supabase = getSupabase();
  if (!supabase) return res.status(503).send('Server not configured');

  const { data: post } = await supabase.from('blog_posts').select('*').eq('id', postId).maybeSingle();
  if (!post) return res.status(404).send('Post not found');
  if (post.source !== 'auto') return res.status(400).send('Preview only for auto-generated posts');

  const origin = publicOriginFromRequest(req);
  const publishUrl = blogQuickPublishUrl(postId, origin);
  const slugLt = String(post.slug_lt || post.slug || '');
  const livePath = buildPath(`/blog/${slugLt}`, 'lt', canonicalDomain('lt'));
  const liveUrl = `${origin}${livePath}`;
  const isPublished = post.status === 'published';

  const title = String(post.title_lt || '');
  const excerpt = String(post.excerpt_lt || '');
  const cover = String(post.cover_image || '');
  const contentLt = String(post.content_lt || '');
  const contentEn = String(post.content_en || '');
  const contentPl = String(post.content_pl || '');

  const html = `<!DOCTYPE html><html lang="lt"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>${esc(title)} — peržiūra</title>
<style>
body{font-family:system-ui,-apple-system,sans-serif;margin:0;background:#f3f4f6;color:#111827}
.wrap{max-width:760px;margin:0 auto;padding:24px 16px 48px}
.card{background:#fff;border-radius:16px;border:1px solid #e5e7eb;padding:24px;box-shadow:0 1px 3px rgba(0,0,0,.06)}
.badge{display:inline-block;font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;padding:4px 10px;border-radius:999px;margin-bottom:12px}
.badge-draft{background:#fef3c7;color:#92400e}.badge-live{background:#d1fae5;color:#065f46}
.cover{width:100%;border-radius:12px;margin:16px 0;aspect-ratio:16/9;object-fit:cover}
.actions{display:flex;flex-wrap:wrap;gap:12px;margin:20px 0}
.btn{display:inline-block;padding:12px 20px;border-radius:10px;font-weight:700;text-decoration:none;font-size:14px}
.btn-publish{background:#059669;color:#fff}.btn-live{background:#4f46e5;color:#fff}.btn-muted{background:#eef2ff;color:#4338ca}
.section{margin-top:28px;padding-top:20px;border-top:1px solid #e5e7eb}
.section h2{font-size:13px;color:#6366f1;text-transform:uppercase;letter-spacing:.08em;margin:0 0 12px}
.prose{font-size:15px;line-height:1.7;color:#374151}
</style></head><body><div class="wrap"><div class="card">
<span class="badge ${isPublished ? 'badge-live' : 'badge-draft'}">${isPublished ? 'Publikuota' : 'Draft peržiūra'}</span>
<h1 style="font-size:28px;line-height:1.25;margin:0 0 8px">${esc(title)}</h1>
<p style="color:#6b7280;margin:0 0 16px">${esc(excerpt)}</p>
<div class="actions">
${!isPublished ? `<a class="btn btn-publish" href="${esc(publishUrl)}">Publikuoti dabar</a>` : ''}
${isPublished ? `<a class="btn btn-live" href="${esc(liveUrl)}">Atidaryti live straipsnį</a>` : ''}
<a class="btn btn-muted" href="${esc(origin)}/admin">Admin Panel</a>
</div>
${cover ? `<img class="cover" src="${esc(cover)}" alt="${esc(title)}"/>` : ''}
<div class="section"><h2>Lietuvių kalba</h2><div class="prose">${markdownToEmailHtml(contentLt)}</div></div>
${contentEn ? `<div class="section"><h2>English</h2><div class="prose">${markdownToEmailHtml(contentEn)}</div></div>` : ''}
${contentPl ? `<div class="section"><h2>Polski</h2><div class="prose">${markdownToEmailHtml(contentPl)}</div></div>` : ''}
</div></div></body></html>`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).send(html);
}
