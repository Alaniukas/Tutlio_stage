import type { VercelRequest, VercelResponse } from './types';
import { createClient } from '@supabase/supabase-js';
import { isAuthEmailAlreadyRegistered } from './_lib/findAuthUserByEmail.js';
import { isAcceptedFlag, parentLegalAcceptanceMissing, usesProKlaseLegalDocs } from './_lib/proKlaseLegal.js';
import { sendProKlaseRegistrationWelcomeEmail } from './_lib/sendProKlaseRegistrationWelcomeEmail.js';
import { normalizeStudentGrade1to12 } from './_lib/studentGrade.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return res.status(500).json({ error: 'Missing Supabase configuration' });

  // Note: this endpoint touches tables that may not exist in generated DB types in some deploys.
  // Keep it untyped to avoid build-time typecheck failures.
  const supabase = createClient(url, key) as any;

  try {
    const body = req.body as {
      token?: string;
      code?: string;
      email?: string;
      fullName: string;
      password: string;
      childBirthDate?: string;
      childGrade?: string;
      acceptedPrivacy?: boolean;
      acceptedTerms?: boolean;
      acceptedAt?: string;
    };

    const { token, code, email, fullName, password, childBirthDate, childGrade } = body;

    if (!fullName?.trim() || !password || password.length < 6) {
      return res.status(400).json({ error: 'Missing or invalid fields', code: 'invalid_fields' });
    }

    // Child grade is required (1–12). Birth date is optional.
    const childInfo: { child_birth_date?: string; grade?: string } = {};
    if (typeof childBirthDate === 'string' && childBirthDate.trim()) {
      childInfo.child_birth_date = childBirthDate.trim();
    }
    const normalizedGrade = normalizeStudentGrade1to12(childGrade);
    if (!normalizedGrade) {
      return res.status(400).json({ error: 'Pasirinkite klasę (1–12)', code: 'grade_required' });
    }
    childInfo.grade = normalizedGrade;

    let invite:
      | { id: string; parent_email: string; student_id: string; used: boolean }
      | null = null;

    if (token?.trim()) {
      const trimmedToken = token.trim();
      const { data, error } = await supabase
        .from('parent_invites')
        .select('id, parent_email, student_id, used')
        .eq('token', trimmedToken)
        .maybeSingle();
      if (error) return res.status(500).json({ error: error.message });
      invite = data;
      if (!invite) {
        const { data: byCode, error: codeErr } = await supabase
          .from('parent_invites')
          .select('id, parent_email, student_id, used')
          .eq('code', trimmedToken.toUpperCase())
          .eq('used', false)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (codeErr) return res.status(500).json({ error: codeErr.message });
        invite = byCode;
      }
    } else if (code?.trim() && email?.trim()) {
      const normalizedCode = code.trim().toUpperCase();
      const normalizedEmail = email.trim().toLowerCase();
      const { data, error } = await supabase
        .from('parent_invites')
        .select('id, parent_email, student_id, used')
        .eq('code', normalizedCode)
        .ilike('parent_email', normalizedEmail)
        .maybeSingle();
      if (error) return res.status(500).json({ error: error.message });
      invite = data;
    } else {
      return res.status(400).json({ error: 'Provide token or code and email', code: 'missing_invite' });
    }

    if (!invite) {
      return res.status(404).json({ error: 'Invite not found', code: 'invite_not_found' });
    }
    if (invite.used) {
      return res.status(400).json({ error: 'Invite already used', code: 'invite_used' });
    }

    const { data: studentRow } = await supabase
      .from('students')
      .select('organization_id, tutor_id, detached_at')
      .eq('id', invite.student_id)
      .maybeSingle();
    if (!studentRow || studentRow.detached_at) {
      return res.status(404).json({ error: 'Student record not found', code: 'invite_not_found' });
    }
    const orgId = await studentOrganizationId(supabase, studentRow);
    if (parentLegalAcceptanceMissing({
      orgIdOrSlug: orgId,
      acceptedPrivacy: isAcceptedFlag(body.acceptedPrivacy),
      acceptedTerms: isAcceptedFlag(body.acceptedTerms),
    })) {
      return res.status(400).json({ error: 'Legal acceptance required', code: 'legal_required' });
    }
    const acceptedAt = typeof body.acceptedAt === 'string' && body.acceptedAt.trim()
      ? body.acceptedAt.trim()
      : new Date().toISOString();

    const normalizedEmail = invite.parent_email.trim().toLowerCase();
    const autoLinkSiblings = usesProKlaseLegalDocs(orgId);

    // Read sibling invitations before creating the Auth user so a failed
    // lookup can be retried without leaving a partially registered account.
    let pendingInvites: Array<{ id: string; student_id: string; parent_email: string }> = [];
    if (autoLinkSiblings) {
      const { data, error } = await supabase
        .from('parent_invites')
        .select('id, student_id, parent_email')
        .ilike('parent_email', normalizedEmail)
        .eq('used', false);
      if (error) return res.status(500).json({ error: error.message });
      pendingInvites = data ?? [];
    }

    const { data: authData, error: authErr } = await supabase.auth.admin.createUser({
      email: normalizedEmail,
      password,
      email_confirm: true,
      user_metadata: {
        role: 'parent',
        full_name: fullName.trim(),
      },
    });

    if (authErr) {
      const msg = authErr.message || '';
      const alreadyRegistered = isAuthEmailAlreadyRegistered(msg) || authErr.code === 'email_exists';
      console.error('[register-parent] createUser failed', {
        message: msg,
        code: authErr.code,
        status: authErr.status,
      });
      return res.status(400).json({
        error: alreadyRegistered
          ? 'This email is already registered. Sign in or use password reset.'
          : 'Registration failed',
        code: alreadyRegistered ? 'email_already_registered' : 'registration_failed',
      });
    }

    if (!authData.user) return res.status(500).json({ error: 'User creation failed' });

    try {
      const parentProfileId = await linkParent(supabase, authData.user.id, fullName.trim(), invite.student_id, normalizedEmail, childInfo, {
        acceptedAt: usesProKlaseLegalDocs(orgId) ? acceptedAt : null,
      });
      const linkedInviteIds = [invite.id];

      // A family can receive one invite for each child. Registering from the first
      // invite must attach the remaining children without applying this child's
      // grade or birth date to their records.
      if (autoLinkSiblings) {
        for (const pending of pendingInvites) {
          if (pending.id === invite.id) continue;
          // ILIKE treats '_' and '%' as wildcards; require an exact email match.
          if (pending.parent_email.trim().toLowerCase() !== normalizedEmail) continue;
          const { data: sibling, error: siblingErr } = await supabase
            .from('students')
            .select('organization_id, tutor_id, detached_at, parent_user_id')
            .eq('id', pending.student_id)
            .maybeSingle();
          if (siblingErr) throw siblingErr;
          if (!sibling || sibling.detached_at) continue;
          if (await studentOrganizationId(supabase, sibling) !== orgId) continue;

          await linkParentStudent(supabase, parentProfileId, authData.user.id, pending.student_id, {
            // Keep an existing legacy parent_user_id when a second parent joins.
            setParentUserId: !sibling.parent_user_id || sibling.parent_user_id === authData.user.id,
          });
          linkedInviteIds.push(pending.id);
        }
      }

      // Mark invitations used only after every child was linked. This is one DB
      // statement, so a failed sibling link cannot consume the first invitation.
      const { error: inviteErr } = await supabase
        .from('parent_invites')
        .update({ used: true })
        .in('id', linkedInviteIds);
      if (inviteErr) throw inviteErr;
    } catch (linkErr) {
      // These FKs cascade the new profile/links and null out parent_user_id.
      // Removing only the user created above lets this invitation be retried.
      try {
        const { error: rollbackErr } = await supabase.auth.admin.deleteUser(authData.user.id);
        if (rollbackErr) console.error('[register-parent] Auth rollback failed:', rollbackErr);
      } catch (rollbackErr) {
        console.error('[register-parent] Auth rollback failed:', rollbackErr);
      }
      throw linkErr;
    }

    try {
      const welcome = await sendProKlaseRegistrationWelcomeEmail({
        organizationId: orgId,
        to: normalizedEmail,
        parentName: fullName.trim(),
      });
      if (welcome.ok === false) {
        console.warn('[register-parent] Pro Klasė welcome email:', welcome.error);
      }
    } catch (welcomeErr) {
      console.warn('[register-parent] Pro Klasė welcome email:', welcomeErr);
    }

    return res.status(200).json({ success: true });
  } catch (err: any) {
    console.error('[register-parent] Error:', err?.message || err);
    return res.status(500).json({ error: 'Internal server error', code: 'internal_error' });
  }
}

async function studentOrganizationId(
  supabase: any,
  student: { organization_id?: string | null; tutor_id?: string | null },
): Promise<string | null> {
  if (student.organization_id) return student.organization_id;
  if (!student.tutor_id) return null;
  const { data: tutorRow, error } = await supabase
    .from('profiles')
    .select('organization_id')
    .eq('id', student.tutor_id)
    .maybeSingle();
  if (error) throw error;
  return tutorRow?.organization_id || null;
}

async function linkParent(
  supabase: any,
  userId: string,
  fullName: string,
  studentId: string,
  parentEmail: string,
  childInfo?: { child_birth_date?: string; grade?: string },
  legal?: { acceptedAt?: string | null },
): Promise<string> {
  const { data: profileRow, error: profErr } = await supabase
    .from('parent_profiles')
    .upsert(
      {
        user_id: userId,
        full_name: fullName,
        email: parentEmail,
        ...(legal?.acceptedAt
          ? {
              accepted_privacy_policy_at: legal.acceptedAt,
              accepted_terms_at: legal.acceptedAt,
            }
          : {}),
      },
      { onConflict: 'user_id' }
    )
    .select('id')
    .single();

  if (profErr || !profileRow) {
    console.error('[register-parent] parent_profiles upsert failed', profErr);
    throw profErr || new Error('parent_profiles upsert failed');
  }

  const parentProfileId = profileRow.id as string;

  await linkParentStudent(supabase, parentProfileId, userId, studentId, { childInfo });
  return parentProfileId;
}

async function linkParentStudent(
  supabase: any,
  parentProfileId: string,
  userId: string,
  studentId: string,
  options: {
    childInfo?: { child_birth_date?: string; grade?: string };
    setParentUserId?: boolean;
  } = {},
) {
  const { error: psErr } = await supabase.from('parent_students').upsert(
    { parent_id: parentProfileId, student_id: studentId },
    { onConflict: 'parent_id,student_id' }
  );
  if (psErr) throw psErr;

  const studentUpdate: Record<string, unknown> = {};
  if (options.setParentUserId !== false) studentUpdate.parent_user_id = userId;
  if (options.childInfo?.child_birth_date) studentUpdate.child_birth_date = options.childInfo.child_birth_date;
  if (options.childInfo?.grade) studentUpdate.grade = options.childInfo.grade;
  if (Object.keys(studentUpdate).length > 0) {
    const { error: studentErr } = await supabase.from('students').update(studentUpdate).eq('id', studentId);
    if (studentErr) throw studentErr;
  }

  const { data: st } = await supabase
    .from('students')
    .select('linked_user_id')
    .eq('id', studentId)
    .maybeSingle();

  const linkedUid = st?.linked_user_id as string | null | undefined;
  if (linkedUid) {
    const { data: parts } = await supabase
      .from('chat_participants')
      .select('conversation_id')
      .eq('user_id', linkedUid);

    const convIds = [...new Set((parts ?? []).map((p: { conversation_id: string }) => p.conversation_id))];
    for (const conversation_id of convIds) {
      await supabase.from('chat_participants').upsert(
        {
          conversation_id,
          user_id: userId,
          last_read_at: new Date().toISOString(),
          email_notify_enabled: true,
          email_notify_delay_hours: 12,
        },
        { onConflict: 'conversation_id,user_id' }
      );
    }
  }
}
