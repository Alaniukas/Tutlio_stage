import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

const REMEMBER_ME_KEY = 'tutlio_remember_me';

// Cache the storage backend choice to prevent switching mid-session
let cachedStorage: Storage | null = null;

function getStorage(): Storage {
  if (typeof window === 'undefined') {
    return typeof localStorage !== 'undefined' ? localStorage : ({} as Storage);
  }

  // Pick storage backend once per app boot to avoid auth lock races.
  if (cachedStorage) return cachedStorage;

  try {
    const rememberMe = localStorage.getItem(REMEMBER_ME_KEY);
    cachedStorage = rememberMe === 'false' ? sessionStorage : localStorage;
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

  // Add global auth event logger to track all auth events
  supabase.auth.onAuthStateChange((event, session) => {
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

/** Call before login: when user checks "Prisiminti mane", pass true so session is stored in localStorage; otherwise sessionStorage. */
export function setRememberMe(value: boolean) {
  if (typeof window !== 'undefined') {
    localStorage.setItem(REMEMBER_ME_KEY, value ? 'true' : 'false');
    // Do not flip storage backend mid-flight. Apply on next app boot.
    console.log(
      '[Supabase Client] Remember me set to:',
      value,
      '- will use',
      value ? 'localStorage' : 'sessionStorage',
      'after reload/sign-in cycle',
    );
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
