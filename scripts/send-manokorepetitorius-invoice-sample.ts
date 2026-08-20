/**
 * Generates a sample S.F. PDF for Mano Korepetitorius (platform invoice layout)
 * and emails it. Also upserts org invoice_profiles with production requisites.
 *
 * Usage:
 *   npx tsx scripts/send-manokorepetitorius-invoice-sample.ts
 *   npx tsx scripts/send-manokorepetitorius-invoice-sample.ts --only-to=email@example.com
 */
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resend } from 'resend';
import { generateInvoicePdf } from '../api/_lib/invoicePdf.ts';
import { formatInvoiceSeriesHeading } from '../api/_lib/invoiceNumber.ts';
import { buildEducationNotes } from '../api/_lib/pvmEducationInvoice.ts';
import { getFromEmail, getResendApiKey } from '../api/_lib/resendConfig.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const DEFAULT_TO = 'alaniukasa@gmail.com';

const SELLER = {
  business_name: 'MB "Mano korepetitorius"',
  company_code: '305621035',
  vat_code: 'LT100018853316',
  address: 'Žirmūnų g. 100-63, Vilnius',
  contact_email: 'info@manokorepetitorius.lt',
  bank_name: 'Luminor bank AS',
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
  const idx = process.argv.findIndex((a) => a === `--${name}`);
  if (idx !== -1) return process.argv[idx + 1] || null;
  const pref = `--${name}=`;
  const kv = process.argv.find((a) => a.startsWith(pref));
  return kv ? kv.slice(pref.length) : null;
}

async function main() {
  loadEnv();
  process.env.NODE_TLS_REJECT_UNAUTHORIZED ??= '0';

  const resendKey = getResendApiKey();
  if (!resendKey) throw new Error('Missing RESEND_API_KEY or RESEND_API_KEY_STAGE');

  const to = getArg('only-to') || DEFAULT_TO;

  const invoiceNumber = 'MK-1629';
  const pdfBytes = await generateInvoicePdf({
    invoiceNumber,
    invoiceNumberLabel: formatInvoiceSeriesHeading(invoiceNumber),
    issueDate: '2026 m. birželio 30 d.',
    periodStart: '2026-06-01',
    periodEnd: '2026-06-30',
    seller: {
      name: SELLER.business_name,
      entityType: 'mb',
      companyCode: SELLER.company_code,
      vatCode: SELLER.vat_code,
      address: SELLER.address,
      contactEmail: SELLER.contact_email,
      bankName: SELLER.bank_name,
      iban: SELLER.iban,
    },
    buyer: {
      name: 'Inesa Barabanščikova',
    },
    lineItems: [{ description: 'Mokymo paslaugos', quantity: 1, unitPrice: 40, totalPrice: 40 }],
    totalAmount: 40,
    layout: 'pvm_education',
    isVatInvoice: true,
    hidePlatformFooter: true,
    notes: buildEducationNotes('Aleksas Barabanščikovas', '12 klasė'),
    lessonDetails: [
      { subject: 'Matematika', price: 20, datetime: '2026-06-09 18:00' },
      { subject: 'Matematika', price: 20, datetime: '2026-06-02 18:00' },
    ],
  });
  const outPath = join(ROOT, 'tmp', 'SF-pavyzdys-Mano-Korepetitorius.pdf');
  writeFileSync(outPath, pdfBytes);
  console.log(`[invoice-sample] PDF saved: ${outPath}`);

  const resend = new Resend(resendKey);
  const { data, error } = await resend.emails.send({
    from: getFromEmail(),
    to,
    subject: 'Mano Korepetitorius – PVM sąskaitos faktūros pavyzdys',
    html: `
      <div style="font-family:system-ui,sans-serif;line-height:1.5;color:#111;">
        <p>Labas,</p>
        <p>
          Siunčiame <strong>PVM sąskaitos faktūros</strong> pavyzdį pagal Mano korepetitorius šabloną:
          antraštė, Serija MK Nr., pamokų detalizacija, pastabos (22 str.) ir lietuviškos raidės.
        </p>
        <p style="color:#64748b;font-size:13px;">
          Tai ne buhalterinis įrašas — numeris <strong>Serija MK Nr. 1629</strong> paimtas iš jų
          pavyzdžio, realios numeracijos (1630+) neliečia.
        </p>
        <p>Geros dienos,<br/>Tutlio</p>
      </div>
    `,
    attachments: [
      {
        filename: 'SF-pavyzdys-Mano-Korepetitorius.pdf',
        content: Buffer.from(pdfBytes),
      },
    ],
  });

  if (error) throw new Error(error.message || 'Resend send failed');
  console.log(`[invoice-sample] Email sent to ${to} (id: ${data?.id || 'ok'})`);
}

main().catch((err) => {
  console.error('[invoice-sample] Failed:', err?.message || err);
  process.exit(1);
});
