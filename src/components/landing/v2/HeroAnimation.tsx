import { useEffect, useRef, useState } from 'react';
import {
  Check, Pause, Play, Send,
} from 'lucide-react';
import { useTranslation } from '@/lib/i18n';
import type { LandingAudience } from './audience';
import { AvatarStack, MiniAvatar } from './demoAvatars';
import { getLandingDemoPersonas } from './demoPersonas';
import { Ltr } from './bidi';
import { CountUp, Grow, Rise, TypingDots, formatEuro, usePrefersReducedMotion } from './motion';

/**
 * Continuous hero vignette with autoplay (pause/play in the chrome header).
 *
 * Each phase replays its own micro-story on top of the panel swap: numbers
 * count up, bars grow, rows stagger in, a late payment lands, a parent types
 * and sends a message while the admin drafts a reply, an invited family
 * activates its account. Beats are keyed off `local`, the tick count since
 * the current phase began, so they line up the same on every loop.
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
  { seed: 'rasa-a', subjectKey: 'landing.v2.demo.subjectMath', hours: '18 h', pay: '€420', load: '90%' },
  { seed: 'tomas-k', subjectKey: 'landing.v2.demo.subjectEnglish', hours: '14 h', pay: '€350', load: '70%' },
  { seed: 'inga-j', subjectKey: 'landing.v2.demo.subjectPhysics', hours: '11 h', pay: '€275', load: '55%' },
  { seed: 'mantas-k', subjectKey: 'landing.v2.demo.subjectChemistry', hours: '9 h', pay: '€210', load: '45%' },
] as const;

const LOOP_TICKS = 32;
const TICK_MS = 460;

type SoloPhase = 'calendar' | 'attendance' | 'payment' | 'invoice' | 'extras';
type BizPhase = 'stats' | 'tutors' | 'payments' | 'messages' | 'parents';

const SOLO_START: Record<SoloPhase, number> = { calendar: 0, attendance: 6, payment: 13, invoice: 19, extras: 25 };
const BIZ_START: Record<BizPhase, number> = { stats: 0, tutors: 6, payments: 13, messages: 19, parents: 25 };

function soloPhase(tick: number): SoloPhase {
  if (tick < SOLO_START.attendance) return 'calendar';
  if (tick < SOLO_START.payment) return 'attendance';
  if (tick < SOLO_START.invoice) return 'payment';
  if (tick < SOLO_START.extras) return 'invoice';
  return 'extras';
}

function bizPhase(tick: number): BizPhase {
  if (tick < BIZ_START.tutors) return 'stats';
  if (tick < BIZ_START.payments) return 'tutors';
  if (tick < BIZ_START.messages) return 'payments';
  if (tick < BIZ_START.parents) return 'messages';
  return 'parents';
}

function PhaseChip({ label }: { label: string }) {
  return (
    <span className="rounded-full border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-[10px] font-semibold text-zinc-600">
      {label}
    </span>
  );
}

function StatusPill({ ok, pop, children }: { ok: boolean; pop?: boolean; children: React.ReactNode }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-2 py-0.5 text-[10px] font-semibold text-zinc-700 ${
        pop ? 'landing-pop' : ''
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${ok ? 'bg-emerald-500' : 'bg-amber-500'}`} />
      {children}
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
        {actions ? <div className="ms-auto flex items-center">{actions}</div> : null}
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
  /** Ticks since the current phase began; every in-phase beat is keyed off it. */
  const local = tick - (isSolo ? SOLO_START[sPhase] : BIZ_START[bPhase]);
  const solo = (phase: SoloPhase) => isSolo && sPhase === phase;
  const biz = (phase: BizPhase) => !isSolo && bPhase === phase;

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

  // Agency story beats.
  const lateLanded = reducedMotion || (bPhase === 'payments' && local >= 3);
  const familyTyping = !reducedMotion && bPhase === 'messages' && local < 2;
  const familyArrived = reducedMotion || (bPhase === 'messages' && local >= 2);
  const replyText = t('landing.v2.demo.reply');
  const replySent = reducedMotion || (bPhase === 'messages' && local >= 5);
  const typedReply = !reducedMotion && bPhase === 'messages' && !replySent ? replyText.slice(0, Math.max(0, local - 1) * 18) : '';
  const joined = reducedMotion || (bPhase === 'parents' && local >= 3);
  const invitePressed = !reducedMotion && bPhase === 'parents' && local === 1;

  const collected = lateLanded ? 220 : 180;
  const channels = [
    {
      seed: 'parents-8',
      name: t('landing.v2.demo.parentsGroup'),
      preview: replySent ? replyText : t('landing.v2.demo.moveThursday'),
      time: '2 min',
      unread: replySent ? 0 : 2,
      typing: false,
      pop: false,
    },
    { seed: 'proklase-admin', name: personas.schoolTeam, preview: t('landing.v2.demo.newStudentWaiting'), time: '14 min', unread: 0, typing: false, pop: false },
    { seed: 'rasa-a', name: personas.tutors[0], preview: t('landing.v2.demo.groupToday'), time: '1 h', unread: 1, typing: false, pop: false },
    {
      seed: 'mockai',
      name: personas.families[0],
      preview: familyArrived ? t('landing.v2.demo.invoiceThanks') : `INV-2026-0314 · ${t('landing.v2.demo.invoiceReady')}`,
      time: familyArrived ? '1 min' : '2 h',
      unread: familyArrived ? 1 : 0,
      typing: familyTyping,
      pop: familyArrived && !reducedMotion,
    },
    {
      seed: 'tomas-k',
      name: personas.tutors[1],
      preview: `${t('landing.v2.demo.subjectEnglish')} B2 · ${t('landing.v2.demo.groupLessons')}`,
      time: '3 h',
      unread: 0,
      typing: false,
      pop: false,
    },
  ];

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
                        {col.lessons.map((lesson, lessonIndex) => (
                          <Rise
                            key={lesson.seed}
                            on={solo('calendar')}
                            index={columnIndex + lessonIndex}
                            instant={reducedMotion}
                            className={`absolute inset-x-0.5 overflow-hidden rounded-md px-0.5 py-0.5 text-center text-[8px] font-semibold text-white ${lesson.color} ${
                              calendarFocus && 'focus' in lesson && lesson.focus ? 'scale-105 ring-2 ring-orange-300' : ''
                            }`}
                            style={{ top: `${lesson.top}%`, height: `${lesson.h}%` }}
                          >
                            {t(lesson.subjectKey)}
                          </Rise>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
                <Rise on={solo('calendar')} index={6} instant={reducedMotion} className="mt-3 flex items-center justify-between rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2">
                  <span className="flex items-center gap-2 text-[11px] font-medium text-zinc-700">
                    <AvatarStack people={students} size="xs" max={3} />
                    {t('landing.v2.demo.waitlistCount', { count: 3 })}
                  </span>
                  <span className="rounded-full bg-zinc-900 px-2 py-0.5 text-[10px] font-semibold text-white">Auto</span>
                </Rise>
              </Panel>

              <Panel active={sPhase === 'attendance'}>
                <div className="flex items-center gap-2.5">
                  <MiniAvatar seed="paulius-tutor" alt={personas.students[3]} size="md" />
                  <div>
                    <p className="text-[15px] font-semibold text-zinc-900">{personas.students[3]} · {t('landing.v2.demo.subjectMath')}</p>
                    <p className="mt-0.5 text-[12px] text-zinc-500"><Ltr>12:00 – 12:45</Ltr> · {t('landing.v2.demo.today')}</p>
                  </div>
                </div>
                <p className="mt-4 text-[11px] font-medium uppercase tracking-wide text-zinc-400">{t('landing.insideStudents')}</p>
                <div className="mt-2 flex flex-col gap-2">
                  {students.map((row, i) => {
                    const done = i < markedCount;
                    return (
                      <Rise
                        key={row.seed}
                        on={solo('attendance')}
                        index={i}
                        instant={reducedMotion}
                        className={`flex h-[46px] items-center justify-between rounded-xl px-3 ${done ? 'bg-zinc-100' : 'bg-zinc-50'}`}
                      >
                        <div className="flex items-center gap-2.5">
                          <MiniAvatar seed={row.seed} alt={row.name} size="sm" />
                          <span className="text-[13px] font-medium text-zinc-900">{row.name}</span>
                        </div>
                        <span className={`inline-flex items-center gap-1.5 rounded-full border bg-white px-2.5 py-1 text-[11px] font-semibold ${done ? 'border-zinc-200 text-zinc-900' : 'border-zinc-200 text-zinc-400'}`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${done ? 'bg-emerald-500' : 'bg-zinc-300'}`} />
                          {done ? t('status.completed') : t('stuSess.upcoming')}
                        </span>
                      </Rise>
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
                <div className="mt-4 rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                  <div className="flex items-end justify-between">
                    <div>
                      <p className="text-[11px] font-medium text-zinc-500">{t('landing.v2.demo.paidViaStripe')}</p>
                      <p className="mt-1 font-display text-3xl font-bold text-zinc-900">
                        <Ltr>+<CountUp on={solo('payment')} to={20} format={(n) => `€${n}`} instant={reducedMotion} /></Ltr>
                      </p>
                    </div>
                    {(reducedMotion || solo('payment')) && (
                      <span className="landing-pop mb-1 flex h-9 w-9 items-center justify-center rounded-full bg-white text-emerald-600 shadow-sm ring-1 ring-zinc-200">
                        <Check className="h-5 w-5" strokeWidth={2.5} />
                      </span>
                    )}
                  </div>
                </div>
                <div className="mt-3 space-y-2">
                  {students.map((p, i) => (
                    <Rise
                      key={p.seed}
                      on={solo('payment')}
                      index={i}
                      base={250}
                      instant={reducedMotion}
                      className="flex items-center justify-between rounded-xl bg-zinc-50 px-3 py-2 text-[12px]"
                    >
                      <span className="flex items-center gap-2 font-medium text-zinc-800">
                        <MiniAvatar seed={p.seed} alt={p.name} size="xs" />
                        {p.name}
                      </span>
                      <StatusPill ok={i < 2}>{i < 2 ? t('dash.paidLabel') : t('landing.v2.demo.waiting')}</StatusPill>
                    </Rise>
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
                  <Rise on={solo('invoice')} index={0} instant={reducedMotion} className="flex justify-between text-[12px] text-zinc-500">
                    <span>{t('landing.v2.demo.recipient')}</span><span className="font-medium text-zinc-900">{personas.families[0]}</span>
                  </Rise>
                  <Rise on={solo('invoice')} index={1} instant={reducedMotion} className="mt-2 flex justify-between text-[12px] text-zinc-500">
                    <span>{t('common.lesson')}</span><span className="font-medium text-zinc-900">{t('landing.v2.demo.subjectMath')} · 45 {t('time.minutes')}</span>
                  </Rise>
                  <Rise on={solo('invoice')} index={2} instant={reducedMotion} className="mt-3 flex justify-between border-t border-zinc-100 pt-3">
                    <span className="text-sm font-semibold">{t('invoice.amountLabel')}</span><span className="font-display text-xl font-bold">€20,00</span>
                  </Rise>
                </div>
                <Rise on={solo('invoice')} index={3} instant={reducedMotion} className="mt-3 flex gap-2">
                  <span className="flex-1 rounded-xl bg-zinc-900 py-2.5 text-center text-[12px] font-semibold text-white">{t('landing.v2.demo.sendParents')}</span>
                  <span className="rounded-xl border border-zinc-200 px-3 py-2.5 text-[12px] font-semibold text-zinc-600">PDF</span>
                </Rise>
              </Panel>

              <Panel active={sPhase === 'extras'}>
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-[15px] font-semibold text-zinc-900">{t('landing.v2.animSoloCard')}</p>
                    <p className="mt-0.5 text-[11px] text-sky-700">{personas.publicProfileUrl}</p>
                  </div>
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-2 py-0.5 text-[10px] font-semibold text-zinc-700">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    {t('landing.v2.demo.online')}
                  </span>
                </div>
                <Rise on={solo('extras')} index={0} instant={reducedMotion} className="mt-3 rounded-xl border border-zinc-100 bg-zinc-50/80 p-3">
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
                              ? 'border-zinc-900 bg-zinc-900 text-white'
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
                </Rise>
                <p className="mt-2 text-[11px] text-zinc-500">{t('landing.v2.animSoloCardHint')}</p>
              </Panel>

              {showCursor && (
                <div aria-hidden className="pointer-events-none absolute end-6 z-20 drop-shadow-md transition-all duration-400" style={{ top: `${cursorTop}%` }}>
                  <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
                    <path d="M3 3L10.07 19.97L12.58 12.58L19.97 10.07L3 3Z" fill="#111827" stroke="white" strokeWidth="2" strokeLinejoin="round" />
                  </svg>
                </div>
              )}
            </>
          ) : (
            <>
              <Panel active={bPhase === 'stats'}>
                <div className="flex h-full flex-col">
                  <p className="text-[15px] font-semibold text-zinc-900">{t('landing.v2.animBizStats')}</p>
                  <p className="mt-0.5 text-[12px] text-zinc-500">{t('landing.v2.demo.schoolWeek')}</p>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    {[
                      { key: 'lessons', label: t('common.lessons'), value: 86, format: String, tone: 'text-zinc-900' },
                      { key: 'revenue', label: t('dash.revenue'), value: 2140, format: formatEuro, tone: 'text-emerald-700' },
                      { key: 'tutors', label: t('landing.v2.animBizTutors'), value: 11, format: String, tone: 'text-zinc-900' },
                      { key: 'unpaid', label: t('dash.unpaid'), value: 320, format: formatEuro, tone: 'text-amber-700' },
                    ].map((s, i) => (
                      <Rise key={s.key} on={biz('stats')} index={i} instant={reducedMotion} className="rounded-xl bg-zinc-50 px-3 py-2.5">
                        <p className="text-[10px] text-zinc-400">{s.label}</p>
                        <p className={`mt-0.5 text-lg font-bold tabular-nums ${s.tone}`}>
                          <CountUp on={biz('stats')} to={s.value} format={s.format} delay={i * 80} instant={reducedMotion} />
                        </p>
                      </Rise>
                    ))}
                  </div>
                  <Rise on={biz('stats')} index={4} instant={reducedMotion} className="mt-3 rounded-xl border border-zinc-100 p-3">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-medium text-zinc-700">{t('landing.v2.demo.utilizationByDay')}</span>
                      <span className="font-medium text-emerald-700">{t('landing.v2.demo.growthVsLast', { percent: 12 })}</span>
                    </div>
                    <div className="mt-2 flex h-14 items-end gap-1.5">
                      {[62, 78, 55, 92, 70].map((h, i) => (
                        <div key={i} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
                          <Grow
                            on={biz('stats')}
                            axis="y"
                            size={`${h}%`}
                            delay={350 + i * 70}
                            instant={reducedMotion}
                            className={`w-full rounded-sm ${i === 3 ? 'bg-zinc-900' : 'bg-zinc-200'}`}
                          />
                          <span className="text-[8px] font-medium uppercase text-zinc-400">{weekdays[i]}</span>
                        </div>
                      ))}
                    </div>
                  </Rise>
                  <div className="mt-auto pt-3">
                    <div className="h-1.5 overflow-hidden rounded-full bg-zinc-100">
                      <Grow on={biz('stats')} size="78%" delay={600} instant={reducedMotion} className="h-full rounded-full bg-zinc-900" />
                    </div>
                    <p className="mt-1.5 text-[11px] text-zinc-400">{t('landing.v2.demo.paidOnTime', { percent: 78 })}</p>
                  </div>
                </div>
              </Panel>

              <Panel active={bPhase === 'tutors'}>
                <div className="flex h-full flex-col">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-[15px] font-semibold text-zinc-900">{t('landing.v2.animBizTutors')}</p>
                      <p className="mt-0.5 text-[12px] text-zinc-500">{t('landing.v2.demo.hoursPayMonth')}</p>
                    </div>
                    <span className="shrink-0 rounded-full border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-[10px] font-semibold text-zinc-600">
                      {t('landing.v2.demo.teamCount', { count: 11 })}
                    </span>
                  </div>
                  <div className="mt-3 space-y-1.5">
                    {tutors.map((tutor, i) => (
                      <Rise
                        key={tutor.seed}
                        on={biz('tutors')}
                        index={i}
                        instant={reducedMotion}
                        className={`flex items-center gap-2.5 rounded-xl px-3 py-2 ${
                          !reducedMotion && tick % 5 === i ? 'bg-zinc-100 ring-1 ring-zinc-200' : 'bg-zinc-50'
                        }`}
                      >
                        <MiniAvatar seed={tutor.seed} alt={tutor.name} size="sm" />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-baseline justify-between gap-2">
                            <p className="truncate text-[13px] font-semibold text-zinc-900">{tutor.name}</p>
                            <p className="shrink-0 text-[10px] text-zinc-400">{t(tutor.subjectKey)}</p>
                          </div>
                          <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-zinc-200">
                            <Grow on={biz('tutors')} size={tutor.load} delay={250 + i * 90} instant={reducedMotion} className="h-full rounded-full bg-zinc-900" />
                          </div>
                        </div>
                        <div className="text-end">
                          <p dir="ltr" className="text-[11px] font-semibold text-zinc-900">{tutor.hours}</p>
                          <p dir="ltr" className="text-[11px] text-emerald-700">{tutor.pay}</p>
                        </div>
                      </Rise>
                    ))}
                  </div>
                  <Rise on={biz('tutors')} index={5} instant={reducedMotion} className="mt-auto flex items-center justify-between rounded-xl border border-zinc-100 px-3 py-2 text-[11px]">
                    <span className="text-zinc-500">{t('landing.v2.demo.agencySummary')}</span>
                    <span dir="ltr" className="font-semibold text-zinc-900">52 h · €1 255</span>
                  </Rise>
                </div>
              </Panel>

              <Panel active={bPhase === 'payments'}>
                <div className="flex h-full flex-col">
                  <p className="text-[15px] font-semibold text-zinc-900">{t('landing.v2.animBizPayments')}</p>
                  <p className="mt-0.5 text-[12px] text-zinc-500">{t('landing.v2.demo.paymentStreams')}</p>
                  <div className="mt-3 space-y-2">
                    {[
                      { key: 'individual', label: t('landing.v2.demo.individualLessons'), amount: '€1 240', pct: '70%' },
                      { key: 'group', label: t('landing.v2.demo.groupLessons'), amount: '€680', pct: '55%' },
                      { key: 'packages', label: t('landing.v2.demo.prepaidPackages'), amount: '€220', pct: '90%' },
                    ].map((row, i) => (
                      <Rise key={row.key} on={biz('payments')} index={i} instant={reducedMotion}>
                        <div className="mb-1 flex justify-between text-[12px]">
                          <span className="font-medium text-zinc-700">{row.label}</span>
                          <span dir="ltr" className="font-semibold text-zinc-900">{row.amount}</span>
                        </div>
                        <div className="h-1.5 overflow-hidden rounded-full bg-zinc-100">
                          <Grow on={biz('payments')} size={row.pct} delay={200 + i * 90} instant={reducedMotion} className="h-full rounded-full bg-zinc-900" />
                        </div>
                      </Rise>
                    ))}
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <Rise on={biz('payments')} index={3} instant={reducedMotion} className="rounded-xl bg-zinc-50 px-3 py-2">
                      <p className="text-[10px] text-zinc-400">{t('landing.v2.demo.todayCollected')}</p>
                      <p className="mt-0.5 text-[15px] font-bold tabular-nums text-emerald-700">
                        <CountUp on={biz('payments')} to={collected} format={formatEuro} instant={reducedMotion} />
                      </p>
                      <p className="text-[10px] text-zinc-400">{t('landing.v2.demo.paymentsCount', { count: lateLanded ? 10 : 9 })}</p>
                    </Rise>
                    <Rise on={biz('payments')} index={4} instant={reducedMotion} className="rounded-xl bg-zinc-50 px-3 py-2">
                      <p className="text-[10px] text-zinc-400">{t('landing.v2.demo.overdue')}</p>
                      <p className="mt-0.5 text-[15px] font-bold tabular-nums text-amber-700">
                        <CountUp on={biz('payments')} to={320} format={formatEuro} instant={reducedMotion} />
                      </p>
                      <p className="text-[10px] text-zinc-400">{t('landing.v2.demo.invoicesCount', { count: 4 })}</p>
                    </Rise>
                  </div>
                  <div className="mt-auto space-y-1.5 pt-3">
                    {students.map((p, i) => {
                      const paid = i !== 1 || lateLanded;
                      return (
                        <Rise
                          key={p.seed}
                          on={biz('payments')}
                          index={5 + i}
                          instant={reducedMotion}
                          className={`items-center justify-between rounded-xl bg-zinc-50 px-3 py-1.5 text-[11px] ${i === 2 ? 'hidden lg:flex' : 'flex'}`}
                        >
                          <span className="flex items-center gap-2 font-medium text-zinc-800">
                            <MiniAvatar seed={p.seed} alt={p.name} size="xs" />
                            {p.name}
                          </span>
                          <span dir="ltr" className="font-semibold tabular-nums text-zinc-900">{['€60', '€40', '€80'][i]}</span>
                          <StatusPill key={paid ? 'paid' : 'waiting'} ok={paid} pop={i === 1 && paid && !reducedMotion}>
                            {paid ? t('dash.paidLabel') : t('landing.v2.demo.waiting')}
                          </StatusPill>
                        </Rise>
                      );
                    })}
                  </div>
                </div>
              </Panel>

              <Panel active={bPhase === 'messages'}>
                <div className="flex h-full flex-col">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-[15px] font-semibold text-zinc-900">{t('landing.v2.animBizMessages')}</p>
                      <p className="mt-0.5 text-[12px] text-zinc-500">{t('landing.v2.demo.channels')}</p>
                    </div>
                    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-[10px] font-semibold text-zinc-600">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                      {t('landing.v2.demo.activeNow', { count: 4 })}
                    </span>
                  </div>
                  <div className="mt-3 space-y-1.5">
                    {channels.map((ch, i) => (
                      <Rise
                        key={ch.seed}
                        on={biz('messages')}
                        index={i}
                        instant={reducedMotion}
                        className={`items-start gap-2.5 rounded-xl bg-zinc-50 px-3 py-2 ${i === 4 ? 'hidden lg:flex' : 'flex'}`}
                      >
                        <MiniAvatar seed={ch.seed} alt={ch.name} size="sm" className="mt-0.5" />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <p className="truncate text-[13px] font-semibold text-zinc-900">{ch.name}</p>
                            <span dir="ltr" className="shrink-0 text-[10px] text-zinc-400">{ch.time}</span>
                          </div>
                          {ch.typing ? (
                            <TypingDots className="mt-1 h-[15px]" />
                          ) : (
                            <p className="truncate text-[11px] text-zinc-500">{ch.preview}</p>
                          )}
                        </div>
                        {ch.unread > 0 && (
                          <span
                            key={ch.unread}
                            className={`mt-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-zinc-900 px-1 text-[10px] font-bold text-white ${
                              ch.pop ? 'landing-pop' : ''
                            }`}
                          >
                            {ch.unread}
                          </span>
                        )}
                      </Rise>
                    ))}
                  </div>
                  <div className="mt-auto hidden items-center gap-2 rounded-xl border border-zinc-200 px-3 py-2 sm:flex">
                    {typedReply ? (
                      <span className="flex-1 truncate text-[11px] text-zinc-900">
                        {typedReply}
                        <span className="landing-caret ml-px inline-block h-3 w-px translate-y-0.5 bg-zinc-900" />
                      </span>
                    ) : (
                      <span className="flex-1 truncate text-[11px] text-zinc-400">{t('landing.v2.demo.messagePlaceholder')}</span>
                    )}
                    <span
                      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-white transition-colors ${
                        typedReply ? 'bg-zinc-900' : 'bg-zinc-300'
                      }`}
                    >
                      <Send className="h-3 w-3" />
                    </span>
                  </div>
                </div>
              </Panel>

              <Panel active={bPhase === 'parents'}>
                <div className="flex h-full flex-col">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-[15px] font-semibold text-zinc-900">{t('landing.v2.animBizParents')}</p>
                      <p className="mt-0.5 text-[12px] text-zinc-500">{t('landing.v2.demo.parentAccess')}</p>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold text-white transition-all duration-200 ${
                        invitePressed ? 'scale-95 bg-zinc-700' : 'bg-zinc-900'
                      }`}
                    >
                      {t('landing.v2.demo.invite')}
                    </span>
                  </div>
                  <div className="mt-3 space-y-1.5">
                    {[
                      { seed: 'mockai', family: personas.families[0], child: `${personas.children[0]} · ${t('landing.v2.demo.subjectEnglish')} B2`, active: true, pop: false },
                      { seed: 'petraiciai', family: personas.families[1], child: `${personas.children[1]} · ${t('landing.v2.demo.subjectMath')}`, active: true, pop: false },
                      { seed: 'kazlauskai', family: personas.families[2], child: `${personas.children[2]} · ${t('landing.v2.demo.subjectPhysics')}`, active: joined, pop: joined && !reducedMotion },
                      { seed: 'brownai', family: personas.families[3], child: `${personas.children[3]} · ${t('landing.v2.demo.subjectChemistry')}`, active: true, pop: false },
                    ].map((row, i) => (
                      <Rise
                        key={row.family}
                        on={biz('parents')}
                        index={i}
                        instant={reducedMotion}
                        className="flex items-center justify-between rounded-xl bg-zinc-50 px-3 py-2"
                      >
                        <div className="flex min-w-0 items-center gap-2.5">
                          <MiniAvatar seed={row.seed} alt={row.family} size="sm" />
                          <div className="min-w-0">
                            <p className="truncate text-[13px] font-semibold text-zinc-900">{row.family}</p>
                            <p className="truncate text-[11px] text-zinc-500">{row.child}</p>
                          </div>
                        </div>
                        <StatusPill key={row.active ? 'active' : 'waiting'} ok={row.active} pop={row.pop}>
                          {row.active ? t('landing.v2.profileParentActive') : t('landing.v2.demo.waiting')}
                        </StatusPill>
                      </Rise>
                    ))}
                  </div>
                  <Rise on={biz('parents')} index={4} instant={reducedMotion} className="mt-auto rounded-xl border border-zinc-100 px-3 py-2 text-[11px] text-zinc-500">
                    {t('landing.v2.demo.remindersSent', { count: joined ? 47 : 46 })}
                  </Rise>
                </div>
              </Panel>
            </>
          )}
        </Chrome>
      </div>
    </div>
  );
}
