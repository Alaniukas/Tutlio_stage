import type { VercelRequest, VercelResponse } from './types';
import { createClient } from '@supabase/supabase-js';
import { verifyRequestAuth } from './_lib/auth.js';
import { MOKSLO_VAISIAI_ADMIN_EMAIL, MOKSLO_VAISIAI_ORG_ID } from './_lib/marketMoney.js';
import {
  studentBelongsToMoksloVaisiai,
  studentHasUnpaidBalance,
} from './_lib/moksloVaisiaiStudentArchive.js';
import { internalApiOrigin } from './_lib/extraLessonsContractShared.js';
import { supabaseServiceRoleClientOptions } from './_lib/supabaseServiceRoleClientOptions.js';

function serviceClient() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  return createClient(url, key, supabaseServiceRoleClientOptions() as any);
}

async function loadLinkedStudent(sb: ReturnType<typeof serviceClient>, userId: string, studentId: string) {
  const { data: student } = await sb
    .from('students')
    .select(
      'id, full_name, email, phone, payer_email, organization_id, linked_user_id, tutor_id, deletion_requested_at, enrollment_status',
    )
    .eq('id', studentId)
    .maybeSingle();
  if (!student || student.linked_user_id !== userId) return null;

  let tutorOrganizationId: string | null = null;
  let tutorOrganizationSlug: string | null = null;
  if (student.tutor_id) {
    const { data: tutor } = await sb
      .from('profiles')
      .select('organization_id')
      .eq('id', student.tutor_id)
      .maybeSingle();
    tutorOrganizationId = tutor?.organization_id ?? null;
    if (tutorOrganizationId) {
      const { data: org } = await sb
        .from('organizations')
        .select('slug')
        .eq('id', tutorOrganizationId)
        .maybeSingle();
      tutorOrganizationSlug = org?.slug ?? null;
    }
  }

  return { student, tutorOrganizationId, tutorOrganizationSlug };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const auth = await verifyRequestAuth(req);
  if (!auth || auth.isInternal || !auth.userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const studentId =
    (typeof req.query.studentId === 'string' ? req.query.studentId : '') ||
    String((req.body as { studentId?: string } | undefined)?.studentId || '').trim();
  if (!studentId) return res.status(400).json({ error: 'Missing studentId' });

  const sb = serviceClient();
  const linked = await loadLinkedStudent(sb, auth.userId, studentId);
  if (!linked) return res.status(404).json({ error: 'Student not found' });

  const isMv = studentBelongsToMoksloVaisiai({
    studentOrganizationId: linked.student.organization_id,
    tutorOrganizationId: linked.tutorOrganizationId,
    tutorOrganizationSlug: linked.tutorOrganizationSlug,
  });
  if (!isMv) {
    return res.status(403).json({ error: 'Archive is only available for Mokslo vaisiai students' });
  }

  let unpaid = false;
  try {
    unpaid = await studentHasUnpaidBalance(sb, studentId);
  } catch (err) {
    console.error('[student-request-account-archive] unpaid check', err);
    return res.status(500).json({ error: 'Failed to check unpaid balance' });
  }
  const alreadyRequested = Boolean(linked.student.deletion_requested_at);

  if (req.method === 'GET') {
    return res.status(200).json({
      isMoksloVaisiai: true,
      unpaid,
      alreadyRequested,
      requestedAt: linked.student.deletion_requested_at,
    });
  }

  if (alreadyRequested) {
    return res.status(200).json({ success: true, alreadyRequested: true });
  }
  if (unpaid) {
    return res.status(409).json({ error: 'unpaid', unpaid: true });
  }

  const now = new Date().toISOString();
  const { error: updErr } = await sb
    .from('students')
    .update({
      deletion_requested_at: now,
      enrollment_status: 'left',
      exit_reason: 'other',
      exit_date: now.slice(0, 10),
      exit_note: 'Mokinys paprašė ištrinti paskyrą (archyvuota, 14 d.d.).',
    })
    .eq('id', studentId);
  if (updErr) {
    console.error('[student-request-account-archive] update', updErr);
    return res.status(500).json({ error: 'Failed to archive account' });
  }

  const origin = internalApiOrigin(req);
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  try {
    await fetch(`${origin}/api/send-email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-key': key,
      },
      body: JSON.stringify({
        type: 'mokslo_vaisiai_student_archive',
        to: MOKSLO_VAISIAI_ADMIN_EMAIL,
        data: {
          organizationId: linked.student.organization_id || linked.tutorOrganizationId || MOKSLO_VAISIAI_ORG_ID,
          studentName: linked.student.full_name,
          studentEmail: linked.student.email,
          studentPhone: linked.student.phone,
          payerEmail: linked.student.payer_email,
          locale: 'lt',
        },
      }),
    });
  } catch (err) {
    console.error('[student-request-account-archive] notify', err);
  }

  return res.status(200).json({ success: true, alreadyRequested: false });
}
