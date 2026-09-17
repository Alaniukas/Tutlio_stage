import { useEffect, useState } from 'react';
import { CheckCircle2, Download, Loader2, ShieldCheck } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { schoolDiscountTermsLabel, type SchoolDiscountType } from '@/lib/schoolDiscountAgreement';

export type AgreementPreview = {
  status: 'pending' | 'accepted';
  alreadyAccepted: boolean;
  acceptedAt?: string | null;
  agreementNumber: string;
  contractNumber: string;
  schoolName: string;
  studentName: string;
  parentName: string;
  activityLabel: string;
  discountType: SchoolDiscountType;
  discountValue: number;
  validFrom: string;
  validUntil: string;
  note?: string | null;
  pdfUrl?: string | null;
};

type Props = { previewFixture?: AgreementPreview };

export default function SchoolDiscountAccept({ previewFixture }: Props = {}) {
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const [preview, setPreview] = useState<AgreementPreview | null>(previewFixture || null);
  const [loading, setLoading] = useState(!previewFixture);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (previewFixture) return;
    if (!token) {
      setError('Patvirtinimo nuoroda neteisinga.');
      setLoading(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(`/api/school-discount-accept?token=${encodeURIComponent(token)}`);
        const json = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(json.error || 'Nepavyko įkelti nuolaidos pasiūlymo.');
        if (!cancelled) setPreview(json as AgreementPreview);
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : 'Nepavyko įkelti nuolaidos pasiūlymo.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [previewFixture, token]);

  const discountDescription = preview
    ? schoolDiscountTermsLabel(preview.discountType, preview.discountValue)
    : '';

  const accept = async () => {
    if (previewFixture) {
      setPreview({ ...previewFixture, status: 'accepted', alreadyAccepted: true, acceptedAt: new Date().toISOString() });
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const response = await fetch('/api/school-discount-accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json.error || 'Nepavyko patvirtinti nuolaidos.');
      setPreview(json as AgreementPreview);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Nepavyko patvirtinti nuolaidos.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <main className="grid min-h-screen place-items-center bg-slate-50 px-4">
        <div className="flex items-center gap-3 text-slate-600"><Loader2 className="h-5 w-5 animate-spin" /> Kraunama...</div>
      </main>
    );
  }

  if (!preview) {
    return (
      <main className="grid min-h-screen place-items-center bg-slate-50 px-4">
        <div className="w-full max-w-lg rounded-2xl border border-red-200 bg-white p-8 text-center shadow-sm">
          <h1 className="text-xl font-bold text-slate-900">Nuolaidos patvirtinti nepavyko</h1>
          <p className="mt-3 text-sm text-red-700">{error}</p>
        </div>
      </main>
    );
  }

  const accepted = preview.alreadyAccepted || preview.status === 'accepted';
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10 sm:py-16">
      <div className="mx-auto w-full max-w-2xl overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-xl shadow-slate-200/50">
        <header className="border-b border-slate-200 px-6 py-6 text-center sm:px-10">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-emerald-50 text-emerald-700">
            {accepted ? <CheckCircle2 className="h-7 w-7" /> : <ShieldCheck className="h-7 w-7" />}
          </div>
          <p className="mt-3 text-sm font-semibold text-emerald-700">{preview.schoolName}</p>
          <h1 className="mt-1 text-2xl font-bold text-slate-950">
            {accepted ? 'Nuolaida patvirtinta' : 'Jums suteikta nuolaida'}
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            {accepted
              ? 'Jums nieko daugiau daryti nereikia. Sutarties priedas suformuotas automatiškai.'
              : 'Peržiūrėkite informaciją. Nuolaida įsigalios paspaudus „Sutinku“.'}
          </p>
        </header>

        <div className="space-y-5 px-6 py-7 sm:px-10">
          <dl className="divide-y divide-slate-200 rounded-2xl border border-slate-200 text-sm">
            {[
              ['Mokinys', preview.studentName],
              ['Užsiėmimai', preview.activityLabel],
              ['Nuolaida', discountDescription],
              ['Galiojimas', `${preview.validFrom} - ${preview.validUntil}`],
              ['Metinė sutartis', `Nr. ${preview.contractNumber}`],
              ['Priedas', preview.agreementNumber],
            ].map(([label, value]) => (
              <div key={label} className="grid gap-1 px-4 py-3 sm:grid-cols-[150px_1fr]">
                <dt className="text-slate-500">{label}</dt>
                <dd className="font-semibold text-slate-900">{value}</dd>
              </div>
            ))}
          </dl>

          {preview.note && (
            <div className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-700">
              <span className="font-semibold">Pastaba:</span> {preview.note}
            </div>
          )}
          {error && <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

          {accepted ? (
            <div className="flex flex-col items-center gap-3 pt-2 text-center">
              {preview.pdfUrl && (
                <Button asChild variant="outline" className="gap-2">
                  <a href={preview.pdfUrl} target="_blank" rel="noreferrer"><Download className="h-4 w-4" /> Atsisiųsti sutarties priedą</a>
                </Button>
              )}
              <p className="text-xs text-slate-500">Patvirtintas priedas išsaugotas prie mokinio metinės sutarties.</p>
            </div>
          ) : (
            <div className="space-y-3 pt-2 text-center">
              <Button className="w-full bg-emerald-700 py-6 text-base hover:bg-emerald-800" disabled={submitting} onClick={() => void accept()}>
                {submitting ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : null}
                Sutinku
              </Button>
              <p className="text-xs leading-relaxed text-slate-500">
                Paspausdami „Sutinku“ patvirtinate aukščiau nurodytas nuolaidos sąlygas ir sutinkate, kad būtų suformuotas priedas prie metinės sutarties.
              </p>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
