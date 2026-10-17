/**
 * One-time Laisvi vaikai parent account provision + October 31 transition emails.
 *
 *   npx tsx scripts/send-laisvi-family-transition-invites.ts
 *   npx tsx scripts/send-laisvi-family-transition-invites.ts --apply
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { LAISVI_VAIKIAI_ORG_ID } from '../api/_lib/marketMoney.js';
import {
  applySchoolFamilyTransitionInvites,
  planSchoolFamilyTransitionInvites,
  sendSchoolFamilyUnsignedAdminReport,
} from '../api/_lib/schoolFamilyTransitionBulk.js';
import type { SchoolFamilyOrganization } from '../api/_lib/schoolFamilyAccounts.js';

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

function adminRecipients(org: { email?: string | null; features?: Record<string, unknown> | null }): string[] {
  const signing = org.features && typeof org.features.school_contract_signing_email === 'string'
    ? org.features.school_contract_signing_email : '';
  return [...new Set(['alaniukasa@gmail.com', org.email || '', signing].map((value) => value.trim()).filter(Boolean))];
}

async function main() {
  loadEnv();
  const apply = process.argv.includes('--apply');
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase env');
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const organization = await db.from('organizations')
    .select('id,name,slug,entity_type,preferred_locale,features,logo_url,brand_color,brand_color_secondary,email')
    .eq('id', LAISVI_VAIKIAI_ORG_ID).maybeSingle();
  if (organization.error || !organization.data) throw new Error('Organization not found');
  const org = organization.data as SchoolFamilyOrganization & { email?: string | null };
  const plan = await planSchoolFamilyTransitionInvites(db, org);
  console.log(JSON.stringify({
    mode: apply ? 'apply' : 'plan',
    families: plan.families.length,
    parents: plan.families.map((family) => ({ email: family.guardianEmail, children: family.studentNames })),
    skipped: plan.skipped,
    overview: plan.overview,
  }, null, 2));
  if (!apply) return;
  const admin = await db.from('organization_admins').select('user_id').eq('organization_id', org.id).limit(1).maybeSingle();
  if (admin.error || !admin.data?.user_id) throw new Error('No organization admin');
  const result = await applySchoolFamilyTransitionInvites(db, org, admin.data.user_id, process.env.APP_URL || 'https://tutlio.lt');
  const report = await sendSchoolFamilyUnsignedAdminReport(db, org, result.skipped, adminRecipients(org));
  console.log(JSON.stringify({ result, adminReport: report }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
