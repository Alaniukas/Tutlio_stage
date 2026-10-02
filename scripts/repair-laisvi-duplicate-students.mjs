/**
 * Repair Laisvi vaikai duplicate student rows (same payer + child name).
 * Merges sessions/contracts onto the oldest row and deletes the duplicate.
 *
 * Usage (prod): node scripts/repair-laisvi-duplicate-students.mjs
 * Requires SUPABASE_SERVICE_ROLE_KEY + VITE_SUPABASE_URL in .env
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const LAISVI_ORG_ID = '2dd745fc-20e7-4bc1-a5cd-a89cfe22ec17';

function loadEnv() {
  const envPath = resolve(process.cwd(), '.env');
  const text = readFileSync(envPath, 'utf8');
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx <= 0) continue;
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

function identityKey(row) {
  const name = String(row.full_name ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
  const payer = String(row.payer_email ?? '').trim().toLowerCase();
  return payer && name ? `${payer}:${name}` : `id:${row.id}`;
}

const MERGE_TABLES = [
  'sessions',
  'school_contracts',
  'recurring_individual_sessions',
  'school_session_billing_decisions',
  'student_lesson_discounts',
  'school_monthly_invoices',
  'lesson_packages',
];

async function mergeStudent(supabase, primaryId, duplicateId) {
  if (primaryId === duplicateId) return;
  console.log(`Merging ${duplicateId} -> ${primaryId}`);
  for (const table of MERGE_TABLES) {
    const { error } = await supabase.from(table).update({ student_id: primaryId }).eq('student_id', duplicateId);
    if (error && !/column .* does not exist/i.test(error.message)) {
      throw new Error(`${table}: ${error.message}`);
    }
  }
  const { error: memberError } = await supabase.from('school_class_group_members')
    .delete()
    .eq('student_id', duplicateId);
  if (memberError) throw new Error(`school_class_group_members delete: ${memberError.message}`);
  const { error: deleteError } = await supabase.from('students').delete().eq('id', duplicateId);
  if (deleteError) throw new Error(`students delete: ${deleteError.message}`);
}

async function main() {
  loadEnv();
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase env');
  const supabase = createClient(url, key);

  const { data: rows, error } = await supabase
    .from('students')
    .select('id, full_name, payer_email, tutor_id, created_at, detached_at')
    .eq('organization_id', LAISVI_ORG_ID)
    .is('detached_at', null);
  if (error) throw error;

  const groups = new Map();
  for (const row of rows || []) {
    const key = identityKey(row);
    const list = groups.get(key) || [];
    list.push(row);
    groups.set(key, list);
  }

  for (const [key, list] of groups) {
    if (list.length < 2) continue;
    const sorted = [...list].sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
    const withTutor = sorted.filter((row) => row.tutor_id);
    const tutorless = sorted.filter((row) => !row.tutor_id);
    const distinctTutors = new Set(withTutor.map((row) => row.tutor_id));

    if (distinctTutors.size <= 1 && tutorless.length > 0) {
      const primary = withTutor[0] || sorted[0];
      for (const dup of sorted) {
        if (dup.id === primary.id) continue;
        await mergeStudent(supabase, primary.id, dup.id);
      }
      console.log(`Merged duplicate identity ${key} onto ${primary.id}`);
      continue;
    }

    if (tutorless.length > 1) {
      const primary = withTutor[0] || tutorless[0];
      for (const dup of tutorless) {
        if (dup.id === primary.id) continue;
        await mergeStudent(supabase, primary.id, dup.id);
      }
      console.log(`Merged tutorless duplicates for ${key} onto ${primary.id}`);
    }
  }

  const alanPrimary = '38d924a3-2d9a-44cd-97fb-9b683d182988';
  const alanDup = '2c2384a6-85f7-4158-abcb-e7cfc95c1325';
  const { data: alanRows } = await supabase.from('students').select('id').in('id', [alanPrimary, alanDup]);
  if ((alanRows || []).length === 2) {
    await mergeStudent(supabase, alanPrimary, alanDup);
    console.log('Merged Jurovickij Alan duplicate row');
  }

  const { error: risError } = await supabase.from('recurring_individual_sessions').update({
    price: 20,
    subject_id: '385d2951-2704-401b-ba7b-5e5e87058d52',
  }).eq('id', '63adcf3e-3a25-49af-8467-5065dabf4459');
  if (risError) throw risError;

  const { error: sessionError } = await supabase.from('sessions').update({
    price: 20,
    subject_id: '385d2951-2704-401b-ba7b-5e5e87058d52',
  }).eq('id', '4f992bfc-8f06-47f5-ad16-fb8489093e37');
  if (sessionError) throw sessionError;

  console.log('Fixed Alan 25 EUR recurring/session pricing');
  console.log('Done');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
