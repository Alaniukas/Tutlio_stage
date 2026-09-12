/** Keys stored in profiles.email_notification_opt_out and org features.admin_email_opt_out. */
export const EMAIL_OPT_OUT_KEYS = [
  'lesson_reminder_tutor',
  'lesson_reminder_student',
  'payment_deadline_warning',
] as const;

export type EmailOptOutKey = (typeof EMAIL_OPT_OUT_KEYS)[number];

export function parseEmailOptOutList(value: unknown): Set<EmailOptOutKey> {
  if (!Array.isArray(value)) return new Set();
  const allowed = new Set<string>(EMAIL_OPT_OUT_KEYS);
  return new Set(
    value
      .map((row) => String(row || '').trim())
      .filter((key): key is EmailOptOutKey => allowed.has(key)),
  );
}

export function isEmailOptedOut(optOut: Set<EmailOptOutKey>, key: EmailOptOutKey): boolean {
  return optOut.has(key);
}

export function orgAdminEmailOptOut(features: unknown): Set<EmailOptOutKey> {
  if (!features || typeof features !== 'object' || Array.isArray(features)) return new Set();
  return parseEmailOptOutList((features as Record<string, unknown>).admin_email_opt_out);
}
