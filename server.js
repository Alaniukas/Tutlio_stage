import crypto from 'crypto';
import express from 'express';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);
const app = express();

app.use(express.json({ limit: '20mb' }));

function sofficeCandidates() {
  const fromEnv = process.env.LIBREOFFICE_PATH ? [process.env.LIBREOFFICE_PATH] : [];
  return [
    ...fromEnv,
    'soffice',
    'soffice.bin',
    'soffice.exe',
    '/usr/bin/soffice',
    '/usr/lib/libreoffice/program/soffice',
    'C:\\Program Files\\LibreOffice\\program\\soffice.exe',
    'C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe'
  ];
}

function timingSafeEqualStr(a, b) {
  const ba = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

function getProvidedApiKey(req) {
  const x = req.headers['x-api-key'];
  if (typeof x === 'string' && x.trim()) return x.trim();
  const auth = req.headers['authorization'];
  if (typeof auth === 'string' && /^Bearer\s+/i.test(auth)) {
    return auth.replace(/^Bearer\s+/i, '').trim();
  }
  return '';
}

/** Requires DOCX_CONVERTER_API_KEY to be set; rejects when missing or mismatch. */
function checkConvertApiKey(req) {
  const expected = (process.env.DOCX_CONVERTER_API_KEY || '').trim();
  if (!expected) {
    return {
      allowed: false,
      status: 503,
      error: 'DOCX_CONVERTER_API_KEY is not configured on the server'
    };
  }
  const provided = getProvidedApiKey(req);
  if (!provided || !timingSafeEqualStr(provided, expected)) {
    return { allowed: false, status: 401, error: 'Unauthorized' };
  }
  return { allowed: true };
}

async function convertWithLibreOffice(docxBuffer) {
  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), 'tutlio-docx-'));
  const inputPath = path.join(workDir, 'contract.docx');
  const outputPath = path.join(workDir, 'contract.pdf');
  await fs.writeFile(inputPath, docxBuffer);

  let lastError = null;
  try {
    for (const bin of sofficeCandidates()) {
      try {
        await execFileAsync(
          bin,
          ['--headless', '--convert-to', 'pdf', '--outdir', workDir, inputPath],
          { timeout: 120000, windowsHide: true }
        );
        const pdf = await fs.readFile(outputPath);
        if (pdf.length > 0) return pdf;
      } catch (error) {
        lastError = error;
      }
    }
    throw new Error(lastError instanceof Error ? lastError.message : 'LibreOffice conversion failed');
  } finally {
    await fs.rm(workDir, { recursive: true, force: true });
  }
}

app.get('/health', (_req, res) => {
  res.status(200).json({ ok: true });
});

app.get('/', (_req, res) => {
  res.status(200).json({ ok: true, service: 'tutlio-docx-converter' });
});

app.post('/convert-docx-to-pdf', async (req, res) => {
  const auth = checkConvertApiKey(req);
  if (!auth.allowed) {
    return res.status(auth.status).json({ error: auth.error });
  }

  const fileBase64 = typeof req.body?.fileBase64 === 'string' ? req.body.fileBase64 : '';
  if (!fileBase64) {
    return res.status(400).json({ error: 'Missing fileBase64' });
  }

  try {
    const docxBuffer = Buffer.from(fileBase64, 'base64');
    const pdfBuffer = await convertWithLibreOffice(docxBuffer);
    return res.status(200).json({ pdfBase64: pdfBuffer.toString('base64') });
  } catch (error) {
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'DOCX to PDF conversion failed'
    });
  }
});

const port = Number(process.env.PORT || 3001);
const host = '0.0.0.0';
app.listen(port, host, () => {
  console.log(`tutlio-docx-converter listening on ${host}:${port}`);
});
