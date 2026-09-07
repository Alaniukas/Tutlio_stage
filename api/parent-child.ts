import type { VercelRequest, VercelResponse } from './types';
import { createClient } from '@supabase/supabase-js';
import { verifyRequestAuth } from './_lib/auth.js';
import { isMoksloVaisiaiOrg, MOKSLO_VAISIAI_ADMIN_EMAIL, MOKSLO_VAISIAI_ORG_ID } from './_lib/marketMoney.js';
import {
  applyMoksloVaisiaiStudentArchive,
  studentBelongsToMoksloVaisiai,
  studentHasUnpaidBalance,
  studentsUnpaidBalanceMap,
} from './_lib/moksloVaisiaiStudentArchive.js';
import { internalApiOrigin } from './_lib/extraLessonsContractShared.js';
import { supabaseServiceRoleClientOptions } from './_lib/supabaseServiceRoleClientOptions.js';
import { orgAwareOrigin, publicOriginFromRequest } from './_lib/public-origin.js';

function generateStudentInviteCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function json(res: VercelResponse, status: number, body: unknown) {
  const r = res as unknown as { headersSent?: boolean; statusCode: number };
  if (r.headersSent) return;
  r.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

function serviceClient() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  return createClient(url, key, supabaseServiceRoleClientOptions() as any);
}

function parseJsonBody(req: VercelRequest): Record<string, unknown> {
  const raw = req.body;
  if (raw == null) return {};
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  if (Buffer.isBuffer(raw)) {
    try {
      return JSON.parse(raw.toString('utf8')) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  if (typeof raw === 'object') return raw as Record<string, unknown>;
  return {};
}

async function loadParentContext(sb: ReturnType<typeof serviceClient>, userId: string) {
  const { data: parent } = await sb
    .from('parent_profiles')
    .select('id, full_name, email')
    .eq('user_id', userId)
    .maybeSingle();
  if (!parent?.id) return null;

  const { data: links } = await sb
    .from('parent_students')
    .select(
      'student_id, students(id, full_name, email, phone, payer_email, payer_name, organization_id, linked_user_id, tutor_id, invite_code, deletion_requested_at, enrollment_status)',
    )
    .eq('parent_id', parent.id);

  const children = (links || [])
    .map((row: { students?: unknown }) => {
      const raw = row.students as Record<string, unknown> | Record<string, unknown>[] | null;
      return (Array.isArray(raw) ? raw[0] : raw) || null;
    })
    .filter((s): s is Record<string, unknown> => Boolean(s?.id));

  return { parent, children };
}

async function resolveTutorOrg(
  sb: ReturnType<typeof serviceClient>,
  tutorId: string | null,
): Promise<{ tutorOrganizationId: string | null; tutorOrganizationSlug: string | null; tutorName: string | null }> {
  if (!tutorId) return { tutorOrganizationId: null, tutorOrganizationSlug: null, tutorName: null };
  const { data: tutor } = await sb
    .from('profiles')
    .select('organization_id, full_name')
    .eq('id', tutorId)
    .maybeSingle();
  const tutorOrganizationId = (tutor?.organization_id as string | null) ?? null;
  let tutorOrganizationSlug: string | null = null;
  if (tutorOrganizationId) {
    const { data: org } = await sb.from('organizations').select('slug').eq('id', tutorOrganizationId).maybeSingle();
    tutorOrganizationSlug = (org?.slug as string | null) ?? null;
  }
  return {
    tutorOrganizationId,
    tutorOrganizationSlug,
    tutorName: (tutor?.full_name as string | null) ?? null,
  };
}

/** Batch MV filter — 2 DB round-trips max instead of 2× per child. */
async function filterMvChildren(
  sb: ReturnType<typeof serviceClient>,
  children: Record<string, unknown>[],
): Promise<Record<string, unknown>[]> {
  if (children.length === 0) return [];

  const mvChildren: Record<string, unknown>[] = [];
  const needTutorLookup: Record<string, unknown>[] = [];

  for (const child of children) {
    if (isMoksloVaisiaiOrg(String(child.organization_id || ''))) {
      mvChildren.push(child);
    } else if (child.tutor_id) {
      needTutorLookup.push(child);
    }
  }
  if (needTutorLookup.length === 0) return mvChildren;

  const tutorIds = [
    ...new Set(needTutorLookup.map((c) => String(c.tutor_id || '')).filter(Boolean)),
  ];
  const { data: tutors, error: tutorErr } = await sb
    .from('profiles')
    .select('id, organization_id')
    .in('id', tutorIds);
  if (tutorErr) throw tutorErr;

  const orgIds = [
    ...new Set((tutors || []).map((t) => String(t.organization_id || '')).filter(Boolean)),
  ];
  const slugByOrgId = new Map<string, string>();
  if (orgIds.length > 0) {
    const { data: orgs, error: orgErr } = await sb
      .from('organizations')
      .select('id, slug')
      .in('id', orgIds);
    if (orgErr) throw orgErr;
    for (const org of orgs || []) slugByOrgId.set(String(org.id), String(org.slug || ''));
  }

  const tutorOrgById = new Map<string, { orgId: string | null; slug: string | null }>();
  for (const tutor of tutors || []) {
    const orgId = (tutor.organization_id as string | null) ?? null;
    tutorOrgById.set(String(tutor.id), {
      orgId,
      slug: orgId ? slugByOrgId.get(orgId) ?? null : null,
    });
  }

  for (const child of needTutorLookup) {
    const tutor = tutorOrgById.get(String(child.tutor_id || ''));
    if (
      studentBelongsToMoksloVaisiai({
        studentOrganizationId: null,
        tutorOrganizationId: tutor?.orgId ?? null,
        tutorOrganizationSlug: tutor?.slug ?? null,
      })
    ) {
      mvChildren.push(child);
    }
  }
  return mvChildren;
}

async function notifyArchive(
  req: VercelRequest,
  student: Record<string, unknown>,
  tutorOrganizationId: string | null,
) {
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
          organizationId: student.organization_id || tutorOrganizationId || MOKSLO_VAISIAI_ORG_ID,
          studentName: student.full_name,
          studentEmail: student.email,
          studentPhone: student.phone,
          payerEmail: student.payer_email,
          requestedBy: 'parent',
          locale: 'lt',
        },
      }),
    });
  } catch (err) {
    console.error('[parent-child] archive notify', err);
  }
}

async function sendStudentInvite(
  req: VercelRequest,
  sb: ReturnType<typeof serviceClient>,
  student: Record<string, unknown>,
  toEmail: string,
) {
  const tutor = await resolveTutorOrg(sb, (student.tutor_id as string | null) ?? null);
  let orgLocale: string | null = null;
  const orgId = (student.organization_id as string | null) || tutor.tutorOrganizationId;
  if (orgId) {
    const { data: org } = await sb.from('organizations').select('preferred_locale').eq('id', orgId).maybeSingle();
    orgLocale = (org?.preferred_locale as string | null) ?? null;
  }
  const origin = orgAwareOrigin(orgLocale, publicOriginFromRequest(req));
  const inviteCode = String(student.invite_code || '');
  const bookingUrl = `${origin}/book/${inviteCode}`;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  const res = await fetch(`${internalApiOrigin(req)}/api/send-email`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-internal-key': key,
    },
    body: JSON.stringify({
      type: 'invite_email',
      to: toEmail,
      locale: orgLocale || 'lt',
      data: {
        studentName: student.full_name,
        tutorName: tutor.tutorName || 'Mokslo vaisiai',
        inviteCode,
        bookingUrl,
        ...(orgId ? { organizationId: orgId } : {}),
      },
    }),
  });
  return res.ok;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return json(res, 405, { error: 'Method not allowed' });
  }

  const auth = await verifyRequestAuth(req);
  if (!auth || auth.isInternal || !auth.userId) {
    return json(res, 401, { error: 'Unauthorized' });
  }

  const sb = serviceClient();
  const ctx = await loadParentContext(sb, auth.userId);
  if (!ctx) return json(res, 403, { error: 'Parent profile not found' });

  const mvChildren = await filterMvChildren(sb, ctx.children);

  if (req.method === 'GET') {
    if (mvChildren.length === 0) {
      return json(res, 200, { isMoksloVaisiai: false, children: [] });
    }

    const studentIds = mvChildren.map((child) => String(child.id));
    let unpaidMap = new Map<string, boolean>();
    try {
      unpaidMap = await studentsUnpaidBalanceMap(sb, studentIds);
    } catch (err) {
      console.error('[parent-child] unpaid check', err);
    }

    const listed = mvChildren.map((child) => {
      const studentId = String(child.id);
      return {
        studentId: child.id,
        fullName: child.full_name,
        email: child.email,
        linkedUserId: child.linked_user_id,
        alreadyRequested: Boolean(child.deletion_requested_at),
        unpaid: unpaidMap.get(studentId) ?? false,
      };
    });
    return json(res, 200, { isMoksloVaisiai: true, children: listed });
  }

  if (mvChildren.length === 0) {
    return json(res, 403, { error: 'Not a Mokslo vaisiai parent' });
  }

  const body = parseJsonBody(req);
  const action = String(body.action || '').trim();

  if (action === 'add') {
    const fullName = String(body.fullName || '').trim();
    const email = String(body.email || '').trim().toLowerCase();
    if (!fullName) return json(res, 400, { error: 'fullName is required' });
    if (email && !looksLikeEmail(email)) return json(res, 400, { error: 'invalid_email' });

    const template = mvChildren[0];
    const organizationId =
      (template.organization_id as string | null) ||
      (await resolveTutorOrg(sb, (template.tutor_id as string | null) ?? null)).tutorOrganizationId;
    if (!organizationId) return json(res, 400, { error: 'Missing organization' });

    let inviteCode = generateStudentInviteCode();
    let inserted: Record<string, unknown> | null = null;
    for (let attempt = 0; attempt < 8; attempt++) {
      const ins = await sb
        .from('students')
        .insert({
          full_name: fullName,
          email: email || null,
          organization_id: organizationId,
          tutor_id: (template.tutor_id as string | null) ?? null,
          invite_code: inviteCode,
          payment_payer: 'parent',
          payer_name: ctx.parent.full_name || template.payer_name || null,
          payer_email: ctx.parent.email || template.payer_email || null,
          enrollment_status: 'active',
        })
        .select(
          'id, full_name, email, phone, payer_email, payer_name, organization_id, linked_user_id, tutor_id, invite_code, deletion_requested_at',
        )
        .maybeSingle();
      if (!ins.error && ins.data) {
        inserted = ins.data as Record<string, unknown>;
        break;
      }
      inviteCode = generateStudentInviteCode();
    }
    if (!inserted) return json(res, 500, { error: 'Failed to add child' });

    const { error: linkErr } = await sb.from('parent_students').upsert(
      { parent_id: ctx.parent.id, student_id: inserted.id },
      { onConflict: 'parent_id,student_id' },
    );
    if (linkErr) console.error('[parent-child] parent_students', linkErr);

    if (email) {
      const sent = await sendStudentInvite(req, sb, inserted, email);
      if (!sent) return json(res, 200, { success: true, studentId: inserted.id, emailSent: false });
    }
    return json(res, 200, { success: true, studentId: inserted.id, emailSent: Boolean(email) });
  }

  const studentId = String(body.studentId || '').trim();
  const child = mvChildren.find((c) => String(c.id) === studentId);
  if (!child) return json(res, 404, { error: 'Student not found' });

  if (action === 'invite') {
    const email = String(body.email || child.email || '').trim().toLowerCase();
    if (!email || !looksLikeEmail(email)) return json(res, 400, { error: 'invalid_email' });
    if (String(child.email || '').trim().toLowerCase() !== email) {
      const { error: updErr } = await sb.from('students').update({ email }).eq('id', studentId);
      if (updErr) return json(res, 500, { error: 'Failed to save email' });
      child.email = email;
    }
    if (!child.invite_code) {
      const code = generateStudentInviteCode();
      await sb.from('students').update({ invite_code: code }).eq('id', studentId);
      child.invite_code = code;
    }
    const sent = await sendStudentInvite(req, sb, child, email);
    if (!sent) return json(res, 500, { error: 'Failed to send invite' });
    return json(res, 200, { success: true, emailSent: true });
  }

  if (action === 'archive') {
    if (child.deletion_requested_at) {
      return json(res, 200, { success: true, alreadyRequested: true });
    }
    let unpaid = false;
    try {
      unpaid = await studentHasUnpaidBalance(sb, studentId);
    } catch (err) {
      console.error('[parent-child] unpaid check', err);
      return json(res, 500, { error: 'Failed to check unpaid balance' });
    }
    if (unpaid) return json(res, 409, { error: 'unpaid', unpaid: true });

    const { error: updErr } = await applyMoksloVaisiaiStudentArchive(sb, studentId);
    if (updErr) {
      console.error('[parent-child] archive', updErr);
      return json(res, 500, { error: 'Failed to archive account' });
    }
    const tutor = await resolveTutorOrg(sb, (child.tutor_id as string | null) ?? null);
    await notifyArchive(req, child, tutor.tutorOrganizationId);
    return json(res, 200, { success: true, alreadyRequested: false });
  }

  return json(res, 400, { error: 'Unknown action' });
}
