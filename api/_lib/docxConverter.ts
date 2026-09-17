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
    'libreoffice',
    // macOS default install location
    '/Applications/LibreOffice.app/Contents/MacOS/soffice',
    // Common Linux locations
    '/usr/bin/soffice',
    '/usr/local/bin/soffice',
    '/opt/libreoffice/program/soffice',
    '/snap/bin/libreoffice',
    // Windows
    'soffice.exe',
    'C:\\Program Files\\LibreOffice\\program\\soffice.exe',
    'C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe',
  ];
}

const DEFAULT_DOCX_CONVERTER_TIMEOUT_MS = 90000;

export type DocxConversionOptions = {
  /** Total wall-clock budget, including busy retries. */
  timeoutMs?: number;
};

function docxConverterTimeoutMs(override?: number): number {
  const configured = override ?? Number(process.env.DOCX_CONVERTER_TIMEOUT_MS || DEFAULT_DOCX_CONVERTER_TIMEOUT_MS);
  if (!Number.isFinite(configured) || configured <= 0) return DEFAULT_DOCX_CONVERTER_TIMEOUT_MS;
  return Math.max(1000, Math.floor(configured));
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchDocxConverterOnce(
  base: string,
  key: string,
  docxBuffer: Buffer,
  timeoutMs: number,
): Promise<Buffer> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${base}/convert-docx-to-pdf`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({ fileBase64: docxBuffer.toString('base64') }),
      signal: controller.signal,
    });
    const json = (await res.json().catch(() => ({}))) as { pdfBase64?: string; error?: string };
    if (!res.ok) {
      const detail = typeof json?.error === 'string' ? json.error : `HTTP ${res.status}`;
      const err = new Error(detail) as Error & { status?: number; retryable?: boolean; retryAfterSec?: number };
      err.status = res.status;
      err.retryable = res.status === 503 || res.status === 429;
      const retryAfter = Number(res.headers?.get?.('retry-after'));
      if (Number.isFinite(retryAfter) && retryAfter > 0) err.retryAfterSec = retryAfter;
      throw err;
    }
    const b64 = typeof json.pdfBase64 === 'string' ? json.pdfBase64 : '';
    if (!b64) throw new Error('Remote converter returned no pdfBase64');
    const pdf = Buffer.from(b64, 'base64');
    if (pdf.subarray(0, 5).toString() !== '%PDF-') {
      throw new Error('Remote converter returned an invalid PDF');
    }
    return pdf;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`Remote DOCX converter timed out after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function converterRetryDelayMs(error: unknown, attempt: number): number {
  const retryAfter = Number((error as { retryAfterSec?: number })?.retryAfterSec);
  if (Number.isFinite(retryAfter) && retryAfter > 0) {
    return Math.min(Math.max(retryAfter, 1), 30) * 1000;
  }
  return Math.min(5000 * 2 ** attempt, 20000);
}

export async function convertWithDocxConverterService(
  docxBuffer: Buffer,
  options: DocxConversionOptions = {},
): Promise<Buffer> {
  const base = normalizeDocxConverterBaseUrl(process.env.DOCX_CONVERTER_URL || '');
  const key = (process.env.DOCX_CONVERTER_API_KEY || '').trim();
  if (!base || !key) {
    throw new Error('DOCX_CONVERTER_URL and DOCX_CONVERTER_API_KEY are not both set');
  }
  const timeoutMs = docxConverterTimeoutMs(options.timeoutMs);
  const deadline = Date.now() + timeoutMs;
  const maxAttempts = 4;
  let lastError: unknown = null;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) {
      throw new Error(`Remote DOCX converter timed out after ${timeoutMs}ms`);
    }
    try {
      return await fetchDocxConverterOnce(base, key, docxBuffer, remainingMs);
    } catch (error) {
      lastError = error;
      const retryable = Boolean((error as { retryable?: boolean })?.retryable);
      if (!retryable || attempt === maxAttempts - 1) break;
      const delayMs = converterRetryDelayMs(error, attempt);
      if (delayMs >= deadline - Date.now()) {
        throw new Error(`Remote DOCX converter timed out after ${timeoutMs}ms while waiting to retry`);
      }
      await sleep(delayMs);
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Remote DOCX converter failed');
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
export async function convertDocxBufferToPdfWithFallbacks(
  docxBuffer: Buffer,
  options: DocxConversionOptions = {},
): Promise<Buffer> {
  const hasRemote = Boolean(
    (process.env.DOCX_CONVERTER_URL || '').trim() && (process.env.DOCX_CONVERTER_API_KEY || '').trim(),
  );

  if (hasRemote) {
    try {
      return await convertWithDocxConverterService(docxBuffer, options);
    } catch (remoteError) {
      const remoteMessage = remoteError instanceof Error ? remoteError.message : 'Remote DOCX converter failed';
      if (process.env.CONVERTAPI_SECRET) {
        try {
          return await convertWithConvertApi(docxBuffer, process.env.CONVERTAPI_SECRET);
        } catch (apiErr) {
          const apiMessage = apiErr instanceof Error ? apiErr.message : 'ConvertAPI failed';
          throw new Error(`${remoteMessage}. ConvertAPI fallback also failed: ${apiMessage}`);
        }
      }
      // On serverless (Vercel) LibreOffice is unavailable — surface the hosted converter error.
      if (process.env.VERCEL) {
        throw new Error(remoteMessage);
      }
      // fall through to local LibreOffice on dev machines
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
