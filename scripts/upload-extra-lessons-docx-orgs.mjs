/**
 * Upload patched extra-lessons DOCX to Demo Mokykla template only.
 * Do NOT run against real orgs (e.g. Laisvi vaikai) on prod without explicit approval.
 *
 * Usage: ENV_FILE=.env.local node scripts/upload-extra-lessons-docx-orgs.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';
import mammoth from 'mammoth';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DEMO_ORG = 'c3a00000-7e57-4000-8000-000000000001';
const DEMO_TEMPLATE_ID = 'c3a00000-7e57-4000-8000-0000000000a3';

const DOCX = join(ROOT, 'docs', 'legal', 'extra-lessons-laisvi-vaikai.docx');

function loadEnv() {
  const candidates = [process.env.ENV_FILE, '.env.local', '.env.vercel.stage', '.env'].filter(Boolean);
  const env = { ...process.env };
  for (const rel of candidates) {
    const path = rel.includes('/') || rel.includes('\\') ? rel : join(ROOT, rel);
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

async function uploadTemplate(supabase, orgId, templateId, bytes, bodyText) {
  const path = `${orgId}/templates/papildomu-uzsiemimu-sutartis-${templateId}.docx`;
  const { error: upErr } = await supabase.storage.from('school-contracts').upload(path, bytes, {
    upsert: true,
    contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
  if (upErr) throw new Error(`storage ${orgId}: ${upErr.message}`);
  const { data: pub } = supabase.storage.from('school-contracts').getPublicUrl(path);
  const row = {
    id: templateId,
    organization_id: orgId,
    name: 'Papildomų užsiėmimų sutartis (DOCX)',
    body: bodyText,
    annual_fee_default: 0,
    is_default: false,
    pdf_url: pub.publicUrl,
  };
  const { error } = await supabase.from('school_contract_templates').upsert(row, { onConflict: 'id' });
  if (error) throw new Error(`template upsert ${orgId}: ${error.message}`);
  console.log('Uploaded template for', orgId, pub.publicUrl);
}

async function main() {
  const env = loadEnv();
  const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required');
  if (!existsSync(DOCX)) throw new Error(`Missing DOCX: ${DOCX}`);

  const bytes = readFileSync(DOCX);
  const { value: bodyText } = await mammoth.extractRawText({ buffer: bytes });
  if (/pamok/i.test(bodyText.replace(/\{\{pamokos_trukme_min\}\}/gi, ''))) {
    console.warn('WARNING: visible pamok* still in DOCX text — run patch script first');
  }

  const supabase = createClient(url, key, { auth: { persistSession: false } });
  await uploadTemplate(supabase, DEMO_ORG, DEMO_TEMPLATE_ID, bytes, bodyText);
  console.log('Demo Mokykla template updated.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
