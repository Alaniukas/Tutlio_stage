import { Resend } from 'resend';
import type { SupabaseClient } from '@supabase/supabase-js';
import { localizedFromEmail } from './i18n.js';
import { resolveEmailOrgBranding } from './emailOrgBranding.js';
import { resolveOrgEmailReplyTo } from './orgEmailReplyTo.js';
import { getResendApiKey } from './resendConfig.js';
import {
  runSchoolFamilyAccountWorkflow,
  schoolFamilyAccountsOverview,
  signedSchoolFamilyEvidence,
  type SchoolFamilyOrganization,
  type SchoolFamilySkippedInviteRow,
} from './schoolFamilyAccounts.js';
import { normalizeSchoolFamilyEmail } from './schoolFamilyGuardianAccess.js';
import {
  schoolFamilyUnsignedAnnualAdminHtml,
  schoolFamilyUnsignedAnnualAdminSubject,
  schoolFamilyUnsignedAnnualAdminText,
} from './schoolFamilyTransitionInviteEmail.js';

const STUDENT_SELECT = 'id,full_name,email,organization_id,linked_user_id,parent_user_id,payer_name,payer_email,enrollment_status,detached_at';
const CONTRACT_SELECT = 'id,student_id,contract_number,kind,signing_status,archived_at,terminated_at,created_at';
const GUARDIAN_SELECT = 'organization_id,student_id,annual_contract_id,guardian_user_id,guardian_name,guardian_email,identity_hash,evidence_source,signature_id,signature_personal_code_hash,verified_by';

export type SchoolFamilyTransitionFamily = {
  guardianEmail: string;
  guardianName: string;
  studentIds: string[];
  studentNames: string[];
};

export function groupSchoolFamilyTransitionFamilies(
  rows: Array<{ studentId: string; studentName: string; guardianEmail: string; guardianName: string }>,
): SchoolFamilyTransitionFamily[] {
  const groups = new Map<string, SchoolFamilyTransitionFamily>();
  for (const row of rows) {
    const email = normalizeSchoolFamilyEmail(row.guardianEmail);
    const existing = groups.get(email);
    if (existing) {
      if (!existing.studentIds.includes(row.studentId)) {
        existing.studentIds.push(row.studentId);
        existing.studentNames.push(row.studentName);
      }
      continue;
    }
    groups.set(email, {
      guardianEmail: email,
      guardianName: row.guardianName,
      studentIds: [row.studentId],
      studentNames: [row.studentName],
    });
  }
  return [...groups.values()];
}

export async function planSchoolFamilyTransitionInvites(db: SupabaseClient, org: SchoolFamilyOrganization): Promise<{
  families: SchoolFamilyTransitionFamily[];
  skipped: SchoolFamilySkippedInviteRow[];
  overview: Awaited<ReturnType<typeof schoolFamilyAccountsOverview>>;
}> {
  const students: Array<{
    id: string; full_name: string; payer_name: string | null; payer_email: string | null;
  }> = [];
  for (let offset = 0; ; offset += 200) {
    const result = await db.from('students').select(STUDENT_SELECT).eq('organization_id', org.id)
      .eq('enrollment_status', 'active').is('detached_at', null).order('id').range(offset, offset + 199);
    if (result.error) throw new Error('school_family_setup_required');
    students.push(...(result.data || []));
    if ((result.data?.length || 0) < 200) break;
  }
  const studentIds = students.map((row) => row.id);
  const contracts = [];
  for (let offset = 0; offset < studentIds.length; offset += 200) {
    const result = await db.from('school_contracts').select(CONTRACT_SELECT).eq('organization_id', org.id)
      .eq('kind', 'annual').eq('signing_status', 'signed').is('archived_at', null).is('terminated_at', null)
      .in('student_id', studentIds.slice(offset, offset + 200)).order('created_at', { ascending: false });
    if (result.error) throw new Error('school_family_setup_required');
    contracts.push(...(result.data || []));
  }
  const signatures = [];
  for (let offset = 0; offset < contracts.length; offset += 200) {
    const result = await db.from('school_contract_signatures').select('id,contract_id,signer_name,signer_email,signer_personal_code')
      .in('contract_id', contracts.slice(offset, offset + 200).map((row) => row.id)).eq('role', 'parent_primary').eq('status', 'signed');
    if (result.error) throw new Error('school_family_setup_required');
    signatures.push(...(result.data || []));
  }
  const guardians = await db.from('school_family_guardians').select(GUARDIAN_SELECT).eq('organization_id', org.id).in('student_id', studentIds);
  if (guardians.error) throw new Error('school_family_setup_required');
  const eligible: Array<{ studentId: string; studentName: string; guardianEmail: string; guardianName: string }> = [];
  const skipped: SchoolFamilySkippedInviteRow[] = [];
  for (const student of students) {
    const selected = signedSchoolFamilyEvidence(org.id, student.id, contracts as never, signatures as never,
      (guardians.data || []).find((row) => row.student_id === student.id) as never);
    if (!selected.evidence) {
      skipped.push({
        studentId: student.id, studentName: student.full_name, payerName: student.payer_name,
        payerEmail: student.payer_email, reason: selected.reason || 'guardian_verification_required',
      });
      continue;
    }
    eligible.push({
      studentId: student.id, studentName: student.full_name,
      guardianEmail: selected.evidence.guardian_email, guardianName: selected.evidence.guardian_name,
    });
  }
  skipped.sort((a, b) => a.studentName.localeCompare(b.studentName, 'lt'));
  return {
    families: groupSchoolFamilyTransitionFamilies(eligible),
    skipped,
    overview: await schoolFamilyAccountsOverview(db, org),
  };
}

export async function sendSchoolFamilyUnsignedAdminReport(db: SupabaseClient, org: SchoolFamilyOrganization, skipped: SchoolFamilySkippedInviteRow[], to: string[]): Promise<{ sent: boolean; id?: string; code?: string }> {
  if (!skipped.length || !to.length) return { sent: false, code: 'nothing_to_send' };
  if (process.env.TUTLIO_DEV_SUPPRESS_EMAIL === '1') return { sent: false, code: 'suppressed' };
  const apiKey = getResendApiKey(); if (!apiKey) return { sent: false, code: 'email_not_configured' };
  const brand = resolveEmailOrgBranding(org.id, org);
  const brandName = brand.publicName || brand.branding?.name || org.name;
  const replyTo = await resolveOrgEmailReplyTo(db, org.id);
  const unique = [...new Set(to.map((email) => email.trim().toLowerCase()).filter(Boolean))];
  const response = await new Resend(apiKey).emails.send({
    from: localizedFromEmail('lt', { senderName: brand.emailSenderName }),
    to: unique,
    subject: schoolFamilyUnsignedAnnualAdminSubject(),
    ...(replyTo ? { replyTo } : {}),
    text: schoolFamilyUnsignedAnnualAdminText({ orgName: brandName, rows: skipped }),
    html: schoolFamilyUnsignedAnnualAdminHtml({ orgName: brandName, rows: skipped, color: brand.branding?.brand_color || '#6366f1' }),
  });
  if (response.error) return { sent: false, code: 'email_send_failed' };
  return { sent: true, id: response.data?.id };
}

export async function applySchoolFamilyTransitionInvites(db: SupabaseClient, org: SchoolFamilyOrganization, actorId: string, origin: string): Promise<{
  provisioned: number;
  emailedParents: number;
  failed: Array<{ studentId: string; code: string }>;
  skipped: SchoolFamilySkippedInviteRow[];
}> {
  const plan = await planSchoolFamilyTransitionInvites(db, org);
  const failed: Array<{ studentId: string; code: string }> = [];
  let provisioned = 0;
  let emailedParents = 0;
  const invitedParents = new Set<string>();
  for (const family of plan.families) {
    for (const studentId of family.studentIds) {
      try {
        await runSchoolFamilyAccountWorkflow(db, org, actorId, studentId, 'provision', origin, undefined, { sendInvites: false });
        provisioned += 1;
      } catch (error) {
        failed.push({ studentId, code: (error as Error).message });
      }
    }
    const firstOk = family.studentIds.find((id) => !failed.some((row) => row.studentId === id));
    if (!firstOk) continue;
    try {
      const result = await runSchoolFamilyAccountWorkflow(db, org, actorId, firstOk, 'resend', origin, invitedParents, {
        inviteRoles: ['parent'], parentStudentNames: family.studentNames,
      });
      if (result.invitations.some((invitation) => invitation.sent || ('suppressed' in invitation && invitation.suppressed))) {
        emailedParents += 1;
      } else if (result.invitations.some((invitation) => !invitation.sent)) {
        failed.push({ studentId: firstOk, code: 'email_send_failed' });
      }
    } catch (error) {
      failed.push({ studentId: firstOk, code: (error as Error).message });
    }
  }
  return { provisioned, emailedParents, failed, skipped: plan.skipped };
}
