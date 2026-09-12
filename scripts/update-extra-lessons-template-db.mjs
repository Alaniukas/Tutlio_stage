/**
 * Update extra-lessons template name + body in Supabase — Demo Mokykla only.
 * Do NOT run against real orgs on prod without explicit approval.
 *
 * Usage: node scripts/update-extra-lessons-template-db.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import mammoth from 'mammoth';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DEMO_ORG = 'c3a00000-7e57-4000-8000-000000000001';
const DEMO_TEMPLATE_ID = 'c3a00000-7e57-4000-8000-0000000000a3';
const DOCX = join(ROOT, 'docs', 'legal', 'extra-lessons-laisvi-vaikai.docx');

function loadEnv() {
  const env = { ...process.env };
  for (const rel of ['.env', '.env.local', '.env.vercel.stage']) {
    const path = join(ROOT, rel);
    if (!existsSync(path)) continue;
    for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (!m) continue;
      let v = m[2].trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      if (!env[m[1]]) env[m[1]] = v;
    }
    console.log('Loaded env from', path);
    break;
  }
  return env;
}

async function main() {
  const env = loadEnv();
  const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase credentials');

  const { value: bodyText } = await mammoth.extractRawText({ buffer: readFileSync(DOCX) });
  const visiblePamok = (bodyText.match(/pamok/gi) || []).length;
  if (visiblePamok > 2) console.warn('WARNING: still', visiblePamok, 'pamok matches in template text');

  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const { data: row } = await supabase
    .from('school_contract_templates')
    .select('id, name')
    .eq('id', DEMO_TEMPLATE_ID)
    .maybeSingle();
  if (!row?.id) throw new Error(`Demo template not found: ${DEMO_TEMPLATE_ID}`);
  const { error } = await supabase
    .from('school_contract_templates')
    .update({
      name: 'Papildomų užsiėmimų sutartis (DOCX)',
      body: bodyText,
    })
    .eq('id', row.id);
  if (error) throw new Error(`${row.id}: ${error.message}`);
  console.log('Updated Demo template', row.id, 'was:', row.name);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
