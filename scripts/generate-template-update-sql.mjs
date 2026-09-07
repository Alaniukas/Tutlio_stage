import { readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(join(ROOT, 'src/lib/extraLessonsLegalBody.ts'), 'utf8');
const body = src.match(/export const EXTRA_LESSONS_LEGAL_BODY = "([\s\S]*)";/)?.[1]
  ?.replace(/\\n/g, '\n')
  ?.replace(/\\"/g, '"');
if (!body) throw new Error('Could not parse EXTRA_LESSONS_LEGAL_BODY');

const tag = 'extra_lessons_legal_body_v1';
const sql = `UPDATE school_contract_templates
SET name = 'Papildomų užsiėmimų sutartis (DOCX)',
    body = $${tag}$${body}$${tag}$$
WHERE id IN (
  'c3a00000-7e57-4000-8000-0000000000a3',
  'c3a00000-7e57-4000-8000-0000000000a4'
);`;

writeFileSync(join(ROOT, 'scripts/_tmp-template-update.sql'), sql, 'utf8');
console.log('Wrote SQL', sql.length, 'chars; preview:', body.slice(0, 80));
