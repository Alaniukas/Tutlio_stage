import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { BookOpen, CalendarDays, Check, CreditCard } from 'lucide-react';
import { useTranslation } from '@/lib/i18n';
import { localeDirection } from '@/lib/i18n/locales';
import { MiniAvatar } from './demoAvatars';
import { getLandingDemoPersonas } from './demoPersonas';
import { phoneUnit as u } from './PhoneFrame';
import { useCountUp, usePrefersReducedMotion } from './motion';

/**
 * The student portal inside <PhoneFrame>: Lessons, Payments and Book tabs.
 * Payments mirrors src/pages/StudentPayments.tsx and reuses its strings, so
 * the mock localises with the app.
 *
 * One loop of the demo: the student lands on Lessons, the tab bar slides to
 * Payments, they tap "Pay", Stripe confirms, the balance counts down and a
 * receipt drops in, then the tab bar slides on to Book. Prefers-reduced-motion
 * pins the Payments screen with no timers.
 *
 * Sample amounts are illustrative, as on any product screenshot.
 */

const SYSTEM_FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';

const TABS = [
  { key: 'sessions', icon: BookOpen, labelKey: 'studentNav.sessions' },
  { key: 'payments', icon: CreditCard, labelKey: 'studentNav.payments' },
  { key: 'book', icon: CalendarDays, labelKey: 'studentNav.book' },
] as const;
type Tab = (typeof TABS)[number]['key'];

type Step = 'sessions' | 'idle' | 'tap' | 'processing' | 'paid' | 'book';
const STEP_MS: Record<Step, number> = { sessions: 2600, idle: 1500, tap: 700, processing: 1200, paid: 3000, book: 2600 };
const NEXT: Record<Step, Step> = { sessions: 'idle', idle: 'tap', tap: 'processing', processing: 'paid', paid: 'book', book: 'sessions' };
const TAB_OF: Record<Step, Tab> = { sessions: 'sessions', idle: 'payments', tap: 'payments', processing: 'payments', paid: 'payments', book: 'book' };
const DUE = 120;

const CARD: CSSProperties = {
  background: '#fff',
  borderRadius: u(6),
  padding: u(8),
  boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
  border: '1px solid rgba(0,0,0,0.06)',
};

const DARK_CARD: CSSProperties = {
  background: 'linear-gradient(135deg, #27272a 0%, #18181b 100%)',
  borderRadius: u(7),
  padding: u(8),
  marginBottom: u(6),
  boxShadow: '0 4px 14px rgba(24,24,27,0.18)',
};

const EYEBROW: CSSProperties = {
  fontSize: u(5),
  fontWeight: 600,
  color: '#a1a1aa',
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
};

/** Neutral status pill: white, hairline border, coloured dot only. */
function Pill({ dot, pop, children }: { dot?: string; pop?: boolean; children: ReactNode }) {
  return (
    <span
      className={pop ? 'landing-pop' : undefined}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: u(2),
        padding: `${u(1.5)} ${u(3.5)}`,
        borderRadius: u(4),
        border: '1px solid #e4e4e7',
        background: '#fff',
        color: '#3f3f46',
        fontSize: u(5),
        fontWeight: 600,
        transformOrigin: 'left center',
        whiteSpace: 'nowrap',
      }}
    >
      {dot ? (
        <span style={{ width: u(2.5), height: u(2.5), borderRadius: '50%', background: dot, flexShrink: 0 }} />
      ) : (
        <span
          className="animate-spin"
          style={{
            width: u(3.5),
            height: u(3.5),
            borderRadius: '50%',
            border: '1.5px solid #d4d4d8',
            borderTopColor: '#18181b',
            flexShrink: 0,
          }}
        />
      )}
      {children}
    </span>
  );
}

/** Amounts and times read left-to-right in every language. */
function Num({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <span dir="ltr" style={{ fontVariantNumeric: 'tabular-nums', ...style }}>
      {children}
    </span>
  );
}

function ScreenHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div style={{ marginBottom: u(9) }}>
      <div style={{ fontSize: u(14), fontWeight: 700, color: '#1f2937', letterSpacing: '-0.5px', marginBottom: u(2) }}>{title}</div>
      <div style={{ fontSize: u(6), color: '#6b7280', lineHeight: 1.4 }}>{subtitle}</div>
    </div>
  );
}

export default function StudentPaymentsScreen() {
  const { locale, t } = useTranslation();
  const personas = getLandingDemoPersonas(locale);
  const rtl = localeDirection(locale) === 'rtl';
  const weekdays = t('landing.v2.demo.weekdays').split('|');
  const reduced = usePrefersReducedMotion();
  const [step, setStep] = useState<Step>('sessions');
  const previousTab = useRef<Tab>('sessions');

  useEffect(() => {
    if (reduced) {
      setStep('idle');
      return;
    }
    const id = window.setTimeout(() => setStep((s) => NEXT[s]), STEP_MS[step]);
    return () => window.clearTimeout(id);
  }, [step, reduced]);

  const tab = TAB_OF[step];
  const tabIndex = TABS.findIndex((x) => x.key === tab);
  const previousIndex = TABS.findIndex((x) => x.key === previousTab.current);
  const forward = tabIndex >= previousIndex;
  useEffect(() => {
    previousTab.current = tab;
  }, [tab]);
  /** New screen enters from the side its tab sits on; the sign flips for RTL. */
  const screenFrom = `${(forward ? 14 : -14) * (rtl ? -1 : 1)}px`;

  const paid = step === 'paid';
  const tapping = step === 'tap';
  const busy = step === 'processing';
  const countdown = useCountUp(true, paid ? 0 : DUE, { duration: 700, instant: reduced });
  const dueShown = paid ? countdown : DUE;

  const lessons = [
    { subject: t('landing.v2.demo.subjectEnglish'), when: `${weekdays[4]} · 17:30`, tutor: personas.tutors[1], seed: 'tomas-k', pill: t('stuSess.group'), dot: '#18181b' },
    { subject: t('landing.v2.demo.subjectPhysics'), when: `${weekdays[1]} · 18:00`, tutor: personas.tutors[2], seed: 'inga-j', pill: t('stuSess.awaitingPayment'), dot: '#f59e0b' },
  ];
  const slots = [`${weekdays[4]} 16:00`, `${weekdays[1]} 17:30`, `${weekdays[3]} 18:00`];

  return (
    <>
      <div style={{ flex: '1 1 0%', overflow: 'hidden', position: 'relative', margin: `0 ${u(2)}` }}>
        {/* Receipt toast. */}
        {paid && (
          <div
            className="landing-toast-in"
            style={{
              position: 'absolute',
              top: u(3),
              left: u(5),
              right: u(5),
              zIndex: 20,
              display: 'flex',
              alignItems: 'center',
              gap: u(3),
              padding: `${u(3.5)} ${u(4)}`,
              borderRadius: u(5),
              background: '#fff',
              border: '1px solid rgba(0,0,0,0.06)',
              boxShadow: '0 8px 20px rgba(24,24,27,0.16)',
              fontFamily: SYSTEM_FONT,
            }}
          >
            <span
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: u(8),
                height: u(8),
                borderRadius: '50%',
                background: '#18181b',
                color: '#fff',
                flexShrink: 0,
              }}
            >
              <Check style={{ width: u(4.5), height: u(4.5) }} strokeWidth={3} />
            </span>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: u(5.5), fontWeight: 700, color: '#18181b' }}>{t('landing.v2.demo.paymentReceived')}</div>
              <div style={{ fontSize: u(4.5), color: '#71717a' }}>{t('stuPay.lessonsCount', { count: '10' })} · Stripe</div>
            </div>
            <div style={{ fontSize: u(6), fontWeight: 700, color: '#18181b' }}>
              <Num>{DUE} €</Num>
            </div>
          </div>
        )}

        <div
          key={tab}
          className={reduced ? undefined : 'landing-screen-in'}
          style={{
            ['--screen-from' as string]: screenFrom,
            padding: `${u(10)} ${u(6)}`,
            height: '100%',
            fontFamily: SYSTEM_FONT,
            background: '#f4f6fb',
            overflow: 'hidden',
          }}
        >
          {tab === 'sessions' && (
            <>
              <ScreenHeader title={t('studentNav.sessions')} subtitle={t('stuSess.upcoming')} />
              {/* Today's lesson. */}
              <div style={DARK_CARD}>
                <div style={{ ...EYEBROW, textTransform: 'uppercase' }}>{t('landing.v2.demo.today')}</div>
                <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: u(2) }}>
                  <div>
                    <div style={{ fontSize: u(16), fontWeight: 700, color: '#fff', letterSpacing: '-0.5px', lineHeight: 1.1 }}>
                      <Num>16:00</Num>
                    </div>
                    <div style={{ fontSize: u(5.5), color: '#d4d4d8', marginTop: u(2) }}>
                      {t('landing.v2.demo.subjectMath')} · {personas.tutors[0]}
                    </div>
                  </div>
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: u(2),
                      padding: `${u(1.5)} ${u(3.5)}`,
                      borderRadius: u(4),
                      background: 'rgba(255,255,255,0.12)',
                      color: '#fff',
                      fontSize: u(5),
                      fontWeight: 600,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    <span style={{ width: u(2.5), height: u(2.5), borderRadius: '50%', background: '#34d399' }} />
                    {t('landing.v2.demo.online')}
                  </span>
                </div>
              </div>
              {lessons.map((lesson) => (
                <div key={lesson.subject} style={{ ...CARD, marginBottom: u(5) }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: u(3) }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: u(6.5), fontWeight: 600, color: '#1f2937' }}>{lesson.subject}</div>
                      <div style={{ fontSize: u(5.5), color: '#6b7280', marginTop: u(1) }}>{lesson.when}</div>
                    </div>
                    <MiniAvatar seed={lesson.seed} alt={lesson.tutor} size="sm" />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: u(5) }}>
                    <Pill dot={lesson.dot}>{lesson.pill}</Pill>
                    <span style={{ fontSize: u(5), color: '#9ca3af' }}>{lesson.tutor}</span>
                  </div>
                </div>
              ))}
            </>
          )}

          {tab === 'payments' && (
            <>
              <ScreenHeader title={t('stuPay.title')} subtitle={t('stuPay.subtitle')} />
              {/* Balance due — the one number a student opens this page for. */}
              <div style={DARK_CARD}>
                <div style={EYEBROW}>{paid ? t('stuPay.paidBadge') : t('stuPay.pendingTitle')}</div>
                <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: u(2) }}>
                  <div style={{ fontSize: u(16), fontWeight: 700, color: '#fff', letterSpacing: '-0.5px', lineHeight: 1.1 }}>
                    <Num>{dueShown} €</Num>
                  </div>
                  {paid && (
                    <span
                      className="landing-pop"
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: u(9),
                        height: u(9),
                        borderRadius: '50%',
                        background: '#fff',
                        color: '#18181b',
                        marginBottom: u(0.5),
                      }}
                    >
                      <Check style={{ width: u(5), height: u(5) }} strokeWidth={3} />
                    </span>
                  )}
                </div>
              </div>

              {/* The package being paid. */}
              <div style={{ ...CARD, marginBottom: u(5) }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ fontSize: u(6.5), fontWeight: 600, color: '#1f2937' }}>{t('stuPay.lessonsCount', { count: '10' })}</div>
                  <div style={{ fontSize: u(7.5), fontWeight: 700, color: paid ? '#9ca3af' : '#1f2937', transition: 'color 300ms ease' }}>
                    <Num>{DUE} €</Num>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: u(5), minHeight: u(8) }}>
                  {paid ? (
                    <Pill key="paid" dot="#10b981" pop={!reduced}>
                      {t('stuPay.paidBadge')}
                    </Pill>
                  ) : busy ? (
                    <Pill key="busy">{t('stuSess.processing')}</Pill>
                  ) : (
                    <Pill key="waiting" dot="#f59e0b">
                      {t('stuSess.awaitingPayment')}
                    </Pill>
                  )}
                  <span
                    style={{
                      position: 'relative',
                      display: 'inline-flex',
                      alignItems: 'center',
                      fontSize: u(5.5),
                      fontWeight: 600,
                      color: '#18181b',
                      transform: tapping ? 'scale(0.94)' : 'none',
                      opacity: paid ? 0 : busy ? 0.45 : 1,
                      transition: 'transform 150ms ease, opacity 250ms ease',
                    }}
                  >
                    {tapping && (
                      <span
                        aria-hidden
                        className="landing-tap"
                        style={{
                          position: 'absolute',
                          left: '50%',
                          top: '50%',
                          width: u(14),
                          height: u(14),
                          marginLeft: u(-7),
                          marginTop: u(-7),
                          borderRadius: '50%',
                          background: 'rgba(24,24,27,0.22)',
                        }}
                      />
                    )}
                    {t('stuPay.payNow')} {rtl ? '←' : '→'}
                  </span>
                </div>
              </div>

              {/* Paid history. */}
              <div style={CARD}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ fontSize: u(6.5), fontWeight: 600, color: '#1f2937' }}>{t('stuPay.lessonsCount', { count: '8' })}</div>
                  <div style={{ fontSize: u(7.5), fontWeight: 700, color: '#9ca3af' }}>
                    <Num>96 €</Num>
                  </div>
                </div>
                <div style={{ marginTop: u(5) }}>
                  <Pill dot="#10b981">{t('stuPay.paidBadge')}</Pill>
                </div>
              </div>
            </>
          )}

          {tab === 'book' && (
            <>
              <ScreenHeader title={t('studentNav.book')} subtitle={t('landing.v2.animSoloCardSlots')} />
              <div style={{ ...CARD, marginBottom: u(5) }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: u(3) }}>
                  <MiniAvatar seed="rasa-public" alt={personas.publicTutor} size="md" ring />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: u(6.5), fontWeight: 600, color: '#1f2937' }}>
                      {personas.publicTutor} · {t('landing.v2.demo.subjectMath')}
                    </div>
                    <div style={{ fontSize: u(5.5), color: '#6b7280', marginTop: u(1) }}>{t('landing.v2.demo.grades9to12')}</div>
                  </div>
                </div>
                <div style={{ marginTop: u(5) }}>
                  <Pill dot="#10b981">{t('landing.v2.demo.trialCall')}</Pill>
                </div>
              </div>
              <div style={{ ...CARD, marginBottom: u(5) }}>
                <div style={{ ...EYEBROW, color: '#9ca3af' }}>{t('landing.v2.animSoloCardSlots')}</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: u(2), marginTop: u(3) }}>
                  {slots.map((slot, i) => {
                    const on = i === 1;
                    return (
                      <span
                        key={slot}
                        className={on && !reduced ? 'landing-pop' : undefined}
                        style={{
                          padding: `${u(2)} ${u(3.5)}`,
                          borderRadius: u(3.5),
                          border: `1px solid ${on ? '#18181b' : '#e4e4e7'}`,
                          background: on ? '#18181b' : '#fff',
                          color: on ? '#fff' : '#3f3f46',
                          fontSize: u(5),
                          fontWeight: 600,
                          whiteSpace: 'nowrap',
                          animationDelay: '250ms',
                        }}
                      >
                        {slot}
                      </span>
                    );
                  })}
                </div>
              </div>
              <div
                style={{
                  borderRadius: u(5),
                  background: '#18181b',
                  color: '#fff',
                  textAlign: 'center',
                  padding: `${u(4)} 0`,
                  fontSize: u(6),
                  fontWeight: 600,
                }}
              >
                {t('landing.v2.demo.book')}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Bottom tab bar — the real student portal's nav, trimmed to three. The
          active pill slides between tabs as the demo moves on. */}
      <div
        style={{
          position: 'relative',
          height: u(32),
          background: '#fff',
          borderTop: '1px solid #e5e7eb',
          display: 'grid',
          gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
          alignItems: 'center',
          boxShadow: '0 -1px 8px rgba(0,0,0,0.03)',
          marginBottom: u(2),
          borderRadius: u(7),
          fontFamily: SYSTEM_FONT,
        }}
      >
        <div
          aria-hidden
          style={{
            position: 'absolute',
            top: u(3),
            bottom: u(3),
            insetInlineStart: `calc(${tabIndex} * 100% / 3)`,
            width: 'calc(100% / 3)',
            padding: `0 ${u(4)}`,
            boxSizing: 'border-box',
            transition: reduced ? undefined : 'inset-inline-start 420ms cubic-bezier(0.2, 0.8, 0.2, 1)',
            pointerEvents: 'none',
          }}
        >
          <div style={{ width: '100%', height: '100%', borderRadius: u(4), background: '#f3f4f6' }} />
        </div>
        {TABS.map(({ key, icon: Icon, labelKey }) => {
          const active = key === tab;
          return (
            <div
              key={key}
              style={{
                position: 'relative',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: u(1.5),
                color: active ? '#1f2937' : '#9ca3af',
                fontSize: u(5),
                fontWeight: active ? 600 : 500,
                padding: `${u(3)} 0`,
                transform: active ? 'translateY(-1px)' : 'translateY(0)',
                transition: 'color 300ms ease, transform 300ms ease',
              }}
            >
              <Icon style={{ width: u(10), height: u(10) }} strokeWidth={2} />
              <span>{t(labelKey)}</span>
            </div>
          );
        })}
      </div>
    </>
  );
}
