import { useEffect, useRef, useState } from 'react';
import {
  BarChart3, CalendarDays, Check, CreditCard, FileText, Link2,
  MessageCircle, Pause, Play, Send, Users, Wallet,
} from 'lucide-react';
import { useTranslation } from '@/lib/i18n';
import Reveal from '../Reveal';
import type { LandingAudience } from './audience';
import { AvatarStack, MiniAvatar } from './demoAvatars';
import { getLandingDemoPersonas } from './demoPersonas';
import { Ltr } from './bidi';
import { CountUp, Grow, Rise, TypingDots, formatEuro, usePrefersReducedMotion } from './motion';

/**
 * "Product walkthrough" frame: a desktop-sized mock of the app that cycles
 * through five stages. The frame tilts in on scroll and, once it has settled,
 * drops every transform so the browser rasterises the text at native
 * resolution again (a resting 3D transform keeps the layer on the GPU and
 * renders it noticeably soft).
 */

const MAX_TILT_DEG = 6;
const MIN_SCALE = 0.97;
const LOOP_TICKS = 36;
const TICK_MS = 440;

type SoloPhase = 'calendar' | 'attendance' | 'payment' | 'invoice' | 'extras';
type BizPhase = 'stats' | 'tutors' | 'payments' | 'messages' | 'parents';

const SOLO_START: Record<SoloPhase, number> = { calendar: 0, attendance: 7, payment: 15, invoice: 22, extras: 29 };
const BIZ_START: Record<BizPhase, number> = { stats: 0, tutors: 7, payments: 15, messages: 22, parents: 29 };

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

const STUDENT_SEEDS = ['emilija-m', 'lukas-k', 'sofija-g', 'jonas-p'] as const;

const TUTOR_ROWS = [
  { seed: 'rasa-a', subjectKey: 'landing.v2.demo.subjectMath', detail: '8–12', hours: '18 h', pay: '€420', load: '90%', live: true },
  { seed: 'tomas-k', subjectKey: 'landing.v2.demo.subjectEnglish', detail: 'B1–C1', hours: '14 h', pay: '€350', load: '70%', live: true },
  { seed: 'inga-j', subjectKey: 'landing.v2.demo.subjectPhysics', detailKey: 'landing.v2.demo.exams', hours: '11 h', pay: '€275', load: '55%', live: false },
  { seed: 'mantas-k', subjectKey: 'landing.v2.demo.subjectChemistry', detail: '10–12', hours: '9 h', pay: '€210', load: '45%', live: true },
] as const;

const FAMILY_SEEDS = ['mockai', 'petraiciai', 'kazlauskai', 'brownai'] as const;

const WEEK_FACES = [
  { people: [{ seed: 'angl-1', subjectKey: 'landing.v2.demo.subjectEnglish' }] },
  { people: [{ seed: 'fiz-1', subjectKey: 'landing.v2.demo.subjectPhysics' }, { seed: 'chem-1', subjectKey: 'landing.v2.demo.subjectChemistry' }] },
  { people: [] },
  { people: [{ seed: 'mat-focus', subjectKey: 'landing.v2.demo.subjectMath' }] },
  { people: [{ seed: 'bio-1', subjectKey: 'landing.v2.demo.subjectBiology' }] },
  { people: [] },
  { people: [{ seed: 'ist-1', subjectKey: 'landing.v2.demo.subjectHistory' }] },
] as const;

/**
 * 0 while the frame is still below the fold, 1 once its top edge has risen to
 * the middle of the viewport. Measures synchronously on scroll (one
 * getBoundingClientRect, cheap) rather than through requestAnimationFrame,
 * which throttled or hidden tabs may never run, and also re-measures on every
 * IntersectionObserver step so a missed scroll event can't leave the frame
 * tilted. The document-level capture listener covers nested scroll containers.
 */
function useFlattenProgress(ref: React.RefObject<HTMLElement | null>): number {
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setProgress(1);
      return;
    }
    const update = () => {
      const rect = el.getBoundingClientRect();
      const vh = window.innerHeight || 1;
      setProgress(Math.min(Math.max((vh * 0.95 - rect.top) / (vh * 0.45), 0), 1));
    };
    update();
    document.addEventListener('scroll', update, { passive: true, capture: true });
    window.addEventListener('resize', update);
    const observer =
      typeof IntersectionObserver !== 'undefined'
        ? new IntersectionObserver(update, { threshold: [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1] })
        : null;
    observer?.observe(el);
    return () => {
      document.removeEventListener('scroll', update, { capture: true });
      window.removeEventListener('resize', update);
      observer?.disconnect();
    };
  }, [ref]);
  return progress;
}

function Panel({ active, children, className = '' }: { active: boolean; children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`absolute inset-3 transition-all duration-500 sm:inset-5 ${
        active ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-3 opacity-0'
      } ${className}`}
    >
      {children}
    </div>
  );
}

function Card({ className = '', children }: { className?: string; children: React.ReactNode }) {
  return <div className={`rounded-2xl border border-zinc-200 bg-white shadow-sm ${className}`}>{children}</div>;
}

function DotPill({ ok, pop, className = '', children }: { ok: boolean; pop?: boolean; className?: string; children: React.ReactNode }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-2 py-0.5 text-[10px] font-semibold text-zinc-700 ${
        pop ? 'landing-pop' : ''
      } ${className}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${ok ? 'bg-emerald-500' : 'bg-amber-500'}`} />
      {children}
    </span>
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
  /** Ticks since the current phase began; in-phase beats key off it. */
  const local = tick - (isSolo ? SOLO_START[sPhase] : BIZ_START[bPhase]);
  const solo = (p: SoloPhase) => isSolo && sPhase === p;
  const biz = (p: BizPhase) => !isSolo && bPhase === p;

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

  // Agency story beats.
  const lateLanded = reduced || (bPhase === 'payments' && local >= 3);
  const parentTyping = !reduced && bPhase === 'messages' && local >= 1 && local < 3;
  const parentArrived = reduced || (bPhase === 'messages' && local >= 3);
  const joined = reduced || (bPhase === 'parents' && local >= 3);
  const invitePressed = !reduced && bPhase === 'parents' && local === 1;
  const collected = lateLanded ? 220 : 180;
  const paymentsCount = lateLanded ? 10 : 9;

  const channels = [
    {
      seed: 'parents-8',
      name: t('landing.v2.demo.parentsGroup'),
      preview: parentArrived ? t('landing.v2.demo.invoiceThanks') : t('landing.v2.demo.reply'),
      time: parentArrived ? '1 min' : '9 min',
      unread: parentArrived ? 1 : 0,
      typing: parentTyping,
      pop: parentArrived && !reduced,
    },
    { seed: 'proklase-admin', name: personas.schoolTeam, preview: t('landing.v2.demo.newStudentWaiting'), time: '14 min', unread: 0, typing: false, pop: false },
    { seed: 'rasa-a', name: personas.tutors[0], preview: t('landing.v2.demo.groupToday'), time: '1 h', unread: 1, typing: false, pop: false },
    { seed: 'mockai', name: personas.families[0], preview: `INV-2026-0314 · ${t('landing.v2.demo.invoiceReady')}`, time: '2 h', unread: 0, typing: false, pop: false },
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

  const activity = [
    { key: 'paid', seed: 'emilija-m', who: personas.students[0], text: `${t('landing.v2.demo.paymentReceived')} · €60`, time: '2 min' },
    { key: 'student', seed: 'proklase-admin', who: personas.schoolTeam, text: t('landing.v2.demo.newStudentWaiting'), time: '14 min' },
    { key: 'invoice', seed: 'mockai', who: personas.families[0], text: `INV-2026-0314 · ${t('landing.v2.demo.invoiceReady')}`, time: '1 h' },
    { key: 'group', seed: 'rasa-a', who: personas.tutors[0], text: t('landing.v2.demo.groupToday'), time: '3 h' },
    { key: 'waitlist', seed: 'lukas-k', who: personas.students[1], text: `${t('landing.v2.demo.autoFilled')} · ${t('landing.v2.demo.waitlistCount', { count: 6 })}`, time: '4 h' },
    { key: 'newGroup', seed: 'tomas-k', who: personas.tutors[1], text: `${t('landing.v2.demo.groupLessons')} · ${t('landing.v2.demo.subjectEnglish')} B2`, time: '5 h' },
  ];

  /** Team heat map: how booked each tutor is on each weekday (0-3). */
  const heat = [
    [3, 2, 3, 3, 1],
    [2, 3, 1, 2, 2],
    [1, 2, 2, 1, 3],
    [2, 1, 0, 2, 1],
  ];
  const heatTone = ['bg-zinc-100', 'bg-zinc-300', 'bg-zinc-500', 'bg-zinc-900'];

  const schedule = [
    { time: '14:00', seed: 'rasa-a', name: personas.tutors[0], subject: t('landing.v2.demo.subjectMath'), tag: t('landing.v2.demo.online'), live: true },
    { time: '15:30', seed: 'tomas-k', name: personas.tutors[1], subject: `${t('landing.v2.demo.subjectEnglish')} B2`, tag: t('stuSess.group'), live: false },
    { time: '16:00', seed: 'inga-j', name: personas.tutors[2], subject: t('landing.v2.demo.subjectPhysics'), tag: t('landing.v2.demo.online'), live: true },
    { time: '17:30', seed: 'mantas-k', name: personas.tutors[3], subject: t('landing.v2.demo.subjectChemistry'), tag: t('stuSess.group'), live: false },
    { time: '18:00', seed: 'rasa-a', name: personas.tutors[0], subject: t('landing.v2.demo.subjectMath'), tag: t('landing.v2.demo.online'), live: true },
  ];

  const recentPayments = [
    { seed: 'emilija-m', name: personas.students[0], type: t('landing.v2.demo.individualLessons'), amount: '€60', paid: true, pop: false },
    { seed: 'lukas-k', name: personas.students[1], type: t('landing.v2.demo.groupLessons'), amount: '€40', paid: lateLanded, pop: lateLanded && !reduced },
    { seed: 'sofija-g', name: personas.students[2], type: `${t('landing.v2.demo.prepaidPackages')} · ${t('stuPay.lessonsCount', { count: '10' })}`, amount: '€120', paid: true, pop: false },
    { seed: 'petraiciai', name: personas.families[1], type: t('landing.v2.demo.individualLessons'), amount: '€80', paid: true, pop: false },
    { seed: 'jonas-p', name: personas.students[3], type: t('landing.v2.demo.groupLessons'), amount: '€40', paid: false, pop: false },
  ];

  const overdueRows = [
    { seed: 'kazlauskai', family: personas.families[2], child: `${personas.children[2]} · ${t('landing.v2.demo.subjectPhysics')}`, amount: '€120' },
    { seed: 'brownai', family: personas.families[3], child: `${personas.children[3]} · ${t('landing.v2.demo.subjectChemistry')}`, amount: '€80' },
    { seed: 'petraiciai', family: personas.families[1], child: `${personas.children[1]} · ${t('landing.v2.demo.subjectMath')}`, amount: '€120' },
  ];

  const parentActivity = [
    { key: 'invoice', seed: 'mockai', who: personas.families[0], text: `INV-2026-0314 · ${t('landing.v2.demo.paidViaStripe')}`, time: '2 min' },
    { key: 'paid', seed: 'petraiciai', who: personas.families[1], text: `${t('landing.v2.demo.paymentReceived')} · €80`, time: '1 h' },
    { key: 'joined', seed: 'kazlauskai', who: personas.families[2], text: t('landing.v2.demo.parentAccess'), time: joined ? '1 min' : '3 h' },
    { key: 'waiting', seed: 'brownai', who: personas.families[3], text: `${t('landing.v2.walkStepInvoice')} · ${t('landing.v2.demo.waiting')}`, time: '3 h' },
  ];

  const parentRows = [
    { seed: 'mockai', family: personas.families[0], child: `${personas.children[0]} · ${t('landing.v2.demo.subjectEnglish')} B2`, active: true, pop: false, payment: t('dash.paidLabel') },
    { seed: 'petraiciai', family: personas.families[1], child: `${personas.children[1]} · ${t('landing.v2.demo.subjectMath')}`, active: true, pop: false, payment: t('dash.paidLabel') },
    { seed: 'kazlauskai', family: personas.families[2], child: `${personas.children[2]} · ${t('landing.v2.demo.subjectPhysics')}`, active: joined, pop: joined && !reduced, payment: '€40' },
    { seed: 'brownai', family: personas.families[3], child: `${personas.children[3]} · ${t('landing.v2.demo.subjectChemistry')}`, active: true, pop: false, payment: t('landing.v2.demo.waiting') },
  ];

  return (
    <div className="flex h-full w-full flex-col bg-zinc-100">
      <div className="flex items-center gap-3 border-b border-zinc-200 bg-white px-4 py-3 sm:px-5">
        <img src="/logo-icon.png" alt="" className="h-6 w-6 rounded-md" />
        <span className="text-sm font-semibold text-zinc-900">Tutlio</span>
        <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-[11px] font-medium text-zinc-600">
          {isSolo ? t('landing.v2.audienceSolo') : t('landing.v2.audienceBiz')}
        </span>
        <nav className="ms-auto hidden items-center gap-1 md:flex">
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
        <aside className="hidden flex-col gap-1 border-e border-zinc-200 bg-white p-3 lg:flex">
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

        <div className="relative overflow-hidden bg-zinc-50">
          {isSolo ? (
            <>
              <Panel active={sPhase === 'calendar'}>
                <Card className="flex h-full flex-col p-4 sm:p-5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-base font-semibold text-zinc-900">{t('landing.feature.calendar')}</p>
                      <p className="text-xs text-zinc-500">{t('landing.v2.demo.weekLong')}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <AvatarStack people={students} size="sm" max={4} />
                      <span className="rounded-lg border border-zinc-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-zinc-700">{t('landing.v2.demo.waitingCount', { count: 3 })}</span>
                      <span className="rounded-lg bg-orange-500 px-3 py-1.5 text-[11px] font-semibold text-white">{t('landing.v2.demo.addLesson')}</span>
                    </div>
                  </div>
                  <div className="mt-4 grid flex-1 grid-cols-5 gap-2 sm:grid-cols-7">
                    {WEEK_FACES.map((col, i) => (
                      <Rise key={weekdays[i]} on={solo('calendar')} index={i} instant={reduced} className="rounded-xl bg-zinc-50 p-2">
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
                      </Rise>
                    ))}
                  </div>
                </Card>
              </Panel>

              <Panel active={sPhase === 'attendance'}>
                <Card className="mx-auto flex h-full max-w-lg flex-col p-5 sm:p-6">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <MiniAvatar seed="paulius-tutor" alt={personas.students[3]} size="lg" />
                      <div>
                        <p className="text-base font-semibold text-zinc-900">{personas.students[3]} · {t('landing.v2.demo.subjectMath')}</p>
                        <p className="text-xs text-zinc-500"><Ltr>12:00 – 12:45</Ltr> · {t('landing.v2.demo.groupToday').split('·').at(-1)?.trim()} · {t('landing.v2.demo.today')}</p>
                      </div>
                    </div>
                    <span className="rounded-full border border-zinc-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-zinc-700">{t('stuSess.group')}</span>
                  </div>
                  <p className="mt-5 text-[11px] font-medium uppercase tracking-wide text-zinc-400">{t('landing.insideStudents')}</p>
                  <div className="mt-2 space-y-2">
                    {students.map((row, i) => {
                      const done = i < marked;
                      return (
                        <Rise
                          key={row.seed}
                          on={solo('attendance')}
                          index={i}
                          instant={reduced}
                          className={`flex items-center justify-between rounded-xl px-3 py-3 ${done ? 'bg-zinc-100' : 'bg-zinc-50'}`}
                        >
                          <div className="flex items-center gap-3">
                            <MiniAvatar seed={row.seed} alt={row.name} size="md" />
                            <span className="text-sm font-medium text-zinc-900">{row.name}</span>
                          </div>
                          <span className={`inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-2.5 py-1 text-[11px] font-semibold ${done ? 'text-zinc-900' : 'text-zinc-400'}`}>
                            <span className={`h-1.5 w-1.5 rounded-full ${done ? 'bg-emerald-500' : 'bg-zinc-300'}`} />
                            {done ? t('status.completed') : t('stuSess.upcoming')}
                          </span>
                        </Rise>
                      );
                    })}
                  </div>
                </Card>
              </Panel>

              <Panel active={sPhase === 'payment'}>
                <div className="mx-auto grid h-full max-w-2xl gap-4 lg:grid-cols-[1.2fr_0.8fr]">
                  <Card className="p-5">
                    <div className="flex items-center gap-3">
                      <MiniAvatar seed="paulius-pay" alt={personas.students[3]} size="md" />
                      <div>
                        <p className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-500"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />{t('landing.v2.demo.paymentReceived')}</p>
                        <p className="text-sm text-zinc-500">{personas.students[3]} · {t('landing.v2.demo.subjectMath')} · Stripe</p>
                      </div>
                    </div>
                    <div className="mt-4 flex items-end justify-between">
                      <p className="font-display text-4xl font-bold text-zinc-900">
                        <Ltr>+<CountUp on={solo('payment')} to={20} format={(n) => `€${n}`} instant={reduced} /></Ltr>
                      </p>
                      {(reduced || solo('payment')) && (
                        <span className="landing-pop mb-1 flex h-10 w-10 items-center justify-center rounded-full bg-white text-emerald-600 shadow-sm ring-1 ring-zinc-200">
                          <Check className="h-5 w-5" strokeWidth={2.5} />
                        </span>
                      )}
                    </div>
                    <div className="mt-4 grid grid-cols-3 gap-2">
                      {[
                        { key: 'week', label: t('landing.v2.demo.thisWeek'), value: '€180' },
                        { key: 'paid', label: t('dash.paidLabel'), value: '9/11' },
                        { key: 'waiting', label: t('landing.v2.demo.waiting'), value: '€40' },
                      ].map((x, i) => (
                        <Rise key={x.key} on={solo('payment')} index={i} base={250} instant={reduced} className="rounded-xl bg-zinc-50 px-2.5 py-2">
                          <p className="text-[10px] text-zinc-400">{x.label}</p>
                          <p className="text-sm font-bold text-zinc-900">{x.value}</p>
                        </Rise>
                      ))}
                    </div>
                  </Card>
                  <Card className="p-4">
                    <p className="text-sm font-semibold text-zinc-900">{t('landing.v2.finWhoPaid')}</p>
                    <div className="mt-3 space-y-2.5">
                      {students.slice(0, 3).map((s, i) => (
                        <Rise key={s.seed} on={solo('payment')} index={3 + i} base={250} instant={reduced} className="flex items-center justify-between gap-2 text-sm">
                          <span className="flex min-w-0 items-center gap-2">
                            <MiniAvatar seed={s.seed} alt={s.name} size="sm" />
                            <span className="truncate font-medium text-zinc-800">{s.name}</span>
                          </span>
                          <DotPill ok={i < 2}>{i < 2 ? '€20' : t('landing.v2.demo.waiting')}</DotPill>
                        </Rise>
                      ))}
                    </div>
                  </Card>
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
                      <Rise on={solo('invoice')} index={0} instant={reduced} className="flex justify-between"><span>{t('landing.v2.demo.subjectMath')} · 45 {t('time.minutes')}</span><span className="text-zinc-900">€20</span></Rise>
                      <Rise on={solo('invoice')} index={1} instant={reduced} className="flex justify-between"><span>{t('landing.v2.demo.vat')}</span><span className="text-zinc-900">€0</span></Rise>
                      <Rise on={solo('invoice')} index={2} instant={reduced} className="flex justify-between border-t border-zinc-100 pt-3 text-zinc-900"><span className="font-semibold">{t('common.total')}</span><span className="font-display text-xl font-bold">€20,00</span></Rise>
                    </div>
                    <Rise on={solo('invoice')} index={3} instant={reduced} className="mt-5 flex gap-2">
                      <span className="flex-1 rounded-xl bg-zinc-900 py-2.5 text-center text-xs font-semibold text-white">{t('landing.v2.demo.sendParents')}</span>
                      <span className="rounded-xl border border-zinc-200 px-4 py-2.5 text-xs font-semibold text-zinc-700">PDF</span>
                    </Rise>
                  </div>
                </div>
              </Panel>

              <Panel active={sPhase === 'extras'}>
                <div className="mx-auto flex h-full max-w-lg flex-col justify-center gap-4">
                  <Rise on={solo('extras')} index={0} instant={reduced} className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
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
                                className={`rounded-xl border px-3 py-2 text-[12px] font-semibold transition-colors ${
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
                      </div>
                      <div className="rounded-xl bg-zinc-900 py-3 text-center text-[13px] font-semibold text-white">
                        {t('landing.v2.animSoloCardCta')}
                      </div>
                    </div>
                  </Rise>
                  <p className="text-center text-[12px] text-zinc-500">{t('landing.v2.animSoloCardHint')}</p>
                </div>
              </Panel>
            </>
          ) : (
            <>
              <Panel active={bPhase === 'stats'}>
                <div className="flex h-full flex-col gap-3">
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {[
                      { key: 'lessons', label: t('common.lessons'), value: 86, format: String, sub: t('landing.v2.demo.thisWeek') },
                      { key: 'revenue', label: t('dash.revenue'), value: 2140, format: formatEuro, sub: t('landing.v2.demo.growthVsLast', { percent: 12 }) },
                      { key: 'tutors', label: t('landing.v2.animBizTutors'), value: 11, format: String, sub: t('landing.v2.demo.activeNow', { count: 9 }) },
                      { key: 'unpaid', label: t('dash.unpaid'), value: 320, format: formatEuro, sub: t('landing.v2.demo.invoicesCount', { count: 14 }) },
                    ].map((c, i) => (
                      <Rise key={c.key} on={biz('stats')} index={i} instant={reduced} className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
                        <p className="text-[11px] text-zinc-400">{c.label}</p>
                        <p className="mt-1 text-2xl font-bold tabular-nums text-zinc-900">
                          <CountUp on={biz('stats')} to={c.value} format={c.format} delay={i * 80} instant={reduced} />
                        </p>
                        <p className="mt-1 text-[11px] text-zinc-500">{c.sub}</p>
                      </Rise>
                    ))}
                  </div>
                  <div className="grid gap-3 lg:grid-cols-2">
                    <Rise on={biz('stats')} index={4} instant={reduced} className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-semibold text-zinc-900">{t('landing.v2.demo.utilizationByDay')}</p>
                        <span className="text-[11px] font-medium text-emerald-700">{t('landing.v2.demo.growthVsLast', { percent: 12 })}</span>
                      </div>
                      <div className="mt-4 flex h-28 items-end gap-2">
                        {[40, 65, 50, 90, 75, 30, 20].map((h, i) => (
                          <div key={i} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
                            <Grow
                              on={biz('stats')}
                              axis="y"
                              size={`${h}%`}
                              delay={300 + i * 60}
                              instant={reduced}
                              className={`w-full rounded-t-md ${i === 3 ? 'bg-zinc-900' : 'bg-zinc-200'}`}
                            />
                            <span className="text-[9px] text-zinc-400">{weekdays[i]}</span>
                          </div>
                        ))}
                      </div>
                    </Rise>
                    <Rise on={biz('stats')} index={5} instant={reduced} className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
                      <p className="text-sm font-semibold text-zinc-900">{t('landing.v2.demo.topSubjects')}</p>
                      <div className="mt-3 space-y-3">
                        {[
                          { key: 'math', name: t('landing.v2.demo.subjectMath'), percent: 42 },
                          { key: 'english', name: t('landing.v2.demo.subjectEnglish'), percent: 28 },
                          { key: 'physics', name: t('landing.v2.demo.subjectPhysics'), percent: 18 },
                          { key: 'chemistry', name: t('landing.v2.demo.subjectChemistry'), percent: 12 },
                        ].map((r, i) => (
                          <div key={r.key}>
                            <div className="mb-1 flex justify-between text-xs"><span>{r.name}</span><span className="font-semibold tabular-nums">{r.percent}%</span></div>
                            <div className="h-1.5 overflow-hidden rounded-full bg-zinc-100">
                              <Grow on={biz('stats')} size={`${r.percent}%`} delay={350 + i * 80} instant={reduced} className="h-full rounded-full bg-zinc-900" />
                            </div>
                          </div>
                        ))}
                      </div>
                    </Rise>
                  </div>
                  <Rise on={biz('stats')} index={6} instant={reduced} className="hidden min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm lg:flex">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold text-zinc-900">{t('landing.v2.demo.agencySummary')}</p>
                      <span className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-zinc-700">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                        {t('landing.v2.demo.activeNow', { count: 9 })}
                      </span>
                    </div>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      {activity.map((a, i) => (
                        <Rise key={a.key} on={biz('stats')} index={7 + i} instant={reduced} className="flex items-center gap-3 rounded-xl bg-zinc-50 px-3 py-2">
                          <MiniAvatar seed={a.seed} alt={a.who} size="sm" />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-xs font-semibold text-zinc-900">{a.who}</p>
                            <p className="truncate text-[11px] text-zinc-500">{a.text}</p>
                          </div>
                          <span className="shrink-0 text-[10px] text-zinc-400">{a.time}</span>
                        </Rise>
                      ))}
                    </div>
                  </Rise>
                </div>
              </Panel>

              <Panel active={bPhase === 'tutors'}>
                <div className="grid h-full gap-4 lg:grid-cols-[1.2fr_0.8fr]">
                  <Rise on={biz('tutors')} index={0} instant={reduced} className="flex min-h-0 flex-col rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm sm:p-5">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-base font-semibold text-zinc-900">{t('landing.v2.animBizTutors')}</p>
                        <p className="text-xs text-zinc-500">{t('landing.v2.demo.hoursPayMonth')}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <AvatarStack people={tutors.map((x) => ({ seed: x.seed, name: x.name }))} size="sm" max={4} />
                        <span className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-zinc-700"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /><Ltr>4 online</Ltr></span>
                      </div>
                    </div>
                    <div className="mt-4 space-y-2">
                      {tutors.map((tutor, i) => (
                        <Rise
                          key={tutor.seed}
                          on={biz('tutors')}
                          index={1 + i}
                          instant={reduced}
                          className={`flex items-center gap-3 rounded-xl px-3 py-2.5 ${
                            !reduced && biz('tutors') && local % 4 === i ? 'bg-zinc-100 ring-1 ring-zinc-200' : 'bg-zinc-50'
                          }`}
                        >
                          <div className="relative shrink-0">
                            <MiniAvatar seed={tutor.seed} alt={tutor.name} size="lg" />
                            <span className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white ${tutor.live ? 'bg-emerald-400' : 'bg-zinc-300'}`} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-baseline justify-between gap-2">
                              <p className="truncate text-sm font-semibold text-zinc-900">{tutor.name}</p>
                              <p className="shrink-0 text-[11px] text-zinc-500">
                                {t(tutor.subjectKey)} · {'detailKey' in tutor ? t(tutor.detailKey) : <Ltr>{tutor.detail}</Ltr>}
                              </p>
                            </div>
                            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-zinc-200">
                              <Grow on={biz('tutors')} size={tutor.load} delay={300 + i * 90} instant={reduced} className="h-full rounded-full bg-zinc-900" />
                            </div>
                          </div>
                          <div className="w-14 shrink-0 text-end">
                            <p dir="ltr" className="text-xs font-semibold text-zinc-900">{tutor.hours}</p>
                            <p dir="ltr" className="text-xs text-emerald-700">{tutor.pay}</p>
                          </div>
                        </Rise>
                      ))}
                      <Rise on={biz('tutors')} index={5} instant={reduced} className="flex items-center justify-between rounded-xl border border-dashed border-zinc-200 px-3 py-2.5">
                        <span className="text-xs text-zinc-500">{t('landing.v2.demo.teamCount', { count: 11 })}</span>
                        <span className="rounded-lg bg-zinc-900 px-2.5 py-1 text-[11px] font-semibold text-white">{t('landing.v2.demo.invite')}</span>
                      </Rise>
                    </div>
                    <Rise on={biz('tutors')} index={6} instant={reduced} className="mt-4 hidden xl:block">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="font-medium text-zinc-700">{t('landing.v2.demo.utilizationByDay')}</span>
                        <span className="text-zinc-400">{t('landing.v2.demo.thisWeek')}</span>
                      </div>
                      <div className="mt-2 grid grid-cols-[28px_repeat(5,minmax(0,1fr))] gap-1">
                        <span />
                        {weekdays.slice(0, 5).map((d) => (
                          <span key={d} className="text-center text-[9px] font-medium uppercase text-zinc-400">{d}</span>
                        ))}
                        {tutors.map((tutor, row) => (
                          <div key={tutor.seed} className="contents">
                            <MiniAvatar seed={tutor.seed} alt={tutor.name} size="xs" />
                            {heat[row].map((level, col) => (
                              <Grow
                                key={col}
                                on={biz('tutors')}
                                size="100%"
                                delay={500 + row * 60 + col * 40}
                                instant={reduced}
                                className={`h-4 rounded-sm ${heatTone[level]}`}
                              />
                            ))}
                          </div>
                        ))}
                      </div>
                    </Rise>
                    <div className="mt-auto grid grid-cols-2 gap-2 pt-4">
                      <div className="rounded-xl border border-zinc-100 px-3 py-2">
                        <p className="text-[10px] text-zinc-400">{t('landing.v2.demo.agencySummary')}</p>
                        <p dir="ltr" className="mt-0.5 text-sm font-semibold text-zinc-900">52 h · €1 255</p>
                      </div>
                      <div className="rounded-xl border border-zinc-100 px-3 py-2">
                        <p className="text-[10px] text-zinc-400">{t('landing.v2.demo.retention')}</p>
                        <p className="mt-0.5 text-sm font-semibold tabular-nums text-zinc-900">
                          <CountUp on={biz('tutors')} to={94} format={(n) => `${n}%`} delay={300} instant={reduced} />
                        </p>
                      </div>
                    </div>
                  </Rise>
                  <Rise on={biz('tutors')} index={2} instant={reduced} className="hidden min-h-0 flex-col rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm lg:flex">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold capitalize text-zinc-900">{t('landing.v2.demo.today')}</p>
                      <span className="text-[11px] text-zinc-500">{weekdays[3]} · 13</span>
                    </div>
                    <div className="mt-3 space-y-2">
                      {schedule.map((s, i) => (
                        <Rise key={`${s.time}-${s.seed}`} on={biz('tutors')} index={3 + i} instant={reduced} className="flex items-center gap-3 rounded-xl bg-zinc-50 px-3 py-2">
                          <span className="w-10 shrink-0 text-xs font-semibold tabular-nums text-zinc-900">{s.time}</span>
                          <MiniAvatar seed={s.seed} alt={s.name} size="sm" />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-xs font-semibold text-zinc-900">{s.name}</p>
                            <p className="truncate text-[11px] text-zinc-500">{s.subject}</p>
                          </div>
                          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-2 py-0.5 text-[10px] font-semibold text-zinc-700">
                            <span className={`h-1.5 w-1.5 rounded-full ${s.live ? 'bg-emerald-500' : 'bg-zinc-900'}`} />
                            {s.tag}
                          </span>
                        </Rise>
                      ))}
                    </div>
                    <div className="mt-auto flex items-center justify-between rounded-xl border border-zinc-100 px-3 py-2 pt-2">
                      <span className="flex items-center gap-2 text-[11px] font-medium text-zinc-700">
                        <AvatarStack people={students} size="xs" max={3} />
                        {t('landing.v2.demo.waitlistCount', { count: 6 })}
                      </span>
                      <span className="rounded-full bg-zinc-900 px-2 py-0.5 text-[10px] font-semibold text-white">{t('landing.v2.demo.autoFilled')}</span>
                    </div>
                  </Rise>
                </div>
              </Panel>

              <Panel active={bPhase === 'payments'}>
                <div className="grid h-full gap-4 lg:grid-cols-[1.15fr_0.85fr]">
                  <Rise on={biz('payments')} index={0} instant={reduced} className="flex min-h-0 flex-col rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm sm:p-5">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold text-zinc-900">{t('landing.v2.demo.paymentStreams')}</p>
                      <span className="text-[11px] text-zinc-500">{t('landing.v2.demo.thisWeek')}</span>
                    </div>
                    <div className="mt-3 space-y-3">
                      {[
                        { key: 'individual', label: t('landing.v2.demo.individualLessons'), amount: '€1 240', percent: '72%' },
                        { key: 'group', label: t('landing.v2.demo.groupLessons'), amount: '€680', percent: '54%' },
                        { key: 'packages', label: t('landing.v2.demo.prepaidPackages'), amount: '€220', percent: '91%' },
                      ].map((r, i) => (
                        <div key={r.key}>
                          <div className="mb-1.5 flex justify-between text-sm"><span className="text-zinc-600">{r.label}</span><span dir="ltr" className="font-semibold">{r.amount}</span></div>
                          <div className="h-2 overflow-hidden rounded-full bg-zinc-100">
                            <Grow on={biz('payments')} size={r.percent} delay={250 + i * 90} instant={reduced} className="h-full rounded-full bg-zinc-900" />
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="mt-5 flex items-center justify-between border-t border-zinc-100 pt-4">
                      <p className="text-sm font-semibold text-zinc-900">
                        {t('landing.v2.demo.receivedToday', { amount: formatEuro(collected), count: paymentsCount })}
                      </p>
                      <AvatarStack people={students} size="xs" max={4} />
                    </div>
                    <div className="mt-3 space-y-2">
                      {recentPayments.map((r, i) => (
                        <Rise
                          key={r.seed}
                          on={biz('payments')}
                          index={1 + i}
                          instant={reduced}
                          className={`items-center gap-3 rounded-xl bg-zinc-50 px-3 py-2 ${i === 4 ? 'hidden lg:flex' : 'flex'}`}
                        >
                          <MiniAvatar seed={r.seed} alt={r.name} size="sm" />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-xs font-semibold text-zinc-900">{r.name}</p>
                            <p className="truncate text-[11px] text-zinc-500">{r.type}</p>
                          </div>
                          <span dir="ltr" className="text-xs font-semibold tabular-nums text-zinc-900">{r.amount}</span>
                          <DotPill key={r.paid ? 'paid' : 'waiting'} ok={r.paid} pop={r.pop} className="w-[92px] justify-center">
                            {r.paid ? t('dash.paidLabel') : t('landing.v2.demo.waiting')}
                          </DotPill>
                        </Rise>
                      ))}
                    </div>
                  </Rise>
                  <div className="flex min-h-0 flex-col gap-3">
                    <Rise on={biz('payments')} index={2} instant={reduced} className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
                      <div className="flex items-center justify-between">
                        <p className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-500"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />{t('landing.v2.demo.todayCollected')}</p>
                        <AvatarStack people={students} size="xs" max={3} />
                      </div>
                      <p className="mt-1 font-display text-3xl font-bold tabular-nums text-zinc-900">
                        <CountUp on={biz('payments')} to={collected} format={formatEuro} instant={reduced} />
                      </p>
                      <p className="mt-1 text-[11px] text-zinc-500">{t('landing.v2.demo.paymentsCount', { count: paymentsCount })} · Stripe</p>
                    </Rise>
                    <Rise on={biz('payments')} index={3} instant={reduced} className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                      <div className="flex items-center justify-between">
                        <p className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-500"><span className="h-1.5 w-1.5 rounded-full bg-amber-500" />{t('landing.v2.demo.overdue')}</p>
                        <AvatarStack people={parents.slice(0, 3)} size="xs" max={3} />
                      </div>
                      <p className="mt-1 text-2xl font-bold tabular-nums text-zinc-900">
                        <CountUp on={biz('payments')} to={320} format={formatEuro} delay={120} instant={reduced} />
                      </p>
                      <p className="mt-1 text-[11px] text-zinc-500">{t('landing.v2.demo.invoicesCount', { count: 3 })} · {t('landing.v2.demo.remindersSent', { count: 14 })}</p>
                    </Rise>
                    <Rise on={biz('payments')} index={4} instant={reduced} className="hidden min-h-0 flex-1 flex-col rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm lg:flex">
                      <p className="text-sm font-semibold text-zinc-900">{t('dash.unpaid')}</p>
                      <div className="mt-3 space-y-2">
                        {overdueRows.map((r, i) => (
                          <Rise key={r.seed} on={biz('payments')} index={5 + i} instant={reduced} className="flex items-center gap-3 rounded-xl bg-zinc-50 px-3 py-2">
                            <MiniAvatar seed={r.seed} alt={r.family} size="sm" />
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-xs font-semibold text-zinc-900">{r.family}</p>
                              <p className="truncate text-[11px] text-zinc-500">{r.child}</p>
                            </div>
                            <span dir="ltr" className="text-xs font-semibold tabular-nums text-zinc-900">{r.amount}</span>
                          </Rise>
                        ))}
                      </div>
                      <div className="mt-auto flex items-center justify-between gap-3 pt-3">
                        <div className="min-w-0 flex-1">
                          <div className="h-1.5 overflow-hidden rounded-full bg-zinc-100">
                            <Grow on={biz('payments')} size="78%" delay={600} instant={reduced} className="h-full rounded-full bg-zinc-900" />
                          </div>
                          <p className="mt-1.5 truncate text-[11px] text-zinc-500">{t('landing.v2.demo.paidOnTime', { percent: 78 })}</p>
                        </div>
                        <span className="shrink-0 rounded-lg bg-zinc-900 px-3 py-1.5 text-[11px] font-semibold text-white">{t('landing.v2.demo.sendParents')}</span>
                      </div>
                    </Rise>
                  </div>
                </div>
              </Panel>

              <Panel active={bPhase === 'messages'}>
                <div className="grid h-full gap-4 lg:grid-cols-[0.95fr_1.05fr]">
                  <Rise on={biz('messages')} index={0} instant={reduced} className="flex min-h-0 flex-col rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm">
                    <div className="flex items-center justify-between px-1 pb-2">
                      <p className="text-sm font-semibold text-zinc-900">{t('landing.v2.demo.channels')}</p>
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-2 py-0.5 text-[10px] font-semibold text-zinc-700">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                        {t('landing.v2.demo.activeNow', { count: 4 })}
                      </span>
                    </div>
                    <div className="space-y-2">
                      {channels.map((ch, i) => (
                        <Rise
                          key={ch.seed}
                          on={biz('messages')}
                          index={1 + i}
                          instant={reduced}
                          className={`items-start gap-2.5 rounded-xl px-3 py-2.5 ${i === 0 ? 'bg-zinc-100 ring-1 ring-zinc-200' : 'bg-zinc-50'} ${i === 4 ? 'hidden lg:flex' : 'flex'}`}
                        >
                          <MiniAvatar seed={ch.seed} alt={ch.name} size="sm" className="mt-0.5" />
                          <div className="min-w-0 flex-1">
                            <div className="flex justify-between gap-2"><p className="truncate text-sm font-semibold text-zinc-900">{ch.name}</p><span dir="ltr" className="shrink-0 text-[10px] text-zinc-400">{ch.time}</span></div>
                            {ch.typing ? <TypingDots className="mt-1 h-4" /> : <p className="truncate text-xs text-zinc-500">{ch.preview}</p>}
                          </div>
                          {ch.unread > 0 && (
                            <span
                              key={ch.unread}
                              className={`mt-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-zinc-900 px-1.5 text-[10px] font-bold text-white ${ch.pop ? 'landing-pop' : ''}`}
                            >
                              {ch.unread}
                            </span>
                          )}
                        </Rise>
                      ))}
                    </div>
                  </Rise>
                  <Rise on={biz('messages')} index={2} instant={reduced} className="flex min-h-0 flex-col rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
                    <div className="flex items-center justify-between border-b border-zinc-100 pb-3">
                      <div className="flex items-center gap-2.5">
                        <MiniAvatar seed="parents-8" alt={t('landing.v2.demo.parentsGroup')} size="md" />
                        <div>
                          <p className="text-sm font-semibold text-zinc-900">{t('landing.v2.demo.parentsGroup')}</p>
                          <p className="text-[11px] text-zinc-500">{t('landing.v2.demo.teamCount', { count: 14 })}</p>
                        </div>
                      </div>
                      <AvatarStack people={parents} size="xs" max={4} />
                    </div>
                    <div className="mt-3 flex min-h-0 flex-1 flex-col justify-end space-y-2.5">
                      <p className="text-center text-[10px] font-medium uppercase tracking-wide text-zinc-400">{t('landing.v2.demo.today')}</p>
                      <Rise on={biz('messages')} index={3} instant={reduced} className="max-w-[85%]">
                        <p className="mb-1 text-[10px] font-medium text-zinc-400">{personas.tutors[0]} · 10:15</p>
                        <div className="rounded-2xl rounded-ss-md bg-zinc-100 px-3 py-2 text-xs text-zinc-700">{t('landing.v2.demo.groupToday')}</div>
                      </Rise>
                      <Rise on={biz('messages')} index={4} instant={reduced} className="max-w-[85%]">
                        <p className="mb-1 text-[10px] font-medium text-zinc-400">{personas.families[0]} · 10:40</p>
                        <div className="rounded-2xl rounded-ss-md bg-zinc-100 px-3 py-2 text-xs text-zinc-700">{t('landing.v2.demo.moveThursday')}</div>
                      </Rise>
                      <Rise on={biz('messages')} index={5} instant={reduced} className="ms-auto max-w-[85%]">
                        <div className="rounded-2xl rounded-se-md bg-zinc-900 px-3 py-2 text-xs text-white">{t('landing.v2.demo.reply')}</div>
                        <p className="mt-1 text-end text-[10px] text-zinc-400">10:42</p>
                      </Rise>
                      {parentTyping && (
                        <div className="inline-flex rounded-2xl rounded-ss-md bg-zinc-100 px-3 py-2.5">
                          <TypingDots />
                        </div>
                      )}
                      {parentArrived && (
                        <div className={`max-w-[85%] origin-top-left ${reduced ? '' : 'landing-pop'}`}>
                          <p className="mb-1 text-[10px] font-medium text-zinc-400">{personas.families[0]} · 10:44</p>
                          <div className="rounded-2xl rounded-ss-md bg-zinc-100 px-3 py-2 text-xs text-zinc-700">{t('landing.v2.demo.invoiceThanks')}</div>
                        </div>
                      )}
                    </div>
                    <div className="mt-3 flex items-center gap-2 rounded-xl border border-zinc-200 px-3 py-2">
                      <span className="flex-1 truncate text-xs text-zinc-400">{t('landing.v2.demo.messagePlaceholder')}</span>
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-zinc-900 text-white">
                        <Send className="h-3.5 w-3.5" />
                      </span>
                    </div>
                  </Rise>
                </div>
              </Panel>

              <Panel active={bPhase === 'parents'}>
                <Rise on={biz('parents')} index={0} instant={reduced} className="flex h-full flex-col rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm sm:p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-base font-semibold text-zinc-900">{t('landing.v2.animBizParents')}</p>
                      <p className="text-xs text-zinc-500">{t('landing.v2.demo.portalSummary')}</p>
                    </div>
                    <span
                      className={`rounded-lg px-3 py-1.5 text-[11px] font-semibold text-white transition-all duration-200 ${
                        invitePressed ? 'scale-95 bg-zinc-700' : 'bg-zinc-900'
                      }`}
                    >
                      {t('landing.v2.demo.invite')}
                    </span>
                  </div>
                  <div className="mt-4 overflow-hidden rounded-xl border border-zinc-100">
                    <div className="grid grid-cols-[1.2fr_1fr_0.8fr_0.7fr] gap-2 bg-zinc-50 px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
                      <span>{t('landing.v2.demo.family')}</span><span>{t('common.student')}</span><span>{t('common.status')}</span><span>{t('landing.v2.walkStepPayment')}</span>
                    </div>
                    {parentRows.map((row, i) => (
                      <Rise
                        key={row.seed}
                        on={biz('parents')}
                        index={1 + i}
                        instant={reduced}
                        className="grid grid-cols-[1.2fr_1fr_0.8fr_0.7fr] items-center gap-2 border-t border-zinc-100 px-3 py-2.5 text-xs"
                      >
                        <span className="flex min-w-0 items-center gap-2 font-semibold text-zinc-900">
                          <MiniAvatar seed={row.seed} alt={row.family} size="sm" />
                          <span className="truncate">{row.family}</span>
                        </span>
                        <span className="truncate text-zinc-600">{row.child}</span>
                        <span>
                          <DotPill key={row.active ? 'active' : 'waiting'} ok={row.active} pop={row.pop}>
                            {row.active ? t('landing.v2.profileParentActive') : t('landing.v2.demo.waiting')}
                          </DotPill>
                        </span>
                        <span className="text-zinc-700">{row.payment}</span>
                      </Rise>
                    ))}
                  </div>
                  <div className="mt-4 hidden gap-2 sm:grid-cols-2 lg:grid">
                    {parentActivity.map((a, i) => (
                      <Rise key={a.key} on={biz('parents')} index={5 + i} instant={reduced} className="flex items-center gap-3 rounded-xl bg-zinc-50 px-3 py-2">
                        <MiniAvatar seed={a.seed} alt={a.who} size="sm" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-semibold text-zinc-900">{a.who}</p>
                          <p className="truncate text-[11px] text-zinc-500">{a.text}</p>
                        </div>
                        <span className="shrink-0 text-[10px] text-zinc-400">{a.time}</span>
                      </Rise>
                    ))}
                  </div>
                  <div className="mt-auto grid gap-2 pt-4 sm:grid-cols-3">
                    <Rise on={biz('parents')} index={5} instant={reduced} className="rounded-xl border border-zinc-100 px-3 py-2.5">
                      <p className="text-[10px] text-zinc-400">{t('landing.v2.demo.autoFilled')}</p>
                      <p className="mt-0.5 text-sm font-semibold text-zinc-900">{t('landing.v2.demo.invoicesCount', { count: 14 })}</p>
                    </Rise>
                    <Rise on={biz('parents')} index={6} instant={reduced} className="rounded-xl border border-zinc-100 px-3 py-2.5">
                      <p className="text-[10px] text-zinc-400">{t('landing.v2.demo.retention')}</p>
                      <p className="mt-0.5 text-sm font-semibold tabular-nums text-zinc-900">
                        <CountUp on={biz('parents')} to={94} format={(n) => `${n}%`} delay={350} instant={reduced} />
                      </p>
                    </Rise>
                    <Rise on={biz('parents')} index={7} instant={reduced} className="rounded-xl border border-zinc-100 px-3 py-2.5">
                      <p className="text-[10px] text-zinc-400">{t('landing.v2.demo.paidOnTime', { percent: 78 })}</p>
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-zinc-100">
                        <Grow on={biz('parents')} size="78%" delay={600} instant={reduced} className="h-full rounded-full bg-zinc-900" />
                      </div>
                    </Rise>
                  </div>
                </Rise>
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

  // Once flat, drop the transform entirely so text rasterises crisply.
  const settled = reducedMotion || progress >= 0.999;
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

          <div ref={frameRef} className="mx-auto w-full max-w-[1100px]" style={settled ? undefined : { perspective: '1200px' }}>
            <div
              data-walkthrough-frame
              style={
                settled
                  ? undefined
                  : {
                      transformOrigin: 'center center',
                      transform: `scale(${scale}) rotateX(${tilt}deg)`,
                      transition: 'transform 200ms ease-out',
                      willChange: 'transform',
                    }
              }
            >
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
