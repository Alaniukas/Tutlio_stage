import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { STAFF_CONSENT_QUESTIONS } from '@/lib/staffConsentQuestions';

type Answer = 'yes' | 'no' | null;
type ConsentInfo = { employeeName?: string; schoolName?: string; previewUrl?: string | null; answersSubmitted?: boolean; signed?: boolean; needsPersonalDetails?: boolean };

export default function SchoolStaffConsent({ previewInfo }: { previewInfo?: ConsentInfo }) {
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const [answers, setAnswers] = useState<Answer[]>(Array(STAFF_CONSENT_QUESTIONS.length).fill(null));
  const [address, setAddress] = useState('');
  const [personalCode, setPersonalCode] = useState('');
  const [info, setInfo] = useState<ConsentInfo | null>(previewInfo || null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (previewInfo) return;
    if (!token) { setError('Nuoroda negalioja.'); return; }
    let active = true;
    fetch(`/api/school-staff-consent?token=${encodeURIComponent(token)}`)
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.error || 'Nepavyko atidaryti sutikimo.');
        return body;
      })
      .then((body) => { if (active) setInfo(body); })
      .catch((cause) => { if (active) setError(cause?.message || 'Nepavyko atidaryti sutikimo.'); });
    return () => { active = false; };
  }, [token]);

  const submit = async () => {
    if (answers.some((answer) => answer === null)) { setError('Pažymėkite visus 10 punktų.'); return; }
    if (info?.needsPersonalDetails && (address.trim().length < 5 || !/^\d{11}$/.test(personalCode.trim()))) {
      setError('Įveskite gyvenamosios vietos adresą ir 11 skaitmenų asmens kodą.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      if (previewInfo) {
        setInfo((current) => ({ ...current, answersSubmitted: true }));
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }
      const response = await fetch('/api/school-staff-consent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, answers, ...(info?.needsPersonalDetails ? { address: address.trim(), personalCode: personalCode.trim() } : {}) }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'Nepavyko išsaugoti atsakymų.');
      setInfo((current) => ({ ...current, answersSubmitted: true, needsPersonalDetails: false }));
      setPersonalCode('');
      setAddress('');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (cause: any) {
      setError(cause?.message || 'Nepavyko išsaugoti atsakymų.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10 text-slate-900">
      <div className="mx-auto max-w-3xl rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
        <h1 className="text-2xl font-semibold">Darbuotojo dokumentų forma</h1>
        {info?.schoolName && <p className="mt-2 text-sm text-slate-600">{info.schoolName}{info.employeeName ? ` · ${info.employeeName}` : ''}</p>}
        {!info && !error && <p className="mt-6">Kraunama…</p>}
        {error && <p role="alert" className="mt-5 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        {info?.signed ? (
          <p className="mt-6 text-slate-700">Šis dokumentas jau pasirašytas elektroniniu parašu.</p>
        ) : info?.answersSubmitted ? (
          <div className="mt-6 space-y-3 text-slate-700">
            <p>Jūsų pateikta forma išsaugota. Mokykla paruoš ir pasirašys dokumentus. Tada el. paštu gausite nuorodas pasirašyti elektroniniu parašu.</p>
            <p>Vien pasirinkimų pateikimas nėra elektroninis parašas.</p>
          </div>
        ) : info && (
          <>
            <p className="mt-5 text-sm text-slate-700">Peržiūrėkite visą dokumentą ir kiekviename punkte pasirinkite „Sutinku“ arba „Nesutinku“. Abu atsakymai leidžiami. Po to reikės atskirai pasirašyti elektroniniu parašu.</p>
            {info.needsPersonalDetails && (
              <section className="mt-6 space-y-3 rounded-xl border border-slate-200 p-4">
                <h2 className="font-semibold">Duomenys susitarimui ir jo priedui</h2>
                <p className="text-sm text-slate-600">Jūsų įvesti duomenys bus įrašyti į vieną susitarimo ir priedo PDF, kurį vėliau pasirašys mokykla ir Jūs.</p>
                <label className="block text-sm">Gyvenamosios vietos adresas
                  <input autoComplete="street-address" maxLength={300} value={address} onChange={(event) => setAddress(event.target.value)} className="mt-1 w-full rounded-md border border-slate-300 p-2" />
                </label>
                <label className="block text-sm">Asmens kodas
                  <input inputMode="numeric" autoComplete="off" maxLength={11} value={personalCode} onChange={(event) => setPersonalCode(event.target.value.replace(/\D/g, ''))} className="mt-1 w-full rounded-md border border-slate-300 p-2" />
                </label>
              </section>
            )}
            {info.previewUrl && (
              <details className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4">
                <summary className="cursor-pointer font-medium text-indigo-700">Peržiūrėti visą dokumentą PDF</summary>
                <a href={info.previewUrl} target="_blank" rel="noreferrer" className="mt-3 inline-block text-sm text-indigo-700 underline">Atidaryti PDF atskirame lange</a>
                <iframe src={info.previewUrl} title="Visas darbuotojo sutikimo dokumentas" className="mt-3 h-64 w-full rounded-lg border border-slate-200 bg-white sm:h-[420px]" />
              </details>
            )}
            <div className="mt-7 flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3">
              <h2 className="text-lg font-semibold">Jūsų pasirinkimai</h2>
              <span role="status" className="text-sm text-slate-600">Pažymėta {answers.filter(Boolean).length} iš 10</span>
            </div>
            <div className="mt-5 space-y-4">
              {STAFF_CONSENT_QUESTIONS.map((question, index) => (
                <fieldset key={index} className="rounded-xl border border-slate-200 p-4">
                  <legend className="sr-only">{`1.${index + 1}. ${question}`}</legend>
                  <p aria-hidden="true" className="text-sm font-medium leading-6">{`1.${index + 1}. ${question}`}</p>
                  <div className="mt-2 flex flex-wrap gap-x-6 gap-y-3 text-sm">
                    <label className="flex cursor-pointer items-center gap-2">
                      <input type="radio" name={`choice-${index}`} checked={answers[index] === 'yes'} onChange={() => setAnswers((old) => old.map((item, at) => at === index ? 'yes' : item))} />
                      Sutinku
                    </label>
                    <label className="flex cursor-pointer items-center gap-2">
                      <input type="radio" name={`choice-${index}`} checked={answers[index] === 'no'} onChange={() => setAnswers((old) => old.map((item, at) => at === index ? 'no' : item))} />
                      Nesutinku
                    </label>
                  </div>
                </fieldset>
              ))}
            </div>
            <button type="button" disabled={busy || answers.some((answer) => answer === null) || Boolean(info.needsPersonalDetails && (address.trim().length < 5 || !/^\d{11}$/.test(personalCode.trim())))} onClick={() => void submit()}
              className="mt-6 rounded-lg bg-indigo-600 px-5 py-3 font-medium text-white disabled:cursor-not-allowed disabled:opacity-50">
              {busy ? 'Saugoma…' : info.needsPersonalDetails ? 'Pateikti duomenis ir pasirinkimus' : 'Išsaugoti pasirinkimus'}
            </button>
          </>
        )}
      </div>
    </main>
  );
}
