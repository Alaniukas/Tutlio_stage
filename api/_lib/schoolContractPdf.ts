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
import { buildSchoolContractTemplatePayload } from './schoolContractTemplatePayload.js';

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

function wrapPdfLine(
  text: string,
  font: { widthOfTextAtSize: (t: string, size: number) => number },
  size: number,
  maxWidth: number,
): string[] {
  const raw = safePdfText(text);
  if (!raw) return [''];
  if (font.widthOfTextAtSize(raw, size) <= maxWidth) return [raw];
  const words = raw.split(/\s+/);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) <= maxWidth) {
      current = next;
      continue;
    }
    if (current) lines.push(current);
    if (font.widthOfTextAtSize(word, size) <= maxWidth) {
      current = word;
    } else {
      let chunk = '';
      for (const ch of word) {
        const tryChunk = chunk + ch;
        if (font.widthOfTextAtSize(tryChunk, size) <= maxWidth) chunk = tryChunk;
        else {
          if (chunk) lines.push(chunk);
          chunk = ch;
        }
      }
      current = chunk;
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [''];
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
  title?: string;
  feeLabel?: string;
}): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.TimesRoman);
  const bold = await pdfDoc.embedFont(StandardFonts.TimesRomanBold);
  const pageSize: [number, number] = [595, 842];
  const left = 44;
  const maxWidth = 507;
  const bottom = 56;
  let page = pdfDoc.addPage(pageSize);
  let y = 804;

  const newPage = () => {
    page = pdfDoc.addPage(pageSize);
    y = 804;
  };

  const drawWrapped = (text: string, size: number, useBold = false, color = rgb(0.23, 0.23, 0.23)) => {
    const f = useBold ? bold : font;
    for (const line of wrapPdfLine(text, f, size, maxWidth)) {
      if (y < bottom) newPage();
      page.drawText(line, { x: left, y, size, font: f, color });
      y -= size + 4;
    }
  };

  drawWrapped(params.title || 'Metinio mokesčio sutartis', 18, true, rgb(0.1, 0.1, 0.1));
  y -= 8;
  const feeLabel = params.feeLabel || 'Metinis mokestis';
  const rows = [
    `Sutarties Nr.: ${params.contractNumber || ''}`,
    `Mokinys: ${params.studentName || ''}`,
    `Tevai: ${params.parentName || ''}`,
    `Tevu el. pastas: ${params.parentEmail || ''}`,
    `Tevu tel.: ${params.parentPhone || ''}`,
    params.parentPersonalCode ? `Tevu asm. kodas: ${params.parentPersonalCode}` : '',
    params.childBirthDate ? `Vaiko gimimo data: ${params.childBirthDate}` : '',
    params.address ? `Adresas: ${params.address}` : '',
    `${feeLabel}: EUR ${Number(params.annualFee || 0).toFixed(2)}`,
    `Data: ${new Date().toLocaleDateString('lt-LT')}`,
  ].filter(Boolean);
  for (const row of rows) {
    drawWrapped(row, 12, false, rgb(0.2, 0.2, 0.2));
  }
  y -= 8;
  drawWrapped('Sutarties tekstas:', 12, true, rgb(0.12, 0.12, 0.12));
  for (const line of String(params.body || '').split(/\r?\n/)) {
    drawWrapped(line, 11);
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
  options?: { includeMediaConsentFlags?: boolean },
): Promise<{ uploadedPath: string | null; renderedBody: string }> {
  const st = contract.student || {};
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

  const templatePayload = buildSchoolContractTemplatePayload({
    contractNumber: contract.contract_number,
    annualFee: contract.annual_fee,
    schoolName: contract.organizations?.name,
    mediaPublicityConsent: contract.media_publicity_consent,
    student: st,
    includeMediaConsentFlags: options?.includeMediaConsentFlags === true,
  });

  let pdfBytes: Uint8Array;
  const templatePathOrUrl = String(contract.template?.pdf_url || '').trim();
  const templatePath = templatePathOrUrl ? extractSchoolContractStoragePath(templatePathOrUrl) : '';
  if (templatePath.toLowerCase().endsWith('.docx')) {
    // A DOCX template is the school's authoritative layout. A conversion hiccup
    // must not overwrite the contract with the synthesized text PDF — that
    // different-looking document would go out for review and e-signing. Throw so
    // the caller returns a retryable error and the previous PDF stays in place.
    const { data: signedData, error: signErr } = await supabase.storage.from(BUCKET).createSignedUrl(templatePath, 300);
    if (signErr || !signedData?.signedUrl) {
      throw new Error(`Nepavyko pasiekti sutarties DOCX šablono${signErr?.message ? `: ${signErr.message}` : ''}`);
    }
    pdfBytes = await createDocxTemplatePdf({ fetchUrl: signedData.signedUrl, payload: templatePayload });
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
  const pdfBuffer = Buffer.from(pdfBytes);
  const { error: uploadErr } = await supabase.storage.from(BUCKET).upload(path, pdfBuffer, {
    cacheControl: '3600',
    upsert: true,
    contentType: 'application/pdf',
  });
  if (uploadErr) {
    throw new Error(`Nepavyko įkelti sutarties PDF: ${uploadErr.message}`);
  }

  return { uploadedPath: path, renderedBody };
}
