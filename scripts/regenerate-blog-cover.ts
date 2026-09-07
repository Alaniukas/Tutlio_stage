/**
 * Regenerate cover image for an existing blog post (Gemini).
 * Usage: npx tsx scripts/regenerate-blog-cover.ts <postId>
 */
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { generateGeminiCoverImage } from '../api/_lib/blogAiProvider.js';
import { uploadBlogImageFromBase64 } from '../api/_lib/blogImageUpload.js';
import { supabaseServiceRoleClientOptions } from '../api/_lib/supabaseServiceRoleClientOptions.js';
import { slugify } from '../api/_lib/slugify.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function loadEnvFile(name: string) {
  const p = join(root, name);
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, 'utf8').split(/\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq < 1) continue;
    const key = t.slice(0, eq).trim();
    let value = t.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] ??= value;
  }
}

loadEnvFile('.env');
loadEnvFile('.env.local');
process.env.TUTLIO_DEV_API_LOCAL ??= '1';
process.env.NODE_TLS_REJECT_UNAUTHORIZED ??= '0';

const postId = process.argv[2] || '7a166000-ceeb-4515-8b86-f50a9bd3c52e';
const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Missing Supabase env');
  process.exit(1);
}

const supabase = createClient(url, key, supabaseServiceRoleClientOptions() as any);
const { data: post, error } = await supabase.from('blog_posts').select('*').eq('id', postId).maybeSingle();
if (error || !post) {
  console.error('Post not found', error?.message);
  process.exit(1);
}

console.log('[regenerate-cover]', post.title_lt);
const cover = await generateGeminiCoverImage({
  keyword: String(post.generation_keyword || post.tag || 'tutoring'),
  title: String(post.title_lt || ''),
  tag: String(post.tag || ''),
});

const coverUrl = await uploadBlogImageFromBase64(
  supabase,
  cover.base64,
  cover.contentType,
  slugify(String(post.title_lt || 'cover')).slice(0, 30),
);

const { error: updErr } = await supabase
  .from('blog_posts')
  .update({ cover_image: coverUrl, updated_at: new Date().toISOString() })
  .eq('id', postId);

if (updErr) {
  console.error(updErr.message);
  process.exit(1);
}

console.log(JSON.stringify({ ok: true, postId, coverUrl }, null, 2));
