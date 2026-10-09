import { format, parseISO } from 'date-fns';
import { Euro } from 'lucide-react';
import { useTranslation } from '@/lib/i18n';
import { fmtMoney } from '@/lib/marketMoney';
import type { ProKlasePayBreakdown } from '@/lib/proKlaseTutorPay';
import type { TutorPayAdjustment } from '@/lib/proKlaseTutorFinance';

const ADJUSTMENT_LABELS = {
  penalty_tutor_no_show: 'orgFinance.adjustmentTutorNoShow',
  penalty_missing_report: 'orgFinance.adjustmentMissingReport',
  penalty_manual: 'orgFinance.adjustmentManualPenalty',
  bonus_manual: 'orgFinance.adjustmentManualCorrection',
} as const;

export default function ProKlaseTutorFinanceDetails({ completedCount, rangeLabel, breakdown, adjustments }: {
  completedCount: number;
  rangeLabel: string;
  breakdown: ProKlasePayBreakdown | null;
  adjustments: TutorPayAdjustment[];
}) {
  const { t } = useTranslation();
  return (
    <div className="space-y-4">
      <section aria-label={t('orgFinance.payBreakdown')} className="rounded-xl bg-gray-50 border border-gray-100 p-4">
        <p className="text-sm text-gray-600">{t('orgFinance.completedLessons', { range: rangeLabel })}</p>
        <p className="text-2xl font-bold text-gray-900 mt-1">{completedCount}</p>
        {breakdown ? (
          <>
            <div className="flex items-center gap-2 mt-4 pt-4 border-t border-gray-200">
              <Euro className="w-5 h-5 text-emerald-600" />
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wide">{t('orgFinance.payableTotal')}</p>
                <p className="text-xl font-bold text-emerald-700">{fmtMoney(breakdown.totalEur)}</p>
              </div>
            </div>
            <dl className="mt-4 space-y-2 text-sm">
              {[
                [t('orgFinance.individualLessons') + ` (${breakdown.individualLessons})`, breakdown.individualEur],
                [t('orgFinance.trialLessons') + ` (${breakdown.trialLessons})`, breakdown.trialEur],
                [t('orgFinance.noShowLessons') + ` (${breakdown.noShowLessons})`, breakdown.noShowEur],
                [t('orgFinance.earnedBeforeAdjustments'), breakdown.individualEur + breakdown.trialEur + breakdown.noShowEur],
                [t('orgFinance.adjustments'), breakdown.adjustmentsEur],
              ].map(([label, amount]) => (
                <div key={label} className="flex justify-between gap-4 text-gray-600">
                  <dt>{label}</dt><dd className="whitespace-nowrap">{fmtMoney(Number(amount))}</dd>
                </div>
              ))}
            </dl>
          </>
        ) : <p role="alert" className="text-sm text-amber-800 mt-3">{t('orgFinance.payRateMissing')}</p>}
        <p className="text-xs text-gray-500 mt-4">{t('orgFinance.companyPaySummaryNote')}</p>
      </section>
      <section aria-label={t('compTut.penaltiesSection')}>
        <h3 className="text-sm font-semibold text-gray-900 mb-3">{t('compTut.penaltiesSection')}</h3>
        {adjustments.length === 0 ? (
          <p className="text-sm text-gray-500">{t('orgFinance.noAdjustments')}</p>
        ) : (
          <div className="space-y-2">
            {adjustments.map(adjustment => (
              <div key={adjustment.id} className="rounded-xl border border-gray-200 p-3 flex items-start justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <p className="text-sm font-medium text-gray-900">{t(adjustment.type === 'penalty_manual' && adjustment.amount_eur > 0
                    ? 'orgFinance.adjustmentManualCorrection' : ADJUSTMENT_LABELS[adjustment.type])}</p>
                  {adjustment.reason ? <p className="text-sm text-gray-600 break-words">{adjustment.reason}</p> : null}
                  <p className="text-xs text-gray-500">{format(parseISO(adjustment.created_at), 'yyyy-MM-dd HH:mm')}</p>
                </div>
                <p className={`shrink-0 text-sm font-semibold ${adjustment.amount_eur < 0 ? 'text-rose-700' : 'text-emerald-700'}`}>
                  {adjustment.amount_eur > 0 ? '+' : ''}{fmtMoney(adjustment.amount_eur)}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
