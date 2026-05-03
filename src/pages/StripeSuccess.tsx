import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { CheckCircle, Loader2, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase';
import { sendEmail } from '@/lib/email';
import { authHeaders } from '@/lib/apiHelpers';
import { format } from 'date-fns';
import { useTranslation } from '@/lib/i18n';

type Status = 'loading' | 'success' | 'error';

export default function StripeSuccess() {
    const { t } = useTranslation();
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const [status, setStatus] = useState<Status>('loading');
    const [errorMsg, setErrorMsg] = useState('');

    useEffect(() => {
        const sessionId = searchParams.get('tutlio_session');
        const checkoutSessionId = searchParams.get('checkout_session');

        if (!sessionId) {
            setStatus('error');
            setErrorMsg(t('payment.missingLessonId'));
            return;
        }

        if (!checkoutSessionId) {
            setStatus('error');
            setErrorMsg(t('payment.missingStripeSession'));
            return;
        }

        confirmPayment(sessionId, checkoutSessionId);
    }, [searchParams]);

    const confirmPayment = async (sessionId: string, checkoutSessionId: string) => {
        try {
            const res = await fetch('/api/confirm-stripe-payment', {
                method: 'POST',
                headers: await authHeaders(),
                body: JSON.stringify({ sessionId, checkoutSessionId }),
            });
            const json = await res.json();

            if (!res.ok || !json.success) {
                setErrorMsg(json.error || t('payment.confirmFailed3'));
                setStatus('error');
            } else {
                const cancelSessionId = window.localStorage.getItem('stripe_cancel_session_id');
                if (cancelSessionId) {
                    window.localStorage.removeItem('stripe_cancel_session_id');
                    const penaltyReturn = window.localStorage.getItem('stripe_penalty_success_return');
                    if (penaltyReturn) window.localStorage.removeItem('stripe_penalty_success_return');
                    navigate(penaltyReturn || '/student/sessions', {
                        replace: true,
                        state: { sessionId: cancelSessionId, flow: 'cancel_after_payment' },
                    });
                    return;
                }

                setStatus('success');
            }
        } catch (e: any) {
            setErrorMsg(e.message);
            setStatus('error');
        }
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-violet-50 via-white to-emerald-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl shadow-xl border border-gray-100 p-10 max-w-md w-full text-center">
                {status === 'loading' && (
                    <>
                        <div className="w-20 h-20 rounded-full bg-violet-100 flex items-center justify-center mx-auto mb-6">
                            <Loader2 className="w-10 h-10 text-violet-600 animate-spin" />
                        </div>
                        <h1 className="text-xl font-bold text-gray-900 mb-2">{t('payment.stripeChecking')}</h1>
                        <p className="text-sm text-gray-500">{t('payment.stripeWaiting')}</p>
                    </>
                )}

                {status === 'success' && (
                    <>
                        <div className="w-20 h-20 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-6 animate-bounce">
                            <CheckCircle className="w-10 h-10 text-emerald-600" />
                        </div>
                        <h1 className="text-2xl font-black text-gray-900 mb-2">{t('payment.stripePaid')}</h1>
                        <p className="text-sm text-gray-500 mb-8">{t('payment.stripePaidDesc')}</p>
                        <Button
                            onClick={() => navigate('/student/sessions')}
                            className="w-full rounded-2xl bg-violet-600 hover:bg-violet-700 font-bold h-12"
                        >
                            {t('payment.stripeGoToLessons')}
                        </Button>
                    </>
                )}

                {status === 'error' && (
                    <>
                        <div className="w-20 h-20 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-6">
                            <XCircle className="w-10 h-10 text-red-600" />
                        </div>
                        <h1 className="text-xl font-bold text-gray-900 mb-2">{t('payment.stripeErrorTitle')}</h1>
                        <p className="text-sm text-gray-500 mb-2">{errorMsg || t('payment.stripeErrorDefault')}</p>
                        <p className="text-xs text-gray-400 mb-6">{t('payment.stripeErrorContact')} <a href="mailto:info@tutlio.lt" className="text-violet-600 underline">info@tutlio.lt</a>.</p>
                        <Button variant="outline" onClick={() => navigate('/student/sessions')} className="w-full rounded-2xl">
                            {t('payment.stripeBackToLessons')}
                        </Button>
                    </>
                )}
            </div>
        </div>
    );
}
