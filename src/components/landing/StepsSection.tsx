import { useTranslation } from '@/lib/i18n';
import Reveal from './Reveal';
import type { LandingVariant } from './HeroSection';

const ACCENT = [
  'from-amber-400 to-amber-500',
  'from-emerald-400 to-emerald-500',
  'from-gray-700 to-gray-800',
] as const;

function CardMockup1() {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-3 text-left">
      <div className="flex items-center justify-between mb-3">
        <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Tutlio Dashboard</span>
        <span className="text-gray-300 text-xs">▾</span>
      </div>
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xs text-gray-400">📋</span>
        <span className="text-xs font-medium text-gray-600">Students</span>
        <span className="ml-auto text-gray-300 text-xs">+</span>
      </div>
      <div className="space-y-1.5">
        <div className="h-3 bg-gray-100 rounded-full w-full" />
        <div className="h-3 bg-gray-100 rounded-full w-4/5" />
        <div className="h-3 bg-gray-100 rounded-full w-3/5" />
      </div>
    </div>
  );
}

function CardMockup2() {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-3 text-left">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 bg-emerald-400 rounded-full" />
          <span className="text-xs font-medium text-gray-600">To-do</span>
        </div>
        <span className="text-gray-300 text-xs">+</span>
      </div>
      <div className="bg-white rounded-lg border border-gray-100 p-2.5 shadow-sm">
        <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-600 mb-1.5">High</span>
        <p className="text-xs font-medium text-gray-700 leading-snug">Set Up Lesson Schedule</p>
        <span className="text-[10px] text-gray-400 mt-1 block">•••</span>
      </div>
    </div>
  );
}

function CardMockup3() {
  const initials = [
    { text: 'KJ', color: 'bg-amber-400' },
    { text: 'AR', color: 'bg-emerald-400' },
    { text: 'JD', color: 'bg-gray-400' },
    { text: 'TD', color: 'bg-rose-300' },
  ];
  return (
    <div className="flex items-center justify-center py-4">
      <div className="relative w-36 h-36">
        {initials.map((i, idx) => {
          const positions = [
            'top-0 left-1/2 -translate-x-1/2',
            'top-1/2 right-0 -translate-y-1/2',
            'bottom-0 left-1/2 -translate-x-1/2',
            'top-1/2 left-0 -translate-y-1/2',
          ];
          return (
            <div
              key={i.text}
              className={`absolute ${positions[idx]} w-11 h-11 ${i.color} rounded-full flex items-center justify-center text-white text-xs font-bold shadow-sm border-2 border-white`}
            >
              {i.text}
            </div>
          );
        })}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-14 h-14 bg-gray-50 rounded-full border-2 border-white" />
      </div>
    </div>
  );
}

const MOCKUPS = [CardMockup1, CardMockup2, CardMockup3];

export default function StepsSection({ variant = 'tutor' }: { variant?: LandingVariant }) {
  const { t } = useTranslation();
  const p = variant === 'schools' ? 'schoolsLanding' : 'landing';

  const steps = [
    { title: t(`${p}.step1Title`), desc: t(`${p}.step1Desc`) },
    { title: t(`${p}.step2Title`), desc: t(`${p}.step2Desc`) },
    { title: t(`${p}.step3Title`), desc: t(`${p}.step3Desc`) },
  ];

  return (
    <section className="py-16 sm:py-24 lg:py-32 bg-white">
      <div className="max-w-[1200px] mx-auto px-5 sm:px-6">
        <Reveal>
          <div className="max-w-lg mb-14">
            <h2 className="font-display text-3xl md:text-[2.5rem] text-gray-900 leading-tight mb-4 font-bold tracking-tight">
              {t(`${p}.stepsTitle`)}
            </h2>
            <p className="text-gray-500 text-[15px] leading-relaxed">{t(`${p}.stepsDesc`)}</p>
          </div>
        </Reveal>

        <div className="grid md:grid-cols-3 gap-6">
          {steps.map((step, i) => {
            const Mockup = MOCKUPS[i];
            return (
              <Reveal key={i} delay={i * 150}>
                <div className="relative rounded-2xl overflow-hidden bg-white border border-gray-100 hover:border-gray-200 shadow-sm hover:shadow-md transition-all duration-300 h-full">
                  <div className={`h-1 bg-gradient-to-r ${ACCENT[i]}`} />
                  <div className="px-6 pt-5 pb-2">
                    <Mockup />
                  </div>
                  <div className="px-6 pb-7">
                    <h3 className="font-display text-base font-semibold text-gray-900 mb-1.5">{step.title}</h3>
                    <p className="text-sm text-gray-500 leading-relaxed">{step.desc}</p>
                  </div>
                </div>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}
