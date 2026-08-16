/**
 * Extra Demo Mokykla org-admin seats for simultaneous-login + permission QA.
 *
 * Usage: node scripts/seed-demo-org-admins.mjs
 * Loads .env.local, then .env.vercel.stage, then .env.
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PASSWORD = 'TutlioQaDemo2026!';
const ORG_ID = 'c3a00000-7e57-4000-8000-000000000001';
const OWNER_ID = 'c3a00000-7e57-4000-8000-000000000002';

const FULL_ADMIN = {
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
};

const ACCOUNTANT = {
  'finance.view': true,
  'finance.edit': true,
};

const LIMITED = {
  'dashboard.view': true,
  'students.view': true,
  'students.edit': true,
  'sessions.view': true,
};

const EXTRA_ADMINS = [
  {
    id: 'c3a00000-7e57-4000-8000-0000000000b2',
    email: 'demo-mokykla.demo.admin2@tutlio.lt',
    fullName: 'Demo Mokykla Adminė Ieva',
    role: 'admin',
    permissions: FULL_ADMIN,
  },
  {
    id: 'c3a00000-7e57-4000-8000-0000000000b3',
    email: 'demo-mokykla.demo.accountant@tutlio.lt',
    fullName: 'Demo Mokykla Buhalterė Rūta',
    role: 'accountant',
    permissions: ACCOUNTANT,
  },
  {
    id: 'c3a00000-7e57-4000-8000-0000000000b4',
    email: 'demo-mokykla.demo.limited@tutlio.lt',
    fullName: 'Demo Mokykla Koordinatorė Greta',
    role: 'custom',
    permissions: LIMITED,
  },
];

function loadEnv() {
  const env = {};
  for (const name of ['.env.local', '.env.vercel.stage', '.env']) {
    const path = join(ROOT, name);
    if (!existsSync(path)) continue;
    for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (!m) continue;
      let v = m[2].trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      if (env[m[1]] === undefined) env[m[1]] = v;
    }
  }
  return env;
}

async function ensureAuthUser(supabase, { id, email, fullName }) {
  const { data: existing } = await supabase.auth.admin.getUserById(id);
  if (existing?.user) {
    const { error } = await supabase.auth.admin.updateUserById(id, {
      email,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });
    if (error) throw new Error(`updateUser ${email}: ${error.message}`);
    return id;
  }
  const { data, error } = await supabase.auth.admin.createUser({
    id,
    email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });
  if (error) throw new Error(`createUser ${email}: ${error.message}`);
  return data.user.id;
}

async function main() {
  const env = loadEnv();
  const url = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing VITE_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');

  const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  const now = new Date().toISOString();

  const { error: ownerErr } = await supabase.from('organization_admins').update({
    role: 'owner',
    status: 'active',
    permissions: {},
    accepted_at: now,
    updated_at: now,
  }).eq('user_id', OWNER_ID).eq('organization_id', ORG_ID);
  if (ownerErr) throw new Error(`owner seat: ${ownerErr.message}`);

  for (const admin of EXTRA_ADMINS) {
    await ensureAuthUser(supabase, admin);
    const { error: profileErr } = await supabase.from('profiles').upsert({
      id: admin.id,
      email: admin.email,
      full_name: admin.fullName,
      organization_id: ORG_ID,
    }, { onConflict: 'id' });
    if (profileErr) throw new Error(`profile ${admin.email}: ${profileErr.message}`);

    const { error: seatErr } = await supabase.from('organization_admins').upsert({
      user_id: admin.id,
      organization_id: ORG_ID,
      role: admin.role,
      permissions: admin.permissions,
      status: 'active',
      invited_by_user_id: OWNER_ID,
      accepted_at: now,
      revoked_at: null,
      updated_at: now,
    }, { onConflict: 'user_id' });
    if (seatErr) throw new Error(`seat ${admin.email}: ${seatErr.message}`);
    console.log(`OK ${admin.role.padEnd(11)} ${admin.email}`);
  }

  const { data: seats, error: listErr } = await supabase
    .from('organization_admins')
    .select('role, status, user_id')
    .eq('organization_id', ORG_ID)
    .is('revoked_at', null)
    .order('created_at');
  if (listErr) throw new Error(listErr.message);
  console.log(`Seats: ${seats.length}`);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
