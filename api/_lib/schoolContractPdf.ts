/**
 * Shared school-contract PDF rendering + storage.
 * Used by the parent-completion flow (parent confirms supplemented data and the
 * final contract PDF is regenerated from the student's current data and sent).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { renderDocxTemplateUrlToPdfBuffer } from './renderSchoolContractDocxToPdf.js';
import {
  schoolContractPdfStoragePath,
  SCHOOL_CONTRACTS_BUCKET,
  extractSchoolContractStoragePath,
} from './schoolContractPdfPath.js';

export const BUCKET = SCHOOL_CONTRACTS_BUCKET;

export function fillPlaceholders(template: string, data: Record<string, string>) {
  let result = template || '';
  for (const [key, value] of Object.entries(data)) {
    result = result.replace(new RegExp(key.replace(/[{}]/g, '\\$&'), 'g'), value || '');
  }
  result = result
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n');
  return result;
}

export function templateSafe(value: unknown): string {
  if (value === null || value === undefined) return '';
  const str = String(value).trim();
  if (!str) return '';
  const lower = str.toLowerCase();
  if (lower === 'undefined' || lower === 'null') return '';
  return str;
}

function safePdfText(value: string): string {
  return String(value || '')
    .replace(/ą/g, 'a').replace(/Ą/g, 'A')
    .replace(/č/g, 'c').replace(/Č/g, 'C')
    .replace(/ę/g, 'e').replace(/Ę/g, 'E')
    .replace(/ė/g, 'e').replace(/Ė/g, 'E')
    .replace(/į/g, 'i').replace(/Į/g, 'I')
    .replace(/š/g, 's').replace(/Š/g, 'S')
    .replace(/ų/g, 'u').replace(/Ų/g, 'U')
    .replace(/ū/g, 'u').replace(/Ū/g, 'U')
    .replace(/ž/g, 'z').replace(/Ž/g, 'Z');
}

export async function createSimpleContractPdf(params: {
  contractNumber: string;
  studentName: string;
  parentName: string;
  parentEmail: string;
  parentPhone: string;
  parentPersonalCode: string;
  childBirthDate: string;
  address: string;
  annualFee: number | string;
  body: string;
}): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595, 842]);
  const font = await pdfDoc.embedFont(StandardFonts.TimesRoman);
  const bold = await pdfDoc.embedFont(StandardFonts.TimesRomanBold);
  const left = 44;
  let y = 804;

  page.drawText(safePdfText('Metinio mokesčio sutartis'), { x: left, y, size: 18, font: bold, color: rgb(0.1, 0.1, 0.1) });
  y -= 28;
  const rows = [
    `Sutarties Nr.: ${params.contractNumber || ''}`,
    `Mokinys: ${params.studentName || ''}`,
    `Tevai: ${params.parentName || ''}`,
    `Tevu el. pastas: ${params.parentEmail || ''}`,
    `Tevu tel.: ${params.parentPhone || ''}`,
    `Tevu asm. kodas: ${params.parentPersonalCode || ''}`,
    `Vaiko gimimo data: ${params.childBirthDate || ''}`,
    `Adresas: ${params.address || ''}`,
    `Metinis mokestis: EUR ${Number(params.annualFee || 0).toFixed(2)}`,
    `Data: ${new Date().toLocaleDateString('lt-LT')}`,
  ];
  for (const row of rows) {
    page.drawText(safePdfText(row), { x: left, y, size: 12, font, color: rgb(0.2, 0.2, 0.2) });
    y -= 18;
  }
  y -= 8;
  page.drawText(safePdfText('Sutarties tekstas:'), { x: left, y, size: 12, font: bold, color: rgb(0.12, 0.12, 0.12) });
  y -= 18;
  for (const line of String(params.body || '').split(/\r?\n/)) {
    if (y < 56) break;
    page.drawText(safePdfText(line), { x: left, y, size: 11, font, color: rgb(0.23, 0.23, 0.23) });
    y -= 15;
  }
  return pdfDoc.save();
}

export async function createDocxTemplatePdf(params: {
  fetchUrl: string;
  payload: Record<string, string | number | boolean | null>;
}): Promise<Uint8Array> {
  const pdfBuffer = await renderDocxTemplateUrlToPdfBuffer({ templateUrl: params.fetchUrl, payload: params.payload });
  return new Uint8Array(pdfBuffer);
}

/**
 * Render a contract PDF from the student's current data and upload it to storage.
 * Returns the bare storage path (null if upload failed). The `school-contracts`
 * bucket is private, so callers persist the path and mint a signed URL on read.
 * `contract` should include joined `student`, `template(pdf_url)` and `organizations(name)`.
 */
export async function renderAndStoreSchoolContractPdf(
  supabase: SupabaseClient,
  contract: any,
): Promise<{ uploadedPath: string | null; renderedBody: string }> {
  const st = contract.student || {};
  const consent = String(contract.media_publicity_consent || st.media_publicity_consent || '').trim();

  const fullAddress = [st.student_address || '', st.student_city || ''].filter(Boolean).join(', ');
  const parentName = String(st.payer_name || '').trim();
  const parentEmail = String(st.payer_email || '').trim();
  const parentPhone = String(st.payer_phone || '').trim();
  const parentPersonalCode = String(st.payer_personal_code || '').trim();
  const childBirthDate = String(st.child_birth_date || '').trim();
  const parent2Name = String(st.parent_secondary_name || '').trim();
  const parent2Email = String(st.parent_secondary_email || '').trim();
  const parent2Phone = String(st.parent_secondary_phone || '').trim();
  const parent2PersonalCode = String(st.parent_secondary_personal_code || '').trim();
  const parent2Address = String(st.parent_secondary_address || '').trim();
  const hasParent2 = [parent2Name, parent2Email, parent2Phone, parent2PersonalCode, parent2Address].some((v) => Boolean(String(v || '').trim()));
  const parent2Inline = hasParent2
    ? `${parent2Name}; asm. k.: ${parent2PersonalCode}; tel. nr.: ${parent2Phone}; el. paštas: ${parent2Email}; ${parent2Address};`
    : '';
  const parent2Block = hasParent2
    ? `${parent2Name}\nasm. k.: ${parent2PersonalCode}\ntel. nr.: ${parent2Phone}\nel. paštas: ${parent2Email}\n${parent2Address}`
    : '';

  const renderedBody = fillPlaceholders(String(contract.filled_body || ''), {
    '{{contract_number}}': String(contract.contract_number || ''),
    '{{student_name}}': String(st.full_name || ''),
    '{{student_email}}': String(st.email || ''),
    '{{student_phone}}': String(st.phone || ''),
    '{{parent_name}}': parentName,
    '{{parent_email}}': parentEmail,
    '{{parent_phone}}': parentPhone,
    '{{parent_personal_code}}': parentPersonalCode,
    '{{parent_address}}': fullAddress,
    '{{parent2_name}}': parent2Name,
    '{{parent2_email}}': parent2Email,
    '{{parent2_phone}}': parent2Phone,
    '{{parent2_personal_code}}': parent2PersonalCode,
    '{{parent2_address}}': parent2Address,
    '{{parent2_adress}}': parent2Address,
    '{{parent2_block}}': parent2Block,
    '{{parent2_inline}}': parent2Inline,
    '{{child_birth_date}}': childBirthDate,
    '{{address}}': fullAddress,
    '{{annual_fee}}': String(contract.annual_fee || ''),
    '{{date}}': new Date().toLocaleDateString('lt-LT'),
    '{{school_name}}': String(contract.organizations?.name || ''),
  });

  const consentPending = !consent;
  const templatePayload: Record<string, string | boolean | null> = {
    contract_number: templateSafe(contract.contract_number),
    student_name: templateSafe(st.full_name),
    student_email: templateSafe(st.email),
    student_phone: templateSafe(st.phone),
    parent_name: templateSafe(parentName),
    parent_email: templateSafe(parentEmail),
    parent_phone: templateSafe(parentPhone),
    parent_personal_code: templateSafe(parentPersonalCode),
    parent_address: templateSafe(fullAddress),
    parent2_name: templateSafe(parent2Name),
    parent2_email: templateSafe(parent2Email),
    parent2_phone: templateSafe(parent2Phone),
    parent2_personal_code: templateSafe(parent2PersonalCode),
    parent2_address: templateSafe(parent2Address),
    parent2_adress: templateSafe(parent2Address),
    parent2_block: templateSafe(parent2Block),
    parent2_inline: templateSafe(parent2Inline),
    child_birth_date: templateSafe(childBirthDate),
    address: templateSafe(fullAddress),
    annual_fee: templateSafe(contract.annual_fee),
    date: new Date().toLocaleDateString('lt-LT'),
    school_name: templateSafe(contract.organizations?.name),
    consent_pending: consentPending,
    consent_agree_selected: consent === 'agree',
    consent_disagree_selected: consent === 'disagree',
  };

  let pdfBytes: Uint8Array;
  const templatePathOrUrl = String(contract.template?.pdf_url || '').trim();
  const templatePath = templatePathOrUrl ? extractSchoolContractStoragePath(templatePathOrUrl) : '';
  if (templatePath.toLowerCase().endsWith('.docx')) {
    try {
      const { data: signedData } = await supabase.storage.from(BUCKET).createSignedUrl(templatePath, 300);
      if (!signedData?.signedUrl) throw new Error('Failed to sign template URL');
      pdfBytes = await createDocxTemplatePdf({ fetchUrl: signedData.signedUrl, payload: templatePayload });
    } catch {
      pdfBytes = await createSimpleContractPdf({
        contractNumber: String(contract.contract_number || ''),
        studentName: String(st.full_name || ''),
        parentName,
        parentEmail,
        parentPhone,
        parentPersonalCode,
        childBirthDate,
        address: fullAddress,
        annualFee: contract.annual_fee || 0,
        body: renderedBody,
      });
    }
  } else {
    pdfBytes = await createSimpleContractPdf({
      contractNumber: String(contract.contract_number || ''),
      studentName: String(st.full_name || ''),
      parentName,
      parentEmail,
      parentPhone,
      parentPersonalCode,
      childBirthDate,
      address: fullAddress,
      annualFee: contract.annual_fee || 0,
      body: renderedBody,
    });
  }

  const path = schoolContractPdfStoragePath({
    organizationId: String(contract.organization_id),
    contractId: String(contract.id),
    contractNumber: contract.contract_number ?? null,
  });
  const { error: uploadErr } = await supabase.storage.from(BUCKET).upload(
    path,
    new Blob([pdfBytes], { type: 'application/pdf' }),
    { cacheControl: '3600', upsert: true, contentType: 'application/pdf' },
  );
  const uploadedPath = uploadErr ? null : path;

  return { uploadedPath, renderedBody };
}
