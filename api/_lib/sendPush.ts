import webpush from 'web-push';
import { createClient } from '@supabase/supabase-js';

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

const PUSH_ELIGIBLE: Record<string, (data: any) => PushPayload | null> = {
  session_reminder: (d) => ({
    title: d.isTutor ? 'Upcoming lesson' : 'Lesson reminder',
    body: `${d.date} ${d.time} — ${d.otherName || d.topic || ''}`.trim(),
    url: d.isTutor ? '/dashboard' : '/student/sessions',
    tag: `reminder-${d.date}-${d.time}`,
  }),
  session_reminder_payer: (d) => ({
    title: 'Lesson reminder',
    body: `${d.studentName}'s lesson: ${d.date} ${d.time}`,
    url: '/student/sessions',
    tag: `reminder-payer-${d.date}-${d.time}`,
  }),
  booking_confirmation: (d) => ({
    title: 'Session booked',
    body: `${d.date} ${d.time} with ${d.tutorName}`,
    url: '/student/sessions',
    tag: `booking-${d.date}-${d.time}`,
  }),
  booking_notification: (d) => ({
    title: 'New booking',
    body: `${d.studentName} booked ${d.date} ${d.time}`,
    url: '/dashboard',
    tag: `booking-notif-${d.date}-${d.time}`,
  }),
  session_cancelled: (d) => ({
    title: 'Session cancelled',
    body: `${d.date} ${d.time} — ${d.studentName} / ${d.tutorName}`,
    url: '/dashboard',
    tag: `cancel-${d.date}-${d.time}`,
  }),
  session_cancelled_parent: (d) => ({
    title: 'Session cancelled',
    body: `${d.studentName}'s lesson on ${d.date} cancelled`,
    url: '/student/sessions',
    tag: `cancel-parent-${d.date}-${d.time}`,
  }),
  lesson_rescheduled: (d) => ({
    title: 'Lesson rescheduled',
    body: `New time: ${d.newDate} ${d.newTime}`,
    url: '/dashboard',
    tag: `reschedule-${d.newDate}-${d.newTime}`,
  }),
  chat_new_message: (d) => ({
    title: `Message from ${d.senderName || 'Tutlio'}`,
    body: d.preview || 'New message',
    url: d.messagesUrl || '/messages',
    tag: `chat-${d.senderName}`,
  }),
  waitlist_matched_student: (d) => ({
    title: 'Slot available!',
    body: `${d.date} ${d.time} with ${d.tutorName}`,
    url: '/student/sessions',
    tag: `waitlist-${d.date}-${d.time}`,
  }),
  waitlist_matched_tutor: (d) => ({
    title: 'Waitlist match',
    body: `${d.studentName} matched for ${d.date}`,
    url: '/dashboard',
    tag: `waitlist-tutor-${d.date}`,
  }),
  payment_review_needed: (d) => ({
    title: 'Payment needs review',
    body: `${d.studentName} — ${d.date}`,
    url: '/dashboard',
    tag: `pay-review-${d.date}`,
  }),
  payment_reminder: (d) => ({
    title: 'Payment reminder',
    body: `€${d.price} for lesson ${d.date} ${d.time}`,
    url: '/student/sessions',
    tag: `pay-remind-${d.date}`,
  }),
  payment_after_lesson_reminder: (d) => ({
    title: 'Payment due',
    body: `€${d.amount} for lesson with ${d.tutorName}`,
    url: '/student/sessions',
    tag: `pay-after-${d.date}`,
  }),
};

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

  const payload = builder(data);
  if (!payload) return 0;

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!supabaseUrl || !serviceKey) return 0;

  const sb = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const emails = Array.isArray(toEmail) ? toEmail : [toEmail];
  let sent = 0;

  for (const email of emails) {
    const { data: profiles } = await sb
      .from('profiles')
      .select('id')
      .eq('email', email)
      .limit(1);

    let userId = (profiles as any)?.[0]?.id;

    if (!userId) {
      const { data: students } = await sb
        .from('students')
        .select('linked_user_id')
        .eq('email', email)
        .not('linked_user_id', 'is', null)
        .limit(1);
      userId = (students as any)?.[0]?.linked_user_id;
    }

    if (!userId) continue;

    const { data: subs } = await sb
      .from('push_subscriptions')
      .select('id, endpoint, p256dh, auth_key')
      .eq('user_id', userId);

    if (!subs?.length) continue;

    const appUrl = process.env.APP_URL || process.env.VITE_APP_URL || 'https://tutlio.lt';
    const pushData = JSON.stringify({
      ...payload,
      url: payload.url?.startsWith('http') ? payload.url : `${appUrl}${payload.url || '/'}`,
    });

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
  }

  return sent;
}
