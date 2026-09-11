import type { SupabaseClient } from '@supabase/supabase-js';
import { randomBytes } from 'node:crypto';
import { findAuthUserByEmail, isAuthEmailAlreadyRegistered } from './findAuthUserByEmail.js';
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
  studentIds?: string[];
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
  password?: string;
  userId: string;
  created: boolean;
  reused?: boolean;
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

type MvProvisionStudentRow = {
  id: string;
  full_name: string | null;
  email: string | null;
  tutor_id: string | null;
  organization_id: string | null;
  linked_user_id: string | null;
  parent_user_id: string | null;
  payer_name: string | null;
  payer_email: string | null;
  detached_at?: string | null;
};

function normalizeIdentityText(value?: string | null): string {
  return (value || '').normalize('NFC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('lt');
}

function sameMvFamilyIdentity(a: MvProvisionStudentRow, b: MvProvisionStudentRow): boolean {
  if (a.id === b.id) return true;
  if (a.organization_id !== b.organization_id) return false;
  if (!normalizeIdentityText(a.full_name) || normalizeIdentityText(a.full_name) !== normalizeIdentityText(b.full_name)) {
    return false;
  }

  const same = (left?: string | null, right?: string | null) => {
    const l = normalizeIdentityText(left);
    const r = normalizeIdentityText(right);
    return Boolean(l && r && l === r);
  };

  return same(a.linked_user_id, b.linked_user_id)
    || same(a.parent_user_id, b.parent_user_id)
    || same(a.email, b.email)
    || same(a.payer_email, b.payer_email);
}

async function loadProvisionStudents(
  supabase: SupabaseClient,
  selected: MvProvisionStudentRow,
  requestedIds?: string[],
): Promise<MvProvisionStudentRow[] | { error: string; code: string }> {
  const ids = [...new Set([selected.id, ...(requestedIds || [])].map((id) => id.trim()).filter(Boolean))];
  if (ids.length === 1) return [selected];

  const { data, error } = await supabase
    .from('students')
    .select('id, full_name, email, tutor_id, organization_id, linked_user_id, parent_user_id, payer_name, payer_email, detached_at')
    .in('id', ids);
  if (error || !data || data.length !== ids.length) {
    return { error: 'Related student rows could not be loaded', code: 'related_students_missing' };
  }

  const rows = data as MvProvisionStudentRow[];
  if (rows.some((row) => row.detached_at || !sameMvFamilyIdentity(selected, row))) {
    return { error: 'Related student rows do not represent the same child', code: 'related_students_mismatch' };
  }
  return rows;
}

async function linkParentToStudents(
  supabase: SupabaseClient,
  parentUserId: string,
  parentName: string,
  parentEmail: string,
  studentIds: string[],
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
    studentIds.length === 1
      ? { parent_id: parentProfileId, student_id: studentIds[0] }
      : studentIds.map((studentId) => ({ parent_id: parentProfileId, student_id: studentId })),
    { onConflict: 'parent_id,student_id' },
  );
  if (psErr) throw psErr;

  const studentUpdate = supabase.from('students').update({ parent_user_id: parentUserId });
  const { error: studentErr } = studentIds.length === 1
    ? await studentUpdate.eq('id', studentIds[0])
    : await studentUpdate.in('id', studentIds);
  if (studentErr) throw studentErr;

  const studentSelect = supabase.from('students').select('linked_user_id');
  const { data: students } = studentIds.length === 1
    ? await studentSelect.eq('id', studentIds[0])
    : await studentSelect.in('id', studentIds);

  const linkedUserIds = [...new Set((students || [])
    .map((row: { linked_user_id?: string | null }) => row.linked_user_id)
    .filter((id): id is string => Boolean(id)))];
  for (const linkedUid of linkedUserIds) {
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

async function reusableParentUserId(
  supabase: SupabaseClient,
  email: string,
  organizationId: string,
  parentName: string,
): Promise<{ userId: string } | { error: string; code: string } | null> {
  const existing = await findAuthUserByEmail(supabase, email);
  if (!existing?.id) return null;
  const [{ data: authData }, { data: profile }] = await Promise.all([
    supabase.auth.admin.getUserById(existing.id),
    supabase.from('parent_profiles').select('user_id, email').eq('user_id', existing.id).maybeSingle(),
  ]);
  const user = authData?.user;
  const metadataRole = user?.user_metadata?.role;
  const provisionedOrg = user?.app_metadata?.provisioned_by_organization;
  const profileMatches = normalizeIdentityText(profile?.email) === normalizeIdentityText(email);
  const incompleteProvisioningRetry = metadataRole === 'parent'
    && provisionedOrg === organizationId
    && normalizeIdentityText(user?.user_metadata?.full_name) === normalizeIdentityText(parentName);
  if (user && (profileMatches || incompleteProvisioningRetry)) {
    return { userId: existing.id };
  }
  return { error: 'Email already belongs to another account type', code: 'existing_parent_account_conflict' };
}

async function reusableStudentUserId(
  supabase: SupabaseClient,
  email: string,
  organizationId: string,
  students: MvProvisionStudentRow[],
): Promise<{ userId: string } | { error: string; code: string } | null> {
  const existing = await findAuthUserByEmail(supabase, email);
  if (!existing?.id) return null;
  const [{ data: authData }, { data: linkedRows, error: linkedError }] = await Promise.all([
    supabase.auth.admin.getUserById(existing.id),
    supabase
      .from('students')
      .select('id, full_name, email, tutor_id, organization_id, linked_user_id, parent_user_id, payer_name, payer_email, detached_at')
      .eq('linked_user_id', existing.id)
      .is('detached_at', null),
  ]);
  const user = authData?.user;
  if (!user || linkedError || user.user_metadata?.role !== 'student') {
    return { error: 'Email already belongs to another account type', code: 'existing_student_account_conflict' };
  }

  const requestedIds = new Set(students.map((row) => row.id));
  const metadataStudentId = String(user.user_metadata?.student_id || '');
  const linked = (linkedRows || []) as MvProvisionStudentRow[];
  const linkedOnlyToThisChild = linked.length > 0
    && linked.every((row) => sameMvFamilyIdentity(students[0], row));
  const safeByMetadata = requestedIds.has(metadataStudentId)
    && user.app_metadata?.provisioned_by_organization === organizationId;
  if (linkedOnlyToThisChild || safeByMetadata) return { userId: existing.id };

  return { error: 'Email is already linked to another student', code: 'existing_student_account_conflict' };
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
    .select('id, full_name, email, tutor_id, organization_id, linked_user_id, parent_user_id, payer_name, payer_email, detached_at')
    .eq('id', studentId)
    .maybeSingle();

  if (stErr || !student) return { ok: false, status: 404, error: 'Student not found', code: 'student_not_found' };

  const selectedStudent = student as MvProvisionStudentRow;
  if (selectedStudent.detached_at) {
    return { ok: false, status: 404, error: 'Student not found', code: 'student_not_found' };
  }

  const organizationId = selectedStudent.organization_id;
  if (!isMoksloVaisiaiOrg(organizationId)) {
    return { ok: false, status: 403, error: 'Only Mokslo vaisiai org supports account provisioning', code: 'org_not_mv' };
  }

  const loadedStudents = await loadProvisionStudents(supabase, selectedStudent, input.studentIds);
  if ('error' in loadedStudents) {
    return { ok: false, status: 400, error: loadedStudents.error, code: loadedStudents.code };
  }
  const studentRows = loadedStudents;
  const studentIds = studentRows.map((row) => row.id);
  const firstValue = (field: keyof MvProvisionStudentRow): string => (
    String(studentRows.find((row) => String(row[field] || '').trim())?.[field] || '').trim()
  );

  const linkedStudentIds = [...new Set(studentRows.map((row) => row.linked_user_id).filter(Boolean))] as string[];
  const linkedParentIds = [...new Set(studentRows.map((row) => row.parent_user_id).filter(Boolean))] as string[];
  if (linkedStudentIds.length > 1 || linkedParentIds.length > 1) {
    return {
      ok: false,
      status: 409,
      error: 'Related student rows are linked to conflicting accounts',
      code: 'related_account_conflict',
    };
  }

  const parentName = (input.parentName || firstValue('payer_name')).trim();
  const parentEmail = (input.parentEmail || firstValue('payer_email')).trim().toLowerCase();
  const studentFullName = (input.studentFullName || firstValue('full_name')).trim();
  const studentEmail = (input.studentEmail || firstValue('email')).trim().toLowerCase();

  const needsParent = linkedParentIds.length === 0;
  const needsStudent = linkedStudentIds.length === 0;

  let doParent = (scope === 'parent' || scope === 'both') && needsParent;
  let doStudent = (scope === 'student' || scope === 'both') && needsStudent;
  if (scope === 'auto') {
    doParent = needsParent;
    doStudent = needsStudent;
  }

  if (!doParent && !doStudent) {
    return { ok: false, status: 409, error: 'Accounts are already linked', code: 'nothing_to_provision' };
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

  const tutorIds = new Set(studentRows.map((row) => row.tutor_id).filter(Boolean));

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
  let parentUserId = linkedParentIds[0] || null;

  if (doParent) {
    const parentPassword = generateTempPassword();
    let parentAuth: { userId: string; created: boolean; reused?: boolean } | { error: string; code?: string } = await ensureMvAuthUser(supabase, {
      email: parentEmail,
      password: parentPassword,
      role: 'parent',
      fullName: parentName,
      organizationId,
    });
    if ('error' in parentAuth && parentAuth.code === 'email_already_registered') {
      const reusable = await reusableParentUserId(
        supabase,
        parentEmail,
        organizationId || '',
        parentName,
      );
      parentAuth = reusable
        ? ('error' in reusable ? reusable : { ...reusable, created: false, reused: true })
        : parentAuth;
    }
    if ('error' in parentAuth) {
      return { ok: false, status: 400, error: parentAuth.error, code: parentAuth.code };
    }
    if (tutorIds.has(parentAuth.userId)) {
      if (parentAuth.created) await supabase.auth.admin.deleteUser(parentAuth.userId);
      return { ok: false, status: 400, error: 'Parent email matches assigned tutor account', code: 'parent_is_tutor' };
    }
    parentUserId = parentAuth.userId;
    try {
      await linkParentToStudents(supabase, parentAuth.userId, parentName, parentEmail, studentIds);
    } catch (e: unknown) {
      if (parentAuth.created) await supabase.auth.admin.deleteUser(parentAuth.userId);
      const message = e instanceof Error ? e.message : String(e);
      return { ok: false, status: 500, error: message, code: 'link_parent_failed' };
    }
    if (parentAuth.created) {
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
        created: true,
        emailSent: mail.emailSent,
        emailError: mail.emailError,
        activationUrl: mail.activationUrl,
        notifyEmail: parentNotifyTo,
      };
    } else {
      result.parent = {
        email: parentEmail,
        userId: parentAuth.userId,
        created: false,
        reused: true,
        emailSent: false,
        activationUrl: '',
        notifyEmail: notifyTargets.parentTo,
      };
    }
  }

  if (doStudent) {
    const studentPassword = generateTempPassword();
    const studentLoginName = validEmail(studentEmail)
      ? null
      : `mv-${randomBytes(8).toString('hex')}`;
    const studentAuthEmail = studentLoginName
      ? loginIdentifierToEmail(studentLoginName)
      : studentEmail;
    let studentAuth: { userId: string; created: boolean; reused?: boolean } | { error: string; code?: string } = await ensureMvAuthUser(supabase, {
      email: studentAuthEmail,
      password: studentPassword,
      role: 'student',
      fullName: studentFullName,
      studentId,
      organizationId,
      studentLoginName,
      studentContactEmail: studentLoginName ? notifyTargets.studentTo : null,
    });
    if ('error' in studentAuth && studentAuth.code === 'email_already_registered' && validEmail(studentEmail)) {
      const reusable = await reusableStudentUserId(supabase, studentEmail, organizationId || '', studentRows);
      studentAuth = reusable
        ? ('error' in reusable ? reusable : { ...reusable, created: false, reused: true })
        : studentAuth;
    }
    if ('error' in studentAuth) {
      return { ok: false, status: 400, error: studentAuth.error, code: studentAuth.code };
    }
    if (tutorIds.has(studentAuth.userId)) {
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
    if (parentUserId) {
      studentUpdate.payment_payer = 'parent';
    }
    if (doParent) {
      studentUpdate.payer_name = parentName;
      studentUpdate.payer_email = parentEmail;
    }

    const linkQuery = supabase.from('students').update(studentUpdate);
    const { error: linkErr } = studentIds.length === 1
      ? await linkQuery.eq('id', studentIds[0])
      : await linkQuery.in('id', studentIds);
    if (linkErr) {
      if (studentAuth.created) await supabase.auth.admin.deleteUser(studentAuth.userId);
      return { ok: false, status: 500, error: linkErr.message, code: 'link_student_failed' };
    }

    if (parentUserId && validEmail(parentEmail) && parentName) {
      try {
        await linkParentToStudents(supabase, parentUserId, parentName, parentEmail, studentIds);
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e);
        return { ok: false, status: 500, error: message, code: 'link_parent_failed' };
      }
    }

    if (studentAuth.created) {
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
        created: true,
        emailSent: mail.emailSent,
        emailError: mail.emailError,
        activationUrl: mail.activationUrl,
        notifyEmail: studentNotifyTo,
      };
    } else {
      result.student = {
        email: studentEmail,
        userId: studentAuth.userId,
        created: false,
        reused: true,
        emailSent: false,
        activationUrl: '',
        notifyEmail: notifyTargets.studentTo,
      };
    }
  } else if (doParent) {
    const payerQuery = supabase.from('students').update({
      payer_name: parentName,
      payer_email: parentEmail,
      payment_payer: 'parent',
    });
    if (studentIds.length === 1) await payerQuery.eq('id', studentIds[0]);
    else await payerQuery.in('id', studentIds);
  }

  return { ok: true, ...result };
}
