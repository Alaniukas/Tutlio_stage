/**
 * Apply production Mano Korepetitorius branding, send sample emails, then
 * delete the temporary QA student so the live org stays empty.
 *
 *   npx tsx scripts/send-mano-korepetitorius-preview.ts
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import { generateInvoicePdf } from '../api/_lib/invoicePdf.ts';
import { resolveInvoiceBranding } from '../api/_lib/invoiceBranding.ts';
import { formatInvoiceSeriesHeading } from '../api/_lib/invoiceNumber.ts';
import { buildEducationNotes } from '../api/_lib/pvmEducationInvoice.ts';
import { getFromEmail, getResendApiKey } from '../api/_lib/resendConfig.ts';
import { MANO_KOREPETITORIUS_ORG_ID, MANO_KOREPETITORIUS_SLUG } from '../api/_lib/marketMoney.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const TO = 'alaniukasa@gmail.com';
const API_BASE = `http://localhost:${process.env.TEST_API_PORT || '3002'}`;
const QA_STUDENT_ID = 'e1e00000-7e57-4000-8000-00000000aa01';
const LOGO_PATH = join(ROOT, 'public', 'demo', 'mb-mano-korepetitorius-logo.png');
const LOGIN_DESC =
  'Kokybiškos individualios pamokos ir dėmesys kiekvienam mokiniui. Patyrę korepetitoriai, aiškus mokymosi planas ir nuolatinis ryšys su tėvais — gyvai Vilniuje ir nuotoliu visoje Lietuvoje.';

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

async function waitForApi(ms = 20000) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    try {
      const r = await fetch(`${API_BASE}/api/send-email`, { method: 'OPTIONS' });
      if (r.status || r.ok) return;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`API not reachable at ${API_BASE}`);
}

async function sendEmail(payload: { type: string; to: string; data: Record<string, unknown> }) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  const res = await fetch(`${API_BASE}/api/send-email`, {
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
  const storagePath = `org-logos/${MANO_KOREPETITORIUS_ORG_ID}/mb-mano-korepetitorius.png`;
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
    .eq('id', MANO_KOREPETITORIUS_ORG_ID)
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
    email_footer_powered_by: true,
    pvm_education_invoice: true,
    per_student_payment_override: true,
    org_admin_calendar_view: true,
    public_name: 'Mano Korepetitorius',
    contact_email: 'info@manokorepetitorius.lt',
    contact_phone: '+370 643 32675',
    email_team_signature: 'Mano Korepetitoriaus komanda',
    email_sender_name: 'Mano Korepetitorius sistema',
    login_description: LOGIN_DESC,
    manual_payments: false,
  };

  const { error: orgErr } = await sb
    .from('organizations')
    .update({
      logo_url: logoUrl,
      brand_color: '#5C2D91',
      brand_color_secondary: '#D21E56',
      features,
    })
    .eq('id', MANO_KOREPETITORIUS_ORG_ID);
  if (orgErr) throw new Error(`org update: ${orgErr.message}`);

  const { error: invErr } = await sb
    .from('invoice_profiles')
    .update({
      contact_phone: '+370 643 32675',
      contact_email: 'info@manokorepetitorius.lt',
      updated_at: new Date().toISOString(),
    })
    .eq('organization_id', MANO_KOREPETITORIUS_ORG_ID);
  if (invErr) throw new Error(`invoice_profiles: ${invErr.message}`);

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
  await waitForApi();

  await sb.from('students').delete().eq('id', QA_STUDENT_ID);
  const { error: stErr } = await sb.from('students').insert({
    id: QA_STUDENT_ID,
    organization_id: MANO_KOREPETITORIUS_ORG_ID,
    full_name: 'Tutlio QA — ištrinti',
    email: TO,
    payer_email: TO,
    payer_name: 'Tutlio QA tėvai',
    admin_comment: 'Laikinas Tutlio QA įrašas pavyzdiniams laiškams — ištrinti',
    enrollment_status: 'left',
    exit_reason: 'other',
    exit_note: 'Tutlio QA sample — auto-deleted after preview emails',
  });
  if (stErr) throw new Error(`student insert: ${stErr.message}`);
  console.log('✓ temporary QA student inserted (hidden as left)');

  try {
    const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    const orgData = { organizationId: MANO_KOREPETITORIUS_ORG_ID };

    await sendEmail({
      type: 'booking_confirmation',
      to: TO,
      data: {
        ...orgData,
        studentName: 'Emilija QA',
        tutorName: 'Mano Korepetitorius',
        date: tomorrow,
        time: '16:00',
        subject: 'Matematika',
        price: 25,
        duration: 60,
        cancellationHours: 24,
        cancellationFeePercent: 50,
        paymentStatus: 'pending',
        locale: 'lt',
      },
    });
    await sendEmail({
      type: 'invite_email',
      to: TO,
      data: {
        ...orgData,
        studentName: 'Emilija QA',
        tutorName: 'Mano Korepetitorius',
        inviteCode: 'MKQA12',
        bookingUrl: `https://tutlio.lt/login?org=${MANO_KOREPETITORIUS_SLUG}&portal=student`,
        locale: 'lt',
      },
    });
    await sendEmail({
      type: 'prepaid_package_request',
      to: TO,
      data: {
        ...orgData,
        recipientName: 'QA tėvai',
        studentName: 'Emilija QA',
        tutorName: 'Mano Korepetitorius',
        subjectName: 'Matematika',
        totalLessons: 8,
        pricePerLesson: '25.00',
        totalPrice: '200.00',
        paymentLink: 'https://tutlio.lt',
        locale: 'lt',
      },
    });
    await sendEmail({
      type: 'session_reminder',
      to: TO,
      data: {
        ...orgData,
        recipientName: 'Emilija QA',
        otherName: 'Mano Korepetitorius',
        date: tomorrow,
        time: '16:00',
        topic: 'Matematika',
        duration: 60,
        price: 25,
        isTutor: false,
        locale: 'lt',
      },
    });

    const branding = await resolveInvoiceBranding(sb, MANO_KOREPETITORIUS_ORG_ID);
    const pdfBytes = await generateInvoicePdf({
      invoiceNumber: 'MK-PREVIEW',
      invoiceNumberLabel: formatInvoiceSeriesHeading('MK-PREVIEW'),
      issueDate: new Date().toLocaleDateString('lt-LT'),
      periodStart: '2026-08-01',
      periodEnd: '2026-08-31',
      seller: {
        name: 'MB "Mano korepetitorius"',
        entityType: 'mb',
        companyCode: '305621035',
        vatCode: 'LT100018853316',
        address: 'Žirmūnų g. 100-63, Vilnius',
        contactEmail: 'info@manokorepetitorius.lt',
        contactPhone: '+370 643 32675',
        bankName: 'Luminor bank AS',
        iban: 'LT574010051005439130',
      },
      buyer: { name: 'QA pavyzdys (ne klientas)', email: TO },
      lineItems: [{ description: 'Mokymo paslaugos', quantity: 1, unitPrice: 40, totalPrice: 40 }],
      totalAmount: 40,
      layout: 'pvm_education',
      isVatInvoice: true,
      hidePlatformFooter: true,
      notes: buildEducationNotes('Emilija QA', '8 klasė'),
      lessonDetails: [
        { subject: 'Matematika', price: 20, datetime: '2026-08-10 16:00' },
        { subject: 'Matematika', price: 20, datetime: '2026-08-17 16:00' },
      ],
      branding: branding || undefined,
    });
    const tmpDir = join(ROOT, 'tmp');
    if (!existsSync(tmpDir)) mkdirSync(tmpDir);
    writeFileSync(join(tmpDir, 'SF-pavyzdys-Mano-Korepetitorius-live.pdf'), pdfBytes);

    const origin = 'https://tutlio.lt';
    const local = 'http://localhost:3000';
    const resend = new Resend(getResendApiKey() || '');
    const { error } = await resend.emails.send({
      from: getFromEmail(),
      to: TO,
      subject: 'Mano Korepetitorius — white-label login nuorodos ir S.F. pavyzdys',
      html: `
        <div style="font-family:system-ui,sans-serif;line-height:1.55;color:#111;max-width:560px;">
          <p>Produkcijos org <code>${MANO_KOREPETITORIUS_SLUG}</code> white-label (logo, spalvos, laiškai).</p>
          <p><strong>Prisijungimas (be admin):</strong></p>
          <ul>
            <li>Mokinys: <a href="${origin}/login?org=${MANO_KOREPETITORIUS_SLUG}&portal=student">${origin}/login?org=${MANO_KOREPETITORIUS_SLUG}&portal=student</a></li>
            <li>Tėvas: <a href="${origin}/login?org=${MANO_KOREPETITORIUS_SLUG}&portal=parent">${origin}/login?org=${MANO_KOREPETITORIUS_SLUG}&portal=parent</a></li>
            <li>Korepetitorius: <a href="${origin}/login?org=${MANO_KOREPETITORIUS_SLUG}&portal=tutor">${origin}/login?org=${MANO_KOREPETITORIUS_SLUG}&portal=tutor</a></li>
          </ul>
          <p>Lokalus preview (reikia deploy’into kodo tik produkcijoje; lokaliai jau veikia):</p>
          <ul>
            <li><a href="${local}/login?org=${MANO_KOREPETITORIUS_SLUG}&portal=student">${local}/login?org=${MANO_KOREPETITORIUS_SLUG}&portal=student</a></li>
          </ul>
          <p>Widget jų svetainei:</p>
          <pre style="background:#f4f1fb;padding:12px;border-radius:8px;font-size:12px;white-space:pre-wrap;">&lt;script src="${origin}/api/org-login-widget?slug=${MANO_KOREPETITORIUS_SLUG}&amp;locale=lt" async&gt;&lt;/script&gt;</pre>
          <p>Iframe:</p>
          <pre style="background:#f4f1fb;padding:12px;border-radius:8px;font-size:12px;white-space:pre-wrap;">&lt;iframe src="${origin}/embed/org-login?org=${MANO_KOREPETITORIUS_SLUG}" title="Mano Korepetitorius" style="border:0;width:320px;height:280px"&gt;&lt;/iframe&gt;</pre>
          <p style="color:#64748b;font-size:13px;">Priede — PVM S.F. pavyzdys su logo. Numeris MK-PREVIEW, realios MK numeracijos (1630+) neliečia. QA mokinys po šio laiško ištrintas.</p>
        </div>
      `,
      attachments: [
        {
          filename: 'SF-pavyzdys-Mano-Korepetitorius.pdf',
          content: Buffer.from(pdfBytes),
        },
      ],
    });
    if (error) throw new Error(error.message || 'summary email failed');
    console.log(`✓ summary + S.F. PDF → ${TO}`);
  } finally {
    const { error: delErr } = await sb.from('students').delete().eq('id', QA_STUDENT_ID);
    if (delErr) console.error('QA student delete failed:', delErr.message);
    else console.log('✓ temporary QA student deleted');
  }
}

main().catch((err) => {
  console.error('[mk-preview] Failed:', err?.message || err);
  process.exit(1);
});
