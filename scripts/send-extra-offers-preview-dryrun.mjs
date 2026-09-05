/** Generate extra-lessons offer HTML (dryRun) and optionally send via Resend. */
import { readFileSync, existsSync, writeFileSync } from 'fs';

function loadEnvFile(file) {
  if (!existsSync(file)) return {};
  return Object.fromEntries(
    readFileSync(file, 'utf8')
      .split(/\r?\n/)
      .filter((l) => l && !l.startsWith('#'))
      .map((l) => {
        const i = l.indexOf('=');
        let v = l.slice(i + 1).trim();
        if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
        return [l.slice(0, i), v];
      }),
  );
}

const env = { ...loadEnvFile('.env'), ...loadEnvFile('.env.local'), ...loadEnvFile('.env.vercel.stage') };
for (const [k, v] of Object.entries(env)) {
  if (v && process.env[k] == null) process.env[k] = v;
}

process.env.APP_URL = process.env.APP_URL || process.env.VITE_APP_URL || 'http://localhost:3000';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'dry-run-key';
process.env.SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || 'https://example.supabase.co';

const { default: handler } = await import('../api/send-email.ts');

const sample = {
  schoolName: 'VšĮ „Laisvi vaikai"',
  schoolEmail: 'irminta@laisvivaikai.lt',
  contactEmail: 'irminta@laisvivaikai.lt',
  studentName: 'QA Peržiūra Extra',
  parentName: 'QA Tėvas Peržiūrai',
  contractNumber: 'PP-PREVIEW-TEST',
  acceptUrl: 'http://localhost:3000/school-extra-lessons-accept?token=legalqawithin14aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  serviceName: 'Matematika (grupinė)',
  schedule: 'Antradieniais 16:00–16:45',
  startDate: '2026-09-08',
  endDate: '2027-06-13',
  unitPrice: '6.00',
  monthlyPrice: '24.00',
  organizationId: '2dd745fc-20e7-4bc1-a5cd-a89cfe22ec17',
};

let status = 0;
let result = {};
const res = {
  status(code) {
    status = code;
    return this;
  },
  json(body) {
    result = body;
    return this;
  },
  setHeader() {
    return this;
  },
};

await handler(
  {
    method: 'POST',
    body: {
      type: 'school_contract_extra_offer',
      to: 'alaniukasa@gmail.com',
      locale: 'lt',
      dryRun: true,
      data: sample,
    },
    headers: {
      'content-type': 'application/json',
      'x-internal-key': process.env.SUPABASE_SERVICE_ROLE_KEY,
    },
    query: {},
  },
  res,
  undefined,
);

if (status !== 200 || !result.html) {
  console.error('dryRun failed', status, result);
  process.exit(1);
}

writeFileSync('tmp/extra-offer-preview.html', result.html, 'utf8');
console.log('Subject:', result.subject);
console.log('HTML saved to tmp/extra-offer-preview.html');
const mailCount = (result.html.match(/irminta@laisvivaikai\.lt/gi) || []).length;
console.log('School email occurrences:', mailCount);

if (process.argv.includes('--send')) {
  const key = process.env.RESEND_API_KEY || process.env.RESEND_API_KEY_STAGE;
  if (!key) {
    console.error('No RESEND_API_KEY for --send');
    process.exit(1);
  }
  const { Resend } = await import('resend');
  const from = process.env.FROM_EMAIL || 'Tutlio <hello@tutlio.lt>';
  const client = new Resend(key);
  const sent = await client.emails.send({
    from,
    to: ['alaniukasa@gmail.com'],
    subject: result.subject || 'Papildomų pamokų sutartis — peržiūra',
    html: result.html,
    text: 'Peržiūrėkite papildomų pamokų sutartį el. pašto kliente (HTML).',
  });
  if (sent.error) {
    console.error('Resend error:', sent.error);
    process.exit(1);
  }
  console.log('Sent to alaniukasa@gmail.com', sent.data?.id);
}
