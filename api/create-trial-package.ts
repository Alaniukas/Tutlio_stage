// POST /api/create-trial-package
// Body: { studentId, tutorId }

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';
import { schoolInstallmentCheckoutCents } from './_lib/schoolInstallmentStripe.js';
import { marketFromRequest } from './_lib/market.js';
import { chargeCurrency, lessonCheckoutBreakdownCents, checkoutBaseMetadata, orgFeeProfile } from './_lib/marketMoney.js';
import { customerTotalEur } from './_lib/stripeLessonPricing.js';
import { publicOriginFromRequest } from './_lib/public-origin.js';
import {
  isTrialReservationFlowEnabled,
  getTrialReservationDeadlineHours,
  trialReservationExpiryIso,
  sendTrialRegistrationInvites,
} from './_lib/trialReservation.js';
import { isProKlaseOrg } from './_lib/marketMoney.js';
import { getOrgAdminAccessByUserId } from './_lib/orgAdminAccess.js';
import { hasOrgAdminPermission } from '../src/lib/orgAdminPermissions.js';

function json(res: VercelResponse, status: number, body: unknown) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  return res.status(status).send(JSON.stringify(body));
}

function getEnv(name: string): string | null {
  const v = process.env[name];
  return v && String(v).trim().length > 0 ? String(v) : null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });

  const market = marketFromRequest(req);
  const currency = chargeCurrency(market);
  const appOrigin = publicOriginFromRequest(req);

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return json(res, 401, { error: 'Unauthorized' });
  }

  const { studentId, tutorId, topic, durationMinutes, priceEur, startIso, endIso, sessionId } = req.body as {
    studentId?: string;
    tutorId?: string;
    topic?: string;
    durationMinutes?: number;
    priceEur?: number;
    /** Reservation flow: when provided (and the org has trial_reservation_flow on), the slot is held pending payment. */
    startIso?: string;
    endIso?: string;
    /** Already-created trial lesson to attach the payment package to (creation-time payment email flow). */
    sessionId?: string;
  };
  if (!studentId || !tutorId) {
    return json(res, 400, { error: 'Missing studentId or tutorId' });
  }

  try {
    const supabaseUrl = getEnv('SUPABASE_URL') || getEnv('VITE_SUPABASE_URL');
    const supabaseServiceRoleKey = getEnv('SUPABASE_SERVICE_ROLE_KEY');
    const stripeSecretKey = getEnv('STRIPE_SECRET_KEY');

    if (!supabaseUrl || !supabaseServiceRoleKey) {
      return json(res, 500, { error: 'Server configuration error', details: 'Supabase env missing' });
    }
    if (!stripeSecretKey) {
      return json(res, 500, { error: 'Server configuration error', details: 'STRIPE_SECRET_KEY is not set' });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);
    const token = authHeader.replace('Bearer ', '');
    const { data: authData, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !authData?.user) {
      return json(res, 401, { error: 'Unauthorized' });
    }

    const adminRow = await getOrgAdminAccessByUserId(supabase, authData.user.id);

    if (!adminRow || !hasOrgAdminPermission(adminRow.role, adminRow.permissions, 'students.edit')) {
      return json(res, 403, { error: 'Only the organization administrator can offer trial lessons' });
    }

    const { data: org } = await supabase
      .from('organizations')
      .select('id, name, features')
      .eq('id', adminRow.organizationId)
      .single();

    const features = (org?.features || {}) as Record<string, unknown>;
    const defaultTopic = typeof features.trial_lesson_topic === 'string' && features.trial_lesson_topic.trim()
      ? String(features.trial_lesson_topic).trim()
      : 'Bandomoji pamoka';
    const defaultDuration = typeof features.trial_lesson_duration_minutes === 'number'
      ? Math.max(15, Math.round(features.trial_lesson_duration_minutes as number))
      : 60;
    const defaultPriceEur = typeof features.trial_lesson_price_eur === 'number'
      ? Math.max(0, features.trial_lesson_price_eur as number)
      : 0;

    const trialTopic = typeof topic === 'string' && topic.trim() ? topic.trim() : defaultTopic;
    const trialDuration =
      typeof durationMinutes === 'number' && Number.isFinite(durationMinutes) ? Math.max(15, Math.round(durationMinutes)) : defaultDuration;
    const trialPriceEur =
      typeof priceEur === 'number' && Number.isFinite(priceEur) ? Math.max(0, priceEur) : defaultPriceEur;

    const { data: student, error: studentErr } = await supabase
      .from('students')
      .select('id, full_name, email, payer_email, payer_name, trial_offer_disabled')
      .eq('id', studentId)
      .single();

    if (studentErr || !student) {
      return json(res, 404, { error: 'Mokinys nerastas', details: studentErr?.message });
    }

    // trial_offer_disabled only mutes the student-card OFFER; an explicit
    // admin-created trial lesson (sessionId flow) still gets its payment email.
    if (student.trial_offer_disabled && !sessionId) {
      return json(res, 400, { error: 'Trial lesson is disabled for this student' });
    }

    let linkedSession: { id: string; paid: boolean | null } | null = null;
    if (sessionId) {
      const { data: sessionRow, error: sessionErr } = await supabase
        .from('sessions')
        .select('id, tutor_id, student_id, status, paid')
        .eq('id', sessionId)
        .maybeSingle();
      if (sessionErr || !sessionRow) {
        return json(res, 404, { error: 'Pamoka nerasta', details: sessionErr?.message });
      }
      if (sessionRow.tutor_id !== tutorId || sessionRow.student_id !== studentId || sessionRow.status !== 'active') {
        return json(res, 400, { error: 'Pamoka neatitinka mokinio ar korepetitoriaus' });
      }
      linkedSession = { id: sessionRow.id, paid: sessionRow.paid };
    }

    const { data: tutor, error: tutorErr } = await supabase
      .from('profiles')
      .select('id, full_name, organization_id, stripe_account_id, stripe_onboarding_complete')
      .eq('id', tutorId)
      .single();

    if (tutorErr || !tutor) {
      return json(res, 404, { error: 'Korepetitorius nerastas', details: tutorErr?.message });
    }

    if (tutor.organization_id !== adminRow.organizationId) {
      return json(res, 403, { error: 'You do not have permission to manage this tutor' });
    }

    let subjectId: string | null = null;
    const { data: existingTrials } = await supabase
      .from('subjects')
      .select('id, price, name')
      .eq('tutor_id', tutorId)
      .eq('is_trial', true);
    const existingTrial =
      (existingTrials || []).find((s: { name?: string | null }) =>
        String(s.name || '').toLowerCase().includes('bandom'),
      ) || (existingTrials || [])[0] ||
      null;

    if (existingTrial) {
      subjectId = existingTrial.id;
      // Keep subject aligned with latest trial defaults/overrides (name/duration/price used in UI/email)
      await supabase
        .from('subjects')
        .update({ name: trialTopic, duration_minutes: trialDuration, price: trialPriceEur })
        .eq('id', subjectId);
    } else {
      const { data: created, error: subjErr } = await supabase
        .from('subjects')
        .insert({
          tutor_id: tutorId,
          name: trialTopic,
          duration_minutes: trialDuration,
          price: trialPriceEur,
          color: '#fbbf24',
          is_trial: true,
        })
        .select('id')
        .single();
      if (subjErr || !created) {
        return json(res, 500, { error: 'Nepavyko sukurti bandomosios pamokos dalyko', details: subjErr?.message });
      }
      subjectId = created.id;
    }

    if (!subjectId) {
      return json(res, 500, { error: 'subjectId missing after create' });
    }

    const stripe = new Stripe(stripeSecretKey, { apiVersion: '2023-10-16' as any });

    const { data: orgStripe } = await supabase
      .from('organizations')
      .select('stripe_account_id, stripe_onboarding_complete, entity_type, slug')
      .eq('id', adminRow.organizationId)
      .single();

    const canTransferToOrg = Boolean(
      orgStripe?.stripe_onboarding_complete && orgStripe.stripe_account_id,
    );

    const feeProfile = orgFeeProfile((orgStripe as { slug?: string | null }).slug) ?? orgFeeProfile(adminRow.organizationId);
    // A custom org fee profile is always charged on top (payer pays the fee), even for schools.
    const useSchoolOrgAbsorbedFees = orgStripe.entity_type === 'school' && !feeProfile;

    const basePriceEur = trialPriceEur;
    const payerChargedTotalEur = useSchoolOrgAbsorbedFees ? basePriceEur : customerTotalEur(basePriceEur, feeProfile);
    const { baseCents, feesCents } = lessonCheckoutBreakdownCents(basePriceEur, market, feeProfile);
    const tutorTransferCents = baseCents;

    const { data: lessonPackage, error: packageErr } = await supabase
      .from('lesson_packages')
      .insert({
        tutor_id: tutorId,
        student_id: studentId,
        subject_id: subjectId,
        total_lessons: 1,
        available_lessons: 1,
        reserved_lessons: 0,
        completed_lessons: 0,
        price_per_lesson: trialPriceEur,
        total_price: basePriceEur,
        paid: false,
        payment_status: 'pending',
        active: false,
        payment_method: 'stripe',
      })
      .select()
      .single();

    if (packageErr || !lessonPackage) {
      return json(res, 500, { error: 'Nepavyko sukurti bandomosios pamokos paketo', details: packageErr?.message });
    }

    // Seed a one-item row so the multi-subject booking flow can still match trial packages.
    const { error: trialItemErr } = await supabase
      .from('lesson_package_items')
      .insert({
        package_id: lessonPackage.id,
        subject_id: subjectId,
        total_lessons: 1,
        available_lessons: 1,
        reserved_lessons: 0,
        completed_lessons: 0,
        price_per_lesson: trialPriceEur,
        total_price: basePriceEur,
        position: 0,
      });
    if (trialItemErr) {
      await supabase.from('lesson_packages').delete().eq('id', lessonPackage.id);
      return json(res, 500, { error: 'Nepavyko sukurti bandomosios pamokos paketo punkto', details: trialItemErr.message });
    }

    if (linkedSession) {
      // Creation-time flow: the trial lesson already exists — attach it to the
      // package so the Stripe webhook marks it paid on payment, and move the
      // trial credit available -> reserved to mirror the scheduled slot.
      const { error: linkErr } = await supabase
        .from('sessions')
        .update({ lesson_package_id: lessonPackage.id, price: trialPriceEur })
        .eq('id', linkedSession.id);
      if (linkErr) {
        await supabase.from('lesson_packages').delete().eq('id', lessonPackage.id);
        return json(res, 500, { error: 'Nepavyko susieti pamokos su paketu', details: linkErr.message });
      }
      await supabase.from('lesson_packages').update({ available_lessons: 0, reserved_lessons: 1 }).eq('id', lessonPackage.id);
      await supabase.from('lesson_package_items').update({ available_lessons: 0, reserved_lessons: 1 }).eq('package_id', lessonPackage.id);
    }

    // Reservation flow: when enabled and a slot is provided, hold the slot now
    // (status='active' so it blocks the calendar; payment_status='reserved' until
    // paid). An unpaid hold auto-releases after the org's deadline via cron.
    if (!linkedSession && isTrialReservationFlowEnabled(features) && startIso && endIso) {
      const start = new Date(startIso);
      const end = new Date(endIso);
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end.getTime() <= start.getTime()) {
        await supabase.from('lesson_packages').delete().eq('id', lessonPackage.id);
        return json(res, 400, { error: 'Netinkamas bandomosios pamokos laikas' });
      }

      const { data: conflicts } = await supabase
        .from('sessions')
        .select('id')
        .eq('tutor_id', tutorId)
        .eq('status', 'active')
        .lt('start_time', end.toISOString())
        .gt('end_time', start.toISOString())
        .limit(1);
      if (conflicts && conflicts.length > 0) {
        await supabase.from('lesson_packages').delete().eq('id', lessonPackage.id);
        return json(res, 409, { error: 'Korepetitorius šiuo metu jau turi pamoką' });
      }

      const reservationExpiresAt = trialReservationExpiryIso(getTrialReservationDeadlineHours(features));
      const { error: heldErr } = await supabase
        .from('sessions')
        .insert({
          tutor_id: tutorId,
          student_id: studentId,
          subject_id: subjectId,
          start_time: start.toISOString(),
          end_time: end.toISOString(),
          status: 'active',
          paid: false,
          payment_status: 'reserved',
          reservation_expires_at: reservationExpiresAt,
          lesson_package_id: lessonPackage.id,
          topic: trialTopic,
          price: trialPriceEur,
          created_by_role: 'org_admin',
        });
      if (heldErr) {
        await supabase.from('lesson_packages').delete().eq('id', lessonPackage.id);
        return json(res, 500, { error: 'Nepavyko rezervuoti bandomosios pamokos laiko', details: heldErr.message });
      }

      // Move the trial credit available -> reserved to match the held slot.
      await supabase.from('lesson_packages').update({ available_lessons: 0, reserved_lessons: 1 }).eq('id', lessonPackage.id);
      await supabase.from('lesson_package_items').update({ available_lessons: 0, reserved_lessons: 1 }).eq('package_id', lessonPackage.id);
    }

    const customerEmail = student.payer_email || student.email || undefined;

    // Try destination charge first; if Stripe says destination account doesn't exist,
    // gracefully fall back to charging platform account only (no transfer_data).
    let checkoutSession;
    try {
      if (!canTransferToOrg) {
        throw Object.assign(new Error('Organization Stripe is not connected'), {
          code: 'resource_missing',
          raw: { param: 'transfer_data[destination]' },
        });
      }
      if (useSchoolOrgAbsorbedFees) {
        const { chargeCents, transferToSchoolCents } = schoolInstallmentCheckoutCents(basePriceEur, market);
        const applicationFeeCents = chargeCents - transferToSchoolCents;
        if (chargeCents < 50 || applicationFeeCents < 1 || applicationFeeCents >= chargeCents) {
          return json(res, 400, { error: 'Netinkama bandomosios pamokos suma' });
        }
        checkoutSession = await stripe.checkout.sessions.create({
          mode: 'payment',
          customer_email: customerEmail || undefined,
          payment_method_types: ['card'],
          line_items: [
            {
              price_data: {
                currency,
                product_data: {
                  name: `Bandomoji pamoka – ${trialTopic}`,
                  description: `Mokymo paslaugos. Paslaugos teikėjas: ${tutor.full_name || 'Korepetitorius'}`,
                },
                unit_amount: chargeCents,
              },
              quantity: 1,
            },
          ],
          payment_intent_data: {
            application_fee_amount: applicationFeeCents,
            transfer_data: {
              destination: orgStripe.stripe_account_id,
            },
            metadata: {
              tutlio_package_id: lessonPackage.id,
              tutor_id: tutorId,
              student_id: studentId,
              subject_id: subjectId,
              is_trial: 'true',
              tutlio_school_org_absorbed: 'true',
            },
          },
          metadata: {
            tutlio_package_id: lessonPackage.id,
            tutor_id: tutorId,
            student_id: studentId,
            subject_id: subjectId,
            is_trial: 'true',
            tutlio_school_org_absorbed: 'true',
          },
          success_url: `${appOrigin}/package-success?session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${appOrigin}/package-cancelled`,
        });
      } else {
        checkoutSession = await stripe.checkout.sessions.create({
          mode: 'payment',
          customer_email: customerEmail || undefined,
          payment_method_types: ['card'],
          line_items: [
            {
              price_data: {
                currency,
                product_data: {
                  name: `Bandomoji pamoka – ${trialTopic}`,
                  description: `Mokymo paslaugos. Paslaugos teikėjas: ${tutor.full_name || 'Korepetitorius'}`,
                },
                unit_amount: baseCents,
              },
              quantity: 1,
            },
            {
              price_data: {
                currency,
                product_data: {
                  name: 'Platformos administravimo mokestis',
                  description: 'Paslaugos teikėjas: MB „Tutlio“',
                },
                unit_amount: feesCents,
              },
              quantity: 1,
            },
          ],
          payment_intent_data: {
            transfer_data: {
              destination: orgStripe.stripe_account_id,
              amount: tutorTransferCents,
            },
            metadata: {
              tutlio_package_id: lessonPackage.id,
              tutor_id: tutorId,
              student_id: studentId,
              subject_id: subjectId,
              is_trial: 'true',
            },
          },
          metadata: {
            tutlio_package_id: lessonPackage.id,
            tutor_id: tutorId,
            student_id: studentId,
            subject_id: subjectId,
            is_trial: 'true',
            ...checkoutBaseMetadata(basePriceEur, market),
          },
          success_url: `${appOrigin}/package-success?session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${appOrigin}/package-cancelled`,
        });
      }
    } catch (e: any) {
      const isMissingDestination =
        e?.code === 'resource_missing' &&
        typeof e?.raw?.param === 'string' &&
        e.raw.param.includes('transfer_data[destination]');
      if (!isMissingDestination) {
        throw e;
      }
      // Fallback: no destination — funds land in platform Stripe account
      checkoutSession = await stripe.checkout.sessions.create({
        mode: 'payment',
        customer_email: customerEmail || undefined,
        payment_method_types: ['card'],
        line_items: [
          {
            price_data: {
              currency,
              product_data: {
                name: `Bandomoji pamoka – ${trialTopic}`,
                description: `Mokymo paslaugos. Paslaugos teikėjas: ${tutor.full_name || 'Korepetitorius'}`,
              },
              unit_amount: baseCents,
            },
            quantity: 1,
          },
          {
            price_data: {
              currency,
              product_data: {
                name: 'Platformos administravimo mokestis',
                description: 'Paslaugos teikėjas: MB „Tutlio“',
              },
              unit_amount: feesCents,
            },
            quantity: 1,
          },
        ],
        metadata: {
          tutlio_package_id: lessonPackage.id,
          tutor_id: tutorId,
          student_id: studentId,
          subject_id: subjectId,
          is_trial: 'true',
          tutlio_base_eur: basePriceEur.toFixed(2),
        },
        success_url: `${appOrigin}/package-success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${appOrigin}/package-cancelled`,
      });
    }

    await supabase
      .from('lesson_packages')
      .update({ stripe_checkout_session_id: checkoutSession.id, total_price: payerChargedTotalEur })
      .eq('id', lessonPackage.id);

    // Send email to payer with trial payment link.
    // Use stable /api/pay-package redirect so the link never expires.
    const stableTrialPaymentLink = `${appOrigin}/api/pay-package?package=${lessonPackage.id}`;
    const toEmail = (customerEmail || '').trim();
    if (toEmail && (checkoutSession.url || checkoutSession.id)) {
      const requestOrigin = req.headers.origin ? String(req.headers.origin) : null;
      const sendEmailUrl = `${requestOrigin || appOrigin}/api/send-email`;
      void fetch(sendEmailUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-internal-key': process.env.SUPABASE_SERVICE_ROLE_KEY || '' },
        body: JSON.stringify({
          type: 'prepaid_package_request',
          to: toEmail,
          data: {
            recipientName: student.payer_name || student.full_name,
            studentName: student.full_name,
            tutorName: org?.name || tutor.full_name || 'Korepetitorius',
            subjectName: trialTopic,
            totalLessons: 1,
            pricePerLesson: trialPriceEur.toFixed(2),
            totalPrice: payerChargedTotalEur.toFixed(2),
            paymentLink: stableTrialPaymentLink,
            ...((tutor as any).organization_id ? { organizationId: (tutor as any).organization_id } : {}),
          },
        }),
      })
        .then(async (r) => {
          if (!r.ok) {
            const txt = await r.text().catch(() => '');
            console.error('[create-trial-package] Failed to send prepaid_package_request email:', r.status, txt);
          }
        })
        .catch((e) => console.error('[create-trial-package] Error calling /api/send-email (stripe):', e));
    }

    const trialOrgId = (tutor as { organization_id?: string | null }).organization_id || adminRow.organizationId;
    if (isProKlaseOrg(trialOrgId)) {
      await sendTrialRegistrationInvites(supabase, {
        appUrl: appOrigin,
        studentId,
        tutorName: tutor.full_name,
      }).catch((e) => console.error('[create-trial-package] registration invite failed', e));
    }

    return json(res, 200, { success: true, mode: 'stripe', url: checkoutSession.url, packageId: lessonPackage.id });
  } catch (err: any) {
    console.error('create-trial-package error:', err);
    return json(res, 500, { error: 'Internal Server Error', details: err?.message || String(err) });
  }
}
