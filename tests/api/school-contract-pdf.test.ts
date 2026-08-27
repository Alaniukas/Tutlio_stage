import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * renderAndStoreSchoolContractPdf: a school's DOCX template is the authoritative
 * contract layout. If filling/converting it fails, the function must throw so the
 * caller surfaces a retryable error — it must NEVER silently store the synthesized
 * text-dump PDF over the real contract (that dump would then be reviewed and
 * e-signed via GoSign).
 */
const mocks = vi.hoisted(() => ({ renderDocx: vi.fn(), renderDocxBuffer: vi.fn() }));

vi.mock('../../api/_lib/renderSchoolContractDocxToPdf', () => ({
  renderDocxTemplateUrlToPdfBuffer: mocks.renderDocx,
  renderDocxTemplateBufferToPdfBuffer: mocks.renderDocxBuffer,
}));

import { PDFDocument } from 'pdf-lib';
import { createSimpleContractPdf, renderAndStoreSchoolContractPdf } from '../../api/_lib/schoolContractPdf';
import { renderAndStoreExtraLessonsPdf, signSchoolContractPdf } from '../../api/_lib/extraLessonsPdf';

function makeSupabase(opts: { signError?: boolean } = {}) {
  const uploads: Array<{ path: string; data: Buffer }> = [];
  const supabase = {
    storage: {
      from: () => ({
        createSignedUrl: async () =>
          opts.signError
            ? { data: null, error: { message: 'sign failed' } }
            : { data: { signedUrl: 'https://storage.example/signed-template.docx' }, error: null },
        upload: async (path: string, data: Buffer) => {
          uploads.push({ path, data });
          return { error: null };
        },
      }),
    },
  };
  return { supabase, uploads };
}

function makeContract(templatePdfUrl: string | null) {
  return {
    id: 'c0000000-0000-0000-0000-000000000001',
    organization_id: 'org-1',
    contract_number: 'SUT-20260713-1238',
    annual_fee: 300,
    filled_body: 'Sutartis: {{student_name}}, mokestis {{annual_fee}}.',
    media_publicity_consent: 'agree',
    template: templatePdfUrl ? { pdf_url: templatePdfUrl } : null,
    organizations: { name: 'VšĮ „Laisvi vaikai“' },
    student: {
      full_name: 'Jonukas Pet',
      payer_name: 'Irminta Mal',
      payer_email: 'irminta@example.com',
      payer_phone: '+37067059403',
    },
  };
}

const DOCX_TEMPLATE_URL =
  'https://x.supabase.co/storage/v1/object/public/school-contracts/org-1/templates/sutartis.docx';

beforeEach(() => {
  mocks.renderDocx.mockReset();
  mocks.renderDocxBuffer.mockReset();
});

describe('renderAndStoreSchoolContractPdf — DOCX template fidelity', () => {
  it('stores the converted DOCX PDF when rendering succeeds', async () => {
    const { supabase, uploads } = makeSupabase();
    const converted = Buffer.from('%PDF-1.7 converted-from-docx');
    mocks.renderDocx.mockResolvedValueOnce(converted);

    const result = await renderAndStoreSchoolContractPdf(supabase as any, makeContract(DOCX_TEMPLATE_URL));

    expect(mocks.renderDocx).toHaveBeenCalledOnce();
    expect(uploads).toHaveLength(1);
    expect(uploads[0].path).toBe(
      'org-1/contracts/c0000000-0000-0000-0000-000000000001/Sutartis-SUT-20260713-1238.pdf',
    );
    expect(Buffer.from(uploads[0].data)).toEqual(converted);
    expect(result.uploadedPath).toBe(uploads[0].path);
  });

  it('throws instead of falling back to the text-dump PDF when DOCX conversion fails', async () => {
    const { supabase, uploads } = makeSupabase();
    mocks.renderDocx.mockRejectedValueOnce(new Error('converter unavailable'));

    await expect(
      renderAndStoreSchoolContractPdf(supabase as any, makeContract(DOCX_TEMPLATE_URL)),
    ).rejects.toThrow('converter unavailable');
    expect(uploads).toHaveLength(0);
  });

  it('throws when the DOCX template URL cannot be signed', async () => {
    const { supabase, uploads } = makeSupabase({ signError: true });

    await expect(
      renderAndStoreSchoolContractPdf(supabase as any, makeContract(DOCX_TEMPLATE_URL)),
    ).rejects.toThrow(/DOCX šablono/);
    expect(mocks.renderDocx).not.toHaveBeenCalled();
    expect(uploads).toHaveLength(0);
  });

  it('still renders the simple text PDF for templates without a DOCX file', async () => {
    const { supabase, uploads } = makeSupabase();

    const result = await renderAndStoreSchoolContractPdf(supabase as any, makeContract(null));

    expect(mocks.renderDocx).not.toHaveBeenCalled();
    expect(uploads).toHaveLength(1);
    const bytes = Buffer.from(uploads[0].data);
    expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');
    expect(result.uploadedPath).toBe(uploads[0].path);
    expect(result.renderedBody).toContain('Jonukas Pet');
  });
});

describe('createSimpleContractPdf', () => {
  it('paginates a long extra-lessons body instead of truncating', async () => {
    const longBody = Array.from({ length: 80 }, (_, i) => `Straipsnis ${i + 1}. ${'Tekstas '.repeat(12)}`).join('\n');
    const bytes = await createSimpleContractPdf({
      contractNumber: 'PP-LEGAL-WITHIN14',
      studentName: 'QA Legal Per 14 d.',
      parentName: 'QA Extra Tevas',
      parentEmail: 'parent@example.com',
      parentPhone: '+37060000000',
      parentPersonalCode: '',
      childBirthDate: '',
      address: '',
      annualFee: 144,
      body: longBody,
      title: 'Papildomu pamoku sutartis',
      feeLabel: 'Orientacine menesio kaina',
    });
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBeGreaterThan(1);
    expect(Buffer.from(bytes).subarray(0, 5).toString()).toBe('%PDF-');
  });
});

describe('renderAndStoreExtraLessonsPdf', () => {
  function makeExtraSupabase() {
    const uploads: Array<{ path: string; data: Buffer }> = [];
    const signed: string[] = [];
    const supabase = {
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: { pdf_url: DOCX_TEMPLATE_URL, name: 'Papildomų pamokų sutartis (DOCX)' },
            }),
          }),
        }),
      }),
      storage: {
        from: () => ({
          createSignedUrl: async (path: string) => {
            signed.push(path);
            return { data: { signedUrl: `https://storage.example/${path}` }, error: null };
          },
          upload: async (path: string, data: Buffer) => {
            uploads.push({ path, data });
            return { error: null };
          },
        }),
      },
    };
    return { supabase, uploads, signed };
  }

  const extraParams = {
    contract: {
      id: 'e0000000-0000-0000-0000-000000000001',
      organization_id: 'org-1',
      contract_number: 'PP-LEGAL-WITHIN14',
      template_id: 'tpl-1',
    },
    student: { full_name: 'QA Legal Per 14 d.', payer_name: 'QA Extra Tevas', payer_email: 'p@example.com' },
    filledBody: Array.from({ length: 80 }, (_, i) => `Straipsnis ${i + 1}. ${'Tekstas '.repeat(12)}`).join('\n'),
    indicativeMonthlyEur: 144,
    extraLessonsPayload: { paslaugos_pavadinimas: 'QA Matematika' },
  };

  it('stores the converted DOCX PDF when extra-lessons rendering succeeds', async () => {
    const { supabase, uploads } = makeExtraSupabase();
    const converted = Buffer.from('%PDF-1.7 extra-docx');
    mocks.renderDocx.mockResolvedValueOnce(converted);

    const result = await renderAndStoreExtraLessonsPdf(supabase as any, extraParams);

    expect(mocks.renderDocx).toHaveBeenCalledOnce();
    expect(Buffer.from(uploads[0].data)).toEqual(converted);
    expect(result.uploadedPath).toBe(uploads[0].path);
  });

  it('falls back to a paginated text PDF when extra-lessons DOCX conversion fails', async () => {
    const { supabase, uploads } = makeExtraSupabase();
    mocks.renderDocx.mockRejectedValueOnce(new Error('converter unavailable'));

    const result = await renderAndStoreExtraLessonsPdf(supabase as any, extraParams);

    expect(uploads).toHaveLength(1);
    const bytes = new Uint8Array(Buffer.from(uploads[0].data));
    expect(Buffer.from(bytes).subarray(0, 5).toString()).toBe('%PDF-');
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBeGreaterThan(1);
    expect(result.uploadedPath).toBe(uploads[0].path);
  });

  it('uses the bundled Laisvi vaikai DOCX for Demo Mokykla', async () => {
    const { supabase, uploads } = makeExtraSupabase();
    const converted = Buffer.from('%PDF-1.7 bundled-docx');
    mocks.renderDocxBuffer.mockResolvedValueOnce(converted);

    const result = await renderAndStoreExtraLessonsPdf(supabase as any, {
      ...extraParams,
      contract: {
        ...extraParams.contract,
        organization_id: 'c3a00000-7e57-4000-8000-000000000001',
      },
    });

    expect(mocks.renderDocxBuffer).toHaveBeenCalledOnce();
    expect(mocks.renderDocx).not.toHaveBeenCalled();
    expect(Buffer.from(uploads[0].data)).toEqual(converted);
    expect(result.uploadedPath).toBe(uploads[0].path);
  });
});

describe('signSchoolContractPdf', () => {
  it('does not mint a signed URL for a DOCX template path', async () => {
    const { supabase } = makeSupabase();
    const url = await signSchoolContractPdf(supabase as any, 'org-1/templates/sutartis.docx');
    expect(url).toBeNull();
  });
});
