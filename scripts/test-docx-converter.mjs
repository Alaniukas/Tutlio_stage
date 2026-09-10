/** Quick health + convert smoke test for DOCX converter (uses .env credentials). */
import { readFileSync, existsSync } from 'fs';

function loadEnvFile(file) {
  if (!existsSync(file)) return {};
  return Object.fromEntries(
    readFileSync(file, 'utf8')
      .split(/\r?\n/)
      .filter((l) => l && !l.startsWith('#'))
      .map((l) => {
        const i = l.indexOf('=');
        let v = l.slice(i + 1).trim();
        if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
        return [l.slice(0, i), v];
      }),
  );
}

// Merge .env + optional .env.vercel.prod (prod overrides); converter keys often live only in .env
const env = { ...loadEnvFile('.env'), ...loadEnvFile('.env.vercel.prod') };

const base = (process.env.CONVERTER_URL || env.DOCX_CONVERTER_URL || '').replace(/\/$/, '');
const key = process.env.CONVERTER_KEY || env.DOCX_CONVERTER_API_KEY || '';

if (!base) {
  console.error('Set DOCX_CONVERTER_URL in .env or pass CONVERTER_URL=...');
  process.exit(1);
}

console.log('Testing:', base);
console.log('API key set:', Boolean(key));

const health = await fetch(base);
console.log('GET / →', health.status, await health.text());

// Use previously rendered contract docx if available, else skip convert test
let docxB64 = '';
if (existsSync('scripts/_last-rendered.docx')) {
  docxB64 = readFileSync('scripts/_last-rendered.docx').toString('base64');
  console.log('Using scripts/_last-rendered.docx (' + Math.round(docxB64.length / 1024) + ' KB b64)');
} else {
  console.log('No scripts/_last-rendered.docx — run: npx tsx scripts/_diag-contract-steps.ts <contract-id> first');
  process.exit(0);
}

const conv = await fetch(`${base}/convert-docx-to-pdf`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${key}`,
  },
  body: JSON.stringify({ fileBase64: docxB64 }),
});
const body = await conv.json().catch(async () => ({ raw: (await conv.text()).slice(0, 300) }));
console.log('POST /convert-docx-to-pdf →', conv.status);
if (body.pdfBase64) {
  console.log('SUCCESS — PDF base64 length:', body.pdfBase64.length);
} else {
  console.log('FAIL —', body.error || body.raw || body);
}
