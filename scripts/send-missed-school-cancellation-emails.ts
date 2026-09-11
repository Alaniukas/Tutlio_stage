/**
 * Backfill session_cancelled_parent emails for school org tutor cancellations
 * where payer_email was never notified (pre-2026-09-09 fix).
 *
 * Usage:
 *   npx tsx scripts/send-missed-school-cancellation-emails.ts           # dry-run
 *   npx tsx scripts/send-missed-school-cancellation-emails.ts --send
 */
import { readFileSync, existsSync } from 'fs';
import { createClient } from '@supabase/supabase-js';
import { format } from 'date-fns';
import handler from '../api/send-email.ts';

function loadEnvFile(file: string) {
  if (!existsSync(file)) return {};
  return Object.fromEntries(
    readFileSync(file, 'utf8')
      .split(/\r?\n/)
      .filter((l) => l && !l.startsWith('#'))
      .map((l) => {
        const i = l.indexOf('=');
        let v = l.slice(i + 1).trim();
        if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
          v = v.slice(1, -1);
        }
        return [l.slice(0, i), v];
      }),
  );
}

const env = { ...loadEnvFile('.env'), ...loadEnvFile('.env.local'), ...loadEnvFile('.env.vercel.prod') };
for (const [k, v] of Object.entries(env)) {
  if (v && process.env[k] == null) process.env[k] = v;
}

const SEND = process.argv.includes('--send');
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!serviceKey) {
  console.error('Missing SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const sb = createClient(env.VITE_SUPABASE_URL || env.SUPABASE_URL!, serviceKey);

type MissedRow = {
  session_id: string;
  start_time: string;
  cancellation_reason: string | null;
  student_name: string;
  payer_email: string;
  payer_name: string | null;
  tutor_name: string;
  org_id: string;
  org_name: string;
};

async function sendEmail(label: string, body: Record<string, unknown>) {
  if (!SEND) {
    console.log('[dry-run]', label, '→', body.type, 'to', (body as any).to);
    return;
  }
  const req = {
    method: 'POST',
    headers: { 'x-internal-key': serviceKey },
    body,
  };
  const res = {
    status: (code: number) => ({
      json: (data: unknown) => {
        if (code >= 400) throw new Error(`${label}: ${JSON.stringify(data)}`);
        console.log('✓', label);
      },
    }),
  };
  await handler(req as any, res as any);
}

async function fetchMissedRows(): Promise<MissedRow[]> {
  const { data, error } = await sb
    .from('sessions')
    .select(
      `id, start_time, cancellation_reason,
       student:students!inner(full_name, email, payer_email, payer_name, organization_id,
         organization:organizations!inner(id, name, entity_type)),
       tutor:profiles!sessions_tutor_id_fkey(full_name)`,
    )
    .eq('status', 'cancelled')
    .eq('cancelled_by', 'tutor')
    .gte('cancelled_at', '2026-09-09T00:00:00+03:00')
    .lt('cancelled_at', '2026-09-10T00:00:00+03:00');

  if (error) throw error;

  const rows: MissedRow[] = [];
  for (const row of data || []) {
    const st = (row as any).student;
    const org = st?.organization;
    if (org?.entity_type !== 'school') continue;

    const payerEmail = String(st?.payer_email || '').trim();
    const studentEmail = String(st?.email || '').trim();
    if (!payerEmail.includes('@')) continue;
    if (payerEmail.toLowerCase() === studentEmail.toLowerCase()) continue;

    rows.push({
      session_id: row.id,
      start_time: row.start_time,
      cancellation_reason: row.cancellation_reason,
      student_name: st.full_name || '',
      payer_email: payerEmail,
      payer_name: st.payer_name,
      tutor_name: (row as any).tutor?.full_name || '',
      org_id: org.id,
      org_name: org.name || '',
    });
  }

  return rows.sort((a, b) => a.start_time.localeCompare(b.start_time));
}

async function main() {
  console.log(SEND ? '=== SEND MODE ===' : '=== DRY RUN (pass --send) ===\n');

  const rows = await fetchMissedRows();
  if (rows.length === 0) {
    console.log('No missed school cancellation emails found.');
    return;
  }

  for (const row of rows) {
    const start = new Date(row.start_time);
    const emailDate = format(start, 'yyyy-MM-dd');
    const emailTime = format(start, 'HH:mm');
    const label = `${row.student_name} → ${row.payer_email} (${emailDate} ${emailTime})`;

    await sendEmail(label, {
      type: 'session_cancelled_parent',
      to: row.payer_email,
      data: {
        studentName: row.student_name,
        tutorName: row.tutor_name,
        date: emailDate,
        time: emailTime,
        cancelledBy: 'tutor',
        reason: row.cancellation_reason || '',
        locale: 'lt',
        organizationId: row.org_id,
      },
    });
  }

  console.log(`\n--- ${rows.length} email(s) ${SEND ? 'sent' : 'would send'} (${rows[0]?.org_name}) ---`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
