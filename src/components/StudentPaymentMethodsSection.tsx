import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { CreditCard, Loader2 } from 'lucide-react';
import { useTranslation } from '@/lib/i18n';

const METHODS = ['stripe', 'manual', 'bank_transfer', 'cash'] as const;

interface Props {
  studentId: string;
  disabled?: boolean;
}

export default function StudentPaymentMethodsSection({ studentId, disabled }: Props) {
  const { t } = useTranslation();
  const [enabled, setEnabled] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from('student_payment_methods')
        .select('payment_method')
        .eq('student_id', studentId);
      if (!cancelled) {
        setEnabled(new Set((data ?? []).map((r) => r.payment_method)));
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [studentId]);

  const toggle = async (method: string) => {
    if (saving || disabled) return;
    setSaving(true);
    const next = new Set(enabled);

    if (next.has(method)) {
      await supabase
        .from('student_payment_methods')
        .delete()
        .eq('student_id', studentId)
        .eq('payment_method', method);
      next.delete(method);
    } else {
      await supabase
        .from('student_payment_methods')
        .insert({ student_id: studentId, payment_method: method });
      next.add(method);
    }
    setEnabled(next);
    setSaving(false);
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-gray-400 py-2">
        <Loader2 className="w-4 h-4 animate-spin" />
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <CreditCard className="w-4 h-4 text-blue-600" />
        <span className="font-semibold text-gray-900 text-sm">{t('compStu.paymentMethods')}</span>
        {saving && <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-400" />}
      </div>
      <div className="flex flex-wrap gap-2">
        {METHODS.map((m) => (
          <button
            key={m}
            type="button"
            disabled={disabled || saving}
            onClick={() => void toggle(m)}
            className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
              enabled.has(m)
                ? 'border-blue-500 bg-blue-50 text-blue-700'
                : 'border-slate-200 bg-white text-gray-500 hover:bg-slate-50'
            } disabled:opacity-50`}
          >
            {t(`compStu.payMethod_${m}`)}
          </button>
        ))}
      </div>
    </div>
  );
}
