import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import LandingNavbar from '@/components/LandingNavbar';
import LandingFooter from '@/components/LandingFooter';
import HeroSection from '@/components/landing/HeroSection';
import StepsSection from '@/components/landing/StepsSection';
import FeaturesSection from '@/components/landing/FeaturesSection';
import IntegrationsSection from '@/components/landing/IntegrationsSection';
import ShowcaseCards from '@/components/landing/ShowcaseCards';
import CtaBanner from '@/components/landing/CtaBanner';
import BlogSection from '@/components/landing/BlogSection';
import { usePlatform } from '@/contexts/PlatformContext';
import SchoolsLanding from '@/pages/SchoolsLanding';
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
    return <SchoolsLanding />;
  }

  return (
    <div className="min-h-screen bg-white flex flex-col font-sans overflow-x-hidden">
      <LandingNavbar />
      <main className="flex-1 pt-[60px] md:pt-[72px]">
        <HeroSection />
        <StepsSection />
        <FeaturesSection />
        <IntegrationsSection />
        <ShowcaseCards />
        <CtaBanner />
        <BlogSection />
      </main>
      <LandingFooter />
    </div>
  );
}
