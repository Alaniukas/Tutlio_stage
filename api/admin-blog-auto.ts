import type { VercelRequest, VercelResponse } from './types.js';
import { createClient } from '@supabase/supabase-js';
import { timingSafeEqual } from 'crypto';
import { supabaseServiceRoleClientOptions } from './_lib/supabaseServiceRoleClientOptions.js';
import { runBlogAutoGenerate } from './_lib/blogAutoGenerate.js';
import { publicOriginFromRequest } from './_lib/public-origin.js';

// Blog generation (text retries + cover image) can take a while; give it headroom.
export const config = { maxDuration: 120 };

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

function requireAdmin(req: VercelRequest, res: VercelResponse): boolean {
  const adminSecret = getPlatformAdminSecret();
  const secret = typeof req.headers['x-admin-secret'] === 'string' ? req.headers['x-admin-secret'] : '';
  if (!adminSecret || !secret || !secretsMatch(secret, adminSecret)) {
    res.status(401).json({ error: 'Unauthorized' });
    return false;
  }
  return true;
}

function getSupabase() {
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, supabaseServiceRoleClientOptions() as any);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!requireAdmin(req, res)) return;

  const supabase = getSupabase();
  if (!supabase) return res.status(503).json({ error: 'Database not configured' });

  const action = typeof req.query.action === 'string' ? req.query.action : '';

  if (req.method === 'GET') {
    const [settingsRes, keywordsRes, logRes] = await Promise.all([
      supabase.from('blog_auto_settings').select('*').limit(1).maybeSingle(),
      supabase.from('blog_auto_keywords').select('*').order('sort_order').order('created_at'),
      supabase
        .from('blog_generation_log')
        .select('id, post_id, keyword, status, error, created_at')
        .order('created_at', { ascending: false })
        .limit(20),
    ]);

    if (settingsRes.error) return res.status(500).json({ error: settingsRes.error.message });
    if (keywordsRes.error) return res.status(500).json({ error: keywordsRes.error.message });
    if (logRes.error) return res.status(500).json({ error: logRes.error.message });

    return res.status(200).json({
      settings: settingsRes.data,
      keywords: keywordsRes.data || [],
      log: logRes.data || [],
    });
  }

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};

  if (req.method === 'PATCH' && action === 'settings') {
    const { data: existing } = await supabase.from('blog_auto_settings').select('id').limit(1).maybeSingle();
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (typeof body.enabled === 'boolean') patch.enabled = body.enabled;
    if (typeof body.auto_publish === 'boolean') patch.auto_publish = body.auto_publish;
    if (typeof body.notify_on_draft === 'boolean') patch.notify_on_draft = body.notify_on_draft;
    if (typeof body.interval_days === 'number' && body.interval_days >= 1 && body.interval_days <= 30) {
      patch.interval_days = body.interval_days;
    }
    if (existing?.id) {
      const { data, error } = await supabase.from('blog_auto_settings').update(patch).eq('id', existing.id).select().single();
      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json({ settings: data });
    }
    const { data, error } = await supabase.from('blog_auto_settings').insert(patch).select().single();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ settings: data });
  }

  if (req.method === 'POST' && action === 'keyword') {
    const keyword = String(body.keyword || '').trim();
    if (!keyword) return res.status(400).json({ error: 'keyword required' });
    const { data, error } = await supabase
      .from('blog_auto_keywords')
      .insert({
        keyword,
        tag: String(body.tag || '').trim(),
        enabled: body.enabled !== false,
        sort_order: Number(body.sort_order) || 0,
      })
      .select()
      .single();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(201).json({ keyword: data });
  }

  if (req.method === 'PATCH' && action === 'keyword') {
    const id = typeof req.query.id === 'string' ? req.query.id : '';
    if (!id) return res.status(400).json({ error: 'id required' });
    const patch: Record<string, unknown> = {};
    if (body.keyword !== undefined) patch.keyword = String(body.keyword).trim();
    if (body.tag !== undefined) patch.tag = String(body.tag).trim();
    if (typeof body.enabled === 'boolean') patch.enabled = body.enabled;
    if (typeof body.sort_order === 'number') patch.sort_order = body.sort_order;
    const { data, error } = await supabase.from('blog_auto_keywords').update(patch).eq('id', id).select().single();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ keyword: data });
  }

  if (req.method === 'DELETE' && action === 'keyword') {
    const id = typeof req.query.id === 'string' ? req.query.id : '';
    if (!id) return res.status(400).json({ error: 'id required' });
    const { error } = await supabase.from('blog_auto_keywords').delete().eq('id', id);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ ok: true });
  }

  if (req.method === 'POST' && action === 'generate') {
    const appOrigin = publicOriginFromRequest(req);
    const keywordId = typeof body.keywordId === 'string' ? body.keywordId : undefined;
    const result = await runBlogAutoGenerate(supabase as any, {
      force: true,
      keywordId,
      appOrigin,
    });
    if (!result.ok && !result.skipped) {
      return res.status(500).json(result);
    }
    return res.status(200).json(result);
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
