import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import PizZip from 'pizzip';

test('real LibreOffice survives sequential and burst traffic', {
  skip: !existsSync('/usr/bin/soffice'), timeout: 180000,
}, async () => {
  const port = 19000 + Math.floor(Math.random() * 10000);
  const server = spawn(process.execPath, ['server.js'], {
    cwd: new URL('..', import.meta.url),
    env: { ...process.env, PORT: String(port), DOCX_CONVERTER_API_KEY: 'isolated-test' },
    stdio: 'ignore',
  });
  const base = `http://127.0.0.1:${port}`;
  try {
    let ready = false;
    for (let i = 0; i < 100; i++) {
      try { ready = (await fetch(`${base}/health`)).ok; } catch {}
      if (ready) break;
      await delay(200);
    }
    assert.ok(ready, 'real startup conversion must pass');
    const zip = new PizZip();
    zip.file('[Content_Types].xml', '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
    zip.file('_rels/.rels', '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="r1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
    zip.file('word/document.xml', '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Testinė sutartis ĄČĘĖĮŠŲŪŽ</w:t></w:r></w:p></w:body></w:document>');
    const body = JSON.stringify({ fileBase64: zip.generate({ type: 'base64' }) });
    const convert = () => fetch(`${base}/convert-docx-to-pdf`, { method: 'POST',
      headers: { Authorization: 'Bearer isolated-test', 'Content-Type': 'application/json' }, body });
    for (let i = 0; i < 20; i++) {
      const response = await convert();
      assert.equal(response.status, 200);
      assert.equal(Buffer.from((await response.json()).pdfBase64, 'base64').subarray(0, 5).toString(), '%PDF-');
    }
    const burst = await Promise.all(Array.from({ length: 12 }, convert));
    assert.ok(burst.some(response => response.status === 503), 'burst should be bounded');
    assert.ok(burst.every(response => [200, 503].includes(response.status)));
    const final = await convert();
    assert.equal(final.status, 200, 'service must remain usable after overload');
  } finally { server.kill('SIGKILL'); }
});
