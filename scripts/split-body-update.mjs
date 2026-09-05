import { readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(join(ROOT, 'src/lib/extraLessonsLegalBody.ts'), 'utf8');
const body = src.match(/export const EXTRA_LESSONS_LEGAL_BODY = "([\s\S]*)";/)?.[1]
  ?.replace(/\\n/g, '\n')
  ?.replace(/\\"/g, '"');
if (!body) throw new Error('parse failed');

const chunkSize = 4000;
const chunks = [];
for (let i = 0; i < body.length; i += chunkSize) chunks.push(body.slice(i, i + chunkSize));

const parts = chunks.map((c, i) => `$b${i}$${c}$b${i}$`).join(' || ');
const sql = `UPDATE school_contract_templates
SET body = ${parts}
WHERE id IN ('c3a00000-7e57-4000-8000-0000000000a3', 'c3a00000-7e57-4000-8000-0000000000a4');`;

writeFileSync(join(ROOT, 'scripts/_tmp-template-update-chunked.sql'), sql, 'utf8');
console.log('chunks', chunks.length, 'sql len', sql.length);
