import { beforeEach, describe, expect, it, vi } from 'vitest';

const getSession = vi.fn();
const getUser = vi.fn();

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: (...args: unknown[]) => getSession(...args),
      getUser: (...args: unknown[]) => getUser(...args),
    },
  },
}));

import {
  clearAuthUserCache,
  finishGuardedLoad,
  isAuthLockAbort,
  rememberAuthUser,
  resolveAuthUser,
} from '@/lib/authSession';

describe('isAuthLockAbort', () => {
  it('recognizes AbortError and lock-steal messages', () => {
    expect(isAuthLockAbort(Object.assign(new Error('stopped'), { name: 'AbortError' }))).toBe(true);
    expect(isAuthLockAbort(new Error("Lock broken by another request with the 'steal' option"))).toBe(true);
    expect(isAuthLockAbort(new Error('Lock "lock:sb-x-auth-token" not released (orphaned lock)'))).toBe(true);
    expect(isAuthLockAbort(new Error('network down'))).toBe(false);
    expect(isAuthLockAbort(null)).toBe(false);
  });
});

describe('finishGuardedLoad', () => {
  it('clears loading after AbortError so the spinner cannot stick', async () => {
    const setLoading = vi.fn();
    await finishGuardedLoad({
      isCancelled: () => false,
      setLoading,
      run: async () => {
        const err = new Error("Lock broken by another request with the 'steal' option");
        err.name = 'AbortError';
        throw err;
      },
    });
    expect(setLoading).toHaveBeenCalledWith(false);
  });

  it('does not clear loading when the invocation was cancelled (unmount / Strict Mode)', async () => {
    const setLoading = vi.fn();
    await finishGuardedLoad({
      isCancelled: () => true,
      setLoading,
      run: async () => {
        throw Object.assign(new Error('aborted'), { name: 'AbortError' });
      },
    });
    expect(setLoading).not.toHaveBeenCalled();
  });

  it('clears loading after a successful run', async () => {
    const setLoading = vi.fn();
    await finishGuardedLoad({
      isCancelled: () => false,
      setLoading,
      run: async () => {},
    });
    expect(setLoading).toHaveBeenCalledWith(false);
  });
});

describe('resolveAuthUser', () => {
  beforeEach(() => {
    clearAuthUserCache();
    getSession.mockReset();
    getUser.mockReset();
  });

  it('returns an existing session user without calling getUser or getSession', async () => {
    const existing = { id: 'from-context' } as any;
    const user = await resolveAuthUser(existing);
    expect(user).toEqual(existing);
    expect(getUser).not.toHaveBeenCalled();
    expect(getSession).not.toHaveBeenCalled();
  });

  it('reads getSession (local) instead of getUser (network lock)', async () => {
    getSession.mockResolvedValue({ data: { session: { user: { id: 'sess-1' } } } });
    const user = await resolveAuthUser();
    expect(user).toEqual({ id: 'sess-1' });
    expect(getSession).toHaveBeenCalledTimes(1);
    expect(getUser).not.toHaveBeenCalled();
  });

  it('reuses the memory cache on the next call', async () => {
    rememberAuthUser({ id: 'cached' } as any);
    const user = await resolveAuthUser();
    expect(user).toEqual({ id: 'cached' });
    expect(getSession).not.toHaveBeenCalled();
    expect(getUser).not.toHaveBeenCalled();
  });

  it('does not throw when getSession is aborted by lock steal', async () => {
    getSession.mockRejectedValue(Object.assign(new Error('Lock broken by steal'), { name: 'AbortError' }));
    await expect(resolveAuthUser()).resolves.toBeNull();
    expect(getUser).not.toHaveBeenCalled();
  });
});
