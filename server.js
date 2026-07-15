import crypto from 'crypto';
import express from 'express';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import PizZip from 'pizzip';

const execFileAsync = promisify(execFile);
const app = express();

app.use(express.json({ limit: '20mb' }));

const LO_USER_PROFILE = path.join(os.tmpdir(), 'tutlio-lo-profile');
const SERVICE_VERSION = '1.6.0';

/** Calibrated on Railway Linux LO vs Word Save-as-PDF for annex table "Dalykas" x=120. */
const FLOATING_TABLE_TBL_IND = Number(process.env.FLOATING_TABLE_TBL_IND || 640);

/**
 * Word annex tables use w:tblpPr floating anchors. Linux LibreOffice ignores the anchor
 * and renders ~29pt too far right. Inline the table with a fixed tblInd so the static
 * schedule table matches Word. Paragraph indents / margins are left untouched.
 */
function fixFloatingTablesForLinux(docxBuffer) {
  const zip = new PizZip(docxBuffer);
  const docPath = 'word/document.xml';
  const file = zip.file(docPath);
  if (!file) return { buffer: docxBuffer, floatingTablesFixed: 0 };

  let xml = file.asText();
  let fixed = 0;

  xml = xml.replace(/<w:tbl>[\s\S]*?<\/w:tbl>/g, (tableXml) => {
    if (!tableXml.includes('tblpPr')) return tableXml;
    fixed += 1;
    let t = tableXml;
    t = t.replace(/<w:tblpPr[^>]*\/>/g, '');
    t = t.replace(/<w:tblpPr[\s\S]*?<\/w:tblpPr>/g, '');
    t = t.replace(/<w:tblInd\b[^>]*\/>/g, '');
    t = t.replace(/<w:tblInd\b[^>]*>[\s\S]*?<\/w:tblInd>/g, '');
    if (!/<w:tblInd\b/.test(t)) {
      t = t.replace('</w:tblPr>', `<w:tblInd w:w="${FLOATING_TABLE_TBL_IND}" w:type="dxa"/></w:tblPr>`);
    }
    return t;
  });

  if (fixed === 0) return { buffer: docxBuffer, floatingTablesFixed: 0 };
  zip.file(docPath, xml);
  return { buffer: zip.generate({ type: 'nodebuffer' }), floatingTablesFixed: fixed };
}

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
  const { buffer: prepared, floatingTablesFixed } = fixFloatingTablesForLinux(docxBuffer);
  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), 'tutlio-docx-'));
  const inputPath = path.join(workDir, 'contract.docx');
  const outputPath = path.join(workDir, 'contract.pdf');
  await fs.writeFile(inputPath, prepared);
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
    '--convert-to',
    'pdf',
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
        if (pdf.length > 0) return { pdf, floatingTablesFixed };
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
    version: SERVICE_VERSION,
    exportFilter: 'simple',
    floatingTableTblInd: FLOATING_TABLE_TBL_IND,
    fonts: {
      timesNewRoman,
      liberationSerif,
      dejaVuSerif,
      timesResolved: /times new roman|liberation serif/i.test(timesNewRoman || ''),
    },
  });
});

app.get('/', (_req, res) => {
  res.status(200).json({ ok: true, service: 'tutlio-docx-converter', version: SERVICE_VERSION });
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
    const { pdf, floatingTablesFixed } = await convertWithLibreOffice(docxBuffer);
    return res.status(200).json({
      pdfBase64: pdf.toString('base64'),
      meta: {
        version: SERVICE_VERSION,
        floatingTablesFixed,
        floatingTableTblInd: FLOATING_TABLE_TBL_IND,
        pdfBytes: pdf.length,
      },
    });
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
