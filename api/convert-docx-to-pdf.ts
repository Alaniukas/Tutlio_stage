import type { VercelRequest, VercelResponse } from './types';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';

function toBase64(buffer: ArrayBuffer): string {
  return Buffer.from(buffer).toString('base64');
}

const execFileAsync = promisify(execFile);

async function convertWithConvertApi(docxBuffer: Buffer, secret: string): Promise<Buffer> {
  const form = new FormData();
  form.append('File', new Blob([docxBuffer]), 'contract.docx');
  form.append('StoreFile', 'true');

  const convertResp = await fetch(`https://v2.convertapi.com/convert/docx/to/pdf?Secret=${encodeURIComponent(secret)}`, {
    method: 'POST',
    body: form,
  });
  const convertJson = await convertResp.json().catch(() => ({} as any));
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

async function convertWithLibreOffice(docxBuffer: Buffer): Promise<Buffer> {
  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), 'contract-docx-'));
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
          // ignore and continue trying other binaries
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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const fileBase64 = typeof req.body?.fileBase64 === 'string' ? req.body.fileBase64 : '';
  if (!fileBase64) {
    return res.status(400).json({ error: 'Missing fileBase64' });
  }

  try {
    const docxBuffer = Buffer.from(fileBase64, 'base64');
    let pdfBuffer: Buffer | null = null;
    let localError: unknown = null;

    try {
      pdfBuffer = await convertWithLibreOffice(docxBuffer);
    } catch (e) {
      localError = e;
    }

    if (!pdfBuffer && process.env.CONVERTAPI_SECRET) {
      pdfBuffer = await convertWithConvertApi(docxBuffer, process.env.CONVERTAPI_SECRET);
    }

    if (!pdfBuffer) {
      const localMessage = localError instanceof Error ? localError.message : 'Local conversion failed';
      return res.status(500).json({
        error: `${localMessage}. Add LibreOffice (preferred free mode) or set CONVERTAPI_SECRET fallback.`,
      });
    }

    return res.status(200).json({ pdfBase64: toBase64(pdfBuffer) });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'DOCX to PDF conversion failed' });
  }
}
