import { randomBytes, randomUUID, createHash } from 'node:crypto';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import { Resend } from 'resend';
import { findAuthUserByEmail } from './findAuthUserByEmail.js';
import { provisionMvFamilyAccounts } from './mvProvisionFamilyAccounts.js';
import { resolveEmailOrgBranding } from './emailOrgBranding.js';
import { resolveOrgEmailReplyTo } from './orgEmailReplyTo.js';
import { localizedFromEmail, t, type Locale } from './i18n.js';
import { getResendApiKey } from './resendConfig.js';
import { orgAwareOrigin } from './public-origin.js';
import { buildMvLoginUrl } from './mvAccountActivationToken.js';
import { studentLoginNameFromEmail } from '../../src/lib/studentLoginIdentity.js';
import {
  normalizeSchoolFamilyEmail, normalizeSchoolFamilyName, schoolFamilyGuardianIdentity,
  schoolFamilyPersonalCodeHash,
  schoolFamilyAccountsSetupEnabled, type SchoolFamilyGuardianEvidence,
} from './schoolFamilyGuardianAccess.js';

export const SCHOOL_FAMILY_PAGE_SIZE = 25;
/** Legacy export kept for tests; batch size is no longer capped in the API. */
export const SCHOOL_FAMILY_TOKEN_PREFIX = 'sf1.';
const STUDENT_SELECT = 'id,full_name,email,organization_id,linked_user_id,parent_user_id,payer_name,payer_email,enrollment_status,detached_at';
const CONTRACT_SELECT = 'id,student_id,contract_number,kind,signing_status,archived_at,terminated_at,created_at';
const GUARDIAN_SELECT = 'organization_id,student_id,annual_contract_id,guardian_user_id,guardian_name,guardian_email,identity_hash,evidence_source,signature_id,signature_personal_code_hash,verified_by';
const emailValid = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && !email.endsWith('.invalid');

export type SchoolFamilyOrganization = {
  id: string; name: string; slug?: string | null; entity_type: string; preferred_locale?: string | null;
  features: Record<string, unknown>; logo_url?: string | null; brand_color?: string | null; brand_color_secondary?: string | null;
};
type Student = {
  id: string; full_name: string; email: string | null; organization_id: string; linked_user_id: string | null;
  parent_user_id: string | null; payer_name: string | null; payer_email: string | null; enrollment_status: string; detached_at: string | null;
};
type AnnualContract = {
  id: string; student_id: string; contract_number: string; kind: string; signing_status: string;
  archived_at: string | null; terminated_at: string | null; created_at: string;
};
type PrimarySignature = { id: string; contract_id: string; signer_name: string; signer_email: string; signer_personal_code: string | null };
type AccountRow = { user_id: string; role: 'parent' | 'student'; invited_at: string | null; activated_at: string | null; first_login_at: string | null };
export type SchoolFamilyAccountState = {
  userId: string | null; login: string | null; createdAt: string | null; invitedAt: string | null;
  activatedAt: string | null; firstLoginAt: string | null; hasLoggedIn: boolean;
};
export type SchoolFamilyPreviewRow = {
  studentId: string; studentName: string; studentEmail: string | null; guardianName: string | null; guardianEmail: string | null;
  verified: boolean; annualContracts: Array<{ id: string; number: string }>; blockedReasons: string[];
  parent: SchoolFamilyAccountState; student: SchoolFamilyAccountState;
};

function fail(code: string): never { throw new Error(code); }
function check(result: { error: unknown }): void { if (result.error) fail('school_family_setup_required'); }
async function authUser(db: SupabaseClient, userId: string | null): Promise<User | null> {
  if (!userId) return null;
  const result = await db.auth.admin.getUserById(userId);
  if (result.error || !result.data.user) fail('school_family_account_missing');
  return result.data.user;
}

export function signedSchoolFamilyEvidence(
  organizationId: string, studentId: string, contracts: AnnualContract[], signatures: PrimarySignature[],
  existing?: SchoolFamilyGuardianEvidence,
): { evidence: SchoolFamilyGuardianEvidence | null; reason?: string } {
  const eligible = contracts.filter((contract) => contract.student_id === studentId && contract.kind === 'annual'
    && contract.signing_status === 'signed' && !contract.archived_at && !contract.terminated_at);
  if (!eligible.length) return { evidence: null, reason: 'annual_contract_required' };
  if (existing && eligible.some((contract) => contract.id === existing.annual_contract_id)) {
    if (existing.evidence_source === 'admin_verified' && !signatures.some((row) => row.contract_id === existing.annual_contract_id)) return { evidence: existing };
    const signature = signatures.find((row) => row.id === existing.signature_id);
    if (signature && normalizeSchoolFamilyEmail(signature.signer_email) === existing.guardian_email
      && signature.contract_id === existing.annual_contract_id
      && schoolFamilyGuardianIdentity(organizationId, signature.signer_name, signature.signer_personal_code || '') === existing.identity_hash
      && schoolFamilyPersonalCodeHash(signature.signer_personal_code || '') === existing.signature_personal_code_hash) return { evidence: existing };
  }
  const candidates: SchoolFamilyGuardianEvidence[] = [];
  for (const contract of eligible) {
    const signature = signatures.find((row) => row.contract_id === contract.id);
    if (!signature || !emailValid(normalizeSchoolFamilyEmail(signature.signer_email))
      || !normalizeSchoolFamilyName(signature.signer_name) || !String(signature.signer_personal_code || '').trim()) continue;
    candidates.push({
      organization_id: organizationId, student_id: studentId, annual_contract_id: contract.id, guardian_user_id: null,
      guardian_name: signature.signer_name.trim(), guardian_email: normalizeSchoolFamilyEmail(signature.signer_email),
      identity_hash: schoolFamilyGuardianIdentity(organizationId, signature.signer_name, signature.signer_personal_code!),
      evidence_source: 'signed_primary', signature_id: signature.id,
      signature_personal_code_hash: schoolFamilyPersonalCodeHash(signature.signer_personal_code!), verified_by: null,
    });
  }
  if (!candidates.length) return { evidence: null, reason: 'guardian_verification_required' };
  if (new Set(candidates.map((row) => `${row.identity_hash}:${row.guardian_email}`)).size > 1) {
    return { evidence: null, reason: 'guardian_conflict_review' };
  }
  return { evidence: candidates[0] };
}

/** Parent self-serve registration and school admin invites bind verified guardians from signed contracts. */
export async function bindSchoolFamilyGuardianForRegisteredParent(
  db: SupabaseClient,
  organizationId: string,
  studentId: string,
  guardianUserId: string,
  parentEmail: string,
): Promise<{ bound: boolean; reason?: string }> {
  const context = await evidenceContext(db, organizationId, [studentId]);
  const existing = context.guardians.find((row) => row.student_id === studentId);
  const selected = signedSchoolFamilyEvidence(organizationId, studentId, context.contracts, context.signatures, existing);
  if (!selected.evidence) return { bound: false, reason: selected.reason || 'guardian_verification_required' };
  if (normalizeSchoolFamilyEmail(selected.evidence.guardian_email) !== normalizeSchoolFamilyEmail(parentEmail)) {
    return { bound: false, reason: 'guardian_email_mismatch' };
  }
  const evidence = { ...selected.evidence, guardian_user_id: guardianUserId };
  const guardian = await db.from('school_family_guardians').upsert(evidence, { onConflict: 'organization_id,student_id' });
  if (guardian.error) return { bound: false, reason: 'school_family_setup_required' };
  const account = await db.from('school_family_accounts').upsert(
    { organization_id: organizationId, user_id: guardianUserId, role: 'parent' },
    { onConflict: 'organization_id,user_id,role', ignoreDuplicates: true },
  );
  if (account.error) return { bound: false, reason: 'school_family_setup_required' };
  return { bound: true };
}

async function evidenceContext(db: SupabaseClient, orgId: string, studentIds: string[]) {
  const contracts: AnnualContract[] = [];
  for (let offset = 0; ; offset += 200) {
    const result = await db.from('school_contracts').select(CONTRACT_SELECT).eq('organization_id', orgId)
      .eq('kind', 'annual').eq('signing_status', 'signed').is('archived_at', null).is('terminated_at', null)
      .in('student_id', studentIds).order('created_at', { ascending: false }).order('id').range(offset, offset + 199);
    check(result); contracts.push(...(result.data || []) as AnnualContract[]);
    if ((result.data?.length || 0) < 200) break;
  }
  const signatures: PrimarySignature[] = [];
  for (let offset = 0; offset < contracts.length; offset += 200) {
    const result = await db.from('school_contract_signatures').select('id,contract_id,signer_name,signer_email,signer_personal_code')
      .in('contract_id', contracts.slice(offset, offset + 200).map((row) => row.id)).eq('role', 'parent_primary').eq('status', 'signed');
    check(result); signatures.push(...(result.data || []) as PrimarySignature[]);
  }
  const guardians = await db.from('school_family_guardians').select(GUARDIAN_SELECT).eq('organization_id', orgId).in('student_id', studentIds);
  check(guardians);
  return { contracts, signatures, guardians: (guardians.data || []) as SchoolFamilyGuardianEvidence[] };
}

export function schoolFamilyAccountState(user: User | null, account?: AccountRow): SchoolFamilyAccountState {
  return {
    userId: user?.id || null, login: user?.email ? studentLoginNameFromEmail(user.email) || user.email : null,
    createdAt: user?.created_at || null, invitedAt: account?.invited_at || null,
    activatedAt: account?.activated_at || (typeof user?.user_metadata?.mv_account_activated_at === 'string' ? user.user_metadata.mv_account_activated_at : null),
    firstLoginAt: account?.first_login_at || null, hasLoggedIn: Boolean(user?.last_sign_in_at || account?.first_login_at),
  };
}

async function parentCandidate(db: SupabaseClient, student: Student, evidence: SchoolFamilyGuardianEvidence): Promise<User | null> {
  const knownId = evidence.guardian_user_id || student.parent_user_id;
  const hit = knownId ? { id: knownId } : await findAuthUserByEmail(db, evidence.guardian_email);
  if (!hit) return null;
  const user = await authUser(db, hit.id);
  if (normalizeSchoolFamilyEmail(user?.email) !== evidence.guardian_email) fail('guardian_account_conflict');
  const [parentProfile, childIdentity, identities] = await Promise.all([
    db.from('parent_profiles').select('id,full_name,email').eq('user_id', hit.id).maybeSingle(),
    db.from('students').select('id').eq('organization_id', student.organization_id).eq('linked_user_id', hit.id).limit(1),
    db.from('school_family_guardians').select('identity_hash').eq('organization_id', student.organization_id)
      .eq('guardian_user_id', hit.id).neq('identity_hash', evidence.identity_hash).limit(1),
  ]);
  check(parentProfile); check(childIdentity); check(identities);
  if (childIdentity.data?.length) fail('shared_identity_review');
  if (!parentProfile.data
    || normalizeSchoolFamilyEmail(parentProfile.data.email) !== evidence.guardian_email
    || normalizeSchoolFamilyName(parentProfile.data.full_name) !== normalizeSchoolFamilyName(evidence.guardian_name)) fail('guardian_account_conflict');
  if (identities.data?.some((row) => row.identity_hash !== evidence.identity_hash)) fail('guardian_account_conflict');
  return user;
}

export async function schoolFamilyAccountsPreview(db: SupabaseClient, org: SchoolFamilyOrganization, cursor = '') {
  let query = db.from('students').select(STUDENT_SELECT).eq('organization_id', org.id).eq('enrollment_status', 'active')
    .is('detached_at', null).order('id').limit(SCHOOL_FAMILY_PAGE_SIZE + 1);
  if (cursor) query = query.gt('id', cursor);
  const result = await query; check(result);
  const students = (result.data || []).slice(0, SCHOOL_FAMILY_PAGE_SIZE) as Student[];
  if (!students.length) return { rows: [] as SchoolFamilyPreviewRow[], nextCursor: null };
  const context = await evidenceContext(db, org.id, students.map((row) => row.id));
  const knownIds = [...new Set(students.flatMap((row) => [row.linked_user_id, row.parent_user_id]).filter(Boolean))];
  const accounts = knownIds.length
    ? await db.from('school_family_accounts').select('user_id,role,invited_at,activated_at,first_login_at').eq('organization_id', org.id).in('user_id', knownIds)
    : { data: [], error: null };
  check(accounts);
  const rows: SchoolFamilyPreviewRow[] = [];
  const previewStudent = async (student: Student): Promise<SchoolFamilyPreviewRow> => {
    const selected = signedSchoolFamilyEvidence(org.id, student.id, context.contracts, context.signatures,
      context.guardians.find((row) => row.student_id === student.id));
    const evidence = selected.evidence;
    const blockedReasons: string[] = selected.reason ? [selected.reason] : [];
    if (student.email && !emailValid(normalizeSchoolFamilyEmail(student.email))) blockedReasons.push('contact_conflict');
    let parent: User | null = null; let child: User | null = null;
    try {
      child = await authUser(db, student.linked_user_id);
      if (evidence) parent = await parentCandidate(db, student, evidence);
      if (child && parent?.id === child.id) blockedReasons.push('shared_identity_review');
      if (child?.user_metadata?.role === 'parent') blockedReasons.push('shared_identity_review');
    } catch (error) { blockedReasons.push((error as Error).message); }
    const accountRows = (accounts.data || []) as AccountRow[];
    return {
      studentId: student.id, studentName: student.full_name, studentEmail: student.email,
      guardianName: evidence?.guardian_name || student.payer_name, guardianEmail: evidence?.guardian_email || student.payer_email,
      verified: Boolean(evidence), annualContracts: context.contracts.filter((row) => row.student_id === student.id).map((row) => ({ id: row.id, number: row.contract_number })),
      blockedReasons: [...new Set(blockedReasons)],
      parent: schoolFamilyAccountState(parent, accountRows.find((row) => row.user_id === parent?.id && row.role === 'parent')),
      student: schoolFamilyAccountState(child, accountRows.find((row) => row.user_id === child?.id && row.role === 'student')),
    };
  };
  // Preview performs read-only Auth and relationship checks. Bound concurrency
  // so a full page does not wait for every child's network requests in series.
  for (let offset = 0; offset < students.length; offset += 5) {
    rows.push(...await Promise.all(students.slice(offset, offset + 5).map(previewStudent)));
  }
  return { rows, nextCursor: (result.data?.length || 0) > SCHOOL_FAMILY_PAGE_SIZE ? students.at(-1)!.id : null };
}

async function liveStudent(db: SupabaseClient, orgId: string, studentId: string): Promise<Student> {
  const result = await db.from('students').select(STUDENT_SELECT).eq('organization_id', orgId).eq('id', studentId)
    .eq('enrollment_status', 'active').is('detached_at', null).maybeSingle();
  check(result); if (!result.data) fail('student_not_active'); return result.data as Student;
}

export async function verifySchoolFamilyGuardian(
  db: SupabaseClient, orgId: string, actorId: string,
  input: { studentId: string; contractId: string; guardianName: string; guardianEmail: string; personalCode: string; confirmed: boolean },
) {
  await liveStudent(db, orgId, input.studentId);
  const email = normalizeSchoolFamilyEmail(input.guardianEmail);
  if (!input.confirmed || !emailValid(email) || !normalizeSchoolFamilyName(input.guardianName) || !input.personalCode.trim()) fail('guardian_verification_invalid');
  const contract = await db.from('school_contracts').select('id').eq('organization_id', orgId).eq('student_id', input.studentId)
    .eq('id', input.contractId).eq('kind', 'annual').eq('signing_status', 'signed').is('archived_at', null).is('terminated_at', null).maybeSingle();
  check(contract); if (!contract.data) fail('annual_contract_required');
  const primary = await db.from('school_contract_signatures').select('id,signer_name,signer_email,signer_personal_code')
    .eq('contract_id', input.contractId).eq('role', 'parent_primary').eq('status', 'signed').maybeSingle();
  check(primary);
  if (primary.data && (normalizeSchoolFamilyEmail(primary.data.signer_email) !== email
    || schoolFamilyGuardianIdentity(orgId, primary.data.signer_name || '', primary.data.signer_personal_code || '')
      !== schoolFamilyGuardianIdentity(orgId, input.guardianName, input.personalCode))) fail('guardian_conflict_review');
  const existing = await db.from('school_family_guardians').select(GUARDIAN_SELECT).eq('organization_id', orgId).eq('student_id', input.studentId).maybeSingle();
  check(existing);
  const identityHash = schoolFamilyGuardianIdentity(orgId, input.guardianName, input.personalCode);
  // Changing an already-bound guardian requires a separate reassignment process, never an email edit.
  if (existing.data?.guardian_user_id && (existing.data.guardian_email !== email || existing.data.identity_hash !== identityHash)) fail('guardian_account_conflict');
  const result = await db.from('school_family_guardians').upsert({
    organization_id: orgId, student_id: input.studentId, annual_contract_id: input.contractId,
    guardian_user_id: existing.data?.guardian_user_id || null, guardian_name: input.guardianName.trim(), guardian_email: email,
    identity_hash: identityHash, evidence_source: primary.data ? 'signed_primary' : 'admin_verified', signature_id: primary.data?.id || null,
    signature_personal_code_hash: primary.data ? schoolFamilyPersonalCodeHash(input.personalCode) : null,
    verified_by: actorId, verified_at: new Date().toISOString(),
  }, { onConflict: 'organization_id,student_id' });
  check(result);
}

function escapeHtml(value: string): string { return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!); }
async function sendSchoolFamilyInvite(db: SupabaseClient, org: SchoolFamilyOrganization, actorId: string, student: Student,
  evidence: SchoolFamilyGuardianEvidence, user: User, role: 'parent' | 'student', origin: string) {
  const isReady = Boolean(user.last_sign_in_at || user.user_metadata?.mv_account_activated_at);
  const login = studentLoginNameFromEmail(user.email || '') || user.email || '';
  const recipient = role === 'parent' ? evidence.guardian_email
    : (emailValid(normalizeSchoolFamilyEmail(student.email)) && normalizeSchoolFamilyEmail(student.email) !== evidence.guardian_email ? normalizeSchoolFamilyEmail(student.email) : evidence.guardian_email);
  const appOrigin = orgAwareOrigin(org.preferred_locale, origin);
  let invitationUrl = buildMvLoginUrl(appOrigin, login, role, org.slug);
  let invitationId: string | null = null;
  if (!isReady) {
    const token = `${SCHOOL_FAMILY_TOKEN_PREFIX}${randomBytes(32).toString('base64url')}`;
    const invitation = await db.from('school_family_invitations').upsert({
      organization_id: org.id, user_id: user.id, role, student_id: student.id,
      token_hash: createHash('sha256').update(token).digest('hex'), expires_at: new Date(Date.now() + 14 * 86400000).toISOString(),
      sent_at: null, redeemed_at: null, created_by: actorId, created_at: new Date().toISOString(),
    }, { onConflict: 'organization_id,user_id,role' }).select('id').single();
    check(invitation); invitationId = invitation.data!.id;
    invitationUrl = `${appOrigin}/account-activate?t=${encodeURIComponent(token)}`;
  }
  if (process.env.TUTLIO_DEV_SUPPRESS_EMAIL === '1') return { sent: false, suppressed: true, invitationUrl, role };
  const apiKey = getResendApiKey(); if (!apiKey) return { sent: false, code: 'email_not_configured', role };
  const locale = (org.preferred_locale || 'lt') as Locale;
  const brand = resolveEmailOrgBranding(org.id, org);
  const brandName = brand.publicName || brand.branding?.name || org.name;
  const color = brand.branding?.brand_color || '#4f46e5';
  const subject = t(locale, role === 'parent' ? 'em.mvActivationParentSub' : 'em.mvActivationStudentSub', { student: student.full_name });
  const body = t(locale, role === 'parent' ? 'em.mvActivationParentBody' : 'em.mvActivationStudentBody', { org: brandName, student: student.full_name });
  const replyTo = await resolveOrgEmailReplyTo(db, org.id);
  const response = await new Resend(apiKey).emails.send({
    from: localizedFromEmail(locale, { senderName: brand.emailSenderName }), to: recipient, subject,
    ...(replyTo ? { replyTo } : {}),
    html: `<!doctype html><html lang="${escapeHtml(locale)}"><body style="margin:0;background:#f3f4f6;font-family:Arial,sans-serif"><div style="max-width:560px;margin:24px auto;background:white;padding:28px"><div style="text-align:center;color:${escapeHtml(color)}">${brand.branding?.logo_url ? `<img src="${escapeHtml(brand.branding.logo_url)}" alt="${escapeHtml(brandName)}" style="max-width:200px;max-height:56px"/>` : `<h1>${escapeHtml(brandName)}</h1>`}</div><p>${escapeHtml(body)}</p><p>${escapeHtml(t(locale, login.includes('@') ? 'em.mvFamilyAccountsEmailLabel' : 'login.studentUsername'))}: <strong>${escapeHtml(login)}</strong></p><p><a href="${escapeHtml(invitationUrl)}" style="display:inline-block;padding:14px 24px;color:white;background:${escapeHtml(color)};border-radius:8px">${escapeHtml(t(locale, isReady ? 'mvActivate.goLogin' : 'em.mvActivationBtn'))}</a></p><p>${escapeHtml(brand.emailTeamSignature || brandName)}</p></div></body></html>`,
  });
  if (response.error) return { sent: false, code: 'email_send_failed', role };
  const now = new Date().toISOString();
  const account = await db.from('school_family_accounts').update({ invited_at: now }).eq('organization_id', org.id).eq('user_id', user.id).eq('role', role);
  check(account);
  if (invitationId) check(await db.from('school_family_invitations').update({ sent_at: now }).eq('id', invitationId));
  return { sent: true, role };
}

export async function runSchoolFamilyAccountWorkflow(db: SupabaseClient, org: SchoolFamilyOrganization, actorId: string,
  studentId: string, action: 'provision' | 'resend', origin: string, invitedAccounts?: Set<string>) {
  const ownerId = randomUUID();
  const lock = await db.rpc('school_family_claim_workflow', { p_organization_id: org.id, p_student_id: studentId, p_owner_id: ownerId });
  check(lock); if (!lock.data) fail('workflow_busy');
  try {
    let student = await liveStudent(db, org.id, studentId);
    if (student.email && !emailValid(normalizeSchoolFamilyEmail(student.email))) fail('contact_conflict');
    const context = await evidenceContext(db, org.id, [studentId]);
    const selected = signedSchoolFamilyEvidence(org.id, studentId, context.contracts, context.signatures, context.guardians[0]);
    if (!selected.evidence) fail(selected.reason || 'guardian_verification_required');
    let evidence = selected.evidence;
    let parent = await parentCandidate(db, student, evidence);
    let child = await authUser(db, student.linked_user_id);
    if ((child && parent && child.id === parent.id) || child?.user_metadata?.role === 'parent') fail('shared_identity_review');
    if (!emailValid(evidence.guardian_email)) fail('guardian_verification_required');
    check(await db.from('school_family_guardians').upsert({ ...evidence, guardian_user_id: parent?.id || null }, { onConflict: 'organization_id,student_id' }));
    if (parent && !student.parent_user_id) {
      const profile = await db.from('parent_profiles').select('id').eq('user_id', parent.id).single();
      check(profile);
      check(await db.from('parent_students').upsert({ parent_id: profile.data!.id, student_id: student.id }, { onConflict: 'parent_id,student_id' }));
      const link = await db.from('students').update({ parent_user_id: parent.id }).eq('organization_id', org.id)
        .eq('id', student.id).is('parent_user_id', null).select('id');
      check(link); if (!link.data?.length) fail('guardian_account_conflict');
      student = { ...student, parent_user_id: parent.id };
    }
    if (action === 'provision' && (!parent || !child)) {
      const result = await provisionMvFamilyAccounts(db, {
        studentId, parentName: evidence.guardian_name, parentEmail: evidence.guardian_email,
        studentFullName: student.full_name, studentEmail: student.email || '',
        scope: !parent && !child ? 'both' : !parent ? 'parent' : 'student',
        emailDelivery: 'separate', parentNotifyEmail: evidence.guardian_email,
        studentNotifyEmail: student.email && normalizeSchoolFamilyEmail(student.email) !== evidence.guardian_email ? student.email : evidence.guardian_email,
        schoolGuardianVerification: { contractId: evidence.annual_contract_id, guardianEmail: evidence.guardian_email, guardianName: evidence.guardian_name },
        suppressParentActivationEmail: true, suppressStudentActivationEmail: true, appOrigin: origin,
      });
      if (result.ok === false) fail(result.code || 'provision_failed');
      student = await liveStudent(db, org.id, studentId);
      parent = await authUser(db, student.parent_user_id);
      child = await authUser(db, student.linked_user_id);
    }
    if (!parent || !child) fail('accounts_not_created');
    if (parent.id === child.id) fail('shared_identity_review');
    evidence = { ...evidence, guardian_user_id: parent.id };
    check(await db.from('school_family_guardians').upsert(evidence, { onConflict: 'organization_id,student_id' }));
    // Register existing accounts without altering their passwords, Auth roles or contact identities.
    for (const [role, user] of [['parent', parent], ['student', child]] as const) {
      check(await db.from('school_family_accounts').upsert({ organization_id: org.id, user_id: user.id, role }, { onConflict: 'organization_id,user_id,role', ignoreDuplicates: true }));
    }
    const invitations = [];
    for (const [role, user] of [['parent', parent], ['student', child]] as const) {
      const accountKey = `${role}:${user.id}`;
      if (invitedAccounts?.has(accountKey)) continue;
      const invitation = await sendSchoolFamilyInvite(db, org, actorId, student, evidence, user, role, origin);
      invitations.push(invitation);
      if (invitation.sent || ('suppressed' in invitation && invitation.suppressed)) invitedAccounts?.add(accountKey);
    }
    return { studentId, success: true, invitations };
  } finally {
    // Lease ownership prevents this request from deleting a replacement lock after expiry.
    await db.from('school_family_workflow_locks').delete().eq('organization_id', org.id).eq('student_id', studentId).eq('owner_id', ownerId);
  }
}

/** Explicit review only: keep the parent identity and every student-id based agreement/history. */
export async function splitSchoolFamilySharedIdentity(db: SupabaseClient, org: SchoolFamilyOrganization, actorId: string,
  studentId: string, confirmed: boolean, origin: string) {
  if (!confirmed) fail('guardian_verification_invalid');
  const ownerId = randomUUID();
  const lock = await db.rpc('school_family_claim_workflow', { p_organization_id: org.id, p_student_id: studentId, p_owner_id: ownerId });
  check(lock); if (!lock.data) fail('workflow_busy');
  try {
    const student = await liveStudent(db, org.id, studentId);
    if (!student.parent_user_id || student.parent_user_id !== student.linked_user_id) fail('shared_identity_review');
    const context = await evidenceContext(db, org.id, [studentId]);
    const selected = signedSchoolFamilyEvidence(org.id, studentId, context.contracts, context.signatures, context.guardians[0]);
    if (!selected.evidence) fail('guardian_verification_required');
    const evidence = selected.evidence;
    const parent = await authUser(db, student.parent_user_id);
    const profile = await db.from('parent_profiles').select('id,full_name,email').eq('user_id', student.parent_user_id).maybeSingle();
    check(profile);
    if (!parent || normalizeSchoolFamilyEmail(parent.email) !== evidence.guardian_email || !profile.data
      || normalizeSchoolFamilyName(profile.data.full_name) !== normalizeSchoolFamilyName(evidence.guardian_name)
      || normalizeSchoolFamilyEmail(profile.data.email) !== evidence.guardian_email) fail('guardian_account_conflict');
    check(await db.from('school_family_guardians').upsert({ ...evidence, guardian_user_id: null }, { onConflict: 'organization_id,student_id' }));
    const result = await provisionMvFamilyAccounts(db, {
      studentId, scope: 'student', forceStudentUsername: true, studentFullName: student.full_name,
      parentName: evidence.guardian_name, parentEmail: evidence.guardian_email,
      schoolSharedIdentityReview: { expectedUserId: parent.id },
      schoolGuardianVerification: { contractId: evidence.annual_contract_id, guardianEmail: evidence.guardian_email, guardianName: evidence.guardian_name },
      suppressStudentActivationEmail: true, suppressParentActivationEmail: true, studentNotifyEmail: evidence.guardian_email, appOrigin: origin,
    });
    if (result.ok === false) fail(result.code || 'provision_failed');
    const updated = await liveStudent(db, org.id, studentId);
    if (!updated.linked_user_id || updated.linked_user_id === parent.id || updated.parent_user_id !== parent.id) fail('shared_identity_review');
    check(await db.from('school_family_identity_reviews').insert({
      organization_id: org.id, student_id: studentId, annual_contract_id: evidence.annual_contract_id,
      parent_user_id: parent.id, previous_student_user_id: parent.id, new_student_user_id: updated.linked_user_id, reviewed_by: actorId,
    }));
    check(await db.from('school_family_accounts').upsert({ organization_id: org.id, user_id: updated.linked_user_id, role: 'student' }, { onConflict: 'organization_id,user_id,role', ignoreDuplicates: true }));
    // Other shared children require their own review; this action never changes a sibling implicitly.
    const remaining = await db.from('students').select('id').eq('organization_id', org.id).eq('linked_user_id', parent.id).limit(1);
    check(remaining);
    if (!remaining.data?.length) check(await db.from('school_family_guardians').upsert({ ...evidence, guardian_user_id: parent.id }, { onConflict: 'organization_id,student_id' }));
    return { success: true, studentId };
  } finally {
    await db.from('school_family_workflow_locks').delete().eq('organization_id', org.id).eq('student_id', studentId).eq('owner_id', ownerId);
  }
}

export async function loadSchoolFamilyInvitation(db: SupabaseClient, token: string, origin: string) {
  if (!/^sf1\.[A-Za-z0-9_-]{43}$/.test(token)) fail('invalid_token');
  const invitation = await db.from('school_family_invitations').select('*')
    .eq('token_hash', createHash('sha256').update(token).digest('hex')).maybeSingle();
  check(invitation); if (!invitation.data || Date.parse(invitation.data.expires_at) <= Date.now()) fail('expired');
  const record = invitation.data;
  const organization = await db.from('organizations').select('id,name,slug,entity_type,preferred_locale,features,logo_url,brand_color,brand_color_secondary')
    .eq('id', record.organization_id).maybeSingle();
  check(organization);
  const org = organization.data as SchoolFamilyOrganization | null;
  if (!org || org.entity_type !== 'school' || !schoolFamilyAccountsSetupEnabled(org.features)) fail('org_not_supported');
  const student = await liveStudent(db, org.id, record.student_id);
  const context = await evidenceContext(db, org.id, [student.id]);
  const selected = signedSchoolFamilyEvidence(org.id, student.id, context.contracts, context.signatures, context.guardians[0]);
  if (!selected.evidence) fail('guardian_verification_required');
  const evidence = selected.evidence;
  const parent = await parentCandidate(db, student, evidence);
  if (!parent || parent.id === student.linked_user_id) fail('shared_identity_review');
  if ((record.role === 'parent' ? parent.id : student.linked_user_id) !== record.user_id) fail('account_changed');
  const user = await authUser(db, record.user_id);
  if (!user || (record.role === 'student' && user.user_metadata?.role === 'parent')) fail('shared_identity_review');
  const ready = Boolean(record.redeemed_at || user.last_sign_in_at || user.user_metadata?.mv_account_activated_at);
  const login = studentLoginNameFromEmail(user.email || '') || user.email || '';
  const resolved = resolveEmailOrgBranding(org.id, org);
  return { record, user, org, preview: {
    success: true, role: record.role, email: login, studentName: student.full_name,
    orgName: resolved.publicName || resolved.branding?.name || org.name,
    branding: resolved.branding ? { name: resolved.branding.name, logoUrl: resolved.branding.logo_url, brandColor: resolved.branding.brand_color, brandColorSecondary: resolved.branding.brand_color_secondary || resolved.branding.brand_color } : null,
    alreadyActivated: ready, requiresPasswordSetup: !ready,
    loginUrl: buildMvLoginUrl(orgAwareOrigin(org.preferred_locale, origin), login, record.role, org.slug),
  } };
}

export async function activateSchoolFamilyInvitation(db: SupabaseClient, token: string, password: string, origin: string) {
  const loaded = await loadSchoolFamilyInvitation(db, token, origin);
  if (loaded.preview.alreadyActivated) return { ...loaded.preview, activated: true };
  if (password.length < 10 || password.length > 128) fail('password_too_short');
  const now = new Date().toISOString();
  const claim = await db.from('school_family_invitations').update({ redeemed_at: now })
    .eq('id', loaded.record.id).eq('token_hash', loaded.record.token_hash).is('redeemed_at', null)
    .gt('expires_at', now).select('id');
  check(claim); if (!claim.data?.length) fail('expired');
  const update = await db.auth.admin.updateUserById(loaded.user.id, {
    password, user_metadata: { ...loaded.user.user_metadata, mv_account_activated_at: now },
  });
  if (update.error) fail('activation_failed');
  check(await db.from('school_family_accounts').update({ activated_at: now }).eq('organization_id', loaded.org.id).eq('user_id', loaded.user.id).eq('role', loaded.record.role));
  return { ...loaded.preview, alreadyActivated: true, requiresPasswordSetup: false, activated: true };
}
