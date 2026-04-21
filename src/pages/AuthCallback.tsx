import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useTranslation } from '@/lib/i18n';

export default function AuthCallback() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [status, setStatus] = useState<string>(t('auth.confirming'));

  useEffect(() => {
    let done = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    const navigateSafe = (path: string) => {
      if (done) return;
      done = true;
      if (timeoutId !== undefined) clearTimeout(timeoutId);
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
      navigate(path, { replace: true });
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setStatus(t('auth.redirecting'));
        navigateSafe('/reset-password');
      }
    });

    void (async () => {
      if (typeof window === 'undefined') return;

      const hash = window.location.hash?.replace(/^#/, '') || '';
      const params = new URLSearchParams(hash);
      const access_token = params.get('access_token');
      const refresh_token = params.get('refresh_token');
      const type = params.get('type');
      const wantsReset = new URLSearchParams(window.location.search).get('next') === '/reset-password';

      if (access_token && refresh_token) {
        setStatus(t('auth.redirecting'));
        const { error } = await supabase.auth.setSession({ access_token, refresh_token });
        window.history.replaceState(null, '', window.location.pathname + window.location.search);
        if (done) return;
        if (!error && (type === 'recovery' || wantsReset)) {
          navigateSafe('/reset-password');
        } else if (!error) {
          const { data: { user } } = await supabase.auth.getUser();
          if (user?.user_metadata?.org_token) {
            navigateSafe('/dashboard');
          } else {
            navigateSafe('/login');
          }
        } else {
          navigateSafe('/login');
        }
        return;
      }

      if (wantsReset) {
        for (let i = 0; i < 15 && !done; i++) {
          await new Promise((r) => setTimeout(r, 350));
          const { data: { session } } = await supabase.auth.getSession();
          if (session?.user) {
            navigateSafe('/reset-password');
            return;
          }
        }
        if (!done) navigateSafe('/login');
        return;
      }

      if (done) return;
      timeoutId = setTimeout(() => navigateSafe('/login'), 3000);
    })();

    return () => {
      done = true;
      if (timeoutId !== undefined) clearTimeout(timeoutId);
      subscription.unsubscribe();
    };
  }, [navigate]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-violet-950 via-violet-900 to-indigo-900 flex flex-col items-center justify-center p-6">
      <div className="w-12 h-12 border-2 border-white/30 border-t-white rounded-full animate-spin mb-4" />
      <p className="text-white font-medium">{status}</p>
      <p className="text-violet-300 text-sm mt-1 text-center max-w-sm">
        {t('auth.callbackHint')}
      </p>
    </div>
  );
}
