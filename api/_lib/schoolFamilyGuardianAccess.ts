import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';

export const SCHOOL_FAMILY_PORTAL_FEATURE = 'school_family_portal';
export const SCHOOL_FAMILY_SETUP_FEATURE = 'school_family_accounts_setup';
export const SCHOOL_FAMILY_GUARDIANS_TABLE = 'school_family_guardians';

export function schoolFamilyPortalEnabled(features: Record<string, unknown> | null | undefined): boolean {
  return features?.[SCHOOL_FAMILY_PORTAL_FEATURE] === true;
}

/** Preparation never changes the legacy portal's RLS or public material links. */
export function schoolFamilyAccountsSetupEnabled(features: Record<string, unknown> | null | undefined): boolean {
  return schoolFamilyPortalEnabled(features) || features?.[SCHOOL_FAMILY_SETUP_FEATURE] === true;
}

export function normalizeSchoolFamilyEmail(value: unknown): string {
  return String(value || '').trim().toLowerCase();
}

export function normalizeSchoolFamilyName(value: unknown): string {
  return String(value || '').normalize('NFC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('lt');
}

/** The personal code is not persisted or returned to the browser by this workflow. */
export function schoolFamilyGuardianIdentity(organizationId: string, name: string, personalCode: string): string {
  return createHash('sha256').update(JSON.stringify([
    organizationId, normalizeSchoolFamilyName(name), personalCode.trim().replace(/\s+/g, ''),
  ])).digest('hex');
}
export function schoolFamilyPersonalCodeHash(personalCode: string): string {
  return createHash('sha256').update(personalCode.trim().replace(/\s+/g, '')).digest('hex');
}

export type SchoolFamilyGuardianEvidence = {
  organization_id: string;
  student_id: string;
  annual_contract_id: string;
  guardian_user_id: string | null;
  guardian_name: string;
  guardian_email: string;
  identity_hash: string;
  evidence_source: 'signed_primary' | 'admin_verified';
  signature_id: string | null;
  signature_personal_code_hash?: string | null;
  verified_by: string | null;
};

/** All callers fail closed on schema/query errors, including rollout before the migration. */
export async function loadSchoolFamilyGuardianAccess(
  db: SupabaseClient,
  userId: string,
  organizationId: string,
): Promise<{ studentIds: string[]; distinctParent: boolean }> {
  if (!userId || !organizationId) return { studentIds: [], distinctParent: false };
  const [ownChild, organization] = await Promise.all([
    db.from('students').select('id').eq('organization_id', organizationId).eq('linked_user_id', userId).limit(1),
    db.from('organizations').select('entity_type, features').eq('id', organizationId).maybeSingle(),
  ]);
  if (ownChild.error || organization.error) throw new Error('school_family_access_unavailable');
  if (ownChild.data?.length) return { studentIds: [], distinctParent: false };
  if (organization.data?.entity_type !== 'school' || !schoolFamilyAccountsSetupEnabled(organization.data?.features)) {
    return { studentIds: [], distinctParent: true };
  }

  const studentIds: string[] = [];
  // Bound by guardian_user_id before paging; large schools do not truncate siblings at 1,000 rows.
  for (let offset = 0; ; offset += 200) {
    const result = await db.from(SCHOOL_FAMILY_GUARDIANS_TABLE)
      .select('student_id, annual_contract_id, guardian_email, guardian_name, evidence_source, signature_id, signature_personal_code_hash')
      .eq('organization_id', organizationId).eq('guardian_user_id', userId)
      .order('student_id').range(offset, offset + 199);
    if (result.error) throw new Error('school_family_access_unavailable');
    const bindings = result.data || [];
    if (bindings.length) {
      const [contracts, students, signatures] = await Promise.all([
        db.from('school_contracts').select('id, student_id').eq('organization_id', organizationId)
          .eq('kind', 'annual').eq('signing_status', 'signed').is('archived_at', null).is('terminated_at', null)
          .in('id', bindings.map((row) => row.annual_contract_id)),
        db.from('students').select('id').eq('organization_id', organizationId).in('id', bindings.map((row) => row.student_id)),
        db.from('school_contract_signatures').select('id, contract_id, signer_email, signer_name, signer_personal_code').eq('role', 'parent_primary')
          .eq('status', 'signed').in('contract_id', bindings.map((row) => row.annual_contract_id)),
      ]);
      if (contracts.error || students.error || signatures.error) throw new Error('school_family_access_unavailable');
      const validContracts = new Map((contracts.data || []).map((row) => [row.id, row.student_id]));
      const validStudents = new Set((students.data || []).map((row) => row.id));
      const signed = new Map((signatures.data || []).map((row) => [row.id, row]));
      for (const binding of bindings) {
        const signature = signed.get(binding.signature_id);
        if (validContracts.get(binding.annual_contract_id) !== binding.student_id || !validStudents.has(binding.student_id)) continue;
        if (binding.evidence_source === 'admin_verified'
          && (signatures.data || []).some((row) => row.contract_id === binding.annual_contract_id)) continue;
        if (binding.evidence_source !== 'admin_verified'
          && (!signature || signature.contract_id !== binding.annual_contract_id
            || normalizeSchoolFamilyEmail(signature.signer_email) !== binding.guardian_email
            || normalizeSchoolFamilyName(signature.signer_name) !== normalizeSchoolFamilyName(binding.guardian_name)
            || schoolFamilyPersonalCodeHash(signature.signer_personal_code || '') !== binding.signature_personal_code_hash)) continue;
        studentIds.push(binding.student_id);
      }
    }
    if (bindings.length < 200) break;
  }
  return { studentIds: [...new Set(studentIds)], distinctParent: true };
}
