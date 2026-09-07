import type { SupabaseClient } from '@supabase/supabase-js';
import { slugify } from './slugify.js';
import {
  generateBlogWithAi,
  generateBlogEditorialBrief,
  generateBlogLocaleArticle,
  generateGeminiCoverImage,
  resolveBlogAiProvider,
  BLOG_AUTO_LOCALES,
  type BlogAutoLocale,
  type BlogEditorialBrief,
  type BlogLocaleContent,
} from './blogAiProvider.js';
import {
  uploadBlogImageFromBase64,
  uploadBlogImageFromUrl,
} from './blogImageUpload.js';
import { blogQuickPublishUrl, blogDraftPreviewUrl } from './blogPublishToken.js';
import { INTERNAL_NOTIFY_EMAILS } from './resendConfig.js';
import { submitIndexNowUrls } from './indexnowSubmit.js';
import { buildCanonicalUrl } from './seo-routing.js';
import { BLOG_LOCALE_WRITE_ORDER, isBlogAutoPublishWeekday } from './blogMarkets.js';

const DUPLICATE_WINDOW_DAYS = 30;
const GENERATION_DEADLINE_MS = 250_000;
const LOCALE_CONCURRENCY = 2;

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
  partial?: boolean;
  localesDone?: number;
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

export function missingBlogLocales(post: Record<string, unknown>): BlogAutoLocale[] {
  return BLOG_LOCALE_WRITE_ORDER.filter((loc) => {
    const title = String(post[`title_${loc}`] || '').trim();
    const content = String(post[`content_${loc}`] || '').trim();
    return !title || !content;
  });
}

function parseStoredBrief(raw: unknown): BlogEditorialBrief | null {
  if (!raw) return null;
  try {
    const o = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!o || typeof o !== 'object') return null;
    const topic = String((o as { topic?: string }).topic || '').trim();
    if (!topic) return null;
    return {
      tag: String((o as { tag?: string }).tag || 'Education'),
      topic,
      angles: ((o as { angles?: BlogEditorialBrief['angles'] }).angles || {}) as BlogEditorialBrief['angles'],
    };
  } catch {
    return null;
  }
}

async function mapPool<T>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  const queue = [...items];
  const workers = Array.from({ length: Math.min(limit, Math.max(1, items.length)) }, async () => {
    while (queue.length) {
      const next = queue.shift();
      if (next === undefined) return;
      await fn(next);
    }
  });
  await Promise.all(workers);
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

  const title = String(post.title_lt || post.title_en || '');
  const excerpt = String(post.excerpt_lt || post.excerpt_en || '');
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

async function applyLocalePatch(
  supabase: SupabaseClient,
  postId: string,
  loc: BlogAutoLocale,
  block: BlogLocaleContent,
): Promise<void> {
  const { data: existing } = await supabase
    .from('blog_posts')
    .select('id, slug')
    .eq('id', postId)
    .maybeSingle();
  if (!existing) throw new Error('post disappeared during generation');
  const slug = slugify(block.title);
  const patch: Record<string, unknown> = {
    [`title_${loc}`]: block.title,
    [`excerpt_${loc}`]: block.excerpt,
    [`content_${loc}`]: block.content,
    [`slug_${loc}`]: slug,
    updated_at: new Date().toISOString(),
  };
  const currentSlug = String(existing.slug || '');
  if (loc === 'lt' || !currentSlug.trim() || currentSlug.startsWith('draft-')) {
    patch.slug = slug || currentSlug;
    if (loc === 'lt') patch.slug_lt = slug;
  }
  const { error } = await supabase.from('blog_posts').update(patch).eq('id', postId);
  if (error) throw new Error(error.message || `failed to save ${loc}`);
}

async function maybeUploadCover(
  supabase: SupabaseClient,
  post: Record<string, unknown>,
  keyword: string,
  tag: string,
): Promise<Record<string, unknown>> {
  if (String(post.cover_image || '').trim()) return post;
  const title = String(post.title_lt || post.title_en || keyword);
  try {
    const cover = await generateGeminiCoverImage({ keyword, title, tag });
    const url = await uploadBlogImageFromBase64(
      supabase,
      cover.base64,
      cover.contentType || 'image/png',
      slugify(title).slice(0, 30),
    );
    if (!url) return post;
    const { data } = await supabase
      .from('blog_posts')
      .update({ cover_image: url, updated_at: new Date().toISOString() })
      .eq('id', post.id)
      .select('*')
      .single();
    return (data as Record<string, unknown>) || { ...post, cover_image: url };
  } catch (e) {
    console.warn('[blog-auto-generate] cover skipped:', e);
    return post;
  }
}

async function finalizeIfComplete(
  supabase: SupabaseClient,
  settings: BlogAutoSettings | null,
  appOrigin: string,
  post: Record<string, unknown>,
  keyword: string,
): Promise<RunBlogAutoGenerateResult> {
  const missing = missingBlogLocales(post);
  const publishUrl = blogQuickPublishUrl(String(post.id), appOrigin);
  const previewUrl = blogDraftPreviewUrl(String(post.id), appOrigin);
  const localesDone = BLOG_AUTO_LOCALES.length - missing.length;

  if (missing.length) {
    await supabase
      .from('blog_posts')
      .update({ generation_status: 'in_progress', updated_at: new Date().toISOString() })
      .eq('id', post.id);
    return {
      ok: true,
      postId: String(post.id),
      keyword,
      publishUrl,
      previewUrl,
      published: false,
      partial: true,
      localesDone,
    };
  }

  const autoPublish = settings?.auto_publish !== false;
  const notifyOnDraft = settings?.notify_on_draft === true;
  const nowIso = new Date().toISOString();
  const { data: finished, error } = await supabase
    .from('blog_posts')
    .update({
      generation_status: 'complete',
      status: autoPublish ? 'published' : 'draft',
      published_at: autoPublish ? (post.published_at || nowIso) : post.published_at || null,
      updated_at: nowIso,
    })
    .eq('id', post.id)
    .select('*')
    .single();
  if (error || !finished) throw new Error(error?.message || 'finalize failed');

  await logGeneration(supabase, keyword, 'success', String(finished.id));

  if (!autoPublish && notifyOnDraft) {
    await sendDraftReadyEmail(appOrigin, finished as Record<string, unknown>, keyword, publishUrl, previewUrl);
  }

  if (autoPublish) {
    const indexUrls = BLOG_AUTO_LOCALES.map((loc) => {
      const slug = String(finished[`slug_${loc}`] || finished.slug || '');
      return buildCanonicalUrl(`/blog/${slug}`, loc);
    }).filter((u) => u.includes('/blog/') && !u.endsWith('/blog/'));
    await submitIndexNowUrls(indexUrls).catch((e) =>
      console.error('[blog-auto-generate] indexnow failed:', e),
    );
  }

  return {
    ok: true,
    postId: String(finished.id),
    keyword,
    publishUrl,
    previewUrl,
    published: autoPublish,
    partial: false,
    localesDone: BLOG_AUTO_LOCALES.length,
  };
}

async function reloadPost(supabase: SupabaseClient, postId: string): Promise<Record<string, unknown>> {
  const { data, error } = await supabase.from('blog_posts').select('*').eq('id', postId).single();
  if (error || !data) throw new Error(error?.message || 'reload failed');
  return data as Record<string, unknown>;
}

async function fillGeminiLocales(
  supabase: SupabaseClient,
  post: Record<string, unknown>,
  keyword: string,
  tag: string,
  brief: BlogEditorialBrief,
  deadline: number,
): Promise<Record<string, unknown>> {
  const postId = String(post.id);
  const missing = missingBlogLocales(post);
  await mapPool(missing, LOCALE_CONCURRENCY, async (loc) => {
    if (Date.now() >= deadline) return;
    try {
      const block = await generateBlogLocaleArticle({
        keyword,
        tag,
        locale: loc,
        brief,
      });
      await applyLocalePatch(supabase, postId, loc, block);
    } catch (e) {
      console.warn(`[blog-auto-generate] locale ${loc} failed:`, e);
    }
  });
  let current = await reloadPost(supabase, postId);
  if (Date.now() < deadline) {
    current = await maybeUploadCover(supabase, current, keyword, brief.tag || tag);
  }
  return current;
}

async function loadInProgressPost(supabase: SupabaseClient): Promise<Record<string, unknown> | null> {
  const { data } = await supabase
    .from('blog_posts')
    .select('*')
    .eq('source', 'auto')
    .eq('generation_status', 'in_progress')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  return (data as Record<string, unknown>) || null;
}

export async function runBlogAutoGenerate(
  supabase: SupabaseClient,
  options: RunBlogAutoGenerateOptions = {},
): Promise<RunBlogAutoGenerateResult> {
  const appOrigin = (options.appOrigin || process.env.APP_URL || 'https://www.tutlio.lt').replace(/\/$/, '');
  const settings = await getSettings(supabase);
  const deadline = Date.now() + GENERATION_DEADLINE_MS;
  const provider = resolveBlogAiProvider();

  const inProgress = await loadInProgressPost(supabase);
  if (inProgress) {
    const keyword = String(inProgress.generation_keyword || '');
    try {
      if (provider === 'gemini') {
        let brief = parseStoredBrief(inProgress.generation_brief);
        if (!brief) {
          brief = await generateBlogEditorialBrief({
            keyword,
            tag: String(inProgress.tag || ''),
          });
          await supabase
            .from('blog_posts')
            .update({ generation_brief: JSON.stringify(brief), updated_at: new Date().toISOString() })
            .eq('id', inProgress.id);
        }
        const filled = await fillGeminiLocales(
          supabase,
          inProgress,
          keyword,
          String(inProgress.tag || brief.tag),
          brief,
          deadline,
        );
        return await finalizeIfComplete(supabase, settings, appOrigin, filled, keyword);
      }
      return await finalizeIfComplete(supabase, settings, appOrigin, inProgress, keyword);
    } catch (e: any) {
      const msg = e?.message || String(e);
      await logGeneration(supabase, keyword, 'failed', String(inProgress.id), msg);
      return { ok: false, reason: msg, keyword, postId: String(inProgress.id), partial: true };
    }
  }

  if (!options.force) {
    if (!settings?.enabled) {
      return { ok: true, skipped: true, reason: 'auto generation disabled' };
    }
    if (!isBlogAutoPublishWeekday()) {
      return { ok: true, skipped: true, reason: 'not a publish weekday (Tue/Fri UTC)' };
    }
    if (settings.last_run_at) {
      const intervalMs = (settings.interval_days || 3) * 24 * 60 * 60 * 1000;
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
    if (provider !== 'gemini') {
      const autoPublish = settings?.auto_publish !== false;
      const notifyOnDraft = settings?.notify_on_draft === true;
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
        content_lt: ai.locales.lt.content,
        slug_lt: slugLt,
        cover_image: coverImage,
        tag: ai.tag || keywordRow.tag || 'SEO',
        status: autoPublish ? 'published' : 'draft',
        published_at: autoPublish ? nowIso : null,
        source: 'auto',
        generation_keyword: keyword,
        generation_status: 'complete',
        updated_at: nowIso,
      };

      for (const loc of BLOG_AUTO_LOCALES) {
        if (loc === 'lt') continue;
        const block = ai.locales[loc];
        row[`title_${loc}`] = block.title;
        row[`excerpt_${loc}`] = block.excerpt;
        row[`content_${loc}`] = block.content;
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

      return await finalizeIfComplete(supabase, settings, appOrigin, post as Record<string, unknown>, keyword);
    }

    const brief = await generateBlogEditorialBrief({ keyword, tag: keywordRow.tag || undefined });
    const nowIso = new Date().toISOString();
    const draftSlug = `draft-${slugify(keyword).slice(0, 40) || 'topic'}-${Date.now().toString(36)}`;
    const insertRow: Record<string, unknown> = {
      slug: draftSlug,
      slug_lt: draftSlug,
      tag: brief.tag || keywordRow.tag || 'Education',
      status: 'draft',
      published_at: null,
      source: 'auto',
      generation_keyword: keyword,
      generation_status: 'in_progress',
      generation_brief: JSON.stringify(brief),
      updated_at: nowIso,
    };

    const { data: post, error: insertErr } = await supabase
      .from('blog_posts')
      .insert(insertRow)
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
        .update({ last_run_at: nowIso, updated_at: nowIso })
        .eq('id', settings.id);
    }

    const filled = await fillGeminiLocales(
      supabase,
      post as Record<string, unknown>,
      keyword,
      String(insertRow.tag),
      brief,
      deadline,
    );
    return await finalizeIfComplete(supabase, settings, appOrigin, filled, keyword);
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
