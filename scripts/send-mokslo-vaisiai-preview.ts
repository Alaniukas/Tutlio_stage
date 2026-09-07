/**
 * Apply production Mokslo vaisiai white-label and send sample emails.
 *
 *   npx tsx scripts/send-mokslo-vaisiai-preview.ts
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import {
  MOKSLO_VAISIAI_ADMIN_EMAIL,
  MOKSLO_VAISIAI_BRAND_COLOR,
  MOKSLO_VAISIAI_BRAND_COLOR_SECONDARY,
  MOKSLO_VAISIAI_ORG_ID,
  MOKSLO_VAISIAI_SLUG,
} from '../api/_lib/marketMoney.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const TO = 'alaniukasa@gmail.com';
const API_BASE = process.env.PREVIEW_API_BASE || `http://localhost:${process.env.TEST_API_PORT || '3002'}`;
const LOGO_PATH = join(ROOT, 'public', 'demo', 'mokslo-vaisiai-logo.png');
const LOGIN_DESC =
  'Profesionalūs korepetitoriai nuotoliu. Individualus dėmesys kiekvienam mokiniui, patyrę mokytojai ir aiškus mokymosi planas.';

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

async function sendEmail(
  payload: { type: string; to: string; data: Record<string, unknown> },
  apiBase: string,
  key: string,
) {
  const res = await fetch(`${apiBase}/api/send-email`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-internal-key': key,
    },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${payload.type}: ${res.status} ${text}`);
  console.log(`✓ email ${payload.type} → ${payload.to}`);
}

async function applyBranding(sb: ReturnType<typeof createClient>) {
  if (!existsSync(LOGO_PATH)) throw new Error(`Missing logo at ${LOGO_PATH}`);
  const buffer = readFileSync(LOGO_PATH);
  const storagePath = `org-logos/${MOKSLO_VAISIAI_ORG_ID}/mokslo-vaisiai.png`;
  const { error: upErr } = await sb.storage.from('blog-images').upload(storagePath, buffer, {
    contentType: 'image/png',
    upsert: true,
  });
  if (upErr) throw new Error(`logo upload: ${upErr.message}`);
  const { data: pub } = sb.storage.from('blog-images').getPublicUrl(storagePath);
  const logoUrl = `${pub.publicUrl}?v=${Date.now()}`;

  const { data: org, error: orgReadErr } = await sb
    .from('organizations')
    .select('features')
    .eq('id', MOKSLO_VAISIAI_ORG_ID)
    .maybeSingle();
  if (orgReadErr) throw new Error(`org read: ${orgReadErr.message}`);
  const prev = (org?.features && typeof org.features === 'object' ? org.features : {}) as Record<
    string,
    unknown
  >;
  const features = {
    ...prev,
    custom_branding: true,
    hide_powered_by: true,
    public_name: 'Mokslo vaisiai',
    contact_email: MOKSLO_VAISIAI_ADMIN_EMAIL,
    contact_phone: '+370 625 21244',
    email_team_signature: 'Mokslo vaisių komanda',
    email_sender_name: 'Mokslo vaisiai sistema',
    login_description: LOGIN_DESC,
  };
  delete (features as { email_footer_powered_by?: boolean }).email_footer_powered_by;

  const { error: orgErr } = await sb
    .from('organizations')
    .update({
      slug: MOKSLO_VAISIAI_SLUG,
      logo_url: logoUrl,
      brand_color: MOKSLO_VAISIAI_BRAND_COLOR,
      brand_color_secondary: MOKSLO_VAISIAI_BRAND_COLOR_SECONDARY,
      features,
    })
    .eq('id', MOKSLO_VAISIAI_ORG_ID);
  if (orgErr) throw new Error(`org update: ${orgErr.message}`);

  await sb
    .from('invoice_profiles')
    .update({
      contact_phone: '+370 625 21244',
      contact_email: MOKSLO_VAISIAI_ADMIN_EMAIL,
      updated_at: new Date().toISOString(),
    })
    .eq('organization_id', MOKSLO_VAISIAI_ORG_ID);

  console.log(`✓ branding applied, logo ${logoUrl}`);
  return logoUrl;
}

async function main() {
  loadEnv();
  process.env.NODE_TLS_REJECT_UNAUTHORIZED ??= '0';

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  if (!serviceKey || !supabaseUrl) throw new Error('Missing Supabase env');

  const sb = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  await applyBranding(sb);

  const apiCandidates = [API_BASE, 'https://tutlio.lt'];
  let apiBase = '';
  for (const base of apiCandidates) {
    try {
      const r = await fetch(`${base}/api/send-email`, { method: 'OPTIONS' });
      if (r.status || r.ok) {
        apiBase = base;
        break;
      }
    } catch {
      /* try next */
    }
  }
  if (!apiBase) throw new Error('No send-email API reachable (start npm run dev or use tutlio.lt)');
  console.log(`✓ using API ${apiBase}`);

  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const orgData = { organizationId: MOKSLO_VAISIAI_ORG_ID, locale: 'lt' };

  await sendEmail(
    {
      type: 'booking_confirmation',
      to: TO,
      data: {
        ...orgData,
        studentName: 'Emilija QA',
        tutorName: 'Mokslo vaisiai',
        date: tomorrow,
        time: '16:00',
        subject: 'Matematika',
        price: 25,
        duration: 60,
        cancellationHours: 24,
        cancellationFeePercent: 50,
        paymentStatus: 'pending',
      },
    },
    apiBase,
    serviceKey,
  );
  await sendEmail(
    {
      type: 'invite_email',
      to: TO,
      data: {
        ...orgData,
        studentName: 'Emilija QA',
        tutorName: 'Mokslo vaisiai',
        inviteCode: 'MVQA12',
        bookingUrl: `https://tutlio.lt/login?org=${MOKSLO_VAISIAI_SLUG}&portal=student`,
      },
    },
    apiBase,
    serviceKey,
  );
  await sendEmail(
    {
      type: 'mokslo_vaisiai_student_archive',
      to: TO,
      data: {
        ...orgData,
        studentName: 'Emilija QA',
        studentEmail: TO,
        studentPhone: '+370 600 00000',
        payerEmail: TO,
      },
    },
    apiBase,
    serviceKey,
  ).catch((err) => {
    console.warn(`archive preview skipped (deploy needed?): ${err instanceof Error ? err.message : err}`);
  });

  console.log(`✓ login: https://tutlio.lt/login?org=${MOKSLO_VAISIAI_SLUG}&portal=tutor`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
