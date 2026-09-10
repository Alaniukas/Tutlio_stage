import { existsSync, readFileSync } from 'fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  BUCKET,
  createDocxTemplatePdf,
  createSimpleContractPdf,
} from './schoolContractPdf.js';
import {
  extractSchoolContractStoragePath,
  schoolContractPdfStoragePath,
} from './schoolContractPdfPath.js';
import { buildSchoolContractTemplatePayload } from './schoolContractTemplatePayload.js';
import { fillDocxTemplateBuffer, renderDocxTemplateBufferToPdfBuffer } from './renderSchoolContractDocxToPdf.js';
import { convertDocxBufferToPdfWithFallbacks } from './docxConverter.js';
import {
  extraLessonsBlankWithdrawalFormBody,
  extraLessonsBlankWithdrawalFormPayload,
  extraLessonsWithdrawalFormSubmitNote,
  EXTRA_LESSONS_WITHDRAWAL_FORM_SCHOOL_EMAIL,
  usesBundledExtraLessonsDocx,
} from '../../src/lib/extraLessonsContract.js';
import { stripDocxBufferToAnnex } from './extraLessonsAnnexDocx.js';

export async function signSchoolContractPdf(
  supabase: SupabaseClient,
  pathOrUrl: string | null | undefined,
  expiresSec = 60 * 15,
): Promise<string | null> {
  const path = pathOrUrl ? extractSchoolContractStoragePath(pathOrUrl) : '';
  if (!path || path.toLowerCase().endsWith('.docx')) return null;
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, expiresSec);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error('timeout')), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function extraLessonsBundledDocxCandidates(): string[] {
  const here = typeof __dirname !== 'undefined'
    ? __dirname
    : dirname(fileURLToPath(import.meta.url));
  return [
    join(here, 'templates', 'extra-lessons-laisvi-vaikai.docx'),
    join(process.cwd(), 'api/_lib/templates/extra-lessons-laisvi-vaikai.docx'),
    join(process.cwd(), 'docs/legal/extra-lessons-laisvi-vaikai.docx'),
    join(here, '../../docs/legal/extra-lessons-laisvi-vaikai.docx'),
    join(here, '../templates/extra-lessons-laisvi-vaikai.docx'),
  ];
}

export function resolveExtraLessonsBundledDocxPath(): string {
  const candidates = extraLessonsBundledDocxCandidates();
  return candidates.find((p) => existsSync(p)) || candidates[0];
}

export function readBundledExtraLessonsDocx(): Buffer {
  const candidates = extraLessonsBundledDocxCandidates();
  const found = candidates.find((p) => existsSync(p));
  if (!found) {
    throw new Error(`Bundled extra-lessons DOCX nerastas. Bandytos vietos: ${candidates.join('; ')}`);
  }
  return readFileSync(found);
}

function extraLessonsDocxPayload(params: {
  student: {
    full_name?: string | null;
    payer_name?: string | null;
    payer_email?: string | null;
    payer_phone?: string | null;
  };
  indicativeMonthlyEur: number;
  extraLessonsPayload?: Record<string, string>;
  contractNumber?: string | null;
}): Record<string, string | boolean> {
  return buildSchoolContractTemplatePayload({
    contractNumber: params.contractNumber,
    annualFee: params.indicativeMonthlyEur,
    schoolName: params.extraLessonsPayload?.school_name,
    student: params.student,
    extraLessonsPayload: params.extraLessonsPayload,
  });
}

/** Freeze filled source bytes before queuing; retries never reload a mutable template. */
export async function freezeExtraLessonsPdfSource(
  supabase: SupabaseClient,
  params: Parameters<typeof renderAndStoreExtraLessonsPdf>[1],
): Promise<{ kind: 'docx' | 'pdf'; base64: string }> {
  const payload = extraLessonsDocxPayload({ ...params, contractNumber: params.contract.contract_number });
  let templateBytes: Buffer | null = null;
  if (usesBundledExtraLessonsDocx(params.contract.organization_id)) {
    templateBytes = readBundledExtraLessonsDocx();
  } else if (params.contract.template_id) {
    const { data, error } = await supabase.from('school_contract_templates').select('pdf_url')
      .eq('id', params.contract.template_id).maybeSingle();
    if (error) throw error;
    const path = extractSchoolContractStoragePath(String(data?.pdf_url || ''));
    if (path.toLowerCase().endsWith('.docx')) {
      const downloaded = await supabase.storage.from(BUCKET).download(path);
      if (downloaded.error || !downloaded.data) throw new Error('Nepavyko įkelti sutarties šablono');
      templateBytes = Buffer.from(await downloaded.data.arrayBuffer());
    }
  }
  if (templateBytes) {
    const bytes = fillDocxTemplateBuffer({ templateBytes, payload });
    if (bytes.length > 5 * 1024 * 1024) throw new Error('Sutarties šablonas viršija 5 MB ribą');
    return { kind: 'docx', base64: bytes.toString('base64') };
  }
  const pdf = await createSimpleContractPdf({
    contractNumber: String(params.contract.contract_number || ''), studentName: String(params.student.full_name || ''),
    parentName: String(params.student.payer_name || ''), parentEmail: String(params.student.payer_email || ''),
    parentPhone: String(params.student.payer_phone || ''), parentPersonalCode: '', childBirthDate: '', address: '',
    annualFee: params.indicativeMonthlyEur, body: params.filledBody,
    title: 'Nuotoliniu papildomu pamoku paslaugu sutartis', feeLabel: 'Orientacine menesio kaina',
  });
  return { kind: 'pdf', base64: Buffer.from(pdf).toString('base64') };
}

/** Extra-lessons: bundled Laisvi vaikai DOCX for Demo/Laisvi; other orgs use their extra DOCX. */
export async function renderAndStoreExtraLessonsPdf(
  supabase: SupabaseClient,
  params: {
    contract: { id: string; organization_id: string; contract_number?: string | null; template_id?: string | null };
    student: {
      full_name?: string | null;
      payer_name?: string | null;
      payer_email?: string | null;
      payer_phone?: string | null;
    };
    filledBody: string;
    indicativeMonthlyEur: number;
    extraLessonsPayload?: Record<string, string>;
  },
): Promise<{ uploadedPath: string | null; pdfBase64?: string }> {
  const st = params.student || {};
  let pdfBytes: Uint8Array | null = null;
  const payload = extraLessonsDocxPayload({
    student: st,
    indicativeMonthlyEur: params.indicativeMonthlyEur,
    extraLessonsPayload: params.extraLessonsPayload,
    contractNumber: params.contract.contract_number,
  });

  if (usesBundledExtraLessonsDocx(params.contract.organization_id)) {
    try {
      const templateBytes = readFileSync(resolveExtraLessonsBundledDocxPath());
      pdfBytes = new Uint8Array(await withTimeout(
        renderDocxTemplateBufferToPdfBuffer({ templateBytes, payload }),
        130000,
      ));
    } catch (e) {
      const detail = e instanceof Error ? e.message : 'nežinoma DOCX konvertavimo klaida';
      throw new Error(`Nepavyko suformuoti papildomų užsiėmimų PDF pagal DOCX šabloną: ${detail}`, { cause: e });
    }
  } else if (params.contract.template_id) {
    const { data: tpl, error: templateErr } = await supabase
      .from('school_contract_templates')
      .select('pdf_url, name')
      .eq('id', params.contract.template_id)
      .maybeSingle();
    if (templateErr) {
      throw new Error(`Nepavyko įkelti papildomų užsiėmimų sutarties šablono: ${templateErr.message}`);
    }
    const templatePath = tpl?.pdf_url ? extractSchoolContractStoragePath(String(tpl.pdf_url)) : '';
    if (templatePath.toLowerCase().endsWith('.docx')) {
      try {
        const { data: signedData, error: signErr } = await supabase.storage
          .from(BUCKET)
          .createSignedUrl(templatePath, 300);
        if (signErr || !signedData?.signedUrl) {
          throw new Error(`nepavyko pasiekti DOCX šablono${signErr?.message ? `: ${signErr.message}` : ''}`);
        }
        pdfBytes = await withTimeout(
          createDocxTemplatePdf({ fetchUrl: signedData.signedUrl, payload }),
          130000,
        );
      } catch (e) {
        const detail = e instanceof Error ? e.message : 'nežinoma DOCX konvertavimo klaida';
        throw new Error(`Nepavyko suformuoti papildomų užsiėmimų PDF pagal DOCX šabloną: ${detail}`, { cause: e });
      }
    }
  }

  if (!pdfBytes) {
    pdfBytes = await createSimpleContractPdf({
      contractNumber: String(params.contract.contract_number || ''),
      studentName: String(st.full_name || ''),
      parentName: String(st.payer_name || ''),
      parentEmail: String(st.payer_email || ''),
      parentPhone: String(st.payer_phone || ''),
      parentPersonalCode: '',
      childBirthDate: '',
      address: '',
      annualFee: params.indicativeMonthlyEur,
      body: params.filledBody,
      title: 'Nuotoliniu papildomu pamoku paslaugu sutartis',
      feeLabel: 'Orientacine menesio kaina',
    });
  }

  const path = schoolContractPdfStoragePath({
    organizationId: String(params.contract.organization_id),
    contractId: String(params.contract.id),
    contractNumber: params.contract.contract_number ?? null,
  }).replace(/\.pdf$/, `-${createHash('sha256').update(pdfBytes).digest('hex')}.pdf`);
  const { error: uploadErr } = await supabase.storage.from(BUCKET).upload(path, Buffer.from(pdfBytes), {
    cacheControl: '3600',
    upsert: true,
    contentType: 'application/pdf',
  });
  if (uploadErr) {
    throw new Error(`Nepavyko išsaugoti papildomų užsiėmimų sutarties PDF: ${uploadErr.message}`);
  }
  return { uploadedPath: path, pdfBase64: Buffer.from(pdfBytes).toString('base64') };
}

async function annexPdfFromFilledDocx(params: {
  templateBytes: Buffer;
  payload: Record<string, string | boolean>;
  schoolEmail: string;
}): Promise<Uint8Array> {
  const schoolEmail = params.schoolEmail || EXTRA_LESSONS_WITHDRAWAL_FORM_SCHOOL_EMAIL;
  const filledDocx = fillDocxTemplateBuffer({
    templateBytes: params.templateBytes,
    payload: extraLessonsBlankWithdrawalFormPayload(params.payload),
  });
  const annexDocx = stripDocxBufferToAnnex(filledDocx, {
    submitNote: extraLessonsWithdrawalFormSubmitNote(schoolEmail),
  });
  if (annexDocx) {
    return new Uint8Array(await withTimeout(convertDocxBufferToPdfWithFallbacks(annexDocx), 90000));
  }
  return createSimpleContractPdf({
    contractNumber: '',
    studentName: '',
    parentName: '',
    parentEmail: '',
    parentPhone: '',
    parentPersonalCode: '',
    childBirthDate: '',
    address: '',
    annualFee: 0,
    body: extraLessonsBlankWithdrawalFormBody(schoolEmail),
    title: 'Sutarties atsisakymo forma',
    variant: 'annex',
  });
}

/** 1 PRIEDAS only — filled from the same DOCX as the contract, then converted to PDF. */
export async function renderExtraLessonsAnnexPdf(
  supabase: SupabaseClient,
  params: {
    contract: { id: string; organization_id: string; contract_number?: string | null; template_id?: string | null };
    student: {
      full_name?: string | null;
      payer_name?: string | null;
      payer_email?: string | null;
      payer_phone?: string | null;
    };
    filledBody: string;
    indicativeMonthlyEur: number;
    extraLessonsPayload?: Record<string, string>;
  },
): Promise<Uint8Array> {
  const st = params.student || {};
  const payload = extraLessonsDocxPayload({
    student: st,
    indicativeMonthlyEur: params.indicativeMonthlyEur,
    extraLessonsPayload: params.extraLessonsPayload,
    contractNumber: params.contract.contract_number,
  });

  if (usesBundledExtraLessonsDocx(params.contract.organization_id)) {
    try {
      const templateBytes = readFileSync(resolveExtraLessonsBundledDocxPath());
      return await annexPdfFromFilledDocx({
        templateBytes,
        payload,
        schoolEmail: EXTRA_LESSONS_WITHDRAWAL_FORM_SCHOOL_EMAIL,
      });
    } catch (e) {
      console.error('[extra-lessons] annex bundled docx fallback to text', (e as Error).message);
    }
  } else if (params.contract.template_id) {
    const { data: tpl } = await supabase
      .from('school_contract_templates')
      .select('pdf_url, name')
      .eq('id', params.contract.template_id)
      .maybeSingle();
    const templatePath = tpl?.pdf_url ? extractSchoolContractStoragePath(String(tpl.pdf_url)) : '';
    if (templatePath.toLowerCase().endsWith('.docx')) {
      try {
        const { data: signedData, error: signErr } = await supabase.storage
          .from(BUCKET)
          .createSignedUrl(templatePath, 300);
        if (!signErr && signedData?.signedUrl) {
          const response = await fetch(signedData.signedUrl);
          if (response.ok) {
            const templateBytes = Buffer.from(await response.arrayBuffer());
            return await annexPdfFromFilledDocx({
              templateBytes,
              payload,
              schoolEmail: String(params.extraLessonsPayload?.mokyklos_el_pastas || '').trim()
                || EXTRA_LESSONS_WITHDRAWAL_FORM_SCHOOL_EMAIL,
            });
          }
        }
      } catch (e) {
        console.error('[extra-lessons] annex org docx fallback to text', (e as Error).message);
      }
    }
  }

  return createSimpleContractPdf({
    contractNumber: '',
    studentName: '',
    parentName: '',
    parentEmail: '',
    parentPhone: '',
    parentPersonalCode: '',
    childBirthDate: '',
    address: '',
    annualFee: 0,
    body: extraLessonsBlankWithdrawalFormBody(
      usesBundledExtraLessonsDocx(params.contract.organization_id)
        ? EXTRA_LESSONS_WITHDRAWAL_FORM_SCHOOL_EMAIL
        : (String(params.extraLessonsPayload?.mokyklos_el_pastas || '').trim() || EXTRA_LESSONS_WITHDRAWAL_FORM_SCHOOL_EMAIL),
    ),
    title: 'Sutarties atsisakymo forma',
    variant: 'annex',
  });
}
