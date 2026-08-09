import { GraduationCap, PackageCheck, UserRoundCheck } from 'lucide-react';
import { useTranslation } from '@/lib/i18n';
import { MiniAvatar } from './demoAvatars';
import { getLandingDemoPersonas } from './demoPersonas';

/**
 * Two overlapping, slightly-rotated cards: the monthly revenue summary and the
 * paid/unpaid roll-up. Sample figures, as on any product screenshot.
 */

const BREAKDOWN = [
  { icon: GraduationCap, tint: 'bg-gradient-to-br from-indigo-50 to-blue-100 text-indigo-600 ring-indigo-100', labelKey: 'landing.v2.finGroup', metaKey: 'landing.v2.finGroupMeta', amount: '1 990 €' },
  { icon: UserRoundCheck, tint: 'bg-gradient-to-br from-cyan-50 to-sky-100 text-sky-600 ring-sky-100', labelKey: 'landing.v2.finPrivate', metaKey: 'landing.v2.finPrivateMeta', amount: '1 490 €' },
  { icon: PackageCheck, tint: 'bg-gradient-to-br from-amber-50 to-orange-100 text-amber-600 ring-amber-100', labelKey: 'landing.v2.finPackages', metaKey: 'landing.v2.finPackagesMeta', amount: '60 €' },
] as const;

const PAYER_ROWS = [
  { seed: 'emilija-m', paid: true },
  { seed: 'lukas-k', paid: true },
  { seed: 'sofija-g', paid: false },
] as const;

export default function FinanceMockup() {
  const { locale, t } = useTranslation();
  const personas = getLandingDemoPersonas(locale);
  const payers = PAYER_ROWS.map((row, index) => ({ ...row, name: personas.students[index] }));

  return (
    <div className="relative mx-auto h-[370px] w-full max-w-[520px] sm:h-[400px]">
      {/* Back card — monthly revenue. */}
      <div className="absolute left-0 top-0 w-[70%] -rotate-2 rounded-2xl border border-zinc-100 bg-white p-4 shadow-[0_12px_32px_-12px_rgba(0,0,0,0.18)] sm:p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="font-display text-base font-semibold text-zinc-900 sm:text-lg">
              {t('dash.revenue')}
            </p>
            <p className="text-[11px] text-zinc-500 sm:text-xs">{t('dash.thisMonth')}</p>
          </div>
          <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-emerald-700">
            {t('dash.paidLabel')}
          </span>
        </div>

        <p className="mt-3 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
          {t('dash.totalRevenue')}
        </p>
        <p className="font-display text-2xl font-bold tracking-tight text-zinc-900 sm:text-3xl">3 540 €</p>
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-zinc-100">
          <div className="h-full w-[82%] rounded-full bg-gradient-to-r from-indigo-500 to-teal-400" />
        </div>

        <div className="mt-3 space-y-2.5 sm:mt-4 sm:space-y-3">
          {BREAKDOWN.map(({ icon: Icon, tint, labelKey, metaKey, amount }) => (
            <div key={labelKey} className="flex items-center gap-2.5 sm:gap-3">
              <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-xl ring-1 ring-inset sm:h-8 sm:w-8 ${tint}`}>
                <Icon className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-semibold text-zinc-900 sm:text-sm">{t(labelKey)}</p>
                <p className="truncate text-[10px] text-zinc-500 sm:text-xs">{t(metaKey)}</p>
              </div>
              <p className="shrink-0 text-xs font-semibold text-zinc-900 sm:text-sm">{amount}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Front card — who has paid. Sits low enough that it clips only the
          last revenue row, the way overlapping cards read as depth. */}
      <div className="absolute bottom-0 right-0 w-[56%] rotate-2 rounded-2xl border border-zinc-100 bg-white p-4 shadow-[0_18px_40px_-14px_rgba(0,0,0,0.28)]">
        <p className="font-display text-sm font-semibold text-zinc-900 sm:text-base">
          {t('landing.v2.finWhoPaid')}
        </p>
        <div className="mt-2.5 space-y-2.5">
          {payers.map(({ name, seed, paid }) => (
            <div key={name} className="flex items-center gap-2.5">
              <MiniAvatar seed={seed} alt={name} size="sm" className="ring-1 ring-white shadow-sm" />
              <p className="min-w-0 flex-1 truncate text-xs font-medium text-zinc-900 sm:text-sm">{name}</p>
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                  paid ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                }`}
              >
                {paid ? t('dash.paidLabel') : t('dash.unpaid')}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
