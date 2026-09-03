import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useUser } from '@/contexts/UserContext';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from '@/lib/i18n';
import { format } from 'date-fns';
import { Download, FileText, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import ParentLayout from '@/components/ParentLayout';
import { useMarketMoney } from '@/hooks/useMarketMoney';
import { authHeaders } from '@/lib/apiHelpers';
import { computeInvoiceDisplayForChild } from '@/lib/billingBatchStudentSlice';
import { fetchInvoiceIdsForSessionIds } from '@/lib/invoiceLineItemsForSessions';

interface Invoice {
  id: string;
  invoice_number: string;
  issue_date: string;
  total_amount: number;
  status: string;
  pdf_storage_path: string | null;
  display_amount?: number;
  lesson_count?: number;
  is_shared?: boolean;
  invoice_total_amount?: number;
}

export default function ParentInvoices() {
  const { user } = useUser();
  const { t } = useTranslation();
  const { fmt } = useMarketMoney();
  const [searchParams] = useSearchParams();
  const filterStudentId = searchParams.get('studentId')?.trim() || null;
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [pendingPackages, setPendingPackages] = useState<Array<{
    id: string;
    totalLessons: number;
    totalPrice: number | null;
    paymentMethod: string | null;
    studentName: string;
    subjects: string;
  }>>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    (async () => {
      setLoading(true);
      setLoadError(null);

      const { data: parentProfile, error: parentErr } = await supabase
        .rpc('get_parent_profile_id_by_user_id', { p_user_id: user.id });
      if (parentErr) {
        console.warn('[ParentInvoices] parent profile rpc failed:', parentErr);
        setLoadError(parentErr.message);
        setInvoices([]);
        setLoading(false);
        return;
      }

      if (!parentProfile) {
        setLoading(false);
        return;
      }

      const { data: links } = await supabase
        .from('parent_students')
        .select('student_id')
        .eq('parent_id', parentProfile);

      const allStudentIds = (links ?? []).map((l) => l.student_id);
      const studentIds =
        filterStudentId && allStudentIds.includes(filterStudentId) ? [filterStudentId] : allStudentIds;
      if (!studentIds.length) {
        setInvoices([]);
        setLoading(false);
        return;
      }

      // "Laukia apmokėjimo": unpaid packages of the linked children (pay via the stable link).
      const { data: pendingRows } = await supabase
        .from('lesson_packages')
        .select('id, total_lessons, total_price, payment_status, payment_method, paid, students!inner(full_name), lesson_package_items(subjects(name))')
        .in('student_id', studentIds)
        .eq('paid', false)
        .eq('payment_status', 'pending')
        .order('created_at', { ascending: false })
        .limit(20);
      setPendingPackages(
        ((pendingRows ?? []) as any[]).map((row) => ({
          id: row.id as string,
          totalLessons: Number(row.total_lessons) || 0,
          totalPrice: row.total_price == null ? null : Number(row.total_price),
          paymentMethod: (row.payment_method as string | null) ?? null,
          studentName: (Array.isArray(row.students) ? row.students[0]?.full_name : row.students?.full_name) || '',
          subjects: (Array.isArray(row.lesson_package_items) ? row.lesson_package_items : [])
            .map((it: any) => (Array.isArray(it.subjects) ? it.subjects[0]?.name : it.subjects?.name))
            .filter(Boolean)
            .join(', '),
        })),
      );

      /**
       * Jei filtro nėra — skaitome sąskaitas tiesiai (RLS `invoices_parent_select` meta tik susijusias).
       * Filtrą ?studentId=… — paliekame konkrečių vaikų S.F.: paketai pagal manual_sales_invoice_id + eilutės su session_ids (overlap).
       */
      if (!filterStudentId) {
        const { data: invsOpen, error: openErr } = await supabase
          .from('invoices')
          .select('id, invoice_number, issue_date, total_amount, status, pdf_storage_path')
          .order('created_at', { ascending: false })
          .limit(150);

        if (openErr) {
          console.warn('[ParentInvoices] invoices list:', openErr);
          setLoadError(openErr.message);
          setInvoices([]);
          setLoading(false);
          return;
        }
        setInvoices(invsOpen ?? []);
        setLoading(false);
        return;
      }

      const invoiceIdSet = new Set<string>();
      const { data: pkgRows } = await supabase
        .from('lesson_packages')
        .select('manual_sales_invoice_id')
        .in('student_id', studentIds)
        .not('manual_sales_invoice_id', 'is', null);
      for (const r of pkgRows ?? []) {
        const invId = r.manual_sales_invoice_id as string | null;
        if (invId) invoiceIdSet.add(invId);
      }

      const { data: sessRows } = await supabase.from('sessions').select('id').in('student_id', studentIds);
      const sessionIds = [...new Set((sessRows ?? []).map((s) => s.id))];
      const childSessionIdSet = new Set(sessionIds);
      try {
        const fromSessions = await fetchInvoiceIdsForSessionIds(supabase, sessionIds);
        for (const invId of fromSessions) invoiceIdSet.add(invId);
      } catch (liErr) {
        console.warn('[ParentInvoices] line_items session lookup:', liErr);
      }

      const invoiceIds = [...invoiceIdSet];
      if (!invoiceIds.length) {
        setInvoices([]);
        setLoading(false);
        return;
      }

      const { data: invs, error: invListErr } = await supabase
        .from('invoices')
        .select('id, invoice_number, issue_date, total_amount, status, pdf_storage_path')
        .in('id', invoiceIds)
        .order('created_at', { ascending: false })
        .limit(150);

      if (invListErr) {
        console.warn('[ParentInvoices] invoices by id:', invListErr);
        setLoadError(invListErr.message);
        setInvoices([]);
        setLoading(false);
        return;
      }

      const { data: lineItems } = await supabase
        .from('invoice_line_items')
        .select('invoice_id, total_price, quantity, session_ids')
        .in('invoice_id', invoiceIds);

      const linesByInvoice = new Map<string, Array<{ total_price?: number | null; quantity?: number | null; session_ids?: string[] | null }>>();
      for (const li of lineItems ?? []) {
        const invId = li.invoice_id as string;
        if (!linesByInvoice.has(invId)) linesByInvoice.set(invId, []);
        linesByInvoice.get(invId)!.push(li);
      }

      const enriched: Invoice[] = (invs ?? []).map((inv) => {
        const invoiceTotal = Number(inv.total_amount || 0);
        const display = computeInvoiceDisplayForChild(
          invoiceTotal,
          linesByInvoice.get(inv.id) ?? [],
          childSessionIdSet,
        );
        return {
          ...inv,
          display_amount: display.display_amount,
          lesson_count: display.lesson_count,
          is_shared: display.is_shared,
          invoice_total_amount: display.invoice_total_amount,
        };
      });

      setInvoices(enriched);
      setLoading(false);
    })();
  }, [user?.id, filterStudentId]);

  const downloadPdf = async (inv: Invoice) => {
    setDownloadingId(inv.id);
    try {
      if (inv.pdf_storage_path) {
        const { data } = await supabase.storage.from('invoices').download(inv.pdf_storage_path);
        if (data) {
          const url = URL.createObjectURL(data);
          const a = document.createElement('a');
          a.href = url;
          a.download = `${inv.invoice_number}.pdf`;
          a.click();
          URL.revokeObjectURL(url);
          return;
        }
      }
      const res = await fetch(`/api/invoice-pdf?id=${inv.id}`, { headers: await authHeaders() });
      if (!res.ok) throw new Error('Failed to download PDF');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${inv.invoice_number}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.warn('[ParentInvoices] PDF download failed:', e);
    } finally {
      setDownloadingId(null);
    }
  };

  const statusColor: Record<string, string> = {
    issued: 'bg-amber-100 text-amber-800',
    paid: 'bg-green-100 text-green-800',
    cancelled: 'bg-red-100 text-red-800',
  };

  const invoiceStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      issued: t('invoices.statusIssued'),
      paid: t('invoices.statusPaid'),
      cancelled: t('invoices.statusCancelled'),
    };
    return labels[status] || status;
  };

  if (loading) {
    return (
      <ParentLayout>
        <div className="flex-1 flex items-center justify-center min-h-[40vh]">
          <div className="w-8 h-8 border-2 border-violet-200 border-t-violet-600 rounded-full animate-spin" />
        </div>
      </ParentLayout>
    );
  }

  return (
    <ParentLayout>
      <main className="w-full max-w-5xl mx-auto px-4 pt-6 flex-1 flex flex-col min-h-0">
        <h1 className="text-xl font-black text-gray-900 tracking-tight mb-4">{t('parent.invoices')}</h1>
        {loadError ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 mb-4">
            {t('parent.invoicesLoadError', { message: loadError })}
          </div>
        ) : null}
        {pendingPackages.length > 0 && (
          <div className="mb-5 space-y-2">
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">{t('parentInv.pendingTitle')}</h2>
            {pendingPackages.map((pkg) => (
              <div key={pkg.id} className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900 truncate">
                    {pkg.subjects || t('parentInv.packageFallback')}
                    {pkg.studentName && <span className="text-gray-500 font-normal"> · {pkg.studentName}</span>}
                  </p>
                  <p className="text-xs text-gray-600 mt-0.5">
                    {t('parentInv.lessonsCount', { count: String(pkg.totalLessons) })}
                    {pkg.totalPrice != null && <> · <span className="font-semibold">€{pkg.totalPrice.toFixed(2)}</span></>}
                  </p>
                </div>
                {pkg.paymentMethod === 'manual' ? (
                  <span className="text-xs text-gray-600 bg-white border border-gray-200 rounded-lg px-2.5 py-1.5 shrink-0">
                    {t('parentInv.manualTransfer')}
                  </span>
                ) : (
                  <a
                    href={`/api/pay-package?package=${pkg.id}`}
                    className="inline-flex items-center rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700 shrink-0"
                  >
                    {t('parentInv.payNow')}
                  </a>
                )}
              </div>
            ))}
          </div>
        )}
        <div className="space-y-3">
          {invoices.length === 0 ? (
            <p className="text-gray-500 text-center py-12">{t('parent.noInvoices')}</p>
          ) : (
            invoices.map((inv) => {
              const amount = filterStudentId && inv.display_amount != null
                ? inv.display_amount
                : Number(inv.total_amount);
              return (
              <div key={inv.id} className="bg-white rounded-xl border p-4 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium text-gray-900 flex items-center gap-2">
                    <FileText className="w-4 h-4 text-gray-400 shrink-0" />
                    {inv.invoice_number}
                  </p>
                  <p className="text-sm text-gray-500">{format(new Date(inv.issue_date), 'yyyy-MM-dd')}</p>
                  {filterStudentId && (inv.lesson_count ?? 0) > 0 && (
                    <p className="text-xs text-gray-500 mt-0.5">
                      {t('invoice.lessonsCount', { count: inv.lesson_count ?? 0 })}
                    </p>
                  )}
                  {filterStudentId && inv.is_shared && (
                    <p className="text-xs text-amber-700 mt-0.5">
                      {t('stu.invoiceSharedBatch', {
                        total: Number(inv.invoice_total_amount ?? inv.total_amount).toFixed(2),
                      })}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="font-medium text-gray-800">{fmt(amount)}</span>
                  <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium', statusColor[inv.status] || statusColor.issued)}>
                    {invoiceStatusLabel(inv.status)}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={downloadingId === inv.id}
                    onClick={() => downloadPdf(inv)}
                    title={t('stu.openInvoicePdf')}
                  >
                    {downloadingId === inv.id ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Download className="w-4 h-4" />
                    )}
                  </Button>
                </div>
              </div>
              );
            })
          )}
        </div>
      </main>
    </ParentLayout>
  );
}
