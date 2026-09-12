import crypto from 'crypto';
import express from 'express';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { pathToFileURL } from 'url';
import PizZip from 'pizzip';
import { createWorker, runProcess } from './worker.js';

const app = express();

let admitted = 0;
app.use('/convert-docx-to-pdf', (req, res, next) => {
  const auth = checkConvertApiKey(req);
  if (!auth.allowed) return res.status(auth.status).json({ error: auth.error });
  if (admitted >= 3 || restarting) {
    res.setHeader('Retry-After', '5');
    return res.status(503).json({ error: 'Converter busy' });
  }
  admitted++;
  let released = false;
  const release = () => { if (!released) { released = true; admitted--; } };
  res.once('finish', release);
  res.once('close', release);
  next();
});
app.use(express.json({ limit: '50mb' }));
app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && 'body' in err) {
    console.warn('[docx-converter] invalid JSON body');
    return res.status(400).json({ error: 'Invalid JSON body' });
  }
  return next(err);
});

const SERVICE_VERSION = '2.2.2';
const PDF_WAIT_MS = Number(process.env.PDF_WAIT_MS || 120000);
const LO_TIMEOUT_MS = Number(process.env.LO_TIMEOUT_MS || 180000);
const worker = createWorker();
let lastProbe = null;
let restarting = false;
function restartWorker() {
  if (restarting) return;
  restarting = true;
  worker.stop();
  // Non-zero exit triggers Railway ON_FAILURE restart; do not accept more work.
  setTimeout(() => process.exit(1), 250).unref();
}

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
 * 4) Page break before the annex-2 header block (date + "Ugdymo šeimoje sutarties Nr."
 *    + "2 priedas"), matching Word Save-as-PDF — not only before "2 priedas", otherwise
 *    the contract number stays on the previous page under the signature.
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

    xml = xml.replace(/<w:tbl\b[\s\S]*?<\/w:tbl>/g, (tableXml) => {
      // Naive non-greedy match stops at the first nested </w:tbl> and would
      // slice extra-lessons (and other nested-table) documents into invalid XML.
      // LibreOffice then exits in <1s with HTTP 500.
      if ((tableXml.match(/<w:tbl\b/g) || []).length > 1) return tableXml;
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

    // Word template structure before annex 2:
    //   {{date}}
    //   Ugdymo šeimoje sutarties Nr. {{contract_number}}
    //   2 priedas
    // Page break must start at the date line so the contract number appears at the top
    // of the new page (as in Word Save-as-PDF), not under the annex-1 signature.
    if (/2\s*priedas/i.test(xml)) {
      const paras = [];
      const paraRe = /<w:p\b[^>]*>[\s\S]*?<\/w:p>/g;
      let m;
      while ((m = paraRe.exec(xml)) !== null) {
        paras.push({ start: m.index, end: m.index + m[0].length, xml: m[0] });
      }

      const annex2Idx = paras.findIndex((p) => /2\s*priedas/i.test(p.xml));
      if (annex2Idx >= 0) {
        let headerStart = annex2Idx;
        for (let i = annex2Idx - 1; i >= Math.max(0, annex2Idx - 4); i--) {
          const text = [...paras[i].xml.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)]
            .map((t) => t[1])
            .join('');
          const isContractLine =
            /Ugdymo\s+šeimoje\s+sutarties\s+Nr/i.test(text) || /\{\{\s*contract_number\s*\}\}/i.test(text);
          const isDateLine =
            /\{\{\s*date\s*\}\}/i.test(text) ||
            /^\s*\d{4}[-./]\d{1,2}[-./]\d{1,2}\s*$/.test(text.trim()) ||
            /^\s*\d{1,2}[-./]\d{1,2}[-./]\d{4}\s*$/.test(text.trim());
          if (isContractLine || isDateLine) {
            headerStart = i;
            continue;
          }
          break;
        }

        const withBreak = (pXml) => {
          if (/<w:pageBreakBefore\b/.test(pXml)) return pXml;
          if (/<w:pPr>/.test(pXml)) return pXml.replace('<w:pPr>', '<w:pPr><w:pageBreakBefore/>');
          return pXml.replace(/^(<w:p\b[^>]*>)/, '$1<w:pPr><w:pageBreakBefore/></w:pPr>');
        };
        const stripBreak = (pXml) =>
          pXml
            .replace(/<w:pageBreakBefore\s*\/>/g, '')
            .replace(/<w:pageBreakBefore[^>]*>[\s\S]*?<\/w:pageBreakBefore>/g, '');

        // Apply from right to left so earlier offsets stay valid.
        const edits = [];
        if (headerStart !== annex2Idx) {
          const stripped = stripBreak(paras[annex2Idx].xml);
          if (stripped !== paras[annex2Idx].xml) {
            edits.push({ start: paras[annex2Idx].start, end: paras[annex2Idx].end, xml: stripped });
          }
        }
        const headerXml = withBreak(paras[headerStart].xml);
        if (headerXml !== paras[headerStart].xml) {
          edits.push({ start: paras[headerStart].start, end: paras[headerStart].end, xml: headerXml });
        }
        edits.sort((a, b) => b.start - a.start);
        if (edits.length) {
          for (const edit of edits) {
            xml = xml.slice(0, edit.start) + edit.xml + xml.slice(edit.end);
          }
          meta.annexPageBreakInserted = true;
        }
      }
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

function safePrepareDocxForLibreOffice(docxBuffer) {
  try {
    return prepareDocxForLibreOffice(docxBuffer);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[docx-converter] prepareDocx skipped, using original buffer:', message);
    return {
      buffer: Buffer.from(docxBuffer),
      meta: { prepareSkipped: true, prepareError: message.slice(0, 300) },
    };
  }
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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isPdfBuffer(buf) {
  return buf.length > 0 && buf.subarray(0, 5).toString() === '%PDF-';
}

/** LibreOffice can exit before contract.pdf is fully written (fresh UserInstallation). */
async function waitForPdf(outputPath, workDir, timeoutMs = PDF_WAIT_MS) {
  const started = Date.now();
  let lastErr = null;
  while (Date.now() - started < timeoutMs) {
    try {
      const pdf = await fs.readFile(outputPath);
      if (isPdfBuffer(pdf)) return pdf;
    } catch (error) {
      lastErr = error;
    }
    try {
      const listing = await fs.readdir(workDir);
      for (const name of listing) {
        if (!name.toLowerCase().endsWith('.pdf')) continue;
        const candidate = path.join(workDir, name);
        const pdf = await fs.readFile(candidate);
        if (isPdfBuffer(pdf)) return pdf;
      }
    } catch (error) {
      lastErr = error;
    }
    await sleep(250);
  }
  const err = lastErr instanceof Error ? lastErr : new Error(`Timed out waiting for ${outputPath}`);
  err.infrastructureFailure = true;
  throw err;
}

async function runLibreOfficeOnce(docxBytes) {
  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), 'tutlio-docx-'));
  const outputPath = path.join(workDir, 'contract.pdf');
  const profilePath = path.join(workDir, 'profile');
  try {
    const inputPath = path.join(workDir, 'contract.docx');
    await fs.mkdir(profilePath, { recursive: true });
    await fs.writeFile(inputPath, docxBytes);
    await runProcess(process.env.LIBREOFFICE_PATH || '/usr/bin/soffice', [
      '-env:UserInstallation=' + pathToFileURL(profilePath).href,
      '--headless', '--nologo', '--nodefault', '--nofirststartwizard', '--nolockcheck', '--norestore',
      '--convert-to', 'pdf', '--outdir', workDir, inputPath,
    ], {
      timeoutMs: LO_TIMEOUT_MS,
      env: {
        ...process.env,
        HOME: workDir,
        TMPDIR: workDir,
        SAL_USE_VCLPLUGIN: 'gen',
        OMP_NUM_THREADS: '1',
        OPENBLAS_NUM_THREADS: '1',
      },
    });
    return await waitForPdf(outputPath, workDir);
  } catch (error) {
    const listing = await fs.readdir(workDir).catch(() => []);
    const detail = error instanceof Error ? error.message : String(error);
    const wrapped = new Error(
      `convert failed: ${detail}${listing.length ? ` (dir: ${listing.join(', ')})` : ''}`,
    );
    if (error instanceof Error && error.infrastructureFailure) wrapped.infrastructureFailure = true;
    throw wrapped;
  } finally {
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}

async function convertWithLibreOffice(docxBuffer) {
  const prepared = safePrepareDocxForLibreOffice(docxBuffer);
  try {
    const pdf = await runLibreOfficeOnce(prepared.buffer);
    return { pdf, meta: prepared.meta };
  } catch (firstError) {
    const original = Buffer.from(docxBuffer);
    if (original.equals(Buffer.from(prepared.buffer))) throw firstError;
    console.error(
      '[docx-converter] prepared DOCX failed, retrying original bytes:',
      firstError instanceof Error ? firstError.message : firstError,
    );
    const pdf = await runLibreOfficeOnce(original);
    return { pdf, meta: { ...prepared.meta, retriedOriginal: true } };
  }
}

async function probeConversion() {
  if (worker.state().active || worker.state().pending || restarting) return;
  try {
    await worker.run(async () => {
      const zip = new PizZip();
      zip.file('[Content_Types].xml', '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
      zip.file('_rels/.rels', '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
      zip.file('word/document.xml', '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Tutlio health check</w:t></w:r></w:p></w:body></w:document>');
      await runLibreOfficeOnce(zip.generate({ type: 'nodebuffer' }));
      lastProbe = new Date().toISOString();
    });
  } catch (error) { console.error('[worker] health conversion failed', error.message); restartWorker(); }
}

app.get('/health', (_req, res) => {
  const state = worker.state();
  const ok = Boolean(lastProbe) && state.healthy;
  res.status(ok ? 200 : 503).json({ ok, version: SERVICE_VERSION, lastSuccessfulConversion: lastProbe, ...state });
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
    const { pdf, meta } = await worker.run(async () => {
      const docxBuffer = Buffer.from(fileBase64, 'base64');
      const result = await convertWithLibreOffice(docxBuffer);
      lastProbe = new Date().toISOString();
      return result;
    });
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
    const message = error instanceof Error ? error.message : 'DOCX to PDF conversion failed';
    console.error('[docx-converter] convert failed:', message);
    if (error.infrastructureFailure) restartWorker();
    const status = error.status || (error.infrastructureFailure ? 503 : 422);
    if (status === 503) res.setHeader('Retry-After', '5');
    return res.status(status).json({ error: status === 503 ? 'Converter temporarily unavailable' : 'Document conversion failed' });
  }
});

const port = Number(process.env.PORT || 3001);
const host = '0.0.0.0';
app.listen(port, host, () => {
  console.log(`tutlio-docx-converter listening on ${host}:${port}`);
  void probeConversion();
  setInterval(() => void probeConversion(), 60000).unref();
});
