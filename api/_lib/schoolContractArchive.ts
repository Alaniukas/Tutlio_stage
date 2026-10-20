import type { SupabaseClient } from '@supabase/supabase-js';
import type { OrgAdminAccess } from './orgAdminAccess.js';
import { hasAnyOrgAdminPermission } from '../../src/lib/orgAdminPermissions.js';
import { currentContractPdfPath } from '../../src/lib/schoolContractFilters.js';
import { extractSchoolContractStoragePath } from './schoolContractPdfPath.js';

export const ARCHIVED_CONTRACT_SELECT =
  'id, contract_number, archived_at, pdf_url, signed_contract_url, student:students(full_name, payer_name, payer_email), signatures:school_contract_signatures(role, status, signed_pdf_path)';

export type ArchivedContractRow = {
  id: string;
  contract_number?: string | null;
  archived_at?: string | null;
  pdf_url?: string | null;
  signed_contract_url?: string | null;
  student?: { full_name?: string | null; payer_name?: string | null; payer_email?: string | null } | null;
  signatures?: Array<{ role: string; status: string; signed_pdf_path?: string | null }> | null;
};

export function canViewContractArchive(access: OrgAdminAccess | null): boolean {
  return Boolean(access && hasAnyOrgAdminPermission(access.role, access.permissions, ['finance.view', 'contracts.view']));
}

/** Finance access covers archived family contracts, never staff documents or active contracts. */
export function archivedStudentContractsQuery(db: SupabaseClient, organizationId: string, select: string) {
  return db.from('school_contracts')
    .select(select)
    .eq('organization_id', organizationId)
    .not('archived_at', 'is', null)
    .is('staff_document_type', null)
    .or('party_kind.eq.student,party_kind.is.null');
}

/** Read the preserved original; opening the archive must not regenerate or reactivate anything. */
export function archivedContractStoragePath(contract: ArchivedContractRow, organizationId: string): string | null {
  const current = currentContractPdfPath(contract);
  if (!current) return null;
  const path = extractSchoolContractStoragePath(current);
  return path.startsWith(`${organizationId}/`) && !path.split('/').includes('..') ? path : null;
}
