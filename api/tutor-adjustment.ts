// POST /api/tutor-adjustment — org admin applies a tutor penalty/bonus (Pro Klasė)

import type { VercelRequest, VercelResponse } from './types';
import { createClient } from '@supabase/supabase-js';
import { verifyRequestAuth } from './_lib/auth.js';
import { isProKlaseOrg } from './_lib/marketMoney.js';
import {
  PRO_KLASE_MISSING_REPORT_PENALTY_EUR,
  PRO_KLASE_TUTOR_NO_SHOW_PENALTY_EUR,
} from './_lib/proKlaseTutorPay.js';
import { getOrgAdminAccessByUserId } from './_lib/orgAdminAccess.js';
import { hasOrgAdminPermission } from '../src/lib/orgAdminPermissions.js';

const ADJUSTMENT_TYPES = new Set([
  'penalty_tutor_no_show',
  'penalty_missing_report',
  'penalty_manual',
  'bonus_manual',
]);

function json(res: VercelResponse, status: number, body: Record<string, unknown>) {
  return res.status(status).json(body);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });

  try {
    const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceKey) return json(res, 500, { error: 'Missing Supabase env vars' });

    const auth = await verifyRequestAuth(req);
    if (!auth?.userId) {
      return json(res, 401, {
        error: 'Unauthorized',
        hint: !serviceKey
          ? 'SUPABASE_SERVICE_ROLE_KEY missing in API env'
          : 'Restart dev server after updating .env Supabase URL',
      });
    }
    const adminId = auth.userId;

    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const tutorId = String(req.body?.tutorId || '').trim();
    const type = String(req.body?.type || '').trim();
    const sessionId = req.body?.sessionId ? String(req.body.sessionId).trim() : null;
    const reason = req.body?.reason ? String(req.body.reason).trim() : null;
    let amountEur = Number(req.body?.amountEur);

    if (!tutorId) return json(res, 400, { error: 'Missing tutorId' });
    if (!ADJUSTMENT_TYPES.has(type)) return json(res, 400, { error: 'Invalid type' });

    const adminAccess = await getOrgAdminAccessByUserId(supabase, adminId);
    const orgId = adminAccess?.organizationId || null;
    if (
      !adminAccess
      || !hasOrgAdminPermission(adminAccess.role, adminAccess.permissions, 'finance.edit')
      || !orgId
      || !isProKlaseOrg(orgId)
    ) {
      return json(res, 403, { error: 'Not authorized for this organization' });
    }

    const tutorInOrg = await supabase
      .from('profiles')
      .select('id, organization_id, full_name, email')
      .eq('id', tutorId)
      .maybeSingle();
    if (!tutorInOrg.data || tutorInOrg.data.organization_id !== orgId) {
      return json(res, 404, { error: 'Tutor not found in organization' });
    }

    if (type === 'penalty_tutor_no_show' && !Number.isFinite(amountEur)) {
      amountEur = PRO_KLASE_TUTOR_NO_SHOW_PENALTY_EUR;
    }
    if (type === 'penalty_missing_report' && !Number.isFinite(amountEur)) {
      amountEur = PRO_KLASE_MISSING_REPORT_PENALTY_EUR;
    }
    if (!Number.isFinite(amountEur) || amountEur === 0) {
      return json(res, 400, { error: 'Invalid amountEur' });
    }

    const { data: row, error: insertErr } = await supabase
      .from('tutor_adjustments')
      .insert({
        organization_id: orgId,
        tutor_id: tutorId,
        session_id: sessionId,
        type,
        amount_eur: amountEur,
        reason,
        created_by: adminId,
      })
      .select('id, amount_eur, type, created_at')
      .single();

    if (insertErr) return json(res, 500, { error: 'Insert failed', details: insertErr.message });

    // Email in background — don't block the admin UI on Resend latency.
    const adjustmentId = row.id;
    const tutorEmail = tutorInOrg.data.email as string | undefined;
    void (async () => {
      try {
        if (!tutorEmail) return;
        const appUrl = process.env.APP_URL || process.env.VITE_APP_URL || 'https://tutlio.lt';
        await fetch(`${appUrl}/api/send-email`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${serviceKey}`,
            'x-internal-key': serviceKey,
          },
          body: JSON.stringify({
            type: 'tutor_adjustment_notice',
            to: tutorEmail,
            data: {
              tutorName: tutorInOrg.data.full_name || '',
              amountEur,
              reason: reason || type,
              financeUrl: `${appUrl}/finance`,
            },
          }),
        });
        await supabase
          .from('tutor_adjustments')
          .update({ notified_at: new Date().toISOString() })
          .eq('id', adjustmentId);
      } catch (notifyErr) {
        console.error('[tutor-adjustment] notify failed:', notifyErr);
      }
    })();

    return json(res, 200, { success: true, adjustment: row });
  } catch (err: any) {
    console.error('[tutor-adjustment] error:', err?.message || err);
    return json(res, 500, { error: 'Internal server error' });
  }
}
