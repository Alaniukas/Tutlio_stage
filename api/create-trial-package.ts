// POST /api/create-trial-package
// Body: { studentId, tutorId }

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';
import { schoolInstallmentCheckoutCents } from './_lib/schoolInstallmentStripe.js';

// Stripe/platform fee helpers (inlined to avoid _lib import issues on Vercel)
const STRIPE_FEE_PERCENT = 0.015;
const STRIPE_FEE_FIXED_EUR = 0.25;
const PLATFORM_FEE_PERCENT = 0.02;

function customerTotalEur(basePriceEur: number): number {
  const platformFeeEur = basePriceEur * PLATFORM_FEE_PERCENT;
  return (basePriceEur + platformFeeEur + STRIPE_FEE_FIXED_EUR) / (1 - STRIPE_FEE_PERCENT);
}

function lessonCheckoutBreakdownCents(basePriceEur: number): { baseCents: number; feesCents: number } {
  const totalEur = customerTotalEur(basePriceEur);
  const totalCents = Math.round(totalEur * 100);
  const baseCents = Math.round(basePriceEur * 100);
  const feesCents = totalCents - baseCents;
  return { baseCents, feesCents };
}

function json(res: VercelResponse, status: number, body: unknown) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  return res.status(status).send(JSON.stringify(body));
}

function getEnv(name: string): string | null {
  const v = process.env[name];
  return v && String(v).trim().length > 0 ? String(v) : null;
}

const APP_URL = process.env.APP_URL || process.env.VITE_APP_URL || 'https://tutlio.lt';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return json(res, 401, { error: 'Unauthorized' });
  }

  const { studentId, tutorId, topic, durationMinutes, priceEur } = req.body as {
    studentId?: string;
    tutorId?: string;
    topic?: string;
    durationMinutes?: number;
    priceEur?: number;
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

    const { data: adminRow } = await supabase
      .from('organization_admins')
      .select('organization_id')
      .eq('user_id', authData.user.id)
      .maybeSingle();

    if (!adminRow) {
      return json(res, 403, { error: 'Only the organization administrator can offer trial lessons' });
    }

    const { data: org } = await supabase
      .from('organizations')
      .select('id, name, features')
      .eq('id', adminRow.organization_id)
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

    if (student.trial_offer_disabled) {
      return json(res, 400, { error: 'Trial lesson is disabled for this student' });
    }

    const { data: tutor, error: tutorErr } = await supabase
      .from('profiles')
      .select('id, full_name, organization_id, stripe_account_id, stripe_onboarding_complete')
      .eq('id', tutorId)
      .single();

    if (tutorErr || !tutor) {
      return json(res, 404, { error: 'Korepetitorius nerastas', details: tutorErr?.message });
    }

    if (tutor.organization_id !== adminRow.organization_id) {
      return json(res, 403, { error: 'You do not have permission to manage this tutor' });
    }

    let subjectId: string | null = null;
    const { data: existingTrial } = await supabase
      .from('subjects')
      .select('id, price')
      .eq('tutor_id', tutorId)
      .eq('is_trial', true)
      .maybeSingle();

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
      .select('stripe_account_id, stripe_onboarding_complete, entity_type')
      .eq('id', adminRow.organization_id)
      .single();

    if (!orgStripe?.stripe_onboarding_complete) {
      return json(res, 400, { error: 'Organization Stripe account is not connected' });
    }

    const useSchoolOrgAbsorbedFees = orgStripe.entity_type === 'school';

    const basePriceEur = trialPriceEur;
    const payerChargedTotalEur = useSchoolOrgAbsorbedFees ? basePriceEur : customerTotalEur(basePriceEur);
    const { baseCents, feesCents } = lessonCheckoutBreakdownCents(basePriceEur);
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

    const customerEmail = student.payer_email || student.email || undefined;

    // Try destination charge first; if Stripe says destination account doesn't exist,
    // gracefully fall back to charging platform account only (no transfer_data).
    let checkoutSession;
    try {
      if (useSchoolOrgAbsorbedFees) {
        const { chargeCents, transferToSchoolCents } = schoolInstallmentCheckoutCents(basePriceEur);
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
                currency: 'eur',
                product_data: {
                  name: `Bandomoji pamoka – ${trialTopic}`,
                  description: `Trial lesson – ${tutor.full_name || 'tutor'}`,
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
          success_url: `${APP_URL}/package-success?session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${APP_URL}/package-cancelled`,
        });
      } else {
        checkoutSession = await stripe.checkout.sessions.create({
          mode: 'payment',
          customer_email: customerEmail || undefined,
          payment_method_types: ['card'],
          line_items: [
            {
              price_data: {
                currency: 'eur',
                product_data: {
                  name: `Bandomoji pamoka – ${trialTopic}`,
                  description: `Trial lesson – ${tutor.full_name || 'tutor'}`,
                },
                unit_amount: baseCents,
              },
              quantity: 1,
            },
            {
              price_data: {
                currency: 'eur',
                product_data: {
                  name: 'Platformos administravimo mokestis',
                  description: 'Tutlio platform fee and payment processing',
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
          },
          success_url: `${APP_URL}/package-success?session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${APP_URL}/package-cancelled`,
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
              currency: 'eur',
              product_data: {
                name: `Bandomoji pamoka – ${trialTopic}`,
                description: `Trial lesson – ${tutor.full_name || 'tutor'}`,
              },
              unit_amount: baseCents,
            },
            quantity: 1,
          },
          {
            price_data: {
              currency: 'eur',
              product_data: {
                name: 'Platformos administravimo mokestis',
                description: 'Tutlio platform fee and payment processing',
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
        },
        success_url: `${APP_URL}/package-success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${APP_URL}/package-cancelled`,
      });
    }

    await supabase
      .from('lesson_packages')
      .update({ stripe_checkout_session_id: checkoutSession.id, total_price: payerChargedTotalEur })
      .eq('id', lessonPackage.id);

    // Send email to payer with trial payment link (same template as prepaid packages)
    const toEmail = (customerEmail || '').trim();
    if (toEmail && checkoutSession.url) {
      const requestOrigin = req.headers.origin ? String(req.headers.origin) : null;
      const sendEmailUrl = `${requestOrigin || APP_URL}/api/send-email`;
      // Important: don't block the request; email sending can be slow.
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
            paymentLink: checkoutSession.url,
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

    return json(res, 200, { success: true, mode: 'stripe', url: checkoutSession.url, packageId: lessonPackage.id });
  } catch (err: any) {
    console.error('create-trial-package error:', err);
    return json(res, 500, { error: 'Internal Server Error', details: err?.message || String(err) });
  }
}

