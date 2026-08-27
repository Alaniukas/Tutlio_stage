import { existsSync, readFileSync } from 'fs';
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
import { renderDocxTemplateBufferToPdfBuffer } from './renderSchoolContractDocxToPdf.js';
import { usesBundledExtraLessonsDocx } from '../../src/lib/extraLessonsContract.js';

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

export function resolveExtraLessonsBundledDocxPath(): string {
  const here = typeof __dirname !== 'undefined'
    ? __dirname
    : dirname(fileURLToPath(import.meta.url));
  const candidates = [
    join(here, 'templates', 'extra-lessons-laisvi-vaikai.docx'),
    join(process.cwd(), 'api/_lib/templates/extra-lessons-laisvi-vaikai.docx'),
    join(process.cwd(), 'docs/legal/extra-lessons-laisvi-vaikai.docx'),
    join(here, '../../docs/legal/extra-lessons-laisvi-vaikai.docx'),
  ];
  return candidates.find((p) => existsSync(p)) || candidates[0];
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
        20000,
      ));
    } catch (e) {
      console.error('[extra-lessons] bundled docx pdf fallback to text', (e as Error).message);
      pdfBytes = null;
    }
  } else if (params.contract.template_id) {
    const { data: tpl } = await supabase
      .from('school_contract_templates')
      .select('pdf_url, name')
      .eq('id', params.contract.template_id)
      .maybeSingle();
    const templatePath = tpl?.pdf_url ? extractSchoolContractStoragePath(String(tpl.pdf_url)) : '';
    const name = String(tpl?.name || '').toLowerCase();
    const looksExtra = name.includes('papildom') || name.includes('extra');
    if (looksExtra && templatePath.toLowerCase().endsWith('.docx')) {
      try {
        const { data: signedData, error: signErr } = await supabase.storage
          .from(BUCKET)
          .createSignedUrl(templatePath, 300);
        if (!signErr && signedData?.signedUrl) {
          pdfBytes = await withTimeout(
            createDocxTemplatePdf({ fetchUrl: signedData.signedUrl, payload }),
            12000,
          );
        }
      } catch (e) {
        console.error('[extra-lessons] org docx pdf fallback to text', (e as Error).message);
        pdfBytes = null;
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
  });
  const { error: uploadErr } = await supabase.storage.from(BUCKET).upload(path, Buffer.from(pdfBytes), {
    cacheControl: '3600',
    upsert: true,
    contentType: 'application/pdf',
  });
  if (uploadErr) {
    console.error('[extra-lessons] pdf upload', uploadErr.message);
    return { uploadedPath: null };
  }
  return { uploadedPath: path, pdfBase64: Buffer.from(pdfBytes).toString('base64') };
}
