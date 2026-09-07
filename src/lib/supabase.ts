import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

const REMEMBER_ME_KEY = 'tutlio_remember_me';

// Cache the storage backend choice to prevent switching mid-session
let cachedStorage: Storage | null = null;

function listAuthKeys(store: Storage): string[] {
  const keys: string[] = [];
  for (let i = 0; i < store.length; i++) {
    const k = store.key(i);
    if (k && k.startsWith('sb-')) keys.push(k);
  }
  return keys;
}

function moveAuthKeys(from: Storage, to: Storage) {
  for (const k of listAuthKeys(from)) {
    const v = from.getItem(k);
    if (v !== null) to.setItem(k, v);
    from.removeItem(k);
  }
}

function getStorage(): Storage {
  if (typeof window === 'undefined') {
    return typeof localStorage !== 'undefined' ? localStorage : ({} as Storage);
  }

  // Pick storage backend once per app boot to avoid auth lock races.
  if (cachedStorage) return cachedStorage;

  try {
    const rememberMe = localStorage.getItem(REMEMBER_ME_KEY);
    const chosen = rememberMe === 'false' ? sessionStorage : localStorage;
    const other = chosen === localStorage ? sessionStorage : localStorage;
    // A remember-me flip before the last sign-in could have left the live
    // session in the other backend; adopt it so a refresh never appears
    // logged-out (this also heals sessions stranded by the old behavior).
    if (listAuthKeys(chosen).length === 0 && listAuthKeys(other).length > 0) {
      moveAuthKeys(other, chosen);
    }
    cachedStorage = chosen;
    return cachedStorage;
  } catch {
    cachedStorage = localStorage;
    return localStorage;
  }
}

const customStorage = {
  getItem: (key: string) => {
    try {
      const s = getStorage();
      return s && typeof s.getItem === 'function' ? s.getItem(key) : null;
    } catch (err) {
      console.error('[customStorage] getItem error:', err);
      return null;
    }
  },
  setItem: (key: string, value: string) => {
    try {
      const s = getStorage();
      if (s && typeof s.setItem === 'function') {
        s.setItem(key, value);
      }
    } catch (err) {
      console.error('[customStorage] setItem error:', err);
    }
  },
  removeItem: (key: string) => {
    try {
      const s = getStorage();
      if (s && typeof s.removeItem === 'function') {
        s.removeItem(key);
      }
      // Defensive cleanup: remove token from both stores to avoid stale-session loops.
      if (typeof localStorage !== 'undefined' && localStorage !== s) {
        localStorage.removeItem(key);
      }
      if (typeof sessionStorage !== 'undefined' && sessionStorage !== s) {
        sessionStorage.removeItem(key);
      }
    } catch (err) {
      console.error('[customStorage] removeItem error:', err);
    }
  },
};

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Missing Supabase environment variables. Please check .env file.');
}

export const supabase = createClient(supabaseUrl || '', supabaseAnonKey || '', {
  auth: {
    storage: customStorage,
    persistSession: true,
    detectSessionInUrl: true,
    autoRefreshToken: true,
    debug: false, // Set to true for verbose auth debugging if needed
  },
});

// Track transient auth operations for debug logging only.
let isRestoringSession = false;
let appHasLoaded = false;

if (typeof window !== 'undefined') {
  // Mark app as loaded after initial render (allow initial auth checks to complete first)
  setTimeout(() => {
    appHasLoaded = true;
    console.log('[Supabase Client] App initial load complete');
  }, 2000);

  // NOTE:
  // We intentionally avoid extra global getSession/refreshSession calls on focus/visibility.
  // Supabase autoRefreshToken is sufficient and this prevents auth-lock contention storms
  // in React StrictMode (seen as "Lock broken by another request with steal option").

  // Realtime postgres_changes with RLS requires the current JWT on the socket.
  const syncRealtimeAuth = (accessToken: string | undefined) => {
    try {
      void supabase.realtime.setAuth(accessToken ?? '');
    } catch (err) {
      console.warn('[Supabase Client] realtime.setAuth failed:', err);
    }
  };

  void supabase.auth.getSession().then(({ data: { session } }) => {
    syncRealtimeAuth(session?.access_token);
  });

  // Add global auth event logger to track all auth events
  supabase.auth.onAuthStateChange((event, session) => {
    syncRealtimeAuth(session?.access_token);

    // Log all auth events for debugging
    if (event !== 'TOKEN_REFRESHED') {
      console.log('[Supabase Client] Auth event:', event, {
        hasSession: !!session,
        hasUser: !!session?.user,
        expiresAt: session?.expires_at,
        timestamp: new Date().toISOString()
      });
    }

    if (event === 'SIGNED_OUT') {
      // Ignore SIGNED_OUT events that happen during session restoration
      // as they might be false positives from the refresh process
      if (isRestoringSession) {
        console.log('[Supabase Client] SIGNED_OUT event ignored during session restoration');
        return;
      }

      console.warn('[Supabase Client] SIGNED_OUT event detected', {
        timestamp: new Date().toISOString(),
        hasSession: !!session,
        appHasLoaded,
        rememberMe: localStorage.getItem(REMEMBER_ME_KEY),
        stackTrace: new Error().stack
      });
    }

    if (event === 'TOKEN_REFRESHED') {
      console.log('[Supabase Client] Token refreshed successfully');
    }
  });
}

/**
 * Call before login: true stores the session in localStorage (survives browser
 * restarts); false uses sessionStorage (cleared when the tab closes).
 * Switches the live backend immediately and migrates any existing auth token,
 * so the session the sign-in writes is the one the next page load reads.
 */
export function setRememberMe(value: boolean) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(REMEMBER_ME_KEY, value ? 'true' : 'false');
    const target = value ? localStorage : sessionStorage;
    const current = getStorage();
    if (current !== target) {
      moveAuthKeys(current, target);
      cachedStorage = target;
    }
    console.log('[Supabase Client] Remember me set to:', value);
  } catch (err) {
    console.error('[Supabase Client] setRememberMe failed:', err);
  }
}

// Debug helper: log which storage is being used on page load
if (typeof window !== 'undefined') {
  const rememberMe = localStorage.getItem(REMEMBER_ME_KEY);
  console.log('[Supabase Client] Initial storage check:', {
    rememberMeKey: rememberMe,
    willUseStorage: rememberMe === 'false' ? 'sessionStorage' : 'localStorage'
  });
}
