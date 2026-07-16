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
const SERVICE_VERSION = '1.7.0';

/** Calibrated on Railway Linux LO vs Word Save-as-PDF for annex table "Dalykas" x=120. */
const FLOATING_TABLE_TBL_IND = Number(process.env.FLOATING_TABLE_TBL_IND || -580);

const TIMES_RFONTS =
  '<w:rFonts w:ascii="Times New Roman" w:cs="Times New Roman" w:eastAsia="Times New Roman" w:hAnsi="Times New Roman"/>';

/**
 * School contract DOCX prep for LibreOffice:
 * 1) Floating annex tables (tblpPr) → fixed tblInd so Linux LO matches Word X position
 * 2) List numbering fonts (Arial in numbering.xml) → Times New Roman (numbers otherwise
 *    render as Carlito/Arial while body is Times)
 * 3) styles.xml docDefaults Calibri → Times (page numbers / fallbacks)
 * 4) Page break before "2 priedas" so annex I and II never share a page
 */
function prepareDocxForLibreOffice(docxBuffer) {
  const zip = new PizZip(docxBuffer);
  const meta = {
    floatingTablesFixed: 0,
    numberingFontsFixed: 0,
    stylesFontsFixed: 0,
    annexPageBreakInserted: false,
  };

  const docFile = zip.file('word/document.xml');
  if (docFile) {
    let xml = docFile.asText();

    xml = xml.replace(/<w:tbl>[\s\S]*?<\/w:tbl>/g, (tableXml) => {
      if (!tableXml.includes('tblpPr')) return tableXml;
      meta.floatingTablesFixed += 1;
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

    // Force page break before annex 2 (static schedule). Template has no break between
    // "1 priedas" and "2 priedas", so filled contracts put both on the same page.
    if (/2\s*priedas/i.test(xml) && !/pageBreakBefore[\s\S]{0,400}2\s*priedas/i.test(xml)) {
      const before = xml;
      xml = xml.replace(/<w:p\b([^>]*)>([\s\S]*?)<\/w:p>/g, (para, attrs, body) => {
        if (!/2\s*priedas/i.test(body)) return para;
        if (/<w:pageBreakBefore\b/.test(body)) return para;
        if (/<w:pPr>/.test(body)) {
          return `<w:p${attrs}>${body.replace('<w:pPr>', '<w:pPr><w:pageBreakBefore/>')}</w:p>`;
        }
        return `<w:p${attrs}><w:pPr><w:pageBreakBefore/></w:pPr>${body}</w:p>`;
      });
      if (xml !== before) meta.annexPageBreakInserted = true;
    }

    zip.file('word/document.xml', xml);
  }

  const numberingFile = zip.file('word/numbering.xml');
  if (numberingFile) {
    let numbering = numberingFile.asText();
    const before = numbering;
    numbering = numbering.replace(
      /w:(ascii|hAnsi|cs|eastAsia)="(?:Arial(?: Unicode MS)?|Calibri|Carlito|Helvetica|sans-serif)"/gi,
      'w:$1="Times New Roman"',
    );
    // Ensure every list level rPr has Times New Roman (Word often omits rFonts and LO falls back)
    numbering = numbering.replace(/<w:lvl\b[\s\S]*?<\/w:lvl>/g, (lvl) => {
      if (/w:ascii="Times New Roman"/.test(lvl)) return lvl;
      if (/<w:rPr>/.test(lvl)) {
        return lvl.replace(/<w:rPr>/, `<w:rPr>${TIMES_RFONTS}`);
      }
      if (/<\/w:pPr>/.test(lvl)) {
        return lvl.replace(/<\/w:pPr>/, `</w:pPr><w:rPr>${TIMES_RFONTS}</w:rPr>`);
      }
      return lvl.replace(/(<w:lvl\b[^>]*>)/, `$1<w:rPr>${TIMES_RFONTS}</w:rPr>`);
    });
    if (numbering !== before) {
      meta.numberingFontsFixed = 1;
      zip.file('word/numbering.xml', numbering);
    }
  }

  const stylesFile = zip.file('word/styles.xml');
  if (stylesFile) {
    let styles = stylesFile.asText();
    const before = styles;
    styles = styles.replace(
      /w:(ascii|hAnsi|cs|eastAsia)="(?:Arial(?: Unicode MS)?|Calibri|Carlito|Helvetica)"/gi,
      'w:$1="Times New Roman"',
    );
    if (styles !== before) {
      meta.stylesFontsFixed = 1;
      zip.file('word/styles.xml', styles);
    }
  }

  return { buffer: zip.generate({ type: 'nodebuffer' }), meta };
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
  const { buffer: prepared, meta } = prepareDocxForLibreOffice(docxBuffer);
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
        if (pdf.length > 0) return { pdf, meta };
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
    const { pdf, meta } = await convertWithLibreOffice(docxBuffer);
    return res.status(200).json({
      pdfBase64: pdf.toString('base64'),
      meta: {
        version: SERVICE_VERSION,
        ...meta,
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
