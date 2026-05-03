import type { VercelRequest, VercelResponse } from './types';
import { convertDocxBufferToPdfWithFallbacks } from './_lib/docxConverter';

function toBase64(buffer: ArrayBuffer): string {
  return Buffer.from(buffer).toString('base64');
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const fileBase64 = typeof req.body?.fileBase64 === 'string' ? req.body.fileBase64 : '';
  if (!fileBase64) {
    return res.status(400).json({ error: 'Missing fileBase64' });
  }

  try {
    const docxBuffer = Buffer.from(fileBase64, 'base64');
    const pdfBuffer = await convertDocxBufferToPdfWithFallbacks(docxBuffer);
    return res.status(200).json({ pdfBase64: toBase64(pdfBuffer) });
  } catch (error: any) {
    return res.status(500).json({
      error:
        error?.message ||
        'DOCX to PDF conversion failed. Configure DOCX_CONVERTER_URL + DOCX_CONVERTER_API_KEY, or LibreOffice, or CONVERTAPI_SECRET.',
    });
  }
}
