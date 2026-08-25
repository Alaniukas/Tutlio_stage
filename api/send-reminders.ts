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

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const API_URL = process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL}`
  : (process.env.APP_URL || process.env.VITE_APP_URL || 'https://tutlio.lt');

export const SESSION_REMINDER_BATCH_SIZE = 250;
export const SESSION_REMINDER_EMAIL_ATTEMPT_LIMIT = 100;

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
  const orgFeaturesCache = new Map<string, Record<string, unknown> | null>();
  const getOrgFeatures = async (orgId: string | null): Promise<Record<string, unknown> | null> => {
    if (!orgId) return null;
    if (orgFeaturesCache.has(orgId)) return orgFeaturesCache.get(orgId) ?? null;
    const { data } = await supabase.from('organizations').select('features').eq('id', orgId).maybeSingle();
    const feat = (data?.features as Record<string, unknown> | null) ?? null;
    orgFeaturesCache.set(orgId, feat);
    return feat;
  };

  try {
    const now = new Date();
    const { data: dueSessionRows, error: dueSessionError } = await supabase.rpc(
      'get_due_session_reminder_ids',
      { p_limit: SESSION_REMINDER_BATCH_SIZE },
    );
    const dueSessionIds = (dueSessionRows || [])
      .map((row: { id?: string }) => row.id)
      .filter((id: string | undefined): id is string => Boolean(id));
    const sessionResult = dueSessionError || dueSessionIds.length === 0
      ? { data: [], error: dueSessionError }
      : await supabase
        .from('sessions')
        .select(`
          id, start_time, end_time, topic, price, meeting_link,
          reminder_student_sent, reminder_tutor_sent, reminder_payer_sent,
          student:students(id, full_name, email, payment_payer, payer_email, payer_name, parent_secondary_email, parent_secondary_name),
          tutor:profiles(id, full_name, email, phone, reminder_student_hours, reminder_tutor_hours, organization_id)
        `)
        .in('id', dueSessionIds)
        .order('start_time', { ascending: true })
        .order('id', { ascending: true });
    const { data: sessions, error } = sessionResult;

    if (error) {
      console.error('[send-reminders] Session query error:', error);
    } else if (sessions?.length) {
      for (const session of sessions) {
        if (emailAttempts >= SESSION_REMINDER_EMAIL_ATTEMPT_LIMIT) break;
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
        // sessionId lets /api/send-email swap the link for a tracked /api/join-session URL (attendance).
        // Whiteboard link intentionally omitted: it pointed at the deployment domain and
        // recipients (parents/students) often lack board access — it lives in-app only.
        const baseData = {
          sessionId: session.id,
          studentId: student?.id || undefined,
          date: dateStr,
          time: timeStr,
          topic: session.topic,
          duration: durationMinutes,
          price: session.price,
          meetingLink: session.meeting_link,
          ...(orgId ? { organizationId: orgId } : {}),
        };

        if (reminderStudentHours > 0 && !session.reminder_student_sent && diffHours <= reminderStudentHours && diffHours >= 0 && student?.email) {
          try {
            emailAttempts += 1;
            const resp = await fetch(`${API_URL}/api/send-email`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'x-internal-key': process.env.SUPABASE_SERVICE_ROLE_KEY || '' },
              body: JSON.stringify({
                type: 'session_reminder',
                to: student.email,
                data: { ...baseData, recipientName: student.full_name, otherName: tutor?.full_name, isTutor: false },
              }),
            });
            if (resp.ok) {
              await supabase.from('sessions').update({ reminder_student_sent: true }).eq('id', session.id);
              totalSent++;
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
          const studentEmailNorm = (student?.email || '').trim().toLowerCase();
          const payerEmail = (student as any)?.payer_email?.trim() || '';
          const payerName = (student as any)?.payer_name || null;
          const isPayerParent = (student as any)?.payment_payer === 'parent';
          const flexibleInvites = (await getOrgFeatures(orgId))?.flexible_invitations === true;

          const candidates: ReminderRecipient[] = [];

          if (flexibleInvites) {
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
          } else if (isPayerParent && payerEmail) {
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

          let anyParentSent = false;
          for (const r of recipients) {
            if (emailAttempts >= SESSION_REMINDER_EMAIL_ATTEMPT_LIMIT) break;
            try {
              emailAttempts += 1;
              const resp = await fetch(`${API_URL}/api/send-email`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-internal-key': process.env.SUPABASE_SERVICE_ROLE_KEY || '' },
                body: JSON.stringify({
                  type: 'session_reminder_payer',
                  to: r.email,
                  data: {
                    ...baseData,
                    recipientName: r.name || undefined,
                    studentName: student?.full_name || 'Mokinys',
                    tutorName: tutor?.full_name || 'Korepetitorius',
                    tutorEmail: tutor?.email || undefined,
                    tutorPhone: tutor?.phone || undefined,
                  },
                }),
              });
              if (resp.ok) {
                anyParentSent = true;
                totalSent++;
              }
            } catch (e) {
              console.error('[send-reminders] parent reminder error:', e);
            }
          }
          if (anyParentSent) {
            await supabase.from('sessions').update({ reminder_payer_sent: true }).eq('id', session.id);
          }
        }

        if (reminderTutorHours > 0 && !session.reminder_tutor_sent && diffHours <= reminderTutorHours && diffHours >= 0 && tutor?.email && emailAttempts < SESSION_REMINDER_EMAIL_ATTEMPT_LIMIT) {
          try {
            emailAttempts += 1;
            const tutorReminderCore = {
              sessionId: session.id,
              studentId: student?.id || undefined,
              date: dateStr,
              time: timeStr,
              topic: session.topic,
              duration: durationMinutes,
              meetingLink: session.meeting_link,
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
                data: {
                  ...tutorReminderData,
                  recipientName: tutor.full_name,
                  otherName: student?.full_name,
                  isTutor: true,
                },
              }),
            });
            if (resp.ok) {
              await supabase.from('sessions').update({ reminder_tutor_sent: true }).eq('id', session.id);
              totalSent++;
            }
          } catch (e) {
            console.error('[send-reminders] tutor email error:', e);
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
