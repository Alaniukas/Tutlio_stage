import { useState } from 'react';
import { Link } from 'react-router-dom';
import { buildLocalizedPath, useTranslation } from '@/lib/i18n';
import {
  CalendarDays, Users, Users2, CreditCard, BellRing, LineChart, CheckCircle,
  Bell, MessageSquare, Package, Banknote, FileText, FolderOpen, BarChart3,
  Clock, Palette, PenTool,
} from 'lucide-react';
import Reveal from './Reveal';
import type { LandingVariant } from './HeroSection';

const TUTOR_ICONS = [CalendarDays, Users, CreditCard, BellRing];
const SCHOOLS_ICONS = [CalendarDays, Users2, CreditCard, LineChart];

const HL_FEATURES = [
  { key: 'calendar', icon: CalendarDays },
  { key: 'reminders', icon: Bell },
  { key: 'messaging', icon: MessageSquare },
  { key: 'plans', icon: Package },
  { key: 'autoPayments', icon: Banknote },
  { key: 'invoices', icon: FileText },
  { key: 'parents', icon: Users },
  { key: 'files', icon: FolderOpen },
  { key: 'stats', icon: BarChart3 },
  { key: 'waitlist', icon: Clock },
  { key: 'whiteLabel', icon: Palette },
  { key: 'whiteboard', icon: PenTool, comingSoon: true },
];

const TAB_STYLES = [
  { normal: 'bg-indigo-50 text-[#4f46e5]', active: 'bg-[#4f46e5] text-white shadow-md shadow-indigo-200/50', bar: 'bg-[#4f46e5]' },
  { normal: 'bg-slate-50 text-slate-500', active: 'bg-slate-600 text-white shadow-md shadow-slate-200/50', bar: 'bg-slate-500' },
  { normal: 'bg-stone-50 text-stone-500', active: 'bg-stone-600 text-white shadow-md shadow-stone-200/50', bar: 'bg-stone-500' },
  { normal: 'bg-rose-50 text-rose-400', active: 'bg-rose-500 text-white shadow-md shadow-rose-200/50', bar: 'bg-rose-400' },
];
const FRAME_BG = [
  'from-indigo-100 to-indigo-200',
  'from-slate-200 to-slate-300',
  'from-stone-200 to-stone-300',
  'from-rose-100 to-rose-200',
];
const IMAGES = [
  '/landing/calendar.png',
  '/landing/waitlist.png',
  '/landing/finance.png',
  '/landing/student-dashboard.png',
];

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

export default function FeaturesSection({ variant = 'tutor' }: { variant?: LandingVariant }) {
  const { t, locale } = useTranslation();
  const [active, setActive] = useState(0);
  const p = variant === 'schools' ? 'schoolsLanding' : 'landing';
  const ICONS = variant === 'schools' ? SCHOOLS_ICONS : TUTOR_ICONS;
  const ctaLink = variant === 'schools' ? buildLocalizedPath('/kontaktai', locale) : '/register';

  const features = [
    {
      title: t(`${p}.feat.scheduling`),
      desc: t(`${p}.feat.schedulingDesc`),
      heading: t(`${p}.feat.schedulingHeading`),
      highlight: t(`${p}.feat.schedulingHighlight`),
      bullets: [t(`${p}.feat.schedulingB1`), t(`${p}.feat.schedulingB2`), t(`${p}.feat.schedulingB3`)],
    },
    {
      title: t(`${p}.feat.waitlist`),
      desc: t(`${p}.feat.waitlistDesc`),
      heading: t(`${p}.feat.waitlistHeading`),
      highlight: t(`${p}.feat.waitlistHighlight`),
      bullets: [t(`${p}.feat.waitlistB1`), t(`${p}.feat.waitlistB2`), t(`${p}.feat.waitlistB3`)],
    },
    {
      title: t(`${p}.feat.payments`),
      desc: t(`${p}.feat.paymentsDesc`),
      heading: t(`${p}.feat.paymentsHeading`),
      highlight: t(`${p}.feat.paymentsHighlight`),
      bullets: [t(`${p}.feat.paymentsB1`), t(`${p}.feat.paymentsB2`), t(`${p}.feat.paymentsB3`)],
    },
    {
      title: t(`${p}.feat.reminders`),
      desc: t(`${p}.feat.remindersDesc`),
      heading: t(`${p}.feat.remindersHeading`),
      highlight: t(`${p}.feat.remindersHighlight`),
      bullets: [t(`${p}.feat.remindersB1`), t(`${p}.feat.remindersB2`), t(`${p}.feat.remindersB3`)],
    },
  ];

  const f = features[active];

  return (
    <section className="py-16 sm:py-24 lg:py-32 bg-[#fafaf9]">
      <div className="max-w-[1200px] mx-auto px-5 sm:px-6">
        <Reveal>
          <div className="text-center mb-14">
            <span className="inline-block px-4 py-1 rounded-full border border-gray-200 text-[12px] font-semibold text-gray-500 mb-5 tracking-wide uppercase">
              {t(`${p}.featuresBadge`)}
            </span>
            <h2 className="font-display text-3xl md:text-[2.5rem] lg:text-[3rem] text-gray-900 leading-tight mb-4 max-w-2xl mx-auto font-bold tracking-tight">
              {t(`${p}.featuresHeading`)}
              <span className="text-[#4f46e5]">{t(`${p}.featuresHighlight`)}</span>
            </h2>
            <p className="text-gray-500 max-w-xl mx-auto text-[15px] leading-relaxed">{t(`${p}.featuresSubtitle`)}</p>
          </div>
        </Reveal>

        <Reveal delay={100}>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 mb-10 sm:mb-16">
            {features.map((feat, i) => {
              const Icon = ICONS[i];
              const isActive = active === i;
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => setActive(i)}
                  className="relative text-center p-3 sm:p-5 pt-5 sm:pt-7 rounded-2xl transition-all duration-200 hover:bg-white/60"
                >
                  <div className={`absolute top-0 left-1/2 -translate-x-1/2 h-[3px] rounded-full transition-all duration-300 ${
                    isActive ? `w-12 ${TAB_STYLES[i].bar}` : 'w-0 bg-transparent'
                  }`} />
                  <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center mx-auto mb-2 sm:mb-3 transition-all duration-200 ${
                    isActive ? TAB_STYLES[i].active : TAB_STYLES[i].normal
                  }`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <h3 className={`font-semibold mb-0.5 sm:mb-1 text-[12px] sm:text-[13px] transition-colors ${isActive ? 'text-gray-900' : 'text-gray-600'}`}>
                    {feat.title}
                  </h3>
                  <p className="text-[10px] sm:text-[11px] text-gray-400 leading-relaxed hidden sm:block">{feat.desc}</p>
                </button>
              );
            })}
          </div>
        </Reveal>

        <div className="grid lg:grid-cols-2 gap-8 sm:gap-12 items-center" key={active}>
          <div className={`relative rounded-2xl overflow-hidden bg-gradient-to-br ${FRAME_BG[active]} p-4 transition-all duration-300 animate-tab-in`}>
            <MacWindow>
              <img
                src={IMAGES[active]}
                alt={f.title}
                className="w-full h-auto"
                loading="lazy"
              />
            </MacWindow>
          </div>

          <div className="animate-tab-in">
            <h3 className="font-display text-2xl md:text-3xl text-gray-900 leading-tight mb-6 font-bold tracking-tight">
              {f.heading}{' '}
              <span className="text-[#4f46e5]">{f.highlight}</span>
            </h3>
            <div className="space-y-4">
              {f.bullets.map((b, i) => (
                <div key={i} className="flex items-start gap-3">
                  <CheckCircle className="w-[18px] h-[18px] text-emerald-500 flex-shrink-0 mt-0.5" />
                  <p className="text-gray-600 leading-relaxed text-[14px]">{b}</p>
                </div>
              ))}
            </div>
            <Link
              to={ctaLink}
              className="inline-flex items-center mt-8 h-11 px-7 rounded-full bg-[#4f46e5] text-white font-semibold text-[13px] hover:bg-[#4338ca] transition-all duration-200 hover:scale-[1.03] hover:shadow-lg active:scale-[0.98]"
            >
              {t(`${p}.learnMore`)}
            </Link>
          </div>
        </div>

        {/* All features grid */}
        <Reveal delay={200}>
          <div className="text-center mt-20 sm:mt-28 mb-10 sm:mb-14">
            <span className="inline-block px-4 py-1 rounded-full border border-gray-200 text-[12px] font-semibold text-gray-500 mb-5 tracking-wide uppercase">
              {t(`${p}.highlightsBadge`)}
            </span>
            <h2 className="font-display text-3xl md:text-[2.5rem] lg:text-[3rem] text-gray-900 leading-tight mb-4 max-w-2xl mx-auto font-bold tracking-tight">
              {t(`${p}.highlightsTitle`)}
              <span className="text-[#4f46e5]">{t(`${p}.highlightsHighlight`)}</span>
            </h2>
            <p className="text-gray-500 max-w-xl mx-auto text-[15px] leading-relaxed">
              {t(`${p}.highlightsSubtitle`)}
            </p>
          </div>
        </Reveal>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-6">
          {HL_FEATURES.map((feat, i) => {
            const Icon = feat.icon;
            return (
              <Reveal key={feat.key} delay={220 + i * 40}>
                <div className="relative p-5 sm:p-6 rounded-2xl border border-gray-100 bg-white/80 transition-all duration-300 hover:shadow-lg hover:border-gray-200/80 hover:-translate-y-1.5 hover:rotate-[0.5deg]">
                  {feat.comingSoon && (
                    <span className="absolute top-3 right-3 px-2 py-0.5 rounded-full bg-indigo-50 text-[10px] font-semibold text-indigo-500">
                      {t(`${p}.hl.comingSoon`)}
                    </span>
                  )}
                  <div className="w-10 h-10 rounded-xl bg-[#4f46e5]/10 flex items-center justify-center mb-4">
                    <Icon className="w-5 h-5 text-[#4f46e5]" />
                  </div>
                  <h3 className="font-semibold text-gray-900 text-[14px] mb-1.5">
                    {t(`${p}.hl.${feat.key}`)}
                  </h3>
                  <p className="text-[12px] sm:text-[13px] text-gray-500 leading-relaxed">
                    {t(`${p}.hl.${feat.key}Desc`)}
                  </p>
                </div>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}
