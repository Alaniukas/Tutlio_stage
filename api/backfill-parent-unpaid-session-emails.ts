import type { VercelRequest, VercelResponse } from './types';
import { createClient } from '@supabase/supabase-js';
import { resolvePerLessonPaymentRules } from './_lib/perLessonPaymentRules.js';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const BASE_URL = process.env.APP_URL || process.env.VITE_APP_URL || 'https://tutlio.lt';

async function createPaymentUrl(sessionId: string, payerEmail: string): Promise<string | null> {
  try {
    const res = await fetch(`${BASE_URL}/api/stripe-checkout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-internal-key': process.env.SUPABASE_SERVICE_ROLE_KEY || '' },
      body: JSON.stringify({ sessionId, payerEmail }),
    });
    if (!res.ok) return null;
    const json = await res.json().catch(() => ({} as any));
    return json?.url || null;
  } catch {
    return null;
  }
}

async function sendPayerEmail(payload: any): Promise<boolean> {
  try {
    const res = await fetch(`${BASE_URL}/api/send-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-internal-key': process.env.SUPABASE_SERVICE_ROLE_KEY || '' },
      body: JSON.stringify(payload),
    });
    return res.ok;
  } catch {
    return false;
  }
}

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

  const dryRun =
    String(req.query.dryRun || req.body?.dryRun || '').toLowerCase() === '1' ||
    String(req.query.dryRun || req.body?.dryRun || '').toLowerCase() === 'true';

  const limit = Math.max(1, Math.min(Number(req.query.limit || req.body?.limit || 200), 1000));
  const rawEmails = String(req.query.emails || req.body?.emails || '').trim();
  const emailFilterList = rawEmails
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter((email) => email.length > 0);
  const emailFilterSet = new Set(emailFilterList);

  try {
    const nowIso = new Date().toISOString();

    // Past unpaid lessons are usually status=completed (or no_show); only upcoming stay active.
    // Include active too for edge cases (e.g. marked completed late). Exclude cancelled.
    const { data: sessions, error } = await supabase
      .from('sessions')
      .select(`
        id,
        start_time,
        end_time,
        price,
        topic,
        status,
        stripe_checkout_session_id,
        payment_after_lesson_reminder_sent,
        student:students!inner(
          full_name,
          email,
          payment_payer,
          payer_email,
          payer_name,
          payment_model,
          per_lesson_payment_timing,
          per_lesson_payment_deadline_hours
        ),
        tutor:profiles!sessions_tutor_id_fkey(
          full_name,
          payment_timing,
          payment_deadline_hours
        )
      `)
      .in('status', ['active', 'completed', 'no_show'])
      .or('paid.eq.false,paid.is.null')
      .eq('student.payment_payer', 'parent')
      // stripe_checkout_session_id may be missing historically; we generate a fresh Checkout URL via /api/stripe-checkout anyway.
      .lt('end_time', nowIso)
      .order('end_time', { ascending: false })
      .limit(limit);

    if (error) {
      return res.status(500).json({ error: 'Failed to fetch sessions', details: error.message });
    }

    let candidates = (sessions || []).filter((s: any) => {
      const payer = (s?.student?.payer_email || '').trim();
      return payer.length > 0;
    });
    if (emailFilterSet.size > 0) {
      candidates = candidates.filter((s: any) =>
        emailFilterSet.has(String(s?.student?.payer_email || '').trim().toLowerCase())
      );
    }
    const uniquePayerEmails = Array.from(
      new Set(
        candidates
          .map((s: any) => String(s?.student?.payer_email || '').trim())
          .filter((email: string) => email.length > 0)
      )
    );

    if (dryRun) {
      return res.status(200).json({
        success: true,
        dryRun: true,
        found: candidates.length,
        emailFilter: emailFilterList,
        uniquePayers: uniquePayerEmails.length,
        payerEmails: uniquePayerEmails,
        sample: candidates.slice(0, 20).map((s: any) => ({
          sessionId: s.id,
          status: s.status || null,
          student: s.student?.full_name || null,
          payerEmail: s.student?.payer_email || null,
          startTime: s.start_time,
          endTime: s.end_time,
          amount: s.price,
        })),
      });
    }

    const sent: string[] = [];
    const sentTo: string[] = [];
    const failed: Array<{ sessionId: string; reason: string }> = [];
    const failedTo: Array<{ email: string; sessionId: string; reason: string }> = [];

    for (const session of candidates as any[]) {
      const student = session.student || {};
      const tutor = session.tutor || {};
      const toEmail = String(student.payer_email || '').trim();
      if (!toEmail) {
        failed.push({ sessionId: session.id, reason: 'missing payer_email' });
        failedTo.push({ email: '', sessionId: session.id, reason: 'missing payer_email' });
        continue;
      }

      const paymentUrl = await createPaymentUrl(session.id, toEmail);
      if (!paymentUrl) {
        failed.push({ sessionId: session.id, reason: 'failed to create payment url' });
        failedTo.push({ email: toEmail, sessionId: session.id, reason: 'failed to create payment url' });
        continue;
      }

      const start = new Date(session.start_time);
      const end = new Date(session.end_time);
      const resolved = resolvePerLessonPaymentRules(
        {
          payment_model: student.payment_model,
          per_lesson_payment_timing: student.per_lesson_payment_timing,
          per_lesson_payment_deadline_hours: student.per_lesson_payment_deadline_hours,
        },
        {
          payment_timing: tutor.payment_timing ?? 'before_lesson',
          payment_deadline_hours: Number(tutor.payment_deadline_hours ?? 24),
        },
      );
      if (resolved.payment_timing !== 'after_lesson') {
        failed.push({ sessionId: session.id, reason: 'not after_lesson payment flow' });
        continue;
      }
      const payBy = new Date(end.getTime() + resolved.payment_deadline_hours * 60 * 60 * 1000);

      const ok = await sendPayerEmail({
        type: 'payment_after_lesson_reminder',
        to: toEmail,
        data: {
          studentName: student.full_name || 'Mokinys',
          tutorName: tutor.full_name || 'Korepetitorius',
          recipientName: student.payer_name || undefined,
          systemIssueNotice:
            'We apologize - due to a temporary system error, the automatic payment link was not sent on time. Below you will find an updated payment link.',
          date: start.toLocaleDateString('lt-LT', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Europe/Vilnius' }),
          time: start.toLocaleTimeString('lt-LT', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Vilnius' }),
          amount: session.price ?? 0,
          paymentLink: paymentUrl,
          payByTime: payBy.toLocaleString('lt-LT', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Vilnius' }),
        },
      });

      if (!ok) {
        failed.push({ sessionId: session.id, reason: 'email send failed' });
        failedTo.push({ email: toEmail, sessionId: session.id, reason: 'email send failed' });
        continue;
      }

      await supabase
        .from('sessions')
        .update({ payment_after_lesson_reminder_sent: true })
        .eq('id', session.id);

      sent.push(session.id);
      sentTo.push(toEmail);
    }

    const uniqueSentTo = Array.from(new Set(sentTo));

    return res.status(200).json({
      success: true,
      dryRun: false,
      processed: candidates.length,
      emailFilter: emailFilterList,
      sent: sent.length,
      failed: failed.length,
      uniquePayers: uniquePayerEmails.length,
      payerEmails: uniquePayerEmails,
      sentTo: uniqueSentTo,
      sentIds: sent,
      failedItems: failed.slice(0, 100),
      failedTo: failedTo.slice(0, 100),
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'Internal server error', message: err?.message || 'Unknown error' });
  }
}
