import { useCallback, useEffect, useRef, useState } from 'react';
import { authHeaders } from '@/lib/apiHelpers';
import { useTranslation } from '@/lib/i18n';
import { schoolOverpaymentRemaining, type SchoolInvoiceOverpayment } from '@/lib/schoolInvoiceOverpayments';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

type PaidInvoice = { id: string; invoice_number: string; paidCashEur: number; student?: { full_name?: string; payer_email?: string } };
type Credit = SchoolInvoiceOverpayment & { studentName: string };
const money = (value: number) => `${value.toFixed(2).replace('.', ',')} €`;

export default function SchoolInvoiceOverpaymentsDialog({ open, onOpenChange, organizationId, onChanged }: {
  open: boolean; onOpenChange: (open: boolean) => void; organizationId: string; onChanged?: () => void;
}) {
  const { t } = useTranslation();
  const [data, setData] = useState<{ credits: Credit[]; invoices: PaidInvoice[]; canEdit: boolean } | null>(null);
  const [invoiceId, setInvoiceId] = useState('');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [voidId, setVoidId] = useState('');
  const [voidReason, setVoidReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const requestId = useRef('');
  const source = data?.invoices.find((invoice) => invoice.id === invoiceId);
  const numericAmount = Number(amount.replace(',', '.'));

  const request = useCallback(async (body: Record<string, unknown>, signal?: AbortSignal) => {
    const response = await fetch('/api/school-invoice-overpayments', {
      method: 'POST', headers: await authHeaders(), body: JSON.stringify({ ...body, organizationId }), signal,
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || t('common.error'));
    return result;
  }, [organizationId, t]);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setBusy(true); setError(''); setData(null); setInvoiceId(''); setAmount(''); setReason(''); setVoidId('');
    requestId.current = crypto.randomUUID();
    request({ action: 'list' }, controller.signal).then((result) => setData(result)).catch((cause) => {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : t('common.error'));
    }).finally(() => { if (!controller.signal.aborted) setBusy(false); });
    return () => controller.abort();
  }, [open, request, t]);

  const save = async (action: 'register' | 'void') => {
    setBusy(true); setError('');
    try {
      await request(action === 'register'
        ? { action, invoiceId, amountEur: numericAmount, reason, requestId: requestId.current }
        : { action, overpaymentId: voidId, reason: voidReason });
      onChanged?.();
      setInvoiceId(''); setAmount(''); setReason(''); setVoidId(''); setVoidReason('');
      requestId.current = crypto.randomUUID();
      setData(await request({ action: 'list' }));
    } catch (cause) { setError(cause instanceof Error ? cause.message : t('common.error')); }
    finally { setBusy(false); }
  };

  return <Dialog open={open} onOpenChange={(next) => { if (!busy) onOpenChange(next); }}>
    <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>{t('school.invoice.credit.title')}</DialogTitle>
      </DialogHeader>
      {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {busy && <p role="status" className="text-sm text-slate-600">{t('common.loading')}</p>}
      {data?.canEdit && !data.invoices.length && !busy && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {t('school.invoice.credit.noPaidInvoices')}
        </p>
      )}
      {data?.canEdit && data.invoices.length > 0 && <form className="space-y-3 rounded-xl border bg-slate-50 p-4" onSubmit={(event) => { event.preventDefault(); void save('register'); }}>
        <Label htmlFor="overpayment-source">{t('school.invoice.credit.source')}</Label>
        <select id="overpayment-source" className="w-full rounded-md border bg-white p-2 text-sm" value={invoiceId} disabled={busy}
          required onChange={(event) => { setInvoiceId(event.target.value); requestId.current = crypto.randomUUID(); }}>
          <option value="">{t('school.invoice.credit.sourcePlaceholder')}</option>
          {data.invoices.map((invoice) => <option key={invoice.id} value={invoice.id}>
            {invoice.invoice_number || invoice.id} · {invoice.student?.full_name} · {money(invoice.paidCashEur)}
          </option>)}
        </select>
        <Label htmlFor="overpayment-amount">{t('school.invoice.credit.amount')}</Label>
        <Input id="overpayment-amount" inputMode="decimal" value={amount} disabled={busy} required
          onChange={(event) => { setAmount(event.target.value); requestId.current = crypto.randomUUID(); }} />
        <Label htmlFor="overpayment-reason">{t('school.invoice.credit.reason')}</Label>
        <Textarea id="overpayment-reason" value={reason} minLength={3} maxLength={1000} disabled={busy} required
          onChange={(event) => { setReason(event.target.value); requestId.current = crypto.randomUUID(); }} />
        <Button type="submit" disabled={busy || !source || !Number.isFinite(numericAmount) || numericAmount <= 0
          || Math.abs(numericAmount * 100 - Math.round(numericAmount * 100)) > 1e-7
          || numericAmount > (source?.paidCashEur || 0) || reason.trim().length < 3}>{t('school.invoice.credit.save')}</Button>
      </form>}
      {data?.canEdit && data.invoices.length > 0 && !source && amount && reason.trim().length >= 3 && (
        <p className="text-sm text-amber-700">{t('school.invoice.credit.pickInvoice')}</p>
      )}
      <h3 className="font-semibold">{t('school.invoice.credit.history')}</h3>
      {data && !data.credits.length && <p className="text-sm text-slate-500">{t('school.invoice.credit.empty')}</p>}
      {data?.credits.map((credit) => {
        const remaining = schoolOverpaymentRemaining(credit);
        const used = credit.voided_at ? 0 : Number(credit.amount_eur) - remaining;
        return <article key={credit.id} className="space-y-2 rounded-xl border p-4 text-sm">
          <div className="flex justify-between gap-2"><strong>{credit.source?.invoice_number || credit.source_invoice_id} · {credit.studentName}</strong><span>{money(Number(credit.amount_eur))}</span></div>
          <p className="text-slate-500">{credit.payer_email} · {new Date(credit.created_at).toLocaleDateString()}</p>
          <p className="whitespace-pre-wrap break-words">{credit.reason}</p>
          <p>{t('school.invoice.credit.used')}: {money(used)} · {t('school.invoice.credit.remaining')}: {money(remaining)}</p>
          {(credit.uses || []).map((use, index) => <p key={`${use.invoice_id}-${index}`} className="text-slate-600">
            {use.invoice?.invoice_number || use.invoice_id}: {money(Number(use.amount_eur))}{use.released_at ? ` · ${t('school.invoice.credit.released')}` : ''}
          </p>)}
          {credit.voided_at ? <p className="text-slate-500">{t('school.invoice.credit.voided')}: {credit.void_reason}</p>
            : data.canEdit && used === 0 && <Button type="button" variant="outline" size="sm" disabled={busy}
              onClick={() => { setVoidId(credit.id); setVoidReason(''); }}>{t('school.invoice.credit.void')}</Button>}
          {voidId === credit.id && <div className="space-y-2">
            <Label htmlFor="overpayment-void-reason">{t('school.invoice.credit.voidReason')}</Label>
            <Textarea id="overpayment-void-reason" value={voidReason} maxLength={1000} disabled={busy} onChange={(event) => setVoidReason(event.target.value)} />
            <div className="flex gap-2"><Button type="button" variant="outline" disabled={busy} onClick={() => setVoidId('')}>{t('common.cancel')}</Button>
              <Button type="button" disabled={busy || voidReason.trim().length < 3} onClick={() => void save('void')}>{t('school.invoice.credit.void')}</Button></div>
          </div>}
        </article>;
      })}
    </DialogContent>
  </Dialog>;
}
