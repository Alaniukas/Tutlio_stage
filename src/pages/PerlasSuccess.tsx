import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { CheckCircle, Loader2, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTranslation } from '@/lib/i18n';

export default function PerlasSuccess() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const cancelled = searchParams.get('cancel') === '1';
  const [waiting, setWaiting] = useState(!cancelled);

  useEffect(() => {
    if (cancelled) return;
    const timer = setTimeout(() => setWaiting(false), 3000);
    return () => clearTimeout(timer);
  }, [cancelled]);

  if (cancelled) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-teal-50 via-white to-emerald-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl shadow-xl border border-gray-100 p-10 max-w-md w-full text-center">
          <div className="w-20 h-20 rounded-full bg-amber-100 flex items-center justify-center mx-auto mb-6">
            <XCircle className="w-10 h-10 text-amber-600" />
          </div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">{t('perlasFinance.paymentCancelled')}</h1>
          <Button variant="outline" onClick={() => navigate('/student/sessions')} className="w-full rounded-2xl mt-6">
            {t('payment.stripeBackToLessons')}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-teal-50 via-white to-emerald-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-xl border border-gray-100 p-10 max-w-md w-full text-center">
        {waiting ? (
          <>
            <div className="w-20 h-20 rounded-full bg-teal-100 flex items-center justify-center mx-auto mb-6">
              <Loader2 className="w-10 h-10 text-teal-600 animate-spin" />
            </div>
            <h1 className="text-xl font-bold text-gray-900 mb-2">{t('payment.stripeChecking')}</h1>
          </>
        ) : (
          <>
            <div className="w-20 h-20 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-6 animate-bounce">
              <CheckCircle className="w-10 h-10 text-emerald-600" />
            </div>
            <h1 className="text-2xl font-black text-gray-900 mb-2">{t('payment.stripePaid')}</h1>
            <p className="text-sm text-gray-500 mb-8">{t('perlasFinance.paymentProcessing')}</p>
            <Button
              onClick={() => navigate('/student/sessions')}
              className="w-full rounded-2xl bg-teal-600 hover:bg-teal-700 font-bold h-12"
            >
              {t('payment.stripeGoToLessons')}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
