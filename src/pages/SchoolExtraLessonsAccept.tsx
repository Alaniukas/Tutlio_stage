import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  formatScheduleLabel,
  type ExtraLessonsOrderSnapshot,
  type ExtraLessonsScheduleSlot,
} from '@/lib/extraLessonsContract';
import { DateRangeFields, ScheduleSlotPicker } from '@/components/company/ScheduleSlotPicker';

type Preview = {
  ok: boolean;
  contractId: string;
  contractNumber?: string;
  studentName?: string;
  schoolName?: string;
  alreadyAccepted?: boolean;
  withdrawn?: boolean;
  order: ExtraLessonsOrderSnapshot;
  parentEditableFields?: string[];
  body: string;
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
  const [done, setDone] = useState<{ sha256: string } | null>(null);
  const [withdrawn, setWithdrawn] = useState(false);

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
        if (data.alreadyAccepted) setDone({ sha256: '' });
        if (data.withdrawn) setWithdrawn(true);
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
      const res = await fetch('/api/extra-lessons-contract-accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          accepted_terms: acceptedTerms,
          start_within_14_days: startWithin14,
          recording_consent: recordingConsent,
          order_patch,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || (data.fields ? `Trūksta: ${data.fields.join(', ')}` : 'Nepavyko pateikti užsakymo.'));
        setSubmitting(false);
        return;
      }
      setDone({ sha256: data.document_sha256 || '' });
    } catch {
      setError('Nepavyko pateikti užsakymo.');
    }
    setSubmitting(false);
  };

  const withdraw = async () => {
    setSubmitting(true);
    const res = await fetch('/api/extra-lessons-contract-withdraw', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    });
    if (res.ok) setWithdrawn(true);
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
    return (
      <div className="max-w-3xl mx-auto p-6 space-y-3">
        <h1 className="text-xl font-semibold text-gray-900">Užsakymas priimtas</h1>
        <p className="text-sm text-gray-600">Sutartis su {preview.schoolName} dėl {preview.studentName} užregistruota.</p>
        {done.sha256 && <p className="text-xs text-gray-500 break-all">SHA-256: {done.sha256}</p>}
        {!withdrawn && (
          <Button variant="outline" disabled={submitting} onClick={withdraw}>Atsisakyti per 14 d.</Button>
        )}
        {withdrawn && <p className="text-sm text-amber-700">Atsisakymas pateiktas.</p>}
      </div>
    );
  }

  const o = preview.order;

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

      <form onSubmit={submit} className="space-y-3">
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" checked={acceptedTerms} onChange={(e) => setAcceptedTerms(e.target.checked)} className="mt-1" />
          Sutinku su sutarties sąlygomis *
        </label>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" checked={startWithin14} onChange={(e) => setStartWithin14(e.target.checked)} className="mt-1" />
          Prašau pradėti paslaugas per 14 dienų
        </label>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" checked={recordingConsent} onChange={(e) => setRecordingConsent(e.target.checked)} className="mt-1" />
          Sutinku, kad pamokos būtų įrašomos (jei taikoma)
        </label>
        <Button type="submit" className="bg-emerald-600 hover:bg-emerald-700" disabled={!acceptedTerms || submitting}>
          {submitting ? 'Siunčiama…' : 'Užsakymas su prievole sumokėti'}
        </Button>
      </form>
    </div>
  );
}
