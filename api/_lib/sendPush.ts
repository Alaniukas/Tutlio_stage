import webpush from 'web-push';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { t } from './i18n.js';

const VAPID_PUBLIC = process.env.VAPID_PUBLIC_KEY || '';
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY || '';
const VAPID_EMAIL = process.env.VAPID_EMAIL || 'mailto:info@tutlio.lt';

if (VAPID_PUBLIC && VAPID_PRIVATE) {
  webpush.setVapidDetails(VAPID_EMAIL, VAPID_PUBLIC, VAPID_PRIVATE);
}

interface PushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
}

const PUSH_ELIGIBLE: Record<string, (data: any, locale: string) => PushPayload | null> = {
  session_reminder: (d, locale) => ({
    title: d.isTutor
      ? t(locale, 'push.session_reminder.title_tutor')
      : t(locale, 'push.session_reminder.title_student'),
    body: t(locale, 'push.session_reminder.body', {
      date: d.date,
      time: d.time,
      otherName: d.otherName || d.topic || '',
    }),
    url: d.isTutor ? '/dashboard' : '/student/sessions',
    tag: `reminder-${d.date}-${d.time}`,
  }),
  session_reminder_payer: (d, locale) => ({
    title: t(locale, 'push.session_reminder_payer.title'),
    body: t(locale, 'push.session_reminder_payer.body', {
      studentName: d.studentName,
      date: d.date,
      time: d.time,
    }),
    url: '/student/sessions',
    tag: `reminder-payer-${d.date}-${d.time}`,
  }),
  booking_confirmation: (d, locale) => ({
    title: t(locale, 'push.booking_confirmation.title'),
    body: t(locale, 'push.booking_confirmation.body', {
      date: d.date,
      time: d.time,
      tutorName: d.tutorName,
    }),
    url: '/student/sessions',
    tag: `booking-${d.date}-${d.time}`,
  }),
  booking_notification: (d, locale) => ({
    title: t(locale, 'push.booking_notification.title'),
    body: t(locale, 'push.booking_notification.body', {
      studentName: d.studentName,
      date: d.date,
      time: d.time,
    }),
    url: '/dashboard',
    tag: `booking-notif-${d.date}-${d.time}`,
  }),
  session_cancelled: (d, locale) => ({
    title: t(locale, 'push.session_cancelled.title'),
    body: t(locale, 'push.session_cancelled.body', {
      date: d.date,
      time: d.time,
      studentName: d.studentName,
      tutorName: d.tutorName,
    }),
    url: '/dashboard',
    tag: `cancel-${d.date}-${d.time}`,
  }),
  session_cancelled_parent: (d, locale) => ({
    title: t(locale, 'push.session_cancelled_parent.title'),
    body: t(locale, 'push.session_cancelled_parent.body', {
      studentName: d.studentName,
      date: d.date,
    }),
    url: '/student/sessions',
    tag: `cancel-parent-${d.date}-${d.time}`,
  }),
  lesson_rescheduled: (d, locale) => ({
    title: t(locale, 'push.lesson_rescheduled.title'),
    body: t(locale, 'push.lesson_rescheduled.body', {
      newDate: d.newDate,
      newTime: d.newTime,
    }),
    url: '/dashboard',
    tag: `reschedule-${d.newDate}-${d.newTime}`,
  }),
  chat_new_message: (d, locale) => ({
    title: t(locale, 'push.chat_new_message.title', {
      senderName: d.senderName || 'Tutlio',
    }),
    body: d.preview || t(locale, 'push.chat_new_message.fallback_body'),
    url: d.messagesUrl || '/messages',
    tag: `chat-${d.senderName}`,
  }),
  waitlist_matched_student: (d, locale) => ({
    title: t(locale, 'push.waitlist_matched_student.title'),
    body: t(locale, 'push.waitlist_matched_student.body', {
      date: d.date,
      time: d.time,
      tutorName: d.tutorName,
    }),
    url: '/student/sessions',
    tag: `waitlist-${d.date}-${d.time}`,
  }),
  waitlist_matched_tutor: (d, locale) => ({
    title: t(locale, 'push.waitlist_matched_tutor.title'),
    body: t(locale, 'push.waitlist_matched_tutor.body', {
      studentName: d.studentName,
      date: d.date,
    }),
    url: '/dashboard',
    tag: `waitlist-tutor-${d.date}`,
  }),
  payment_review_needed: (d, locale) => ({
    title: t(locale, 'push.payment_review_needed.title'),
    body: t(locale, 'push.payment_review_needed.body', {
      studentName: d.studentName,
      date: d.date,
    }),
    url: '/dashboard',
    tag: `pay-review-${d.date}`,
  }),
  payment_reminder: (d, locale) => ({
    title: t(locale, 'push.payment_reminder.title'),
    body: t(locale, 'push.payment_reminder.body', {
      price: d.price,
      date: d.date,
      time: d.time,
    }),
    url: '/student/sessions',
    tag: `pay-remind-${d.date}`,
  }),
  payment_after_lesson_reminder: (d, locale) => ({
    title: t(locale, 'push.payment_after_lesson_reminder.title'),
    body: t(locale, 'push.payment_after_lesson_reminder.body', {
      amount: d.amount,
      tutorName: d.tutorName,
    }),
    url: '/student/sessions',
    tag: `pay-after-${d.date}`,
  }),
};

function serviceSupabase(): SupabaseClient | null {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!supabaseUrl || !serviceKey) return null;
  return createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function absolutePayloadUrl(payload: PushPayload): string {
  const appUrl = (process.env.APP_URL || process.env.VITE_APP_URL || 'https://tutlio.lt').replace(/\/$/, '');
  const u = payload.url || '/';
  if (u.startsWith('http')) return u;
  return `${appUrl}${u.startsWith('/') ? u : `/${u}`}`;
}

async function deliverPayloadToUserSubscriptions(
  sb: SupabaseClient,
  userId: string,
  payload: PushPayload,
): Promise<number> {
  const { data: subs } = await sb
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth_key')
    .eq('user_id', userId);

  if (!subs?.length) return 0;

  const pushData = JSON.stringify({
    ...payload,
    url: absolutePayloadUrl(payload),
  });

  let sent = 0;
  for (const sub of subs) {
    try {
      await webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth_key },
        },
        pushData,
      );
      sent++;
    } catch (err: any) {
      if (err.statusCode === 410 || err.statusCode === 404) {
        await sb.from('push_subscriptions').delete().eq('id', sub.id);
      } else {
        console.error('[sendPush] error:', err.statusCode, err.message);
      }
    }
  }
  return sent;
}

/**
 * Web push pagal Supabase user id (pvz. pokalbio dalyvis).
 * Nenaudoja el. pašto throttling / email_notify_* — skirta momentiniams chat pranešimams.
 */
export async function sendPushForUserId(userId: string, type: string, data: any): Promise<number> {
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) return 0;
  const builder = PUSH_ELIGIBLE[type];
  if (!builder) return 0;

  const sb = serviceSupabase();
  if (!sb) return 0;

  const { data: profile } = await sb
    .from('profiles')
    .select('preferred_locale')
    .eq('id', userId)
    .limit(1)
    .maybeSingle();

  const locale = (profile as any)?.preferred_locale || 'lt';

  const payload = builder(data, locale);
  if (!payload) return 0;

  return deliverPayloadToUserSubscriptions(sb, userId, payload);
}

/**
 * Send push notifications for a given email type.
 * Looks up push subscriptions by email, then sends to all active subscriptions.
 * Silently cleans up expired/invalid subscriptions.
 */
export async function sendPushForEmail(
  toEmail: string | string[],
  type: string,
  data: any,
): Promise<number> {
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) return 0;

  const builder = PUSH_ELIGIBLE[type];
  if (!builder) return 0;

  const sb = serviceSupabase();
  if (!sb) return 0;

  const emails = Array.isArray(toEmail) ? toEmail : [toEmail];
  let sent = 0;

  for (const email of emails) {
    const { data: profiles } = await sb
      .from('profiles')
      .select('id, preferred_locale')
      .eq('email', email)
      .limit(1);

    let userId = (profiles as any)?.[0]?.id;
    let locale = (profiles as any)?.[0]?.preferred_locale || 'lt';

    if (!userId) {
      const { data: students } = await sb
        .from('students')
        .select('linked_user_id')
        .eq('email', email)
        .not('linked_user_id', 'is', null)
        .limit(1);
      userId = (students as any)?.[0]?.linked_user_id;

      if (userId) {
        const { data: linkedProfile } = await sb
          .from('profiles')
          .select('preferred_locale')
          .eq('id', userId)
          .limit(1)
          .maybeSingle();
        locale = (linkedProfile as any)?.preferred_locale || 'lt';
      }
    }

    if (!userId) continue;

    const payload = builder(data, locale);
    if (!payload) continue;

    sent += await deliverPayloadToUserSubscriptions(sb, userId, payload);
  }

  return sent;
}
