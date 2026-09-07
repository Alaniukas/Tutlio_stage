import { describe, expect, it, vi } from 'vitest';
import { isAuthEmailAlreadyRegistered } from '../../api/_lib/findAuthUserByEmail';
import { isAcceptedFlag, parentLegalAcceptanceMissing } from '../../api/_lib/proKlaseLegal';
import { isMissingPostgrestRpc } from '../../api/_lib/postgrestRpc';
import { normalizeStudentGrade1to12 } from '../../api/_lib/studentGrade';

describe('parent register API helpers', () => {
  it('treats GoTrue duplicate-email variants as already registered', () => {
    expect(isAuthEmailAlreadyRegistered('A user with this email address has already been registered')).toBe(true);
    expect(isAuthEmailAlreadyRegistered('User already registered')).toBe(true);
    expect(isAuthEmailAlreadyRegistered('duplicate key value violates unique constraint')).toBe(true);
    expect(isAuthEmailAlreadyRegistered('Password should be at least 8 characters')).toBe(false);
  });

  it('accepts boolean or string legal flags', () => {
    expect(isAcceptedFlag(true)).toBe(true);
    expect(isAcceptedFlag('true')).toBe(true);
    expect(isAcceptedFlag(false)).toBe(false);
    expect(parentLegalAcceptanceMissing({
      orgIdOrSlug: '3422031d-6e21-424d-980b-35a9c6d7b8f1',
      acceptedPrivacy: true,
      acceptedTerms: true,
    })).toBe(false);
  });

  it('normalizes grade select values used by parent register', () => {
    expect(normalizeStudentGrade1to12('10')).toBe('10 klasė');
    expect(normalizeStudentGrade1to12('10 klasė')).toBe('10 klasė');
    expect(normalizeStudentGrade1to12('')).toBeNull();
  });
});
describe('PostgREST missing RPC', () => {
  it('detects schema-cache misses that currently flood Vercel error logs', () => {
    expect(isMissingPostgrestRpc({ code: 'PGRST202' })).toBe(true);
    expect(isMissingPostgrestRpc({ code: 'PGRST116' })).toBe(false);
    expect(isMissingPostgrestRpc(null)).toBe(false);
  });
});

describe('findAuthUserByEmail', () => {
  it('uses the auth.users RPC instead of scanning the first listUsers page', async () => {
    const rpc = vi.fn(async () => ({ data: '7cdcd471-057d-46d0-a105-b36a2eae0232', error: null }));
    const listUsers = vi.fn();
    const supabase = { rpc, auth: { admin: { listUsers } } } as any;
    const { findAuthUserByEmail } = await import('../../api/_lib/findAuthUserByEmail');
    const hit = await findAuthUserByEmail(supabase, 'alaniukasa@gmail.com');
    expect(hit?.id).toBe('7cdcd471-057d-46d0-a105-b36a2eae0232');
    expect(listUsers).not.toHaveBeenCalled();
  });

  it('keeps paging when GoTrue returns fewer users than perPage', async () => {
    const rpc = vi.fn(async () => ({ data: null, error: { code: 'PGRST202' } }));
    const listUsers = vi.fn(async ({ page }: { page: number }) => {
      if (page === 1) {
        return { data: { users: [{ id: 'u1', email: 'first@example.com' }] }, error: null };
      }
      return { data: { users: [{ id: 'u2', email: 'alaniukasa@gmail.com' }] }, error: null };
    });
    const supabase = { rpc, auth: { admin: { listUsers } } } as any;
    const { findAuthUserByEmail } = await import('../../api/_lib/findAuthUserByEmail');
    const hit = await findAuthUserByEmail(supabase, 'alaniukasa@gmail.com');
    expect(hit?.id).toBe('u2');
    expect(listUsers).toHaveBeenCalledTimes(2);
  });
});
