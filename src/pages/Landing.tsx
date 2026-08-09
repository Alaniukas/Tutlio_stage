import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePlatform } from '@/contexts/PlatformContext';
import NewLanding from '@/pages/NewLanding';
import { supabase } from '@/lib/supabase';
import { isStandalonePwa, loginPathForLastPortal } from '@/lib/pwaPortal';

/** Pagrindinio `/login` vaidmens pasirinkimui: kur siųsti „įmonės / mokyklos“ administratorių. */
const ORG_ADMIN_LOGIN_STORAGE_KEY = 'tutlio_org_admin_login';

export default function Landing() {
  const { platform } = usePlatform();
  const navigate = useNavigate();

  // Installed PWA: a logged-out user should see the login of the portal this
  // device last used (regular /login or /school | /company), not the marketing page.
  useEffect(() => {
    if (!isStandalonePwa()) return;
    let cancelled = false;
    void supabase.auth.getSession().then(({ data: { session } }) => {
      if (!cancelled && !session?.user) navigate(loginPathForLastPortal(), { replace: true });
    });
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  useEffect(() => {
    try {
      if (platform === 'schools' || platform === 'teachers') {
        sessionStorage.setItem(ORG_ADMIN_LOGIN_STORAGE_KEY, '/school/login');
      } else {
        sessionStorage.setItem(ORG_ADMIN_LOGIN_STORAGE_KEY, '/company/login');
      }
    } catch {
      /* ignore */
    }
  }, [platform]);

  if (platform === 'schools' || platform === 'teachers') {
    // `/schools` is the public marketing surface. Keep `/school` reserved for
    // the authenticated admin portal, which is routed separately in App.tsx.
    return <NewLanding initialAudience="biz" />;
  }

  return <NewLanding />;
}
