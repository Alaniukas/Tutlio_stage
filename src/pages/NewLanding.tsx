import { useEffect, useState } from 'react';
import { useTranslation } from '@/lib/i18n';
import LandingNavbar from '@/components/LandingNavbar';
import LandingFooter from '@/components/LandingFooter';
import type { LandingAudience } from '@/components/landing/v2/audience';
import HeroSection from '@/components/landing/v2/HeroSection';
import LogoWall from '@/components/landing/v2/LogoWall';
import OldVsNewComparison from '@/components/landing/v2/OldVsNewComparison';
import FeaturesBento from '@/components/landing/v2/FeaturesBento';
import PillarsSummary from '@/components/landing/v2/PillarsSummary';
import VideoSection from '@/components/landing/v2/VideoSection';
import CaseStudySection from '@/components/landing/v2/CaseStudy';
import Testimonials from '@/components/landing/v2/Testimonials';
import FaqSection from '@/components/landing/v2/FaqSection';
import FinalCta from '@/components/landing/v2/FinalCta';
import {
  marketingAudienceFromLanding,
  resolveLandingAudience,
  storeMarketingAudience,
} from '@/lib/marketingAudience';

/**
 * Primary tutor landing page. The /new-landing route remains as a direct alias.
 * Audience toggle drives hero + mid-page demos.
 * Vizitinė kortelė is woven into the solo product animation (not a separate promo block).
 */
export default function NewLanding({
  initialAudience,
}: {
  initialAudience?: LandingAudience;
}) {
  const { locale } = useTranslation();
  const [audience, setAudience] = useState<LandingAudience>(() =>
    resolveLandingAudience(initialAudience),
  );
  const marketingAudience = marketingAudienceFromLanding(audience);

  // Platform landing pages have an explicit audience. Persist it so navbar and
  // footer links that open pricing without a query retain the matching plans.
  useEffect(() => {
    if (initialAudience) {
      storeMarketingAudience(marketingAudienceFromLanding(initialAudience));
    }
  }, [initialAudience]);

  const handleAudienceChange = (nextAudience: LandingAudience) => {
    setAudience(nextAudience);
    storeMarketingAudience(marketingAudienceFromLanding(nextAudience));
  };

  return (
    <div className="min-h-screen bg-white flex flex-col font-sans overflow-x-hidden">
      <LandingNavbar audience={marketingAudience} />
      <main className="flex-1 pt-[60px] md:pt-[72px]">
        <HeroSection audience={audience} onAudienceChange={handleAudienceChange} />
        <LogoWall />
        <OldVsNewComparison />
        <FeaturesBento audience={audience} />
        <PillarsSummary />
        <VideoSection audience={audience} />
        {/* These fictional English fallbacks are not approved Thai customer claims. */}
        {locale !== 'th' && <><CaseStudySection /><Testimonials /></>}
        <FaqSection />
        <FinalCta audience={audience} />
      </main>
      <LandingFooter />
    </div>
  );
}
