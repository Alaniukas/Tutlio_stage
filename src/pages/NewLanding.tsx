import LandingNavbar from '@/components/LandingNavbar';
import LandingFooter from '@/components/LandingFooter';
import HeroSection from '@/components/landing/v2/HeroSection';
import LogoWall from '@/components/landing/v2/LogoWall';
import OldVsNewComparison from '@/components/landing/v2/OldVsNewComparison';
import FeaturesBento from '@/components/landing/v2/FeaturesBento';
import PillarsSummary from '@/components/landing/v2/PillarsSummary';
import VideoSection from '@/components/landing/v2/VideoSection';
import CaseStudySection from '@/components/landing/v2/CaseStudy';
import BookingLinkCta from '@/components/landing/v2/BookingLinkCta';
import Testimonials from '@/components/landing/v2/Testimonials';
import FaqSection from '@/components/landing/v2/FaqSection';
import FinalCta from '@/components/landing/v2/FinalCta';

/**
 * The rebuilt landing page, parked at /new-landing while the current one stays
 * on /. Deliberately has none of Landing.tsx's entry logic — no installed-PWA
 * redirect and no /schools branch — so the URL always shows this page and
 * nothing else, which is the whole point of a preview.
 *
 * Crawlers never see it: middleware.ts has no SSR destination for this path, so
 * bots get /api/not-found (404 + noindex) and it stays out of the sitemap.
 *
 * To promote it, move this <main> into Landing.tsx and delete this file.
 */
export default function NewLanding() {
  return (
    <div className="min-h-screen bg-white flex flex-col font-sans overflow-x-hidden">
      <LandingNavbar />
      <main className="flex-1 pt-[60px] md:pt-[72px]">
        <HeroSection />
        <LogoWall />
        <OldVsNewComparison />
        <FeaturesBento />
        <PillarsSummary />
        {/* Video, success story and testimonials all read their content from
            components/landing/v2/socialProof.ts. They currently show bracketed
            placeholders — replace those with real, attributable content there. */}
        <VideoSection />
        <CaseStudySection />
        <BookingLinkCta />
        <Testimonials />
        <FaqSection />
        <FinalCta />
      </main>
      <LandingFooter />
    </div>
  );
}
