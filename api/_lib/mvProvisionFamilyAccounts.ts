import type { SupabaseClient } from '@supabase/supabase-js';
import { randomBytes } from 'node:crypto';
import { isAuthEmailAlreadyRegistered } from './findAuthUserByEmail.js';
import { generateTempPassword } from './generateTempPassword.js';
import { isMoksloVaisiaiOrg } from './marketMoney.js';
import { sendMvAccountActivationEmail } from './sendMvFamilyAccountsEmail.js';
import { inviteEmailLocale, orgAwareOrigin } from './public-origin.js';
import {
  buildMvAccountActivationToken,
  buildMvAccountActivationUrl,
  type MvActivationRole,
} from './mvAccountActivationToken.js';
import { resolveMvNotifyTargets, type MvEmailDelivery } from '../../src/lib/mvProvisionOptions.js';
import { loginIdentifierToEmail } from '../../src/lib/studentLoginIdentity.js';

export type MvProvisionScope = 'auto' | 'both' | 'parent' | 'student';

export type MvProvisionInput = {
  studentId: string;
  parentName?: string;
  parentEmail?: string;
  studentFullName?: string;
  studentEmail?: string;
  locale?: string;
  appOrigin: string;
  scope?: MvProvisionScope;
  emailDelivery?: MvEmailDelivery;
  parentNotifyEmail?: string;
  studentNotifyEmail?: string;
  bothNotifyEmail?: string;
};

export type MvProvisionAccountResult = {
  /** User-facing email address or generated student username. */
  email: string;
  password: string;
  userId: string;
  created: boolean;
  emailSent: boolean;
  emailError?: string;
  activationUrl: string;
  notifyEmail: string;
};

export type MvProvisionResult =
  | {
      ok: true;
      parent?: MvProvisionAccountResult;
      student?: MvProvisionAccountResult;
    }
  | { ok: false; status: number; error: string; code?: string };

export async function ensureMvAuthUser(
  supabase: SupabaseClient,
  opts: {
    email: string;
    password: string;
    role: MvActivationRole;
    fullName: string;
    studentId?: string;
    organizationId?: string | null;
    studentLoginName?: string | null;
    studentContactEmail?: string | null;
  },
): Promise<{ userId: string; created: boolean } | { error: string; code?: string }> {
  const email = opts.email.trim().toLowerCase();
  const metadata: Record<string, unknown> = {
    role: opts.role,
    full_name: opts.fullName.trim(),
  };
  // Username accounts must not expose their internal alias to the legacy
  // auth trigger. They are linked explicitly after user creation below.
  if (opts.role === 'student' && opts.studentId && !opts.studentLoginName) {
    metadata.student_id = opts.studentId;
  }

  const appMetadata: Record<string, unknown> = {};
  if (opts.organizationId) appMetadata.provisioned_by_organization = opts.organizationId;
  if (opts.studentLoginName) appMetadata.student_login_name = opts.studentLoginName;
  if (opts.studentContactEmail) appMetadata.student_contact_email = opts.studentContactEmail;

  const { data: authData, error: authErr } = await supabase.auth.admin.createUser({
    email,
    password: opts.password,
    email_confirm: true,
    user_metadata: metadata,
    app_metadata: appMetadata,
  });

  if (!authErr && authData.user) {
    return { userId: authData.user.id, created: true };
  }

  const msg = authErr?.message || '';
  const alreadyRegistered = isAuthEmailAlreadyRegistered(msg) || authErr?.code === 'email_exists';
  if (!alreadyRegistered) {
    return { error: msg || 'Failed to create user', code: 'create_user_failed' };
  }

  // A provisioning retry must never reset, relabel, or attach an existing
  // account solely because an administrator entered the same email address.
  return { error: 'Email already registered', code: 'email_already_registered' };
}

async function linkParentToStudent(
  supabase: SupabaseClient,
  parentUserId: string,
  parentName: string,
  parentEmail: string,
  studentId: string,
) {
  const { data: profileRow, error: profErr } = await supabase
    .from('parent_profiles')
    .upsert(
      {
        user_id: parentUserId,
        full_name: parentName.trim(),
        email: parentEmail.trim().toLowerCase(),
      },
      { onConflict: 'user_id' },
    )
    .select('id')
    .single();

  if (profErr || !profileRow) {
    throw profErr || new Error('parent_profiles upsert failed');
  }

  const parentProfileId = profileRow.id as string;

  const { error: psErr } = await supabase.from('parent_students').upsert(
    { parent_id: parentProfileId, student_id: studentId },
    { onConflict: 'parent_id,student_id' },
  );
  if (psErr) throw psErr;

  await supabase.from('students').update({ parent_user_id: parentUserId }).eq('id', studentId);

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
          user_id: parentUserId,
          last_read_at: new Date().toISOString(),
          email_notify_enabled: true,
          email_notify_delay_hours: 12,
        },
        { onConflict: 'conversation_id,user_id' },
      );
    }
  }
}

function validEmail(value?: string | null): value is string {
  const email = (value || '').trim().toLowerCase();
  return email.includes('@');
}

async function sendActivationEmail(opts: {
  role: MvActivationRole;
  to: string;
  recipientName: string;
  studentName: string;
  accountEmail: string;
  accountIdentifier?: string;
  tempPassword: string;
  studentId: string;
  appOrigin: string;
  orgName: string | null;
  organizationId: string | null;
  locale: string;
}): Promise<{ emailSent: boolean; emailError?: string; activationUrl: string }> {
  const token = buildMvAccountActivationToken({
    studentId: opts.studentId,
    role: opts.role,
    email: opts.accountIdentifier || opts.accountEmail,
  });
  const activationUrl = buildMvAccountActivationUrl(opts.appOrigin, token);
  const emailResult = await sendMvAccountActivationEmail(opts.to, {
    role: opts.role,
    recipientName: opts.recipientName,
    studentName: opts.studentName,
    accountEmail: opts.accountEmail,
    accountIdentifier: opts.accountIdentifier,
    tempPassword: opts.tempPassword,
    activationUrl,
    orgName: opts.orgName,
    organizationId: opts.organizationId,
    locale: opts.locale,
  });
  if (emailResult.ok === false) {
    return { emailSent: false, emailError: emailResult.error, activationUrl };
  }
  return { emailSent: true, activationUrl };
}

export async function provisionMvFamilyAccounts(
  supabase: SupabaseClient,
  input: MvProvisionInput,
): Promise<MvProvisionResult> {
  const studentId = input.studentId.trim();
  const scope: MvProvisionScope = input.scope || 'auto';

  if (!studentId) return { ok: false, status: 400, error: 'studentId is required', code: 'missing_student' };

  const { data: student, error: stErr } = await supabase
    .from('students')
    .select('id, full_name, email, tutor_id, organization_id, linked_user_id, parent_user_id, payer_name, payer_email')
    .eq('id', studentId)
    .maybeSingle();

  if (stErr || !student) return { ok: false, status: 404, error: 'Student not found', code: 'student_not_found' };

  const organizationId = (student.organization_id as string | null) ?? null;
  if (!isMoksloVaisiaiOrg(organizationId)) {
    return { ok: false, status: 403, error: 'Only Mokslo vaisiai org supports account provisioning', code: 'org_not_mv' };
  }

  const parentName = (input.parentName || (student.payer_name as string | null) || '').trim();
  const parentEmail = (input.parentEmail || (student.payer_email as string | null) || '').trim().toLowerCase();
  const studentFullName = (input.studentFullName || (student.full_name as string | null) || '').trim();
  const studentEmail = (input.studentEmail || (student.email as string | null) || '').trim().toLowerCase();

  const needsParent = !student.parent_user_id && validEmail(parentEmail);
  const needsStudent = !student.linked_user_id;

  let doParent = scope === 'parent' || scope === 'both';
  let doStudent = scope === 'student' || scope === 'both';
  if (scope === 'auto') {
    doParent = needsParent;
    doStudent = needsStudent;
  }

  if (!doParent && !doStudent) {
    return { ok: false, status: 409, error: 'Accounts already linked or missing emails', code: 'nothing_to_provision' };
  }

  if (doParent && !validEmail(parentEmail)) {
    return { ok: false, status: 400, error: 'Parent email is required', code: 'parent_email_invalid' };
  }
  if (doParent && !parentName) {
    return { ok: false, status: 400, error: 'Parent name is required', code: 'parent_name_required' };
  }
  if (doStudent && !studentFullName) {
    return { ok: false, status: 400, error: 'Student name is required', code: 'student_name_required' };
  }
  if (doParent && doStudent && validEmail(studentEmail) && parentEmail === studentEmail) {
    return { ok: false, status: 400, error: 'Parent and student emails must differ', code: 'emails_must_differ' };
  }

  const tutorId = student.tutor_id as string | null;

  let orgLocale: string | null = null;
  let orgName: string | null = null;
  if (organizationId) {
    const { data: orgRow } = await supabase
      .from('organizations')
      .select('name, preferred_locale, logo_url, brand_color, brand_color_secondary, features')
      .eq('id', organizationId)
      .maybeSingle();
    orgName = (orgRow?.name as string | null) ?? null;
    orgLocale = (orgRow?.preferred_locale as string | null) ?? null;
  }

  const appOrigin = orgAwareOrigin(orgLocale, input.appOrigin);
  const emailLocale = inviteEmailLocale(input.locale || orgLocale || undefined, appOrigin);

  const notifyTargets = resolveMvNotifyTargets({
    emailDelivery: input.emailDelivery,
    parentAccountEmail: parentEmail,
    studentAccountEmail: studentEmail,
    parentNotifyEmail: input.parentNotifyEmail,
    studentNotifyEmail: input.studentNotifyEmail,
    bothNotifyEmail: input.bothNotifyEmail,
  });

  if (doStudent && !validEmail(studentEmail) && !validEmail(notifyTargets.studentTo)) {
    return {
      ok: false,
      status: 400,
      error: 'A parent or notification email is required for a student username account',
      code: 'student_contact_email_invalid',
    };
  }

  const result: { parent?: MvProvisionAccountResult; student?: MvProvisionAccountResult } = {};

  if (doParent) {
    const parentPassword = generateTempPassword();
    const parentAuth = await ensureMvAuthUser(supabase, {
      email: parentEmail,
      password: parentPassword,
      role: 'parent',
      fullName: parentName,
      organizationId,
    });
    if ('error' in parentAuth) {
      return { ok: false, status: 400, error: parentAuth.error, code: parentAuth.code };
    }
    if (tutorId && tutorId === parentAuth.userId) {
      if (parentAuth.created) await supabase.auth.admin.deleteUser(parentAuth.userId);
      return { ok: false, status: 400, error: 'Parent email matches assigned tutor account', code: 'parent_is_tutor' };
    }
    try {
      await linkParentToStudent(supabase, parentAuth.userId, parentName, parentEmail, studentId);
    } catch (e: unknown) {
      if (parentAuth.created) await supabase.auth.admin.deleteUser(parentAuth.userId);
      const message = e instanceof Error ? e.message : String(e);
      return { ok: false, status: 500, error: message, code: 'link_parent_failed' };
    }
    const parentNotifyTo = notifyTargets.parentTo;
    const mail = await sendActivationEmail({
      role: 'parent',
      to: parentNotifyTo,
      recipientName: parentName,
      studentName: studentFullName || parentName,
      accountEmail: parentEmail,
      tempPassword: parentPassword,
      studentId,
      appOrigin,
      orgName,
      organizationId,
      locale: emailLocale,
    });
    result.parent = {
      email: parentEmail,
      password: parentPassword,
      userId: parentAuth.userId,
      created: parentAuth.created,
      emailSent: mail.emailSent,
      emailError: mail.emailError,
      activationUrl: mail.activationUrl,
      notifyEmail: parentNotifyTo,
    };
  }

  if (doStudent) {
    const studentPassword = generateTempPassword();
    const studentLoginName = validEmail(studentEmail)
      ? null
      : `mv-${randomBytes(8).toString('hex')}`;
    const studentAuthEmail = studentLoginName
      ? loginIdentifierToEmail(studentLoginName)
      : studentEmail;
    const studentAuth = await ensureMvAuthUser(supabase, {
      email: studentAuthEmail,
      password: studentPassword,
      role: 'student',
      fullName: studentFullName,
      studentId,
      organizationId,
      studentLoginName,
      studentContactEmail: studentLoginName ? notifyTargets.studentTo : null,
    });
    if ('error' in studentAuth) {
      return { ok: false, status: 400, error: studentAuth.error, code: studentAuth.code };
    }
    if (tutorId && tutorId === studentAuth.userId) {
      if (studentAuth.created) await supabase.auth.admin.deleteUser(studentAuth.userId);
      return {
        ok: false,
        status: 400,
        error: 'Student email matches assigned tutor account',
        code: 'student_is_tutor',
      };
    }

    const { error: profileErr } = await supabase.from('profiles').upsert({
      id: studentAuth.userId,
      email: studentLoginName ? null : studentEmail,
      full_name: studentFullName,
      organization_id: null,
    }, { onConflict: 'id' });
    if (profileErr) {
      if (studentAuth.created) await supabase.auth.admin.deleteUser(studentAuth.userId);
      return { ok: false, status: 500, error: profileErr.message, code: 'student_profile_failed' };
    }

    const studentUpdate: Record<string, unknown> = {
      full_name: studentFullName,
      email: studentLoginName ? null : studentEmail,
      linked_user_id: studentAuth.userId,
    };
    if (doParent || student.parent_user_id) {
      studentUpdate.payment_payer = 'parent';
    }
    if (doParent) {
      studentUpdate.payer_name = parentName;
      studentUpdate.payer_email = parentEmail;
    }

    const { error: linkErr } = await supabase.from('students').update(studentUpdate).eq('id', studentId);
    if (linkErr) {
      if (studentAuth.created) await supabase.auth.admin.deleteUser(studentAuth.userId);
      return { ok: false, status: 500, error: linkErr.message, code: 'link_student_failed' };
    }

    const studentNotifyTo = notifyTargets.studentTo;
    const studentRecipientName =
      studentNotifyTo === notifyTargets.parentTo && parentName ? parentName : studentFullName;
    const mail = await sendActivationEmail({
      role: 'student',
      to: studentNotifyTo,
      recipientName: studentRecipientName,
      studentName: studentFullName,
      accountEmail: studentAuthEmail,
      accountIdentifier: studentLoginName || studentEmail,
      tempPassword: studentPassword,
      studentId,
      appOrigin,
      orgName,
      organizationId,
      locale: emailLocale,
    });
    result.student = {
      email: studentLoginName || studentEmail,
      password: studentPassword,
      userId: studentAuth.userId,
      created: studentAuth.created,
      emailSent: mail.emailSent,
      emailError: mail.emailError,
      activationUrl: mail.activationUrl,
      notifyEmail: studentNotifyTo,
    };
  } else if (doParent) {
    await supabase.from('students').update({
      payer_name: parentName,
      payer_email: parentEmail,
      payment_payer: 'parent',
    }).eq('id', studentId);
  }

  return { ok: true, ...result };
}
