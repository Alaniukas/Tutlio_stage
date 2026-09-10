import type { VercelRequest, VercelResponse } from './types';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  buildMvLoginUrl,
  verifyMvAccountActivationToken,
} from './_lib/mvAccountActivationToken.js';
import { findAuthUserByEmail } from './_lib/findAuthUserByEmail.js';
import { isMoksloVaisiaiOrg } from './_lib/marketMoney.js';
import { orgAwareOrigin, publicOriginFromRequest } from './_lib/public-origin.js';

function parseJsonBody(req: VercelRequest): Record<string, unknown> {
  const raw = req.body;
  if (raw == null) return {};
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  if (Buffer.isBuffer(raw)) {
    try {
      return JSON.parse(raw.toString('utf8')) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  if (typeof raw === 'object') return raw as Record<string, unknown>;
  return {};
}

type MvActivateStudentRow = {
  id: string;
  full_name: string | null;
  organization_id: string | null;
  parent_user_id: string | null;
  linked_user_id: string | null;
};

async function loadPreview(
  supabase: SupabaseClient,
  token: string,
  appOrigin: string,
) {
  const verified = verifyMvAccountActivationToken(token);
  if (verified.ok === false) {
    return { status: 400 as const, body: { error: 'Invalid or expired link', code: verified.reason } };
  }

  const { studentId, role, email } = verified.payload;
  const { data: student } = await supabase
    .from('students')
    .select('id, full_name, organization_id, parent_user_id, linked_user_id')
    .eq('id', studentId)
    .maybeSingle<MvActivateStudentRow>();

  if (!student) {
    return { status: 404 as const, body: { error: 'Student not found', code: 'student_not_found' } };
  }

  const organizationId = student.organization_id ?? null;
  if (!isMoksloVaisiaiOrg(organizationId)) {
    return { status: 403 as const, body: { error: 'Invalid organization', code: 'org_not_mv' } };
  }

  let orgName: string | null = null;
  let orgLocale: string | null = null;
  if (organizationId) {
    const { data: orgRow } = await supabase
      .from('organizations')
      .select('name, preferred_locale')
      .eq('id', organizationId)
      .maybeSingle();
    orgName = typeof orgRow?.name === 'string' ? orgRow.name : null;
    orgLocale = typeof orgRow?.preferred_locale === 'string' ? orgRow.preferred_locale : null;
  }

  const authUser = await findAuthUserByEmail(supabase, email);
  if (!authUser?.id) {
    return { status: 404 as const, body: { error: 'Account not found', code: 'account_not_found' } };
  }

  const meta = (authUser.user_metadata || {}) as Record<string, unknown>;
  const alreadyActivated = Boolean(meta.mv_account_activated_at);

  const origin = orgAwareOrigin(orgLocale, appOrigin);
  return {
    status: 200 as const,
    body: {
      success: true,
      role,
      email,
      studentName: student.full_name || '',
      orgName,
      alreadyActivated,
      loginUrl: buildMvLoginUrl(origin, email, role),
    },
  };
}

async function activateAccount(
  supabase: SupabaseClient,
  token: string,
  appOrigin: string,
) {
  const preview = await loadPreview(supabase, token, appOrigin);
  if (preview.status !== 200) return preview;

  const { role, email, loginUrl, alreadyActivated } = preview.body as {
    role: 'parent' | 'student';
    email: string;
    loginUrl: string;
    alreadyActivated: boolean;
  };

  if (!alreadyActivated) {
    const authUser = await findAuthUserByEmail(supabase, email);
    if (!authUser?.id) {
      return { status: 404 as const, body: { error: 'Account not found', code: 'account_not_found' } };
    }
    const now = new Date().toISOString();
    const prevMeta = (authUser.user_metadata || {}) as Record<string, unknown>;
    const { error: updErr } = await supabase.auth.admin.updateUserById(authUser.id, {
      user_metadata: {
        ...prevMeta,
        mv_account_activated_at: now,
        role: prevMeta.role || role,
      },
    });
    if (updErr) {
      return { status: 500 as const, body: { error: updErr.message, code: 'activation_failed' } };
    }
  }

  return {
    status: 200 as const,
    body: {
      success: true,
      role,
      email,
      loginUrl,
      activated: true,
    },
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceRoleKey) {
      return res.status(500).json({ error: 'Missing Supabase service env vars' });
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const appOrigin = publicOriginFromRequest(req);
    const queryToken = typeof req.query.t === 'string' ? req.query.t : '';
    const body = parseJsonBody(req);
    const bodyToken = typeof body.token === 'string' ? body.token : '';
    const token = (req.method === 'GET' ? queryToken : bodyToken || queryToken).trim();

    if (!token) return res.status(400).json({ error: 'Token is required', code: 'missing_token' });

    if (req.method === 'GET') {
      const preview = await loadPreview(supabase, token, appOrigin);
      return res.status(preview.status).json(preview.body);
    }

    if (req.method === 'POST') {
      const result = await activateAccount(supabase, token, appOrigin);
      return res.status(result.status).json(result.body);
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    console.error('[mv-account-activate]', e);
    return res.status(500).json({ error: message });
  }
}
