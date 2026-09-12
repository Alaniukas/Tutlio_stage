/**
 * Demo Mokykla: prijungia vieną testinę grupę prie tikro LV Drive aplanko su vaizdo įrašais,
 * kad lokaliai galima būtų peržiūrėti /school/recordings be rankinio pildymo.
 *
 * Usage: node scripts/seed-demo-school-recordings-qa.mjs
 * Tik org c3a00000-7e57-4000-8000-000000000001 (Demo Mokykla).
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const DEMO_ORG_ID = 'c3a00000-7e57-4000-8000-000000000001';
/** QA grupė su trumpu pavadinimu – lengviau matyti UI. */
const DEMO_GROUP_ID = '23676e92-3deb-4425-87a2-86567d89f9fd';
const DEMO_GROUP_STUDENT_ID = 'c3a00000-7e57-4000-8000-000000000010';
const DEMO_PARENT_PROFILE_ID = '4a80c048-494e-4571-82ca-5b68ea845462';
/** Nepanaudotas LV aplankas (unikalus constraint – negali dubliuoti kitos grupės). */
const DEMO_DRIVE_FOLDER_ID = '1k2MLvuly7YXWjUOgk2tGGsoL_ScqqNaS';
const DEMO_DRIVE_FOLDER_NAME = 'Inga Matematika 3 klasė (recurring)';

function loadEnvFile(path) {
  if (!existsSync(path)) return {};
  const env = {};
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    env[m[1]] = v;
  }
  return env;
}

async function main() {
  const env = { ...loadEnvFile(join(ROOT, '.env')), ...loadEnvFile(join(ROOT, '.env.local')), ...process.env };
  const url = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Reikia VITE_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (.env.local)');

  const supabase = createClient(url, key);

  const { data: orgRow } = await supabase.from('organizations').select('features').eq('id', DEMO_ORG_ID).single();
  const features = { ...(orgRow?.features || {}), school_lesson_recordings: true };
  const { error: featError } = await supabase.from('organizations').update({ features }).eq('id', DEMO_ORG_ID);
  if (featError) console.warn('features update:', featError.message);

  const { error } = await supabase.from('school_recording_drive_folders').upsert({
    group_id: DEMO_GROUP_ID,
    organization_id: DEMO_ORG_ID,
    drive_folder_id: DEMO_DRIVE_FOLDER_ID,
    drive_folder_name: DEMO_DRIVE_FOLDER_NAME,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'group_id' });
  if (error) throw error;

  const { error: parentLinkError } = await supabase.from('parent_students').upsert({
    parent_id: DEMO_PARENT_PROFILE_ID,
    student_id: DEMO_GROUP_STUDENT_ID,
  }, { onConflict: 'parent_id,student_id', ignoreDuplicates: true });
  if (parentLinkError) console.warn('parent_students link:', parentLinkError.message);

  console.log(JSON.stringify({
    ok: true,
    org: DEMO_ORG_ID,
    group: 'aaaaaa',
    folderId: DEMO_DRIVE_FOLDER_ID,
    parentLogin: 'demo-mokykla.extra.parent@tutlio.lt',
    parentRecordingsUrl: '/parent/recordings?studentId=c3a00000-7e57-4000-8000-000000000010',
    tutorLogin: 'demo-mokykla.demo.tutor@tutlio.lt',
    tutorRecordingsUrl: '/recordings',
    hint: 'Slaptažodis: TutlioQaDemo2026! API: GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON_BASE64 .env.local',
  }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
