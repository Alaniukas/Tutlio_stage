// ─── Vercel Serverless Function: Register Student ───
// POST /api/register-student
// Creates a Supabase auth user via admin API with email pre-confirmed
// (student already proved ownership by clicking the invite link).

import type { VercelRequest, VercelResponse } from './types';
import { createClient } from '@supabase/supabase-js';
import { insertParentInviteAndSendEmail } from './_lib/parentInvite.js';
import { inviteEmailLocale, publicOriginFromRequest } from './_lib/public-origin.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const appOrigin = publicOriginFromRequest(req);

    if (!supabaseUrl || !serviceKey) {
      return res.status(500).json({ error: 'Missing Supabase env vars' });
    }

    const {
      email,
      password,
      studentId,
      fullName,
      phone,
      age,
      grade,
      subjectId,
      payerType,
      payerName,
      payerEmail,
      payerPhone,
      acceptedAt,
      /** When true (e.g. school org), skip parent invite email — admin may send separately; student can resend from portal. */
      suppressParentInvite,
      locale,
    } = req.body || {};

    if (!email || !password || !studentId) {
      return res.status(400).json({ error: 'Missing required fields: email, password, studentId' });
    }

    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: student, error: studentErr } = await supabase
      .from('students')
      .select('id, tutor_id, email, linked_user_id')
      .eq('id', studentId)
      .maybeSingle();

    if (studentErr || !student) {
      return res.status(404).json({ error: 'Student record not found' });
    }

    if (student.linked_user_id) {
      return res.status(409).json({ error: 'Student account already linked' });
    }

    const submittedEmail = String(email).trim().toLowerCase();
    if (!submittedEmail.includes('@')) {
      return res.status(400).json({ error: 'Invalid email address' });
    }

    const studentEmail = String(student.email || '').trim().toLowerCase();
    if (studentEmail.length > 0 && studentEmail !== submittedEmail) {
      console.warn('[register-student] Student email updated during onboarding', {
        studentId,
        previousEmail: student.email,
        nextEmail: submittedEmail,
      });
    }

    const signupPayload = {
      full_name: fullName,
      role: 'student',
      student_id: studentId,
      email: submittedEmail,
      phone: phone || null,
      age: age || null,
      grade: grade || null,
      subject_id: subjectId || null,
      payment_payer: payerType || null,
      payer_name: payerType === 'parent' ? payerName : null,
      payer_email: payerType === 'parent' ? payerEmail : null,
      payer_phone: payerType === 'parent' ? payerPhone : null,
      accepted_privacy_policy_at: acceptedAt || null,
      accepted_terms_at: acceptedAt || null,
    };

    let authUserId: string | null = null;

    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: submittedEmail,
      password,
      email_confirm: true,
      user_metadata: signupPayload,
    });

    if (authError || !authData.user) {
      const msg = authError?.message || '';
      const alreadyRegistered =
        /already registered|already been registered|duplicate/i.test(msg);
      if (alreadyRegistered) {
        let existing: { id: string } | undefined;
        for (let page = 1; page <= 20 && !existing; page++) {
          const { data: { users }, error: listErr } = await supabase.auth.admin.listUsers({
            page,
            perPage: 100,
          });
          if (listErr || !users?.length) break;
          existing = users.find(
            (u: { email?: string }) =>
              (u.email || '').trim().toLowerCase() === submittedEmail,
          );
          if (users.length < 100) break;
        }
        if (existing?.id) {
          authUserId = existing.id;
          const { error: pwErr } = await supabase.auth.admin.updateUserById(existing.id, {
            password,
            user_metadata: signupPayload,
          });
          if (pwErr) {
            console.warn('[register-student] could not update password for existing user:', pwErr.message);
          }
        }
      }
      if (!authUserId) {
        return res.status(400).json({
          error: alreadyRegistered
            ? 'This email is already registered. Sign in or use password reset.'
            : authError?.message || 'Failed to create user',
          code: alreadyRegistered ? 'email_already_registered' : 'create_user_failed',
        });
      }
    } else {
      authUserId = authData.user.id;
    }

    await supabase.from('students').update({
      email: submittedEmail,
      linked_user_id: authUserId,
      phone: phone || null,
      age: (() => {
        const n = Number(age);
        return Number.isFinite(n) ? n : null;
      })(),
      grade: grade || null,
      subject_id: subjectId || null,
      payment_payer: payerType || null,
      payer_name: payerType === 'parent' ? payerName : null,
      payer_email: payerType === 'parent' ? payerEmail : null,
      payer_phone: payerType === 'parent' ? payerPhone : null,
      accepted_privacy_policy_at: acceptedAt || null,
      accepted_terms_at: acceptedAt || null,
    }).eq('id', studentId);

    let parentInviteSent = false;
    let parentInviteCode: string | null = null;
    let parentInviteError: string | null = null;
    const skipInvite = !!suppressParentInvite;
    if (
      payerType === 'parent' &&
      payerEmail &&
      String(payerEmail).trim().includes('@') &&
      !skipInvite
    ) {
      const inviteRes = await insertParentInviteAndSendEmail({
        supabase,
        appUrl: appOrigin,
        parentEmail: String(payerEmail).trim(),
        studentId,
        studentFullName: String(fullName || ''),
        parentName: payerName ? String(payerName).trim() : null,
        source: 'student_self',
        invitedByUserId: authUserId,
        locale: inviteEmailLocale(typeof locale === 'string' ? locale : undefined, appOrigin),
        uiLocale: typeof locale === 'string' ? locale : undefined,
      });
      if ('error' in inviteRes) {
        console.warn('[register-student] parent invite create:', inviteRes.error);
        parentInviteError = inviteRes.error;
      } else {
        parentInviteCode = inviteRes.code;
        parentInviteSent = inviteRes.emailSent;
        if (!inviteRes.emailSent) {
          parentInviteError = inviteRes.emailError || 'Email send failed';
          console.warn('[register-student] parent invite email:', parentInviteError);
        }
      }
    }

    return res.status(200).json({
      success: true,
      userId: authUserId,
      parentInviteSent,
      parentInviteCode,
      parentInviteError,
      parentInviteSkipped: skipInvite || payerType !== 'parent',
    });
  } catch (err: any) {
    console.error('[register-student] Error:', err?.message || err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
