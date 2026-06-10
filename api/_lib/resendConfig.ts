/**
 * Resend API key resolution for local dev and production.
 * - Production / Vercel: set RESEND_API_KEY (verified sending domain).
 * - Local / stage: RESEND_API_KEY_STAGE is used when RESEND_API_KEY is empty.
 */
export function getResendApiKey(): string | undefined {
  const primary = process.env.RESEND_API_KEY?.trim();
  if (primary) return primary;

  const stage = process.env.RESEND_API_KEY_STAGE?.trim();
  if (stage) return stage;

  return undefined;
}

export function resendNotConfiguredMessage(): string {
  return 'Email service not configured (set RESEND_API_KEY or RESEND_API_KEY_STAGE)';
}

/** Internal team recipients for sales/enterprise notifications. */
export const INTERNAL_NOTIFY_EMAILS = ['simas0423@gmail.com', 'alaniukasa@gmail.com'];

export function getFromEmail(): string {
  return process.env.FROM_EMAIL || 'Tutlio <onboarding@tutlio.lt>';
}
