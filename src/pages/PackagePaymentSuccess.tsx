import { CheckCircle } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useEffect, useState } from 'react';
import { authHeaders } from '@/lib/apiHelpers';
import { useTranslation } from '@/lib/i18n';

export default function PackagePaymentSuccess() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [error, setError] = useState('');
  const [summary, setSummary] = useState<{ availableLessons: number; totalLessons: number; subjectName?: string } | null>(null);

  useEffect(() => {
    const sessionId = searchParams.get('session_id');
    if (!sessionId) {
      setStatus('error');
      setError(t('payment.missingSessionId'));
      return;
    }
    (async () => {
      try {
        const res = await fetch('/api/confirm-package-payment', {
          method: 'POST',
          headers: await authHeaders(),
          body: JSON.stringify({ sessionId }),
        });
        const json = await res.json();
        if (!res.ok || !json?.success) {
          setStatus('error');
          setError(json?.error || t('payment.confirmFailed2'));
          return;
        }
        setSummary({
          availableLessons: json.availableLessons,
          totalLessons: json.totalLessons,
          subjectName: json.subjectName,
        });
        setStatus('success');
      } catch (e: any) {
        setStatus('error');
        setError(e?.message || t('payment.errorOccurred'));
      }
    })();
  }, [searchParams]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-violet-50 via-white to-emerald-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-xl border border-gray-100 p-10 max-w-md w-full text-center">
        <div className="w-20 h-20 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-6">
          <CheckCircle className="w-10 h-10 text-emerald-600" />
        </div>
        <h1 className="text-2xl font-black text-gray-900 mb-2">
          {status === 'loading' ? t('payment.checkingPayment') : status === 'success' ? t('payment.paymentSuccess') : t('payment.confirmFailed')}
        </h1>
        <p className="text-sm text-gray-500 mb-8">
          {status === 'loading' && t('payment.waitingConfirmation')}
          {status === 'error' && (error || t('payment.tryAgainOrContact'))}
          {status === 'success' && (
            <>
              {t('payment.packageActivated')}
              {summary?.subjectName ? ` (${summary.subjectName})` : ''}. {t('payment.lessonsRemaining', { available: summary?.availableLessons ?? 0, total: summary?.totalLessons ?? 0 })}
            </>
          )}
        </p>
        <div className="space-y-3">
          <Button asChild className="w-full rounded-2xl bg-violet-600 hover:bg-violet-700 font-bold h-12">
            <Link to="/student/sessions">{t('payment.goToMyLessons')}</Link>
          </Button>
          <Button asChild variant="outline" className="w-full rounded-2xl">
            <Link to="/login">{t('common.login')}</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
