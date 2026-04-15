import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { supabase } from '@/lib/supabase';
import { User } from '@supabase/supabase-js';
import { buildPlatformPath } from '@/lib/platform';

interface UserProfile {
  id: string;
  full_name: string | null;
  email: string;
  stripe_account_id: string | null;
  google_calendar_connected: boolean;
  organization_id: string | null;
  break_between_lessons?: number;
  min_booking_hours?: number;
  subscription_status?: string;
  /** Server-set exception — access without Stripe subscription */
  manual_subscription_exempt?: boolean;
  trial_ends_at?: string | null;
  phone?: string | null;
  preferred_locale?: string | null;
}

interface UserContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  refetchProfile: () => Promise<void>;
}

const UserContext = createContext<UserContextType>({
  user: null,
  profile: null,
  loading: true,
  refetchProfile: async () => {},
});

export const useUser = () => useContext(UserContext);

const PROFILE_SELECT_WITH_TRIAL = 'id, full_name, email, stripe_account_id, google_calendar_connected, organization_id, break_between_lessons, min_booking_hours, subscription_status, manual_subscription_exempt, trial_ends_at, phone, stripe_onboarding_complete, preferred_locale';
const PROFILE_SELECT_LEGACY = 'id, full_name, email, stripe_account_id, google_calendar_connected, organization_id, break_between_lessons, min_booking_hours, subscription_status, manual_subscription_exempt, phone, stripe_onboarding_complete, preferred_locale';
const PROFILE_SELECT_CORE = 'id, full_name, email, stripe_account_id, google_calendar_connected, organization_id, break_between_lessons, min_booking_hours, subscription_status, manual_subscription_exempt, phone';

export const UserProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = async (userId: string): Promise<UserProfile | null> => {
    try {
      const withTimeout = async <T,>(p: any, ms: number): Promise<T> => {
        let t: any;
        const timeout = new Promise<never>((_, reject) => {
          t = setTimeout(() => reject(new Error('Profile fetch timeout')), ms);
        });
        try {
          return await Promise.race([Promise.resolve(p) as Promise<T>, timeout]);
        } finally {
          if (t) clearTimeout(t);
        }
      };

      let result = await withTimeout<any>(
        supabase
          .from('profiles')
          .select(PROFILE_SELECT_WITH_TRIAL)
          .eq('id', userId)
          .maybeSingle(),
        2500
      );
      let { data, error } = result || {};

      const isColumnMissing = (e: any) =>
        e?.code === '42703' || e?.code === 'PGRST204' || e?.message?.includes('does not exist');

      if (error && isColumnMissing(error)) {
        result = await withTimeout<any>(
          supabase
            .from('profiles')
            .select(PROFILE_SELECT_LEGACY)
            .eq('id', userId)
            .maybeSingle(),
          2500
        );
        ({ data, error } = result || {});
      }
      if (error && isColumnMissing(error)) {
        result = await withTimeout<any>(
          supabase
            .from('profiles')
            .select(PROFILE_SELECT_CORE)
            .eq('id', userId)
            .maybeSingle(),
          2500
        );
        ({ data, error } = result || {});
      }

      if (error) {
        // Student accounts may legitimately have no row in public.profiles.
        if (error.code === 'PGRST116') {
          return null;
        }
        console.error('[UserContext] Error fetching profile:', {
          code: error.code,
          message: error.message,
          details: error.details,
          hint: error.hint,
          userId
        });

        // Handle 406 Not Acceptable errors (often due to Accept header issues)
        if (error.code === '406' || error.message.includes('406')) {
          console.warn('[UserContext] 406 error detected - may be a temporary issue, not retrying');
          return null;
        }
        return null;
      }

      console.log('[UserContext] Profile fetched successfully:', data?.full_name);
      return data as UserProfile;
    } catch (err) {
      console.error('[UserContext] Error in fetchProfile:', err);
      return null;
    }
  };

  const refetchProfile = async () => {
    if (user) {
      const profileData = await fetchProfile(user.id);
      setProfile(profileData);
    }
  };

  useEffect(() => {
    // Initial auth check
    const initAuth = async () => {
      try {
        const withTimeout = async <T,>(p: Promise<T>, ms: number): Promise<T> => {
          let t: any;
          const timeout = new Promise<never>((_, reject) => {
            t = setTimeout(() => reject(new Error('Auth init timeout')), ms);
          });
          try {
            return await Promise.race([p, timeout]);
          } finally {
            if (t) clearTimeout(t);
          }
        };

        const { data: { user: currentUser } } = await withTimeout(
          supabase.auth.getUser(),
          8000
        );
        setUser(currentUser);

        if (currentUser) {
          // Don't block UI on profile fetch.
          void fetchProfile(currentUser.id).then((profileData) => {
            if (profileData) setProfile(profileData);
          });
        }
      } catch (err) {
        console.error('Error initializing auth:', err);
      } finally {
        setLoading(false);
      }
    };

    initAuth();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      try {
        console.log('[UserContext] Auth event:', event, {
          hasUser: !!session?.user,
          userId: session?.user?.id,
          email: session?.user?.email,
          timestamp: new Date().toISOString()
        });

        const currentUser = session?.user ?? null;

        // Do NOT clear `user` to null on transient session restore races.
        // Only clear on confirmed SIGNED_OUT (see branch below).
        if (currentUser) {
          setUser(currentUser);
        }

        // Only refetch profile on actual auth changes, not on token refresh
        if (event === 'SIGNED_IN' || event === 'USER_UPDATED') {
          if (currentUser) {
            // Don't block UI on profile fetch.
            void fetchProfile(currentUser.id).then((profileData) => {
              if (profileData) setProfile(profileData);
            });
            // Keep old profile if fetch fails (don't clear it)
          }
        } else if (event === 'SIGNED_OUT') {
          // On a real SIGNED_OUT event we should immediately redirect.
          // Never await extra auth calls here because auth lock races can hang
          // and leave the UI stuck in "loading" on the previous page.
          console.warn('[UserContext] SIGNED_OUT received - redirecting');
          setUser(null);
          setProfile(null);
          sessionStorage.removeItem('tutlio_logout_intent');

          const origin = window.location.origin;
          const path = window.location.pathname || '';
          const targetPath = path.includes('/company') ? '/company/login' : '/login';
          window.location.href = `${origin}${buildPlatformPath(targetPath)}`;
        }
        // For TOKEN_REFRESHED and other events: keep existing profile, just update user
      } finally {
        setLoading(false);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  return (
    <UserContext.Provider value={{ user, profile, loading, refetchProfile }}>
      {children}
    </UserContext.Provider>
  );
};
