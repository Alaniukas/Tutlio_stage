/**
 * Signed links for school parents who have no Tutlio account: the homework
 * page of one student and the "pay now" link of one monthly invoice. Same
 * HMAC recipe as `joinLink.ts` — the secret never leaves the server, the
 * token authorizes exactly one (scope, id) pair and cannot be reused elsewhere.
 */
import { createHmac, timingSafeEqual } from 'crypto';

export type PublicLinkScope = 'homework' | 'monthly-invoice';

const TOKEN_LENGTH = 40;

function linkSecret(): string {
  return String(process.env.JOIN_LINK_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
}

export function buildPublicLinkToken(scope: PublicLinkScope, id: string, secret = linkSecret()): string {
  if (!secret) throw new Error('JOIN_LINK_SECRET / SUPABASE_SERVICE_ROLE_KEY is not configured');
  return createHmac('sha256', secret)
    .update(`public-link:${scope}:${id}`)
    .digest('hex')
    .slice(0, TOKEN_LENGTH);
}

export function verifyPublicLinkToken(
  scope: PublicLinkScope,
  id: string,
  token: string,
  secret = linkSecret(),
): boolean {
  if (!token || !id || !secret) return false;
  let expected: string;
  try {
    expected = buildPublicLinkToken(scope, id, secret);
  } catch {
    return false;
  }
  const a = Buffer.from(String(token), 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function base(origin: string): string {
  return String(origin || '').replace(/\/$/, '');
}

/** Public page listing the child's lessons, teacher materials and homework uploads. */
export function buildSchoolHomeworkUrl(origin: string, studentId: string): string {
  const params = new URLSearchParams({ student: studentId, t: buildPublicLinkToken('homework', studentId) });
  return `${base(origin)}/school-homework?${params.toString()}`;
}

/** "Apmokėti" button of a monthly extra-lessons invoice — creates the Stripe Checkout on click. */
export function buildSchoolMonthlyInvoicePayUrl(origin: string, invoiceId: string): string {
  const params = new URLSearchParams({ invoice: invoiceId, t: buildPublicLinkToken('monthly-invoice', invoiceId) });
  return `${base(origin)}/api/pay-school-monthly-invoice?${params.toString()}`;
}

/** Browser-facing origin for links placed in emails sent by crons (no request to derive it from). */
export function publicAppOrigin(): string {
  return base(process.env.APP_URL || process.env.VITE_APP_URL || 'https://tutlio.lt');
}
