import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  buildJoinToken,
  buildTrackedJoinUrl,
  isJoinRole,
  verifyJoinToken,
} from '../../api/_lib/joinLink';

const SESSION_ID = '7e0f9a3c-1111-4222-8333-444455556666';
const SECRET = 'test-join-link-secret';

const prevJoinSecret = process.env.JOIN_LINK_SECRET;
const prevServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

beforeEach(() => {
  process.env.JOIN_LINK_SECRET = SECRET;
});

afterEach(() => {
  if (prevJoinSecret === undefined) delete process.env.JOIN_LINK_SECRET;
  else process.env.JOIN_LINK_SECRET = prevJoinSecret;
  if (prevServiceKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  else process.env.SUPABASE_SERVICE_ROLE_KEY = prevServiceKey;
});

describe('isJoinRole', () => {
  it('accepts only tutor and student', () => {
    expect(isJoinRole('tutor')).toBe(true);
    expect(isJoinRole('student')).toBe(true);
    expect(isJoinRole('admin')).toBe(false);
    expect(isJoinRole('')).toBe(false);
    expect(isJoinRole(undefined)).toBe(false);
  });
});

describe('buildJoinToken / verifyJoinToken', () => {
  it('is deterministic for the same session+role and differs across roles/sessions', () => {
    const a = buildJoinToken(SESSION_ID, 'tutor');
    expect(buildJoinToken(SESSION_ID, 'tutor')).toBe(a);
    expect(buildJoinToken(SESSION_ID, 'student')).not.toBe(a);
    expect(buildJoinToken('other-session-id', 'tutor')).not.toBe(a);
  });

  it('verifies a valid token and rejects forged or mismatched ones', () => {
    const token = buildJoinToken(SESSION_ID, 'student');
    expect(verifyJoinToken(token, SESSION_ID, 'student')).toBe(true);
    expect(verifyJoinToken(token, SESSION_ID, 'tutor')).toBe(false);
    expect(verifyJoinToken(token, 'other-session-id', 'student')).toBe(false);
    expect(verifyJoinToken('a'.repeat(token.length), SESSION_ID, 'student')).toBe(false);
    expect(verifyJoinToken('', SESSION_ID, 'student')).toBe(false);
  });

  it('falls back to SUPABASE_SERVICE_ROLE_KEY when JOIN_LINK_SECRET is empty', () => {
    delete process.env.JOIN_LINK_SECRET;
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-fallback';
    const token = buildJoinToken(SESSION_ID, 'tutor');
    expect(verifyJoinToken(token, SESSION_ID, 'tutor')).toBe(true);
  });

  it('throws when no secret is configured at all', () => {
    delete process.env.JOIN_LINK_SECRET;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    expect(() => buildJoinToken(SESSION_ID, 'tutor')).toThrow();
  });
});

describe('buildTrackedJoinUrl', () => {
  it('builds /api/join-session URL with sid, role and token', () => {
    const url = buildTrackedJoinUrl('https://tutlio.lt', SESSION_ID, 'student');
    const parsed = new URL(url);
    expect(parsed.origin).toBe('https://tutlio.lt');
    expect(parsed.pathname).toBe('/api/join-session');
    expect(parsed.searchParams.get('sid')).toBe(SESSION_ID);
    expect(parsed.searchParams.get('role')).toBe('student');
    const token = parsed.searchParams.get('t') || '';
    expect(verifyJoinToken(token, SESSION_ID, 'student')).toBe(true);
  });

  it('strips a trailing slash from the origin', () => {
    const url = buildTrackedJoinUrl('https://tutlio.lt/', SESSION_ID, 'tutor');
    expect(url.startsWith('https://tutlio.lt/api/join-session?')).toBe(true);
  });
});
