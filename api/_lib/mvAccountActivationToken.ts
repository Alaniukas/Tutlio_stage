import { createHmac, timingSafeEqual } from 'node:crypto';

export type MvActivationRole = 'parent' | 'student';

const TOKEN_VERSION = 'v1';
const DEFAULT_TTL_MS = 14 * 24 * 60 * 60 * 1000;

function secret(): string {
  return String(process.env.JOIN_LINK_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
}

export type MvActivationPayload = {
  studentId: string;
  role: MvActivationRole;
  email: string;
  exp: number;
};

function canonicalPayload(payload: MvActivationPayload): string {
  return [
    TOKEN_VERSION,
    payload.studentId,
    payload.role,
    payload.email.trim().toLowerCase(),
    String(payload.exp),
  ].join(':');
}

export function buildMvAccountActivationToken(
  opts: {
    studentId: string;
    role: MvActivationRole;
    email: string;
    ttlMs?: number;
  },
  signingSecret = secret(),
): string {
  if (!signingSecret) throw new Error('JOIN_LINK_SECRET / SUPABASE_SERVICE_ROLE_KEY is not configured');
  const exp = Date.now() + (opts.ttlMs ?? DEFAULT_TTL_MS);
  const payload: MvActivationPayload = {
    studentId: opts.studentId.trim(),
    role: opts.role,
    email: opts.email.trim().toLowerCase(),
    exp,
  };
  const sig = createHmac('sha256', signingSecret)
    .update(`mv-account-activate:${canonicalPayload(payload)}`)
    .digest('hex')
    .slice(0, 32);
  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  return `${body}.${sig}`;
}

export function verifyMvAccountActivationToken(
  token: string,
  signingSecret = secret(),
): { ok: true; payload: MvActivationPayload } | { ok: false; reason: string } {
  if (!token || !signingSecret) return { ok: false, reason: 'invalid_token' };
  const parts = token.split('.');
  if (parts.length !== 2) return { ok: false, reason: 'invalid_token' };
  const [body, sig] = parts;
  let payload: MvActivationPayload;
  try {
    payload = JSON.parse(Buffer.from(body!, 'base64url').toString('utf8')) as MvActivationPayload;
  } catch {
    return { ok: false, reason: 'invalid_token' };
  }
  if (!payload?.studentId || !payload?.role || !payload?.email || !payload?.exp) {
    return { ok: false, reason: 'invalid_token' };
  }
  if (payload.role !== 'parent' && payload.role !== 'student') {
    return { ok: false, reason: 'invalid_token' };
  }
  const expected = createHmac('sha256', signingSecret)
    .update(`mv-account-activate:${canonicalPayload(payload)}`)
    .digest('hex')
    .slice(0, 32);
  const a = Buffer.from(sig!, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, reason: 'invalid_token' };
  }
  if (Date.now() > payload.exp) return { ok: false, reason: 'expired' };
  return { ok: true, payload };
}

export function buildMvAccountActivationUrl(origin: string, token: string): string {
  const base = String(origin || '').replace(/\/$/, '');
  const params = new URLSearchParams({ t: token });
  return `${base}/mv-account-activate?${params.toString()}`;
}

export function buildMvLoginUrl(origin: string, email: string, role: MvActivationRole): string {
  const base = String(origin || '').replace(/\/$/, '');
  const params = new URLSearchParams({
    email: email.trim().toLowerCase(),
    portal: role === 'parent' ? 'parent' : 'student',
    mvActivated: '1',
  });
  return `${base}/login?${params.toString()}`;
}
