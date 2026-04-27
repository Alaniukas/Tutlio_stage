// ─── Vercel Cron: Send Reminders (visi priminimai) ───────────────────────────
// Kvietimas kas 5 min per Vercel Cron (/api/send-reminders).
// 1) Session reminders – to student and tutor before lesson (reminder_student_hours / reminder_tutor_hours).
// 2) Payment deadline warnings – payment deadline alert to tutor.
// 3) Payment-after-lesson reminders – reminder to pay after lesson (payment_timing = after_lesson).

import type { VercelRequest, VercelResponse } from './types';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const API_URL = process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL}`
  : (process.env.APP_URL || process.env.VITE_APP_URL || 'https://tutlio.lt');

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = typeof req.headers.authorization === 'string' ? req.headers.authorization : '';
    if (auth !== `Bearer ${cronSecret}`) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  const results: { session?: number; deadline?: any; afterLesson?: any; schoolInstallments?: any } = {};
  let totalSent = 0;

  try {
    const now = new Date();
    const maxFuture = new Date(now.getTime() + 72 * 60 * 60 * 1000).toISOString();

    const { data: sessions, error } = await supabase
      .from('sessions')
      .select(`
        id, start_time, end_time, topic, price, meeting_link,
        reminder_student_sent, reminder_tutor_sent, reminder_payer_sent,
        student:students(id, full_name, email, payment_payer, payer_email, payer_name),
        tutor:profiles(id, full_name, email, phone, reminder_student_hours, reminder_tutor_hours)
      `)
      .eq('status', 'active')
      .gte('start_time', now.toISOString())
      .lt('start_time', maxFuture);

    if (error) {
      console.error('[send-reminders] Session query error:', error);
    } else if (sessions?.length) {
      for (const session of sessions) {
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
        const data = { date: dateStr, time: timeStr, topic: session.topic, duration: durationMinutes, price: session.price, meetingLink: session.meeting_link };

        if (reminderStudentHours > 0 && !session.reminder_student_sent && diffHours <= reminderStudentHours && diffHours >= 0 && student?.email) {
          try {
            const resp = await fetch(`${API_URL}/api/send-email`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'x-internal-key': process.env.SUPABASE_SERVICE_ROLE_KEY || '' },
              body: JSON.stringify({
                type: 'session_reminder',
                to: student.email,
                data: { ...data, recipientName: student.full_name, otherName: tutor?.full_name, isTutor: false },
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

// Payer (parent): same time window as student; skip if payer_email === student.email
        const payerEmail = (student as any)?.payer_email?.trim();
        const isPayerParent = (student as any)?.payment_payer === 'parent';
        const payerName = (student as any)?.payer_name || null;
        const payerIsDifferentFromStudent = payerEmail && payerEmail !== (student?.email || '').trim();
        if (reminderStudentHours > 0 && !session.reminder_payer_sent && isPayerParent && payerIsDifferentFromStudent && diffHours <= reminderStudentHours && diffHours >= 0) {
          try {
            const resp = await fetch(`${API_URL}/api/send-email`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'x-internal-key': process.env.SUPABASE_SERVICE_ROLE_KEY || '' },
              body: JSON.stringify({
                type: 'session_reminder_payer',
                to: payerEmail,
                data: {
                  ...data,
                  recipientName: payerName || undefined,
                  studentName: student?.full_name || 'Mokinys',
                  tutorName: tutor?.full_name || 'Korepetitorius',
                  tutorEmail: tutor?.email || undefined,
                  tutorPhone: tutor?.phone || undefined,
                },
              }),
            });
            if (resp.ok) {
              await supabase.from('sessions').update({ reminder_payer_sent: true }).eq('id', session.id);
              totalSent++;
            }
          } catch (e) {
            console.error('[send-reminders] payer reminder error:', e);
          }
        }

        if (reminderTutorHours > 0 && !session.reminder_tutor_sent && diffHours <= reminderTutorHours && diffHours >= 0 && tutor?.email) {
          try {
            const resp = await fetch(`${API_URL}/api/send-email`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'x-internal-key': process.env.SUPABASE_SERVICE_ROLE_KEY || '' },
              body: JSON.stringify({
                type: 'session_reminder',
                to: tutor.email,
                data: { ...data, recipientName: tutor.full_name, otherName: student?.full_name, isTutor: true },
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

    return res.status(200).json({
      message: 'Reminders run complete',
      sent: totalSent,
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
