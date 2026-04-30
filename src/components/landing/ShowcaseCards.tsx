import { Link } from 'react-router-dom';
import { Check } from 'lucide-react';
import { buildLocalizedPath, useTranslation } from '@/lib/i18n';
import Reveal from './Reveal';
import type { LandingVariant } from './HeroSection';

function MacWindow({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl overflow-hidden bg-gray-900 shadow-xl">
      <div className="flex items-center gap-1.5 px-4 py-2 bg-gray-900">
        <span className="w-2.5 h-2.5 rounded-full bg-[#ff5f57]" />
        <span className="w-2.5 h-2.5 rounded-full bg-[#febc2e]" />
        <span className="w-2.5 h-2.5 rounded-full bg-[#28c840]" />
      </div>
      {children}
    </div>
  );
}

function CheckItem({ text, color }: { text: string; color: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className={`w-5 h-5 rounded-full ${color} flex items-center justify-center flex-shrink-0`}>
        <Check className="w-3 h-3 text-white" strokeWidth={3} />
      </div>
      <span className="font-medium text-gray-800 text-[14px]">{text}</span>
    </div>
  );
}

export default function ShowcaseCards({ variant = 'tutor' }: { variant?: LandingVariant }) {
  const { t, locale } = useTranslation();
  const p = variant === 'schools' ? 'schoolsLanding' : 'landing';
  const ctaLink = variant === 'schools' ? buildLocalizedPath('/kontaktai', locale) : '/register';

  const checks1 = [
    t(`${p}.showcase1Check1`),
    t(`${p}.showcase1Check2`),
    t(`${p}.showcase1Check3`),
  ];
  const checks2 = [
    t(`${p}.showcase2Check1`),
    t(`${p}.showcase2Check2`),
    t(`${p}.showcase2Check3`),
  ];

  return (
    <section className="py-16 sm:py-24 lg:py-32 bg-[#fafaf9]">
      <div className="max-w-[1200px] mx-auto px-5 sm:px-6 space-y-8 sm:space-y-12">
        <Reveal>
          <div className="grid lg:grid-cols-2 items-center gap-0 rounded-3xl overflow-hidden bg-emerald-50 border border-emerald-100/80">
            <div className="p-4 sm:p-6 lg:p-10">
              <MacWindow>
                <img src="/landing/students.png" alt={t(`${p}.showcase1Alt`)} className="w-full h-auto" loading="lazy" />
              </MacWindow>
            </div>
            <div className="p-5 sm:p-8 lg:p-12">
              <h3 className="font-display text-2xl md:text-[1.75rem] text-gray-900 leading-snug mb-4 font-bold tracking-tight">
                {t(`${p}.showcase1Title`)}
              </h3>
              <p className="text-gray-500 text-[14px] leading-relaxed mb-6">{t(`${p}.showcase1Desc`)}</p>
              <div className="space-y-3 mb-8">
                {checks1.map((c, i) => <CheckItem key={i} text={c} color="bg-emerald-500" />)}
              </div>
              <Link to={ctaLink} className="inline-flex items-center h-11 px-7 rounded-full bg-[#4f46e5] text-white font-semibold text-[13px] hover:bg-[#4338ca] transition-all duration-200 hover:scale-[1.03] hover:shadow-lg active:scale-[0.98]">
                {t(`${p}.learnMore`)}
              </Link>
            </div>
          </div>
        </Reveal>

        <Reveal delay={200}>
          <div className="grid lg:grid-cols-2 items-center gap-0 rounded-3xl overflow-hidden bg-purple-50 border border-purple-100/80">
            <div className="p-5 sm:p-8 lg:p-12 order-2 lg:order-1">
              <h3 className="font-display text-2xl md:text-[1.75rem] text-gray-900 leading-snug mb-4 font-bold tracking-tight">
                {t(`${p}.showcase2Title`)}
              </h3>
              <p className="text-gray-500 text-[14px] leading-relaxed mb-6">{t(`${p}.showcase2Desc`)}</p>
              <div className="space-y-3 mb-8">
                {checks2.map((c, i) => <CheckItem key={i} text={c} color="bg-purple-400" />)}
              </div>
              <Link to={ctaLink} className="inline-flex items-center h-11 px-7 rounded-full bg-[#4f46e5] text-white font-semibold text-[13px] hover:bg-[#4338ca] transition-all duration-200 hover:scale-[1.03] hover:shadow-lg active:scale-[0.98]">
                {t(`${p}.learnMore`)}
              </Link>
            </div>
            <div className="p-4 sm:p-6 lg:p-10 order-1 lg:order-2">
              <MacWindow>
                <img src="/landing/calendar.png" alt={t(`${p}.showcase2Alt`)} className="w-full h-auto" loading="lazy" />
              </MacWindow>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
