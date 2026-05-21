/**
 * POST /api/request-password-reset
 * Atnaujina user_metadata.locale pagal domeną, tada siunčia Supabase recovery el. laišką.
 */
import type { VercelRequest, VercelResponse } from './types';
import { createClient } from '@supabase/supabase-js';
import { findAuthUserByEmail } from './_lib/findAuthUserByEmail.js';

type AuthEmailLocale = 'lt' | 'pl' | 'en';

function parseLocale(value: unknown): AuthEmailLocale {
  if (value === 'pl' || value === 'en' || value === 'lt') return value;
  return 'lt';
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !serviceKey || !anonKey) {
      return res.status(500).json({ error: 'Missing Supabase env vars' });
    }

    const email = typeof req.body?.email === 'string' ? req.body.email.trim() : '';
    const locale = parseLocale(req.body?.locale);
    const redirectTo = typeof req.body?.redirectTo === 'string' ? req.body.redirectTo.trim() : '';

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }
    if (!redirectTo) {
      return res.status(400).json({ error: 'redirectTo is required' });
    }

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const publicClient = createClient(supabaseUrl, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const existing = await findAuthUserByEmail(admin, email);
    if (existing) {
      const prior = existing.user_metadata && typeof existing.user_metadata === 'object'
        ? existing.user_metadata
        : {};
      await admin.auth.admin.updateUserById(existing.id, {
        user_metadata: { ...prior, locale },
      });
    }

    const { error } = await publicClient.auth.resetPasswordForEmail(email, { redirectTo });
    if (error) {
      console.error('[request-password-reset]', error.message);
      return res.status(500).json({ error: error.message });
    }

    return res.status(200).json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[request-password-reset]', message);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
