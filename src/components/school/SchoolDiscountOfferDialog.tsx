import { useEffect, useState } from 'react';
import { BadgePercent, ExternalLink, Loader2, MailCheck } from 'lucide-react';
import { authHeaders } from '@/lib/apiHelpers';
import { Button } from '@/components/ui/button';
import { DateInput } from '@/components/ui/date-input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import type { SchoolMonthlyInvoiceStudentOption } from './SchoolMonthlyInvoiceDialog';

type ActivityOption = { subjectId: string; tutorId: string | null; label: string };
type AgreementHistory = {
  id: string;
  agreementNumber: string;
  activityLabel: string;
  discountType: 'percent' | 'amount';
  discountValue: number;
  validFrom: string;
  validUntil: string;
  status: 'pending' | 'accepted' | 'cancelled' | 'expired';
  pdfUrl?: string | null;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string;
  students: SchoolMonthlyInvoiceStudentOption[];
  onSaved: (message: string, type: 'success' | 'error') => void;
};

function ymd(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function academicYearEnd(date = new Date()): string {
  const endYear = date.getMonth() + 1 >= 7 ? date.getFullYear() + 1 : date.getFullYear();
  return `${endYear}-06-30`;
}

function optionKey(option: ActivityOption): string {
  return `${option.subjectId}:${option.tutorId || ''}`;
}

export default function SchoolDiscountOfferDialog({
  open,
  onOpenChange,
  organizationId,
  students,
  onSaved,
}: Props) {
  const [studentId, setStudentId] = useState(students[0]?.id || '');
  const [activities, setActivities] = useState<ActivityOption[]>([]);
  const [agreements, setAgreements] = useState<AgreementHistory[]>([]);
  const [activityKey, setActivityKey] = useState('');
  const [discountType, setDiscountType] = useState<'percent' | 'amount'>('percent');
  const [discountValue, setDiscountValue] = useState('');
  const [validFrom, setValidFrom] = useState(() => ymd(new Date()));
  const [validUntil, setValidUntil] = useState(() => academicYearEnd());
  const [note, setNote] = useState('');
  const [optionsLoading, setOptionsLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const selectedActivity = activities.find((option) => optionKey(option) === activityKey);
  const selectedStudent = students.find((student) => student.id === studentId);

  useEffect(() => {
    if (!open || !studentId) return;
    let cancelled = false;
    setOptionsLoading(true);
    setError('');
    void (async () => {
      try {
        const response = await fetch('/api/school-discount-offer', {
          method: 'POST',
          headers: await authHeaders(),
          body: JSON.stringify({ action: 'options', organizationId, studentId }),
        });
        const json = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(json.error || 'Nepavyko gauti mokinio užsiėmimų.');
        if (cancelled) return;
        const next = (json.activities || []) as ActivityOption[];
        setActivities(next);
        setAgreements((json.agreements || []) as AgreementHistory[]);
        setActivityKey(next[0] ? optionKey(next[0]) : '');
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : 'Nepavyko gauti mokinio užsiėmimų.');
      } finally {
        if (!cancelled) setOptionsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, organizationId, studentId]);

  useEffect(() => {
    if (open) setStudentId((current) => current || students[0]?.id || '');
  }, [open, students]);

  const submit = async () => {
    if (!selectedActivity || !discountValue) return;
    setSaving(true);
    setError('');
    try {
      const response = await fetch('/api/school-discount-offer', {
        method: 'POST',
        headers: await authHeaders(),
        body: JSON.stringify({
          action: 'create',
          organizationId,
          studentId,
          subjectId: selectedActivity.subjectId,
          tutorId: selectedActivity.tutorId,
          discountType,
          discountValue: Number(discountValue),
          validFrom,
          validUntil,
          note,
        }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json.error || 'Nepavyko išsiųsti nuolaidos pasiūlymo.');
      onSaved(
        json.emailSent
          ? `Nuolaidos pasiūlymas ${json.agreementNumber} išsiųstas ${json.emailTo}. Nuolaida įsigalios tėvams patvirtinus.`
          : `Pasiūlymas ${json.agreementNumber} išsaugotas, bet laiško išsiųsti nepavyko.`,
        json.emailSent ? 'success' : 'error',
      );
      onOpenChange(false);
      setDiscountValue('');
      setNote('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Nepavyko išsiųsti nuolaidos pasiūlymo.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto rounded-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <BadgePercent className="h-5 w-5 text-emerald-700" /> Taikyti nuolaidą
          </DialogTitle>
          <p className="text-sm text-slate-500">Tėvams bus išsiųstas patvirtinimo laiškas. Nuolaida sąskaitoms bus taikoma tik paspaudus „Sutinku“.</p>
        </DialogHeader>

        <div className="grid gap-4 py-3 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label>Mokinys</Label>
            <Select value={studentId} onValueChange={setStudentId}>
              <SelectTrigger><SelectValue placeholder="Pasirinkite mokinį" /></SelectTrigger>
              <SelectContent>{students.map((student) => <SelectItem key={student.id} value={student.id}>{student.fullName}</SelectItem>)}</SelectContent>
            </Select>
            {selectedStudent?.payerEmail && <p className="text-xs text-slate-500">Laiškas bus siunčiamas: {selectedStudent.payerEmail}</p>}
          </div>

          <div className="space-y-2 sm:col-span-2">
            <Label>Užsiėmimai</Label>
            <Select value={activityKey} onValueChange={setActivityKey} disabled={optionsLoading}>
              <SelectTrigger><SelectValue placeholder={optionsLoading ? 'Kraunami užsiėmimai...' : 'Pasirinkite užsiėmimą'} /></SelectTrigger>
              <SelectContent>{activities.map((activity) => <SelectItem key={optionKey(activity)} value={optionKey(activity)}>{activity.label}</SelectItem>)}</SelectContent>
            </Select>
            {!optionsLoading && !activities.length && <p className="text-xs text-amber-700">Mokiniui nerasta priskirtų užsiėmimų.</p>}
          </div>

          <div className="space-y-2">
            <Label>Nuolaidos tipas</Label>
            <Select value={discountType} onValueChange={(value) => setDiscountType(value as 'percent' | 'amount')}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="percent">Procentai (%)</SelectItem>
                <SelectItem value="amount">Suma (€)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>{discountType === 'percent' ? 'Nuolaida, %' : 'Nuolaida nuo mėnesio sumos, €'}</Label>
            <Input type="number" min="0.01" max={discountType === 'percent' ? 100 : undefined} step="0.01" value={discountValue} onChange={(event) => setDiscountValue(event.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Galioja nuo</Label>
            <DateInput value={validFrom} onChange={(event) => setValidFrom(event.target.value)} />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Label>Galioja iki</Label>
              <button type="button" className="text-xs font-semibold text-emerald-700 hover:underline" onClick={() => setValidUntil(academicYearEnd(new Date(`${validFrom}T12:00:00`)))}>Iki mokslo metų pabaigos</button>
            </div>
            <DateInput value={validUntil} min={validFrom} onChange={(event) => setValidUntil(event.target.value)} />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label>Pastaba (nebūtina)</Label>
            <Textarea value={note} maxLength={500} onChange={(event) => setNote(event.target.value)} placeholder="Pvz., socialinė nuolaida 2026-2027 m. m." />
          </div>
        </div>

        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-950">
          <div className="flex items-start gap-2">
            <MailCheck className="mt-0.5 h-4 w-4 shrink-0" />
            <p>Paspaudus „Išsaugoti ir siųsti“ nuolaida dar nebus aktyvi. Tėvams patvirtinus, sistema automatiškai sukurs priedą prie pasirašytos metinės sutarties.</p>
          </div>
        </div>
        {!!agreements.length && (
          <section className="space-y-2 rounded-xl border border-slate-200 p-4">
            <h3 className="text-sm font-semibold text-slate-900">Mokinio nuolaidų priedai</h3>
            <div className="divide-y divide-slate-100">
              {agreements.map((agreement) => {
                const status = agreement.status === 'accepted'
                  ? 'Patvirtinta'
                  : agreement.status === 'pending'
                    ? 'Laukia tėvų'
                    : agreement.status === 'expired'
                      ? 'Nebegalioja'
                      : 'Atšaukta';
                const value = agreement.discountType === 'percent'
                  ? `${agreement.discountValue.toLocaleString('lt-LT')} %`
                  : `${agreement.discountValue.toLocaleString('lt-LT')} €`;
                return (
                  <div key={agreement.id} className="flex flex-col gap-2 py-3 text-sm first:pt-1 last:pb-1 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="font-semibold text-slate-900">{value} · {agreement.activityLabel}</p>
                      <p className="mt-0.5 text-xs text-slate-500">{agreement.agreementNumber} · {agreement.validFrom} - {agreement.validUntil} · {status}</p>
                    </div>
                    {agreement.pdfUrl && (
                      <a className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 hover:underline" href={agreement.pdfUrl} target="_blank" rel="noreferrer">
                        <ExternalLink className="h-3.5 w-3.5" /> Atidaryti priedą
                      </a>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        )}
        {error && <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

        <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-end">
          <Button variant="outline" disabled={saving} onClick={() => onOpenChange(false)}>Atšaukti</Button>
          <Button className="gap-2 bg-emerald-700 hover:bg-emerald-800" disabled={saving || optionsLoading || !studentId || !selectedActivity || !discountValue || !validFrom || !validUntil} onClick={() => void submit()}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <MailCheck className="h-4 w-4" />}
            Išsaugoti ir siųsti
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
