import { useEffect, useRef, useState } from 'react';
import {
  Check, Pause, Play,
} from 'lucide-react';
import { useTranslation } from '@/lib/i18n';
import type { LandingAudience } from './audience';
import { AvatarStack, MiniAvatar } from './demoAvatars';
import { getLandingDemoPersonas } from './demoPersonas';

/**
 * Continuous hero vignette with autoplay (pause/play in the chrome header).
 */

const STUDENT_SEEDS = ['emilija-m', 'lukas-k', 'sofija-g'] as const;

const WEEK = [
  { date: '10', lessons: [{ top: 24, h: 16, subjectKey: 'landing.v2.demo.subjectEnglish', color: 'bg-sky-400', seed: 'angl-1' }] },
  { date: '11', lessons: [{ top: 36, h: 14, subjectKey: 'landing.v2.demo.subjectPhysics', color: 'bg-violet-400', seed: 'fiz-1' }, { top: 58, h: 12, subjectKey: 'landing.v2.demo.subjectChemistry', color: 'bg-teal-400', seed: 'chem-1' }] },
  { date: '12', lessons: [{ top: 30, h: 12, subjectKey: 'landing.v2.demo.subjectHistory', color: 'bg-rose-400', seed: 'ist-1' }] },
  { date: '13', lessons: [{ top: 20, h: 18, subjectKey: 'landing.v2.demo.subjectMath', color: 'bg-orange-400', seed: 'mat-focus', focus: true }] },
  { date: '14', lessons: [{ top: 44, h: 14, subjectKey: 'landing.v2.demo.subjectBiology', color: 'bg-emerald-400', seed: 'bio-1' }] },
] as const;

const TUTOR_ROWS = [
  { seed: 'rasa-a', subjectKey: 'landing.v2.demo.subjectMath', hours: '18 h', pay: '€420' },
  { seed: 'tomas-k', subjectKey: 'landing.v2.demo.subjectEnglish', hours: '14 h', pay: '€350' },
  { seed: 'inga-j', subjectKey: 'landing.v2.demo.subjectPhysics', hours: '11 h', pay: '€275' },
] as const;

const LOOP_TICKS = 32;
const TICK_MS = 460;

type SoloPhase = 'calendar' | 'attendance' | 'payment' | 'invoice' | 'extras';
type BizPhase = 'stats' | 'tutors' | 'payments' | 'messages' | 'parents';

function soloPhase(tick: number): SoloPhase {
  if (tick < 6) return 'calendar';
  if (tick < 13) return 'attendance';
  if (tick < 19) return 'payment';
  if (tick < 25) return 'invoice';
  return 'extras';
}

function bizPhase(tick: number): BizPhase {
  if (tick < 6) return 'stats';
  if (tick < 13) return 'tutors';
  if (tick < 19) return 'payments';
  if (tick < 25) return 'messages';
  return 'parents';
}

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

function PhaseChip({ label }: { label: string }) {
  return (
    <span className="rounded-full bg-orange-50 px-2 py-0.5 text-[10px] font-semibold text-orange-700">
      {label}
    </span>
  );
}

function Chrome({
  children,
  chip,
  actions,
}: {
  children: React.ReactNode;
  chip: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-white">
      <div className="flex shrink-0 items-center gap-2 border-b border-zinc-100 px-4 py-3">
        <img src="/logo-icon.png" alt="" className="h-5 w-5 rounded" />
        <span className="text-[13px] font-semibold text-zinc-900">Tutlio</span>
        <PhaseChip label={chip} />
        {actions ? <div className="ml-auto flex items-center">{actions}</div> : null}
      </div>
      <div className="relative min-h-0 flex-1 p-4 sm:p-5">{children}</div>
    </div>
  );
}

function Panel({ active, children }: { active: boolean; children: React.ReactNode }) {
  return (
    <div
      className={`absolute inset-4 transition-all duration-500 sm:inset-5 ${
        active ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-3 opacity-0'
      }`}
    >
      {children}
    </div>
  );
}

export default function HeroAnimation({ audience }: { audience: LandingAudience }) {
  const { locale, t } = useTranslation();
  const personas = getLandingDemoPersonas(locale);
  const students = STUDENT_SEEDS.map((seed, index) => ({ seed, name: personas.students[index] }));
  const tutors = TUTOR_ROWS.map((row, index) => ({ ...row, name: personas.tutors[index] }));
  const channels = [
    { seed: 'parents-8', name: t('landing.v2.demo.parentsGroup'), previewKey: 'landing.v2.demo.moveThursday', time: '2 min', unread: 2 },
    { seed: 'proklase-admin', name: personas.schoolTeam, previewKey: 'landing.v2.demo.newStudentWaiting', time: '14 min', unread: 0 },
    { seed: 'rasa-a', name: personas.tutors[0], previewKey: 'landing.v2.demo.groupToday', time: '1 h', unread: 1 },
  ];
  const reducedMotion = usePrefersReducedMotion();
  const [tick, setTick] = useState(0);
  const [playing, setPlaying] = useState(true);
  const timer = useRef<number | undefined>(undefined);

  const isSolo = audience === 'solo';
  const weekdays = t('landing.v2.demo.weekdays').split('|');
  const bookingSlots = [
    `${weekdays[4]} 16:00`,
    `${weekdays[1]} 17:30`,
    `${weekdays[3]} 18:00`,
  ];

  useEffect(() => {
    setTick(0);
    setPlaying(true);
  }, [audience]);

  useEffect(() => {
    if (reducedMotion || !playing) return;
    timer.current = window.setInterval(() => {
      setTick((n) => (n + 1) % LOOP_TICKS);
    }, TICK_MS);
    return () => window.clearInterval(timer.current);
  }, [reducedMotion, playing, audience]);

  const sPhase = reducedMotion ? 'attendance' : soloPhase(tick);
  const bPhase = reducedMotion ? 'stats' : bizPhase(tick);

  const markedCount = reducedMotion
    ? students.length
    : sPhase === 'attendance'
      ? Math.min(students.length, Math.max(0, tick - 7))
      : sPhase === 'calendar'
        ? 0
        : students.length;

  const showCursor = !reducedMotion && isSolo && sPhase === 'attendance' && markedCount < students.length;
  const cursorTop = 40 + markedCount * 13;
  const calendarFocus = !reducedMotion && sPhase === 'calendar' && tick >= 3;

  const soloChip =
    sPhase === 'calendar' ? t('landing.v2.walkStepSchedule')
      : sPhase === 'attendance' ? t('landing.v2.walkStepCalendar')
        : sPhase === 'payment' ? t('landing.v2.walkStepPayment')
          : sPhase === 'invoice' ? t('landing.v2.walkStepInvoice')
            : t('landing.v2.animSoloCard');

  const bizChip =
    bPhase === 'stats' ? t('landing.v2.animBizStats')
      : bPhase === 'tutors' ? t('landing.v2.animBizTutors')
        : bPhase === 'payments' ? t('landing.v2.animBizPayments')
          : bPhase === 'messages' ? t('landing.v2.animBizMessages')
            : t('landing.v2.animBizParents');

  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden bg-white">
      <div className="relative min-h-0 w-full flex-1">
        <Chrome
          chip={isSolo ? soloChip : bizChip}
          actions={
            !reducedMotion ? (
              <button
                type="button"
                onClick={() => setPlaying((p) => !p)}
                aria-label={playing ? t('landing.v2.animPause') : t('landing.v2.animPlay')}
                className="inline-flex items-center gap-1.5 rounded-full bg-zinc-900 px-2.5 py-1 text-[11px] font-semibold text-white transition-colors hover:bg-zinc-800"
              >
                {playing ? <Pause className="h-3 w-3 fill-current" /> : <Play className="h-3 w-3 fill-current" />}
                {playing ? t('landing.v2.animPause') : t('landing.v2.animPlay')}
              </button>
            ) : undefined
          }
        >
          {isSolo ? (
            <>
              <Panel active={sPhase === 'calendar'}>
                <p className="text-[15px] font-semibold text-zinc-900">{t('landing.feature.calendar')}</p>
                <p className="mt-0.5 text-[12px] text-zinc-500">{t('landing.v2.demo.weekShort')}</p>
                <div className="mt-3 grid grid-cols-5 gap-1.5">
                  {WEEK.map((col, columnIndex) => (
                    <div key={col.date} className="flex flex-col items-center">
                      <span className="text-[10px] font-medium uppercase text-zinc-400">{weekdays[columnIndex]}</span>
                      <span
                        className={`mt-1 flex h-7 w-7 items-center justify-center rounded-full text-[12px] font-semibold ${
                          col.lessons.some((l) => 'focus' in l && l.focus) ? 'bg-orange-500 text-white' : 'text-zinc-700'
                        }`}
                      >
                        {col.date}
                      </span>
                      <div className="relative mt-2 h-28 w-full rounded-lg bg-zinc-50">
                        {col.lessons.map((lesson) => (
                          <div
                            key={lesson.seed}
                            className={`absolute inset-x-0.5 overflow-hidden rounded-md px-0.5 py-0.5 text-center text-[8px] font-semibold text-white ${lesson.color} ${
                              calendarFocus && 'focus' in lesson && lesson.focus ? 'scale-105 ring-2 ring-orange-300' : ''
                            }`}
                            style={{ top: `${lesson.top}%`, height: `${lesson.h}%` }}
                          >
                            {t(lesson.subjectKey)}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-3 flex items-center justify-between rounded-xl bg-amber-50 px-3 py-2">
                  <span className="flex items-center gap-2 text-[11px] font-medium text-amber-800">
                    <AvatarStack people={students} size="xs" max={3} />
                    {t('landing.v2.demo.waitlistCount', { count: 3 })}
                  </span>
                  <span className="rounded-full bg-amber-500 px-2 py-0.5 text-[10px] font-semibold text-white">Auto</span>
                </div>
              </Panel>

              <Panel active={sPhase === 'attendance'}>
                <div className="flex items-center gap-2.5">
                  <MiniAvatar seed="paulius-tutor" alt={personas.students[3]} size="md" />
                  <div>
                    <p className="text-[15px] font-semibold text-zinc-900">{personas.students[3]} · {t('landing.v2.demo.subjectMath')}</p>
                    <p className="mt-0.5 text-[12px] text-zinc-500">12:00 – 12:45 · {t('landing.v2.demo.today')}</p>
                  </div>
                </div>
                <p className="mt-4 text-[11px] font-medium uppercase tracking-wide text-zinc-400">{t('landing.insideStudents')}</p>
                <div className="mt-2 flex flex-col gap-2">
                  {students.map((row, i) => {
                    const done = i < markedCount;
                    return (
                      <div key={row.seed} className={`flex h-[46px] items-center justify-between rounded-xl px-3 ${done ? 'bg-emerald-50/80' : 'bg-zinc-50'}`}>
                        <div className="flex items-center gap-2.5">
                          <MiniAvatar seed={row.seed} alt={row.name} size="sm" />
                          <span className="text-[13px] font-medium text-zinc-900">{row.name}</span>
                        </div>
                        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold ${done ? 'bg-emerald-100 text-emerald-700' : 'bg-zinc-200 text-zinc-500'}`}>
                          {done && <Check className="h-3 w-3" strokeWidth={3} />}
                          {done ? t('status.completed') : t('stuSess.upcoming')}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </Panel>

              <Panel active={sPhase === 'payment'}>
                <div className="flex items-center gap-2">
                  <MiniAvatar seed="paulius-pay" alt={personas.students[3]} size="sm" />
                  <div>
                    <p className="text-[15px] font-semibold text-zinc-900">{t('landing.v2.walkStepPayment')}</p>
                    <p className="text-[12px] text-zinc-500">{personas.students[3]} · {t('landing.v2.demo.subjectMath')}</p>
                  </div>
                </div>
                <div className="mt-4 rounded-2xl border border-emerald-100 bg-gradient-to-br from-emerald-50 to-white p-4">
                  <div className="flex items-end justify-between">
                    <div>
                      <p className="text-[11px] font-medium text-emerald-700">{t('landing.v2.demo.paidViaStripe')}</p>
                      <p className="mt-1 font-display text-3xl font-bold text-emerald-800">+€20</p>
                    </div>
                    <Check className="mb-1 h-8 w-8 text-emerald-500" strokeWidth={2.5} />
                  </div>
                </div>
                <div className="mt-3 space-y-2">
                  {students.map((p, i) => (
                    <div key={p.seed} className="flex items-center justify-between rounded-xl bg-zinc-50 px-3 py-2 text-[12px]">
                      <span className="flex items-center gap-2 font-medium text-zinc-800">
                        <MiniAvatar seed={p.seed} alt={p.name} size="xs" />
                        {p.name}
                      </span>
                      <span className={i < 2 ? 'font-semibold text-emerald-700' : 'font-semibold text-amber-700'}>
                        {i < 2 ? t('dash.paidLabel') : t('landing.v2.demo.waiting')}
                      </span>
                    </div>
                  ))}
                </div>
              </Panel>

              <Panel active={sPhase === 'invoice'}>
                <div className="flex items-center gap-2">
                  <MiniAvatar seed="mockai" alt={personas.families[0]} size="sm" />
                  <div>
                    <p className="text-[15px] font-semibold text-zinc-900">INV-2026-0314</p>
                    <p className="text-[12px] text-zinc-500">{t('landing.v2.demo.invoiceReady')}</p>
                  </div>
                </div>
                <div className="mt-4 rounded-2xl border border-zinc-100 p-4">
                  <div className="flex justify-between text-[12px] text-zinc-500"><span>{t('landing.v2.demo.recipient')}</span><span className="font-medium text-zinc-900">{personas.families[0]}</span></div>
                  <div className="mt-2 flex justify-between text-[12px] text-zinc-500"><span>{t('common.lesson')}</span><span className="font-medium text-zinc-900">{t('landing.v2.demo.subjectMath')} · 45 {t('time.minutes')}</span></div>
                  <div className="mt-3 flex justify-between border-t border-zinc-100 pt-3"><span className="text-sm font-semibold">{t('invoice.amountLabel')}</span><span className="font-display text-xl font-bold">€20,00</span></div>
                </div>
                <div className="mt-3 flex gap-2">
                  <span className="flex-1 rounded-xl bg-zinc-900 py-2.5 text-center text-[12px] font-semibold text-white">{t('landing.v2.demo.sendParents')}</span>
                  <span className="rounded-xl border border-zinc-200 px-3 py-2.5 text-[12px] font-semibold text-zinc-600">PDF</span>
                </div>
              </Panel>

              <Panel active={sPhase === 'extras'}>
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-[15px] font-semibold text-zinc-900">{t('landing.v2.animSoloCard')}</p>
                    <p className="mt-0.5 text-[11px] text-sky-700">{personas.publicProfileUrl}</p>
                  </div>
                  <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-semibold text-violet-700">
                    {t('landing.v2.demo.online')}
                  </span>
                </div>
                <div className="mt-3 rounded-xl border border-zinc-100 bg-zinc-50/80 p-3">
                  <div className="flex items-center gap-2">
                    <MiniAvatar seed="rasa-public" alt={personas.publicTutor} size="sm" ring />
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-semibold text-zinc-900">{personas.publicTutor} · {t('landing.v2.demo.subjectMath')}</p>
                      <p className="text-[11px] text-zinc-500">{t('landing.v2.demo.trialCall')}</p>
                    </div>
                  </div>
                  <p className="mt-3 text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
                    {t('landing.v2.animSoloCardSlots')}
                  </p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {bookingSlots.map((slot, i) => {
                      const on = !reducedMotion ? tick % 3 === i : i === 1;
                      return (
                        <span
                          key={slot}
                          className={`rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold transition-colors ${
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
                  <div className="mt-3 rounded-xl bg-zinc-900 py-2.5 text-center text-[12px] font-semibold text-white">
                    {t('landing.v2.animSoloCardCta')}
                  </div>
                </div>
                <p className="mt-2 text-[11px] text-zinc-500">{t('landing.v2.animSoloCardHint')}</p>
              </Panel>

              {showCursor && (
                <div aria-hidden className="pointer-events-none absolute right-6 z-20 drop-shadow-md transition-all duration-400" style={{ top: `${cursorTop}%` }}>
                  <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
                    <path d="M3 3L10.07 19.97L12.58 12.58L19.97 10.07L3 3Z" fill="#111827" stroke="white" strokeWidth="2" strokeLinejoin="round" />
                  </svg>
                </div>
              )}
            </>
          ) : (
            <>
              <Panel active={bPhase === 'stats'}>
                <p className="text-[15px] font-semibold text-zinc-900">{t('landing.v2.animBizStats')}</p>
                <p className="mt-0.5 text-[12px] text-zinc-500">{t('landing.v2.demo.schoolWeek')}</p>
                <div className="mt-4 grid grid-cols-2 gap-2">
                  {[
                    { key: 'lessons', label: t('common.lessons'), value: '86', tone: 'text-zinc-900' },
                    { key: 'revenue', label: t('dash.revenue'), value: '€2 140', tone: 'text-emerald-700' },
                    { key: 'tutors', label: t('landing.v2.animBizTutors'), value: '11', tone: 'text-zinc-900' },
                    { key: 'unpaid', label: t('dash.unpaid'), value: '€320', tone: 'text-amber-700' },
                  ].map((s) => (
                    <div key={s.key} className="rounded-xl bg-zinc-50 px-3 py-3">
                      <p className="text-[10px] text-zinc-400">{s.label}</p>
                      <p className={`mt-1 text-lg font-bold ${s.tone}`}>{s.value}</p>
                    </div>
                  ))}
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-zinc-100">
                  <div className="h-full w-[78%] rounded-full bg-gradient-to-r from-orange-400 to-emerald-400" />
                </div>
                <p className="mt-2 text-[11px] text-zinc-400">{t('landing.v2.demo.paidOnTime', { percent: 78 })}</p>
              </Panel>

              <Panel active={bPhase === 'tutors'}>
                <p className="text-[15px] font-semibold text-zinc-900">{t('landing.v2.animBizTutors')}</p>
                <p className="mt-0.5 text-[12px] text-zinc-500">{t('landing.v2.demo.hoursPayMonth')}</p>
                <div className="mt-3 space-y-2">
                  {tutors.map((tutor, i) => (
                    <div
                      key={tutor.seed}
                      className={`flex items-center gap-2.5 rounded-xl px-3 py-2.5 transition-all ${
                        !reducedMotion && tick % 5 === i ? 'bg-orange-50 ring-1 ring-orange-200' : 'bg-zinc-50'
                      }`}
                    >
                      <MiniAvatar seed={tutor.seed} alt={tutor.name} size="sm" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-semibold text-zinc-900">{tutor.name}</p>
                        <p className="truncate text-[11px] text-zinc-500">{t(tutor.subjectKey)}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-[11px] font-semibold text-zinc-900">{tutor.hours}</p>
                        <p className="text-[11px] text-emerald-700">{tutor.pay}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </Panel>

              <Panel active={bPhase === 'payments'}>
                <p className="text-[15px] font-semibold text-zinc-900">{t('landing.v2.animBizPayments')}</p>
                <p className="mt-0.5 text-[12px] text-zinc-500">{t('landing.v2.demo.paymentStreams')}</p>
                <div className="mt-4 space-y-2.5">
                  {[
                    { key: 'individual', label: t('landing.v2.demo.individualLessons'), amount: '€1 240', pct: '70%' },
                    { key: 'group', label: t('landing.v2.demo.groupLessons'), amount: '€680', pct: '55%' },
                    { key: 'packages', label: t('landing.v2.demo.prepaidPackages'), amount: '€220', pct: '90%' },
                  ].map((row) => (
                    <div key={row.key}>
                      <div className="mb-1 flex justify-between text-[12px]">
                        <span className="font-medium text-zinc-700">{row.label}</span>
                        <span className="font-semibold text-zinc-900">{row.amount}</span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-zinc-100">
                        <div className="h-full rounded-full bg-orange-400" style={{ width: row.pct }} />
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-4 flex items-center justify-between rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2.5 text-[12px] font-medium text-emerald-800">
                  <span>{t('landing.v2.demo.receivedToday', { amount: '€180', count: 9 })}</span>
                  <AvatarStack people={students} size="xs" max={3} />
                </div>
              </Panel>

              <Panel active={bPhase === 'messages'}>
                <p className="text-[15px] font-semibold text-zinc-900">{t('landing.v2.animBizMessages')}</p>
                <p className="mt-0.5 text-[12px] text-zinc-500">{t('landing.v2.demo.channels')}</p>
                <div className="mt-3 space-y-2">
                  {channels.map((ch) => {
                    const name = ch.name;
                    return (
                    <div key={ch.seed} className="flex items-start gap-2.5 rounded-xl bg-zinc-50 px-3 py-2.5">
                      <MiniAvatar seed={ch.seed} alt={name} size="sm" className="mt-0.5" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className="truncate text-[13px] font-semibold text-zinc-900">{name}</p>
                          <span className="shrink-0 text-[10px] text-zinc-400">{ch.time}</span>
                        </div>
                        <p className="truncate text-[11px] text-zinc-500">{t(ch.previewKey)}</p>
                      </div>
                      {ch.unread > 0 && (
                        <span className="mt-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-orange-500 px-1 text-[10px] font-bold text-white">
                          {ch.unread}
                        </span>
                      )}
                    </div>
                    );
                  })}
                </div>
              </Panel>

              <Panel active={bPhase === 'parents'}>
                <p className="text-[15px] font-semibold text-zinc-900">{t('landing.v2.animBizParents')}</p>
                <p className="mt-0.5 text-[12px] text-zinc-500">{t('landing.v2.demo.parentAccess')}</p>
                <div className="mt-3 space-y-2">
                  {[
                    { seed: 'mockai', family: personas.families[0], child: `${personas.children[0]} · ${t('landing.v2.demo.subjectEnglish')} B2`, active: true },
                    { seed: 'petraiciai', family: personas.families[1], child: `${personas.children[1]} · ${t('landing.v2.demo.subjectMath')}`, active: true },
                    { seed: 'kazlauskai', family: personas.families[2], child: `${personas.children[2]} · ${t('landing.v2.demo.subjectPhysics')}`, active: false },
                  ].map((row) => (
                    <div key={row.family} className="flex items-center justify-between rounded-xl bg-zinc-50 px-3 py-2.5">
                      <div className="flex items-center gap-2.5">
                        <MiniAvatar seed={row.seed} alt={row.family} size="sm" />
                        <div>
                          <p className="text-[13px] font-semibold text-zinc-900">{row.family}</p>
                          <p className="text-[11px] text-zinc-500">{row.child}</p>
                        </div>
                      </div>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                        row.active ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                      }`}>
                        {row.active ? t('landing.v2.profileParentActive') : t('landing.v2.demo.waiting')}
                      </span>
                    </div>
                  ))}
                </div>
              </Panel>
            </>
          )}
        </Chrome>
      </div>
    </div>
  );
}
