import { createHmac, timingSafeEqual } from 'crypto';

export type JoinRole = 'tutor' | 'student';

export function isJoinRole(value: unknown): value is JoinRole {
  return value === 'tutor' || value === 'student';
}

/** HMAC key for signed join links. Dedicated secret wins; service key is the fallback so no extra env is required. */
function joinLinkSecret(): string {
  const s = process.env.JOIN_LINK_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  return String(s).trim();
}

const TOKEN_LENGTH = 32;

/** Deterministic token authorizing a join-click record for one (session, role) pair. */
export function buildJoinToken(sessionId: string, role: JoinRole, secret = joinLinkSecret()): string {
  if (!secret) throw new Error('JOIN_LINK_SECRET / SUPABASE_SERVICE_ROLE_KEY is not configured');
  return createHmac('sha256', secret)
    .update(`join:${sessionId}:${role}`)
    .digest('hex')
    .slice(0, TOKEN_LENGTH);
}

export function verifyJoinToken(
  token: string,
  sessionId: string,
  role: JoinRole,
  secret = joinLinkSecret(),
): boolean {
  if (!token || !sessionId || !secret) return false;
  const expected = buildJoinToken(sessionId, role, secret);
  const a = Buffer.from(token, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Tracked join URL placed in emails / Google Calendar instead of the raw
 * Zoom/Meet link: /api/join-session records the click and 302-redirects.
 */
export function buildTrackedJoinUrl(origin: string, sessionId: string, role: JoinRole): string {
  const base = (origin || '').replace(/\/$/, '');
  const params = new URLSearchParams({ sid: sessionId, role, t: buildJoinToken(sessionId, role) });
  return `${base}/api/join-session?${params.toString()}`;
}
