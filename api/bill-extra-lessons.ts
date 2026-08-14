// GET|POST /api/bill-extra-lessons (cron, 1st of month)
//
// Org feature extra_lessons_billing (dynamic-pricing month rules): lessons
// delivered last month OUTSIDE any package (increased frequency, one-offs,
// schedules added mid-month) are billed per-unit as one "extra lessons"
// package per (tutor, student) and the payer gets a payment email + S.F.
// Rate per subject = last month's package price_per_lesson for that subject,
// falling back to the org's dynamic price. From the next month new schedules
// fold into the regular monthly package, so extras stay a one-off catch-up.
//
// Double-billing guards: extras_period_start partial unique index (one
// non-cancelled extras package per tutor/student/month) + linking the billed
// sessions to the package removes them from future sweeps.

import type { VercelRequest, VercelResponse } from './types';
import { createClient } from '@supabase/supabase-js';
import { requireCronAuth } from './_lib/cronAuth.js';
import { resolveOrganizationLessonPrice } from '../src/lib/organizationDynamicPricing.js';
import { getOrgOwnerUserId } from './_lib/orgAdminAccess.js';

function ymdInVilnius(value = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Vilnius',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(value);
}

function apiOrigin(req: VercelRequest): string {
  const vercelUrl = String(process.env.VERCEL_URL || '').replace(/^https?:\/\//, '').replace(/\/$/, '');
  if (vercelUrl) return `https://${vercelUrl}`;
  const origin = typeof req.headers.origin === 'string' ? req.headers.origin.replace(/\/$/, '') : '';
  return origin || String(process.env.APP_URL || process.env.VITE_APP_URL || 'http://127.0.0.1:3002').replace(/\/$/, '');
}

async function postJsonWithTimeout(url: string, payload: unknown, timeoutMs = 20000) {
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
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!requireCronAuth(req, res)) return;

  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!supabaseUrl || !serviceRoleKey) {
    return res.status(500).json({ error: 'Missing Supabase server configuration' });
  }
  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const origin = apiOrigin(req);

  // Previous calendar month (Vilnius).
  const todayYmd = ymdInVilnius();
  const [ty, tm] = todayYmd.split('-').map(Number);
  const prevMonth = tm === 1 ? 12 : tm - 1;
  const prevYear = tm === 1 ? ty - 1 : ty;
  const periodStart = `${prevYear}-${String(prevMonth).padStart(2, '0')}-01`;
  const currentMonthStart = `${ty}-${String(tm).padStart(2, '0')}-01`;
  const periodEnd = `${prevYear}-${String(prevMonth).padStart(2, '0')}-${String(new Date(prevYear, prevMonth, 0).getDate()).padStart(2, '0')}`;

  // Orgs that opted into extras billing.
  const { data: orgs, error: orgErr } = await supabase
    .from('organizations')
    .select('id, features')
    .contains('features', { extra_lessons_billing: true });
  if (orgErr) return res.status(500).json({ error: orgErr.message });
  const orgList = orgs || [];
  if (orgList.length === 0) return res.status(200).json({ success: true, billed: 0, skipped: 0 });

  const orgIds = orgList.map((o: any) => o.id as string);
  const manualByOrg = new Map<string, boolean>(
    orgList.map((o: any) => {
      const feat = (o.features && typeof o.features === 'object' && !Array.isArray(o.features) ? o.features : {}) as Record<string, unknown>;
      return [o.id as string, feat.manual_payments === true || feat.enable_manual_student_payments === true];
    }),
  );

  const { data: tutors } = await supabase
    .from('profiles')
    .select('id, organization_id')
    .in('organization_id', orgIds);
  const orgByTutor = new Map((tutors || []).map((t: any) => [t.id as string, t.organization_id as string]));
  const tutorIds = [...orgByTutor.keys()];
  if (tutorIds.length === 0) return res.status(200).json({ success: true, billed: 0, skipped: 0 });

  // Last month's unpackaged, unpaid, occurred lessons.
  const { data: candidates, error: sessErr } = await supabase
    .from('sessions')
    .select('id, tutor_id, student_id, subject_id, start_time, price, status, paid, payment_status, lesson_package_id, payment_batch_id, subjects(name, is_trial, is_group)')
    .in('tutor_id', tutorIds)
    .gte('start_time', `${periodStart}T00:00:00`)
    .lt('start_time', `${currentMonthStart}T00:00:00`)
    .in('status', ['completed', 'active'])
    .eq('paid', false)
    .is('lesson_package_id', null)
    .is('payment_batch_id', null)
    .limit(2000);
  if (sessErr) return res.status(500).json({ error: sessErr.message });

  const billable = (candidates || []).filter((s: any) => {
    const subj = Array.isArray(s.subjects) ? s.subjects[0] : s.subjects;
    if (!s.subject_id || subj?.is_trial === true || subj?.is_group === true) return false;
    const ps = String(s.payment_status || 'pending');
    if (ps !== 'pending') return false;
    // Only occurred lessons: active-but-future rows are not yet deliverable work.
    return new Date(s.start_time).getTime() < Date.now();
  });

  // Group per (tutor, student).
  const byPair = new Map<string, any[]>();
  for (const s of billable) {
    const key = `${s.tutor_id}|${s.student_id}`;
    const arr = byPair.get(key) ?? [];
    arr.push(s);
    byPair.set(key, arr);
  }

  let billed = 0;
  let skipped = 0;
  const failures: Array<{ pair: string; error: string }> = [];

  for (const [pairKey, pairSessions] of byPair) {
    const [tutorId, studentId] = pairKey.split('|');
    const orgId = orgByTutor.get(tutorId)!;
    try {
      // Unique-index guard (also skip when a cancelled-then-recreated race left one).
      const { data: existingExtras } = await supabase
        .from('lesson_packages')
        .select('id')
        .eq('tutor_id', tutorId)
        .eq('student_id', studentId)
        .eq('extras_period_start', periodStart)
        .neq('payment_status', 'cancelled')
        .maybeSingle();
      if (existingExtras) {
        skipped += 1;
        continue;
      }

      const [{ data: student }, { data: monthPackages }, { data: rules }, { data: indivRows }] = await Promise.all([
        supabase
          .from('students')
          .select('id, full_name, email, payer_email, payer_name, grade, pricing_lessons_per_week, detached_at')
          .eq('id', studentId)
          .maybeSingle(),
        supabase
          .from('lesson_packages')
          .select('id, billing_period_start, lesson_package_items(subject_id, price_per_lesson)')
          .eq('tutor_id', tutorId)
          .eq('student_id', studentId)
          .eq('billing_period_start', periodStart),
        supabase
          .from('organization_dynamic_pricing')
          .select('grade_min, grade_max, lessons_per_week, price')
          .eq('organization_id', orgId),
        supabase
          .from('student_individual_pricing')
          .select('subject_id, price')
          .eq('student_id', studentId),
      ]);
      if (!student) {
        skipped += 1;
        continue;
      }

      // Rate per subject: that month's package tier first, dynamic price fallback.
      const packageRateBySubject = new Map<string, number>();
      for (const pkg of monthPackages || []) {
        const items = Array.isArray((pkg as any).lesson_package_items) ? (pkg as any).lesson_package_items : [];
        for (const item of items) {
          if (item.subject_id && !packageRateBySubject.has(item.subject_id)) {
            packageRateBySubject.set(item.subject_id as string, Number(item.price_per_lesson) || 0);
          }
        }
      }
      const indivBySubject = new Map((indivRows || []).map((r: any) => [r.subject_id as string, Number(r.price)]));
      const normalizedRules = (rules || []).map((rule: any) => ({
        ...rule,
        grade_min: Number(rule.grade_min),
        grade_max: Number(rule.grade_max),
        lessons_per_week: Number(rule.lessons_per_week),
        price: Number(rule.price),
      }));

      type ExtrasItem = { subjectId: string; subjectName: string; count: number; pricePerLesson: number; sessionIds: string[] };
      const itemsBySubject = new Map<string, ExtrasItem>();
      for (const s of pairSessions) {
        const subj = Array.isArray(s.subjects) ? s.subjects[0] : s.subjects;
        const subjectId = s.subject_id as string;
        let entry = itemsBySubject.get(subjectId);
        if (!entry) {
          const packageRate = packageRateBySubject.get(subjectId);
          const pricePerLesson = packageRate && packageRate > 0
            ? packageRate
            : resolveOrganizationLessonPrice({
                rules: normalizedRules,
                student: {
                  grade: student.grade == null ? null : String(student.grade),
                  pricing_lessons_per_week: student.pricing_lessons_per_week,
                },
                lessonsPerWeek: student.pricing_lessons_per_week ?? undefined,
                individualPrice: indivBySubject.get(subjectId) ?? null,
                fallbackPrice: Number(s.price || 0),
              });
          entry = {
            subjectId,
            subjectName: (subj?.name as string) || 'Pamoka',
            count: 0,
            pricePerLesson,
            sessionIds: [],
          };
          itemsBySubject.set(subjectId, entry);
        }
        entry.count += 1;
        entry.sessionIds.push(s.id as string);
      }
      const items = [...itemsBySubject.values()].filter((it) => it.count > 0 && it.pricePerLesson > 0);
      if (items.length === 0) {
        skipped += 1;
        continue;
      }

      const totalLessons = items.reduce((n, it) => n + it.count, 0);
      const totalPrice = Math.round(items.reduce((sum, it) => sum + it.count * it.pricePerLesson, 0) * 100) / 100;
      const manual = manualByOrg.get(orgId) === true;

      const { data: extrasPkg, error: pkgErr } = await supabase
        .from('lesson_packages')
        .insert({
          tutor_id: tutorId,
          student_id: studentId,
          subject_id: items[0]!.subjectId,
          total_lessons: totalLessons,
          available_lessons: 0,
          reserved_lessons: 0,
          completed_lessons: totalLessons,
          price_per_lesson: Math.round((totalPrice / totalLessons) * 100) / 100,
          total_price: totalPrice,
          paid: false,
          payment_status: 'pending',
          active: false,
          payment_method: manual ? 'manual' : 'stripe',
          extras_period_start: periodStart,
          billing_period_start: periodStart,
          billing_period_end: periodEnd,
        })
        .select('id')
        .single();
      if (pkgErr || !extrasPkg) {
        // Unique violation = concurrent run already billed the pair.
        if (String(pkgErr?.message || '').toLowerCase().includes('duplicate')) skipped += 1;
        else failures.push({ pair: pairKey, error: pkgErr?.message || 'insert failed' });
        continue;
      }

      const { error: itemsErr } = await supabase.from('lesson_package_items').insert(
        items.map((it, idx) => ({
          package_id: extrasPkg.id,
          subject_id: it.subjectId,
          total_lessons: it.count,
          available_lessons: 0,
          reserved_lessons: 0,
          completed_lessons: it.count,
          price_per_lesson: it.pricePerLesson,
          total_price: Math.round(it.count * it.pricePerLesson * 100) / 100,
          position: idx,
        })),
      );
      if (itemsErr) {
        await supabase.from('lesson_packages').delete().eq('id', extrasPkg.id);
        failures.push({ pair: pairKey, error: itemsErr.message });
        continue;
      }

      // Link the billed lessons: removes them from future sweeps and lets the
      // Stripe webhook mark them paid when the package is paid.
      const sessionIds = items.flatMap((it) => it.sessionIds);
      const { error: linkErr } = await supabase
        .from('sessions')
        .update({ lesson_package_id: extrasPkg.id })
        .in('id', sessionIds);
      if (linkErr) {
        await supabase.from('lesson_package_items').delete().eq('package_id', extrasPkg.id);
        await supabase.from('lesson_packages').delete().eq('id', extrasPkg.id);
        failures.push({ pair: pairKey, error: linkErr.message });
        continue;
      }

      // S.F. for the extras (detailed line items include child + dates).
      let invoicePdfBase64: string | null = null;
      let invoiceNumber: string | null = null;
      try {
        const ownerUserId = await getOrgOwnerUserId(supabase, orgId);
        if (ownerUserId) {
          const invRes = await postJsonWithTimeout(`${origin}/api/generate-invoice`, {
            periodStart,
            periodEnd,
            groupingType: 'single',
            tutorId,
            studentId,
            packageIds: [extrasPkg.id],
            allowPendingStripePackages: true,
            issuedByUserId: ownerUserId,
          });
          if (invRes.ok) {
            const invData = (await invRes.json().catch(() => null)) as any;
            const invId = invData?.invoiceIds?.[0];
            if (invId) {
              const { data: inv } = await supabase
                .from('invoices')
                .select('invoice_number, pdf_storage_path')
                .eq('id', invId)
                .single();
              if (inv?.pdf_storage_path) {
                invoiceNumber = inv.invoice_number as string;
                const { data: blob } = await supabase.storage.from('invoices').download(inv.pdf_storage_path);
                if (blob) {
                  invoicePdfBase64 = Buffer.from(await blob.arrayBuffer()).toString('base64');
                }
              }
            }
          }
        }
      } catch (invErr) {
        console.error('[bill-extra-lessons] invoice generation failed:', invErr);
      }

      // Payment email with the stable pay link.
      const toEmail = (student.payer_email || student.email || '').trim();
      if (toEmail) {
        const monthLabel = `${prevYear}-${String(prevMonth).padStart(2, '0')}`;
        const emailPayload: Record<string, unknown> = {
          type: 'prepaid_package_request',
          to: toEmail,
          data: {
            recipientName: student.payer_name || student.full_name,
            studentName: student.full_name,
            tutorName: '',
            subjectName: `Papildomos pamokos (${monthLabel})`,
            totalLessons,
            pricePerLesson: (totalPrice / totalLessons).toFixed(2),
            totalPrice: totalPrice.toFixed(2),
            paymentLink: `${origin}/api/pay-package?package=${extrasPkg.id}`,
            organizationId: orgId,
          },
        };
        if (invoicePdfBase64 && invoiceNumber) {
          emailPayload.attachments = [{ filename: `${invoiceNumber}.pdf`, content: invoicePdfBase64 }];
        }
        try {
          const emailRes = await postJsonWithTimeout(`${origin}/api/send-email`, emailPayload, 15000);
          if (!emailRes.ok) {
            console.error('[bill-extra-lessons] email send failed:', emailRes.status, await emailRes.text().catch(() => ''));
          }
        } catch (emailErr) {
          console.error('[bill-extra-lessons] email send failed:', emailErr);
        }
      }

      billed += 1;
    } catch (err) {
      failures.push({ pair: pairKey, error: err instanceof Error ? err.message : String(err) });
    }
  }

  return res.status(failures.length > 0 ? 207 : 200).json({
    success: failures.length === 0,
    periodStart,
    periodEnd,
    billed,
    skipped,
    failures,
  });
}
