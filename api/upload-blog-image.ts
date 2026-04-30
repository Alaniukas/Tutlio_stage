import type { VercelRequest, VercelResponse } from './types';
import { createClient } from '@supabase/supabase-js';
import { timingSafeEqual, randomUUID } from 'crypto';

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
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

const ALLOWED_TYPES: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
};
const MAX_SIZE = 5 * 1024 * 1024; // 5 MB

export const config = { api: { bodyParser: { sizeLimit: '6mb' } } };

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const adminSecret = getPlatformAdminSecret();
  const secret = typeof req.headers['x-admin-secret'] === 'string' ? req.headers['x-admin-secret'] : '';
  if (!adminSecret || !secret || !secretsMatch(secret, adminSecret)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const supabase = getSupabase();
  if (!supabase) return res.status(503).json({ error: 'Database not configured' });

  const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  const { base64, contentType, fileName } = body || {};

  if (!base64 || !contentType) return res.status(400).json({ error: 'base64 and contentType required' });
  if (!ALLOWED_TYPES[contentType]) return res.status(400).json({ error: `Unsupported type: ${contentType}` });

  const buffer = Buffer.from(base64, 'base64');
  if (buffer.length > MAX_SIZE) return res.status(400).json({ error: 'File too large (max 5 MB)' });

  const ext = ALLOWED_TYPES[contentType];
  const safeName = (fileName || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40) || 'image';
  const path = `${randomUUID()}-${safeName}${ext}`;

  const { error } = await (supabase as any).storage
    .from('blog-images')
    .upload(path, buffer, { contentType, upsert: false });
  if (error) return res.status(500).json({ error: error.message });

  const { data } = (supabase as any).storage.from('blog-images').getPublicUrl(path);
  return res.status(200).json({ url: data.publicUrl });
}
