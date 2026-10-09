import type { SupabaseClient } from '@supabase/supabase-js';
import mammoth from 'mammoth';
import type { StaffDocumentPreview } from '../../src/lib/schoolStaffDocumentPreview.js';
import { fillDocxTemplateBuffer } from './renderSchoolContractDocxToPdf.js';
import { extractSchoolContractStoragePath, SCHOOL_CONTRACTS_BUCKET } from './schoolContractPdfPath.js';
import {
  isStaffDocumentType,
  staffTemplateBytes,
  staffTemplateNames,
  staffTemplatePayload,
  validateConsentAnswers,
  STAFF_CONSENT_QUESTION_COUNT,
} from './schoolStaffDocuments.js';

type PreviewContract = {
  id: string;
  organization_id: string;
  counterparty_name?: string | null;
  staff_document_type?: string | null;
  staff_employment_contract_number?: string | null;
  staff_employment_contract_date?: string | null;
  staff_consent_answers?: unknown;
  pdf_url?: string | null;
  signed_contract_url?: string | null;
  staff_files_deleted_at?: string | null;
  signing_status?: string | null;
};

/** Called only after the admin or employee token has authorized this contract. */
export async function buildStaffDocumentPreview(
  supabase: SupabaseClient,
  contract: PreviewContract,
): Promise<StaffDocumentPreview | null> {
  if (contract.staff_files_deleted_at) return null;
  if (!isStaffDocumentType(contract.staff_document_type)) throw new Error('Dokumentas nerastas.');
  const documentType = contract.staff_document_type;
  const rawPath = contract.signed_contract_url || contract.pdf_url;
  if (rawPath) {
    const path = extractSchoolContractStoragePath(rawPath);
    if (!path.startsWith(`${contract.organization_id}/contracts/${contract.id}/`) || path.split('/').includes('..')) {
      throw new Error('Neteisingas dokumento failas.');
    }
    const { data, error } = await supabase.storage.from(SCHOOL_CONTRACTS_BUCKET).createSignedUrl(path, 900);
    if (error || !data?.signedUrl) throw new Error('Nepavyko atidaryti dokumento PDF.');
    return { documentType, pdfUrl: data.signedUrl, isDraft: false, sections: [] };
  }
  if (contract.signing_status === 'signed') return null;

  const payload = staffTemplatePayload({
    name: contract.counterparty_name || '',
    employmentContractNumber: contract.staff_employment_contract_number || '__________',
    employmentContractDate: contract.staff_employment_contract_date || '__________',
    date: new Date(),
    address: '__________',
    personalCode: '__________',
  });
  payload['pasirašymo data'] = '__________';
  const answers = validateConsentAnswers(contract.staff_consent_answers);
  for (let index = 0; index < STAFF_CONSENT_QUESTION_COUNT; index += 1) {
    payload[`choice_${index + 1}`] = answers
      ? answers[index] === 'yes' ? 'SUTINKU' : 'NESUTINKU'
      : 'SUTINKU / NESUTINKU';
  }
  // Read the same complete DOCX templates used for signing. No converter,
  // uploaded preview files, or changes to the signing workflow are needed.
  const sections: StaffDocumentPreview['sections'] = [];
  for (const [index, name] of staffTemplateNames(documentType).entries()) {
    const filled = fillDocxTemplateBuffer({ templateBytes: staffTemplateBytes(name), payload });
    const { value } = await mammoth.extractRawText({ buffer: filled });
    sections.push({
      kind: documentType === 'consent' ? 'consent' : index === 0 ? 'confidentiality' : 'annex',
      text: value.trim(),
    });
  }
  return { documentType, pdfUrl: null, isDraft: true, sections };
}
