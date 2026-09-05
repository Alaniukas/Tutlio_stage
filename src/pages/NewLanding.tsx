import { useEffect } from 'react';
import { useTranslation } from '@/lib/i18n';
import LandingNavbar from '@/components/LandingNavbar';
import LandingFooter from '@/components/LandingFooter';
import type { LandingAudience } from '@/components/landing/v2/audience';
import HeroSection from '@/components/landing/v2/HeroSection';
import LogoWall from '@/components/landing/v2/LogoWall';
import OldVsNewComparison from '@/components/landing/v2/OldVsNewComparison';
import FeaturesBento from '@/components/landing/v2/FeaturesBento';
import CustomizationSection, { CustomizationCallout } from '@/components/landing/v2/CustomizationSection';
import PillarsSummary from '@/components/landing/v2/PillarsSummary';
import VideoSection from '@/components/landing/v2/VideoSection';
import CaseStudySection from '@/components/landing/v2/CaseStudy';
import Testimonials from '@/components/landing/v2/Testimonials';
import FaqSection from '@/components/landing/v2/FaqSection';
import FinalCta from '@/components/landing/v2/FinalCta';
import { applyPageDocumentMeta } from '@/lib/documentMeta';
import { getSeoMeta } from '@/lib/seoMeta';
import { marketingAudienceFromLanding, storeMarketingAudience } from '@/lib/marketingAudience';

/**
 * Marketing landing, one audience per URL: `/` renders the agency/school
 * pitch (audience="biz"), `/for-tutors` the solo-tutor pitch
 * (audience="solo"). There is no audience toggle: each page speaks to one
 * audience and the navbar/footer link the two. The bot renderer in
 * api/page-render.ts mirrors the section order of both variants.
 */
export default function NewLanding({ audience }: { audience: LandingAudience }) {
  const { locale } = useTranslation();
  const marketingAudience = marketingAudienceFromLanding(audience);

  // Persist the audience so navbar and footer links that open pricing
  // without a query retain the matching plans.
  useEffect(() => {
    storeMarketingAudience(marketingAudience);
  }, [marketingAudience]);

  // The solo page has its own search metadata; the homepage keeps the
  // default document meta applied by LocaleProvider.
  useEffect(() => {
    if (audience !== 'solo') return;
    const meta = getSeoMeta(locale, 'forTutors');
    applyPageDocumentMeta(meta.title, meta.description);
  }, [audience, locale]);

  const isSolo = audience === 'solo';

  return (
    <div className="min-h-screen bg-white flex flex-col font-sans overflow-x-hidden">
      <LandingNavbar audience={marketingAudience} />
      <main className="flex-1 pt-[60px] md:pt-[72px]">
        <HeroSection audience={audience} />
        <LogoWall />
        <OldVsNewComparison />
        <FeaturesBento audience={audience} />
        {isSolo ? <CustomizationCallout /> : <CustomizationSection />}
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
