// Org admin corrects a linked student's email. Managed username accounts keep
// their stable login handle and use the real address only for communication.
// Ordinary email accounts keep auth.users, profiles, and students in sync.
//
// POST { studentId, email }

import type { VercelRequest, VercelResponse } from './types';
import { createClient } from '@supabase/supabase-js';
import { verifyRequestAuth } from './_lib/auth.js';
import { findAuthUserByEmail } from './_lib/findAuthUserByEmail.js';
import { getOrgAdminAccessByUserId } from './_lib/orgAdminAccess.js';
import { hasOrgAdminPermission } from '../src/lib/orgAdminPermissions.js';
import { isMoksloVaisiaiOrg } from './_lib/marketMoney.js';
import { isStudentLoginName, studentLoginNameFromEmail } from '../src/lib/studentLoginIdentity.js';

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

    const adminAccess = await getOrgAdminAccessByUserId(supabase, auth.userId);
    if (!adminAccess || !hasOrgAdminPermission(adminAccess.role, adminAccess.permissions, 'students.edit')) {
      return json(res, 403, { error: 'Only organization admin can update student email' });
    }
    const adminRow = { organization_id: adminAccess.organizationId };

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

    const { data: authData, error: authReadErr } = await supabase.auth.admin.getUserById(linkedUserId);
    const authUser = authData.user;
    if (authReadErr || !authUser?.email) {
      return json(res, 404, { error: 'linked_auth_user_not_found' });
    }

    const originalAppMetadata = { ...(authUser.app_metadata || {}) } as Record<string, unknown>;
    const storedLoginName = typeof originalAppMetadata.student_login_name === 'string'
      ? originalAppMetadata.student_login_name.trim().toLowerCase()
      : '';
    const managedUsernameAccount =
      isMoksloVaisiaiOrg(student.organization_id)
      && originalAppMetadata.provisioned_by_organization === student.organization_id
      && isStudentLoginName(storedLoginName)
      && studentLoginNameFromEmail(authUser.email) === storedLoginName;

    const currentEmail = normalizeEmail(student.email);
    if (nextEmail === currentEmail) {
      // Keep the recovery/notification address synchronized even when the
      // students row was already changed by an earlier or partial update.
      if (managedUsernameAccount && originalAppMetadata.student_contact_email !== nextEmail) {
        const { error: contactRepairError } = await supabase.auth.admin.updateUserById(linkedUserId, {
          app_metadata: { ...originalAppMetadata, student_contact_email: nextEmail },
        });
        if (contactRepairError) {
          return json(res, 500, { error: 'auth_metadata_repair_failed', details: contactRepairError.message });
        }
        return json(res, 200, {
          success: true,
          unchanged: true,
          metadataRepaired: true,
          loginIdentifier: storedLoginName,
        });
      }

      // Repair metadata left by the older flow, which changed Auth to the real
      // email but left StudentSettings displaying a retired mv-* handle.
      if (storedLoginName && !managedUsernameAccount) {
        // GoTrue merges app_metadata updates, so omitted keys can survive.
        // Explicit nulls retire the stale values reliably.
        const cleanedAppMetadata = {
          ...originalAppMetadata,
          student_login_name: null,
          student_contact_email: null,
        };
        const { error: cleanupError } = await supabase.auth.admin.updateUserById(linkedUserId, {
          app_metadata: cleanedAppMetadata,
        });
        if (cleanupError) {
          return json(res, 500, { error: 'auth_metadata_cleanup_failed', details: cleanupError.message });
        }
        return json(res, 200, {
          success: true,
          unchanged: true,
          metadataRepaired: true,
          loginIdentifier: authUser.email,
        });
      }
      return json(res, 200, {
        success: true,
        unchanged: true,
        loginIdentifier: managedUsernameAccount ? storedLoginName : authUser.email,
      });
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

    const { data: linkedProfile } = await supabase
      .from('profiles')
      .select('email')
      .eq('id', linkedUserId)
      .maybeSingle();
    const previousProfileEmail = linkedProfile?.email ?? null;

    const nextAppMetadata = { ...originalAppMetadata };
    if (managedUsernameAccount) {
      nextAppMetadata.student_contact_email = nextEmail;
    } else {
      // GoTrue merges app_metadata updates rather than replacing the object.
      nextAppMetadata.student_login_name = null;
      nextAppMetadata.student_contact_email = null;
    }

    const authUpdate = managedUsernameAccount
      ? { app_metadata: nextAppMetadata }
      : { email: nextEmail, email_confirm: true, app_metadata: nextAppMetadata };
    const { error: authUpdateErr } = await supabase.auth.admin.updateUserById(linkedUserId, authUpdate);
    if (authUpdateErr) {
      const msg = authUpdateErr.message || '';
      if (/already|registered|exists/i.test(msg)) {
        return json(res, 409, { error: 'email_already_used', details: msg });
      }
      return json(res, 500, { error: 'auth_update_failed', details: msg });
    }

    const restoreAuth = async () => {
      const rollback = managedUsernameAccount
        ? { app_metadata: originalAppMetadata }
        : { email: authUser.email!, email_confirm: true, app_metadata: originalAppMetadata };
      const { error } = await supabase.auth.admin.updateUserById(linkedUserId, rollback);
      if (error) console.error('[admin-update-student-email] auth rollback failed', error.message);
    };

    const { error: profileErr } = await supabase
      .from('profiles')
      .update({ email: nextEmail })
      .eq('id', linkedUserId);
    if (profileErr) {
      await restoreAuth();
      return json(res, 500, { error: 'profile_update_failed', details: profileErr.message });
    }

    const { error: studentUpdateErr } = await supabase
      .from('students')
      .update({ email: nextEmail })
      .eq('id', studentId);
    if (studentUpdateErr) {
      const { error: profileRollbackError } = await supabase
        .from('profiles')
        .update({ email: previousProfileEmail })
        .eq('id', linkedUserId);
      if (profileRollbackError) {
        console.error('[admin-update-student-email] profile rollback failed', profileRollbackError.message);
      }
      await restoreAuth();
      return json(res, 500, { error: 'student_update_failed', details: studentUpdateErr.message });
    }

    return json(res, 200, {
      success: true,
      email: nextEmail,
      loginIdentifier: managedUsernameAccount ? storedLoginName : nextEmail,
      loginChanged: !managedUsernameAccount,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[admin-update-student-email]', msg);
    return json(res, 500, { error: 'Internal server error' });
  }
}
