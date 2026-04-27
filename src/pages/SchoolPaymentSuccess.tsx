import { useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function SchoolPaymentSuccess() {
  const [params] = useSearchParams();
  const [status, setStatus] = useState<'loading' | 'success' | 'error' | 'cancelled'>('loading');
  const [errorMsg, setErrorMsg] = useState('');
  const success = params.get('success') === '1';
  const cancelled = params.get('cancelled') === '1';
  const installmentId = params.get('installment') || '';
  const sessionId = params.get('session_id') || '';

  useEffect(() => {
    if (cancelled) {
      setStatus('cancelled');
      return;
    }
    if (!success) {
      setStatus('error');
      setErrorMsg('Mokėjimo būsena neaiški.');
      return;
    }
    if (!installmentId || !sessionId) {
      setStatus('error');
      setErrorMsg('Trūksta mokėjimo identifikatorių.');
      return;
    }

    let mounted = true;
    (async () => {
      try {
        const resp = await fetch('/api/confirm-school-installment-payment', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ installmentId, sessionId }),
        });
        const json = await resp.json().catch(() => ({}));
        if (!resp.ok || !json?.success) {
          if (!mounted) return;
          setStatus('error');
          setErrorMsg(typeof json?.error === 'string' ? json.error : 'Nepavyko patvirtinti mokėjimo.');
          return;
        }
        if (!mounted) return;
        setStatus('success');
      } catch (e: any) {
        if (!mounted) return;
        setStatus('error');
        setErrorMsg(e?.message || 'Nepavyko patvirtinti mokėjimo.');
      }
    })();
    return () => { mounted = false; };
  }, [cancelled, success, installmentId, sessionId]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-violet-50 via-white to-emerald-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-xl border border-gray-100 p-10 max-w-md w-full text-center">
        <div className={`w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6 ${status === 'success' ? 'bg-emerald-100' : status === 'loading' ? 'bg-violet-100' : 'bg-red-100'}`}>
          {status === 'loading' ? (
            <Loader2 className="w-10 h-10 text-violet-600 animate-spin" />
          ) : status === 'success' ? (
            <CheckCircle className="w-10 h-10 text-emerald-600" />
          ) : (
            <XCircle className="w-10 h-10 text-red-600" />
          )}
        </div>
        <h1 className="text-2xl font-black text-gray-900 mb-2">
          {status === 'loading'
            ? 'Tikrinamas mokėjimas'
            : status === 'success'
              ? 'Mokėjimas sėkmingas'
              : status === 'cancelled'
                ? 'Mokėjimas atšauktas'
                : 'Mokėjimo klaida'}
        </h1>
        <p className="text-sm text-gray-500 mb-8">
          {status === 'loading' && 'Palaukite, tikriname mokėjimo patvirtinimą...'}
          {status === 'success' && 'Ačiū! Įmoka gauta. Mokykla jau matys atnaujintą mokėjimo būseną.'}
          {status === 'cancelled' && 'Jei reikia, galite pakartoti apmokėjimą iš gautos nuorodos el. paštu.'}
          {status === 'error' && (errorMsg || 'Nepavyko patvirtinti mokėjimo. Susisiekite su mokykla.')}
        </p>
        <Button asChild className="w-full rounded-2xl bg-violet-600 hover:bg-violet-700 font-bold h-12">
          <Link to="/login">Grįžti į prisijungimą</Link>
        </Button>
      </div>
    </div>
  );
}
