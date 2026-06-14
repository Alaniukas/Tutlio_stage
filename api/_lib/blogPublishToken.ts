import { createHmac, timingSafeEqual } from 'crypto';

const TOKEN_LENGTH = 32;

function publishSecret(): string {
  const s = process.env.BLOG_PUBLISH_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  return String(s).trim();
}

export function buildBlogPublishToken(postId: string, secret = publishSecret()): string {
  if (!secret) throw new Error('BLOG_PUBLISH_SECRET / SUPABASE_SERVICE_ROLE_KEY is not configured');
  return createHmac('sha256', secret)
    .update(`blog-publish:${postId}`)
    .digest('hex')
    .slice(0, TOKEN_LENGTH);
}

export function verifyBlogPublishToken(
  token: string,
  postId: string,
  secret = publishSecret(),
): boolean {
  if (!token || !postId || !secret) return false;
  const expected = buildBlogPublishToken(postId, secret);
  const a = Buffer.from(token, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function blogQuickPublishUrl(postId: string, appOrigin: string): string {
  const token = buildBlogPublishToken(postId);
  const base = appOrigin.replace(/\/$/, '');
  return `${base}/api/blog-quick-publish?id=${encodeURIComponent(postId)}&t=${encodeURIComponent(token)}`;
}

export function blogDraftPreviewUrl(postId: string, appOrigin: string): string {
  const token = buildBlogPublishToken(postId);
  const base = appOrigin.replace(/\/$/, '');
  return `${base}/api/blog-draft-preview?id=${encodeURIComponent(postId)}&t=${encodeURIComponent(token)}`;
}
