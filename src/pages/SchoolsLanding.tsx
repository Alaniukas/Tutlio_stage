import LandingNavbar from '@/components/LandingNavbar';
import LandingFooter from '@/components/LandingFooter';
import HeroSection from '@/components/landing/HeroSection';
import StepsSection from '@/components/landing/StepsSection';
import FeaturesSection from '@/components/landing/FeaturesSection';
import IntegrationsSection from '@/components/landing/IntegrationsSection';
import ShowcaseCards from '@/components/landing/ShowcaseCards';
import CtaBanner from '@/components/landing/CtaBanner';
import BlogSection from '@/components/landing/BlogSection';

export default function SchoolsLanding() {
  return (
    <div className="min-h-screen bg-white flex flex-col font-sans overflow-x-hidden">
      <LandingNavbar />
      <main className="flex-1 pt-[60px] md:pt-[72px]">
        <HeroSection variant="schools" />
        <StepsSection variant="schools" />
        <FeaturesSection variant="schools" />
        <IntegrationsSection variant="schools" />
        <ShowcaseCards variant="schools" />
        <CtaBanner variant="schools" />
        <BlogSection />
      </main>
      <LandingFooter />
    </div>
  );
}
