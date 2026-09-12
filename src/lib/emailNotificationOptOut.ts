/** Shared with api/_lib/emailNotificationOptOut.ts */
export const EMAIL_OPT_OUT_KEYS = [
  'lesson_reminder_tutor',
  'lesson_reminder_student',
  'payment_deadline_warning',
] as const;

export type EmailOptOutKey = (typeof EMAIL_OPT_OUT_KEYS)[number];

export function parseEmailOptOutList(value: unknown): EmailOptOutKey[] {
  if (!Array.isArray(value)) return [];
  const allowed = new Set<string>(EMAIL_OPT_OUT_KEYS);
  return value
    .map((row) => String(row || '').trim())
    .filter((key): key is EmailOptOutKey => allowed.has(key));
}

export function toggleEmailOptOut(current: EmailOptOutKey[], key: EmailOptOutKey): EmailOptOutKey[] {
  const set = new Set(current);
  if (set.has(key)) set.delete(key);
  else set.add(key);
  return EMAIL_OPT_OUT_KEYS.filter((k) => set.has(k));
}
