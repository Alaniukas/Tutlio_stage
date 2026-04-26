// ─── Vercel Serverless: Confirm Manual Package Payment ────────────────────────
// POST /api/confirm-manual-payment
// Body: { packageId: string }
// Individual tutor confirms they received the payment — activates the package.

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { syncSessionToGoogle } from './_lib/google-calendar.js';

const supabase = createClient(
    process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const APP_URL = process.env.APP_URL || process.env.VITE_APP_URL || 'https://tutlio.lt';

async function postJsonWithTimeout(url: string, payload: unknown, timeoutMs = 7000) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
        return await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-internal-key': process.env.SUPABASE_SERVICE_ROLE_KEY || '' },
            body: JSON.stringify(payload),
            signal: controller.signal,
        });
    } finally {
        clearTimeout(timeout);
    }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    try {
        const { packageId } = req.body as { packageId?: string };
        if (!packageId) return res.status(400).json({ error: 'packageId is required' });

        const authHeader = req.headers.authorization;
        if (!authHeader?.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        const token = authHeader.replace('Bearer ', '');
        const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
        if (authErr || !user) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const { data: pkg, error: fetchErr } = await supabase
            .from('lesson_packages')
            .select('*, students(full_name, email, payer_email, payer_name), subjects(name)')
            .eq('id', packageId)
            .single();

        if (fetchErr || !pkg) {
            return res.status(404).json({ error: 'Paketas nerastas', details: fetchErr?.message });
        }

        if (user.id !== pkg.tutor_id) {
            return res.status(403).json({ error: 'Only the tutor can confirm manual payments' });
        }

        if (pkg.payment_method !== 'manual') {
            return res.status(400).json({ error: 'This package is not a manual payment' });
        }

        if (pkg.paid) {
            // Idempotency: also ensure any pre-created sessions tied to this package are marked paid.
            await supabase
                .from('sessions')
                .update({ paid: true, payment_status: 'paid' })
                .eq('lesson_package_id', pkg.id)
                .eq('paid', false);

            return res.status(200).json({
                success: true,
                packageId: pkg.id,
                availableLessons: pkg.available_lessons,
                totalLessons: pkg.total_lessons,
                alreadyConfirmed: true,
            });
        }

        const { data: updated, error: updateErr } = await supabase
            .from('lesson_packages')
            .update({
                paid: true,
                payment_status: 'paid',
                active: true,
                paid_at: new Date().toISOString(),
            })
            .eq('id', packageId)
            .eq('paid', false)
            .select('*, students(full_name, email, payer_email, payer_name), subjects(name)')
            .maybeSingle();

        if (updateErr) {
            return res.status(500).json({ error: 'Nepavyko aktyvuoti paketo', details: updateErr.message });
        }
        if (!updated) {
            const { data: current } = await supabase.from('lesson_packages').select('id, available_lessons, total_lessons').eq('id', packageId).single();
            return res.status(200).json({ success: true, packageId, availableLessons: current?.available_lessons, totalLessons: current?.total_lessons, alreadyConfirmed: true });
        }

        // If there are pre-created sessions tied to this package (e.g. trial),
        // mark them paid so UI stops showing "awaiting payment".
        const { data: paidSessions } = await supabase
            .from('sessions')
            .update({ paid: true, payment_status: 'paid' })
            .eq('lesson_package_id', packageId)
            .eq('paid', false)
            .select('id, tutor_id');
        for (const ps of paidSessions || []) {
            syncSessionToGoogle(ps.id, ps.tutor_id).catch(() => {});
        }

        const student = (updated as any).students || {};
        const subject = (updated as any).subjects || {};

        const recipients = new Map<string, string>();
        if (student.payer_email) {
            recipients.set(student.payer_email, student.payer_name || student.full_name || 'Kliente');
        }
        if (student.email && student.email !== student.payer_email) {
            recipients.set(student.email, student.full_name || 'Mokinys');
        }

        const requestOrigin = req.headers.origin ? String(req.headers.origin) : null;
        const sendEmailUrl = `${requestOrigin || APP_URL}/api/send-email`;

        const emailJobs = [...recipients.entries()].map(([email, recipientName]) =>
            postJsonWithTimeout(sendEmailUrl, {
                type: 'manual_package_confirmed',
                to: email,
                data: {
                    recipientName,
                    studentName: student.full_name,
                    subjectName: subject.name,
                    availableLessons: updated.available_lessons,
                    totalLessons: updated.total_lessons,
                    totalPrice: Number(updated.total_price || 0).toFixed(2),
                },
            }).catch((e) => {
                console.error('[confirm-manual-payment] Email send failed:', e);
                return null;
            }),
        );
        await Promise.allSettled(emailJobs);

        return res.status(200).json({
            success: true,
            packageId: updated.id,
            availableLessons: updated.available_lessons,
            totalLessons: updated.total_lessons,
            subjectName: subject.name,
        });
    } catch (err: any) {
        console.error('[confirm-manual-payment] Error:', err);
        return res.status(500).json({ error: err?.message || 'Internal Server Error' });
    }
}
