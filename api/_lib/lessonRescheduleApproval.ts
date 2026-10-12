import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { VercelRequest } from '../types.js';
import { appOrigin, internalApiOrigin } from './extraLessonsContractShared.js';
import { notificationLocale } from './notificationLocale.js';
import { resolveEmailOrgBranding } from './emailOrgBranding.js';
import { effectiveLessonRescheduleStatus, type LessonRescheduleApprovalPreview, type LessonRescheduleApprovalStatus } from '../../src/lib/lessonRescheduleApproval.js';
import { releaseSessionSlotAsAvailability } from '../../src/lib/releaseSessionAvailability.js';
import { buildLessonRescheduleRecipients } from '../../src/lib/lessonRescheduleNotify.js';

export type RescheduleChange = {
  id: string; studentId: string; subjectId: string | null; recurringId: string | null;
  oldStart: string; oldEnd: string; newStart: string; newEnd: string;
};
export type RescheduleRequestRow = {
  id: string; organization_id: string; tutor_id: string; session_id: string;
  scope: 'single' | 'future'; status: LessonRescheduleApprovalStatus;
  reason: string; changes: RescheduleChange[]; expires_at: string;
  leave_free_time: boolean; decision_notified_at: string | null;
};
export type RescheduleRecipientRow = {
  id: string; email: string; student_ids: string[]; status: 'pending' | 'approved' | 'rejected';
};

export function rescheduleApprovalToken(requestId: string, recipientId: string, secret = process.env.SUPABASE_SERVICE_ROLE_KEY || ''): string {
  if (!secret) throw new Error('Server misconfigured');
  return createHmac('sha256', secret).update(`lesson-reschedule:${requestId}:${recipientId}`).digest('hex');
}
export function verifyRescheduleApprovalToken(requestId: string, recipientId: string, token: string, secret = process.env.SUPABASE_SERVICE_ROLE_KEY || ''): boolean {
  if (!secret || !/^[a-f0-9]{64}$/.test(token)) return false;
  const expected = rescheduleApprovalToken(requestId, recipientId, secret);
  return timingSafeEqual(Buffer.from(expected), Buffer.from(token));
}

export async function rescheduleContext(db: SupabaseClient, request: RescheduleRequestRow) {
  const [orgResult, tutorResult, studentResult, recipientResult] = await Promise.all([
    db.from('organizations').select('id, name, logo_url, brand_color, brand_color_secondary, features, preferred_locale').eq('id', request.organization_id).single(),
    db.from('profiles').select('full_name, email').eq('id', request.tutor_id).single(),
    db.from('students').select('id, full_name, email, payer_email, parent_secondary_email, payment_payer')
      .in('id', [...new Set(request.changes.map(c => c.studentId))]).eq('organization_id', request.organization_id),
    db.from('lesson_reschedule_recipients').select('id, email, student_ids, status').eq('request_id', request.id),
  ]);
  for (const result of [orgResult, tutorResult, studentResult, recipientResult]) if (result.error) throw result.error;
  return { org: orgResult.data!, tutor: tutorResult.data!, students: studentResult.data || [], recipients: (recipientResult.data || []) as RescheduleRecipientRow[] };
}

export async function reschedulePreview(db: SupabaseClient, request: RescheduleRequestRow, recipient: RescheduleRecipientRow): Promise<LessonRescheduleApprovalPreview> {
  const { org, tutor, students } = await rescheduleContext(db, request);
  const change = request.changes.find(c => recipient.student_ids.includes(c.studentId));
  if (!change) throw new Error('reschedule_changed');
  const branding = resolveEmailOrgBranding(org.id, org);
  return {
    status: effectiveLessonRescheduleStatus(request.status, request.expires_at),
    recipientApproved: recipient.status === 'approved', scope: request.scope,
    organizationName: branding.publicName || org.name,
    brandColor: /^#[a-f\d]{6}$/i.test(org.brand_color || '') ? org.brand_color : '#6366f1',
    tutorName: tutor.full_name || '',
    studentName: students.filter(s => recipient.student_ids.includes(s.id)).map(s => s.full_name).join(', '),
    oldStart: change.oldStart, oldEnd: change.oldEnd, newStart: change.newStart, newEnd: change.newEnd,
    reason: request.reason, locale: await notificationLocale(db, recipient.email, undefined, org.preferred_locale),
  };
}

export async function sendRescheduleEmail(req: VercelRequest, params: {
  type: string; to: string; data: Record<string, unknown>; key: string;
}): Promise<boolean> {
  try {
    const response = await fetch(`${internalApiOrigin(req)}/api/send-email`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-internal-key': process.env.SUPABASE_SERVICE_ROLE_KEY || '' },
      body: JSON.stringify({ type: params.type, to: params.to, data: { ...params.data, rescheduleDeliveryKey: params.key } }),
      signal: AbortSignal.timeout(20_000),
    });
    const result = await response.json();
    return response.ok && result.success === true && (Boolean(result.id) || result.skipped === true);
  } catch { return false; }
}

export async function emailRescheduleProposal(req: VercelRequest, db: SupabaseClient, request: RescheduleRequestRow): Promise<boolean> {
  const { recipients } = await rescheduleContext(db, request);
  for (const recipient of recipients) {
    const preview = await reschedulePreview(db, request, recipient);
    const query = new URLSearchParams({ request: request.id, recipient: recipient.id, t: rescheduleApprovalToken(request.id, recipient.id) });
    const url = `${appOrigin(req)}/lesson-reschedule-approval?${query}`;
    if (!(await sendRescheduleEmail(req, {
      type: 'lesson_reschedule_proposed', to: recipient.email,
      data: { ...preview, organizationId: request.organization_id, confirmUrl: `${url}&choice=approved`, rejectUrl: `${url}&choice=rejected` },
      key: `reschedule/${request.id}/proposal/${recipient.id}`,
    }))) return false;
  }
  return recipients.length > 0;
}

/** Persisted decisions are final even if delivery temporarily fails. The
 * reminder cron retries unsent tutor mail without applying the move again. */
export async function notifyRescheduleDecision(req: VercelRequest, db: SupabaseClient, request: RescheduleRequestRow): Promise<void> {
  if (!['approved', 'rejected'].includes(request.status) || request.decision_notified_at) return;
  const { org, tutor, students } = await rescheduleContext(db, request);
  const change = request.changes.find(c => c.id === request.session_id) || request.changes[0];
  if (request.status === 'approved') {
    if (request.leave_free_time) {
      for (const c of request.changes.filter((row, i, all) => all.findIndex(x => x.oldStart === row.oldStart && x.oldEnd === row.oldEnd) === i)) {
        await releaseSessionSlotAsAvailability(db, {
          tutorId: request.tutor_id, startTime: c.oldStart, endTime: c.oldEnd,
          subjectId: c.subjectId,
        });
      }
    }
    // Google sync failure never rolls back a client's approved booking.
    try {
      await fetch(`${internalApiOrigin(req)}/api/google-calendar-sync`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'x-internal-key': process.env.SUPABASE_SERVICE_ROLE_KEY || '' },
        body: JSON.stringify({ userId: request.tutor_id }), signal: AbortSignal.timeout(10_000),
      });
    } catch { /* existing calendar sync can recover later */ }
  }
  const ok = await sendRescheduleEmail(req, {
    type: 'lesson_reschedule_decision', to: tutor.email,
    data: { ...change, status: request.status, scope: request.scope, reason: request.reason,
      studentName: students.map(s => s.full_name).join(', '), organizationId: request.organization_id,
      locale: await notificationLocale(db, tutor.email, undefined, org.preferred_locale) },
    key: `reschedule/${request.id}/decision/${request.status}`,
  });
  if (ok) {
    if (request.status === 'approved') {
      // Preserve the existing student/payer notifications, now after approval.
      const format = (iso: string, kind: 'date' | 'time') => new Date(iso).toLocaleString(kind === 'date' ? 'en-CA' : 'sv-SE', {
        timeZone: 'Europe/Vilnius', ...(kind === 'date'
          ? { year: 'numeric', month: '2-digit', day: '2-digit' } as const
          : { hour: '2-digit', minute: '2-digit', hour12: false } as const),
      });
      for (const student of students) {
        for (const recipient of buildLessonRescheduleRecipients({
          isSchoolOrg: false, studentEmail: student.email, payerEmail: student.payer_email,
          secondaryParentEmail: student.parent_secondary_email,
          paymentPayer: student.payment_payer, studentName: student.full_name,
        })) {
          const deliveryId = createHash('sha256').update(`${student.id}:${recipient.recipientRole}:${recipient.to.toLowerCase()}`).digest('hex');
          const delivered = await sendRescheduleEmail(req, {
            type: 'lesson_rescheduled', to: recipient.to,
            data: { organizationId: request.organization_id, tutorName: tutor.full_name,
              studentName: student.full_name, recipientRole: recipient.recipientRole,
              rescheduledBy: 'tutor', reason: request.reason,
              oldDate: format(change.oldStart, 'date'), oldTime: format(change.oldStart, 'time'),
              newDate: format(change.newStart, 'date'), newTime: format(change.newStart, 'time'),
            }, key: `reschedule/${request.id}/moved/${deliveryId}`,
          });
          if (!delivered) return;
        }
      }
    }
    const { error } = await db.from('lesson_reschedule_requests').update({ decision_notified_at: new Date().toISOString() }).eq('id', request.id);
    if (error) throw error;
  }
}

export async function retryRescheduleDecisionNotifications(req: VercelRequest, db: SupabaseClient): Promise<void> {
  const { data, error } = await db.from('lesson_reschedule_requests').select('*')
    .in('status', ['approved', 'rejected']).is('decision_notified_at', null)
    .order('resolved_at').limit(5);
  // Keep reminders compatible while a deployment's migration is pending.
  if (error?.code === '42P01' || error?.code === 'PGRST205') return;
  if (error) throw error;
  for (const request of data || []) {
    try { await notifyRescheduleDecision(req, db, request); }
    catch { console.error('[reschedule-approval] decision retry failed', request.id); }
  }
}
