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
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import { generateInvoicePdf } from '../api/_lib/invoicePdf.ts';
import { resolveInvoiceBranding } from '../api/_lib/invoiceBranding.ts';
import { getFromEmail, getResendApiKey } from '../api/_lib/resendConfig.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const MANO_KOREPETITORIUS_ORG_ID = 'c1a00000-7e57-4000-8000-000000000001';
const DEFAULT_TO = 'alaniukasa@gmail.com';

const SELLER = {
  business_name: 'Mano korepetitorius, MB',
  company_code: '305621035',
  vat_code: 'LT100018853316',
  address: 'Žirmūnų g. 100-63, LT-09121 Vilnius',
  contact_email: 'manokorepetitorius.demo.admin@tutlio.lt',
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

async function upsertInvoiceProfile(sb: ReturnType<typeof createClient>) {
  const row = {
    organization_id: MANO_KOREPETITORIUS_ORG_ID,
    user_id: null,
    entity_type: 'mb',
    business_name: SELLER.business_name,
    company_code: SELLER.company_code,
    vat_code: SELLER.vat_code,
    address: SELLER.address,
    contact_email: SELLER.contact_email,
    contact_phone: null,
    invoice_series: 'SF',
  };

  const { data: existing } = await sb
    .from('invoice_profiles')
    .select('id, next_invoice_number')
    .eq('organization_id', MANO_KOREPETITORIUS_ORG_ID)
    .maybeSingle();

  if (existing?.id) {
    const { error } = await sb
      .from('invoice_profiles')
      .update({ ...row, updated_at: new Date().toISOString() })
      .eq('id', existing.id);
    if (error) throw error;
    console.log('[invoice-sample] Updated invoice_profiles for Mano Korepetitorius');
    return;
  }

  const { error } = await sb.from('invoice_profiles').insert({
    ...row,
    next_invoice_number: 1,
  });
  if (error) throw error;
  console.log('[invoice-sample] Created invoice_profiles for Mano Korepetitorius');
}

async function main() {
  loadEnv();
  process.env.NODE_TLS_REJECT_UNAUTHORIZED ??= '0';

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env');
  }

  const resendKey = getResendApiKey();
  if (!resendKey) throw new Error('Missing RESEND_API_KEY or RESEND_API_KEY_STAGE');

  const to = getArg('only-to') || DEFAULT_TO;

  const sb = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  await upsertInvoiceProfile(sb);

  const logoPath = join(ROOT, 'public', 'demo', 'manokorepetitorius-logo.png');
  if (existsSync(logoPath)) {
    const logoBytes = readFileSync(logoPath);
    const isJpeg = logoBytes.length >= 2 && logoBytes[0] === 0xff && logoBytes[1] === 0xd8;
    const logoExt = isJpeg ? 'jpg' : 'png';
    const contentType = isJpeg ? 'image/jpeg' : 'image/png';
    const storagePath = `org-logos/${MANO_KOREPETITORIUS_ORG_ID}/manokorepetitorius-logo.${logoExt}`;
    const { error: upErr } = await sb.storage.from('blog-images').upload(storagePath, logoBytes, {
      contentType,
      upsert: true,
    });
    if (!upErr) {
      const { data: pub } = sb.storage.from('blog-images').getPublicUrl(storagePath);
      if (pub?.publicUrl) {
        await sb.from('organizations').update({ logo_url: pub.publicUrl }).eq('id', MANO_KOREPETITORIUS_ORG_ID);
        console.log('[invoice-sample] Logo uploaded to storage');
      }
    } else {
      console.warn('[invoice-sample] Logo upload skipped:', upErr.message);
    }
  }

  const branding = await resolveInvoiceBranding(sb, MANO_KOREPETITORIUS_ORG_ID);

  const issueDate = new Date().toLocaleDateString('lt-LT');
  const pdfData = {
    invoiceNumber: 'SF-PAVYZDYS-001',
    issueDate,
    periodStart: '2026-07-01',
    periodEnd: '2026-07-31',
    seller: {
      name: SELLER.business_name,
      entityType: 'mb',
      companyCode: SELLER.company_code,
      vatCode: SELLER.vat_code,
      address: SELLER.address,
      contactEmail: SELLER.contact_email,
    },
    buyer: {
      name: 'Mama Vardenė',
      email: 'mama.pavyzdys@pastas.lt',
      address: 'Vilnius',
    },
    lineItems: [
      {
        description:
          'Matematika – Lukas Petraitis – 4 pam.\n(07-03, 07-10, 07-17, 07-24, 07-31, 08-07)',
        quantity: 4,
        unitPrice: 25,
        totalPrice: 100,
      },
      {
        description: 'Anglu kalba – Gabija Jonaite – 2 pam.\n(07-05, 07-12, 07-19)',
        quantity: 2,
        unitPrice: 27,
        totalPrice: 54,
      },
    ],
    totalAmount: 154,
    branding: branding ?? undefined,
  };

  const pdfBytes = await generateInvoicePdf(pdfData);
  const outPath = join(ROOT, 'tmp', 'SF-pavyzdys-Mano-Korepetitorius.pdf');
  writeFileSync(outPath, pdfBytes);
  console.log(`[invoice-sample] PDF saved: ${outPath}`);

  const resend = new Resend(resendKey);
  const { data, error } = await resend.emails.send({
    from: getFromEmail(),
    to,
    subject: 'Mano Korepetitorius – sąskaitos faktūros pavyzdys (Tutlio)',
    html: `
      <div style="font-family:system-ui,sans-serif;line-height:1.5;color:#111;">
        <p>Labas,</p>
        <p>
          Siunčiame <strong>pavyzdinę sąskaitą faktūrą</strong>, kurią Tutlio platforma generuoja
          <strong>Mano Korepetitorius</strong> organizacijai.
        </p>
        <p>
          Pardavėjo rekvizitai PDF'e atitinka jūsų pateiktus duomenis (MB, Žirmūnų g. 100-63,
          įmonės ir PVM kodai). Pirkėjo duomenys ir pamokų eilutės yra iliustraciniai — tik parodyti,
          kaip atrodo realus dokumentas.
        </p>
        <p style="color:#64748b;font-size:13px;">
          Tai ne finansinis įrašas — numeris <strong>SF-PAVYZDYS-001</strong> pažymėtas kaip pavyzdys.
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
