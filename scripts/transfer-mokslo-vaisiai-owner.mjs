/**
 * Transfer Mokslo vaisiai owner to Agnė and downgrade info@ to custom operator (no finance totals).
 * Run only after finance.totals UI is deployed.
 *
 * Usage: node scripts/transfer-mokslo-vaisiai-owner.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ORG_ID = 'c1f36796-c281-4650-bed2-1bd6874764f1';
const CURRENT_OWNER_EMAIL = 'info@mokslovaisiai.lt';
const NEW_OWNER_EMAIL = 'agne.mokslovaisiai@gmail.com';
const PROD_REF = 'cuhciqwmqfuajeeqjjbm';

const OPERATOR_PERMISSIONS = {
  'dashboard.view': true,
  'tutors.view': true,
  'tutors.edit': true,
  'students.view': true,
  'students.edit': true,
  'sessions.view': true,
  'sessions.edit': true,
  'messages.view': true,
  'messages.edit': true,
  'stats.view': true,
  'finance.view': true,
  'finance.edit': true,
  'contracts.view': true,
  'contracts.edit': true,
  'settings.view': true,
  'settings.edit': true,
  'team.view': true,
  'team.edit': true,
};

function loadEnv() {
  for (const name of ['.env', '.env.vercel.stage', '.env.local']) {
    const p = join(ROOT, name);
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, 'utf8').split(/\r?\n/)) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const eq = t.indexOf('=');
      if (eq < 1) continue;
      const key = t.slice(0, eq).trim();
      let value = t.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      process.env[key] = value;
    }
  }
}

async function userIdByEmail(sb, email) {
  const { data, error } = await sb.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) throw new Error(`listUsers: ${error.message}`);
  const user = (data?.users || []).find((u) => String(u.email || '').toLowerCase() === email.toLowerCase());
  if (!user) throw new Error(`User not found: ${email}`);
  return user.id;
}

async function main() {
  loadEnv();
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
  if (!url.includes(PROD_REF)) {
    throw new Error(`Refusing: expected ${PROD_REF}, got ${url}`);
  }

  const sb = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  const currentOwnerId = await userIdByEmail(sb, CURRENT_OWNER_EMAIL);
  const newOwnerId = await userIdByEmail(sb, NEW_OWNER_EMAIL);

  const { error: transferError } = await sb.rpc('transfer_org_admin_ownership', {
    p_org_id: ORG_ID,
    p_current_owner_user_id: currentOwnerId,
    p_new_owner_user_id: newOwnerId,
  });
  if (transferError) throw new Error(`transfer_org_admin_ownership: ${transferError.message}`);

  const now = new Date().toISOString();
  const { error: operatorError } = await sb
    .from('organization_admins')
    .update({
      role: 'custom',
      permissions: OPERATOR_PERMISSIONS,
      updated_at: now,
    })
    .eq('organization_id', ORG_ID)
    .eq('user_id', currentOwnerId);
  if (operatorError) throw new Error(`operator permissions: ${operatorError.message}`);

  console.log(JSON.stringify({
    ok: true,
    orgId: ORG_ID,
    owner: NEW_OWNER_EMAIL,
    operator: CURRENT_OWNER_EMAIL,
  }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
