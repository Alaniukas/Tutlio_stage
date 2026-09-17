import { useEffect, useState } from 'react';
import { addDays, endOfMonth, format, subMonths } from 'date-fns';
import { Check, ExternalLink, FileCheck2, FileText, Loader2, Send, ShieldCheck } from 'lucide-react';
import { authHeaders } from '@/lib/apiHelpers';
import { Button } from '@/components/ui/button';
import { DateInput } from '@/components/ui/date-input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { MonthFilterInput } from '@/components/ui/month-filter-input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export type SchoolMonthlyInvoiceStudentOption = {
  id: string;
  fullName: string;
  payerEmail?: string | null;
};

export type SchoolMonthlyInvoicePreviewLine = {
  description: string;
  subjectId: string;
  tutorId: string;
  quantity: number;
  unitPriceEur: number;
  originalAmountEur: number;
  discountType?: 'percent' | 'amount' | null;
  discountValue?: number | null;
  discountAmountEur: number;
  amountEur: number;
};

export type SchoolMonthlyInvoicePreview = {
  previewToken: string;
  pdfBase64?: string;
  student: { id: string; fullName: string; grade?: string | null };
  periodLabel: string;
  dueDate: string;
  lines: SchoolMonthlyInvoicePreviewLine[];
  subtotalEur: number;
  discountAmountEur: number;
  totalEur: number;
  reviewSessionIds?: string[];
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string;
  students: SchoolMonthlyInvoiceStudentOption[];
  onSent?: (message: string) => void;
  previewFixture?: SchoolMonthlyInvoicePreview;
};

function monthRange(month: string): { start: string; end: string } {
  const [year, monthNumber] = month.split('-').map(Number);
  const start = new Date(year, monthNumber - 1, 1);
  return { start: format(start, 'yyyy-MM-dd'), end: format(endOfMonth(start), 'yyyy-MM-dd') };
}

const money = (value: number) => `${Number(value || 0).toFixed(2).replace('.', ',')} €`;

function discountText(line: SchoolMonthlyInvoicePreviewLine): string {
  if (!line.discountAmountEur) return '-';
  if (line.discountType === 'percent') return `${Number(line.discountValue || 0).toLocaleString('lt-LT')} % (-${money(line.discountAmountEur)})`;
  return `-${money(line.discountAmountEur)}`;
}

export function SchoolMonthlyInvoicePreviewCard({ preview }: { preview: SchoolMonthlyInvoicePreview }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 bg-slate-50 px-5 py-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-700">VšĮ „Laisvi vaikai“</p>
          <h3 className="mt-1 text-base font-bold text-slate-900">Sąskaitos peržiūra</h3>
          <p className="mt-0.5 text-xs text-slate-500">{preview.periodLabel} · {preview.student.fullName}{preview.student.grade ? ` · ${preview.student.grade} klasė` : ''}</p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">
          <FileCheck2 className="h-3.5 w-3.5" /> Dar neišsiųsta
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-[780px] w-full border-collapse text-left text-xs">
          <thead>
            <tr className="border-b border-slate-200 bg-white text-[11px] uppercase tracking-wide text-slate-500">
              <th className="px-4 py-3 font-semibold">Mokinys</th>
              <th className="px-4 py-3 font-semibold">Užsiėmimas</th>
              <th className="px-3 py-3 text-center font-semibold">Pamokų sk.</th>
              <th className="px-3 py-3 text-right font-semibold">Kaina</th>
              <th className="px-3 py-3 text-right font-semibold">Suma</th>
              <th className="px-3 py-3 text-right font-semibold">Nuolaida</th>
              <th className="px-4 py-3 text-right font-semibold">Mokėti</th>
            </tr>
          </thead>
          <tbody>
            {preview.lines.map((line, index) => (
              <tr key={`${line.subjectId}-${line.tutorId}-${index}`} className="border-b border-slate-100 last:border-b-0">
                <td className="px-4 py-3 font-medium text-slate-900">{preview.student.fullName}</td>
                <td className="px-4 py-3 text-slate-700">{line.description}</td>
                <td className="px-3 py-3 text-center text-slate-700">{line.quantity}</td>
                <td className="px-3 py-3 text-right text-slate-700">{money(line.unitPriceEur)}</td>
                <td className="px-3 py-3 text-right text-slate-700">{money(line.originalAmountEur)}</td>
                <td className="px-3 py-3 text-right font-medium text-emerald-700">{discountText(line)}</td>
                <td className="px-4 py-3 text-right font-bold text-slate-900">{money(line.amountEur)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="border-t border-slate-200 bg-slate-50 px-5 py-4">
        <div className="ml-auto grid max-w-sm grid-cols-[1fr_auto] gap-x-8 gap-y-2 text-sm">
          <span className="text-slate-500">Pradinė suma</span>
          <span className="text-right font-medium text-slate-800">{money(preview.subtotalEur)}</span>
          <span className="text-slate-500">Nuolaida</span>
          <span className="text-right font-semibold text-emerald-700">-{money(preview.discountAmountEur)}</span>
          <span className="border-t border-slate-300 pt-2 font-bold text-slate-900">Mokėti</span>
          <span className="border-t border-slate-300 pt-2 text-right text-lg font-bold text-slate-900">{money(preview.totalEur)}</span>
        </div>
        <p className="mt-3 text-right text-xs text-slate-500">Apmokėti iki {preview.dueDate}</p>
      </div>
    </div>
  );
}

export default function SchoolMonthlyInvoiceDialog({
  open,
  onOpenChange,
  organizationId,
  students,
  onSent,
  previewFixture,
}: Props) {
  const defaultMonth = format(subMonths(new Date(), 1), 'yyyy-MM');
  const defaultStudent = students[0]?.id || '';
  const [studentId, setStudentId] = useState(defaultStudent);
  const [month, setMonth] = useState(defaultMonth);
  const [dueDate, setDueDate] = useState(format(addDays(new Date(), 7), 'yyyy-MM-dd'));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState<SchoolMonthlyInvoicePreview | null>(previewFixture || null);
  const [pdfUrl, setPdfUrl] = useState('');

  const payload = (action: 'preview' | 'send') => {
    const range = monthRange(month);
    return {
      action,
      organizationId,
      studentId,
      periodStart: range.start,
      periodEnd: range.end,
      dueDate,
      previewToken: preview?.previewToken,
    };
  };

  useEffect(() => {
    if (!preview?.pdfBase64) {
      setPdfUrl('');
      return;
    }
    const bytes = Uint8Array.from(atob(preview.pdfBase64), (char) => char.charCodeAt(0));
    const nextUrl = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
    setPdfUrl(nextUrl);
    return () => URL.revokeObjectURL(nextUrl);
  }, [preview?.pdfBase64]);

  useEffect(() => {
    if (!open || previewFixture) return;
    setStudentId((current) => current || defaultStudent);
  }, [open, previewFixture, defaultStudent]);

  const requestPreview = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/school-monthly-invoice-admin', {
        method: 'POST', headers: await authHeaders(), body: JSON.stringify(payload('preview')),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json.error || 'Nepavyko suformuoti peržiūros.');
      setPreview(json as SchoolMonthlyInvoicePreview);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Nepavyko suformuoti peržiūros.');
    } finally {
      setLoading(false);
    }
  };

  const sendInvoice = async () => {
    if (previewFixture) {
      onSent?.('Peržiūros režime sąskaita nesiunčiama.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/school-monthly-invoice-admin', {
        method: 'POST', headers: await authHeaders(), body: JSON.stringify(payload('send')),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json.error || 'Nepavyko išsiųsti sąskaitos.');
      onSent?.(json.emailSent
        ? `Sąskaita ${json.invoiceNumber} suformuota ir išsiųsta.`
        : `Sąskaita ${json.invoiceNumber} suformuota. Siuntimas bus pakartotas automatiškai.`);
      onOpenChange(false);
      setPreview(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Nepavyko išsiųsti sąskaitos.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[94vh] w-[96vw] max-w-6xl overflow-y-auto rounded-2xl p-0">
        <DialogHeader className="border-b border-slate-200 px-6 py-5">
          <DialogTitle className="flex items-center gap-2 text-xl">
            <FileText className="h-5 w-5 text-emerald-700" />
            Formuoti mėnesinę sąskaitą
          </DialogTitle>
          <p className="text-sm text-slate-500">Pirmiausia patikrinkite sumas ir PDF. Sąskaita siunčiama tik paspaudus „Išsiųsti sąskaitą“.</p>
        </DialogHeader>

        {preview ? (
          <div className="space-y-5 p-6">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 rounded-full bg-emerald-600 p-1 text-white"><Check className="h-3.5 w-3.5" /></span>
                <div>
                  <p className="text-sm font-semibold text-emerald-950">Peržiūra paruošta</p>
                  <p className="text-xs text-emerald-800">Dar niekas neišsiųsta. Patikrinkite pradinę sumą, nuolaidą ir mokėtiną sumą.</p>
                </div>
              </div>
              {pdfUrl && (
                <Button type="button" variant="outline" className="gap-2 border-emerald-300 bg-white" onClick={() => window.open(pdfUrl, '_blank', 'noopener,noreferrer')}>
                  <ExternalLink className="h-4 w-4" /> Atidaryti PDF
                </Button>
              )}
            </div>

            <SchoolMonthlyInvoicePreviewCard preview={preview} />
            {!!preview.reviewSessionIds?.length && (
              <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                {preview.reviewSessionIds.length} užsiėm. neįtraukti, nes dar nėra patvirtinto įvykimo arba apmokėjimo statuso.
              </p>
            )}
            {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" disabled={loading || !!previewFixture} onClick={() => setPreview(null)}>Grįžti redaguoti</Button>
              <Button type="button" className="gap-2 bg-emerald-700 hover:bg-emerald-800" disabled={loading} onClick={() => void sendInvoice()}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Išsiųsti sąskaitą
              </Button>
            </div>
          </div>
        ) : (
          <div className="grid gap-6 p-6 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.72fr)]">
            <div className="space-y-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Mokinys</Label>
                  <Select value={studentId} onValueChange={(value) => { setStudentId(value); setPreview(null); }}>
                    <SelectTrigger><SelectValue placeholder="Pasirinkite mokinį" /></SelectTrigger>
                    <SelectContent>{students.map((student) => <SelectItem key={student.id} value={student.id}>{student.fullName}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Sąskaitos mėnuo</Label>
                  <MonthFilterInput value={month} onChange={(value) => {
                    setMonth(value);
                    setPreview(null);
                  }} />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label>Apmokėti iki</Label>
                  <DateInput value={dueDate} onChange={(event) => setDueDate(event.target.value)} className="max-w-xs rounded-xl" />
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-start gap-3">
                  <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" />
                  <div>
                    <p className="text-sm font-semibold text-slate-900">Patvirtintos nuolaidos pritaikomos automatiškai</p>
                    <p className="mt-1 text-xs leading-5 text-slate-600">
                      Naują procentinę arba konkrečios sumos nuolaidą suteikite Mokėjimų lange pasirinkę „Taikyti nuolaidą“.
                      Ji sąskaitose bus skaičiuojama tik tada, kai mokėtojas el. laiške paspaus „Sutinku“.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <aside className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-5">
              <p className="text-sm font-semibold text-emerald-950">Kas bus rodoma sąskaitoje</p>
              <ul className="mt-3 space-y-2 text-sm text-emerald-900">
                <li className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0" /> Kiekvieno užsiėmimo pradinė kaina ir suma.</li>
                <li className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0" /> Atskira nuolaidos reikšmė bei galutinė suma „Mokėti“.</li>
                <li className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0" /> PDF pagal „Laisvi vaikai“ PAM sąskaitos struktūrą.</li>
                <li className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0" /> Sąskaita neišsiunčiama, kol nepatvirtinate peržiūros.</li>
              </ul>
            </aside>

            <div className="lg:col-span-2">
              {error && <p role="alert" className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
              <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>Atšaukti</Button>
                <Button type="button" className="gap-2 bg-emerald-700 hover:bg-emerald-800" onClick={() => void requestPreview()} disabled={loading || !studentId || !month}>
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                  Formuoti peržiūrai
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
