import type { VercelRequest, VercelResponse } from './types.js';
import { verifyRequestAuth } from './_lib/auth.js';
import { createClient } from '@supabase/supabase-js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const auth = await verifyRequestAuth(req);
  if (!auth?.userId) return res.status(401).json({ error: 'Prisijunkite iš naujo.' });
  const password = req.body?.password;
  if (typeof password !== 'string' || password.length < 12 || password.length > 128) return res.status(400).json({ error: 'Slaptažodis turi būti 12–128 simbolių.' });
  const db = createClient(process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await db.auth.admin.getUserById(auth.userId);
  if (error || !data.user?.app_metadata?.temporary_password) return res.status(403).json({ error: 'Laikino slaptažodžio keitimas negalimas.' });
  const { error: updateError } = await db.auth.admin.updateUserById(auth.userId, {
    password, app_metadata: { ...data.user.app_metadata, temporary_password: false },
  });
  if (updateError) return res.status(400).json({ error: 'Nepavyko pakeisti slaptažodžio. Pasirinkite kitą slaptažodį.' });
  return res.status(200).json({ ok: true });
}
