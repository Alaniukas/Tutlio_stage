import { createHmac, timingSafeEqual } from 'node:crypto';

export interface SchoolRecordingTicket {
  userId: string;
  groupId: string;
  fileId: string;
  expiresAt: number;
}

export interface SchoolRecordingViewerSession {
  userId: string;
  expiresAt: number;
}

const DEFAULT_TTL_SECONDS = 2 * 60 * 60;
const MAX_TTL_SECONDS = 4 * 60 * 60;

function secret(): string {
  return process.env.SCHOOL_RECORDING_STREAM_SECRET
    || process.env.SUPABASE_SERVICE_ROLE_KEY
    || '';
}

function signature(encodedPayload: string, signingSecret: string): string {
  return createHmac('sha256', signingSecret)
    .update(encodedPayload)
    .digest('base64url');
}

function encodeSignedPayload(payload: Record<string, unknown>, signingSecret: string): string {
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  return `${encoded}.${signature(encoded, signingSecret)}`;
}

function decodeSignedPayload(token: string, signingSecret: string): Record<string, unknown> | null {
  if (!signingSecret || !token || token.length > 4096) return null;
  const [encoded, providedSignature, extra] = token.split('.');
  if (!encoded || !providedSignature || extra) return null;
  const expectedSignature = signature(encoded, signingSecret);
  const a = Buffer.from(providedSignature, 'utf8');
  const b = Buffer.from(expectedSignature, 'utf8');
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    return JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function createSchoolRecordingTicket(
  values: Omit<SchoolRecordingTicket, 'expiresAt'>,
  options: { nowMs?: number; ttlSeconds?: number; signingSecret?: string } = {},
): string {
  const signingSecret = options.signingSecret ?? secret();
  if (!signingSecret) throw new Error('Missing SCHOOL_RECORDING_STREAM_SECRET');
  const ttlSeconds = Math.min(
    MAX_TTL_SECONDS,
    Math.max(60, options.ttlSeconds ?? DEFAULT_TTL_SECONDS),
  );
  const payload = {
    purpose: 'recording',
    ...values,
    expiresAt: Math.floor((options.nowMs ?? Date.now()) / 1000) + ttlSeconds,
  };
  return encodeSignedPayload(payload, signingSecret);
}

export function verifySchoolRecordingTicket(
  token: string,
  options: { nowMs?: number; signingSecret?: string } = {},
): SchoolRecordingTicket | null {
  const signingSecret = options.signingSecret ?? secret();
  const parsed = decodeSignedPayload(token, signingSecret);
  if (!parsed) return null;
  if (
      parsed.purpose !== 'recording'
      || typeof parsed.userId !== 'string'
      || typeof parsed.groupId !== 'string'
      || typeof parsed.fileId !== 'string'
      || typeof parsed.expiresAt !== 'number'
      || parsed.expiresAt <= Math.floor((options.nowMs ?? Date.now()) / 1000)
  ) return null;
  return parsed as unknown as SchoolRecordingTicket;
}

export function createSchoolRecordingViewerSession(
  userId: string,
  options: { nowMs?: number; ttlSeconds?: number; signingSecret?: string } = {},
): string {
  const signingSecret = options.signingSecret ?? secret();
  if (!signingSecret) throw new Error('Missing SCHOOL_RECORDING_STREAM_SECRET');
  const ttlSeconds = Math.min(
    MAX_TTL_SECONDS,
    Math.max(60, options.ttlSeconds ?? DEFAULT_TTL_SECONDS),
  );
  return encodeSignedPayload({
    purpose: 'viewer',
    userId,
    expiresAt: Math.floor((options.nowMs ?? Date.now()) / 1000) + ttlSeconds,
  }, signingSecret);
}

export function verifySchoolRecordingViewerSession(
  token: string,
  options: { nowMs?: number; signingSecret?: string } = {},
): SchoolRecordingViewerSession | null {
  const signingSecret = options.signingSecret ?? secret();
  const parsed = decodeSignedPayload(token, signingSecret);
  if (
    !parsed
    || parsed.purpose !== 'viewer'
    || typeof parsed.userId !== 'string'
    || typeof parsed.expiresAt !== 'number'
    || parsed.expiresAt <= Math.floor((options.nowMs ?? Date.now()) / 1000)
  ) return null;
  return parsed as unknown as SchoolRecordingViewerSession;
}
