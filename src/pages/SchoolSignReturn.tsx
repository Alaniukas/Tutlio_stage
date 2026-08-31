/**
 * Return page GoSign redirects to after signing (both directorė and parents).
 * Polls the callback until the transaction settles, then shows the outcome.
 * Lithuanian-only.
 */
import { useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';

type Phase = 'polling' | 'signed' | 'canceled' | 'expired' | 'error';

export default function SchoolSignReturn() {
  const { token: pathToken } = useParams<{ token?: string }>();
  const [params] = useSearchParams();
  const token = pathToken || params.get('token') || '';
  const [phase, setPhase] = useState<Phase>('polling');
  const [allSigned, setAllSigned] = useState(false);
  const [signerRole, setSignerRole] = useState('');
  const active = useRef(true);

  useEffect(() => {
    active.current = true;
    if (!token) {
      setPhase('error');
      return;
    }
    let tries = 0;
    const poll = async () => {
      try {
        const r = await fetch('/api/school-contract-sign-callback', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        });
        const j = await r.json().catch(() => ({}));
        if (!active.current) return;
        if (j.status === 'signed') {
          setAllSigned(Boolean(j.done));
          setSignerRole(String(j.role || ''));
          setPhase('signed');
          const event = { type: 'tutlio:school-contract-updated', contractId: j.contractId || null };
          try {
            window.localStorage.setItem('tutlio:school-contract-updated', JSON.stringify({ ...event, at: Date.now() }));
          } catch {
            // Storage may be unavailable in privacy mode; postMessage still works when an opener exists.
          }
          if (window.opener) window.opener.postMessage(event, window.location.origin);
          if (j.role === 'school' && window.opener) window.setTimeout(() => window.close(), 1800);
          return;
        }
        if (j.status === 'canceled') return setPhase('canceled');
        if (j.status === 'expired') return setPhase('expired');
        if (j.status === 'not_found') return setPhase('error');
        // in_progress / pending → keep polling (GoSign finalizes asynchronously)
        tries += 1;
        if (tries < 40) setTimeout(poll, 3000);
        else setPhase('error');
      } catch {
        if (!active.current) return;
        tries += 1;
        if (tries < 40) setTimeout(poll, 3000);
        else setPhase('error');
      }
    };
    poll();
    return () => {
      active.current = false;
    };
  }, [token]);

  return (
    <div
      className="min-h-screen flex items-center justify-center p-6"
      style={{ background: 'linear-gradient(135deg,#f5f3ff 0%,#ecfeff 50%,#f0fdf4 100%)' }}
    >
      <div className="w-full max-w-md bg-white border border-gray-200 rounded-2xl shadow-xl p-6 md:p-8 text-center">
        {phase === 'polling' && (
          <>
            <div className="w-10 h-10 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mx-auto mb-4" />
            <h1 className="text-lg font-bold text-gray-900 mb-1">Tvirtinamas parašas…</h1>
            <p className="text-gray-500 text-sm">Palaukite akimirką, tikriname pasirašymo būseną.</p>
          </>
        )}

        {phase === 'signed' && (
          <>
            <h1 className="text-xl font-bold text-emerald-700 mb-2">Pasirašyta sėkmingai ✓</h1>
            <p className="text-gray-600">
              {allSigned
                ? signerRole === 'teacher'
                  ? 'Sutartis pasirašyta abiejų šalių. Pasirašytą kopiją gausite el. paštu.'
                  : 'Sutartis pasirašyta abiejų šalių. Netrukus gausite el. laišką dėl apmokėjimo.'
                : 'Jūsų parašas gautas. Kitos šalies pasirašymo kvietimas išsiųstas el. paštu.'}
            </p>
          </>
        )}

        {phase === 'canceled' && (
          <>
            <h1 className="text-xl font-bold text-gray-900 mb-2">Pasirašymas atšauktas</h1>
            <p className="text-gray-600">Pasirašymas nebuvo baigtas. Galite bandyti dar kartą per el. laiške esančią nuorodą.</p>
          </>
        )}

        {phase === 'expired' && (
          <>
            <h1 className="text-xl font-bold text-gray-900 mb-2">Nuoroda nebegalioja</h1>
            <p className="text-gray-600">Kreipkitės į mokyklą dėl naujos pasirašymo nuorodos.</p>
          </>
        )}

        {phase === 'error' && (
          <>
            <h1 className="text-xl font-bold text-gray-900 mb-2">Nepavyko patikrinti būsenos</h1>
            <p className="text-gray-600">
              Jei ką tik pasirašėte, būsena gali atsinaujinti po kelių minučių. Jei ne – bandykite per el. laiške esančią
              nuorodą dar kartą.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
