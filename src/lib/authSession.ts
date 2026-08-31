import type { User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { dedupeAsync } from '@/lib/dataCache';

/** undefined = not loaded yet; null = signed out / no session. */
let cachedAuthUser: User | null | undefined;

export function isAuthLockAbort(err: unknown): boolean {
  if (err == null || typeof err !== 'object') return false;
  const e = err as { name?: string; message?: string };
  if (e.name === 'AbortError') return true;
  const msg = String(e.message || '');
  return /Lock broken by another request/i.test(msg) || /orphaned lock/i.test(msg);
}

export function peekCachedAuthUser(): User | null | undefined {
  return cachedAuthUser;
}

export function rememberAuthUser(user: User | null): void {
  cachedAuthUser = user;
}

export function clearAuthUserCache(): void {
  cachedAuthUser = undefined;
}

/**
 * Serialized auth read. Prefer an already-known user / memory cache / local
 * getSession over getUser (network + navigator lock). Lock-steal AbortError
 * returns the cache instead of throwing.
 */
export function resolveAuthUser(existingUser?: User | null): Promise<User | null> {
  if (existingUser) {
    cachedAuthUser = existingUser;
    return Promise.resolve(existingUser);
  }
  if (cachedAuthUser !== undefined) return Promise.resolve(cachedAuthUser);
  return dedupeAsync('auth_user', async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      cachedAuthUser = session?.user ?? null;
      return cachedAuthUser;
    } catch (err) {
      if (isAuthLockAbort(err)) return cachedAuthUser ?? null;
      throw err;
    }
  });
}

/** Always clear the spinner unless this invocation was cancelled (unmount / Strict Mode). */
export async function finishGuardedLoad(options: {
  isCancelled: () => boolean;
  setLoading: (loading: boolean) => void;
  run: () => Promise<void>;
}): Promise<void> {
  try {
    await options.run();
  } catch (err) {
    if (options.isCancelled() || isAuthLockAbort(err)) return;
    throw err;
  } finally {
    if (!options.isCancelled()) options.setLoading(false);
  }
}
