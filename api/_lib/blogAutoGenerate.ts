import type { SupabaseClient } from '@supabase/supabase-js';
import { slugify } from './slugify.js';
import { generateBlogWithAi, BLOG_AUTO_LOCALES, type BlogAutoLocale } from './blogAiProvider.js';
import {
  uploadBlogImageFromBase64,
  uploadBlogImageFromUrl,
} from './blogImageUpload.js';
import { blogQuickPublishUrl, blogDraftPreviewUrl } from './blogPublishToken.js';
import { INTERNAL_NOTIFY_EMAILS } from './resendConfig.js';
import { submitIndexNowUrls } from './indexnowSubmit.js';
import {
  enrichBlogLocaleContent,
  fetchRelatedBlogPosts,
  relatedPostsForLocale,
} from './blogRelatedLinks.js';
import { buildCanonicalUrl } from './seo-routing.js';

const DUPLICATE_WINDOW_DAYS = 30;

export interface BlogAutoSettings {
  id: string;
  enabled: boolean;
  interval_days: number;
  last_run_at: string | null;
  auto_publish: boolean;
  notify_on_draft: boolean;
}

export interface BlogAutoKeyword {
  id: string;
  keyword: string;
  tag: string;
  enabled: boolean;
  sort_order: number;
  last_used_at: string | null;
}

export interface RunBlogAutoGenerateOptions {
  force?: boolean;
  keywordId?: string;
  appOrigin?: string;
}

export interface RunBlogAutoGenerateResult {
  ok: boolean;
  skipped?: boolean;
  reason?: string;
  postId?: string;
  keyword?: string;
  publishUrl?: string;
  previewUrl?: string;
  published?: boolean;
}

function blogNotifyEmails(): string[] {
  const raw = (process.env.BLOG_NOTIFY_EMAILS || '').trim();
  if (raw) {
    return raw.split(',').map((e) => e.trim()).filter(Boolean);
  }
  return INTERNAL_NOTIFY_EMAILS;
}

async function getSettings(supabase: SupabaseClient): Promise<BlogAutoSettings | null> {
  const { data } = await supabase.from('blog_auto_settings').select('*').limit(1).maybeSingle();
  return data as BlogAutoSettings | null;
}

async function pickKeyword(
  supabase: SupabaseClient,
  keywordId?: string,
): Promise<BlogAutoKeyword | null> {
  if (keywordId) {
    const { data } = await supabase.from('blog_auto_keywords').select('*').eq('id', keywordId).maybeSingle();
    return data as BlogAutoKeyword | null;
  }
  const { data } = await supabase
    .from('blog_auto_keywords')
    .select('*')
    .eq('enabled', true)
    .order('last_used_at', { ascending: true, nullsFirst: true })
    .order('sort_order', { ascending: true })
    .limit(1)
    .maybeSingle();
  return data as BlogAutoKeyword | null;
}

async function hasRecentDuplicate(
  supabase: SupabaseClient,
  keyword: string,
): Promise<boolean> {
  const since = new Date(Date.now() - DUPLICATE_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { data } = await supabase
    .from('blog_posts')
    .select('id')
    .eq('generation_keyword', keyword)
    .gte('created_at', since)
    .limit(1);
  return (data?.length ?? 0) > 0;
}

async function logGeneration(
  supabase: SupabaseClient,
  keyword: string,
  status: 'success' | 'failed',
  postId?: string,
  error?: string,
) {
  await supabase.from('blog_generation_log').insert({
    keyword,
    status,
    post_id: postId || null,
    error: error || null,
  });
}

async function sendDraftReadyEmail(
  appOrigin: string,
  post: Record<string, unknown>,
  keyword: string,
  publishUrl: string,
  previewUrl: string,
) {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
  if (!serviceKey || !supabaseUrl) return;

  const title = String(post.title_lt || '');
  const excerpt = String(post.excerpt_lt || '');
  const adminUrl = `${appOrigin.replace(/\/$/, '')}/admin`;

  await fetch(`${appOrigin.replace(/\/$/, '')}/api/send-email`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-internal-key': serviceKey,
    },
    body: JSON.stringify({
      type: 'blog_draft_ready',
      to: blogNotifyEmails(),
      locale: 'lt',
      data: {
        title,
        titleEn: String(post.title_en || ''),
        titlePl: String(post.title_pl || ''),
        excerpt,
        keyword,
        publishUrl,
        previewUrl,
        adminUrl,
        postId: post.id,
        coverImage: String(post.cover_image || ''),
        contentLt: String(post.content_lt || ''),
        contentEn: String(post.content_en || ''),
        contentPl: String(post.content_pl || ''),
      },
    }),
  }).catch((e) => console.error('[blog-auto-generate] email failed:', e));
}

export async function runBlogAutoGenerate(
  supabase: SupabaseClient,
  options: RunBlogAutoGenerateOptions = {},
): Promise<RunBlogAutoGenerateResult> {
  const appOrigin = (options.appOrigin || process.env.APP_URL || 'https://www.tutlio.lt').replace(/\/$/, '');
  const settings = await getSettings(supabase);

  if (!options.force) {
    if (!settings?.enabled) {
      return { ok: true, skipped: true, reason: 'auto generation disabled' };
    }
    if (settings.last_run_at) {
      const intervalMs = (settings.interval_days || 2) * 24 * 60 * 60 * 1000;
      const last = Date.parse(settings.last_run_at);
      if (Number.isFinite(last) && Date.now() - last < intervalMs) {
        return { ok: true, skipped: true, reason: 'interval not elapsed' };
      }
    }
  }

  const keywordRow = await pickKeyword(supabase, options.keywordId);
  if (!keywordRow) {
    return { ok: true, skipped: true, reason: 'no enabled keywords' };
  }

  const keyword = keywordRow.keyword.trim();
  if (!keyword) {
    return { ok: true, skipped: true, reason: 'empty keyword' };
  }

  if (await hasRecentDuplicate(supabase, keyword)) {
    await logGeneration(supabase, keyword, 'failed', undefined, 'duplicate within 30 days');
    return { ok: true, skipped: true, reason: 'duplicate keyword recently used' };
  }

  try {
    const autoPublish = settings?.auto_publish !== false;
    const notifyOnDraft = settings?.notify_on_draft === true;
    const relatedRows = await fetchRelatedBlogPosts(supabase, { tag: keywordRow.tag || undefined, limit: 3 });

    const ai = await generateBlogWithAi({ keyword, tag: keywordRow.tag || undefined });

    let coverImage = ai.coverImageUrl;
    if (!coverImage && ai.coverImageBase64) {
      coverImage = await uploadBlogImageFromBase64(
        supabase,
        ai.coverImageBase64,
        ai.coverImageContentType || 'image/webp',
        slugify(ai.locales.lt.title).slice(0, 30),
      );
    } else if (coverImage) {
      coverImage = await uploadBlogImageFromUrl(
        supabase,
        coverImage,
        slugify(ai.locales.lt.title).slice(0, 30),
      );
    }

    const slugLt = slugify(ai.locales.lt.title);
    const nowIso = new Date().toISOString();
    const row: Record<string, unknown> = {
      slug: slugLt,
      title_lt: ai.locales.lt.title,
      excerpt_lt: ai.locales.lt.excerpt,
      content_lt: enrichBlogLocaleContent(
        ai.locales.lt.content,
        'lt',
        relatedPostsForLocale(relatedRows, 'lt'),
      ),
      slug_lt: slugLt,
      cover_image: coverImage,
      tag: ai.tag || keywordRow.tag || 'SEO',
      status: autoPublish ? 'published' : 'draft',
      published_at: autoPublish ? nowIso : null,
      source: 'auto',
      generation_keyword: keyword,
      updated_at: nowIso,
    };

    for (const loc of BLOG_AUTO_LOCALES) {
      if (loc === 'lt') continue;
      const block = ai.locales[loc];
      row[`title_${loc}`] = block.title;
      row[`excerpt_${loc}`] = block.excerpt;
      row[`content_${loc}`] = enrichBlogLocaleContent(
        block.content,
        loc as BlogAutoLocale,
        relatedPostsForLocale(relatedRows, loc),
      );
      row[`slug_${loc}`] = slugify(block.title);
    }

    const { data: post, error: insertErr } = await supabase
      .from('blog_posts')
      .insert(row)
      .select('*')
      .single();
    if (insertErr || !post) throw new Error(insertErr?.message || 'insert failed');

    await supabase
      .from('blog_auto_keywords')
      .update({ last_used_at: new Date().toISOString() })
      .eq('id', keywordRow.id);

    if (settings?.id) {
      await supabase
        .from('blog_auto_settings')
        .update({ last_run_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq('id', settings.id);
    }

    await logGeneration(supabase, keyword, 'success', post.id as string);

    const publishUrl = blogQuickPublishUrl(String(post.id), appOrigin);
    const previewUrl = blogDraftPreviewUrl(String(post.id), appOrigin);

    if (!autoPublish && notifyOnDraft) {
      await sendDraftReadyEmail(appOrigin, post as Record<string, unknown>, keyword, publishUrl, previewUrl);
    }

    if (autoPublish) {
      const indexUrls = BLOG_AUTO_LOCALES.map((loc) => {
        const slug = String(row[`slug_${loc}`] || slugLt);
        return buildCanonicalUrl(`/blog/${slug}`, loc);
      });
      await submitIndexNowUrls(indexUrls).catch((e) =>
        console.error('[blog-auto-generate] indexnow failed:', e),
      );
    }

    return {
      ok: true,
      postId: String(post.id),
      keyword,
      publishUrl,
      previewUrl,
      published: autoPublish,
    };
  } catch (e: any) {
    const msg = e?.message || String(e);
    await logGeneration(supabase, keyword, 'failed', undefined, msg);
    return { ok: false, reason: msg, keyword };
  }
}

export async function publishAutoBlogPost(
  supabase: SupabaseClient,
  postId: string,
): Promise<{ ok: boolean; error?: string; slugLt?: string }> {
  const { data: post } = await supabase
    .from('blog_posts')
    .select('id, status, source, slug_lt, slug')
    .eq('id', postId)
    .maybeSingle();

  if (!post) return { ok: false, error: 'Post not found' };
  if (post.status === 'published') return { ok: true, slugLt: post.slug_lt || post.slug };
  if (post.source !== 'auto') return { ok: false, error: 'Only auto-generated drafts can be quick-published' };
  if (post.status !== 'draft') return { ok: false, error: 'Post is not a draft' };

  const { error } = await supabase
    .from('blog_posts')
    .update({
      status: 'published',
      published_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', postId);

  if (error) return { ok: false, error: error.message };
  return { ok: true, slugLt: post.slug_lt || post.slug };
}

export { getSettings, pickKeyword };
