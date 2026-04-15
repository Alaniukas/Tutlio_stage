// ─── Vercel Serverless Function: Invite Tutor for Organization ──────────────
// POST /api/invite-tutor
// Body: { organizationId, inviteeName?, inviteeEmail, inviteePhone?, subjects, ...defaults }
// Auth: Authorization: Bearer <Supabase access token> — org admin for organizationId.

import type { VercelRequest, VercelResponse } from './types';
import { createClient } from '@supabase/supabase-js';
import { sendTutorInviteEmail } from './_lib/sendTutorInviteResend.js';

type SubjectPreset = {
  name: string;
  duration_minutes?: number;
  price?: number;
  color?: string;
};

function dedupeSubjectPresets(presets: SubjectPreset[] | null | undefined): SubjectPreset[] {
  if (!Array.isArray(presets) || presets.length === 0) return [];
  const seen = new Set<string>();
  const out: SubjectPreset[] = [];
  for (const p of presets) {
    const normalized: SubjectPreset = {
      name: String(p?.name || '').trim(),
      duration_minutes: Number(p?.duration_minutes) || 60,
      price: Number(p?.price) || 0,
      color: String(p?.color || '#6366f1').toLowerCase(),
    };
    const key = `${normalized.name.toLowerCase()}|${normalized.duration_minutes}|${normalized.price}|${normalized.color}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(normalized);
  }
  return out;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const requestId = Math.random().toString(36).slice(2, 10);

  try {
    const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceKey) {
      return res.status(500).json({ error: 'Missing Supabase env vars' });
    }

    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const accessToken = authHeader.replace('Bearer ', '');

    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: { user }, error: authErr } = await supabase.auth.getUser(accessToken);
    if (authErr || !user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const {
      organizationId,
      inviteeName,
      inviteeEmail,
      inviteePhone,
      subjects,
      cancellation_hours,
      cancellation_fee_percent,
      reminder_student_hours,
      reminder_tutor_hours,
      break_between_lessons,
      min_booking_hours,
      company_commission_percent,
    } = req.body as any;

    const normalizedInviteeEmail = String(inviteeEmail || '').trim().toLowerCase();

    if (!organizationId || !normalizedInviteeEmail) {
      return res.status(400).json({ error: 'Missing organizationId or inviteeEmail' });
    }

    const { data: adminRow, error: adminErr } = await supabase
      .from('organization_admins')
      .select('organization_id')
      .eq('user_id', user.id)
      .eq('organization_id', organizationId)
      .maybeSingle();

    if (adminErr || !adminRow) {
      return res.status(403).json({ error: 'You do not have permission to invite tutors to this organization' });
    }

    // Ensure organization exists and get name for email
    const { data: org, error: orgError } = await supabase
      .from('organizations')
      .select('id, name')
      .eq('id', organizationId)
      .maybeSingle();

    if (orgError || !org) {
      return res.status(404).json({ error: 'Organization not found' });
    }

    const subjectsPresetClean = dedupeSubjectPresets(subjects);

    // Short, readable invite code (8 chars, no 0/O/1/I to avoid confusion)
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const gen = () => Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
    let token = gen();
    for (let i = 0; i < 5; i++) {
      const { data: existing } = await supabase.from('tutor_invites').select('id').eq('token', token).maybeSingle();
      if (!existing) break;
      token = gen();
    }

    // Insert invite with preset settings
    const { error: inviteError } = await supabase.from('tutor_invites').insert({
      organization_id: organizationId,
      token,
      invitee_name: inviteeName || null,
      invitee_email: normalizedInviteeEmail,
      invitee_phone: inviteePhone || null,
      subjects_preset: subjectsPresetClean.length ? subjectsPresetClean : null,
      cancellation_hours,
      cancellation_fee_percent,
      reminder_student_hours,
      reminder_tutor_hours,
      break_between_lessons,
      min_booking_hours,
      company_commission_percent,
    });

    if (inviteError) {
      console.error('[invite-tutor] Insert failed', {
        requestId,
        organizationId,
        inviteeEmail: normalizedInviteeEmail,
        code: (inviteError as any)?.code,
        message: inviteError.message,
      });
      return res.status(500).json({
        error: inviteError.message || 'Failed to create invite',
        code: (inviteError as any)?.code || null,
        requestId,
      });
    }

    // Send via Resend directly in-process (await). Fire-and-forget fetch to /api/send-email gets terminated by Vercel after return.
    let emailSent = false;
    let emailError: string | undefined;
    try {
      const emailResult = await sendTutorInviteEmail(normalizedInviteeEmail, {
        inviteToken: token,
        orgName: (org as any).name || null,
        inviteeName: inviteeName || null,
        inviteeEmail: normalizedInviteeEmail,
      });
      emailSent = emailResult.ok;
      const rawError = 'error' in emailResult ? emailResult.error : undefined;
      if (rawError) {
        emailError =
          rawError.includes('not configured') || rawError.includes('RESEND')
            ? 'Email service not configured (RESEND).'
            : rawError;
      }
    } catch (emailErr: any) {
      emailSent = false;
      emailError = emailErr?.message || 'Failed to send invitation email';
      console.error('[invite-tutor] Email send failed:', { requestId, inviteeEmail: normalizedInviteeEmail, error: emailErr });
    }

    return res.status(200).json({ success: true, token, emailSent, emailError, requestId });
  } catch (err: any) {
    console.error('[invite-tutor] Error:', { requestId, error: err });
    return res.status(500).json({ error: 'Internal server error', message: err?.message, requestId });
  }
}

