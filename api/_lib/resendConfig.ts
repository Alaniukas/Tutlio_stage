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
