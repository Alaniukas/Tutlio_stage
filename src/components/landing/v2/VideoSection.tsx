import { useEffect, useRef, useState } from 'react';
import {
  BarChart3, CalendarDays, Check, CreditCard, FileText, Link2,
  MessageCircle, Pause, Play, Users, Wallet,
} from 'lucide-react';
import { useTranslation } from '@/lib/i18n';
import Reveal from '../Reveal';
import type { LandingAudience } from './audience';
import { AvatarStack, MiniAvatar } from './demoAvatars';
import { getLandingDemoPersonas } from './demoPersonas';

const MAX_TILT_DEG = 8;
const MIN_SCALE = 0.97;
const LOOP_TICKS = 36;
const TICK_MS = 440;

type SoloPhase = 'calendar' | 'attendance' | 'payment' | 'invoice' | 'extras';
type BizPhase = 'stats' | 'tutors' | 'payments' | 'messages' | 'parents';

function soloPhase(tick: number): SoloPhase {
  if (tick < 7) return 'calendar';
  if (tick < 15) return 'attendance';
  if (tick < 22) return 'payment';
  if (tick < 29) return 'invoice';
  return 'extras';
}

function bizPhase(tick: number): BizPhase {
  if (tick < 7) return 'stats';
  if (tick < 15) return 'tutors';
  if (tick < 22) return 'payments';
  if (tick < 29) return 'messages';
  return 'parents';
}

const STUDENT_SEEDS = ['emilija-m', 'lukas-k', 'sofija-g', 'jonas-p'] as const;

const TUTOR_ROWS = [
  { seed: 'rasa-a', subjectKey: 'landing.v2.demo.subjectMath', detail: '8–12', hours: '18 h', pay: '€420', live: true },
  { seed: 'tomas-k', subjectKey: 'landing.v2.demo.subjectEnglish', detail: 'B1–C1', hours: '14 h', pay: '€350', live: true },
  { seed: 'inga-j', subjectKey: 'landing.v2.demo.subjectPhysics', detailKey: 'landing.v2.demo.exams', hours: '11 h', pay: '€275', live: false },
  { seed: 'mantas-k', subjectKey: 'landing.v2.demo.subjectChemistry', detail: '10–12', hours: '9 h', pay: '€210', live: true },
] as const;

const FAMILY_SEEDS = ['mockai', 'petraiciai', 'kazlauskai'] as const;

const WEEK_FACES = [
  { people: [{ seed: 'angl-1', subjectKey: 'landing.v2.demo.subjectEnglish' }] },
  { people: [{ seed: 'fiz-1', subjectKey: 'landing.v2.demo.subjectPhysics' }, { seed: 'chem-1', subjectKey: 'landing.v2.demo.subjectChemistry' }] },
  { people: [] },
  { people: [{ seed: 'mat-focus', subjectKey: 'landing.v2.demo.subjectMath' }] },
  { people: [{ seed: 'bio-1', subjectKey: 'landing.v2.demo.subjectBiology' }] },
  { people: [] },
  { people: [{ seed: 'ist-1', subjectKey: 'landing.v2.demo.subjectHistory' }] },
] as const;

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return reduced;
}

function useFlattenProgress(ref: React.RefObject<HTMLElement | null>): number {
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setProgress(1);
      return;
    }
    let frame = 0;
    const update = () => {
      frame = 0;
      const rect = el.getBoundingClientRect();
      const vh = window.innerHeight || 1;
      setProgress(Math.min(Math.max((vh - rect.top) / (vh * 0.9), 0), 1));
    };
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, [ref]);
  return progress;
}

function Panel({ active, children, className = '' }: { active: boolean; children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`absolute inset-0 transition-all duration-500 ${
        active ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-3 opacity-0'
      } ${className}`}
    >
      {children}
    </div>
  );
}

function DemoStage({ audience, tick, reduced }: { audience: LandingAudience; tick: number; reduced: boolean }) {
  const { locale, t } = useTranslation();
  const personas = getLandingDemoPersonas(locale);
  const students = STUDENT_SEEDS.map((seed, index) => ({ seed, name: personas.students[index] }));
  const tutors = TUTOR_ROWS.map((row, index) => ({ ...row, name: personas.tutors[index] }));
  const parents = FAMILY_SEEDS.map((seed, index) => ({ seed, name: personas.families[index] }));
  const isSolo = audience === 'solo';
  const weekdays = t('landing.v2.demo.weekdays').split('|');
  const bookingSlots = [
    `${weekdays[4]} 16:00`,
    `${weekdays[1]} 17:30`,
    `${weekdays[3]} 18:00`,
  ];
  const sPhase = reduced ? 'attendance' : soloPhase(tick);
  const bPhase = reduced ? 'stats' : bizPhase(tick);
  const phase = isSolo ? sPhase : bPhase;

  const soloSteps = [
    { id: 'calendar' as const, titleKey: 'landing.v2.walkStepSchedule', descKey: 'landing.v2.walkStepScheduleDesc', icon: CalendarDays },
    { id: 'attendance' as const, titleKey: 'landing.v2.walkStepCalendar', descKey: 'landing.v2.walkStepCalendarDesc', icon: Users },
    { id: 'payment' as const, titleKey: 'landing.v2.walkStepPayment', descKey: 'landing.v2.walkStepPaymentDesc', icon: CreditCard },
    { id: 'invoice' as const, titleKey: 'landing.v2.walkStepInvoice', descKey: 'landing.v2.walkStepInvoiceDesc', icon: FileText },
    { id: 'extras' as const, titleKey: 'landing.v2.animSoloCard', descKey: 'landing.v2.animSoloCardHint', icon: Link2 },
  ];
  const bizSteps = [
    { id: 'stats' as const, titleKey: 'landing.v2.animBizStats', descKey: 'landing.v2.animBizStatsDesc', icon: BarChart3 },
    { id: 'tutors' as const, titleKey: 'landing.v2.animBizTutors', descKey: 'landing.v2.animBizTutorsDesc', icon: Users },
    { id: 'payments' as const, titleKey: 'landing.v2.animBizPayments', descKey: 'landing.v2.animBizPaymentsDesc', icon: Wallet },
    { id: 'messages' as const, titleKey: 'landing.v2.animBizMessages', descKey: 'landing.v2.animBizMessagesDesc', icon: MessageCircle },
    { id: 'parents' as const, titleKey: 'landing.v2.animBizParents', descKey: 'landing.v2.animBizParentsDesc', icon: Link2 },
  ];
  const steps = isSolo ? soloSteps : bizSteps;

  const marked = reduced
    ? students.length
    : sPhase === 'attendance'
      ? Math.min(students.length, Math.max(0, tick - 8))
      : sPhase === 'calendar'
        ? 0
        : students.length;

  return (
    <div className="flex h-full w-full flex-col bg-zinc-100">
      <div className="flex items-center gap-3 border-b border-zinc-200 bg-white px-4 py-3 sm:px-5">
        <img src="/logo-icon.png" alt="" className="h-6 w-6 rounded-md" />
        <span className="text-sm font-semibold text-zinc-900">Tutlio</span>
        <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-[11px] font-medium text-zinc-600">
          {isSolo ? t('landing.v2.audienceSolo') : t('landing.v2.audienceBiz')}
        </span>
        <nav className="ml-auto hidden items-center gap-1 md:flex">
          {steps.map((s) => (
            <span
              key={s.id}
              className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                phase === s.id ? 'bg-orange-500 text-white' : 'text-zinc-400'
              }`}
            >
              {t(s.titleKey)}
            </span>
          ))}
        </nav>
      </div>

      <div className="grid min-h-0 flex-1 lg:grid-cols-[220px_1fr]">
        <aside className="hidden flex-col gap-1 border-r border-zinc-200 bg-white p-3 lg:flex">
          {steps.map((s, i) => {
            const Icon = s.icon;
            const active = phase === s.id;
            const done = steps.findIndex((x) => x.id === phase) > i;
            return (
              <div
                key={s.id}
                className={`flex items-start gap-2.5 rounded-xl px-2.5 py-2.5 ${
                  active ? 'bg-orange-50' : done ? 'bg-emerald-50/50' : ''
                }`}
              >
                <span className={`mt-0.5 flex h-7 w-7 items-center justify-center rounded-lg ${
                  active ? 'bg-orange-500 text-white' : done ? 'bg-emerald-500 text-white' : 'bg-zinc-100 text-zinc-400'
                }`}>
                  {done && !active ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : <Icon className="h-3.5 w-3.5" />}
                </span>
                <div>
                  <p className={`text-xs font-semibold ${active || done ? 'text-zinc-900' : 'text-zinc-400'}`}>{t(s.titleKey)}</p>
                  <p className="text-[10px] leading-snug text-zinc-500">{t(s.descKey)}</p>
                </div>
              </div>
            );
          })}
        </aside>

        <div className="relative overflow-hidden bg-zinc-50 p-3 sm:p-5">
          {isSolo ? (
            <>
              <Panel active={sPhase === 'calendar'}>
                <div className="flex h-full flex-col rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm sm:p-5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-base font-semibold text-zinc-900">{t('landing.feature.calendar')}</p>
                      <p className="text-xs text-zinc-500">{t('landing.v2.demo.weekLong')}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <AvatarStack people={students} size="sm" max={4} />
                      <span className="rounded-lg bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-800">{t('landing.v2.demo.waitingCount', { count: 3 })}</span>
                      <span className="rounded-lg bg-orange-500 px-3 py-1.5 text-[11px] font-semibold text-white">{t('landing.v2.demo.addLesson')}</span>
                    </div>
                  </div>
                  <div className="mt-4 grid flex-1 grid-cols-5 gap-2 sm:grid-cols-7">
                    {WEEK_FACES.map((col, i) => (
                      <div key={weekdays[i]} className="rounded-xl bg-zinc-50 p-2">
                        <p className="text-center text-[10px] font-medium uppercase text-zinc-400">{weekdays[i]}</p>
                        <p className={`mx-auto mt-1 flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-semibold ${i === 3 ? 'bg-orange-500 text-white' : 'text-zinc-700'}`}>
                          {10 + i}
                        </p>
                        <div className="mt-2 flex flex-col items-center gap-1">
                          {col.people.map((p) => (
                            <MiniAvatar key={p.seed} seed={p.seed} alt={t(p.subjectKey)} size="xs" ring className={i === 3 ? 'ring-orange-300' : undefined} />
                          ))}
                          {col.people.length === 0 && <div className="h-5" />}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </Panel>

              <Panel active={sPhase === 'attendance'}>
                <div className="mx-auto flex h-full max-w-lg flex-col rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-6">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <MiniAvatar seed="paulius-tutor" alt={personas.students[3]} size="lg" />
                      <div>
                        <p className="text-base font-semibold text-zinc-900">{personas.students[3]} · {t('landing.v2.demo.subjectMath')}</p>
                        <p className="text-xs text-zinc-500">12:00 – 12:45 · {t('landing.v2.demo.groupToday').split('·').at(-1)?.trim()} · {t('landing.v2.demo.today')}</p>
                      </div>
                    </div>
                    <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700">{t('stuSess.group')}</span>
                  </div>
                  <p className="mt-5 text-[11px] font-medium uppercase tracking-wide text-zinc-400">{t('landing.insideStudents')}</p>
                  <div className="mt-2 space-y-2">
                    {students.map((row, i) => {
                      const done = i < marked;
                      return (
                        <div key={row.seed} className={`flex items-center justify-between rounded-xl px-3 py-3 ${done ? 'bg-emerald-50' : 'bg-zinc-50'}`}>
                          <div className="flex items-center gap-3">
                            <MiniAvatar seed={row.seed} alt={row.name} size="md" />
                            <span className="text-sm font-medium text-zinc-900">{row.name}</span>
                          </div>
                          <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold ${done ? 'bg-emerald-100 text-emerald-700' : 'bg-zinc-200 text-zinc-500'}`}>
                            {done && <Check className="h-3 w-3" strokeWidth={3} />}
                            {done ? t('status.completed') : t('stuSess.upcoming')}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </Panel>

              <Panel active={sPhase === 'payment'}>
                <div className="mx-auto grid h-full max-w-2xl gap-4 lg:grid-cols-[1.2fr_0.8fr]">
                  <div className="rounded-2xl border border-emerald-100 bg-white p-5 shadow-sm">
                    <div className="flex items-center gap-3">
                      <MiniAvatar seed="paulius-pay" alt={personas.students[3]} size="md" />
                      <div>
                        <p className="text-xs font-medium text-emerald-700">{t('landing.v2.demo.paymentReceived')}</p>
                        <p className="text-sm text-zinc-500">{personas.students[3]} · {t('landing.v2.demo.subjectMath')} · Stripe</p>
                      </div>
                    </div>
                    <p className="mt-4 font-display text-4xl font-bold text-emerald-800">+€20</p>
                    <div className="mt-4 grid grid-cols-3 gap-2">
                      {[
                        { key: 'week', label: t('landing.v2.demo.thisWeek'), value: '€180' },
                        { key: 'paid', label: t('dash.paidLabel'), value: '9/11' },
                        { key: 'waiting', label: t('landing.v2.demo.waiting'), value: '€40' },
                      ].map((x) => (
                        <div key={x.key} className="rounded-xl bg-zinc-50 px-2.5 py-2">
                          <p className="text-[10px] text-zinc-400">{x.label}</p>
                          <p className="text-sm font-bold text-zinc-900">{x.value}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
                    <p className="text-sm font-semibold text-zinc-900">{t('landing.v2.finWhoPaid')}</p>
                    <div className="mt-3 space-y-2.5">
                      {students.slice(0, 3).map((s, i) => (
                        <div key={s.seed} className="flex items-center justify-between gap-2 text-sm">
                          <span className="flex min-w-0 items-center gap-2">
                            <MiniAvatar seed={s.seed} alt={s.name} size="sm" />
                            <span className="truncate font-medium text-zinc-800">{s.name}</span>
                          </span>
                          <span className={i < 2 ? 'shrink-0 font-semibold text-emerald-700' : 'shrink-0 font-semibold text-amber-700'}>
                            {i < 2 ? '€20' : t('landing.v2.demo.waiting')}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </Panel>

              <Panel active={sPhase === 'invoice'}>
                <div className="mx-auto flex h-full max-w-md flex-col justify-center">
                  <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-md">
                    <div className="flex items-center gap-3 border-b border-zinc-100 pb-4">
                      <MiniAvatar seed="mockai" alt={personas.families[0]} size="lg" />
                      <div>
                        <p className="text-sm font-semibold text-zinc-900">INV-2026-0314</p>
                        <p className="text-xs text-zinc-500">{personas.families[0]} · PDF</p>
                      </div>
                    </div>
                    <div className="mt-4 space-y-2 text-sm text-zinc-500">
                      <div className="flex justify-between"><span>{t('landing.v2.demo.subjectMath')} · 45 {t('time.minutes')}</span><span className="text-zinc-900">€20</span></div>
                      <div className="flex justify-between"><span>{t('landing.v2.demo.vat')}</span><span className="text-zinc-900">€0</span></div>
                      <div className="flex justify-between border-t border-zinc-100 pt-3 text-zinc-900"><span className="font-semibold">{t('common.total')}</span><span className="font-display text-xl font-bold">€20,00</span></div>
                    </div>
                    <div className="mt-5 flex gap-2">
                      <span className="flex-1 rounded-xl bg-zinc-900 py-2.5 text-center text-xs font-semibold text-white">{t('landing.v2.demo.sendParents')}</span>
                      <span className="rounded-xl border border-zinc-200 px-4 py-2.5 text-xs font-semibold text-zinc-700">PDF</span>
                    </div>
                  </div>
                </div>
              </Panel>

              <Panel active={sPhase === 'extras'}>
                <div className="mx-auto flex h-full max-w-lg flex-col justify-center gap-4">
                  <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
                    <div className="flex items-center gap-2 border-b border-zinc-100 bg-zinc-50 px-4 py-2.5 text-[11px] text-zinc-400">
                      <Link2 className="h-3.5 w-3.5" />
                      {personas.publicProfileUrl}
                    </div>
                    <div className="space-y-3 p-4 sm:p-5">
                      <div className="flex items-center gap-3">
                        <MiniAvatar seed="rasa-public" alt={personas.publicTutor} size="lg" ring />
                        <div>
                          <p className="text-[15px] font-semibold text-zinc-900">{personas.publicTutor} · {t('landing.v2.demo.subjectMath')}</p>
                          <p className="text-[12px] text-zinc-500">{t('landing.v2.demo.trialCall')} · {t('landing.v2.demo.free')}</p>
                        </div>
                      </div>
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
                          {t('landing.v2.animSoloCardSlots')}
                        </p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {bookingSlots.map((slot, i) => {
                            const on = !reduced ? tick % 3 === i : i === 1;
                            return (
                              <span
                                key={slot}
                                className={`rounded-xl border px-3 py-2 text-[12px] font-semibold ${
                                  on
                                    ? 'border-violet-300 bg-violet-50 text-violet-800'
                                    : 'border-zinc-200 bg-white text-zinc-600'
                                }`}
                              >
                                {slot}
                              </span>
                            );
                          })}
                        </div>
                      </div>
                      <div className="rounded-xl bg-zinc-900 py-3 text-center text-[13px] font-semibold text-white">
                        {t('landing.v2.animSoloCardCta')}
                      </div>
                    </div>
                  </div>
                  <p className="text-center text-[12px] text-zinc-500">{t('landing.v2.animSoloCardHint')}</p>
                </div>
              </Panel>
            </>
          ) : (
            <>
              <Panel active={bPhase === 'stats'}>
                <div className="flex h-full flex-col gap-4">
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {[
                      { key: 'lessons', label: t('common.lessons'), value: '86', sub: t('landing.v2.demo.thisWeek') },
                      { key: 'revenue', label: t('dash.revenue'), value: '€2 140', sub: t('landing.v2.demo.growthVsLast', { percent: 12 }) },
                      { key: 'tutors', label: t('landing.v2.animBizTutors'), value: '11', sub: t('landing.v2.demo.activeNow', { count: 9 }) },
                      { key: 'unpaid', label: t('dash.unpaid'), value: '€320', sub: t('landing.v2.demo.invoicesCount', { count: 14 }) },
                    ].map((c) => (
                      <div key={c.key} className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
                        <p className="text-[11px] text-zinc-400">{c.label}</p>
                        <p className="mt-1 text-2xl font-bold text-zinc-900">{c.value}</p>
                        <p className="mt-1 text-[11px] text-zinc-500">{c.sub}</p>
                      </div>
                    ))}
                  </div>
                  <div className="grid flex-1 gap-3 lg:grid-cols-2">
                    <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
                      <p className="text-sm font-semibold text-zinc-900">{t('landing.v2.demo.utilizationByDay')}</p>
                      <div className="mt-4 flex h-28 items-end gap-2">
                        {[40, 65, 50, 90, 75, 30, 20].map((h, i) => (
                          <div key={i} className="flex flex-1 flex-col items-center gap-1">
                            <div className="w-full rounded-t-md bg-orange-400/90" style={{ height: `${h}%` }} />
                            <span className="text-[9px] text-zinc-400">{weekdays[i]}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
                      <p className="text-sm font-semibold text-zinc-900">{t('landing.v2.demo.topSubjects')}</p>
                      <div className="mt-3 space-y-3">
                        {[
                          { key: 'math', name: t('landing.v2.demo.subjectMath'), percent: '42%' },
                          { key: 'english', name: t('landing.v2.demo.subjectEnglish'), percent: '28%' },
                          { key: 'physics', name: t('landing.v2.demo.subjectPhysics'), percent: '18%' },
                        ].map((r) => (
                          <div key={r.key}>
                            <div className="mb-1 flex justify-between text-xs"><span>{r.name}</span><span className="font-semibold">{r.percent}</span></div>
                            <div className="h-1.5 rounded-full bg-zinc-100"><div className="h-full rounded-full bg-violet-400" style={{ width: r.percent }} /></div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </Panel>

              <Panel active={bPhase === 'tutors'}>
                <div className="flex h-full flex-col rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm sm:p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-base font-semibold text-zinc-900">{t('landing.v2.animBizTutors')}</p>
                      <p className="text-xs text-zinc-500">{t('landing.v2.demo.hoursPayMonth')}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <AvatarStack people={tutors.map((x) => ({ seed: x.seed, name: x.name }))} size="sm" max={4} />
                      <span className="rounded-lg bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">4 online</span>
                    </div>
                  </div>
                  <div className="mt-4 grid gap-2 sm:grid-cols-2">
                    {tutors.map((tutor) => (
                      <div key={tutor.seed} className="flex items-center gap-3 rounded-xl bg-zinc-50 px-3 py-3">
                        <div className="relative">
                          <MiniAvatar seed={tutor.seed} alt={tutor.name} size="lg" />
                          <span className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white ${tutor.live ? 'bg-emerald-400' : 'bg-zinc-300'}`} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-zinc-900">{tutor.name}</p>
                          <p className="truncate text-[11px] text-zinc-500">
                            {t(tutor.subjectKey)} · {'detailKey' in tutor ? t(tutor.detailKey) : tutor.detail}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs font-semibold text-zinc-900">{tutor.hours}</p>
                          <p className="text-xs text-emerald-700">{tutor.pay}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </Panel>

              <Panel active={bPhase === 'payments'}>
                <div className="grid h-full gap-4 lg:grid-cols-[1fr_0.9fr]">
                  <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
                    <p className="text-sm font-semibold text-zinc-900">{t('landing.v2.demo.paymentStreams')}</p>
                    <div className="mt-4 space-y-4">
                      {[
                        { key: 'individual', label: t('landing.v2.demo.individualLessons'), amount: '€1 240', percent: '72%' },
                        { key: 'group', label: t('landing.v2.demo.groupLessons'), amount: '€680', percent: '54%' },
                        { key: 'packages', label: t('landing.v2.demo.prepaidPackages'), amount: '€220', percent: '91%' },
                      ].map((r) => (
                        <div key={r.key}>
                          <div className="mb-1.5 flex justify-between text-sm"><span className="text-zinc-600">{r.label}</span><span className="font-semibold">{r.amount}</span></div>
                          <div className="h-2 rounded-full bg-zinc-100"><div className="h-full rounded-full bg-orange-400" style={{ width: r.percent }} /></div>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-3">
                    <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-medium text-emerald-700">{t('landing.v2.demo.todayCollected')}</p>
                        <AvatarStack people={students} size="xs" max={3} />
                      </div>
                      <p className="mt-1 font-display text-3xl font-bold text-emerald-800">€180</p>
                      <p className="mt-1 text-[11px] text-emerald-700/80">{t('landing.v2.demo.paymentsCount', { count: 9 })} · Stripe</p>
                    </div>
                    <div className="rounded-2xl border border-amber-100 bg-amber-50 p-4">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-medium text-amber-800">{t('landing.v2.demo.overdue')}</p>
                        <AvatarStack people={parents} size="xs" max={3} />
                      </div>
                      <p className="mt-1 text-2xl font-bold text-amber-900">€320</p>
                      <p className="mt-1 text-[11px] text-amber-800/80">{t('landing.v2.demo.remindersSent', { count: 14 })}</p>
                    </div>
                  </div>
                </div>
              </Panel>

              <Panel active={bPhase === 'messages'}>
                <div className="grid h-full gap-3 lg:grid-cols-[1fr_1.1fr]">
                  <div className="space-y-2 overflow-auto rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm">
                    {[
                      { seed: 'parents-8', name: t('landing.v2.demo.parentsGroup'), preview: t('landing.v2.demo.moveThursday'), time: '2 min', unread: 2 },
                      { seed: 'proklase-admin', name: personas.schoolTeam, preview: t('landing.v2.demo.newStudentWaiting'), time: '14 min', unread: 0 },
                      { seed: 'rasa-a', name: personas.tutors[0], preview: t('landing.v2.demo.groupToday'), time: '1 h', unread: 1 },
                      { seed: 'petraiciai', name: personas.families[1], preview: t('landing.v2.demo.invoiceThanks'), time: '3 h', unread: 0 },
                    ].map((ch) => (
                      <div key={ch.seed} className="flex items-start gap-2.5 rounded-xl bg-zinc-50 px-3 py-2.5">
                        <MiniAvatar seed={ch.seed} alt={ch.name} size="sm" className="mt-0.5" />
                        <div className="min-w-0 flex-1">
                          <div className="flex justify-between gap-2"><p className="truncate text-sm font-semibold text-zinc-900">{ch.name}</p><span className="text-[10px] text-zinc-400">{ch.time}</span></div>
                          <p className="truncate text-xs text-zinc-500">{ch.preview}</p>
                        </div>
                        {ch.unread > 0 && <span className="mt-1 rounded-full bg-orange-500 px-1.5 text-[10px] font-bold text-white">{ch.unread}</span>}
                      </div>
                    ))}
                  </div>
                  <div className="flex flex-col rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
                    <p className="text-sm font-semibold text-zinc-900">{t('landing.v2.demo.parentsGroup')}</p>
                    <div className="mt-3 flex-1 space-y-2">
                      <div className="max-w-[85%] rounded-2xl rounded-tl-md bg-zinc-100 px-3 py-2 text-xs text-zinc-700">{t('landing.v2.demo.moveThursday')}</div>
                      <div className="ml-auto max-w-[85%] rounded-2xl rounded-tr-md bg-orange-500 px-3 py-2 text-xs text-white">{t('landing.v2.demo.reply')}</div>
                    </div>
                    <div className="mt-3 rounded-xl border border-zinc-200 px-3 py-2 text-xs text-zinc-400">{t('landing.v2.demo.messagePlaceholder')}</div>
                  </div>
                </div>
              </Panel>

              <Panel active={bPhase === 'parents'}>
                <div className="flex h-full flex-col rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm sm:p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-base font-semibold text-zinc-900">{t('landing.v2.animBizParents')}</p>
                      <p className="text-xs text-zinc-500">{t('landing.v2.demo.portalSummary')}</p>
                    </div>
                    <span className="rounded-lg bg-zinc-900 px-3 py-1.5 text-[11px] font-semibold text-white">{t('landing.v2.demo.invite')}</span>
                  </div>
                  <div className="mt-4 overflow-hidden rounded-xl border border-zinc-100">
                    <div className="grid grid-cols-[1.2fr_1fr_0.7fr_0.7fr] gap-2 bg-zinc-50 px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
                      <span>{t('landing.v2.demo.family')}</span><span>{t('common.student')}</span><span>{t('common.status')}</span><span>{t('landing.v2.walkStepPayment')}</span>
                    </div>
                    {[
                      { seed: 'mockai', family: personas.families[0], child: `${personas.children[0]} · ${t('landing.v2.demo.subjectEnglish')} B2`, active: true, payment: t('dash.paidLabel') },
                      { seed: 'petraiciai', family: personas.families[1], child: `${personas.children[1]} · ${t('landing.v2.demo.subjectMath')}`, active: true, payment: t('dash.paidLabel') },
                      { seed: 'kazlauskai', family: personas.families[2], child: `${personas.children[2]} · ${t('landing.v2.demo.subjectPhysics')}`, active: false, payment: '€40' },
                      { seed: 'jankauskai', family: personas.families[3], child: `${personas.children[3]} · ${t('landing.v2.demo.subjectChemistry')}`, active: true, payment: t('landing.v2.demo.waiting') },
                    ].map((row) => (
                      <div key={row.seed} className="grid grid-cols-[1.2fr_1fr_0.7fr_0.7fr] items-center gap-2 border-t border-zinc-100 px-3 py-2.5 text-xs">
                        <span className="flex items-center gap-2 font-semibold text-zinc-900">
                          <MiniAvatar seed={row.seed} alt={row.family} size="sm" />
                          {row.family}
                        </span>
                        <span className="text-zinc-600">{row.child}</span>
                        <span className={row.active ? 'font-semibold text-emerald-700' : 'font-semibold text-amber-700'}>{row.active ? t('landing.v2.profileParentActive') : t('landing.v2.demo.waiting')}</span>
                        <span className="text-zinc-700">{row.payment}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </Panel>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function VideoSection({ audience }: { audience: LandingAudience }) {
  const { t } = useTranslation();
  const reducedMotion = usePrefersReducedMotion();
  const [tick, setTick] = useState(0);
  const [playing, setPlaying] = useState(true);
  const frameRef = useRef<HTMLDivElement>(null);
  const progress = useFlattenProgress(frameRef);
  const timer = useRef<number | undefined>(undefined);
  const isSolo = audience === 'solo';

  useEffect(() => {
    setTick(0);
  }, [audience]);

  useEffect(() => {
    if (reducedMotion || !playing) return;
    timer.current = window.setInterval(() => {
      setTick((n) => (n + 1) % LOOP_TICKS);
    }, TICK_MS);
    return () => window.clearInterval(timer.current);
  }, [reducedMotion, playing, audience]);

  const tilt = MAX_TILT_DEG * (1 - progress);
  const scale = MIN_SCALE + (1 - MIN_SCALE) * progress;

  return (
    <section className="relative bg-zinc-50">
      <div className="relative mx-auto w-full max-w-[1224px] px-5 py-16 sm:px-6 sm:py-20 lg:px-8 lg:py-24">
        <div className="flex w-full flex-col gap-6 sm:gap-8 lg:gap-10">
          <Reveal>
            <div className="mx-auto flex w-full max-w-[720px] flex-col items-center gap-3 sm:gap-4">
              <h2 className="text-center font-display text-2xl font-semibold leading-[1.3] tracking-[-0.5px] text-zinc-900 sm:text-[32px] sm:tracking-[-1px] lg:text-[40px]">
                {t(isSolo ? 'landing.v2.videoTitleSolo' : 'landing.v2.videoTitleBiz')}
              </h2>
              <h3 className="text-center text-[15px] font-normal leading-[1.6] text-zinc-600 sm:text-base">
                {t(isSolo ? 'landing.v2.videoSubSolo' : 'landing.v2.videoSubBiz')}
              </h3>
            </div>
          </Reveal>

          <div ref={frameRef} className="mx-auto w-full max-w-[1100px]" style={{ perspective: '1200px' }}>
            <div style={{ transformOrigin: 'center center', transform: `scale(${scale}) rotateX(${tilt}deg)` }}>
              <div
                className="relative w-full overflow-hidden rounded-2xl border border-zinc-200 shadow-[0_8px_30px_rgb(0,0,0,0.1)] sm:rounded-3xl"
                style={{ aspectRatio: '16 / 10', minHeight: 420 }}
              >
                <DemoStage audience={audience} tick={tick} reduced={reducedMotion} />
                {!reducedMotion && (
                  <button
                    type="button"
                    onClick={() => setPlaying((p) => !p)}
                    aria-label={playing ? t('landing.v2.animPause') : t('landing.v2.animPlay')}
                    className="absolute bottom-4 right-4 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white text-zinc-900 shadow-lg hover:bg-zinc-50"
                  >
                    {playing ? <Pause className="h-3.5 w-3.5 fill-current" /> : <Play className="h-3.5 w-3.5 fill-current" />}
                  </button>
                )}
              </div>
            </div>
          </div>

          <p className="text-center text-sm text-zinc-500">{t('landing.v2.videoWatch')}</p>
        </div>
      </div>
    </section>
  );
}
