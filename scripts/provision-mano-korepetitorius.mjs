/**
 * Provision production org + org_admin for MB Mano korepetitorius.
 * Does not touch the QA demo org (c1a00000-… / manokorepetitorius).
 *
 * Usage:
 *   node scripts/provision-mano-korepetitorius.mjs
 *   MK_ADMIN_PASSWORD=... node scripts/provision-mano-korepetitorius.mjs
 *
 * Requires SUPABASE_URL / VITE_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'node:fs';
import { randomBytes, randomUUID } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const SLUG = 'mb-mano-korepetitorius';
const ADMIN_EMAIL = 'info@manokorepetitorius.lt';
const START_NUMBER = 1630;

function loadEnv() {
  for (const name of ['.env.local', '.env']) {
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
      if (!process.env[key]) process.env[key] = value;
    }
  }
}

function randomPassword() {
  return `Mk${randomBytes(9).toString('base64url')}!1`;
}

async function main() {
  loadEnv();
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');

  const password = process.env.MK_ADMIN_PASSWORD || randomPassword();
  const sb = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

  const { data: existingOrg } = await sb
    .from('organizations')
    .select('id')
    .eq('slug', SLUG)
    .maybeSingle();

  const orgId = existingOrg?.id || randomUUID();

  const features = {
    custom_branding: true,
    hide_powered_by: true,
    email_footer_powered_by: true,
    pvm_education_invoice: true,
    per_student_payment_override: true,
    org_admin_calendar_view: true,
    public_name: 'Mano Korepetitorius',
    contact_email: ADMIN_EMAIL,
    contact_phone: '+370 643 32675',
    email_team_signature: 'Mano Korepetitoriaus komanda',
    email_sender_name: 'Mano Korepetitorius sistema',
    login_description:
      'Kokybiškos individualios pamokos ir dėmesys kiekvienam mokiniui. Patyrę korepetitoriai, aiškus mokymosi planas ir nuolatinis ryšys su tėvais — gyvai Vilniuje ir nuotoliu visoje Lietuvoje.',
  };

  const { error: orgErr } = await sb.from('organizations').upsert(
    {
      id: orgId,
      name: 'Mano korepetitorius',
      email: ADMIN_EMAIL,
      status: 'active',
      entity_type: 'company',
      slug: SLUG,
      preferred_locale: 'lt',
      invoice_issuer_mode: 'company',
      enable_per_lesson: true,
      enable_prepaid_packages: true,
      enable_monthly_billing: false,
      tutor_limit: 9999,
      tutor_license_count: 5,
      brand_color: '#5C2D91',
      brand_color_secondary: '#D21E56',
      features,
    },
    { onConflict: 'id' },
  );
  if (orgErr) throw new Error(`organizations: ${orgErr.message}`);

  const { data: existingProfileUser } = await sb
    .from('profiles')
    .select('id')
    .eq('email', ADMIN_EMAIL)
    .maybeSingle();

  let userId = existingProfileUser?.id;
  if (userId) {
    const { error } = await sb.auth.admin.updateUserById(userId, {
      password,
      email_confirm: true,
      user_metadata: { full_name: 'Mano korepetitorius Admin' },
    });
    if (error) throw new Error(`updateUser: ${error.message}`);
  } else {
    const { data, error } = await sb.auth.admin.createUser({
      email: ADMIN_EMAIL,
      password,
      email_confirm: true,
      user_metadata: { full_name: 'Mano korepetitorius Admin' },
    });
    if (error) throw new Error(`createUser: ${error.message}`);
    userId = data.user.id;
  }

  const { error: profErr } = await sb.from('profiles').upsert(
    {
      id: userId,
      email: ADMIN_EMAIL,
      full_name: 'Mano korepetitorius Admin',
      organization_id: orgId,
      manual_subscription_exempt: true,
    },
    { onConflict: 'id' },
  );
  if (profErr) throw new Error(`profiles: ${profErr.message}`);

  const { error: adminErr } = await sb.from('organization_admins').upsert(
    {
      user_id: userId,
      organization_id: orgId,
      role: 'owner',
      status: 'active',
      permissions: {},
      accepted_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' },
  );
  if (adminErr) throw new Error(`organization_admins: ${adminErr.message}`);

  const { data: existingProfile } = await sb
    .from('invoice_profiles')
    .select('id, next_invoice_number')
    .eq('organization_id', orgId)
    .maybeSingle();

  const invoiceRow = {
    organization_id: orgId,
    user_id: null,
    entity_type: 'mb',
    business_name: 'MB "Mano korepetitorius"',
    company_code: '305621035',
    vat_code: 'LT100018853316',
    address: 'Žirmūnų g. 100-63, Vilnius',
    contact_email: ADMIN_EMAIL,
    contact_phone: '+370 643 32675',
    invoice_series: 'MK',
    bank_name: 'Luminor bank AS',
    iban: 'LT574010051005439130',
  };

  if (existingProfile?.id) {
    const { error } = await sb
      .from('invoice_profiles')
      .update({
        ...invoiceRow,
        next_invoice_number: existingProfile.next_invoice_number || START_NUMBER,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existingProfile.id);
    if (error) throw new Error(`invoice_profiles update: ${error.message}`);
  } else {
    const { error } = await sb.from('invoice_profiles').insert({
      ...invoiceRow,
      next_invoice_number: START_NUMBER,
    });
    if (error) throw new Error(`invoice_profiles insert: ${error.message}`);
  }

  console.log('\n=== Mano korepetitorius provisioned ===');
  console.log(`Org id:     ${orgId}`);
  console.log(`Slug:       ${SLUG}`);
  console.log(`Login:      /company/login`);
  console.log(`Email:      ${ADMIN_EMAIL}`);
  console.log(`Password:   ${password}`);
  console.log(`Next MK nr: ${START_NUMBER} (editable in invoice settings)`);
  console.log('Change password later via „Pamiršau slaptažodį“ on /company/login.\n');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
