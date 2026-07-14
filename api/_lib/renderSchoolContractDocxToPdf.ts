import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';
import { convertDocxBufferToPdfWithFallbacks } from './docxConverter.js';
import { formatDocxTemplateError } from '../../src/lib/docxTemplateValidation.js';

/** Download DOCX from URL, fill {{placeholders}}, return PDF bytes (server-side). */
export async function renderDocxTemplateUrlToPdfBuffer(params: {
  templateUrl: string;
  payload: Record<string, string | number | boolean | null>;
}): Promise<Buffer> {
  const response = await fetch(params.templateUrl);
  if (!response.ok) throw new Error('Nepavyko atsisiųsti DOCX šablono');
  const source = await response.arrayBuffer();
  let doc: Docxtemplater;
  try {
    const zip = new PizZip(source);
    doc = new Docxtemplater(zip, {
      delimiters: { start: '{{', end: '}}' },
      paragraphLoop: true,
      linebreaks: true,
    });
    doc.render(params.payload as any);
  } catch (error) {
    throw new Error(formatDocxTemplateError(error), { cause: error });
  }
  const renderedDocx = Buffer.from(doc.getZip().generate({ type: 'uint8array' }));
  return await convertDocxBufferToPdfWithFallbacks(renderedDocx);
}
