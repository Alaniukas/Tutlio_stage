import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Wallet, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { resolvePerLessonPaymentRules, type LessonPaymentTiming } from '@/lib/studentPaymentModel';

const DEFAULT_VALUE = '__default__';

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
  const [saving, setSaving] = useState(false);
  const normalizedValue = value === '' ? null : value;
  const selectValue = normalizedValue ?? DEFAULT_VALUE;

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
    if (normalizedValue !== 'per_lesson') return;
    setDraftTiming(effectiveWhenPerLesson.payment_timing);
    setDraftHours(effectiveWhenPerLesson.payment_deadline_hours);
  }, [
    normalizedValue,
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

  const handleModelChange = async (v: string) => {
    const next = v === DEFAULT_VALUE ? null : v;
    const current = normalizedValue ?? null;
    if (next === current) return;

    setSaving(true);
    const payload: Record<string, unknown> = { payment_model: next };
    if (next !== 'per_lesson') {
      payload.per_lesson_payment_timing = null;
      payload.per_lesson_payment_deadline_hours = null;
    }
    const { error } = await supabase.from('students').update(payload).eq('id', studentId);
    setSaving(false);
    if (!error) {
      if (next !== 'per_lesson') {
        onSaved({
          payment_model: next,
          per_lesson_payment_timing: null,
          per_lesson_payment_deadline_hours: null,
        });
      } else {
        onSaved({ payment_model: next });
      }
    }
  };

  const inheritedLabel =
    inheritedLessonPayment.payment_timing === 'before_lesson'
      ? `Prieš pamoką · ${inheritedLessonPayment.payment_deadline_hours} val. iki pamokos pradžios`
      : `Po pamokos · apmokėti per ${inheritedLessonPayment.payment_deadline_hours} val. po pabaigos`;

  const beforeExceedsMin = draftTiming === 'before_lesson' && draftHours > minBookingHours;

  const hours = Math.max(1, Number(draftHours) || 24);
  const sameAsInherited =
    normalizedValue === 'per_lesson' &&
    draftTiming === inheritedLessonPayment.payment_timing &&
    hours === inheritedLessonPayment.payment_deadline_hours;

  const hasStoredOverride = perLessonTiming != null || perLessonDeadlineHours != null;

  const savePerLessonTiming = async () => {
    if (normalizedValue !== 'per_lesson') return;
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
        <span className="font-semibold text-gray-900 text-sm">Mokėjimo būdas</span>
        {saving && <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-400" />}
      </div>
      <p className="text-xs text-gray-600 leading-relaxed">
        <strong>Numatytasis</strong> — joks atskiras modelis; taikomos <span className="whitespace-nowrap">„Finansai“</span> taisyklės.
        Pasirinkus variantą žemiau, jis įrašomas tik šiam mokiniui.
      </p>
      <div className="space-y-1.5">
        <Label className="text-xs text-gray-600">Mokėjimo modelis</Label>
        <Select
          value={selectValue}
          onValueChange={(v) => void handleModelChange(v)}
          disabled={disabled || saving}
        >
          <SelectTrigger className="rounded-xl bg-white text-sm">
            <SelectValue placeholder="Pasirinkite..." />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={DEFAULT_VALUE}>Bendros finansų taisyklės (numatytasis)</SelectItem>
            {allowPerLesson && <SelectItem value="per_lesson">Apmokėjimas už pamoką</SelectItem>}
            <SelectItem value="monthly_billing">Mėnesinės sąskaitos</SelectItem>
            <SelectItem value="prepaid_packages">Pamokų paketai</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {normalizedValue === 'per_lesson' && (
        <div className="rounded-lg border border-amber-200 bg-amber-50/40 p-3 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs text-gray-700">
              <span className="font-semibold text-gray-900">Bendros taisyklės (Finansai):</span>{' '}
              <span className="text-gray-800">{inheritedLabel}</span>
            </p>
            {hasStoredOverride && (
              <span className="text-[10px] font-semibold uppercase tracking-wide text-violet-700 bg-violet-100 px-2 py-0.5 rounded-full">
                Yra individualus perrašymas
              </span>
            )}
          </div>
          <p className="text-[11px] text-gray-600">
            Nustatykite, kada ir per kiek valandų mokėjimas taikomas <strong>šiam mokiniui</strong>. Jei paliekate kaip bendrose
            taisyklėse ir spaudžiate Išsaugoti — naudojamos bendros taisyklės (be atskiro įrašo DB).
          </p>

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
              <span className="font-semibold block">Prieš pamoką</span>
              <span className="text-[11px] text-gray-500">Terminas nuo pamokos pradžios</span>
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
              <span className="font-semibold block">Po pamokos</span>
              <span className="text-[11px] text-gray-500">Terminas nuo pamokos pabaigos</span>
            </button>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-gray-600">
              {draftTiming === 'before_lesson' ? 'Valandos iki pamokos pradžios' : 'Valandos po pamokos pabaigos'}
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
                Negali būti daugiau nei vėliausia registracija ({minBookingHours} val.). Sumažinkite valandas arba pakeiskite
                „Pamokų nustatymuose“ min. registracijos laiką.
              </p>
            )}
          </div>
          <button
            type="button"
            disabled={disabled || saving || beforeExceedsMin}
            onClick={() => void savePerLessonTiming()}
            className="w-full rounded-lg bg-violet-600 text-white text-xs font-semibold py-2.5 hover:bg-violet-700 disabled:opacity-50"
          >
            {sameAsInherited ? 'Išsaugoti (naudoti bendras Finansų taisykles)' : 'Išsaugoti šiam mokiniui'}
          </button>
        </div>
      )}
    </div>
  );
}
