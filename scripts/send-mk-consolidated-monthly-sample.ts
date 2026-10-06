/**
 * Sample: one payer payment, one PVM S.F. per child (multi-subject lessons in one PDF).
 *
 *   npx tsx scripts/send-mk-consolidated-monthly-sample.ts
 *   npx tsx scripts/send-mk-consolidated-monthly-sample.ts --only-to=email@example.com
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resend } from 'resend';
import { generateInvoicePdf } from '../api/_lib/invoicePdf.ts';
import { formatInvoiceSeriesHeading } from '../api/_lib/invoiceNumber.ts';
import { buildEducationNotes } from '../api/_lib/pvmEducationInvoice.ts';
import { getFromEmail, getResendApiKey } from '../api/_lib/resendConfig.ts';
import { MANO_KOREPETITORIUS_ORG_ID } from '../api/_lib/marketMoney.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const DEFAULT_TO = 'alaniukasa@gmail.com';
const API_BASE = `http://localhost:${process.env.TEST_API_PORT || '3002'}`;

const SELLER = {
  name: 'MB "Mano korepetitorius"',
  entityType: 'mb' as const,
  companyCode: '305621035',
  vatCode: 'LT100018853316',
  address: 'Žirmūnų g. 100-63, Vilnius',
  contactEmail: 'info@manokorepetitorius.lt',
  bankName: 'Luminor bank AS',
  iban: 'LT574010051005439130',
};

function loadEnv() {
  for (const name of ['.env', '.env.local']) {
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

function getArg(name: string): string | null {
  const pref = `--${name}=`;
  const kv = process.argv.find((a) => a.startsWith(pref));
  return kv ? kv.slice(pref.length) : null;
}

async function trySendViaApi(to: string, attachments: Array<{ filename: string; content: string }>) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!key) return false;
  try {
    const res = await fetch(`${API_BASE}/api/send-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-internal-key': key },
      body: JSON.stringify({
        type: 'monthly_invoice',
        to,
        data: {
          organizationId: MANO_KOREPETITORIUS_ORG_ID,
          recipientName: 'Tėvai Pavyzdys',
          studentName: 'Greta ir Pijus',
          tutorName: 'MB "Mano korepetitorius"',
          periodText: '2026-09-01 - 2026-09-30',
          sessions: [
            { date: '2026-09-03', time: '16:00', subject: 'Matematika (Greta)', price: '22.00' },
            { date: '2026-09-10', time: '16:00', subject: 'Matematika (Greta)', price: '22.00' },
            { date: '2026-09-05', time: '17:30', subject: 'Anglų k. (Greta)', price: '24.00' },
            { date: '2026-09-12', time: '17:30', subject: 'Anglų k. (Greta)', price: '24.00' },
            { date: '2026-09-08', time: '15:00', subject: 'Fizika (Pijus)', price: '26.00' },
          ],
          lessonsTotal: '118.00',
          platformFees: '5.90',
          totalAmount: '123.90',
          paymentDeadline: '2026-10-14 23:59',
          paymentLink: 'https://tutlio.lt/api/pay-invoice?batch=PAVYZDYS-NEAPMOKETI',
        },
        attachments,
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      console.warn(`[mk-consolidated-sample] send-email API ${res.status}: ${text.slice(0, 200)}`);
      return false;
    }
    console.log(`[mk-consolidated-sample] monthly_invoice template → ${to} (local API)`);
    return true;
  } catch (err) {
    console.warn('[mk-consolidated-sample] local API unavailable, using Resend fallback');
    return false;
  }
}

async function main() {
  loadEnv();
  const resendKey = getResendApiKey();
  if (!resendKey) throw new Error('Missing RESEND_API_KEY or RESEND_API_KEY_STAGE');

  const to = getArg('only-to') || DEFAULT_TO;
  const tmpDir = join(ROOT, 'tmp');
  if (!existsSync(tmpDir)) mkdirSync(tmpDir);

  const gretaPdf = await generateInvoicePdf({
    invoiceNumber: 'MK-PAVYZDYS-1',
    invoiceNumberLabel: formatInvoiceSeriesHeading('MK-PAVYZDYS-1'),
    issueDate: '2026-09-30',
    periodStart: '2026-09-01',
    periodEnd: '2026-09-30',
    seller: SELLER,
    buyer: { name: 'Tėvai Pavyzdys', email: to },
    lineItems: [{ description: 'Mokymo paslaugos', quantity: 1, unitPrice: 92, totalPrice: 92 }],
    totalAmount: 92,
    layout: 'pvm_education',
    isVatInvoice: true,
    hidePlatformFooter: true,
    notes: buildEducationNotes('Greta Pavyzdytė', '9 klasė'),
    lessonDetails: [
      { subject: 'Matematika', price: 22, datetime: '2026-09-03 16:00' },
      { subject: 'Matematika', price: 22, datetime: '2026-09-10 16:00' },
      { subject: 'Matematika', price: 22, datetime: '2026-09-17 16:00' },
      { subject: 'Anglų k.', price: 24, datetime: '2026-09-05 17:30' },
      { subject: 'Anglų k.', price: 24, datetime: '2026-09-12 17:30' },
    ],
  });

  const pijusPdf = await generateInvoicePdf({
    invoiceNumber: 'MK-PAVYZDYS-2',
    invoiceNumberLabel: formatInvoiceSeriesHeading('MK-PAVYZDYS-2'),
    issueDate: '2026-09-30',
    periodStart: '2026-09-01',
    periodEnd: '2026-09-30',
    seller: SELLER,
    buyer: { name: 'Tėvai Pavyzdys', email: to },
    lineItems: [{ description: 'Mokymo paslaugos', quantity: 1, unitPrice: 26, totalPrice: 26 }],
    totalAmount: 26,
    layout: 'pvm_education',
    isVatInvoice: true,
    hidePlatformFooter: true,
    notes: buildEducationNotes('Pijus Pavyzdys', '11 klasė'),
    lessonDetails: [
      { subject: 'Fizika', price: 26, datetime: '2026-09-08 15:00' },
    ],
  });

  writeFileSync(join(tmpDir, 'SF-pavyzdys-Greta-keliai-dalykai.pdf'), gretaPdf);
  writeFileSync(join(tmpDir, 'SF-pavyzdys-Pijus.pdf'), pijusPdf);

  const attachments = [
    { filename: 'MK-PAVYZDYS-1-Greta.pdf', content: Buffer.from(gretaPdf).toString('base64') },
    { filename: 'MK-PAVYZDYS-2-Pijus.pdf', content: Buffer.from(pijusPdf).toString('base64') },
  ];

  const sentViaApi = await trySendViaApi(to, attachments);
  if (!sentViaApi) {
    const resend = new Resend(resendKey);
    const { data, error } = await resend.emails.send({
      from: getFromEmail(),
      to,
      subject: 'Mėnesio sąskaita – Mano korepetitorius (sujungto S.F. pavyzdys)',
      html: `
        <div style="font-family:system-ui,sans-serif;line-height:1.55;color:#111;max-width:560px;">
          <p>Labas,</p>
          <p>
            Tai <strong>pavyzdinis</strong> mėnesio sąskaitos laiškas po pataisos:
            <strong>vienas mokėjimas</strong> mokėtojui, bet <strong>atskiros PVM S.F. kiekvienam vaikui</strong>.
          </p>
          <ul>
            <li><strong>Greta</strong> — viena S.F. su Matematika + Anglų k. (skirtingi korepetitoriai, visos pamokos vienoje detalizacijoje)</li>
            <li><strong>Pijus</strong> — atskira S.F.</li>
          </ul>
          <p>Pamokų suma: <strong>118,00 €</strong> · Platformos mokestis: <strong>5,90 €</strong> · <strong>Mokėtina: 123,90 €</strong></p>
          <p><a href="https://tutlio.lt/api/pay-invoice?batch=PAVYZDYS-NEAPMOKETI" style="display:inline-block;background:#2563eb;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600;">Apmokėti</a></p>
          <p style="color:#64748b;font-size:13px;">Numeriai MK-PAVYZDYS-* — tik pavyzdys, realios MK serijos neliečia.</p>
        </div>
      `,
      attachments: attachments.map((a) => ({
        filename: a.filename,
        content: Buffer.from(a.content, 'base64'),
      })),
    });
    if (error) throw new Error(error.message || 'Resend send failed');
    console.log(`[mk-consolidated-sample] Resend fallback → ${to} (id: ${data?.id || 'ok'})`);
  }

  console.log('[mk-consolidated-sample] PDFs saved under tmp/');
}

main().catch((err) => {
  console.error('[mk-consolidated-sample] Failed:', err?.message || err);
  process.exit(1);
});
