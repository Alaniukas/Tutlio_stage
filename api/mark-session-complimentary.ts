/**
 * POST /api/mark-session-complimentary
 * Org admin: mark (or undo) a lesson as free for the client.
 * Unlinks package credits so the lesson does not consume a package slot.
 */
import type { VercelRequest, VercelResponse } from './types';
import { createClient } from '@supabase/supabase-js';
import { verifyRequestAuth } from './_lib/auth.js';
import { getOrgAdminAccessByUserId } from './_lib/orgAdminAccess.js';
import { hasOrgAdminPermission } from '../src/lib/orgAdminPermissions.js';
import { returnPackageCounterToAvailable } from './_lib/sessionStatusConfirmation.js';
import { supabaseServiceRoleClientOptions } from './_lib/supabaseServiceRoleClientOptions.js';

function json(res: VercelResponse, status: number, body: Record<string, unknown>) {
  return res.status(status).json(body);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });

  const auth = await verifyRequestAuth(req);
  if (!auth?.userId) return json(res, 401, { error: 'Unauthorized' });

  const sessionId = typeof req.body?.sessionId === 'string' ? req.body.sessionId.trim() : '';
  const complimentary = req.body?.complimentary === true;
  if (!sessionId) return json(res, 400, { error: 'sessionId required' });

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!supabaseUrl || !serviceKey) return json(res, 500, { error: 'Missing Supabase env' });

  const supabase = createClient(supabaseUrl, serviceKey, supabaseServiceRoleClientOptions() as any);

  const access = await getOrgAdminAccessByUserId(supabase, auth.userId);
  if (!access || !hasOrgAdminPermission(access.role, access.permissions, 'sessions.edit')) {
    return json(res, 403, { error: 'Insufficient organization permission' });
  }

  const { data: session, error: sessErr } = await supabase
    .from('sessions')
    .select('id, tutor_id, subject_id, lesson_package_id, status, is_complimentary')
    .eq('id', sessionId)
    .maybeSingle();
  if (sessErr) return json(res, 500, { error: sessErr.message });
  if (!session) return json(res, 404, { error: 'Session not found' });
  if (session.status === 'cancelled') {
    return json(res, 400, { error: 'Cannot mark a cancelled lesson as complimentary' });
  }

  const { data: tutor } = await supabase
    .from('profiles')
    .select('organization_id')
    .eq('id', session.tutor_id)
    .maybeSingle();
  if (!tutor?.organization_id || tutor.organization_id !== access.organizationId) {
    return json(res, 403, { error: 'Session not in your organization' });
  }

  if (complimentary && session.lesson_package_id) {
    await returnPackageCounterToAvailable(supabase, {
      id: session.id,
      lesson_package_id: session.lesson_package_id,
      subject_id: session.subject_id,
    } as any);
  }

  const patch = complimentary
    ? {
        is_complimentary: true,
        paid: true,
        payment_status: 'paid',
        lesson_package_id: null,
      }
    : {
        is_complimentary: false,
        paid: false,
        payment_status: 'pending',
      };

  const { data: updated, error: updErr } = await supabase
    .from('sessions')
    .update(patch)
    .eq('id', sessionId)
    .select('id, paid, payment_status, is_complimentary, lesson_package_id, price')
    .single();
  if (updErr) return json(res, 500, { error: updErr.message });

  return json(res, 200, { success: true, session: updated });
}
