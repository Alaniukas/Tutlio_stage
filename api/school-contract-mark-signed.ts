import type { VercelRequest, VercelResponse } from './types';
import { createClient } from '@supabase/supabase-js';
import { verifyRequestAuth } from './_lib/auth.js';

const APP_URL = process.env.APP_URL || process.env.VITE_APP_URL || 'https://tutlio.lt';

function json(res: VercelResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

function generateInviteCode(): string {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });

  const auth = await verifyRequestAuth(req);
  if (!auth || auth.isInternal || !auth.userId) return json(res, 401, { error: 'Unauthorized' });

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) return json(res, 500, { error: 'Server misconfigured' });
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const contractId = typeof req.body?.contractId === 'string' ? req.body.contractId.trim() : '';
  if (!contractId) return json(res, 400, { error: 'Missing contractId' });

  const { data: contract, error: contractErr } = await supabase
    .from('school_contracts')
    .select(
      'id, organization_id, student_id, signing_status, signed_at, org:organizations(name), student:students(id, full_name, email, invite_code, payer_email, payer_name, parent_secondary_email, parent_secondary_name)',
    )
    .eq('id', contractId)
    .maybeSingle();

  if (contractErr || !contract) return json(res, 404, { error: 'Contract not found' });

  const orgId = String((contract as any).organization_id || '').trim();
  if (!orgId) return json(res, 500, { error: 'Contract missing organization_id' });

  const { data: adminRow } = await supabase
    .from('organization_admins')
    .select('id')
    .eq('user_id', auth.userId)
    .eq('organization_id', orgId)
    .maybeSingle();
  if (!adminRow) return json(res, 403, { error: 'Forbidden' });

  // Mark signed (idempotent).
  const updatePayload: Record<string, unknown> = { signing_status: 'signed' };
  if (!(contract as any).signed_at) updatePayload.signed_at = new Date().toISOString();
  await supabase.from('school_contracts').update(updatePayload).eq('id', contractId);

  const student = (contract as any).student || {};
  const org = (contract as any).org || {};

  let inviteCode = String(student.invite_code || '').trim();
  if (!inviteCode) {
    inviteCode = generateInviteCode();
    await supabase.from('students').update({ invite_code: inviteCode }).eq('id', String(student.id || (contract as any).student_id));
  }

  const bookingUrl = `${APP_URL.replace(/\/$/, '')}/book/${encodeURIComponent(inviteCode)}`;

  /**
   * When a contract is marked signed, we send the CHILD access invite (booking code + link).
   * This goes to:
   * - student.email (if present)
   * - payer_email and parent_secondary_email (if present)
   *
   * We do NOT send parent portal invites here (that was confusing for schools).
   */
  type Recipient = { email: string; label: 'student' | 'parent' | 'parent2' };
  const recipients: Recipient[] = [];
  const pushUnique = (email: unknown, label: Recipient['label']) => {
    const raw = String(email || '').trim();
    if (!raw.includes('@')) return;
    const norm = raw.toLowerCase();
    if (recipients.some((r) => r.email.toLowerCase() === norm)) return;
    recipients.push({ email: raw, label });
  };
  pushUnique(student.email, 'student');
  pushUnique(student.payer_email, 'parent');
  pushUnique(student.parent_secondary_email, 'parent2');

  const inviteResults: Array<{ email: string; ok: boolean; label: Recipient['label']; error?: string }> = [];
  for (const r of recipients) {
    try {
      await fetch(`${APP_URL.replace(/\/$/, '')}/api/send-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-internal-key': serviceRoleKey },
        body: JSON.stringify({
          type: 'invite_email',
          to: r.email,
          data: {
            context: 'school',
            studentName: String(student.full_name || ''),
            tutorName: String(org.name || 'Mokykla'),
            inviteCode,
            bookingUrl,
          },
        }),
      });
      inviteResults.push({ email: r.email, label: r.label, ok: true });
    } catch (e: any) {
      inviteResults.push({ email: r.email, label: r.label, ok: false, error: e?.message || 'send failed' });
    }
  }

  return json(res, 200, {
    success: true,
    contractId,
    inviteCode,
    bookingUrl,
    sent: inviteResults.filter((x) => x.ok).length,
    inviteResults,
  });
}

