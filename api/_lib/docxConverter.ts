import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

function normalizeDocxConverterBaseUrl(raw: string): string {
  const t = raw.trim();
  if (!t) return '';
  if (t.startsWith('http://') || t.startsWith('https://')) return t.replace(/\/$/, '');
  return `https://${t.replace(/\/$/, '')}`;
}

function sofficeCandidates(): string[] {
  const fromEnv = process.env.LIBREOFFICE_PATH ? [process.env.LIBREOFFICE_PATH] : [];
  return [
    ...fromEnv,
    'soffice',
    'soffice.exe',
    'C:\\Program Files\\LibreOffice\\program\\soffice.exe',
    'C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe',
  ];
}

export async function convertWithDocxConverterService(docxBuffer: Buffer): Promise<Buffer> {
  const base = normalizeDocxConverterBaseUrl(process.env.DOCX_CONVERTER_URL || '');
  const key = (process.env.DOCX_CONVERTER_API_KEY || '').trim();
  if (!base || !key) {
    throw new Error('DOCX_CONVERTER_URL and DOCX_CONVERTER_API_KEY are not both set');
  }
  const res = await fetch(`${base}/convert-docx-to-pdf`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({ fileBase64: docxBuffer.toString('base64') }),
  });
  const json = (await res.json().catch(() => ({}))) as { pdfBase64?: string; error?: string };
  if (!res.ok) {
    const detail = typeof json?.error === 'string' ? json.error : `HTTP ${res.status}`;
    throw new Error(detail);
  }
  const b64 = typeof json.pdfBase64 === 'string' ? json.pdfBase64 : '';
  if (!b64) throw new Error('Remote converter returned no pdfBase64');
  return Buffer.from(b64, 'base64');
}

export async function convertWithLibreOffice(docxBuffer: Buffer): Promise<Buffer> {
  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), 'docx-pdf-'));
  const inputPath = path.join(workDir, 'contract.docx');
  const outputPath = path.join(workDir, 'contract.pdf');
  await fs.writeFile(inputPath, docxBuffer);

  let lastError: unknown = null;
  try {
    for (const bin of sofficeCandidates()) {
      try {
        await execFileAsync(bin, ['--headless', '--convert-to', 'pdf', '--outdir', workDir, inputPath], {
          windowsHide: true,
          timeout: 120000,
        });
        const pdf = await fs.readFile(outputPath);
        if (pdf.length > 0) return pdf;
      } catch (e) {
        try {
          const stat = await fs.stat(outputPath);
          if (stat.size > 0) {
            const pdf = await fs.readFile(outputPath);
            if (pdf.length > 0) return pdf;
          }
        } catch {
          // continue
        }
        lastError = e;
      }
    }
    throw new Error(
      `LibreOffice conversion failed. Set LIBREOFFICE_PATH or install LibreOffice. ${
        lastError instanceof Error ? lastError.message : ''
      }`.trim(),
    );
  } finally {
    await fs.rm(workDir, { recursive: true, force: true });
  }
}

async function convertWithConvertApi(docxBuffer: Buffer, secret: string): Promise<Buffer> {
  const form = new FormData();
  form.append('File', new Blob([docxBuffer]), 'contract.docx');
  form.append('StoreFile', 'true');

  const convertResp = await fetch(`https://v2.convertapi.com/convert/docx/to/pdf?Secret=${encodeURIComponent(secret)}`, {
    method: 'POST',
    body: form,
  });
  const convertJson = (await convertResp.json().catch(() => ({}))) as { Message?: string; Files?: Array<{ Url?: string }> };
  if (!convertResp.ok) {
    const detail = typeof convertJson?.Message === 'string' ? convertJson.Message : 'Conversion request failed';
    throw new Error(detail);
  }
  const pdfUrl = typeof convertJson?.Files?.[0]?.Url === 'string' ? convertJson.Files[0].Url : '';
  if (!pdfUrl) throw new Error('No PDF file returned from converter');
  const pdfResp = await fetch(pdfUrl);
  if (!pdfResp.ok) throw new Error('Failed to fetch converted PDF');
  return Buffer.from(await pdfResp.arrayBuffer());
}

/**
 * Order: hosted DOCX service (e.g. Railway) → LibreOffice → ConvertAPI.
 * Matches /api/convert-docx-to-pdf behavior for school flows and serverless.
 */
export async function convertDocxBufferToPdfWithFallbacks(docxBuffer: Buffer): Promise<Buffer> {
  const hasRemote = Boolean(
    (process.env.DOCX_CONVERTER_URL || '').trim() && (process.env.DOCX_CONVERTER_API_KEY || '').trim(),
  );

  if (hasRemote) {
    try {
      return await convertWithDocxConverterService(docxBuffer);
    } catch {
      // fall through
    }
  }

  try {
    return await convertWithLibreOffice(docxBuffer);
  } catch (localError) {
    if (process.env.CONVERTAPI_SECRET) {
      try {
        return await convertWithConvertApi(docxBuffer, process.env.CONVERTAPI_SECRET);
      } catch (apiErr) {
        const a = localError instanceof Error ? localError.message : 'Local conversion failed';
        const b = apiErr instanceof Error ? apiErr.message : 'ConvertAPI failed';
        throw new Error(`${a} ${b}`);
      }
    }
    throw localError;
  }
}

export function hasDocxConverterEnv(): boolean {
  return Boolean(
    (process.env.DOCX_CONVERTER_URL || '').trim() && (process.env.DOCX_CONVERTER_API_KEY || '').trim(),
  );
}
