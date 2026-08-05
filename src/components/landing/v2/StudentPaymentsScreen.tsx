import { BookOpen, CalendarDays, Check, CreditCard } from 'lucide-react';
import { useTranslation } from '@/lib/i18n';
import { phoneUnit as u } from './PhoneFrame';

/**
 * The student portal's Payments page, rendered inside <PhoneFrame>. Mirrors the
 * real screen in src/pages/StudentPayments.tsx — awaiting-payment packages, then
 * paid history — and reuses its translated strings, so it localises with the app.
 *
 * Sample amounts are illustrative, as on any product screenshot.
 */

const SYSTEM_FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';

const TABS = [
  { key: 'sessions', icon: BookOpen, labelKey: 'studentNav.sessions' },
  { key: 'payments', icon: CreditCard, labelKey: 'studentNav.payments' },
  { key: 'book', icon: CalendarDays, labelKey: 'studentNav.book' },
] as const;

const ACTIVE_TAB = 'payments';

export default function StudentPaymentsScreen() {
  const { t } = useTranslation();

  return (
    <>
      <div style={{ flex: '1 1 0%', overflow: 'hidden', position: 'relative', margin: `0 ${u(2)}` }}>
        <div
          style={{
            padding: `${u(10)} ${u(6)}`,
            height: '100%',
            fontFamily: SYSTEM_FONT,
            background: '#f4f6fb',
            overflow: 'hidden',
          }}
        >
          <div style={{ marginBottom: u(9) }}>
            <div
              style={{
                fontSize: u(14),
                fontWeight: 700,
                color: '#1f2937',
                letterSpacing: '-0.5px',
                marginBottom: u(2),
              }}
            >
              {t('stuPay.title')}
            </div>
            <div style={{ fontSize: u(6), color: '#6b7280', lineHeight: 1.4 }}>{t('stuPay.subtitle')}</div>
          </div>

          {/* Balance due — the one number a student opens this page for. */}
          <div
            style={{
              background: 'linear-gradient(135deg, #27272a 0%, #18181b 100%)',
              borderRadius: u(7),
              padding: u(8),
              marginBottom: u(6),
              boxShadow: '0 4px 14px rgba(24,24,27,0.18)',
            }}
          >
            <div
              style={{
                fontSize: u(5),
                fontWeight: 600,
                color: '#a1a1aa',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
              }}
            >
              {t('stuPay.pendingTitle')}
            </div>
            <div
              style={{
                fontSize: u(16),
                fontWeight: 700,
                color: '#fff',
                letterSpacing: '-0.5px',
                marginTop: u(2),
                lineHeight: 1.1,
              }}
            >
              120 €
            </div>
          </div>

          {/* Unpaid package. */}
          <div
            style={{
              background: '#fff',
              borderRadius: u(6),
              padding: u(8),
              marginBottom: u(5),
              boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
              border: '1px solid rgba(0,0,0,0.06)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontSize: u(6.5), fontWeight: 600, color: '#1f2937' }}>
                {t('stuPay.lessonsCount', { count: '10' })}
              </div>
              <div style={{ fontSize: u(7.5), fontWeight: 700, color: '#1f2937' }}>120 €</div>
            </div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginTop: u(5),
              }}
            >
              <span
                style={{
                  display: 'inline-block',
                  padding: `${u(2)} ${u(4)}`,
                  borderRadius: u(3),
                  background: '#fef3c7',
                  color: '#92400e',
                  fontSize: u(5),
                  fontWeight: 600,
                }}
              >
                {t('stuSess.awaitingPayment')}
              </span>
              <span style={{ fontSize: u(5.5), fontWeight: 600, color: '#4f46e5' }}>
                {t('stuPay.payNow')} →
              </span>
            </div>
          </div>

          {/* Paid history. */}
          <div
            style={{
              background: '#fff',
              borderRadius: u(6),
              padding: u(8),
              boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
              border: '1px solid rgba(0,0,0,0.06)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontSize: u(6.5), fontWeight: 600, color: '#1f2937' }}>
                {t('stuPay.lessonsCount', { count: '8' })}
              </div>
              <div style={{ fontSize: u(7.5), fontWeight: 700, color: '#9ca3af' }}>96 €</div>
            </div>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: u(1.5),
                marginTop: u(5),
                padding: `${u(2)} ${u(4)}`,
                borderRadius: u(3),
                background: '#dcfce7',
                color: '#166534',
                fontSize: u(5),
                fontWeight: 600,
              }}
            >
              <Check style={{ width: u(5), height: u(5) }} strokeWidth={3} />
              {t('stuPay.paidBadge')}
            </span>
          </div>
        </div>
      </div>

      {/* Bottom tab bar — the real student portal's nav, trimmed to three. */}
      <div
        style={{
          height: u(32),
          background: '#fff',
          borderTop: '1px solid #e5e7eb',
          display: 'flex',
          justifyContent: 'space-around',
          alignItems: 'center',
          boxShadow: '0 -1px 8px rgba(0,0,0,0.03)',
          marginBottom: u(2),
          borderRadius: u(7),
          fontFamily: SYSTEM_FONT,
        }}
      >
        {TABS.map(({ key, icon: Icon, labelKey }) => {
          const active = key === ACTIVE_TAB;
          return (
            <div
              key={key}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: u(1.5),
                color: active ? '#1f2937' : '#9ca3af',
                fontSize: u(5),
                fontWeight: active ? 600 : 500,
                padding: `${u(3)} ${u(7)}`,
                borderRadius: u(4),
                background: active ? '#f3f4f6' : 'none',
                transform: active ? 'translateY(-1px)' : 'translateY(0)',
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
