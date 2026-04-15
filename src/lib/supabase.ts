import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

const REMEMBER_ME_KEY = 'tutlio_remember_me';

// Cache the storage backend choice to prevent switching mid-session
let cachedStorage: Storage | null = null;
let lastRememberMeCheck = 0;
const STORAGE_CHECK_INTERVAL = 5000; // Re-check storage choice max once per 5 seconds

function getStorage(): Storage {
  if (typeof window === 'undefined') {
    return typeof localStorage !== 'undefined' ? localStorage : ({} as Storage);
  }

  const now = Date.now();
  // Use cached storage if we checked recently (prevents switching mid-session)
  if (cachedStorage && (now - lastRememberMeCheck) < STORAGE_CHECK_INTERVAL) {
    return cachedStorage;
  }

  try {
    const rememberMe = localStorage.getItem(REMEMBER_ME_KEY);
    cachedStorage = rememberMe === 'false' ? sessionStorage : localStorage;
    lastRememberMeCheck = now;
    return cachedStorage;
  } catch {
    cachedStorage = localStorage;
    lastRememberMeCheck = now;
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

// Track page visibility to prevent false sign-outs during tab switching
let isPageHidden = false;
let isRestoringSession = false;
let lastVisibilityChange = 0;
let appHasLoaded = false;

if (typeof window !== 'undefined') {
  // Mark app as loaded after initial render (allow initial auth checks to complete first)
  setTimeout(() => {
    appHasLoaded = true;
    console.log('[Supabase Client] App initial load complete');
  }, 2000);

  // Handle page visibility changes - refresh session when page becomes visible
  const handleVisibilityChange = async () => {
    // Don't interfere with initial page load
    if (!appHasLoaded) return;

    const now = Date.now();

    if (document.hidden) {
      isPageHidden = true;
      lastVisibilityChange = now;
    } else {
      // Page became visible - explicitly restore session
      const wasHiddenFor = now - lastVisibilityChange;
      isPageHidden = false;
      isRestoringSession = true;

      console.log('[Supabase Client] Page became visible after', wasHiddenFor, 'ms');

      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          // Only refresh if page was hidden for more than 5 seconds
          if (wasHiddenFor > 5000) {
            await supabase.auth.refreshSession();
            console.log('[Supabase Client] Session refreshed after page became visible');
          } else {
            console.log('[Supabase Client] Session verified after brief visibility change');
          }
        }
      } catch (err) {
        console.error('[Supabase Client] Error restoring session:', err);
      } finally {
        // Clear the flag after a short delay to allow auth events to settle
        setTimeout(() => {
          isRestoringSession = false;
        }, 1000);
      }

      lastVisibilityChange = now;
    }
  };

  document.addEventListener('visibilitychange', handleVisibilityChange);

  // Also handle window focus/blur as additional safeguard (but only after initial load)
  window.addEventListener('focus', async () => {
    // Don't interfere with initial page load or if already restoring
    if (!appHasLoaded || isRestoringSession) return;

    isRestoringSession = true;
    console.log('[Supabase Client] Window regained focus - verifying session');

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        // Silently verify session is still valid
        await supabase.auth.refreshSession();
      }
    } catch (err) {
      console.error('[Supabase Client] Error on window focus:', err);
    } finally {
      setTimeout(() => {
        isRestoringSession = false;
      }, 500);
    }
  });

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
        wasPageHidden: isPageHidden,
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
    // Clear cached storage to force re-evaluation with new setting
    cachedStorage = null;
    lastRememberMeCheck = 0;
    console.log('[Supabase Client] Remember me set to:', value, '- will use', value ? 'localStorage' : 'sessionStorage');
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
