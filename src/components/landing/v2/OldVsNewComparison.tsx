import { Link } from 'react-router-dom';
import {
  BellRing, Calculator, CalendarDays, CheckCircle2, Clock, CreditCard,
  FolderOpen, GraduationCap, MessageSquare, PenTool, Table2, TriangleAlert, Users,
} from 'lucide-react';
import { buildLocalizedPath, useTranslation } from '@/lib/i18n';
import { FEATURE_PAGES } from '@/lib/featurePages';
import Reveal from '../Reveal';

/**
 * Scattered tools on the "old way" panel, positioned as % of the panel box.
 * The three real products carry their own brand marks; the generic ones use icons.
 */
const OLD_TOOLS: {
  key: string;
  icon?: typeof Clock;
  img?: string;
  cropImage?: boolean;
  label: string;
  left: number;
  top: number;
}[] = [
  { key: 'reminders', icon: Clock, label: 'Reminders', left: 50, top: 22 },
  { key: 'messages', img: '/whatsapp-support-icon.png', cropImage: true, label: 'WhatsApp', left: 82, top: 35 },
  { key: 'spreadsheets', img: '/logos/apps/excel.svg', label: 'Excel', left: 18, top: 42 },
  { key: 'calculator', icon: Calculator, label: 'Calculator', left: 72, top: 72 },
  { key: 'contacts', icon: Users, label: 'Contacts', left: 28, top: 65 },
  { key: 'calendar', img: '/logos/apps/google-calendar.svg', label: 'Google Calendar', left: 52, top: 52 },
];

/** Dashed connectors between the scattered tools — the "everything is wired by hand" look. */
const CONNECTORS: [number, number, number, number, number][] = [
  [50, 22, 82, 35, 0.4], [18, 42, 28, 65, 0.4], [52, 52, 72, 72, 0.4],
  [50, 22, 52, 52, 0.4], [52, 52, 82, 35, 0.3], [52, 52, 18, 42, 0.3],
  [52, 52, 28, 65, 0.3], [18, 42, 50, 22, 0.25], [82, 35, 72, 72, 0.25],
  [28, 65, 72, 72, 0.25], [18, 42, 72, 72, 0.2], [50, 22, 28, 65, 0.2],
];

const ALERTS = [
  { left: 67, top: 43.5 }, { left: 23, top: 53.5 },
  { left: 62, top: 62 }, { left: 51, top: 37 },
];

/** Outer orbit ring — supporting Tutlio features, 6 slots at 60° steps from the top. */
const OUTER_ORBIT = [
  { icon: BellRing, labelKey: 'landing.feature.reminders', path: FEATURE_PAGES.reminders.path },
  { icon: FolderOpen, labelKey: 'landing.feature.comments', path: FEATURE_PAGES.comments.path },
  { icon: Clock, labelKey: 'landing.feature.cancellation', path: FEATURE_PAGES.cancellation.path },
  { icon: PenTool, labelKey: 'landing.hl.whiteboard', path: '/features' },
  { icon: Users, labelKey: 'landing.hl.parents', path: '/features' },
  { icon: MessageSquare, labelKey: 'landing.hl.messaging', path: '/features' },
] as const;

/** Inner orbit ring — the four pillars, 4 slots at 90° steps. */
const INNER_ORBIT = [
  { icon: GraduationCap, labelKey: 'landing.insideStudents', tone: 'bg-violet-50 border-violet-200', iconTone: 'text-violet-600' },
  { icon: CalendarDays, labelKey: 'landing.feature.calendar', tone: 'bg-blue-50 border-blue-200', iconTone: 'text-blue-600' },
  { icon: CreditCard, labelKey: 'landing.feature.payments', tone: 'bg-emerald-50 border-emerald-200', iconTone: 'text-emerald-600' },
  { icon: Clock, labelKey: 'landing.feature.waitlist', tone: 'bg-amber-50 border-amber-200', iconTone: 'text-amber-600' },
] as const;

/** cos/sin for 60° steps starting at the top (-90°), as multipliers of the radius. */
const SIX_STEP = [
  [0, -1], [0.866, -0.5], [0.866, 0.5], [0, 1], [-0.866, 0.5], [-0.866, -0.5],
];
const FOUR_STEP = [[0, -1], [1, 0], [0, 1], [-1, 0]];

function orbitTransform([cx, cy]: number[]): string {
  const x = cx === 0 ? '0px' : `var(--orbit-r) * ${cx}`;
  const y = cy === 0 ? '0px' : `var(--orbit-r) * ${cy}`;
  return `translate(calc(-50% + ${x}), calc(-50% + ${y}))`;
}

export default function OldVsNewComparison() {
  const { t, locale } = useTranslation();

  return (
    <section className="bg-white py-16 sm:py-20 lg:py-24">
      <div className="mx-auto w-full max-w-[1224px] px-5 sm:px-6 lg:px-8">
        <Reveal>
          <div className="mb-12 text-center lg:mb-16">
            <h2 className="mx-auto max-w-3xl text-[1.65rem] font-semibold leading-snug text-zinc-900 sm:text-3xl lg:text-[2.15rem]">
              {t('landing.v2.compareTitle')}
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-base font-normal leading-relaxed text-zinc-500 sm:mt-4 sm:text-lg">
              {t('landing.v2.compareSub')}
            </p>
          </div>
        </Reveal>

        <div className="grid gap-6 lg:grid-cols-2 lg:gap-0">
          {/* The old way */}
          <Reveal>
            <div className="relative h-[560px] overflow-hidden rounded-2xl border border-zinc-300 bg-zinc-100 sm:h-[520px] lg:h-[560px] lg:rounded-r-none">
              <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
                {CONNECTORS.map(([x1, y1, x2, y2, w], i) => (
                  <line
                    key={i}
                    x1={x1} y1={y1} x2={x2} y2={y2}
                    stroke="#d4d4d8" strokeWidth={w} strokeDasharray="1.5 1"
                  />
                ))}
              </svg>

              <div className="absolute left-1/2 top-6 z-10 -translate-x-1/2">
                <h3 className="font-display text-lg font-semibold text-zinc-500">{t('landing.v2.oldWay')}</h3>
              </div>

              {OLD_TOOLS.map(({ key, icon: Icon, img, cropImage, label, left, top }) => (
                <div
                  key={key}
                  className="absolute -translate-x-1/2 -translate-y-1/2"
                  style={{ left: `${left}%`, top: `${top}%` }}
                >
                  <div className="flex flex-col items-center gap-1">
                    <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
                      {img ? (
                        cropImage ? (
                          <span className="h-10 w-10 overflow-hidden rounded-[10px]" role="img" aria-label={label}>
                            <img
                              src={img}
                              alt=""
                              className="h-[60px] w-[60px] max-w-none -translate-x-[10px] -translate-y-[10px]"
                              loading="lazy"
                            />
                          </span>
                        ) : (
                          <img src={img} alt={label} className="h-8 w-8 object-contain" loading="lazy" />
                        )
                      ) : Icon && <Icon className="h-6 w-6 text-zinc-400" />}
                    </div>
                    <span className="w-[76px] text-center text-[10px] font-medium leading-tight text-zinc-500">
                      {t(`landing.v2.app.${key}`)}
                    </span>
                  </div>
                </div>
              ))}

              {ALERTS.map(({ left, top }, i) => (
                <div
                  key={i}
                  className="absolute z-10 -translate-x-1/2 -translate-y-1/2"
                  style={{ left: `${left}%`, top: `${top}%` }}
                >
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-red-500 shadow-sm ring-2 ring-red-100">
                    <TriangleAlert className="h-4 w-4 text-white" />
                  </div>
                </div>
              ))}

              <div className="absolute bottom-5 left-4 right-4 flex flex-wrap justify-center gap-2">
                {['oldPill1', 'oldPill2', 'oldPill3'].map((k) => (
                  <span
                    key={k}
                    className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-medium text-red-600"
                  >
                    <TriangleAlert className="h-3 w-3" />
                    {t(`landing.v2.${k}`)}
                  </span>
                ))}
              </div>
            </div>
          </Reveal>

          {/* The Tutlio way */}
          <Reveal delay={150}>
            <div className="relative h-[560px] overflow-hidden rounded-2xl border border-zinc-200 bg-white sm:h-[520px] lg:h-[560px] lg:rounded-l-none">
              <div className="absolute left-1/2 top-6 z-20 -translate-x-1/2">
                <h3 className="whitespace-nowrap font-display text-lg font-semibold text-zinc-900">
                  {t('landing.v2.newWay')}
                </h3>
              </div>

              <div
                aria-hidden
                className="pointer-events-none absolute inset-x-0 top-0 z-10 h-16 sm:h-20"
                style={{ background: 'linear-gradient(#fff 0%, #fff 60%, transparent 100%)' }}
              />
              <div
                aria-hidden
                className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-24 sm:h-32"
                style={{ background: 'linear-gradient(to top, #fff 0%, #fff 40%, transparent 100%)' }}
              />

              {/* Outer ring */}
              <div className="pointer-events-none absolute inset-0 z-[5] [--orbit-r:126px] sm:[--orbit-r:168px] lg:[--orbit-r:196px]">
                <div
                  className="absolute left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-dashed border-zinc-200"
                  style={{ top: 'calc(50% + 15px)', width: 'calc(var(--orbit-r) * 2)', height: 'calc(var(--orbit-r) * 2)' }}
                />
                <div
                  className="orbit-container absolute left-1/2 h-0 w-0"
                  style={{
                    top: 'calc(50% + 15px)',
                    ['--orbit-duration' as string]: '90s',
                    ['--orbit-direction' as string]: 'reverse',
                    ['--counter-direction' as string]: 'normal',
                  }}
                >
                  {OUTER_ORBIT.map((item, i) => {
                    const Icon = item.icon;
                    return (
                      <div key={item.labelKey} className="pointer-events-auto absolute" style={{ transform: orbitTransform(SIX_STEP[i]) }}>
                        <div className="orbit-counter">
                          <Link
                            to={buildLocalizedPath(item.path, locale)}
                            className="flex flex-col items-center gap-0.5 transition-transform hover:scale-110"
                          >
                            <span className="flex h-10 w-10 items-center justify-center rounded-full border border-zinc-200 bg-zinc-100 shadow-sm">
                              <Icon className="h-4 w-4 text-zinc-500" strokeWidth={1.5} />
                            </span>
                            <span className="w-[70px] text-center text-[8px] font-medium leading-tight text-zinc-500">
                              {t(item.labelKey)}
                            </span>
                          </Link>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Inner ring */}
              <div className="pointer-events-none absolute inset-0 z-[4] [--orbit-r:74px] sm:[--orbit-r:98px] lg:[--orbit-r:112px]">
                <div
                  className="absolute left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-dashed border-zinc-200"
                  style={{ top: 'calc(50% + 15px)', width: 'calc(var(--orbit-r) * 2)', height: 'calc(var(--orbit-r) * 2)' }}
                />
                <div
                  className="orbit-container absolute left-1/2 h-0 w-0"
                  style={{
                    top: 'calc(50% + 15px)',
                    ['--orbit-duration' as string]: '60s',
                    ['--orbit-direction' as string]: 'normal',
                    ['--counter-direction' as string]: 'reverse',
                  }}
                >
                  {INNER_ORBIT.map((item, i) => {
                    const Icon = item.icon;
                    return (
                      <div key={item.labelKey} className="pointer-events-auto absolute" style={{ transform: orbitTransform(FOUR_STEP[i]) }}>
                        <div className="orbit-counter">
                          <div className={`flex h-[72px] w-[72px] flex-col items-center justify-center gap-1 overflow-hidden rounded-xl border shadow-sm ${item.tone}`}>
                            <Icon className={`h-5 w-5 ${item.iconTone}`} />
                            <span className="w-[64px] text-center text-[8px] font-semibold leading-tight text-zinc-700">
                              {t(item.labelKey)}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Centre mark */}
              <div className="absolute left-1/2 z-20 -translate-x-1/2 -translate-y-1/2" style={{ top: 'calc(50% + 15px)' }}>
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-zinc-200 bg-white shadow-lg">
                  <img src="/logo-icon.png" alt="Tutlio" className="h-10 w-10 rounded-lg" />
                </div>
              </div>

              <div className="absolute bottom-5 left-4 right-4 z-20 flex flex-wrap justify-center gap-2">
                {['newPill1', 'newPill2'].map((k) => (
                  <span
                    key={k}
                    className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700"
                  >
                    <CheckCircle2 className="h-3 w-3" />
                    {t(`landing.v2.${k}`)}
                  </span>
                ))}
              </div>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
