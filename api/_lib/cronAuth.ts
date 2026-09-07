import type { VercelRequest, VercelResponse } from '../types';
import { timingSafeEqual } from 'crypto';

function secretsMatch(provided: string, expected: string): boolean {
  const a = Buffer.from(provided, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/**
 * Authorize a cron-triggered endpoint.
 *
 * Fails CLOSED when CRON_SECRET is missing in any deployed environment
 * (VERCEL_ENV is set on production/preview/dev deployments) so a forgotten
 * env var can never leave these endpoints publicly invocable. Local dev
 * without CRON_SECRET stays callable for manual testing.
 *
 * Returns true when authorized; otherwise writes the error response and
 * returns false (caller should `return` immediately).
 */
export function requireCronAuth(req: VercelRequest, res: VercelResponse): boolean {
  const cronSecret = process.env.CRON_SECRET || '';

  if (!cronSecret) {
    if (process.env.VERCEL_ENV) {
      res.status(500).json({ error: 'Server misconfigured: CRON_SECRET is not set' });
      return false;
    }
    return true;
  }

  const auth = typeof req.headers.authorization === 'string' ? req.headers.authorization : '';
  if (!secretsMatch(auth, `Bearer ${cronSecret}`)) {
    res.status(401).json({ error: 'Unauthorized' });
    return false;
  }
  return true;
}

/**
 * Non-throwing variant for endpoints where cron auth is only one of several
 * accepted auth methods (e.g. /api/send-email). Never fails open: an unset
 * CRON_SECRET simply does not authorize the request.
 */
export function isCronAuthorized(req: VercelRequest): boolean {
  const cronSecret = process.env.CRON_SECRET || '';
  if (!cronSecret) return false;
  const auth = typeof req.headers.authorization === 'string' ? req.headers.authorization : '';
  return secretsMatch(auth, `Bearer ${cronSecret}`);
}
