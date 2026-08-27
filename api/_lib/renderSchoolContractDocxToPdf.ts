import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';
import { convertDocxBufferToPdfWithFallbacks } from './docxConverter.js';
import { formatDocxTemplateError } from '../../src/lib/docxTemplateValidation.js';

const DOCX_OPTS = {
  delimiters: { start: '{{', end: '}}' },
  paragraphLoop: true,
  linebreaks: true,
  nullGetter: () => '',
} as const;

/** Fill a DOCX buffer with {{placeholders}} and convert to PDF. */
export async function renderDocxTemplateBufferToPdfBuffer(params: {
  templateBytes: ArrayBuffer | Uint8Array | Buffer;
  payload: Record<string, string | number | boolean | null>;
}): Promise<Buffer> {
  let doc: Docxtemplater;
  try {
    const zip = new PizZip(params.templateBytes);
    doc = new Docxtemplater(zip, DOCX_OPTS);
    doc.render(params.payload as any);
  } catch (error) {
    throw new Error(formatDocxTemplateError(error), { cause: error });
  }
  const renderedDocx = Buffer.from(doc.getZip().generate({ type: 'uint8array' }));
  return await convertDocxBufferToPdfWithFallbacks(renderedDocx);
}

/** Download DOCX from URL, fill {{placeholders}}, return PDF bytes (server-side). */
export async function renderDocxTemplateUrlToPdfBuffer(params: {
  templateUrl: string;
  payload: Record<string, string | number | boolean | null>;
}): Promise<Buffer> {
  const response = await fetch(params.templateUrl);
  if (!response.ok) throw new Error('Nepavyko atsisiųsti DOCX šablono');
  const source = await response.arrayBuffer();
  return renderDocxTemplateBufferToPdfBuffer({ templateBytes: source, payload: params.payload });
}
