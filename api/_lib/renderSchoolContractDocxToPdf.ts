import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';
import { convertDocxBufferToPdfWithFallbacks } from './docxConverter.js';

function fillDocxZip(params: {
  docxBuffer: Buffer;
  payload: Record<string, string | number | boolean | null>;
}): Buffer {
  const zip = new PizZip(params.docxBuffer);
  const doc = new Docxtemplater(zip, {
    delimiters: { start: '{{', end: '}}' },
    paragraphLoop: true,
    linebreaks: true,
  });
  doc.render(params.payload as any);
  return Buffer.from(doc.getZip().generate({ type: 'uint8array' }));
}

/** Fill DOCX placeholders only (no PDF). Used by extra-lessons annex flow. */
export function fillDocxTemplateBuffer(params: {
  templateBytes: Buffer;
  payload: Record<string, string | number | boolean | null>;
}): Buffer {
  return fillDocxZip({ docxBuffer: params.templateBytes, payload: params.payload });
}

/** Fill DOCX buffer with {{placeholders}} and convert to PDF (server-side). */
export async function renderDocxBufferToPdfBuffer(params: {
  docxBuffer: Buffer;
  payload: Record<string, string | number | boolean | null>;
}): Promise<Buffer> {
  return await convertDocxBufferToPdfWithFallbacks(
    fillDocxZip({ docxBuffer: params.docxBuffer, payload: params.payload }),
  );
}

export async function renderDocxTemplateBufferToPdfBuffer(params: {
  templateBytes: Buffer;
  payload: Record<string, string | number | boolean | null>;
}): Promise<Buffer> {
  return renderDocxBufferToPdfBuffer({
    docxBuffer: params.templateBytes,
    payload: params.payload,
  });
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
