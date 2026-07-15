// Org admin corrects a linked student's login email — keeps auth.users,
// profiles, and students rows in sync.
//
// POST { studentId, email }

import type { VercelRequest, VercelResponse } from './types';
import { createClient } from '@supabase/supabase-js';
import { verifyRequestAuth } from './_lib/auth.js';
import { findAuthUserByEmail } from './_lib/findAuthUserByEmail.js';

function json(res: VercelResponse, status: number, body: Record<string, unknown>) {
  return res.status(status).json(body);
}

function normalizeEmail(raw: unknown): string {
  return String(raw || '').trim().toLowerCase();
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return json(res, 405, { error: 'Method not allowed' });
  }

  try {
    const auth = await verifyRequestAuth(req);
    if (!auth || auth.isInternal || !auth.userId) {
      return json(res, 401, { error: 'Unauthorized' });
    }

    const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceKey) {
      return json(res, 500, { error: 'Missing Supabase env vars' });
    }

    const studentId = String(req.body?.studentId || '').trim();
    const nextEmail = normalizeEmail(req.body?.email);
    if (!studentId) return json(res, 400, { error: 'Missing studentId' });
    if (!nextEmail || !nextEmail.includes('@')) {
      return json(res, 400, { error: 'Invalid email' });
    }

    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: adminRow } = await supabase
      .from('organization_admins')
      .select('organization_id')
      .eq('user_id', auth.userId)
      .maybeSingle();
    if (!adminRow?.organization_id) {
      return json(res, 403, { error: 'Only organization admin can update student email' });
    }

    const { data: student, error: studentErr } = await supabase
      .from('students')
      .select('id, email, organization_id, linked_user_id')
      .eq('id', studentId)
      .maybeSingle();
    if (studentErr || !student) {
      return json(res, 404, { error: 'Student not found' });
    }
    if (student.organization_id !== adminRow.organization_id) {
      return json(res, 403, { error: 'Student does not belong to your organization' });
    }

    const linkedUserId = String(student.linked_user_id || '').trim();
    if (!linkedUserId) {
      return json(res, 409, { error: 'student_not_linked', hint: 'Update students.email directly — no auth account yet.' });
    }

    const currentEmail = normalizeEmail(student.email);
    if (nextEmail === currentEmail) {
      return json(res, 200, { success: true, unchanged: true });
    }

    const { data: tutorConflict } = await supabase
      .from('profiles')
      .select('id, full_name, email')
      .eq('organization_id', adminRow.organization_id)
      .ilike('email', nextEmail)
      .neq('id', linkedUserId)
      .maybeSingle();
    if (tutorConflict) {
      return json(res, 409, {
        error: 'email_matches_org_tutor',
        tutorName: tutorConflict.full_name || tutorConflict.email,
      });
    }

    const { data: studentConflict } = await supabase
      .from('students')
      .select('id')
      .eq('organization_id', adminRow.organization_id)
      .ilike('email', nextEmail)
      .neq('id', studentId)
      .maybeSingle();
    if (studentConflict) {
      return json(res, 409, { error: 'email_already_used' });
    }

    const { data: profileConflict } = await supabase
      .from('profiles')
      .select('id')
      .ilike('email', nextEmail)
      .neq('id', linkedUserId)
      .maybeSingle();
    if (profileConflict) {
      return json(res, 409, { error: 'email_already_used' });
    }

    const existingAuth = await findAuthUserByEmail(supabase, nextEmail);
    if (existingAuth && existingAuth.id !== linkedUserId) {
      return json(res, 409, { error: 'email_already_used' });
    }

    const { error: authUpdateErr } = await supabase.auth.admin.updateUserById(linkedUserId, {
      email: nextEmail,
      email_confirm: true,
    });
    if (authUpdateErr) {
      const msg = authUpdateErr.message || '';
      if (/already|registered|exists/i.test(msg)) {
        return json(res, 409, { error: 'email_already_used', details: msg });
      }
      return json(res, 500, { error: 'auth_update_failed', details: msg });
    }

    const { error: profileErr } = await supabase
      .from('profiles')
      .update({ email: nextEmail })
      .eq('id', linkedUserId);
    if (profileErr) {
      return json(res, 500, { error: 'profile_update_failed', details: profileErr.message });
    }

    const { error: studentUpdateErr } = await supabase
      .from('students')
      .update({ email: nextEmail })
      .eq('id', studentId);
    if (studentUpdateErr) {
      return json(res, 500, { error: 'student_update_failed', details: studentUpdateErr.message });
    }

    return json(res, 200, { success: true, email: nextEmail });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[admin-update-student-email]', msg);
    return json(res, 500, { error: 'Internal server error' });
  }
}
