import express from 'express';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';

const execFileAsync = promisify(execFile);
const app = express();
const PORT = Number(process.env.PORT || 8080);
const API_KEY = (process.env.DOCX_CONVERTER_API_KEY || '').trim();
const VERSION = '2.0.0';

app.use(express.json({ limit: '50mb' }));

function auth(req, res, next) {
  if (!API_KEY) return next();
  const header = String(req.headers.authorization || '');
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (token !== API_KEY) return res.status(401).json({ error: 'Unauthorized' });
  return next();
}

app.get('/', (_req, res) => {
  res.json({ ok: true, service: 'tutlio-docx-converter', version: VERSION });
});

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'tutlio-docx-converter', version: VERSION });
});

app.post('/convert-docx-to-pdf', auth, async (req, res) => {
  const fileBase64 = typeof req.body?.fileBase64 === 'string' ? req.body.fileBase64 : '';
  if (!fileBase64) return res.status(400).json({ error: 'Missing fileBase64' });

  let workDir = '';
  try {
    const docxBuffer = Buffer.from(fileBase64, 'base64');
    if (!docxBuffer.length) return res.status(400).json({ error: 'Empty DOCX payload' });

    workDir = await fs.mkdtemp(path.join(os.tmpdir(), 'docx-pdf-'));
    const inputPath = path.join(workDir, 'contract.docx');
    const outputPath = path.join(workDir, 'contract.pdf');
    await fs.writeFile(inputPath, docxBuffer);

    await execFileAsync(
      'soffice',
      ['--headless', '--nologo', '--nofirststartwizard', '--convert-to', 'pdf', '--outdir', workDir, inputPath],
      { timeout: 120000 },
    );

    const pdf = await fs.readFile(outputPath);
    if (!pdf.length) throw new Error('LibreOffice produced an empty PDF');
    return res.status(200).json({ pdfBase64: pdf.toString('base64') });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Conversion failed';
    console.error('[docx-converter]', message);
    return res.status(500).json({ error: message });
  } finally {
    if (workDir) await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
});

app.listen(PORT, () => {
  console.log(`tutlio-docx-converter v${VERSION} listening on :${PORT}`);
});
