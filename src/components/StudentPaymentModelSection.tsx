import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Wallet, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTranslation } from '@/lib/i18n';
import {
  resolvePerLessonPaymentRules,
  parseStudentPaymentModels,
  serializeStudentPaymentModels,
  type LessonPaymentTiming,
  type PaymentModel,
} from '@/lib/studentPaymentModel';

export type StudentPaymentModelPatch = {
  payment_model?: string | null;
  per_lesson_payment_timing?: string | null;
  per_lesson_payment_deadline_hours?: number | null;
};

interface Props {
  studentId: string;
  value: string | null;
  perLessonTiming: string | null;
  perLessonDeadlineHours: number | null;
  /** Bendros taisyklės (Finansai / organizacija) – paveldėjimas. */
  inheritedLessonPayment: { payment_timing: LessonPaymentTiming; payment_deadline_hours: number };
  minBookingHours?: number;
  allowPerLesson?: boolean;
  disabled?: boolean;
  onSaved: (patch: StudentPaymentModelPatch) => void;
}

export default function StudentPaymentModelSection({
  studentId,
  value,
  perLessonTiming,
  perLessonDeadlineHours,
  inheritedLessonPayment,
  minBookingHours,
  allowPerLesson = true,
  disabled,
  onSaved,
}: Props) {
  const { t } = useTranslation();
  const [saving, setSaving] = useState(false);
  const normalizedValue = value === '' ? null : value;
  const selectedModels = parseStudentPaymentModels(normalizedValue);
  const hasPerLesson = selectedModels.has('per_lesson');

  const effectiveWhenPerLesson = resolvePerLessonPaymentRules(
    {
      payment_model: 'per_lesson',
      per_lesson_payment_timing: perLessonTiming,
      per_lesson_payment_deadline_hours: perLessonDeadlineHours,
    },
    inheritedLessonPayment,
  );

  const [draftTiming, setDraftTiming] = useState<LessonPaymentTiming>(effectiveWhenPerLesson.payment_timing);
  const [draftHours, setDraftHours] = useState<number>(effectiveWhenPerLesson.payment_deadline_hours);

  useEffect(() => {
    if (!hasPerLesson) return;
    setDraftTiming(effectiveWhenPerLesson.payment_timing);
    setDraftHours(effectiveWhenPerLesson.payment_deadline_hours);
  }, [
    hasPerLesson,
    perLessonTiming,
    perLessonDeadlineHours,
    inheritedLessonPayment.payment_timing,
    inheritedLessonPayment.payment_deadline_hours,
    effectiveWhenPerLesson.payment_timing,
    effectiveWhenPerLesson.payment_deadline_hours,
  ]);

  const persistStudent = async (patch: Record<string, unknown>) => {
    setSaving(true);
    const { error } = await supabase.from('students').update(patch).eq('id', studentId);
    setSaving(false);
    return !error;
  };

  const saveModelSelection = async (models: Set<PaymentModel>) => {
    const next = serializeStudentPaymentModels(models);
    const current = serializeStudentPaymentModels(selectedModels);
    if (next === current) return;

    setSaving(true);
    const payload: Record<string, unknown> = { payment_model: next };
    if (!models.has('per_lesson')) {
      payload.per_lesson_payment_timing = null;
      payload.per_lesson_payment_deadline_hours = null;
    }
    const { error } = await supabase.from('students').update(payload).eq('id', studentId);
    setSaving(false);
    if (!error) {
      onSaved({
        payment_model: next,
        ...(models.has('per_lesson')
          ? {}
          : { per_lesson_payment_timing: null, per_lesson_payment_deadline_hours: null }),
      });
    }
  };

  const toggleModel = async (model: PaymentModel) => {
    if (disabled || saving) return;
    const next = new Set<PaymentModel>(selectedModels);
    if (next.has(model)) next.delete(model);
    else next.add(model);
    await saveModelSelection(next);
  };

  const resetToDefault = async () => {
    if (disabled || saving) return;
    await saveModelSelection(new Set());
  };

  const inheritedLabel =
    inheritedLessonPayment.payment_timing === 'before_lesson'
      ? t('studentPaymentSection.inheritedBefore', { hours: String(inheritedLessonPayment.payment_deadline_hours) })
      : t('studentPaymentSection.inheritedAfter', { hours: String(inheritedLessonPayment.payment_deadline_hours) });

  const beforeExceedsMin = draftTiming === 'before_lesson' && draftHours > minBookingHours;

  const hours = Math.max(1, Number(draftHours) || 24);
  const sameAsInherited =
    hasPerLesson &&
    draftTiming === inheritedLessonPayment.payment_timing &&
    hours === inheritedLessonPayment.payment_deadline_hours;

  const hasStoredOverride = perLessonTiming != null || perLessonDeadlineHours != null;

  const savePerLessonTiming = async () => {
    if (!hasPerLesson) return;
    if (beforeExceedsMin) return;

    if (sameAsInherited) {
      const ok = await persistStudent({
        per_lesson_payment_timing: null,
        per_lesson_payment_deadline_hours: null,
      });
      if (ok) {
        onSaved({
          per_lesson_payment_timing: null,
          per_lesson_payment_deadline_hours: null,
        });
      }
      return;
    }

    const ok = await persistStudent({
      per_lesson_payment_timing: draftTiming,
      per_lesson_payment_deadline_hours: hours,
    });
    if (ok) {
      onSaved({
        per_lesson_payment_timing: draftTiming,
        per_lesson_payment_deadline_hours: hours,
      });
    }
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Wallet className="w-4 h-4 text-amber-600" />
        <span className="font-semibold text-gray-900 text-sm">{t('paymentModel.title')}</span>
        {saving && <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-400" />}
      </div>
      <p
        className="text-xs text-gray-600 leading-relaxed"
        dangerouslySetInnerHTML={{ __html: t('studentPaymentSection.description') }}
      />
      <div className="space-y-2">
        <Label className="text-xs text-gray-600">{t('studentPaymentSection.modelsLabel')}</Label>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={disabled || saving}
            onClick={() => void resetToDefault()}
            className={cn(
              'rounded-lg border px-3 py-2 text-xs font-medium transition-colors',
              selectedModels.size === 0
                ? 'border-violet-500 bg-violet-50 text-violet-900'
                : 'border-slate-200 bg-white text-gray-700 hover:bg-slate-50',
            )}
          >
            {t('paymentModel.default')}
          </button>
          {allowPerLesson && (
            <button
              type="button"
              disabled={disabled || saving}
              onClick={() => void toggleModel('per_lesson')}
              className={cn(
                'rounded-lg border px-3 py-2 text-xs font-medium transition-colors',
                selectedModels.has('per_lesson')
                  ? 'border-violet-500 bg-violet-50 text-violet-900'
                  : 'border-slate-200 bg-white text-gray-700 hover:bg-slate-50',
              )}
            >
              {t('paymentModel.perLesson')}
            </button>
          )}
          <button
            type="button"
            disabled={disabled || saving}
            onClick={() => void toggleModel('monthly_billing')}
            className={cn(
              'rounded-lg border px-3 py-2 text-xs font-medium transition-colors',
              selectedModels.has('monthly_billing')
                ? 'border-violet-500 bg-violet-50 text-violet-900'
                : 'border-slate-200 bg-white text-gray-700 hover:bg-slate-50',
            )}
          >
            {t('paymentModel.monthlyBilling')}
          </button>
          <button
            type="button"
            disabled={disabled || saving}
            onClick={() => void toggleModel('prepaid_packages')}
            className={cn(
              'rounded-lg border px-3 py-2 text-xs font-medium transition-colors',
              selectedModels.has('prepaid_packages')
                ? 'border-violet-500 bg-violet-50 text-violet-900'
                : 'border-slate-200 bg-white text-gray-700 hover:bg-slate-50',
            )}
          >
            {t('paymentModel.prepaidPackages')}
          </button>
        </div>
      </div>

      {hasPerLesson && (
        <div className="rounded-lg border border-amber-200 bg-amber-50/40 p-3 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs text-gray-700">
              <span className="font-semibold text-gray-900">{t('studentPaymentSection.inheritedRules')}</span>{' '}
              <span className="text-gray-800">{inheritedLabel}</span>
            </p>
            {hasStoredOverride && (
              <span className="text-[10px] font-semibold uppercase tracking-wide text-violet-700 bg-violet-100 px-2 py-0.5 rounded-full">
                {t('studentPaymentSection.individualOverride')}
              </span>
            )}
          </div>
          <p
            className="text-[11px] text-gray-600"
            dangerouslySetInnerHTML={{ __html: t('studentPaymentSection.timingExplain') }}
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <button
              type="button"
              disabled={disabled || saving}
              onClick={() => setDraftTiming('before_lesson')}
              className={cn(
                'rounded-lg border px-3 py-2 text-left text-xs transition-colors',
                draftTiming === 'before_lesson'
                  ? 'border-violet-500 bg-violet-50 text-violet-900'
                  : 'border-slate-200 bg-white text-gray-700 hover:bg-slate-50',
              )}
            >
              <span className="font-semibold block">{t('studentPaymentSection.beforeLesson')}</span>
              <span className="text-[11px] text-gray-500">{t('studentPaymentSection.beforeLessonHint')}</span>
            </button>
            <button
              type="button"
              disabled={disabled || saving}
              onClick={() => setDraftTiming('after_lesson')}
              className={cn(
                'rounded-lg border px-3 py-2 text-left text-xs transition-colors',
                draftTiming === 'after_lesson'
                  ? 'border-violet-500 bg-violet-50 text-violet-900'
                  : 'border-slate-200 bg-white text-gray-700 hover:bg-slate-50',
              )}
            >
              <span className="font-semibold block">{t('studentPaymentSection.afterLesson')}</span>
              <span className="text-[11px] text-gray-500">{t('studentPaymentSection.afterLessonHint')}</span>
            </button>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-gray-600">
              {draftTiming === 'before_lesson'
                ? t('studentPaymentSection.hoursBeforeStart')
                : t('studentPaymentSection.hoursAfterEnd')}
            </Label>
            <Input
              type="number"
              min={1}
              className="rounded-lg bg-white text-sm h-9"
              value={draftHours}
              disabled={disabled || saving}
              onChange={(e) => setDraftHours(Math.max(1, parseInt(e.target.value, 10) || 1))}
            />
            {beforeExceedsMin && (
              <p className="text-[11px] text-amber-800">
                {t('studentPaymentSection.hoursExceedsMin', { hours: String(minBookingHours) })}
              </p>
            )}
          </div>
          <button
            type="button"
            disabled={disabled || saving || beforeExceedsMin}
            onClick={() => void savePerLessonTiming()}
            className="w-full rounded-lg bg-violet-600 text-white text-xs font-semibold py-2.5 hover:bg-violet-700 disabled:opacity-50"
          >
            {sameAsInherited
              ? t('studentPaymentSection.saveUsingDefault')
              : t('studentPaymentSection.saveForStudent')}
          </button>
        </div>
      )}
    </div>
  );
}
