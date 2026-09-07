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
  pdfUrl?: string;
  partyKind?: 'student' | 'teacher';
};

export default function SchoolSign() {
  const { token: pathToken } = useParams<{ token?: string }>();
  const [params] = useSearchParams();
  const token = pathToken || params.get('token') || '';
  const [state, setState] = useState<'loading' | 'ready' | 'signed' | 'notready' | 'error' | 'uploaded'>('loading');
  const [info, setInfo] = useState<Info>({});
  const [err, setErr] = useState('');
  const [startErr, setStartErr] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [uploadErr, setUploadErr] = useState('');
  const [uploadedDone, setUploadedDone] = useState(false);
  const [uploadedWarning, setUploadedWarning] = useState(false);
  const isTeacherContract = info.partyKind === 'teacher';

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
    setStartErr('');
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
      // Transient GoSign hiccups (slow RC, gateway errors) must not dead-end the
      // page — keep the button so the parent can simply try again.
      const transient = r.status === 502 || r.status === 503 || r.status === 504 || /timed out|timeout/i.test(j.error || '');
      if (transient) {
        setStartErr('Registrų centro (GoSign) paslauga šiuo metu atsako lėtai. Palaukite kelias sekundes ir bandykite dar kartą — pasirašymas nesidubliuos.');
        return;
      }
      setErr(j.error || 'Nepavyko pradėti pasirašymo. Bandykite dar kartą.');
      setState('error');
    } catch {
      setStartErr('Nepavyko pasiekti serverio. Patikrinkite ryšį ir bandykite dar kartą.');
    } finally {
      setSubmitting(false);
    }
  };

  /** Smart-ID (Dokobit) path: upload the externally signed PDF for validation. */
  const uploadSigned = async (file: File) => {
    setUploadBusy(true);
    setUploadErr('');
    try {
      const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
      if (!isPdf) {
        setUploadErr('Įkelkite PDF failą. Jei Dokobit pasiūlė kitą formatą — atsisiųskite dar kartą kaip PDF.');
        return;
      }
      const r1 = await fetch('/api/school-contract-parent-upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, action: 'upload-url' }),
      });
      const j1 = await r1.json().catch(() => ({}));
      if (!r1.ok || !j1.signedUrl || !j1.path) {
        setUploadErr(j1.error || 'Nepavyko paruošti įkėlimo. Bandykite dar kartą.');
        return;
      }
      const put = await fetch(j1.signedUrl, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/pdf', 'x-upsert': 'true' },
        body: file,
      });
      if (!put.ok) {
        setUploadErr('Nepavyko įkelti failo. Patikrinkite ryšį ir bandykite dar kartą.');
        return;
      }
      const r2 = await fetch('/api/school-contract-parent-upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, action: 'finalize', path: j1.path }),
      });
      const j2 = await r2.json().catch(() => ({}));
      if (j2.alreadySigned) {
        setState('signed');
        return;
      }
      if (!r2.ok || !j2.signed) {
        setUploadErr(j2.error || 'Įkelto failo patikrinti nepavyko. Bandykite dar kartą.');
        return;
      }
      setUploadedDone(Boolean(j2.done));
      setUploadedWarning(j2.warning === 'advance_incomplete');
      setState('uploaded');
    } catch {
      setUploadErr('Įvyko klaida. Bandykite dar kartą.');
    } finally {
      setUploadBusy(false);
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
          <h1 className="text-xl font-bold text-gray-900 mb-1">
            {isTeacherContract ? 'Mokytojo sutarties pasirašymas' : 'Ugdymo sutarties pasirašymas'}
          </h1>
          <p className="text-gray-600 mb-4">
            {info.schoolName || 'Mokykla'} pasirašė {isTeacherContract ? 'sutartį su jumis' : 'ugdymo sutartį'}
            {!isTeacherContract && info.studentName ? ` dėl ${info.studentName}` : ''}. Pasirinkite pasirašymo būdą.
          </p>

          <div className="border border-gray-200 rounded-xl p-4 mb-3">
            <p className="font-semibold text-gray-900 mb-1">1. Mobiliuoju parašu, LT ID arba kortele</p>
            <p className="text-sm text-gray-500 mb-3">
              Būsite nukreipti į Registrų centro GoSign puslapį ir grįšite atgal. Tinka: Mobile-ID, LT ID
              programėlė, asmens tapatybės kortelė, USB laikmena.
            </p>
            {startErr && (
              <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-3">{startErr}</p>
            )}
            <button
              onClick={start}
              disabled={submitting || uploadBusy}
              className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white font-semibold rounded-xl px-5 py-3 transition-colors"
            >
              {submitting ? 'Nukreipiama…' : startErr ? 'Bandyti dar kartą' : 'Pasirašyti el. parašu'}
            </button>
          </div>

          <div className="border border-gray-200 rounded-xl p-4">
            <p className="font-semibold text-gray-900 mb-1">2. Per Dokobit (Smart-ID ar mobilusis parašas)</p>
            <p className="text-sm text-gray-500 mb-3">
              Atsisiųskite sutartį čia, pasirašykite Dokobit, tada grįžkite ir įkelkite pasirašytą failą.
            </p>
            <ol className="text-sm text-gray-600 mb-3 list-decimal pl-5 space-y-1">
              <li>
                {info.pdfUrl ? (
                  <a className="text-indigo-600 font-medium underline" href={info.pdfUrl} target="_blank" rel="noreferrer">
                    Atsisiųskite sutartį
                  </a>
                ) : (
                  <button
                    type="button"
                    className="text-indigo-600 font-medium underline"
                    onClick={() => window.location.reload()}
                  >
                    Atsisiųskite sutartį — perkrauti nuorodą
                  </button>
                )}
                {' '}(naudokite tik šį failą).
              </li>
              <li>
                Atidarykite{' '}
                <a className="text-indigo-600 underline" href="https://www.dokobit.com/lt" target="_blank" rel="noreferrer">
                  dokobit.com
                </a>
                , įkelkite tą failą ir pasirašykite.
              </li>
              <li>
                <strong>Svarbu:</strong> kai Dokobit klausia formato, rinkitės <strong>PDF</strong>.
                Atsisiųskite pasirašytą failą kaip PDF.
              </li>
              <li>Grįžkite į šį puslapį ir įkelkite tą pasirašytą PDF:</li>
            </ol>
            {uploadErr && (
              <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-3">{uploadErr}</p>
            )}
            <label className={`block ${uploadBusy || submitting ? 'opacity-60' : 'cursor-pointer'}`}>
              <input
                type="file"
                accept="application/pdf,.pdf"
                className="hidden"
                disabled={uploadBusy || submitting}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void uploadSigned(file);
                  e.target.value = '';
                }}
              />
              <span className="block w-full text-center border-2 border-indigo-600 text-indigo-700 hover:bg-indigo-50 font-semibold rounded-xl px-5 py-3 transition-colors">
                {uploadBusy ? 'Įkeliama ir tikrinama…' : 'Įkelti pasirašytą PDF'}
              </span>
            </label>
          </div>

          <p className="text-xs text-gray-400 mt-3">Ši nuoroda asmeninė – neperduokite jos kitiems.</p>
        </>
      )}

      {state === 'uploaded' && (
        <>
          <h1 className="text-xl font-bold text-emerald-700 mb-2">Pasirašyta sėkmingai ✓</h1>
          <p className="text-gray-600">
            {uploadedWarning
              ? 'Jūsų parašas gautas ir patikrintas. Patvirtinimo laiškai gali vėluoti — jei per valandą negausite žinios, susisiekite su mokykla.'
              : uploadedDone
                ? 'Sutartis pasirašyta abiejų šalių. Netrukus gausite el. laišką dėl apmokėjimo.'
                : 'Jūsų parašas gautas ir patikrintas. Kitos šalies pasirašymo kvietimas išsiųstas el. paštu.'}
          </p>
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
