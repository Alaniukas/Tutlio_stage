import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';
import { convertDocxBufferToPdfWithFallbacks } from './docxConverter.js';

/** Fill DOCX buffer with {{placeholders}} and convert to PDF (server-side). */
export async function renderDocxBufferToPdfBuffer(params: {
  docxBuffer: Buffer;
  payload: Record<string, string | number | boolean | null>;
}): Promise<Buffer> {
  const zip = new PizZip(params.docxBuffer);
  const doc = new Docxtemplater(zip, {
    delimiters: { start: '{{', end: '}}' },
    paragraphLoop: true,
    linebreaks: true,
  });
  doc.render(params.payload as any);
  const renderedDocx = Buffer.from(doc.getZip().generate({ type: 'uint8array' }));
  return await convertDocxBufferToPdfWithFallbacks(renderedDocx);
}

/** Download DOCX from a signed/public URL, fill placeholders, return PDF bytes. */
export async function renderDocxTemplateUrlToPdfBuffer(params: {
  templateUrl: string;
  payload: Record<string, string | number | boolean | null>;
}): Promise<Buffer> {
  const response = await fetch(params.templateUrl);
  if (!response.ok) {
    throw new Error(`Nepavyko atsisiųsti DOCX šablono (HTTP ${response.status})`);
  }
  const source = await response.arrayBuffer();
  return renderDocxBufferToPdfBuffer({
    docxBuffer: Buffer.from(source),
    payload: params.payload,
  });
}
