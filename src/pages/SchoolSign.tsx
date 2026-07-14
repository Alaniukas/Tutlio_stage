/**
 * Parent contract-signing entry page (no account required).
 * Reached from the invite email link /school-sign?token=…
 * Lithuanian-only (school "ugdymo šeimoje" B2B flow).
 */
import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';

type Info = {
  studentName?: string;
  schoolName?: string;
  signerName?: string;
  alreadySigned?: boolean;
  expired?: boolean;
  ready?: boolean;
};

export default function SchoolSign() {
  const { token: pathToken } = useParams<{ token?: string }>();
  const [params] = useSearchParams();
  const token = pathToken || params.get('token') || '';
  const [state, setState] = useState<'loading' | 'ready' | 'signed' | 'notready' | 'error'>('loading');
  const [info, setInfo] = useState<Info>({});
  const [err, setErr] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!token) {
      setState('error');
      setErr('Trūksta nuorodos parametrų.');
      return;
    }
    (async () => {
      try {
        const r = await fetch(`/api/school-contract-parent-sign-init?token=${encodeURIComponent(token)}`);
        const j = await r.json().catch(() => ({}));
        if (!r.ok) {
          setState('error');
          setErr(j.error || 'Nuoroda negalioja arba nebegalioja.');
          return;
        }
        setInfo(j);
        if (j.alreadySigned) setState('signed');
        else if (j.expired) {
          setState('error');
          setErr('Ši pasirašymo nuoroda nebegalioja. Kreipkitės į mokyklą dėl naujos.');
        } else if (!j.ready) setState('notready');
        else setState('ready');
      } catch {
        setState('error');
        setErr('Nepavyko įkelti sutarties duomenų. Bandykite vėliau.');
      }
    })();
  }, [token]);

  const start = async () => {
    setSubmitting(true);
    try {
      const r = await fetch('/api/school-contract-parent-sign-init', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      const j = await r.json().catch(() => ({}));
      if (r.ok && j.signingUrl) {
        window.location.href = j.signingUrl;
        return;
      }
      if (j.alreadySigned) {
        setState('signed');
        return;
      }
      setErr(j.error || 'Nepavyko pradėti pasirašymo. Bandykite dar kartą.');
      setState('error');
    } catch {
      setErr('Įvyko klaida. Bandykite vėliau.');
      setState('error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Shell>
      {state === 'loading' && <p className="text-gray-500">Kraunama…</p>}

      {state === 'error' && (
        <>
          <h1 className="text-xl font-bold text-gray-900 mb-2">Nepavyko atidaryti</h1>
          <p className="text-gray-600">{err}</p>
        </>
      )}

      {state === 'signed' && (
        <>
          <h1 className="text-xl font-bold text-emerald-700 mb-2">Sutartis jau pasirašyta</h1>
          <p className="text-gray-600">Ačiū! Jūsų parašas jau gautas. Šios nuorodos nebereikia.</p>
        </>
      )}

      {state === 'notready' && (
        <>
          <h1 className="text-xl font-bold text-gray-900 mb-2">Sutartis dar neparuošta pasirašyti</h1>
          <p className="text-gray-600">
            Sutartį pirmiausia turi pasirašyti mokykla. Kai tik ji bus paruošta, gausite el. laišką su nuoroda.
          </p>
        </>
      )}

      {state === 'ready' && (
        <>
          <h1 className="text-xl font-bold text-gray-900 mb-1">Ugdymo sutarties pasirašymas</h1>
          <p className="text-gray-600 mb-4">
            {info.schoolName || 'Mokykla'} pasirašė ugdymo sutartį
            {info.studentName ? ` dėl ${info.studentName}` : ''}. Kviečiame ją pasirašyti elektroniniu parašu.
          </p>
          <ul className="text-sm text-gray-500 mb-6 list-disc pl-5 space-y-1">
            <li>Pasirašyti galėsite su Smart-ID, Mobiliuoju parašu arba el. parašo kortele.</li>
            <li>Būsite nukreipti į Registrų centro GoSign pasirašymo puslapį ir grįšite atgal.</li>
          </ul>
          <button
            onClick={start}
            disabled={submitting}
            className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white font-semibold rounded-xl px-5 py-3 transition-colors"
          >
            {submitting ? 'Nukreipiama…' : 'Pasirašyti el. parašu'}
          </button>
          <p className="text-xs text-gray-400 mt-3">Ši nuoroda asmeninė – neperduokite jos kitiems.</p>
        </>
      )}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="min-h-screen flex items-center justify-center p-6"
      style={{ background: 'linear-gradient(135deg,#f5f3ff 0%,#ecfeff 50%,#f0fdf4 100%)' }}
    >
      <div className="w-full max-w-md bg-white border border-gray-200 rounded-2xl shadow-xl p-6 md:p-8">
        {children}
      </div>
    </div>
  );
}
