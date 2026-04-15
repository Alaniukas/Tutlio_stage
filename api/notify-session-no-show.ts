// POST /api/notify-session-no-show — notifies the student's payer (parent) when a session is marked as no-show.
// Uses service role; called from tutor UI after successful status=no_show update.

import type { VercelRequest, VercelResponse } from './types';
import { createClient } from '@supabase/supabase-js';
import { format } from 'date-fns';
import { verifyRequestAuth } from './_lib/auth.js';

async function sendEmail(body: object) {
    const baseUrl = process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : 'http://localhost:3000';
    try {
        await fetch(`${baseUrl}/api/send-email`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-internal-key': process.env.SUPABASE_SERVICE_ROLE_KEY || '' },
            body: JSON.stringify(body),
        });
    } catch (e) {
        console.error('[notify-session-no-show] sendEmail error:', e);
    }
}

async function sendEmailWithTimeout(body: object, timeoutMs = 2500) {
    return await Promise.race([
        sendEmail(body),
        new Promise((resolve) => setTimeout(resolve, timeoutMs)),
    ]);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const auth = await verifyRequestAuth(req);
    if (!auth) return res.status(401).json({ error: 'Unauthorized' });

    const { sessionId } = req.body as { sessionId?: string };
    if (!sessionId) {
        return res.status(400).json({ error: 'Missing sessionId' });
    }

    const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
    if (!supabaseUrl || !supabaseKey) {
        return res.status(500).json({ error: 'Missing Supabase env vars' });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: session, error: sessionError } = await supabase
        .from('sessions')
        .select('id, status, start_time, end_time, student_id, tutor_id')
        .eq('id', sessionId)
        .maybeSingle();

    if (sessionError || !session) {
        console.error('[notify-session-no-show] session load:', sessionError);
        return res.status(404).json({ error: 'Session not found' });
    }

    if (session.status !== 'no_show') {
        return res.status(400).json({ error: 'Session is not marked as no-show' });
    }

    // Don't send no-show notification to parents until the lesson time window has ended
    // (org admin may pre-mark a future session without a misleading email).
    const lessonEnded = new Date(session.end_time).getTime() <= Date.now();
    if (!lessonEnded) {
        return res.status(200).json({ success: true, skipped: true, reason: 'lesson_not_finished' });
    }

    const { data: student } = await supabase
        .from('students')
        .select('full_name, email, payer_email')
        .eq('id', session.student_id)
        .maybeSingle();

    const { data: tutor } = await supabase
        .from('profiles')
        .select('full_name, email')
        .eq('id', session.tutor_id)
        .maybeSingle();

    const payerRaw = (student?.payer_email || '').trim();
    if (!payerRaw) {
        return res.status(200).json({ success: true, skipped: true });
    }

    const emailDate = format(new Date(session.start_time), 'yyyy-MM-dd');
    const emailTime = format(new Date(session.start_time), 'HH:mm');

    void sendEmailWithTimeout({
        type: 'session_student_no_show',
        to: payerRaw,
        data: {
            studentName: student?.full_name || 'Mokinys',
            tutorName: tutor?.full_name || 'Korepetitorius',
            tutorEmail: tutor?.email || '',
            date: emailDate,
            time: emailTime,
        },
    }, 1500);

    return res.status(200).json({ success: true });
}
