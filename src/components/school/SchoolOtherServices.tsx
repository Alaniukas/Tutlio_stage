import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { format } from 'date-fns';
import { FileText, Loader2, Plus } from 'lucide-react';
import { authHeaders } from '@/lib/apiHelpers';
import { useTranslation } from '@/lib/i18n';
import { LOCALE_FORMAT_TAGS } from '@/lib/i18n/locales';
import { parseServiceChargeInput, validServicePrice, type SchoolServiceCharge, type SchoolServiceTemplate } from '@/lib/schoolServiceCharges';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DateInput } from '@/components/ui/date-input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import SchoolMonthlyInvoiceDialog from './SchoolMonthlyInvoiceDialog';

type Props = { organizationId: string; student?: { id: string; fullName: string; payerEmail?: string | null } };
type Data = { templates: SchoolServiceTemplate[]; charges: SchoolServiceCharge[]; canEdit: boolean };
type Editor = { id: string; version?: number; templateId: string; description: string; price: string;
  quantity: string; date: string; month: string; note: string };

async function requestServices(studentId: string | undefined, body?: Record<string, unknown>, signal?: AbortSignal): Promise<Data> {
  const response = await fetch('/api/school-service-charges' + (!body && studentId ? `?studentId=${encodeURIComponent(studentId)}` : ''), {
    method: body ? 'POST' : 'GET', headers: await authHeaders(), body: body ? JSON.stringify({ ...body, studentId }) : undefined, signal,
  });
  const json = await response.json();
  if (!response.ok) throw new Error(json.errorKey || 'school.services.error');
  return json;
}

/** The same service catalog and editor are used in settings and student cards. */
export default function SchoolOtherServices({ organizationId, student }: Props) {
  const { t, locale } = useTranslation();
  const fieldId = useId();
  const studentId = student?.id;
  const scope = `${organizationId}:${studentId || 'catalog'}`;
  const currentScope = useRef(scope);
  currentScope.current = scope;
  const controller = useRef<AbortController | null>(null);
  const busy = useRef<string | null>(null);
  const mounted = useRef(false);
  const [data, setData] = useState<(Data & { scope: string }) | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [invoiceMonth, setInvoiceMonth] = useState<string | null>(null);
  const current = data?.scope === scope ? data : null;
  const money = (value: number) => new Intl.NumberFormat(LOCALE_FORMAT_TAGS[locale], { style: 'currency', currency: 'EUR' }).format(value);

  const reload = useCallback(async () => {
    controller.current?.abort();
    const next = new AbortController();
    controller.current = next;
    setLoading(true);
    try {
      const result = await requestServices(studentId, undefined, next.signal);
      if (!next.signal.aborted && currentScope.current === scope) setData({ ...result, scope });
    } catch (cause) {
      if (!next.signal.aborted && currentScope.current === scope) setError(cause instanceof Error ? cause.message : 'school.services.error');
    } finally {
      if (!next.signal.aborted && currentScope.current === scope) setLoading(false);
    }
  }, [scope, studentId]);

  useEffect(() => {
    mounted.current = true;
    setData(null); setEditor(null); setError(''); setMessage(''); setInvoiceMonth(null); setSaving(false);
    void reload();
    return () => { mounted.current = false; controller.current?.abort(); };
  }, [reload]);

  const mutate = async (body: Record<string, unknown>) => {
    if (busy.current === scope) return;
    busy.current = scope; setSaving(true); setError(''); setMessage('');
    try {
      await requestServices(studentId, body);
      if (!mounted.current || currentScope.current !== scope) return;
      setEditor(null); setMessage('common.saved');
      await reload();
    } catch (cause) {
      if (mounted.current && currentScope.current === scope) setError(cause instanceof Error && cause.message.startsWith('school.services.') ? cause.message : 'school.services.error');
    } finally {
      if (busy.current === scope) busy.current = null;
      if (mounted.current && currentScope.current === scope) setSaving(false);
    }
  };
  const openEditor = (row?: SchoolServiceCharge | SchoolServiceTemplate) => {
    const charge = row && 'description' in row ? row : null;
    const template = row && 'name' in row ? row : null;
    const today = format(new Date(), 'yyyy-MM-dd');
    setError(''); setMessage('');
    setEditor({ id: row?.id || crypto.randomUUID(), version: row?.version, templateId: charge?.template_id || '',
      description: charge?.description || template?.name || '', price: row ? String(row.unit_price_eur) : '',
      quantity: String(charge?.quantity || 1), date: charge?.service_date || today,
      month: charge?.invoice_month.slice(0, 7) || today.slice(0, 7), note: charge?.internal_note || '' });
  };
  const patchEditor = (patch: Partial<Editor>) => setEditor(value => value ? { ...value, ...patch } : value);
  const save = () => {
    if (!editor) return;
    const chargeInput = { description: editor.description, unitPriceEur: Number(editor.price), quantity: Number(editor.quantity),
      serviceDate: editor.date, invoiceMonth: editor.month, internalNote: editor.note };
    try {
      if (student) parseServiceChargeInput(chargeInput);
      else if (!editor.description.trim() || editor.description.trim().length > 160 || !validServicePrice(editor.price)) throw new Error();
    } catch { setError('school.services.invalid'); return; }
    void mutate({ action: student ? 'save-charge' : 'save-template', id: editor.id, version: editor.version,
      ...chargeInput, name: editor.description, templateId: editor.templateId || null });
  };
  const pendingTotal = (current?.charges || []).filter(row => !row.invoice_id && !row.cancelled_at)
    .reduce((sum, row) => sum + Math.round(Number(row.unit_price_eur) * 100) * Number(row.quantity), 0) / 100;

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-4 sm:p-5" aria-label={t(student ? 'school.services.title' : 'school.services.templates')}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div><h3 className="text-sm font-semibold text-gray-900">{t(student ? 'school.services.title' : 'school.services.templates')}</h3>
          <p className="mt-1 max-w-xl text-xs text-gray-500">{t(student ? 'school.services.help' : 'school.services.templatesHelp')}</p></div>
        {current?.canEdit && <Button type="button" variant="outline" size="sm" disabled={saving || loading} onClick={() => openEditor()} className="gap-1.5">
          <Plus className="h-4 w-4" />{t(student ? 'school.services.add' : 'school.services.addTemplate')}
        </Button>}
      </div>
      {error && <div role="alert" className="mb-3 text-sm text-red-700">{t(error)} <Button type="button" variant="link" size="sm" disabled={saving || loading} onClick={() => { setError(''); void reload(); }}>{t('school.services.refresh')}</Button></div>}
      {message && <p role="status" className="mb-3 text-xs text-emerald-700">{t(message)}</p>}
      {editor && current?.canEdit && <div className="mb-4 space-y-3 rounded-xl border border-gray-200 bg-gray-50 p-4">
        {student && <div className="space-y-1">
          <Label htmlFor={`${fieldId}-template`}>{t('school.services.templates')}</Label>
          <select id={`${fieldId}-template`} className="h-10 w-full rounded-md border border-gray-300 bg-white px-3 text-sm" disabled={saving} value={editor.templateId} onChange={event => {
            const template = current.templates.find(row => row.id === event.target.value);
            patchEditor({ templateId: event.target.value, ...(template ? { description: template.name, price: String(template.unit_price_eur) } : {}) });
          }}><option value="">{t('school.services.custom')}</option>{current.templates.filter(row => row.is_active || row.id === editor.templateId).map(row => <option key={row.id} value={row.id}>{row.name}{row.is_active ? '' : ` · ${t('school.services.archived')}`}</option>)}</select>
        </div>}
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1 sm:col-span-2"><Label htmlFor={`${fieldId}-name`}>{t('school.services.name')}</Label><Input id={`${fieldId}-name`} disabled={saving} value={editor.description} maxLength={160} onChange={event => patchEditor({ description: event.target.value })} /></div>
          <div className="space-y-1"><Label htmlFor={`${fieldId}-price`}>{t('school.services.price')}</Label><Input id={`${fieldId}-price`} disabled={saving} type="number" min="0.01" max="9999" step="0.01" value={editor.price} onChange={event => patchEditor({ price: event.target.value })} /></div>
          {student && <>
            <div className="space-y-1"><Label htmlFor={`${fieldId}-quantity`}>{t('school.services.quantity')}</Label><Input id={`${fieldId}-quantity`} disabled={saving} type="number" min="1" max="100" step="1" value={editor.quantity} onChange={event => patchEditor({ quantity: event.target.value })} /></div>
            <div className="space-y-1"><Label htmlFor={`${fieldId}-date`}>{t('school.services.date')}</Label><DateInput id={`${fieldId}-date`} disabled={saving} value={editor.date} onChange={event => patchEditor({ date: event.target.value })} /></div>
            <div className="space-y-1"><Label htmlFor={`${fieldId}-month`}>{t('school.services.month')}</Label><Input id={`${fieldId}-month`} disabled={saving} type="month" value={editor.month} onChange={event => patchEditor({ month: event.target.value })} /></div>
            <div className="space-y-1 sm:col-span-2"><Label htmlFor={`${fieldId}-note`}>{t('school.services.note')}</Label><Textarea id={`${fieldId}-note`} disabled={saving} maxLength={1000} value={editor.note} onChange={event => patchEditor({ note: event.target.value })} /></div>
          </>}
        </div>
        <div className="flex flex-wrap justify-end gap-2"><Button type="button" variant="outline" disabled={saving} onClick={() => setEditor(null)}>{t('common.cancel')}</Button><Button type="button" disabled={saving} onClick={save}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{t('common.save')}</Button></div>
      </div>}
      {loading && <p role="status" className="py-3 text-sm text-gray-500">{t('common.loading')}</p>}
      {current && !loading && <div className="divide-y divide-gray-100">
        {student ? current.charges.map(row => {
          const locked = Boolean(row.invoice_id);
          const status = row.cancelled_at ? 'cancelled' : row.invoice_id ? row.invoice?.payment_status === 'paid' ? 'paid' : 'invoiced' : 'pending';
          return <div key={row.id} className="py-3">
            <div className="flex items-start justify-between gap-3"><div className="min-w-0">
              <p className={`break-words text-sm font-medium ${row.cancelled_at ? 'text-gray-400 line-through' : 'text-gray-900'}`}>{row.description}</p>
              <p className="mt-1 text-xs text-gray-500">{row.service_date} · {t('school.services.month')}: {row.invoice_month.slice(0, 7)} · {row.quantity} × {money(Number(row.unit_price_eur))}</p>
            </div><span className="shrink-0 text-sm font-semibold tabular-nums">{money(Math.round(Number(row.unit_price_eur) * 100) * row.quantity / 100)}</span></div>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2"><span className={`text-xs ${status === 'pending' || status === 'paid' ? 'text-emerald-700' : 'text-gray-500'}`}>{t(`school.services.${status}`, { number: row.invoice?.invoice_number || '–' })}</span>
              {current.canEdit && !locked && <div className="flex flex-wrap gap-3">
                {!row.cancelled_at && <Button type="button" variant="link" size="sm" className="h-auto p-0 text-xs" disabled={saving} onClick={() => openEditor(row)}>{t('common.edit')}</Button>}
                <Button type="button" variant="link" size="sm" className="h-auto p-0 text-xs" disabled={saving} onClick={() => void mutate({ action: row.cancelled_at ? 'restore-charge' : 'cancel-charge', id: row.id, version: row.version })}>{t(row.cancelled_at ? 'school.services.restore' : 'school.services.cancelCharge')}</Button>
              </div>}
            </div>
          </div>;
        }) : current.templates.map(row => <div key={row.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
          <div className="min-w-0"><p className="break-words font-medium">{row.name}{!row.is_active && <span className="ml-2 text-xs text-gray-500">{t('school.services.archived')}</span>}</p><p className="text-gray-500">{money(Number(row.unit_price_eur))}</p></div>
          {current.canEdit && row.is_active && <div className="flex flex-wrap gap-3"><Button type="button" variant="link" size="sm" disabled={saving} onClick={() => openEditor(row)}>{t('common.edit')}</Button><Button type="button" variant="link" size="sm" disabled={saving} onClick={() => void mutate({ action: 'archive-template', id: row.id, version: row.version })}>{t('school.services.archive')}</Button></div>}
        </div>)}
        {(student ? !current.charges.length : !current.templates.length) && <p className="py-3 text-sm text-gray-500">{t(student ? 'school.services.empty' : 'school.services.templatesEmpty')}</p>}
      </div>}
      {student && current && current.charges.length > 0 && <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 pt-4">
        <p className="text-xs text-gray-600">{t('school.services.pendingTotal', { amount: money(pendingTotal) })}</p>
        {pendingTotal > 0 && <Button type="button" variant="outline" size="sm" disabled={saving || loading} className="gap-2" onClick={() => setInvoiceMonth(current.charges.find(row => !row.invoice_id && !row.cancelled_at)?.invoice_month.slice(0, 7) || format(new Date(), 'yyyy-MM'))}><FileText className="h-4 w-4" />{t('school.services.preview')}</Button>}
      </div>}
      {student && invoiceMonth && <SchoolMonthlyInvoiceDialog key={`${scope}:${invoiceMonth}`} open includePayerFamily onOpenChange={open => { if (!open) { setInvoiceMonth(null); void reload(); } }} organizationId={organizationId} students={[student]} initialMonth={invoiceMonth} onSent={() => { setInvoiceMonth(null); void reload(); }} />}
    </section>
  );
}
