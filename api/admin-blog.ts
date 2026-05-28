import type { VercelRequest, VercelResponse } from './types';
import { createClient } from '@supabase/supabase-js';
import { timingSafeEqual } from 'crypto';
import { supabaseServiceRoleClientOptions } from './_lib/supabaseServiceRoleClientOptions.js';
import { slugify } from './_lib/slugify.js';

function getPlatformAdminSecret(): string {
  const s = process.env.ADMIN_SECRET || process.env.VITE_ADMIN_SECRET;
  return (s && String(s).trim()) || '';
}

function secretsMatch(a: string, b: string): boolean {
  const x = Buffer.from(a, 'utf8');
  const y = Buffer.from(b, 'utf8');
  if (x.length !== y.length) return false;
  return timingSafeEqual(x, y);
}

function getSupabase() {
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, supabaseServiceRoleClientOptions() as any) as any;
}

function requireAdmin(req: VercelRequest, res: VercelResponse): boolean {
  const adminSecret = getPlatformAdminSecret();
  const secret = typeof req.headers['x-admin-secret'] === 'string' ? req.headers['x-admin-secret'] : '';
  if (!adminSecret || !secret || !secretsMatch(secret, adminSecret)) {
    res.status(401).json({ error: 'Unauthorized' });
    return false;
  }
  return true;
}

const LOCALES = ['lt', 'en', 'pl', 'lv', 'ee', 'fr', 'es', 'de', 'se', 'dk', 'fi', 'no'] as const;
const LOCALE_FIELDS = LOCALES.flatMap(l => [`title_${l}`, `excerpt_${l}`, `content_${l}`]);
const SLUG_FIELDS = LOCALES.map(l => `slug_${l}`);
const PUBLIC_LIST_FIELDS = ['id', 'slug', 'cover_image', 'tag', 'published_at',
  ...LOCALES.flatMap(l => [`title_${l}`, `excerpt_${l}`]),
  ...SLUG_FIELDS].join(', ');

function postSlug(post: Record<string, unknown>, locale: (typeof LOCALES)[number]): string {
  return (post[`slug_${locale}`] as string) || (post.slug as string);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const supabase = getSupabase();
  if (!supabase) return res.status(503).json({ error: 'Database not configured' });

  // Public GET for published posts (no admin auth needed)
  if (req.method === 'GET' && !req.headers['x-admin-secret']) {
    const slug = typeof req.query.slug === 'string' ? req.query.slug : '';
    const localeParam = typeof req.query.locale === 'string' ? req.query.locale : '';
    const locale = (LOCALES as readonly string[]).includes(localeParam) ? localeParam as (typeof LOCALES)[number] : null;

    if (slug) {
      let post: Record<string, unknown> | null = null;

      if (locale) {
        const { data } = await supabase
          .from('blog_posts')
          .select('*')
          .eq(`slug_${locale}`, slug)
          .eq('status', 'published')
          .maybeSingle();
        post = data;
        if (!post) {
          const { data: fb } = await supabase
            .from('blog_posts')
            .select('*')
            .eq('slug', slug)
            .eq('status', 'published')
            .maybeSingle();
          post = fb;
        }
      } else {
        const { data } = await supabase
          .from('blog_posts')
          .select('*')
          .eq('slug', slug)
          .eq('status', 'published')
          .maybeSingle();
        post = data;
      }

      if (!post) return res.status(404).json({ error: 'Post not found' });

      const canonicalSlug = locale ? postSlug(post, locale) : (post.slug as string);
      const payload: Record<string, unknown> = { post };
      if (locale && canonicalSlug && canonicalSlug !== slug) {
        payload.redirectSlug = canonicalSlug;
      }
      return res.status(200).json(payload);
    }
    const { data, error } = await supabase
      .from('blog_posts')
      .select(PUBLIC_LIST_FIELDS)
      .eq('status', 'published')
      .order('published_at', { ascending: false });
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ posts: data || [] });
  }

  if (!requireAdmin(req, res)) return;

  if (req.method === 'GET') {
    const id = typeof req.query.id === 'string' ? req.query.id : '';
    if (id) {
      const { data, error } = await supabase.from('blog_posts').select('*').eq('id', id).single();
      if (error || !data) return res.status(404).json({ error: 'Post not found' });
      return res.status(200).json({ post: data });
    }
    const { data, error } = await supabase
      .from('blog_posts')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ posts: data || [] });
  }

  if (req.method === 'POST') {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
    const titleLt = (body.title_lt || '').trim();
    if (!titleLt) return res.status(400).json({ error: 'title_lt is required' });

    const slug = body.slug?.trim() || slugify(titleLt);
    const row: Record<string, unknown> = {
      slug,
      title_lt: titleLt,
      cover_image: (body.cover_image || '').trim(),
      tag: (body.tag || '').trim(),
      status: body.status === 'published' ? 'published' : 'draft',
      published_at: body.status === 'published' ? new Date().toISOString() : null,
    };
    for (const f of LOCALE_FIELDS) {
      if (f !== 'title_lt') row[f] = (body[f] || '').trim();
    }
    for (const l of LOCALES) {
      const key = `slug_${l}`;
      const explicit = (body[key] || '').trim();
      const title = (body[`title_${l}`] || '').trim();
      row[key] = explicit || (title ? slugify(title) : (l === 'lt' ? slug : null));
    }

    const { data, error } = await supabase.from('blog_posts').insert(row).select().single();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(201).json({ post: data });
  }

  if (req.method === 'PATCH') {
    const id = typeof req.query.id === 'string' ? req.query.id : '';
    if (!id) return res.status(400).json({ error: 'id query param required' });

    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

    for (const key of ['slug', ...LOCALE_FIELDS, ...SLUG_FIELDS, 'cover_image', 'tag']) {
      if (body[key] !== undefined) updates[key] = (body[key] || '').trim();
    }

    // Auto-generate locale slugs when a title is provided but slug is empty
    for (const l of LOCALES) {
      const slugKey = `slug_${l}`;
      const titleKey = `title_${l}`;
      if (body[titleKey] && !body[slugKey]) {
        const title = (body[titleKey] || '').trim();
        if (title) updates[slugKey] = slugify(title);
      }
    }

    if (body.status !== undefined) {
      updates.status = body.status === 'published' ? 'published' : 'draft';
      if (body.status === 'published') {
        const { data: existing } = await supabase.from('blog_posts').select('published_at').eq('id', id).single();
        if (!existing?.published_at) updates.published_at = new Date().toISOString();
      }
    }

    const { data, error } = await supabase.from('blog_posts').update(updates).eq('id', id).select().single();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ post: data });
  }

  if (req.method === 'DELETE') {
    const id = typeof req.query.id === 'string' ? req.query.id : '';
    if (!id) return res.status(400).json({ error: 'id query param required' });

    const { error } = await supabase.from('blog_posts').delete().eq('id', id);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
