import type { VercelRequest, VercelResponse } from './types';
import { createClient } from '@supabase/supabase-js';
import { verifyRequestAuth } from './_lib/auth.js';
import { insertParentInviteAndSendEmail } from './_lib/parentInvite.js';

const APP_URL = process.env.APP_URL || process.env.VITE_APP_URL || 'https://tutlio.lt';

/** Raw Node response — avoids Express-style helpers missing under `vercel dev`. */
function json(res: VercelResponse, status: number, body: unknown) {
  const r = res as unknown as { headersSent?: boolean; statusCode: number };
  if (r.headersSent) return;
  const payload = JSON.stringify(body);
  r.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(payload);
}

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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });

  try {
    const auth = await verifyRequestAuth(req);
    if (!auth || auth.isInternal || !auth.userId) {
      return json(res, 401, { error: 'Unauthorized' });
    }

    const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceRoleKey) {
      return json(res, 500, { error: 'Missing Supabase service env vars' });
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const body = parseJsonBody(req);
    const studentId = typeof body.studentId === 'string' ? body.studentId : '';
    if (!studentId) return json(res, 400, { error: 'studentId is required' });

    const { data: student, error: stErr } = await supabase
      .from('students')
      .select(
        'id, full_name, tutor_id, organization_id, payer_email, payer_name, parent_secondary_email, parent_secondary_name',
      )
      .eq('id', studentId)
      .single();

    if (stErr || !student) return json(res, 404, { error: 'Student not found' });

    const tutorId = student.tutor_id as string | null;
    let organizationId = (student.organization_id as string | null) ?? null;
    if (!organizationId && tutorId) {
      const { data: prof } = await supabase
        .from('profiles')
        .select('organization_id')
        .eq('id', tutorId)
        .maybeSingle();
      organizationId = (prof?.organization_id as string | null) ?? null;
    }

    let allowed = false;
    if (tutorId && tutorId === auth.userId) allowed = true;
    if (!allowed && organizationId) {
      const { data: oa } = await supabase
        .from('organization_admins')
        .select('id')
        .eq('user_id', auth.userId)
        .eq('organization_id', organizationId)
        .maybeSingle();
      if (oa) allowed = true;
    }

    if (!allowed) {
      return json(res, 403, {
        success: false,
        error:
          'Forbidden: need org admin rights and student.organization_id (or tutor in your org). Refresh the page and try again.',
      });
    }

    type Target = { email: string; name: string | null };
    const targets: Target[] = [];
    const pushUnique = (email: string | null | undefined, name: string | null | undefined) => {
      const emRaw = (email || '').trim();
      if (!emRaw.includes('@')) return;
      const em = emRaw.toLowerCase();
      if (targets.some((t) => t.email.toLowerCase() === em)) return;
      targets.push({ email: emRaw, name: name?.trim() || null });
    };

    pushUnique(student.payer_email as string | null, student.payer_name as string | null);
    pushUnique(student.parent_secondary_email as string | null, student.parent_secondary_name as string | null);

    if (targets.length === 0) {
      return json(res, 200, { success: true, sent: 0, message: 'No parent emails on record' });
    }

    const results: { email: string; ok: boolean; error?: string }[] = [];

    for (const t of targets) {
      const r = await insertParentInviteAndSendEmail({
        supabase,
        appUrl: APP_URL,
        parentEmail: t.email,
        studentId,
        studentFullName: (student.full_name as string) || '',
        parentName: t.name,
        source: 'school_admin',
        invitedByUserId: auth.userId,
      });
      if ('error' in r) {
        results.push({ email: t.email, ok: false, error: r.error });
      } else {
        results.push({ email: t.email, ok: true });
      }
    }

    const failed = results.filter((x) => !x.ok);
    if (failed.length === results.length) {
      const msg = failed.map((x) => x.error || x.email).join('; ') || 'All parent invites failed';
      return json(res, 500, { success: false, error: msg, results });
    }

    return json(res, 200, {
      success: true,
      sent: results.filter((x) => x.ok).length,
      results,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    console.error('[parent-create-invites-for-student]', e);
    return json(res, 500, { success: false, error: message, hint: 'Unhandled exception — see server logs.' });
  }
}
