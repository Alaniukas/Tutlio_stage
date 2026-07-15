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

/** Isolated LO profile avoids stale layout state between conversions. */
const LO_USER_PROFILE = path.join(os.tmpdir(), 'tutlio-lo-profile');

/**
 * Writer PDF export tuned for Word school-contract fidelity (fonts, margins, tables).
 * Generic `--convert-to pdf` uses looser defaults and often reflows annex tables.
 */
const PDF_EXPORT_FILTER = [
  'pdf:writer_pdf_Export',
  JSON.stringify({
    SelectPdfVersion: { type: 'long', value: '1' },
    Quality: { type: 'long', value: '100' },
    EmbedStandardFonts: { type: 'boolean', value: 'true' },
    ReduceImageResolution: { type: 'boolean', value: 'false' },
    MaxImageResolution: { type: 'long', value: '300' },
    UseTaggedPDF: { type: 'boolean', value: 'false' },
    ExportFormFields: { type: 'boolean', value: 'false' },
    IsSkipEmptyPages: { type: 'boolean', value: 'false' },
    ExportBookmarks: { type: 'boolean', value: 'false' },
  }),
].join(':');

function sofficeCandidates() {
  const fromEnv = process.env.LIBREOFFICE_PATH ? [process.env.LIBREOFFICE_PATH] : [];
  return [
    ...fromEnv,
    'soffice',
    'soffice.bin',
    '/usr/bin/soffice',
    '/usr/lib/libreoffice/program/soffice',
    'soffice.exe',
    'C:\\Program Files\\LibreOffice\\program\\soffice.exe',
    'C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe',
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
      error: 'DOCX_CONVERTER_API_KEY is not configured on the server',
    };
  }
  const provided = getProvidedApiKey(req);
  if (!provided || !timingSafeEqualStr(provided, expected)) {
    return { allowed: false, status: 401, error: 'Unauthorized' };
  }
  return { allowed: true };
}

async function ensureLoProfile() {
  await fs.mkdir(LO_USER_PROFILE, { recursive: true });
}

async function convertWithLibreOffice(docxBuffer) {
  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), 'tutlio-docx-'));
  const inputPath = path.join(workDir, 'contract.docx');
  const outputPath = path.join(workDir, 'contract.pdf');
  await fs.writeFile(inputPath, docxBuffer);
  await ensureLoProfile();

  const profileUrl = `file://${LO_USER_PROFILE.replace(/\\/g, '/')}`;
  const convertArgs = [
    `-env:UserInstallation=${profileUrl}`,
    '--headless',
    '--nologo',
    '--nodefault',
    '--nofirststartwizard',
    '--nolockcheck',
    '--norestore',
    '--infilter=MS Word 2007 XML',
    '--convert-to',
    PDF_EXPORT_FILTER,
    '--outdir',
    workDir,
    inputPath,
  ];

  let lastError = null;
  try {
    for (const bin of sofficeCandidates()) {
      try {
        await execFileAsync(bin, convertArgs, { timeout: 120000, windowsHide: true });
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

async function probeFont(requestedFamily) {
  try {
    const { stdout } = await execFileAsync('fc-match', [requestedFamily], { timeout: 5000 });
    return stdout.trim().split('\n')[0] || null;
  } catch {
    return null;
  }
}

app.get('/health', async (_req, res) => {
  const [timesNewRoman, liberationSerif, dejaVuSerif] = await Promise.all([
    probeFont('Times New Roman'),
    probeFont('Liberation Serif'),
    probeFont('DejaVu Serif'),
  ]);
  res.status(200).json({
    ok: true,
    fonts: {
      timesNewRoman,
      liberationSerif,
      dejaVuSerif,
      timesResolved: /times new roman|liberation serif/i.test(timesNewRoman || ''),
    },
  });
});

app.get('/', (_req, res) => {
  res.status(200).json({ ok: true, service: 'tutlio-docx-converter', version: '1.1.0' });
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
      error: error instanceof Error ? error.message : 'DOCX to PDF conversion failed',
    });
  }
});

const port = Number(process.env.PORT || 3001);
const host = '0.0.0.0';
app.listen(port, host, () => {
  console.log(`tutlio-docx-converter listening on ${host}:${port}`);
});
