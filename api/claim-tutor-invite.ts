import type { VercelRequest, VercelResponse } from './types';
import { createClient } from '@supabase/supabase-js';

type SubjectPreset = {
  name: string;
  duration_minutes?: number;
  price?: number;
  color?: string | null;
};

function normalizePreset(preset: SubjectPreset) {
  return {
    name: String(preset?.name || '').trim(),
    duration_minutes: Number(preset?.duration_minutes) || 60,
    price: Number(preset?.price) || 0,
    color: String(preset?.color || '#6366f1').toLowerCase(),
  };
}

/** Name + duration + price — matches app `subjectTutorLessonKey`; blocks duplicate lesson rows regardless of colour. */
function tutorLessonKey(parts: { name: string; duration_minutes: number; price: number }) {
  return `${String(parts.name).trim().toLowerCase()}|${Number(parts.duration_minutes)}|${Number(parts.price)}`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

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
    const token = String(req.body?.token || '').trim().toUpperCase();
    if (!token) {
      return res.status(400).json({ error: 'Missing token' });
    }

    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser(accessToken);

    if (authErr || !user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { data: invite, error: inviteErr } = await supabase
      .from('tutor_invites')
      .select('id, organization_id, used, used_by_profile_id, subjects_preset, cancellation_hours, cancellation_fee_percent, reminder_student_hours, reminder_tutor_hours, break_between_lessons, min_booking_hours, company_commission_percent')
      .eq('token', token)
      .maybeSingle();

    if (inviteErr || !invite) {
      return res.status(404).json({ error: 'Invite not found' });
    }

    if (invite.used && invite.used_by_profile_id && invite.used_by_profile_id !== user.id) {
      return res.status(409).json({ error: 'Invite already used' });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', user.id)
      .maybeSingle();

    const commonProfileFields = {
      email: user.email || null,
      organization_id: invite.organization_id,
      cancellation_hours: invite.cancellation_hours ?? 24,
      cancellation_fee_percent: invite.cancellation_fee_percent ?? 0,
      reminder_student_hours: invite.reminder_student_hours ?? 2,
      reminder_tutor_hours: invite.reminder_tutor_hours ?? 2,
      break_between_lessons: invite.break_between_lessons ?? 0,
      min_booking_hours: invite.min_booking_hours ?? 1,
      company_commission_percent: invite.company_commission_percent ?? 0,
    };

    if (profile) {
      await supabase.from('profiles').update(commonProfileFields).eq('id', user.id);
    } else {
      await supabase.from('profiles').insert({
        id: user.id,
        full_name: String(user.user_metadata?.full_name || ''),
        phone: String(user.user_metadata?.phone || ''),
        ...commonProfileFields,
      });
    }

    if (!invite.used) {
      await supabase
        .from('tutor_invites')
        .update({ used: true, used_by_profile_id: user.id })
        .eq('id', invite.id);
    }

    const presets = Array.isArray(invite.subjects_preset) ? (invite.subjects_preset as SubjectPreset[]) : [];
    if (presets.length > 0) {
      const { data: existing } = await supabase
        .from('subjects')
        .select('name, duration_minutes, price, color')
        .eq('tutor_id', user.id);

      const taken = new Set(
        (existing || []).map((s: any) =>
          tutorLessonKey({
            name: s.name,
            duration_minutes: s.duration_minutes,
            price: Number(s.price),
          })
        )
      );

      const newRows = presets
        .map((p) => normalizePreset(p))
        .filter((p) => p.name.length > 0)
        .filter((p) => {
          const key = tutorLessonKey({
            name: p.name,
            duration_minutes: p.duration_minutes,
            price: p.price,
          });
          if (taken.has(key)) return false;
          taken.add(key);
          return true;
        })
        .map((p) => ({ tutor_id: user.id, ...p }));

      if (newRows.length > 0) {
        await supabase.from('subjects').insert(newRows);
      }
    }

    return res.status(200).json({ success: true, organizationId: invite.organization_id });
  } catch (err: any) {
    console.error('[claim-tutor-invite] Error:', err?.message || err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
