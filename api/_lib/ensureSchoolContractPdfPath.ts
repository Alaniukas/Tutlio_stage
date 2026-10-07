import type { SupabaseClient } from '@supabase/supabase-js';
import { currentContractPdfPath, type SchoolContractFilterInput } from '../../src/lib/schoolContractFilters.js';
import {
  buildExtraLessonsOrderSnapshot,
  EXTRA_LESSONS_CONTRACT_KIND,
  EXTRA_LESSONS_DEFAULT_BODY,
} from '../../src/lib/extraLessonsContract.js';
import { extractSchoolContractStoragePath } from './schoolContractPdfPath.js';
import { renderAndStoreExtraLessonsPdf } from './extraLessonsPdf.js';
import {
  extraLessonsPayloadForContract,
  fillExtraLessonsBody,
  snapshotFromRow,
} from './extraLessonsContractShared.js';

type ContractPdfSource = {
  id: string;
  kind?: string | null;
  pdf_url?: string | null;
  signed_contract_url?: string | null;
  signatures?: Array<{ role?: string | null; status?: string | null; signed_pdf_path?: string | null }> | null;
};

export async function ensureExtraLessonsPdfPath(
  supabase: SupabaseClient,
  contractId: string,
  orgId: string,
): Promise<string | null> {
  const { data: contract } = await supabase
    .from('school_contracts')
    .select('id, organization_id, student_id, contract_number, kind, pdf_url, filled_body, template_id, order_snapshot, unit_price_eur, annual_fee')
    .eq('id', contractId)
    .eq('organization_id', orgId)
    .maybeSingle();
  if (!contract || contract.kind !== EXTRA_LESSONS_CONTRACT_KIND) return null;

  const existingPath = contract.pdf_url ? extractSchoolContractStoragePath(String(contract.pdf_url)) : '';
  if (existingPath) return existingPath;

  const { data: student } = await supabase
    .from('students')
    .select('id, full_name, grade, payer_name, payer_email, payer_phone')
    .eq('id', contract.student_id)
    .maybeSingle();
  const { data: org } = await supabase
    .from('organizations')
    .select('name')
    .eq('id', orgId)
    .maybeSingle();

  const order = snapshotFromRow(contract) || buildExtraLessonsOrderSnapshot({
    unit_price_eur: Number(contract.unit_price_eur || 0),
    service_name: 'Papildomi užsiėmimai',
    duration_minutes: 0,
    start_date: '',
    end_date: '',
    base_lessons_per_month: 0,
  });
  const filledBody = String(contract.filled_body || EXTRA_LESSONS_DEFAULT_BODY);
  const payload = extraLessonsPayloadForContract({
    contractNumber: String(contract.contract_number || ''),
    order,
    parentName: String(student?.payer_name || ''),
    parentEmail: String(student?.payer_email || ''),
    parentPhone: String(student?.payer_phone || ''),
    studentName: String(student?.full_name || ''),
    studentGrade: String(student?.grade || ''),
    userId: String(student?.id || contract.student_id),
    schoolName: String(org?.name || ''),
  });

  try {
    const rendered = await renderAndStoreExtraLessonsPdf(supabase, {
      contract: {
        id: contract.id,
        organization_id: orgId,
        contract_number: contract.contract_number,
        template_id: contract.template_id,
      },
      student: student || {},
      filledBody: fillExtraLessonsBody({
        templateBody: filledBody,
        organizationId: orgId,
        payload,
      }),
      indicativeMonthlyEur: order.indicative_monthly_eur || Number(contract.annual_fee || 0),
      extraLessonsPayload: payload,
    });
    if (rendered.uploadedPath) {
      await supabase.from('school_contracts').update({ pdf_url: rendered.uploadedPath }).eq('id', contract.id);
      return extractSchoolContractStoragePath(rendered.uploadedPath);
    }
  } catch (e) {
    console.error('[ensureSchoolContractPdfPath] extra pdf', (e as Error).message);
  }
  return null;
}

export async function resolveSchoolContractPdfStoragePath(
  supabase: SupabaseClient,
  orgId: string,
  contract: ContractPdfSource,
): Promise<string | null> {
  const current = currentContractPdfPath(contract as Pick<SchoolContractFilterInput, 'signatures' | 'pdf_url' | 'signed_contract_url'>);
  if (current) {
    const path = extractSchoolContractStoragePath(current);
    if (path) return path;
  }
  if (contract.kind === EXTRA_LESSONS_CONTRACT_KIND) {
    return ensureExtraLessonsPdfPath(supabase, contract.id, orgId);
  }
  return null;
}
