/**
 * Resend extra-lessons offer email — QA / manual use only.
 * WARNING: touches real Laisvi vaikai contracts on prod. Prefer Demo Mokykla QA seeds.
 * Target inbox: alaniukasa@gmail.com
 *
 * Usage: ENV_FILE=.env.local node scripts/resend-laisvi-extra-offer-email.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const LAISVI_ORG = '2dd745fc-20e7-4bc1-a5cd-a89cfe22ec17';
const QA_EMAIL = 'alaniukasa@gmail.com';
const APP_URL = process.env.APP_URL || process.env.VITE_APP_URL || 'https://tutlio.lt';

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

async function sendOfferEmail(env, payload) {
  const url = `${APP_URL.replace(/\/$/, '')}/api/send-email`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-internal-key': env.SUPABASE_SERVICE_ROLE_KEY,
    },
    body: JSON.stringify({
      type: 'school_contract_extra_offer',
      to: QA_EMAIL,
      locale: 'lt',
      data: payload,
    }),
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`send-email ${res.status}: ${body.slice(0, 400)}`);
  return body;
}

async function main() {
  const env = loadEnv();
  const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required');

  const supabase = createClient(url, key, { auth: { persistSession: false } });

  const { data: contract } = await supabase
    .from('school_contracts')
    .select('id, contract_number, order_snapshot, unit_price_eur, annual_fee, signing_status, student:students(full_name, payer_name, payer_email)')
    .eq('organization_id', LAISVI_ORG)
    .eq('kind', 'extra_lessons')
    .in('signing_status', ['draft', 'sent'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!contract?.id) {
    throw new Error('No pending Laisvi vaikai extra-lessons contract found to resend');
  }

  const { data: tokenRow } = await supabase
    .from('school_contract_completion_tokens')
    .select('token')
    .eq('contract_id', contract.id)
    .maybeSingle();

  if (!tokenRow?.token) {
    throw new Error(`No accept token for contract ${contract.id}`);
  }

  const order = (contract.order_snapshot && typeof contract.order_snapshot === 'object')
    ? contract.order_snapshot
    : {};
  const acceptUrl = `${APP_URL.replace(/\/$/, '')}/school-extra-lessons-accept?token=${tokenRow.token}`;
  const unit = Number(contract.unit_price_eur || order.unit_price_eur || 6).toFixed(2);
  const monthly = Number(contract.annual_fee || order.indicative_monthly_eur || 0).toFixed(2);

  const { data: org } = await supabase.from('organizations').select('name, email').eq('id', LAISVI_ORG).maybeSingle();

  await sendOfferEmail(env, {
    schoolName: org?.name || 'VšĮ „Laisvi vaikai"',
    contactEmail: org?.email || 'irminta@laisvivaikai.lt',
    organizationId: LAISVI_ORG,
    studentName: contract.student?.full_name || 'Mokinys',
    parentName: contract.student?.payer_name || 'Mokėtojas',
    contractNumber: contract.contract_number,
    acceptUrl,
    serviceName: order.service_name || order.group_name || 'Papildomi užsiėmimai',
    schedule: order.schedule_label || '',
    startDate: order.start_date || '',
    endDate: order.end_date || '',
    unitPrice: unit,
    monthlyPrice: monthly,
  });

  console.log('Sent extra-lessons offer to', QA_EMAIL);
  console.log('Accept URL:', acceptUrl);
  console.log('Contract:', contract.contract_number, contract.id);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
