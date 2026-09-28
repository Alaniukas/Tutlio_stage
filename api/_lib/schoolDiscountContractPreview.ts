import type { SupabaseClient } from '@supabase/supabase-js';
import type { SchoolDiscountContractPreview } from '../../src/lib/schoolDiscountAgreement.js';
import { isSchoolConsultationsOrg, schoolExtraLessonsDiscountEnabled } from '../../src/lib/schoolConsultationsOrg.js';
import { isSchoolDiscountContractEligible, signSchoolDiscountPdf } from './schoolDiscountAgreementShared.js';

/** The main contract's bearer token authorizes only its own discount addenda. */
export async function loadSchoolDiscountContractPreviews(
  supabase: SupabaseClient,
  contract: {
    id: string;
    organization_id: string;
    student_id: string;
    kind: string;
    signing_status: string;
    accepted_at?: string | null;
    archived_at?: string | null;
    terminated_at?: string | null;
    withdrawal_requested_at?: string | null;
  },
  contractToken: string,
  features: Record<string, unknown>,
  at = new Date(),
): Promise<SchoolDiscountContractPreview[]> {
  if (!isSchoolConsultationsOrg(contract.organization_id) || !isSchoolDiscountContractEligible(contract)) return [];
  const offersEnabled = schoolExtraLessonsDiscountEnabled(contract.organization_id, features);

  const { data, error } = await supabase.from('school_discount_agreements')
    .select('id, agreement_number, activity_label, discount_type, discount_value, valid_from, valid_until, status, accepted_at, pdf_path, token_expires_at')
    .eq('organization_id', contract.organization_id)
    .eq('student_id', contract.student_id)
    .eq('contract_id', contract.id)
    .in('status', offersEnabled ? ['pending', 'accepted'] : ['accepted'])
    .order('created_at', { ascending: false })
    .limit(20);
  if (error) throw new Error('Nepavyko įkelti nuolaidos priedų. Bandykite dar kartą.');

  const active = (data || []).filter((row) => row.status === 'accepted'
    || (offersEnabled && row.status === 'pending' && Date.parse(row.token_expires_at) >= at.getTime()));
  return Promise.all(active.map(async (row): Promise<SchoolDiscountContractPreview> => ({
    id: row.id,
    agreementNumber: row.agreement_number,
    activityLabel: row.activity_label,
    discountType: row.discount_type,
    discountValue: Number(row.discount_value),
    validFrom: row.valid_from,
    validUntil: row.valid_until,
    status: row.status,
    acceptedAt: row.accepted_at,
    pdfUrl: await signSchoolDiscountPdf(supabase, row.pdf_path),
    acceptUrl: `/school-discount-accept?contractToken=${encodeURIComponent(contractToken)}&agreementId=${encodeURIComponent(row.id)}`,
  })));
}
