/**
 * Send preview link for assign-student modal to a reviewer.
 *
 * Usage:
 *   node scripts/send-assign-student-modal-preview-link.mjs [email] [previewUrl]
 *
 * Requires in .env: SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY (or RESEND_API_KEY_STAGE)
 */
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

function loadEnv() {
  for (const name of ['.env', '.env.local']) {
    const p = join(root, name);
    try {
      const text = readFileSync(p, 'utf8');
      for (const line of text.split(/\n/)) {
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
    } catch {
      /* ignore missing file */
    }
  }
}

loadEnv();

const to = process.argv[2] || 'alaniukasa@gmail.com';
const previewUrl =
  process.argv[3] || 'https://www.tutlio.pl/preview-assign-student-modal.html';
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const resendKey = process.env.RESEND_API_KEY || process.env.RESEND_API_KEY_STAGE;
const appUrl = (process.env.APP_URL || process.env.VITE_APP_URL || 'https://tutlio.pl').replace(/\/$/, '');

const bodyHtml = `<p style="font-size:15px;line-height:1.6;color:#374151;margin:0 0 16px;">
  Peržiūrėkite pataisytą „Pridėti mokinį į laisvą laiką“ modalą (fake duomenys):
</p>
<p style="margin:0 0 8px;">
  <a href="${previewUrl}" style="font-size:16px;font-weight:600;color:#4f46e5;">${previewUrl}</a>
</p>`;

if (serviceKey) {
  const res = await fetch(`${appUrl}/api/send-email`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-internal-key': serviceKey,
    },
    body: JSON.stringify({
      type: 'custom_html_announcement',
      to,
      locale: 'lt',
      data: {
        subject: 'Tutlio: assign-student modal peržiūra',
        bodyHtml,
      },
    }),
  });

  const text = await res.text();
  if (!res.ok) {
    console.error('send-email failed', res.status, text);
    process.exit(1);
  }

  console.log(`Sent preview link to ${to}: ${previewUrl}`);
  console.log(text);
  process.exit(0);
}

if (!resendKey) {
  console.error('Missing SUPABASE_SERVICE_ROLE_KEY and RESEND_API_KEY(_STAGE) in .env');
  process.exit(1);
}

const from = process.env.FROM_EMAIL || 'Tutlio <onboarding@tutlio.lt>';
const res = await fetch('https://api.resend.com/emails', {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${resendKey}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    from,
    to,
    subject: 'Tutlio: assign-student modal peržiūra',
    html: bodyHtml,
  }),
});

const text = await res.text();
if (!res.ok) {
  console.error('Resend failed', res.status, text);
  process.exit(1);
}

console.log(`Sent preview link to ${to} via Resend: ${previewUrl}`);
console.log(text);
