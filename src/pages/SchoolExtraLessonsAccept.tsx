import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/lib/supabase';
import {
  EXTRA_LESSONS_TERMS_CHECKBOX_TEXT,
  START_WITHIN_14_CHECKBOX_TEXT,
  extraLessonsEndKind,
  formatScheduleLabel,
  isWithinWithdrawalWindow,
  resolveStartWithin14Status,
  type ExtraLessonsOrderSnapshot,
  type ExtraLessonsScheduleSlot,
} from '@/lib/extraLessonsContract';
import { DateRangeFields, ScheduleSlotPicker } from '@/components/company/ScheduleSlotPicker';

type Preview = {
  ok: boolean;
  contractId: string;
  contractNumber?: string;
  revisionLabel?: string;
  studentName?: string;
  schoolName?: string;
  schoolEmail?: string | null;
  schoolPhone?: string | null;
  alreadyAccepted?: boolean;
  withdrawn?: boolean;
  extraEndKind?: string | null;
  pdfUrl?: string | null;
  order: ExtraLessonsOrderSnapshot;
  parentEditableFields?: string[];
  body: string;
  startWithin14Applies?: boolean;
  firstLessonDate?: string;
  termsCheckboxText?: string;
  startWithin14CheckboxText?: string;
  recordingsEnabled?: boolean;
  legalLinks?: { withdrawalForm?: string; privacyMailto?: string | null };
  acceptedAt?: string;
};

export default function SchoolExtraLessonsAccept() {
  const [params] = useSearchParams();
  const token = (params.get('token') || '').trim();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [startWithin14, setStartWithin14] = useState(false);
  const [recordingConsent, setRecordingConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<{ sha256: string; acceptedAt?: string } | null>(null);
  const [withdrawn, setWithdrawn] = useState(false);
  const [endKind, setEndKind] = useState<string | null>(null);

  const [serviceName, setServiceName] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [baseLessons, setBaseLessons] = useState('');
  const [slots, setSlots] = useState<ExtraLessonsScheduleSlot[]>([]);

  useEffect(() => {
    if (!token) {
      setError('Nenurodytas pakvietimo parametras.');
      setLoading(false);
      return;
    }
    let cancelled = false;
    const ctrl = new AbortController();
    const timer = window.setTimeout(() => ctrl.abort(), 25000);
    (async () => {
      try {
        const res = await fetch(`/api/extra-lessons-contract-accept?token=${encodeURIComponent(token)}`, {
          signal: ctrl.signal,
        });
        const text = await res.text();
        let data: any = null;
        try { data = JSON.parse(text); } catch { /* html / empty */ }
        if (cancelled) return;
        if (!res.ok) {
          setError((data && data.error) || `Nepavyko įkelti sutarties (${res.status}).`);
          setLoading(false);
          return;
        }
        if (!data?.ok) {
          setError('Nepavyko įkelti sutarties.');
          setLoading(false);
          return;
        }
        setPreview(data as Preview);
        const o = data.order as ExtraLessonsOrderSnapshot;
        setServiceName(o?.service_name || '');
        setStartDate(o?.start_date || '');
        setEndDate(o?.end_date || '');
        setBaseLessons(o?.base_lessons_per_month ? String(o.base_lessons_per_month) : '');
        setSlots(Array.isArray(o?.schedule_slots) ? o.schedule_slots : []);
        if (data.alreadyAccepted) setDone({ sha256: '', acceptedAt: data.acceptedAt });
        if (data.withdrawn) {
          setWithdrawn(true);
          setEndKind(data.extraEndKind || null);
        }
        setLoading(false);
      } catch (e: any) {
        if (!cancelled) {
          setError(e?.name === 'AbortError'
            ? 'Serveris per ilgai neatsako. Paleiskite npm run dev ir bandykite dar kartą.'
            : 'Nepavyko prisijungti prie serverio.');
          setLoading(false);
        }
      } finally {
        window.clearTimeout(timer);
      }
    })();
    return () => { cancelled = true; ctrl.abort(); window.clearTimeout(timer); };
  }, [token]);

  const liveOrder = useMemo((): ExtraLessonsOrderSnapshot | null => {
    if (!preview?.order) return null;
    return {
      ...preview.order,
      service_name: serviceName || preview.order.service_name,
      start_date: startDate || preview.order.start_date,
      end_date: endDate || preview.order.end_date,
      schedule_slots: slots,
      schedule_label: formatScheduleLabel(slots) || preview.order.schedule_label,
      base_lessons_per_month: Number(baseLessons) || preview.order.base_lessons_per_month,
    };
  }, [preview, serviceName, startDate, endDate, slots, baseLessons]);

  const start14 = useMemo(() => {
    if (!liveOrder) return { applies: false, shownText: START_WITHIN_14_CHECKBOX_TEXT };
    return resolveStartWithin14Status({ order: liveOrder, acceptedAt: new Date(), parentChecked: startWithin14 });
  }, [liveOrder, startWithin14]);

  const needsParentFields = useMemo(() => {
    const fields = new Set(preview?.parentEditableFields || []);
    return {
      service: fields.has('service_name'),
      schedule: fields.has('schedule_label'),
      start: fields.has('start_date'),
      end: fields.has('end_date'),
      base: fields.has('base_lessons_per_month'),
      any: fields.size > 0,
    };
  }, [preview]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!acceptedTerms) return;
    setSubmitting(true);
    setError(null);
    const order_patch: Partial<ExtraLessonsOrderSnapshot> = {
      service_name: serviceName,
      start_date: startDate,
      end_date: endDate,
      base_lessons_per_month: Number(baseLessons) || 0,
      schedule_slots: slots,
      schedule_label: formatScheduleLabel(slots),
    };
    try {
      const { data: session } = await supabase.auth.getSession();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (session.session?.access_token) {
        headers.Authorization = `Bearer ${session.session.access_token}`;
      }
      const res = await fetch('/api/extra-lessons-contract-accept', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          token,
          accepted_terms: acceptedTerms,
          start_within_14_days: start14.applies ? startWithin14 : false,
          recording_consent: preview?.recordingsEnabled ? recordingConsent : null,
          order_patch,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || (data.fields ? `Trūksta: ${data.fields.join(', ')}` : 'Nepavyko pateikti užsakymo.'));
        setSubmitting(false);
        return;
      }
      setDone({ sha256: data.document_sha256 || '', acceptedAt: data.accepted_at });
    } catch {
      setError('Nepavyko pateikti užsakymo.');
    }
    setSubmitting(false);
  };

  const endContract = async (intended: 'withdrawal' | 'termination') => {
    setSubmitting(true);
    setError(null);
    const { data: session } = await supabase.auth.getSession();
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (session.session?.access_token) {
      headers.Authorization = `Bearer ${session.session.access_token}`;
    }
    const res = await fetch('/api/extra-lessons-contract-withdraw', {
      method: 'POST',
      headers,
      body: JSON.stringify({ token, intended_kind: intended }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      setWithdrawn(true);
      setEndKind(data.kind || intended);
    } else {
      setError(data.error || 'Nepavyko pateikti prašymo.');
    }
    setSubmitting(false);
  };

  if (loading) {
    return <div className="max-w-3xl mx-auto p-6 text-gray-500">Kraunama sutartis…</div>;
  }
  if (error && !preview) {
    return <div className="max-w-3xl mx-auto p-6 text-red-600">{error}</div>;
  }
  if (!preview) return null;

  if (done) {
    const acceptedAt = done.acceptedAt || preview.acceptedAt || new Date().toISOString();
    const canWithdraw = !withdrawn && isWithinWithdrawalWindow(acceptedAt);
    const canTerminate = !withdrawn && extraLessonsEndKind(acceptedAt) === 'termination';
    return (
      <div className="max-w-3xl mx-auto p-6 space-y-3">
        <h1 className="text-xl font-semibold text-gray-900">Užsakymas priimtas</h1>
        <p className="text-sm text-gray-600">
          Sutartis Nr. {preview.contractNumber} su {preview.schoolName} dėl {preview.studentName} sudaryta.
          Galutinė redakcija išsiųsta el. paštu ir išsaugota jūsų paskyroje.
        </p>
        {done.sha256 && <p className="text-xs text-gray-500 break-all">Dokumento SHA-256: {done.sha256}</p>}
        {error && <p className="text-sm text-red-600">{error}</p>}
        {!withdrawn && canWithdraw && (
          <Button variant="outline" disabled={submitting} onClick={() => void endContract('withdrawal')}>
            Atsisakyti sutarties
          </Button>
        )}
        {!withdrawn && canTerminate && (
          <Button variant="outline" disabled={submitting} onClick={() => void endContract('termination')}>
            Nutraukti sutartį
          </Button>
        )}
        {withdrawn && (
          <p className="text-sm text-amber-700">
            {endKind === 'termination' ? 'Sutarties nutraukimas pateiktas.' : 'Sutarties atsisakymas pateiktas.'}
            {' '}Patvirtinimas išsiųstas el. paštu. Mokytojo atskirai informuoti nereikia.
          </p>
        )}
      </div>
    );
  }

  const o = preview.order;
  const termsText = preview.termsCheckboxText || EXTRA_LESSONS_TERMS_CHECKBOX_TEXT;
  const start14Text = preview.startWithin14CheckboxText || START_WITHIN_14_CHECKBOX_TEXT;
  const withdrawalHref = preview.legalLinks?.withdrawalForm || '/legal/extra-lessons-withdrawal-form.html';

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-4">
      <h1 className="text-xl font-semibold text-gray-900">Papildomų pamokų sutartis</h1>
      <p className="text-sm text-gray-600">{preview.schoolName} · {preview.studentName} · {preview.contractNumber}</p>
      {error && <p className="text-sm text-red-600">{error}</p>}

      {needsParentFields.any && (
        <div className="rounded-xl border bg-white p-4 space-y-3">
          <h2 className="font-medium text-gray-900">Užsakymo duomenys</h2>
          <p className="text-xs text-gray-500">Mokykla paliko dalį laukų jums — užpildykite prieš priimdami.</p>
          {(needsParentFields.service || !serviceName) && (
            <div>
              <Label>Paslaugos pavadinimas</Label>
              <Input value={serviceName} onChange={(e) => setServiceName(e.target.value)} />
            </div>
          )}
          {(needsParentFields.schedule || slots.length === 0) && (
            <div>
              <Label>Grafikas</Label>
              <ScheduleSlotPicker slots={slots} onChange={setSlots} durationMinutes={o.duration_minutes} />
            </div>
          )}
          {(needsParentFields.start || needsParentFields.end || !startDate || !endDate) && (
            <DateRangeFields startDate={startDate} endDate={endDate} onStart={setStartDate} onEnd={setEndDate} />
          )}
          {(needsParentFields.base || !baseLessons) && (
            <div>
              <Label>Bazinis pamokų kiekis / mėn.</Label>
              <Input value={baseLessons} onChange={(e) => setBaseLessons(e.target.value)} />
            </div>
          )}
        </div>
      )}

      <div className="rounded-xl border bg-gray-50 p-4 text-sm space-y-1">
        <div><strong>Paslauga:</strong> {serviceName || o.service_name || '—'}</div>
        <div><strong>Tipas:</strong> {o.service_type === 'individual' ? 'individuali' : 'grupinė'}</div>
        <div><strong>Platforma:</strong> {o.platform}</div>
        <div><strong>Trukmė:</strong> {o.duration_minutes} min.</div>
        <div><strong>Grafikas:</strong> {formatScheduleLabel(slots) || o.schedule_label || '—'}</div>
        <div><strong>Laikotarpis:</strong> {startDate || o.start_date || '—'} – {endDate || o.end_date || '—'}</div>
        <div><strong>Kaina:</strong> {Number(o.unit_price_eur).toFixed(2)} € / pamoka</div>
        <div><strong>Orientacinė / mėn.:</strong> {Number(o.indicative_monthly_eur).toFixed(2)} €</div>
      </div>

      <div className="prose prose-sm max-w-none whitespace-pre-wrap rounded-xl border bg-white p-4 max-h-[40vh] overflow-y-auto text-gray-800">
        {preview.body}
      </div>

      <div className="text-sm space-y-1">
        <p className="font-medium text-gray-800">Prieš užsakymą peržiūrėkite ir išsisaugokite:</p>
        <ul className="list-disc pl-5 text-gray-700 space-y-1">
          <li>
            <a className="text-emerald-700 underline" href="#contract-body" onClick={(e) => {
              e.preventDefault();
              document.querySelector('.prose')?.scrollIntoView({ behavior: 'smooth' });
            }}>Sutarties tekstas</a>
          </li>
          <li>
            {preview.legalLinks?.privacyMailto
              ? <a className="text-emerald-700 underline" href={preview.legalLinks.privacyMailto}>Privatumo pranešimas (mokyklos kontaktai)</a>
              : <span>Privatumo pranešimas — kreipkitės {preview.schoolEmail || preview.schoolPhone || 'į mokyklą'}</span>}
          </li>
          <li>
            Elgesio taisyklės — kreipkitės {preview.schoolEmail || preview.schoolPhone || 'į mokyklą'}
          </li>
          <li>
            <a className="text-emerald-700 underline" href={withdrawalHref} target="_blank" rel="noreferrer">
              Sutarties atsisakymo formos šablonas
            </a>
          </li>
        </ul>
      </div>

      <form onSubmit={submit} className="space-y-4">
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" checked={acceptedTerms} onChange={(e) => setAcceptedTerms(e.target.checked)} className="mt-1" />
          {termsText} *
        </label>
        {start14.applies && (
          <label className="flex items-start gap-2 text-sm border-t pt-3">
            <input type="checkbox" checked={startWithin14} onChange={(e) => setStartWithin14(e.target.checked)} className="mt-1" />
            {start14Text}
          </label>
        )}
        {preview.recordingsEnabled && (
          <label className="flex items-start gap-2 text-sm border-t pt-3">
            <input type="checkbox" checked={recordingConsent} onChange={(e) => setRecordingConsent(e.target.checked)} className="mt-1" />
            Sutinku, kad vaiko atvaizdas ir/ar balsas būtų įrašomi pamokos tikslais ir prieinami mokyklai bei paskirtiems mokytojams.
          </label>
        )}
        <Button type="submit" className="bg-emerald-600 hover:bg-emerald-700" disabled={!acceptedTerms || submitting}>
          {submitting ? 'Siunčiama…' : 'Užsakymas su prievole sumokėti'}
        </Button>
      </form>
    </div>
  );
}
