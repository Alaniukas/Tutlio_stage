/**
 * Announce forward stats / revenue forecast to selected org admins (prod only).
 *
 * Usage:
 *   node scripts/send-stats-forecast-announcement.mjs --dry-run
 *   node scripts/send-stats-forecast-announcement.mjs --send --i-confirm-broadcast
 *   node scripts/send-stats-forecast-announcement.mjs --send --only-to=you@example.com
 *
 * Requires .env: SUPABASE_URL or VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, APP_URL (prod).
 */
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const TARGET_ORG_IDS = [
  '2c4e4c2a-4e12-44ca-b327-d605bbb0d50b', // Mano Korepetitorius
  'c1f36796-c281-4650-bed2-1bd6874764f1', // Mokslo vaisiai
  '2dd745fc-20e7-4bc1-a5cd-a89cfe22ec17', // Laisvi vaikai
];

function loadEnv() {
  for (const name of ['.env', '.env.local']) {
    const p = join(root, name);
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, 'utf8').split(/\n/)) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const eq = t.indexOf('=');
      if (eq < 1) continue;
      const key = t.slice(0, eq).trim();
      let value = t.slice(eq + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = value;
    }
  }
}

loadEnv();

function normEmail(value) {
  if (!value || typeof value !== 'string') return null;
  const email = value.trim().toLowerCase();
  if (!email.includes('@')) return null;
  return email;
}

function isDemoOrQaEmail(email) {
  const e = email.toLowerCase();
  if (e.endsWith('@tutlio.lt')) return true;
  if (e.includes('demo')) return true;
  if (e.includes('qa-') || e.includes('.qa.')) return true;
  if (e.startsWith('qa')) return true;
  return false;
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

function getArg(name) {
  const pref = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(pref));
  if (hit) return hit.slice(pref.length);
  const idx = process.argv.indexOf(`--${name}`);
  if (idx !== -1) return process.argv[idx + 1] ?? '';
  return null;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function greetingLine() {
  return '<p style="margin:0 0 18px;font-size:18px;font-weight:700;color:#111827;line-height:1.35;letter-spacing:-0.02em;">Sveiki,</p>';
}

function bulletRows(lines) {
  const rows = lines.map((line) => `<tr>
  <td style="vertical-align:top;padding:10px 12px 10px 0;width:28px;font-size:15px;color:#4f46e5;line-height:1.45;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;">✓</td>
  <td style="vertical-align:top;padding:10px 0;color:#374151;font-size:15px;line-height:1.6;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;">${line}</td>
</tr>`).join('');
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 8px;border-collapse:collapse;">${rows}</table>`;
}

function wrapEmail(innerHtml) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#eef0f4;margin:0;padding:0;">
  <tr>
    <td align="center" style="padding:28px 12px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background:#ffffff;border-radius:20px;overflow:hidden;border:1px solid #e5e7eb;box-shadow:0 10px 40px rgba(15,23,42,0.08);">
        <tr>
          <td style="background-color:#4f46e5;padding:24px 28px;">
            <span style="font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:22px;font-weight:800;color:#ffffff;letter-spacing:-0.03em;">Tutlio</span>
            <div style="font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:13px;color:rgba(255,255,255,0.88);margin-top:6px;font-weight:500;">Naujiena administratoriams</div>
          </td>
        </tr>
        <tr>
          <td style="padding:28px 28px 8px;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
            ${innerHtml}
          </td>
        </tr>
        <tr>
          <td style="padding:8px 28px 28px;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
            <div style="border-top:1px solid #e5e7eb;margin:4px 0 18px;"></div>
            <p style="margin:0;font-size:13px;color:#9ca3af;line-height:1.55;text-align:center;">
              Tutlio komanda ·
              <a href="mailto:info@tutlio.lt" style="color:#4f46e5;font-weight:600;text-decoration:none;">info@tutlio.lt</a>
            </p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>`;
}

function buildLetter({ orgName, statsUrl, loginUrl }) {
  const subject = 'Tutlio: statistikos prognozė į priekį';
  const intro = `<p style="margin:0 0 20px;color:#4b5563;font-size:15px;line-height:1.65;">
    <strong style="color:#111827;">${orgName}</strong> statistikos skiltyje dabar galite žiūrėti ne tik praeities, bet ir <strong>būsimų</strong> pamokų suvestinę su numatomomis pajamomis.
  </p>`;
  const bullets = bulletRows([
    'Pasirinkite laikotarpį į priekį – pvz. <strong>Kitas mėnuo</strong> arba <strong>Artimiausia savaitė</strong>.',
    'Matysite suplanuotų pamokų skaičių ir <strong>numatomų pajamų</strong> prognozę pagal aktyvų grafiką.',
    'Jei laikotarpis apima ir praeitį, ir ateitį – rodoma ir faktinė suvestinė, ir likusio laiko prognozė.',
    `Atidarykite skiltį <a href="${statsUrl}" style="color:#4f46e5;font-weight:600;text-decoration:none;">Statistika</a> (${loginUrl ? `prisijungimas: <a href="${loginUrl}" style="color:#4f46e5;font-weight:600;text-decoration:none;">${loginUrl}</a>` : 'organizacijos administravimo portale'}).`,
  ]);
  const outro = '<p style="margin:18px 0 0;color:#6b7280;font-size:14px;line-height:1.6;">Jei reikia pagalbos – <a href="mailto:info@tutlio.lt" style="color:#4f46e5;font-weight:600;text-decoration:none;">info@tutlio.lt</a>. Pagarbiai, Tutlio komanda.</p>';
  const bodyHtml = wrapEmail(`${greetingLine()}${intro}${bullets}${outro}`);
  return { subject, bodyHtml };
}

async function sendOne(endpoint, serviceKey, to, subject, bodyHtml) {
  const maxAttempts = 5;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-internal-key': serviceKey,
      },
      body: JSON.stringify({
        type: 'custom_html_announcement',
        to,
        locale: 'lt',
        data: { subject, bodyHtml },
      }),
    });
    if (res.ok) return await res.text();
    const text = await res.text().catch(() => '');
    if ((res.status === 429 || /rate limit/i.test(text)) && attempt < maxAttempts) {
      const waitMs = 1200 * 2 ** (attempt - 1);
      console.warn(`Rate limit → ${to}, wait ${waitMs}ms`);
      await sleep(waitMs);
      continue;
    }
    throw new Error(`send-email ${to}: ${res.status} ${text}`);
  }
}

async function main() {
  const dryRun = hasFlag('dry-run') || !hasFlag('send');
  const onlyTo = normEmail(getArg('only-to'));
  const confirm = hasFlag('i-confirm-broadcast');

  const supabaseUrl = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim();
  const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!supabaseUrl || !serviceKey) {
    throw new Error('Missing SUPABASE_URL/VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  }

  const appUrl = (process.env.APP_URL || process.env.VITE_APP_URL || 'https://www.tutlio.lt').replace(/\/$/, '');
  const endpoint = `${appUrl}/api/send-email`;
  const sb = createClient(supabaseUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

  const { data: orgs, error: orgErr } = await sb
    .from('organizations')
    .select('id, name, entity_type')
    .in('id', TARGET_ORG_IDS);
  if (orgErr) throw orgErr;

  const { data: adminRows, error: adminErr } = await sb
    .from('organization_admins')
    .select('organization_id, user_id')
    .in('organization_id', TARGET_ORG_IDS);
  if (adminErr) throw adminErr;

  const userIds = [...new Set((adminRows || []).map((row) => row.user_id).filter(Boolean))];
  const { data: profileRows, error: profileErr } = userIds.length
    ? await sb.from('profiles').select('id, email, full_name').in('id', userIds)
    : { data: [], error: null };
  if (profileErr) throw profileErr;

  const profileById = new Map((profileRows || []).map((row) => [row.id, row]));
  const orgById = new Map((orgs || []).map((row) => [row.id, row]));
  const recipients = [];
  const seen = new Set();

  for (const row of adminRows || []) {
    const profile = profileById.get(row.user_id);
    const email = normEmail(profile?.email);
    if (!email || seen.has(email)) continue;
    if (!onlyTo && isDemoOrQaEmail(email)) continue;
    if (onlyTo && email !== onlyTo) continue;
    const org = orgById.get(row.organization_id);
    if (!org) continue;
    seen.add(email);
    recipients.push({
      email,
      fullName: profile?.full_name || null,
      orgId: row.organization_id,
      orgName: org.name || 'Organizacija',
      entityType: org.entity_type || 'company',
    });
  }

  if (!recipients.length) {
    console.log('No recipients matched (check org admins or --only-to filter).');
    return;
  }

  console.log(`[stats-forecast] ${dryRun ? 'DRY RUN' : 'SEND'} via ${endpoint}`);
  console.log(`[stats-forecast] recipients (${recipients.length}):`);
  for (const r of recipients) {
    console.log(`  - ${r.email} (${r.orgName})`);
  }

  if (dryRun) {
    console.log('\nAdd --send --i-confirm-broadcast to deliver.');
    return;
  }
  if (!onlyTo && !confirm) {
    throw new Error('Broadcast requires --i-confirm-broadcast (or use --only-to= for a single test).');
  }

  for (const recipient of recipients) {
    const isSchool = recipient.entityType === 'school';
    const statsPath = isSchool ? '/school/stats' : '/company/stats';
    const loginPath = isSchool ? '/school/login' : '/company/login';
    const letter = buildLetter({
      orgName: recipient.orgName,
      statsUrl: `${appUrl}${statsPath}`,
      loginUrl: `${appUrl}${loginPath}`,
    });
    const result = await sendOne(endpoint, serviceKey, recipient.email, letter.subject, letter.bodyHtml);
    console.log(`Sent → ${recipient.email} (${recipient.orgName})`);
    console.log(result);
    await sleep(250);
  }

  console.log(`Done. Sent ${recipients.length} email(s).`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
