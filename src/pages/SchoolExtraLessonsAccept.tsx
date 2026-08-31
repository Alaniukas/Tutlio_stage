import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/lib/supabase';
import {
  EXTRA_LESSONS_TERMS_CHECKBOX_TEXT,
  START_WITHIN_14_CHECKBOX_TEXT,
  formatScheduleLabel,
  parseExtraLessonsServiceType,
  resolveStartWithin14Status,
  type ExtraLessonsOrderSnapshot,
  type ExtraLessonsScheduleSlot,
  type ExtraLessonsServiceTypeOrUnset,
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

function PageShell({ children, centered = false }: { children: ReactNode; centered?: boolean }) {
  return (
    <div
      className={`min-h-screen bg-gradient-to-br from-violet-50 via-cyan-50 to-green-50 p-4 sm:p-6 ${
        centered ? 'flex items-center justify-center' : ''
      }`}
    >
      <div className={`mx-auto w-full ${centered ? 'max-w-lg' : 'max-w-4xl'}`}>{children}</div>
    </div>
  );
}

function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl border border-gray-200 bg-white p-6 sm:p-8 shadow-xl ${className}`}>
      {children}
    </div>
  );
}

function BrandMark() {
  return (
    <div className="text-center mb-4">
      <div className="inline-block text-3xl font-black text-indigo-600 tracking-tight">Tutlio 🎓</div>
    </div>
  );
}

export default function SchoolExtraLessonsAccept() {
  const [params] = useSearchParams();
  const token = (params.get('token') || '').trim();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [startWithin14, setStartWithin14] = useState(false);
  const [recordingConsent, setRecordingConsent] = useState<boolean | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<{ sha256: string; acceptedAt?: string } | null>(null);
  const [withdrawn, setWithdrawn] = useState(false);
  const [endKind, setEndKind] = useState<string | null>(null);
  const [pdfRefreshing, setPdfRefreshing] = useState(false);
  const skipNextPreviewRefresh = useRef(true);

  const [serviceName, setServiceName] = useState('');
  const [serviceType, setServiceType] = useState<ExtraLessonsServiceTypeOrUnset>('');
  const [platform, setPlatform] = useState('');
  const [duration, setDuration] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [baseLessons, setBaseLessons] = useState('');
  const [slots, setSlots] = useState<ExtraLessonsScheduleSlot[]>([]);

  const applyPreview = (data: Preview) => {
    setPreview(data);
    const o = data.order;
    setServiceName(o?.service_name || '');
    setServiceType(parseExtraLessonsServiceType(o?.service_type));
    setPlatform(o?.platform || '');
    setDuration(o?.duration_minutes ? String(o.duration_minutes) : '');
    setStartDate(o?.start_date || '');
    setEndDate(o?.end_date || '');
    setBaseLessons(o?.base_lessons_per_month ? String(o.base_lessons_per_month) : '');
    setSlots(Array.isArray(o?.schedule_slots) ? o.schedule_slots : []);
    if (data.alreadyAccepted) setDone({ sha256: '', acceptedAt: data.acceptedAt || undefined });
    if (data.withdrawn) {
      setWithdrawn(true);
      setEndKind(data.extraEndKind || null);
    }
  };

  useEffect(() => {
    if (!token) {
      setError('Nenurodytas pakvietimo parametras.');
      setLoading(false);
      return;
    }
    let cancelled = false;
    const ctrl = new AbortController();
    const timer = window.setTimeout(() => ctrl.abort(), 40000);
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
        applyPreview(data as Preview);
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
      service_type: serviceType || parseExtraLessonsServiceType(preview.order.service_type),
      platform: platform || preview.order.platform,
      duration_minutes: Number(duration) || preview.order.duration_minutes,
      start_date: startDate || preview.order.start_date,
      end_date: endDate || preview.order.end_date,
      schedule_slots: slots,
      schedule_label: formatScheduleLabel(slots) || preview.order.schedule_label,
      base_lessons_per_month: Number(baseLessons) || preview.order.base_lessons_per_month,
    };
  }, [preview, serviceName, serviceType, platform, duration, startDate, endDate, slots, baseLessons]);

  const start14 = useMemo(() => {
    if (!liveOrder) return { applies: false, shownText: START_WITHIN_14_CHECKBOX_TEXT };
    return resolveStartWithin14Status({ order: liveOrder, acceptedAt: new Date(), parentChecked: startWithin14 });
  }, [liveOrder, startWithin14]);

  const needsParentFields = useMemo(() => {
    const fields = new Set(preview?.parentEditableFields || []);
    return {
      service: fields.has('service_name'),
      type: fields.has('service_type'),
      platform: fields.has('platform'),
      duration: fields.has('duration_minutes'),
      schedule: fields.has('schedule_label'),
      start: fields.has('start_date'),
      end: fields.has('end_date'),
      base: fields.has('base_lessons_per_month'),
      any: fields.size > 0,
    };
  }, [preview]);

  const orderPatch = useMemo((): Partial<ExtraLessonsOrderSnapshot> => ({
    service_name: serviceName,
    service_type: serviceType,
    platform,
    duration_minutes: Number(duration) || 0,
    start_date: startDate,
    end_date: endDate,
    base_lessons_per_month: Number(baseLessons) || 0,
    schedule_slots: slots,
    schedule_label: formatScheduleLabel(slots),
  }), [serviceName, serviceType, platform, duration, startDate, endDate, baseLessons, slots]);

  useEffect(() => {
    if (!token || !preview || done) return;
    if (!needsParentFields.any) return;
    if (skipNextPreviewRefresh.current) {
      skipNextPreviewRefresh.current = false;
      return;
    }
    const timer = window.setTimeout(async () => {
      setPdfRefreshing(true);
      try {
        const res = await fetch('/api/extra-lessons-contract-accept', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token, preview: true, order_patch: orderPatch }),
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data?.ok) {
          setPreview((prev) => prev ? {
            ...prev,
            ...data,
            order: data.order || prev.order,
            body: data.body || prev.body,
            pdfUrl: data.pdfUrl || prev.pdfUrl,
            parentEditableFields: data.parentEditableFields || prev.parentEditableFields,
            startWithin14Applies: data.startWithin14Applies,
          } : data);
        }
      } catch {
        /* keep last preview */
      } finally {
        setPdfRefreshing(false);
      }
    }, 900);
    return () => window.clearTimeout(timer);
  }, [token, orderPatch.service_name, orderPatch.service_type, orderPatch.platform, orderPatch.duration_minutes, orderPatch.start_date, orderPatch.end_date, orderPatch.schedule_label, orderPatch.base_lessons_per_month]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!acceptedTerms) return;
    if (preview?.recordingsEnabled && recordingConsent === null) {
      setError('Pasirinkite, ar sutinkate su pamokų įrašymu.');
      return;
    }
    setSubmitting(true);
    setError(null);
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
          order_patch: orderPatch,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || (data.fields ? `Trūksta: ${data.fields.join(', ')}` : 'Nepavyko pateikti užsakymo.'));
        setSubmitting(false);
        return;
      }
      setDone({ sha256: data.document_sha256 || '', acceptedAt: data.accepted_at });
      if (data.pdfUrl) {
        setPreview((prev) => (prev ? { ...prev, pdfUrl: data.pdfUrl } : prev));
      }
    } catch {
      setError('Nepavyko pateikti užsakymo.');
    }
    setSubmitting(false);
  };

  if (loading) {
    return (
      <PageShell centered>
        <p className="text-center text-gray-600">Kraunama sutartis…</p>
      </PageShell>
    );
  }
  if (error && !preview) {
    return (
      <PageShell centered>
        <Card>
          <h1 className="text-xl font-bold text-gray-900 mb-2">Nepavyko atidaryti sutarties</h1>
          <p className="text-gray-600">{error}</p>
        </Card>
      </PageShell>
    );
  }
  if (!preview) return null;

  if (done) {
    return (
      <PageShell centered>
        <Card className="space-y-4">
          <BrandMark />
          <h1 className="text-2xl font-bold text-gray-900">Sutartis sudaryta</h1>
          <p className="text-sm text-gray-600">
            Sutartis Nr. {preview.contractNumber} su {preview.schoolName} dėl {preview.studentName} sudaryta.
            Galutinė kopija išsiųsta el. paštu. 14 dienų atsisakymą ir nutraukimą rasite tėvų paskyroje.
          </p>
          {preview.pdfUrl && (
            <Button
              variant="outline"
              className="rounded-xl"
              onClick={() => window.open(preview.pdfUrl || '', '_blank', 'noopener,noreferrer')}
            >
              Atidaryti sutarties PDF
            </Button>
          )}
          {done.sha256 && <p className="text-xs text-gray-500 break-all">Dokumento SHA-256: {done.sha256}</p>}
          {error && <p className="text-sm text-red-600">{error}</p>}
          {withdrawn && (
            <p className="text-sm text-amber-700">
              {endKind === 'termination' ? 'Sutarties nutraukimas pateiktas.' : 'Sutarties atsisakymas pateiktas.'}
              {' '}Patvirtinimas išsiųstas el. paštu. Mokytojo atskirai informuoti nereikia.
            </p>
          )}
        </Card>
      </PageShell>
    );
  }

  const o = preview.order;
  const termsText = preview.termsCheckboxText || EXTRA_LESSONS_TERMS_CHECKBOX_TEXT;
  const start14Text = preview.startWithin14CheckboxText || START_WITHIN_14_CHECKBOX_TEXT;
  const withdrawalHref = preview.legalLinks?.withdrawalForm || '/legal/extra-lessons-withdrawal-form.html';
  const pdfLooksHttp = Boolean(preview.pdfUrl && /^https?:\/\//i.test(preview.pdfUrl));
  const recordingReady = !preview.recordingsEnabled || recordingConsent !== null;

  return (
    <PageShell>
      <Card className="space-y-5">
        <BrandMark />
        <div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Peržiūrėkite ir priimkite sutartį</h1>
          <p className="text-gray-600 text-sm">
            Peržiūrėkite visą papildomų pamokų sutartį, jei reikia papildykite užsakymo duomenis ir pažymėkite sutikimus.
            Sutartis sudaroma elektroniniu būdu — el. parašas (GoSign) čia nenaudojamas.
          </p>
        </div>

        <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700 space-y-1">
          {preview.schoolName && <p><span className="font-semibold">Mokykla:</span> {preview.schoolName}</p>}
          {preview.studentName && <p><span className="font-semibold">Mokinys:</span> {preview.studentName}</p>}
          {preview.contractNumber && <p><span className="font-semibold">Sutarties Nr.:</span> {preview.contractNumber}</p>}
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="overflow-hidden rounded-xl border border-gray-200">
          <div className="flex items-center justify-between gap-3 border-b border-gray-200 bg-gray-50 px-4 py-3">
            <h2 className="font-semibold text-gray-900">Sutarties dokumentas</h2>
            {pdfLooksHttp && (
              <button
                type="button"
                className="text-sm font-semibold text-indigo-700 hover:underline"
                onClick={() => window.open(preview.pdfUrl || '', '_blank', 'noopener,noreferrer')}
              >
                Atidaryti visą PDF
              </button>
            )}
          </div>
          {pdfRefreshing && (
            <p className="px-4 py-2 text-xs text-indigo-700 bg-indigo-50">
              Atnaujinama peržiūra pagal jūsų įvestus duomenis…
            </p>
          )}
          {pdfLooksHttp ? (
            <iframe
              title="Sutarties PDF"
              src={preview.pdfUrl || ''}
              className="w-full h-[75vh] bg-white"
            />
          ) : (
            <div className="whitespace-pre-wrap bg-white p-4 max-h-[75vh] overflow-y-auto text-sm text-gray-800 leading-relaxed">
              {preview.body}
            </div>
          )}
        </div>
        {pdfLooksHttp && (
          <details className="text-sm">
            <summary className="cursor-pointer font-medium text-gray-700">Rodyti sutarties tekstą (jei PDF neatsidaro)</summary>
            <div className="mt-2 whitespace-pre-wrap rounded-xl border bg-gray-50 p-4 max-h-[40vh] overflow-y-auto text-gray-800">
              {preview.body}
            </div>
          </details>
        )}

        {needsParentFields.any && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 space-y-3 text-amber-950">
            <p className="font-bold text-sm">Prašome papildyti trūkstamus užsakymo duomenis:</p>
            <p className="text-xs text-amber-900/80">PDF atsinaujins automatiškai, kai užpildysite laukus.</p>
            {(needsParentFields.service || !serviceName) && (
              <div>
                <Label>Paslaugos pavadinimas</Label>
                <Input className="mt-1 rounded-xl" value={serviceName} onChange={(e) => setServiceName(e.target.value)} />
              </div>
            )}
            {(needsParentFields.type || !serviceType) && (
              <div>
                <Label>Paslaugos tipas</Label>
                <div className="mt-2 flex flex-col gap-2 text-sm">
                  <label className="flex items-center gap-2">
                    <input type="radio" name="service_type" checked={serviceType === 'group'} onChange={() => setServiceType('group')} />
                    Grupinė
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="radio" name="service_type" checked={serviceType === 'individual'} onChange={() => setServiceType('individual')} />
                    Individuali
                  </label>
                </div>
              </div>
            )}
            {(needsParentFields.platform || !platform) && (
              <div>
                <Label>Platforma</Label>
                <Input className="mt-1 rounded-xl" value={platform} onChange={(e) => setPlatform(e.target.value)} placeholder="Google Meet" />
              </div>
            )}
            {(needsParentFields.duration || !duration) && (
              <div>
                <Label>Pamokos trukmė (min)</Label>
                <Input className="mt-1 rounded-xl" value={duration} onChange={(e) => setDuration(e.target.value)} placeholder="45" />
              </div>
            )}
            {(needsParentFields.schedule || slots.length === 0) && (
              <div>
                <Label>Grafikas</Label>
                <ScheduleSlotPicker slots={slots} onChange={setSlots} durationMinutes={Number(duration) || o.duration_minutes || 45} />
              </div>
            )}
            {(needsParentFields.start || needsParentFields.end || !startDate || !endDate) && (
              <DateRangeFields startDate={startDate} endDate={endDate} onStart={setStartDate} onEnd={setEndDate} />
            )}
            {(needsParentFields.base || !baseLessons) && (
              <div>
                <Label>Bazinis pamokų kiekis / mėn.</Label>
                <Input className="mt-1 rounded-xl" value={baseLessons} onChange={(e) => setBaseLessons(e.target.value)} />
              </div>
            )}
          </div>
        )}

        <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700 space-y-1">
          <p className="font-semibold text-gray-900 mb-1">Užsakymo suvestinė</p>
          <div><span className="font-semibold">Paslauga:</span> {serviceName || o.service_name || '—'}</div>
          <div><span className="font-semibold">Tipas:</span> {serviceType === 'individual' || o.service_type === 'individual' ? 'individuali' : serviceType === 'group' || o.service_type === 'group' ? 'grupinė' : '—'}</div>
          <div><span className="font-semibold">Platforma:</span> {platform || o.platform || '—'}</div>
          <div><span className="font-semibold">Trukmė:</span> {duration || o.duration_minutes || '—'} min.</div>
          <div><span className="font-semibold">Grafikas:</span> {formatScheduleLabel(slots) || o.schedule_label || '—'}</div>
          <div><span className="font-semibold">Laikotarpis:</span> {startDate || o.start_date || '—'} – {endDate || o.end_date || '—'}</div>
          <div><span className="font-semibold">Kaina:</span> {Number(o.unit_price_eur).toFixed(2)} € / pamoka</div>
          <div><span className="font-semibold">Orientacinė / mėn.:</span> {Number(o.indicative_monthly_eur).toFixed(2)} €</div>
        </div>

        <div className="text-sm space-y-1">
          <p className="font-semibold text-gray-900">Priedai ir kontaktai</p>
          <ul className="list-disc pl-5 text-gray-700 space-y-1">
            <li>
              {preview.legalLinks?.privacyMailto
                ? <a className="text-indigo-700 underline" href={preview.legalLinks.privacyMailto}>Privatumo pranešimas (mokyklos kontaktai)</a>
                : <span>Privatumo pranešimas — kreipkitės {preview.schoolEmail || preview.schoolPhone || 'į mokyklą'}</span>}
            </li>
            <li>Elgesio taisyklės — kreipkitės {preview.schoolEmail || preview.schoolPhone || 'į mokyklą'}</li>
            <li>
              <a className="text-indigo-700 underline" href={withdrawalHref} target="_blank" rel="noreferrer">
                Sutarties atsisakymo formos šablonas
              </a>
            </li>
          </ul>
        </div>

        <form onSubmit={submit} className="space-y-4 border-t pt-4">
          <label className="flex items-start gap-3 rounded-xl border border-indigo-200 bg-indigo-50 p-4 text-sm text-indigo-950">
            <input
              type="checkbox"
              checked={acceptedTerms}
              onChange={(e) => setAcceptedTerms(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-indigo-300 text-indigo-600"
            />
            <span>{termsText} *</span>
          </label>
          {start14.applies && (
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 space-y-3">
              <p className="font-bold text-gray-900">Paslaugų pradžia per 14 dienų</p>
              <p className="text-sm text-gray-600 leading-relaxed">{start14Text}</p>
              <div className="flex flex-col gap-2">
                <label className="flex items-start gap-2 text-sm text-gray-800">
                  <input
                    type="radio"
                    name="start_within_14"
                    checked={startWithin14 === true}
                    onChange={() => setStartWithin14(true)}
                  />
                  <span>Sutinku pradėti iš karto</span>
                </label>
                <label className="flex items-start gap-2 text-sm text-gray-800">
                  <input
                    type="radio"
                    name="start_within_14"
                    checked={startWithin14 === false}
                    onChange={() => setStartWithin14(false)}
                  />
                  <span>Palaukti</span>
                </label>
              </div>
            </div>
          )}
          {preview.recordingsEnabled && (
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 space-y-3">
              <p className="font-bold text-gray-900">Pamokų įrašymas</p>
              <p className="text-sm text-gray-600 leading-relaxed">
                Ar sutinkate, kad vaiko atvaizdas ir/ar balsas būtų įrašomi pamokos tikslais ir prieinami mokyklai bei paskirtiems mokytojams?
              </p>
              <div className="flex flex-col gap-2">
                <label className="flex items-start gap-2 text-sm text-gray-800">
                  <input
                    type="radio"
                    name="recording_consent"
                    checked={recordingConsent === true}
                    onChange={() => setRecordingConsent(true)}
                  />
                  <span>Sutinku</span>
                </label>
                <label className="flex items-start gap-2 text-sm text-gray-800">
                  <input
                    type="radio"
                    name="recording_consent"
                    checked={recordingConsent === false}
                    onChange={() => setRecordingConsent(false)}
                  />
                  <span>Nesutinku</span>
                </label>
              </div>
            </div>
          )}
          <Button
            type="submit"
            className="w-full rounded-xl bg-emerald-600 hover:bg-emerald-700"
            disabled={!acceptedTerms || !recordingReady || submitting}
          >
            {submitting ? 'Siunčiama…' : 'Patvirtinti sutartį'}
          </Button>
        </form>
      </Card>
    </PageShell>
  );
}
