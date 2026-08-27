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

/** Extra-lessons: try the school's DOCX layout, fall back to a paginated text PDF. */
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

  if (params.contract.template_id) {
    const { data: tpl } = await supabase
      .from('school_contract_templates')
      .select('pdf_url')
      .eq('id', params.contract.template_id)
      .maybeSingle();
    const templatePath = tpl?.pdf_url ? extractSchoolContractStoragePath(String(tpl.pdf_url)) : '';
    if (templatePath.toLowerCase().endsWith('.docx')) {
      try {
        const { data: signedData, error: signErr } = await supabase.storage
          .from(BUCKET)
          .createSignedUrl(templatePath, 300);
        if (!signErr && signedData?.signedUrl) {
          const payload = buildSchoolContractTemplatePayload({
            contractNumber: params.contract.contract_number,
            annualFee: params.indicativeMonthlyEur,
            schoolName: params.extraLessonsPayload?.school_name,
            student: st,
            extraLessonsPayload: params.extraLessonsPayload,
          });
          pdfBytes = await withTimeout(
            createDocxTemplatePdf({ fetchUrl: signedData.signedUrl, payload }),
            12000,
          );
        }
      } catch (e) {
        console.error('[extra-lessons] docx pdf fallback to text', (e as Error).message);
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
      title: 'Papildomu pamoku sutartis',
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
