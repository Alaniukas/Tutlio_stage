import type { VercelRequest, VercelResponse } from './types';
import { createClient } from '@supabase/supabase-js';
import { timingSafeEqual } from 'crypto';

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
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } }) as any;
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

const LOCALES = ['lt', 'en', 'pl', 'lv', 'ee'] as const;
const LOCALE_FIELDS = LOCALES.flatMap(l => [`title_${l}`, `excerpt_${l}`, `content_${l}`]);
const PUBLIC_LIST_FIELDS = ['id', 'slug', 'cover_image', 'tag', 'published_at',
  ...LOCALES.flatMap(l => [`title_${l}`, `excerpt_${l}`])].join(', ');

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[ąčęėįšųūž]/g, (c) => {
      const map: Record<string, string> = { ą: 'a', č: 'c', ę: 'e', ė: 'e', į: 'i', š: 's', ų: 'u', ū: 'u', ž: 'z' };
      return map[c] || c;
    })
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const supabase = getSupabase();
  if (!supabase) return res.status(503).json({ error: 'Database not configured' });

  // Public GET for published posts (no admin auth needed)
  if (req.method === 'GET' && !req.headers['x-admin-secret']) {
    const slug = typeof req.query.slug === 'string' ? req.query.slug : '';
    if (slug) {
      const { data, error } = await supabase
        .from('blog_posts')
        .select('*')
        .eq('slug', slug)
        .eq('status', 'published')
        .single();
      if (error || !data) return res.status(404).json({ error: 'Post not found' });
      return res.status(200).json({ post: data });
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

    const { data, error } = await supabase.from('blog_posts').insert(row).select().single();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(201).json({ post: data });
  }

  if (req.method === 'PATCH') {
    const id = typeof req.query.id === 'string' ? req.query.id : '';
    if (!id) return res.status(400).json({ error: 'id query param required' });

    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

    for (const key of ['slug', ...LOCALE_FIELDS, 'cover_image', 'tag']) {
      if (body[key] !== undefined) updates[key] = (body[key] || '').trim();
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
