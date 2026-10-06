/**
 * Finish Laisvi vaikai school material baseline (required before school_family_portal).
 *
 * Usage: node --import tsx scripts/complete-laisvi-material-baseline.ts
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { prepareSchoolMaterialBaseline } from '../api/_lib/schoolMaterialPublications.js';

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

async function main() {
  loadEnv();
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase env');
  const db = createClient(url, key);

  for (let i = 0; i < 20; i += 1) {
    const result = await prepareSchoolMaterialBaseline(db, LAISVI_ORG_ID);
    console.log(`Batch ${i + 1}: folders=${result.folders}, complete=${result.complete}`);
    if (result.complete) {
      console.log('Baseline complete.');
      return;
    }
  }
  throw new Error('Baseline still incomplete after 20 batches');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
