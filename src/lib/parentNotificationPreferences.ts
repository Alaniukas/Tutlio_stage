export const PARENT_NOTIFICATION_KEYS = [
  'lesson_reminders',
  'lesson_updates',
  'attendance_updates',
  'payment_reminders',
] as const;

export type ParentNotificationKey = (typeof PARENT_NOTIFICATION_KEYS)[number];

const PARENT_NOTIFICATION_KEY_SET = new Set<string>(PARENT_NOTIFICATION_KEYS);

/**
 * Optional parent-facing notification categories. Contract, invoice, payment
 * receipt and account-security emails deliberately remain transactional.
 */
const EMAIL_TYPE_TO_PARENT_NOTIFICATION: Readonly<Record<string, ParentNotificationKey>> = {
  session_reminder_payer: 'lesson_reminders',
  booking_confirmation: 'lesson_updates',
  recurring_booking_confirmation: 'lesson_updates',
  lesson_rescheduled: 'lesson_updates',
  session_cancelled_parent: 'lesson_updates',
  session_student_no_show: 'attendance_updates',
  payment_reminder: 'payment_reminders',
  payment_after_lesson_reminder: 'payment_reminders',
  school_installment_request: 'payment_reminders',
};

export function parseParentNotificationOptOut(
  value: unknown,
  legacyDisableLessonReminders = false,
): ParentNotificationKey[] {
  const selected = new Set<ParentNotificationKey>();
  if (Array.isArray(value)) {
    for (const row of value) {
      const key = String(row || '').trim();
      if (PARENT_NOTIFICATION_KEY_SET.has(key)) selected.add(key as ParentNotificationKey);
    }
  }
  if (legacyDisableLessonReminders) selected.add('lesson_reminders');
  return PARENT_NOTIFICATION_KEYS.filter((key) => selected.has(key));
}

export function setParentNotificationEnabled(
  currentOptOut: ParentNotificationKey[],
  key: ParentNotificationKey,
  enabled: boolean,
): ParentNotificationKey[] {
  const next = new Set(currentOptOut);
  if (enabled) next.delete(key);
  else next.add(key);
  return PARENT_NOTIFICATION_KEYS.filter((candidate) => next.has(candidate));
}

export function parentNotificationKeyForEmailType(
  type: unknown,
  data?: Record<string, unknown> | null,
): ParentNotificationKey | null {
  const normalizedType = String(type || '');
  if (
    (normalizedType === 'booking_confirmation' || normalizedType === 'recurring_booking_confirmation')
    && data?.forPayer !== true
  ) return null;
  if (normalizedType === 'lesson_rescheduled' && data?.recipientRole !== 'payer') return null;
  return EMAIL_TYPE_TO_PARENT_NOTIFICATION[normalizedType] || null;
}

export function isParentNotificationEnabled(
  optOut: Iterable<ParentNotificationKey>,
  key: ParentNotificationKey,
): boolean {
  return !new Set(optOut).has(key);
}

/** Org-level master switch: which optional parent emails this organization sends. */
export function parseOrgParentNotificationOptOut(features: unknown): ParentNotificationKey[] {
  if (!features || typeof features !== 'object' || Array.isArray(features)) return [];
  return parseParentNotificationOptOut((features as Record<string, unknown>).parent_email_opt_out);
}
