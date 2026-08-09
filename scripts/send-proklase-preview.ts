/**
 * One-off: Pro Klasė white-label package emails + SF PDF sample → alaniukasa@gmail.com
 * Usage: npx tsx scripts/send-proklase-preview.ts
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import { generateInvoicePdf } from '../api/_lib/invoicePdf.ts';
import { resolveInvoiceBranding } from '../api/_lib/invoiceBranding.ts';
import { getFromEmail, getResendApiKey } from '../api/_lib/resendConfig.ts';
import { PRO_KLASE_ORG_ID } from '../api/_lib/marketMoney.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const TO = 'alaniukasa@gmail.com';
const API_BASE = `http://localhost:${process.env.TEST_API_PORT || '3002'}`;

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

async function main() {
  loadEnv();
  process.env.NODE_TLS_REJECT_UNAUTHORIZED ??= '0';

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  if (!serviceKey || !supabaseUrl) throw new Error('Missing Supabase env');

  console.log('Waiting for API…');
  await waitForApi();

  await sendEmail({
    type: 'prepaid_package_request',
    to: TO,
    data: {
      organizationId: PRO_KLASE_ORG_ID,
      recipientName: 'Test Tėvai',
      studentName: 'Test Mokinys',
      tutorName: 'Pro Klasė Korepetitorius',
      subjectName: 'Matematika',
      totalLessons: 8,
      pricePerLesson: '25.00',
      totalPrice: '200.00',
      paymentLink: 'https://tutlio.lt',
      locale: 'lt',
    },
  });

  await sendEmail({
    type: 'booking_confirmation',
    to: TO,
    data: {
      organizationId: PRO_KLASE_ORG_ID,
      studentName: 'Test Mokinys',
      tutorName: 'Pro Klasė Korepetitorius',
      date: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
      time: '14:00',
      subject: 'Matematika',
      price: 25,
      duration: 60,
      cancellationHours: 24,
      cancellationFeePercent: 50,
      paymentStatus: 'pending',
      locale: 'lt',
    },
  });

  const sb = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const branding = await resolveInvoiceBranding(sb, PRO_KLASE_ORG_ID);
  const issueDate = new Date().toLocaleDateString('lt-LT');
  const pdfBytes = await generateInvoicePdf({
    invoiceNumber: 'SF-PROKLASE-PREVIEW-001',
    issueDate,
    periodStart: '2026-08-01',
    periodEnd: '2026-08-31',
    seller: {
      name: 'UAB „Pro Klasė“',
      entityType: 'company',
      companyCode: '305000000',
      vatCode: 'LT100000000000',
      address: 'Vilnius',
      contactEmail: 'info@proklase.lt',
      contactPhone: '+370 656 87287',
    },
    buyer: {
      name: 'Ąžuolas Šeškas',
      email: TO,
      address: 'Kaunas',
    },
    lineItems: [
      {
        description:
          'Matematika – Lukas Petraitis – 4 pam.\n(08-03, 08-10, 08-17, 08-24)',
        quantity: 4,
        unitPrice: 25,
        totalPrice: 100,
      },
      {
        description: 'Paslaugos aprašymas – papildomos pamokos',
        quantity: 2,
        unitPrice: 27,
        totalPrice: 54,
      },
    ],
    totalAmount: 154,
    branding: branding ?? undefined,
  });

  const tmpDir = join(ROOT, 'tmp');
  mkdirSync(tmpDir, { recursive: true });
  const outPath = join(tmpDir, 'SF-proklase-preview-diacritics.pdf');
  writeFileSync(outPath, pdfBytes);
  console.log(`✓ PDF saved ${outPath} (${pdfBytes.byteLength} bytes)`);

  const resendKey = getResendApiKey();
  if (!resendKey) throw new Error('Missing RESEND_API_KEY / RESEND_API_KEY_STAGE');
  const resend = new Resend(resendKey);
  const { data, error } = await resend.emails.send({
    from: getFromEmail(),
    to: TO,
    subject: 'Pro Klasė – S.F. pavyzdys su lietuviškomis raidėmis',
    html: `
      <div style="font-family:system-ui,sans-serif;line-height:1.5;color:#111;">
        <p>Labas,</p>
        <p>Prisegta <strong>SĄSKAITA FAKTŪRA</strong> su Unicode fontu (Noto Sans) —
        antraštės su diacritics: SĄSKAITA FAKTŪRA, PARDAVĖJAS, PIRKĖJAS, IŠ VISO, Sąskaita suformuota…</p>
        <p style="color:#64748b;font-size:13px;">Numeris: SF-PROKLASE-PREVIEW-001 (pavyzdys, ne finansinis įrašas).</p>
      </div>
    `,
    attachments: [
      {
        filename: 'SF-proklase-preview-diacritics.pdf',
        content: Buffer.from(pdfBytes),
      },
    ],
  });
  if (error) throw new Error(error.message || 'Resend failed');
  console.log(`✓ SF email → ${TO} (id: ${data?.id || 'ok'})`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
