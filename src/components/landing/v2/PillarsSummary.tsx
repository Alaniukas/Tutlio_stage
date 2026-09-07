import { Link } from 'react-router-dom';
import { ArrowRight, CalendarDays, Clock, CreditCard, GraduationCap } from 'lucide-react';
import { buildLocalizedPath, useTranslation } from '@/lib/i18n';
import { FEATURE_PAGES } from '@/lib/featurePages';
import Reveal from '../Reveal';
import { getLandingDemoPersonas } from './demoPersonas';

/* ---------- mini-UI previews: simplified product surfaces, not screenshots ---------- */

function StudentsPreview() {
  const { locale, t } = useTranslation();
  const personas = getLandingDemoPersonas(locale);
  const rows = [
    { name: personas.students[0], meta: '12', tone: 'bg-violet-100 text-violet-700', badge: 'bg-emerald-50 text-emerald-600' },
    { name: personas.students[1], meta: '8', tone: 'bg-blue-100 text-blue-700', badge: 'bg-blue-50 text-blue-600' },
  ];
  return (
    <div className="flex h-full flex-col gap-1.5 p-1.5">
      <div className="grid flex-1 grid-cols-2 gap-1.5">
        {rows.map((r) => (
          <div key={r.name} className="flex flex-col items-center justify-center rounded-lg bg-zinc-50 p-2">
            <span className={`flex h-10 w-10 items-center justify-center rounded-full text-[11px] font-bold ${r.tone}`}>
              {r.name.replace(/[^\p{L}]+/gu, '').slice(0, 2).toUpperCase()}
            </span>
            <span className="mt-1.5 text-[7px] font-semibold text-zinc-800">{r.name}</span>
            <span className={`mt-1 rounded-full px-1.5 py-0.5 text-[5px] font-medium ${r.badge}`}>{r.meta}</span>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-around border-t border-zinc-100 bg-zinc-50/60 px-2 py-1.5">
        {[
          { key: 'students', value: '47', label: t('landing.insideStudents') },
          { key: 'parents', value: '12', label: t('landing.v2.animBizParents') },
          { key: 'retention', value: '94%', label: t('landing.v2.demo.retention') },
        ].map((item) => (
          <div key={item.key} className="text-center">
            <div className="text-[9px] font-bold text-zinc-800">{item.value}</div>
            <div className="text-[5px] text-zinc-400">{item.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function CalendarPreview() {
  const { t } = useTranslation();
  const weekdays = t('landing.v2.demo.weekdays').split('|');
  const cells: (string | null)[][] = [
    [t('landing.v2.demo.subjectPhysics'), null, null],
    [null, t('landing.v2.demo.subjectMath'), t('landing.v2.demo.subjectEnglish')],
    [null, t('landing.v2.demo.subjectChemistry'), t('landing.v2.demo.subjectHistory')],
    [t('landing.v2.demo.subjectBiology'), null, null],
  ];
  const tones = ['bg-emerald-50 border-emerald-500', 'bg-blue-50 border-blue-500', 'bg-amber-50 border-amber-500'];
  return (
    <div className="grid h-full grid-cols-[16px_1fr_1fr_1fr] grid-rows-[18px_1fr_1fr_1fr_1fr]">
      <div className="border-b border-r border-zinc-100 bg-zinc-50" />
      {weekdays.slice(0, 3).map((d, i) => (
        <div key={d} className={`flex items-center justify-center border-b border-zinc-100 bg-zinc-50 ${i < 2 ? 'border-r' : ''}`}>
          <span className="text-[6px] font-medium text-zinc-500">{d}</span>
        </div>
      ))}
      {cells.map((row, r) => (
        <div key={r} className="contents">
          <div className="flex items-center justify-end border-b border-r border-zinc-100 bg-zinc-50 pr-0.5">
            <span className="text-[5px] text-zinc-400">{9 + r}</span>
          </div>
          {row.map((label, c) => (
            <div key={c} className={`relative border-b border-zinc-100 p-0.5 ${c < 2 ? 'border-r' : ''}`}>
              {label && (
                <div className={`h-full overflow-hidden rounded-sm border-l-2 px-1 py-0.5 ${tones[(r + c) % 3]}`}>
                  <span className="text-[5px] font-semibold text-zinc-700">{label}</span>
                </div>
              )}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function PaymentsPreview() {
  const { locale, t } = useTranslation();
  const personas = getLandingDemoPersonas(locale);
  const lines = [
    [`${t('landing.v2.demo.subjectMath')} (4×)`, '220 €', 'bg-blue-500'],
    [`${t('landing.v2.demo.subjectPhysics')} (2×)`, '110 €', 'bg-violet-500'],
    [`${t('landing.v2.demo.subjectEnglish')} (3×)`, '165 €', 'bg-emerald-500'],
  ];
  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-1 flex-col p-2">
        <div className="mb-2 flex items-center justify-between">
          <div>
            <div className="text-[8px] font-bold text-zinc-800">INV-2026-047</div>
            <div className="text-[5px] text-zinc-400">{personas.families[0]}</div>
          </div>
          <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[5px] font-semibold text-emerald-600">{t('dash.paidLabel')}</span>
        </div>
        <div className="flex flex-1 flex-col justify-around">
          {lines.map(([label, amount, dot]) => (
            <div key={label} className="flex items-center justify-between border-b border-zinc-100 py-1">
              <div className="flex items-center gap-1.5">
                <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} />
                <span className="text-[6px] text-zinc-600">{label}</span>
              </div>
              <span dir="ltr" className="text-[6px] font-medium text-zinc-700">{amount}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="flex items-center justify-between bg-emerald-50/60 px-2 py-1.5">
        <span className="text-[7px] font-medium text-emerald-700">{t('common.total')}</span>
        <span dir="ltr" className="text-[10px] font-bold text-emerald-700">495 €</span>
      </div>
    </div>
  );
}

function WaitlistPreview() {
  const { locale, t } = useTranslation();
  const personas = getLandingDemoPersonas(locale);
  const weekdays = t('landing.v2.demo.weekdays').split('|');
  const queue = [
    { name: personas.students[0], slot: `${weekdays[1]} 16:00`, state: 'offered' },
    { name: personas.students[1], slot: `${weekdays[1]} 16:00`, state: 'queued' },
    { name: personas.students[2], slot: `${weekdays[3]} 17:00`, state: 'queued' },
  ];
  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-1 flex-col p-2">
        <div className="mb-2 flex items-center gap-1">
          <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
          <span className="text-[8px] font-bold text-zinc-800">{t('landing.v2.wlPipeline')}</span>
          <span className="ml-auto rounded-full bg-amber-100 px-1.5 py-0.5 text-[5px] font-bold text-amber-700">3</span>
        </div>
        <div className="flex flex-1 flex-col justify-around">
          {queue.map((q, i) => (
            <div
              key={q.name}
              className={`rounded-md border px-1.5 py-1 ${
                q.state === 'offered' ? 'border-amber-300 bg-amber-50' : 'border-zinc-100 bg-white'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[6px] font-semibold text-zinc-800">{i + 1}. {q.name}</span>
                {q.state === 'offered' && (
                  <span className="rounded bg-amber-500 px-1 py-px text-[4px] font-bold text-white">{t('landing.v2.wlOffered')}</span>
                )}
              </div>
              <span className="text-[5px] text-zinc-400">{q.slot}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="flex items-center justify-between bg-amber-50/70 px-2 py-1.5">
        <span className="text-[7px] font-medium text-amber-800">{t('landing.v2.demo.autoFilled')}</span>
        <span className="text-[10px] font-bold text-amber-800">2/3</span>
      </div>
    </div>
  );
}

const PILLARS = [
  {
    titleKey: 'landing.insideStudents',
    subKey: 'landing.v2.pillar.studentsSub',
    icon: GraduationCap,
    iconBg: 'bg-zinc-900',
    panelBg: 'bg-violet-50/60',
    path: '/features',
    Preview: StudentsPreview,
  },
  {
    titleKey: 'landing.feature.calendar',
    subKey: 'landing.v2.pillar.calendarSub',
    icon: CalendarDays,
    iconBg: 'bg-zinc-900',
    panelBg: 'bg-blue-50/60',
    path: FEATURE_PAGES.calendar.path,
    Preview: CalendarPreview,
  },
  {
    titleKey: 'landing.feature.payments',
    subKey: 'landing.v2.pillar.paymentsSub',
    icon: CreditCard,
    iconBg: 'bg-zinc-900',
    panelBg: 'bg-emerald-50/60',
    path: FEATURE_PAGES.payments.path,
    Preview: PaymentsPreview,
  },
  {
    titleKey: 'landing.feature.waitlist',
    subKey: 'landing.v2.pillar.waitlistSub',
    icon: Clock,
    iconBg: 'bg-zinc-900',
    panelBg: 'bg-amber-50/60',
    path: FEATURE_PAGES.waitlist.path,
    Preview: WaitlistPreview,
  },
] as const;

export default function PillarsSummary() {
  const { t, locale } = useTranslation();

  return (
    <section className="bg-white py-16 sm:py-20 lg:py-24">
      <div className="mx-auto w-full max-w-[1224px] px-5 sm:px-6 lg:px-8">
        <Reveal>
          <div className="mb-10 text-center sm:mb-12 lg:mb-14">
            <h2 className="font-display text-2xl font-semibold leading-[1.3] tracking-[-0.5px] text-zinc-900 sm:text-[32px] sm:tracking-[-1px] lg:text-[40px]">
              {t('landing.v2.pillarsTitle')}
            </h2>
            <p className="mx-auto mt-3 max-w-2xl text-[15px] leading-[1.6] text-zinc-600 sm:mt-4 sm:text-base">
              {t('landing.v2.pillarsSub')}
            </p>
          </div>
        </Reveal>

        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4 lg:gap-5">
          {PILLARS.map((pillar, i) => {
            const Icon = pillar.icon;
            const Preview = pillar.Preview;
            return (
              <Reveal key={pillar.titleKey} delay={i * 90}>
                <Link to={buildLocalizedPath(pillar.path, locale)} className="group block h-full">
                  <div className="relative h-[200px] overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm transition-all duration-200 group-hover:border-zinc-300 group-hover:shadow-lg sm:h-[240px] lg:h-[280px]">
                    <div className={`h-[calc(100%-56px)] overflow-hidden lg:h-[calc(100%-72px)] ${pillar.panelBg}`}>
                      <div className="h-full w-full p-2">
                        <div className="h-full w-full overflow-hidden rounded-lg border border-zinc-200 bg-white">
                          <Preview />
                        </div>
                      </div>
                    </div>
                    <div className="absolute inset-x-0 bottom-0 flex h-14 flex-col justify-center gap-0.5 border-t border-zinc-100 bg-white px-3 lg:h-[72px] lg:px-4">
                      <div className="flex items-center gap-2 lg:gap-2.5">
                        <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md lg:h-7 lg:w-7 lg:rounded-lg ${pillar.iconBg}`}>
                          <Icon className="h-3.5 w-3.5 text-white lg:h-4 lg:w-4" />
                        </span>
                        <span className="truncate text-sm font-semibold text-zinc-900 lg:text-[15px]">
                          {t(pillar.titleKey)}
                        </span>
                        <ArrowRight className="ml-auto hidden h-4 w-4 translate-x-1 text-zinc-400 opacity-0 transition-all duration-200 group-hover:translate-x-0 group-hover:opacity-100 lg:block" />
                      </div>
                      <span className="truncate text-[10px] text-zinc-500 lg:pl-[38px] lg:text-xs">
                        {t(pillar.subKey)}
                      </span>
                    </div>
                  </div>
                </Link>
              </Reveal>
            );
          })}
        </div>

        <Reveal delay={200}>
          <div className="mt-10 flex justify-center sm:mt-12 lg:mt-14">
            <Link
              to={buildLocalizedPath('/features', locale)}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-zinc-900 px-6 py-3 text-base font-semibold text-white shadow-sm transition-colors duration-200 hover:bg-zinc-800"
            >
              {t('landing.v2.exploreAll')}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
