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
const SERVICE_VERSION = '1.4.0';

const PDF_EXPORT_FILTER =
  'pdf:writer_pdf_Export:{"SelectPdfVersion":{"type":"long","value":"1"},"EmbedStandardFonts":{"type":"boolean","value":"true"},"UseTaggedPDF":{"type":"boolean","value":"false"}}';

/**
 * Word school templates use layout tricks LibreOffice mis-renders:
 * - Floating table anchors (tblpPr) and negative tblInd (e.g. -809)
 * - Negative paragraph indents (w:left="-567") paired with asymmetric pgMar
 * - docDefaults still point at Calibri 11pt even when runs use Times New Roman
 */
function normalizeDocxForLibreOffice(docxBuffer) {
  const zip = new PizZip(docxBuffer);
  let changed = false;

  const docFile = zip.file('word/document.xml');
  if (docFile) {
    let xml = docFile.asText();
    const before = xml;

    xml = xml.replace(/<w:pgMar([^/]*)\/>/g, (match) =>
      match.replace(/w:(top|bottom|left|right|header|footer)="([^"]+)"/g, (_, attr, val) => {
        const n = Math.round(parseFloat(val));
        return Number.isFinite(n) ? `w:${attr}="${n}"` : `w:${attr}="${val}"`;
      }),
    );

    xml = xml.replace(/w:left="-[\d.]+"/g, 'w:left="0"');
    xml = xml.replace(/w:right="-[\d.]+"/g, 'w:right="0"');

    xml = xml.replace(/<w:tblpPr[^>]*\/>/g, '');
    xml = xml.replace(/<w:tblpPr[\s\S]*?<\/w:tblpPr>/g, '');

    xml = xml.replace(/<w:tblInd\b[^>]*w:w="-[\d.]+"[^>]*\/>/g, '<w:tblInd w:w="0" w:type="dxa"/>');
    xml = xml.replace(/<w:tblInd\b[^>]*w:w="-[\d.]+"[^>]*>[\s\S]*?<\/w:tblInd>/g, '<w:tblInd w:w="0" w:type="dxa"/>');

    if (xml !== before) {
      zip.file('word/document.xml', xml);
      changed = true;
    }
  }

  const stylesFile = zip.file('word/styles.xml');
  if (stylesFile) {
    let styles = stylesFile.asText();
    const before = styles;
    styles = styles.replace(
      /<w:rFonts w:ascii="Calibri" w:cs="Calibri" w:eastAsia="Calibri" w:hAnsi="Calibri"\/>/g,
      '<w:rFonts w:ascii="Times New Roman" w:cs="Times New Roman" w:eastAsia="Times New Roman" w:hAnsi="Times New Roman"/>',
    );
    styles = styles.replace(/<w:sz w:val="22"\/>/g, '<w:sz w:val="24"/>');
    styles = styles.replace(/<w:szCs w:val="22"\/>/g, '<w:szCs w:val="24"/>');
    if (styles !== before) {
      zip.file('word/styles.xml', styles);
      changed = true;
    }
  }

  if (!changed) return { buffer: docxBuffer, normalized: false };
  return { buffer: zip.generate({ type: 'nodebuffer' }), normalized: true };
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
  const { buffer: normalized, normalized: didNormalize } = normalizeDocxForLibreOffice(docxBuffer);
  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), 'tutlio-docx-'));
  const inputPath = path.join(workDir, 'contract.docx');
  const outputPath = path.join(workDir, 'contract.pdf');
  await fs.writeFile(inputPath, normalized);
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
        if (pdf.length > 0) return { pdf, normalized: didNormalize };
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
    exportFilter: 'writer_pdf_Export',
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
    const { pdf, normalized } = await convertWithLibreOffice(docxBuffer);
    return res.status(200).json({
      pdfBase64: pdf.toString('base64'),
      meta: { version: SERVICE_VERSION, normalized, pdfBytes: pdf.length },
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
