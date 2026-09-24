// ─── Vercel Cron: Send Reminders (visi priminimai) ───────────────────────────
// Kvietimas kas 5 min per Vercel Cron (/api/send-reminders).
// 1) Session reminders – to student and tutor before lesson (reminder_student_hours / reminder_tutor_hours).
// 2) Payment deadline warnings – payment deadline alert to tutor.
// 3) Payment-after-lesson reminders – reminder to pay after lesson (payment_timing = after_lesson).

import type { VercelRequest, VercelResponse } from './types';
import { createClient } from '@supabase/supabase-js';
import { isOrgTutor } from './_lib/isOrgTutor.js';
import { requireCronAuth } from './_lib/cronAuth.js';
import { dedupeReminderRecipients, type ReminderRecipient } from './_lib/reminderRecipients.js';
import { loadReminderOptOuts } from './_lib/reminderOptOut.js';
import { parseEmailOptOutList, isEmailOptedOut } from './_lib/emailNotificationOptOut.js';
import { isMissingPostgrestRpc } from './_lib/postgrestRpc.js';
import { moksloVaisiaiRoutesLessonCommsToPayer } from './_lib/moksloVaisiaiLessonComms.js';
import { buildSchoolHomeworkUrl, publicAppOrigin } from './_lib/publicLinkToken.js';
import { resolveSessionMeetingLink } from '../src/lib/meetingLink.js';
import {
  sessionReminderDeliveryKey,
  sessionReminderDeliveryOutcome,
  type SessionReminderDeliveryOutcome,
} from './_lib/sessionReminderDelivery.js';
import {
  canSendAnotherReminderEmail,
  payerGroupOccurrenceKey,
  sortSessionsForReminderDelivery,
} from './_lib/sessionReminderQueue.js';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const API_URL = process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL}`
  : (process.env.APP_URL || process.env.VITE_APP_URL || 'https://tutlio.lt');

export const SESSION_REMINDER_BATCH_SIZE = 500;
/** Soft cap per cron run; burst allowance can finish one school group slot past this. */
export const SESSION_REMINDER_EMAIL_ATTEMPT_LIMIT = 1000;
/** Extra payer emails allowed to finish one school group slot after the soft cap. */
export const SESSION_REMINDER_GROUP_BURST_ALLOWANCE = 120;

async function confirmedReminderOutcome(
  response: Response,
  context: { sessionId: string; recipientKind: 'student' | 'payer' | 'tutor' },
): Promise<SessionReminderDeliveryOutcome> {
  const body = await response.json().catch(() => null) as { reason?: unknown } | null;
  const outcome = sessionReminderDeliveryOutcome(response.ok, body);
  if (outcome === 'retry') {
    console.warn('[send-reminders] reminder delivery not confirmed', {
      ...context,
      status: response.status,
      reason: typeof body?.reason === 'string' ? body.reason : 'missing_provider_confirmation',
    });
  }
  return outcome;
}

export function tutorReminderOccurrenceScope(session: {
  id: string;
  tutor_id?: string | null;
  class_group_id?: string | null;
  subject_id?: string | null;
  start_time: string;
  tutor?: { id?: string | null } | null;
  subjects?: { is_group?: boolean | null } | null;
}): string {
  const tutorId = String(session.tutor_id || session.tutor?.id || '').trim();
  const instant = new Date(session.start_time).toISOString();
  if (tutorId && session.class_group_id) {
    return `tutor-group:${tutorId}:${session.class_group_id}:${instant}`;
  }
  if (tutorId && session.subject_id && session.subjects?.is_group) {
    return `tutor-subject:${tutorId}:${session.subject_id}:${instant}`;
  }
  return `tutor-session:${session.id}`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!requireCronAuth(req, res)) return;

  const results: { session?: number; deadline?: any; afterLesson?: any; schoolInstallments?: any; lessonStatusConfirmations?: any } = {};
  let totalSent = 0;
  let emailAttempts = 0;

  // Cache org features across the session loop (req 7: flexible_invitations gates
  // expanded parent reminder recipients, so other orgs' email volume is unchanged).
  const orgRowCache = new Map<string, { features: Record<string, unknown> | null; entityType: string | null }>();
  const getOrgRow = async (orgId: string | null) => {
    if (!orgId) return null;
    const cached = orgRowCache.get(orgId);
    if (cached) return cached;
    const { data } = await supabase.from('organizations').select('features, entity_type').eq('id', orgId).maybeSingle();
    const row = {
      features: ((data as { features?: Record<string, unknown> | null } | null)?.features as Record<string, unknown> | null) ?? null,
      entityType: ((data as { entity_type?: string | null } | null)?.entity_type as string | null) ?? null,
    };
    orgRowCache.set(orgId, row);
    return row;
  };
  const getOrgFeatures = async (orgId: string | null): Promise<Record<string, unknown> | null> =>
    (await getOrgRow(orgId))?.features ?? null;
  /** School parents get the lesson reminder with the join link even without a Tutlio account. */
  const isSchoolOrg = async (orgId: string | null): Promise<boolean> =>
    String((await getOrgRow(orgId))?.entityType || '').toLowerCase() === 'school';

  try {
    const now = new Date();
    const sessionSelect = `
          id, tutor_id, subject_id, class_group_id, start_time, end_time, topic, price, meeting_link,
          reminder_student_sent, reminder_tutor_sent, reminder_payer_sent,
          student:students(id, full_name, email, payment_payer, payer_email, payer_name, parent_secondary_email, parent_secondary_name, organization_id, linked_user_id, personal_meeting_link),
          tutor:profiles(id, full_name, email, phone, reminder_student_hours, reminder_tutor_hours, organization_id, email_notification_opt_out, personal_meeting_link),
          subjects(meeting_link, name, is_group),
          class_group:school_class_groups!sessions_class_group_id_fkey(name)
        `;
    const { data: dueSessionRows, error: dueSessionError } = await supabase.rpc(
      'get_due_session_reminder_ids',
      { p_limit: SESSION_REMINDER_BATCH_SIZE },
    );
    const dueSessionIds = (dueSessionRows || [])
      .map((row: { id?: string }) => row.id)
      .filter((id: string | undefined): id is string => Boolean(id));
    const sessionResult = isMissingPostgrestRpc(dueSessionError)
      ? await (async () => {
          console.warn('[send-reminders] get_due_session_reminder_ids missing; scanning sessions directly');
          const maxFuture = new Date(now.getTime() + 72 * 60 * 60 * 1000).toISOString();
          return supabase
            .from('sessions')
            .select(sessionSelect)
            .eq('status', 'active')
            .gte('start_time', now.toISOString())
            .lt('start_time', maxFuture)
            .order('start_time', { ascending: true })
            .order('id', { ascending: true })
            .limit(SESSION_REMINDER_BATCH_SIZE);
        })()
      : dueSessionError || dueSessionIds.length === 0
        ? { data: [], error: dueSessionError }
        : await supabase
          .from('sessions')
          .select(sessionSelect)
          .in('id', dueSessionIds)
          .order('start_time', { ascending: true })
          .order('id', { ascending: true });
    const { data: sessions, error } = sessionResult;

    if (error) {
      console.error('[send-reminders] Session query error:', error);
    } else if (sessions?.length) {
      const orderedSessions = sortSessionsForReminderDelivery(sessions);
      let activeSchoolPayerOccurrence: string | null = null;
      // A school group occurrence has one session row per student. Choose one
      // deterministic row per tutor/time slot so the teacher gets one reminder.
      const tutorReminderLeaderByOccurrence = new Map<string, string>();
      for (const session of orderedSessions) {
        if (session.reminder_tutor_sent) continue;
        const scope = tutorReminderOccurrenceScope(session as any);
        if (!tutorReminderLeaderByOccurrence.has(scope)) {
          tutorReminderLeaderByOccurrence.set(scope, String(session.id));
        }
      }

      for (const session of orderedSessions) {
        const payerOccurrenceKey = payerGroupOccurrenceKey(session as any);
        if (!canSendAnotherReminderEmail(
          emailAttempts,
          SESSION_REMINDER_EMAIL_ATTEMPT_LIMIT,
          SESSION_REMINDER_GROUP_BURST_ALLOWANCE,
          activeSchoolPayerOccurrence,
          payerOccurrenceKey,
        )) {
          break;
        }
        const startTime = new Date(session.start_time);
        if (startTime <= now) continue; // Only future sessions – never remind for past
        const diffHours = (startTime.getTime() - now.getTime()) / (1000 * 60 * 60);
        const tutor = session.tutor as any;
        const student = session.student as any;
        if (!tutor || !student) continue;

        const reminderStudentHours = Number(tutor?.reminder_student_hours ?? 2);
        const reminderTutorHours = Number(tutor?.reminder_tutor_hours ?? 2);
        const durationMinutes = Math.round((new Date(session.end_time).getTime() - startTime.getTime()) / 60000);
        const tz = 'Europe/Vilnius';
        const dateStr = startTime.toLocaleDateString('lt-LT', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: tz });
        const timeStr = startTime.toLocaleTimeString('lt-LT', { hour: '2-digit', minute: '2-digit', timeZone: tz });
        const orgId = (tutor as any)?.organization_id || null;
        const studentOrgId = ((student as any)?.organization_id as string | null) ?? orgId;
        const schoolFlowForSession = await isSchoolOrg(studentOrgId);
        const orgFeatures = await getOrgFeatures(orgId);
        const studentOrgFeatures = studentOrgId && studentOrgId !== orgId
          ? await getOrgFeatures(studentOrgId)
          : orgFeatures;
        const homeworkUrl = schoolFlowForSession && student?.id
          ? buildSchoolHomeworkUrl(publicAppOrigin(), String(student.id))
          : undefined;
        const recordingsUrl = homeworkUrl && studentOrgFeatures?.school_lesson_recordings === true
          ? `${homeworkUrl}#recordings`
          : undefined;
        // sessionId lets /api/send-email swap the link for a tracked /api/join-session URL (attendance).
        // Whiteboard link intentionally omitted: it pointed at the deployment domain and
        // recipients (parents/students) often lack board access — it lives in-app only.
        const resolvedMeetingLink = resolveSessionMeetingLink({
          sessionLink: session.meeting_link,
          tutorPersonalLink: tutor?.personal_meeting_link,
          studentPersonalLink: student?.personal_meeting_link,
          subjectLink: (session as { subjects?: { meeting_link?: string | null } | null }).subjects?.meeting_link,
        });
        const baseData = {
          sessionId: session.id,
          studentId: student?.id || undefined,
          date: dateStr,
          time: timeStr,
          topic: session.topic,
          duration: durationMinutes,
          price: session.price,
          meetingLink: resolvedMeetingLink || null,
          ...(schoolFlowForSession ? { schoolContractAccessRequired: true } : {}),
          ...(orgId ? { organizationId: orgId } : {}),
        };

        if (reminderStudentHours > 0 && !session.reminder_student_sent && diffHours <= reminderStudentHours && diffHours >= 0 && student?.email) {
          try {
            emailAttempts += 1;
            const reminderDeliveryScope = `student:${session.id}`;
            const resp = await fetch(`${API_URL}/api/send-email`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'x-internal-key': process.env.SUPABASE_SERVICE_ROLE_KEY || '' },
              body: JSON.stringify({
                type: 'session_reminder',
                to: student.email,
                idempotencyKey: sessionReminderDeliveryKey('session_reminder', student.email, reminderDeliveryScope),
                data: {
                  ...baseData,
                  reminderDeliveryScope,
                  ...(schoolFlowForSession && studentOrgId
                    ? {
                      organizationId: studentOrgId,
                      schoolFlow: true,
                      homeworkUrl,
                      recordingsUrl,
                    }
                    : {}),
                  recipientName: student.full_name,
                  otherName: tutor?.full_name,
                  isTutor: false,
                },
              }),
            });
            const outcome = await confirmedReminderOutcome(resp, {
              sessionId: String(session.id),
              recipientKind: 'student',
            });
            if (outcome !== 'retry') {
              await supabase.from('sessions').update({ reminder_student_sent: true }).eq('id', session.id);
              if (outcome === 'sent') totalSent++;
            }
          } catch (e) {
            console.error('[send-reminders] student email error:', e);
          }
        }

        // Parent/payer reminders: same time window as student.
        // Default: only the paying parent (payment_payer==='parent').
        // With flexible_invitations on: remind ALL parent contacts (payer +
        // secondary + registered parents), decoupled from who pays.
        if (reminderStudentHours > 0 && !session.reminder_payer_sent && diffHours <= reminderStudentHours && diffHours >= 0) {
          if (schoolFlowForSession && payerOccurrenceKey) {
            activeSchoolPayerOccurrence = payerOccurrenceKey;
          }
          const studentEmailNorm = (student?.email || '').trim().toLowerCase();
          const payerEmail = (student as any)?.payer_email?.trim() || '';
          const payerName = (student as any)?.payer_name || null;
          const isPayerParent = (student as any)?.payment_payer === 'parent';
          const mvPayerInbox = moksloVaisiaiRoutesLessonCommsToPayer({
            organizationId: (student as any)?.organization_id ?? orgId,
            tutorOrganizationId: orgId,
            studentEmail: student?.email,
            linkedUserId: (student as any)?.linked_user_id,
          });
          const flexibleInvites = orgFeatures?.flexible_invitations === true;
          // School org: the payer email on the student row is the parent contact,
          // whether or not that parent ever registered (schools run on emails only).
          const schoolFlow = schoolFlowForSession;
          const candidates: ReminderRecipient[] = [];

          if (schoolFlow && !flexibleInvites) {
            if (payerEmail) candidates.push({ email: payerEmail, name: payerName });
            const secEmail = (student as any)?.parent_secondary_email?.trim() || '';
            if (secEmail) candidates.push({ email: secEmail, name: (student as any)?.parent_secondary_name || null });
          } else if (flexibleInvites) {
            if (payerEmail) candidates.push({ email: payerEmail, name: payerName });
            const secEmail = (student as any)?.parent_secondary_email?.trim() || '';
            if (secEmail) candidates.push({ email: secEmail, name: (student as any)?.parent_secondary_name || null });
            // Registered parents linked to this student.
            const { data: links } = await supabase
              .from('parent_students')
              .select('parent_id')
              .eq('student_id', (student as any)?.id);
            const parentIds = (links || []).map((l: any) => l.parent_id).filter(Boolean);
            if (parentIds.length > 0) {
              const { data: profs } = await supabase
                .from('parent_profiles')
                .select('email, full_name, disable_lesson_reminders')
                .in('id', parentIds);
              for (const p of profs || []) {
                if (p?.disable_lesson_reminders) continue;
                if (p?.email) candidates.push({ email: String(p.email), name: p.full_name || null });
              }
            }
          } else if ((isPayerParent || mvPayerInbox) && payerEmail) {
            candidates.push({ email: payerEmail, name: payerName });
          }

          // Resolve opt-outs for raw payer/secondary emails (registered parents
          // were already filtered above by their profile flag). parent_profiles
          // stores emails lowercased, so match on the lowercased candidates.
          const optedOut = new Set<string>();
          if (candidates.length > 0) {
            const lookupEmails = [...new Set(candidates.map((c) => c.email.trim().toLowerCase()))];
            const { data: optRows } = await supabase
              .from('parent_profiles')
              .select('email, disable_lesson_reminders')
              .in('email', lookupEmails);
            for (const r of optRows || []) {
              if (r?.disable_lesson_reminders && r?.email) optedOut.add(String(r.email).toLowerCase());
            }
            const tableOptOuts = await loadReminderOptOuts(supabase, lookupEmails);
            for (const e of tableOptOuts) optedOut.add(e);
          }

          // Dedup, drop the student's own email and opt-outs.
          const recipients = dedupeReminderRecipients(candidates, {
            studentEmail: studentEmailNorm,
            optedOutEmails: optedOut,
          });

          // A session is complete only when every intended parent recipient was
          // either provider-confirmed or intentionally opted out. With
          // idempotency enabled, a partial failure can safely retry the whole
          // recipient set without duplicating already accepted messages.
          let allParentHandled = candidates.length > 0 && recipients.length === 0;
          if (recipients.length > 0) allParentHandled = true;
          for (const r of recipients) {
            if (!canSendAnotherReminderEmail(
              emailAttempts,
              SESSION_REMINDER_EMAIL_ATTEMPT_LIMIT,
              SESSION_REMINDER_GROUP_BURST_ALLOWANCE,
              activeSchoolPayerOccurrence,
              payerOccurrenceKey,
            )) {
              allParentHandled = false;
              break;
            }
            try {
              emailAttempts += 1;
              const reminderDeliveryScope = `payer:${session.id}`;
              const resp = await fetch(`${API_URL}/api/send-email`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-internal-key': process.env.SUPABASE_SERVICE_ROLE_KEY || '' },
                body: JSON.stringify({
                  type: 'session_reminder_payer',
                  to: r.email,
                  idempotencyKey: sessionReminderDeliveryKey('session_reminder_payer', r.email, reminderDeliveryScope),
                  data: {
                    ...baseData,
                    reminderDeliveryScope,
                    ...(schoolFlow && studentOrgId
                      ? {
                        organizationId: studentOrgId,
                        schoolFlow: true,
                        // Homework / materials page — the only "portal" a parent without an account has.
                        homeworkUrl,
                        recordingsUrl,
                      }
                      : {}),
                    recipientName: r.name || undefined,
                    studentName: student?.full_name || 'Mokinys',
                    tutorName: tutor?.full_name || 'Korepetitorius',
                    tutorEmail: tutor?.email || undefined,
                    tutorPhone: tutor?.phone || undefined,
                  },
                }),
              });
              const outcome = await confirmedReminderOutcome(resp, {
                sessionId: String(session.id),
                recipientKind: 'payer',
              });
              if (outcome === 'retry') allParentHandled = false;
              if (outcome === 'sent') totalSent++;
            } catch (e) {
              allParentHandled = false;
              console.error('[send-reminders] parent reminder error:', e);
            }
          }
          if (allParentHandled) {
            await supabase.from('sessions').update({ reminder_payer_sent: true }).eq('id', session.id);
          }
        }

        const tutorReminderScope = tutorReminderOccurrenceScope(session as any);
        const isTutorReminderLeader = tutorReminderLeaderByOccurrence.get(tutorReminderScope) === String(session.id);
        if (isTutorReminderLeader && reminderTutorHours > 0 && !session.reminder_tutor_sent && diffHours <= reminderTutorHours && diffHours >= 0 && tutor?.email && canSendAnotherReminderEmail(
          emailAttempts,
          SESSION_REMINDER_EMAIL_ATTEMPT_LIMIT,
          SESSION_REMINDER_GROUP_BURST_ALLOWANCE,
          activeSchoolPayerOccurrence,
          payerOccurrenceKey,
        )) {
          const markTutorOccurrenceSent = async () => {
            const tutorId = String(session.tutor_id || tutor?.id || '').trim();
            const update = supabase.from('sessions').update({ reminder_tutor_sent: true });
            let result;
            if (tutorId && session.class_group_id) {
              result = await update
                .eq('tutor_id', tutorId)
                .eq('class_group_id', session.class_group_id)
                .eq('start_time', session.start_time);
            } else if (tutorId && session.subject_id && (session as any)?.subjects?.is_group) {
              result = await update
                .eq('tutor_id', tutorId)
                .eq('subject_id', session.subject_id)
                .is('class_group_id', null)
                .eq('start_time', session.start_time);
            } else {
              result = await update.eq('id', session.id);
            }
            if (result.error) throw result.error;
          };
          const tutorOptOut = parseEmailOptOutList(tutor?.email_notification_opt_out);
          if (isEmailOptedOut(tutorOptOut, 'lesson_reminder_tutor')) {
            await markTutorOccurrenceSent();
          } else {
          try {
            emailAttempts += 1;
            const groupName = (session as any)?.class_group?.name
              || ((session as any)?.subjects?.is_group ? (session as any)?.subjects?.name : null);
            const tutorReminderCore = {
              sessionId: session.id,
              studentId: student?.id || undefined,
              date: dateStr,
              time: timeStr,
              topic: session.topic,
              duration: durationMinutes,
              meetingLink: session.meeting_link,
              reminderDeliveryScope: tutorReminderScope,
            };
            const tutorReminderData = isOrgTutor(tutor.organization_id)
              ? { ...tutorReminderCore, ...(orgId ? { organizationId: orgId } : {}) }
              : { ...tutorReminderCore, price: session.price, ...(orgId ? { organizationId: orgId } : {}) };
            const resp = await fetch(`${API_URL}/api/send-email`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'x-internal-key': process.env.SUPABASE_SERVICE_ROLE_KEY || '' },
              body: JSON.stringify({
                type: 'session_reminder',
                to: tutor.email,
                idempotencyKey: sessionReminderDeliveryKey('session_reminder', tutor.email, tutorReminderScope),
                data: {
                  ...tutorReminderData,
                  recipientName: tutor.full_name,
                  otherName: groupName || student?.full_name,
                  isTutor: true,
                },
              }),
            });
            const outcome = await confirmedReminderOutcome(resp, {
              sessionId: String(session.id),
              recipientKind: 'tutor',
            });
            if (outcome !== 'retry') {
              await markTutorOccurrenceSent();
              if (outcome === 'sent') totalSent++;
            }
          } catch (e) {
            console.error('[send-reminders] tutor email error:', e);
          }
          }
        }
      }
      results.session = totalSent;
    }

    const cronSecret = process.env.CRON_SECRET;
    const cronHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
    if (cronSecret) cronHeaders['Authorization'] = `Bearer ${cronSecret}`;

    try {
      const deadlineRes = await fetch(`${API_URL}/api/payment-deadline-warnings`, { method: 'GET', headers: cronHeaders });
      results.deadline = deadlineRes.ok ? await deadlineRes.json().catch(() => ({})) : null;
    } catch (e) {
      console.error('[send-reminders] payment-deadline-warnings error:', e);
    }
    try {
      const afterRes = await fetch(`${API_URL}/api/payment-after-lesson-reminders`, { method: 'GET', headers: cronHeaders });
      results.afterLesson = afterRes.ok ? await afterRes.json().catch(() => ({})) : null;
    } catch (e) {
      console.error('[send-reminders] payment-after-lesson-reminders error:', e);
    }
    try {
      const schoolRes = await fetch(`${API_URL}/api/school-installment-reminders`, { method: 'GET', headers: cronHeaders });
      results.schoolInstallments = schoolRes.ok ? await schoolRes.json().catch(() => ({})) : null;
    } catch (e) {
      console.error('[send-reminders] school-installment-reminders error:', e);
    }
    try {
      const statusRes = await fetch(`${API_URL}/api/lesson-status-confirmation-reminders`, { method: 'GET', headers: cronHeaders });
      results.lessonStatusConfirmations = statusRes.ok ? await statusRes.json().catch(() => ({})) : null;
    } catch (e) {
      console.error('[send-reminders] lesson-status-confirmation-reminders error:', e);
    }

    return res.status(200).json({
      message: 'Reminders run complete',
      sent: totalSent,
      emailAttempts,
      emailAttemptLimit: SESSION_REMINDER_EMAIL_ATTEMPT_LIMIT,
      sessionBatchSize: SESSION_REMINDER_BATCH_SIZE,
      sessionReminders: results.session,
      paymentDeadlineWarnings: results.deadline,
      paymentAfterLessonReminders: results.afterLesson,
      schoolInstallmentReminders: results.schoolInstallments,
    });
  } catch (err: any) {
    console.error('[send-reminders] error:', err);
    return res.status(500).json({ error: 'Failed to send reminders', message: err?.message });
  }
}
