// POST /api/admin-verify — verifies platform admin password without storing it in client bundle.
import type { VercelRequest, VercelResponse } from './types';
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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const expected = getPlatformAdminSecret();
  if (!expected) {
    return res.status(503).json({ error: 'ADMIN_SECRET not configured on server' });
  }

  let body: { secret?: string };
  try {
    const raw = req.body;
    body = typeof raw === 'string' ? JSON.parse(raw || '{}') : raw || {};
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' });
  }
  const secret = body?.secret;

  if (!secret || !secretsMatch(secret, expected)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  return res.status(200).json({ ok: true });
}
