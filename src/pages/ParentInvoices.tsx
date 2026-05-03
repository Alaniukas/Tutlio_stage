import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useUser } from '@/contexts/UserContext';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from '@/lib/i18n';
import { format } from 'date-fns';
import { Download, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import ParentLayout from '@/components/ParentLayout';

interface Invoice {
  id: string;
  invoice_number: string;
  issue_date: string;
  total_amount: number;
  status: string;
  pdf_storage_path: string | null;
}

export default function ParentInvoices() {
  const { user } = useUser();
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const filterStudentId = searchParams.get('studentId')?.trim() || null;
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

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

      /**
       * Jei filtro nėra — skaitome sąskaitas tiesiai (RLS `invoices_parent_select` meta tik susijusias).
       * Filtrą ?studentId=… — paliekame konkrečių vaikų S.F.: paketai pagal manual_sales_invoice_id + eilutės su session_ids (overlap).
       * Anksčiau: „nėra sessions“ ⇒ tuščiai (paketas be pamokų neberodomas); paketų invoice_line.session_ids laikė paketo UUID, `.cs.{sessionId}` neveikė.
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
      const chunkSize = 80;
      for (let i = 0; i < sessionIds.length; i += chunkSize) {
        const chunk = sessionIds.slice(i, i + chunkSize);
        if (!chunk.length) continue;
        const { data: liRows, error: liErr } = await supabase
          .from('invoice_line_items')
          .select('invoice_id')
          .overlaps('session_ids', chunk as unknown as string[]);
        if (liErr) {
          console.warn('[ParentInvoices] line_items overlaps:', liErr);
          continue;
        }
        for (const row of liRows ?? []) invoiceIdSet.add(row.invoice_id as string);
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
      } else {
        setInvoices(invs ?? []);
      }
      setLoading(false);
    })();
  }, [user?.id, filterStudentId]);

  const downloadPdf = async (inv: Invoice) => {
    if (!inv.pdf_storage_path) return;
    const { data } = await supabase.storage.from('invoices').download(inv.pdf_storage_path);
    if (data) {
      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${inv.invoice_number}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
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
        <div className="space-y-3">
          {invoices.length === 0 ? (
            <p className="text-gray-500 text-center py-12">{t('parent.noInvoices')}</p>
          ) : (
            invoices.map((inv) => (
              <div key={inv.id} className="bg-white rounded-xl border p-4 flex items-center justify-between">
                <div>
                  <p className="font-medium text-gray-900 flex items-center gap-2">
                    <FileText className="w-4 h-4 text-gray-400" />
                    {inv.invoice_number}
                  </p>
                  <p className="text-sm text-gray-500">{format(new Date(inv.issue_date), 'yyyy-MM-dd')}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-medium text-gray-800">{Number(inv.total_amount).toFixed(2)} €</span>
                  <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium', statusColor[inv.status] || statusColor.issued)}>
                    {invoiceStatusLabel(inv.status)}
                  </span>
                  {inv.pdf_storage_path && (
                    <Button variant="ghost" size="sm" onClick={() => downloadPdf(inv)}>
                      <Download className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </main>
    </ParentLayout>
  );
}
