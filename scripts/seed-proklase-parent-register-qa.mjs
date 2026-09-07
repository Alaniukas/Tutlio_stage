/**
 * Seeds a unused Pro Klasė QA parent invite for local register QA.
 * Parent email is alanas@digroup.lt so local QA can create a fresh Auth user.
 *
 * Usage: node scripts/seed-proklase-parent-register-qa.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const ORG_ID = 'b0a00000-7e57-4000-8000-000000000001';
const TUTOR_ID = 'b0a00000-7e57-4000-8000-000000000003';
const STUDENT_ID = 'b0a00000-7e57-4000-8000-000000000091';
const INVITE_ID = 'b0a00000-7e57-4000-8000-000000000092';
const TOKEN = 'pkqa-parent-alaniukas-token';
const CODE = 'PKALAN1';
const PARENT_EMAIL = 'alanas@digroup.lt';

function loadEnv() {
  const out = {};
  for (const name of ['.env.local', '.env']) {
    const p = join(ROOT, name);
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (!m) continue;
      let v = m[2].trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      if (out[m[1]] == null || out[m[1]] === '') out[m[1]] = v;
    }
  }
  return out;
}

async function main() {
  const env = loadEnv();
  const url = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Need VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

  const { data: org } = await supabase.from('organizations').select('id, name').eq('id', ORG_ID).maybeSingle();
  if (!org) throw new Error('Pro Klasė QA org missing — run node scripts/seed-qa-demo-orgs.mjs first');

  const { error: stuErr } = await supabase.from('students').upsert({
    id: STUDENT_ID,
    tutor_id: TUTOR_ID,
    organization_id: ORG_ID,
    full_name: 'QA Armandas',
    email: 'qa.armandas.parentreg@tutlio.lt',
    grade: null,
    linked_user_id: null,
    parent_user_id: null,
    payer_name: 'QA Tėvas Alanas',
    payer_email: PARENT_EMAIL,
    phone: '+37060000991',
  }, { onConflict: 'id' });
  if (stuErr) throw new Error(`student: ${stuErr.message}`);

  const { error: invErr } = await supabase.from('parent_invites').upsert({
    id: INVITE_ID,
    token: TOKEN,
    code: CODE,
    parent_email: PARENT_EMAIL,
    parent_name: 'QA Tėvas Alanas',
    student_id: STUDENT_ID,
    used: false,
  }, { onConflict: 'id' });
  if (invErr) throw new Error(`parent invite: ${invErr.message}`);

  const appUrl = (env.VITE_APP_URL || env.APP_URL || 'http://localhost:3000').replace(/\/$/, '');
  console.log('Pro Klasė parent-register QA seed OK');
  console.log(`  Org:     ${org.name}`);
  console.log(`  Student: QA Armandas`);
  console.log(`  Parent:  ${PARENT_EMAIL}`);
  console.log(`  Link:    ${appUrl}/parent-register?token=${TOKEN}`);
  console.log(`  Manual:  ${appUrl}/parent-register`);
  console.log(`  Code:    ${CODE}`);
  console.log('  Password on the form: choose any 6+ chars.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
