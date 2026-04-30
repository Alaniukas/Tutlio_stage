import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useUser } from '@/contexts/UserContext';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from '@/lib/i18n';
import { format } from 'date-fns';
import { ArrowLeft, Download, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

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
  const navigate = useNavigate();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    (async () => {
      setLoading(true);

      const { data: parentProfile } = await supabase
        .from('parent_profiles')
        .select('id')
        .eq('user_id', user.id)
        .single();

      if (!parentProfile) { setLoading(false); return; }

      const { data: links } = await supabase
        .from('parent_students')
        .select('student_id')
        .eq('parent_id', parentProfile.id);

      const studentIds = (links ?? []).map(l => l.student_id);
      if (!studentIds.length) { setLoading(false); return; }

      // Fetch invoices related to the parent's children via invoice line items and sessions
      const { data: invs } = await supabase
        .from('invoices')
        .select('id, invoice_number, issue_date, total_amount, status, pdf_storage_path')
        .order('created_at', { ascending: false })
        .limit(50);

      setInvoices(invs ?? []);
      setLoading(false);
    })();
  }, [user?.id]);

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

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f7f7fb] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-violet-200 border-t-violet-600 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f7f7fb]">
      <header className="bg-white border-b px-4 sm:px-6 py-3 sm:py-4 flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate('/parent')}>
          <ArrowLeft className="w-4 h-4 mr-1" /> {t('parent.back')}
        </Button>
        <h1 className="text-lg font-bold text-gray-900">{t('parent.invoices')}</h1>
      </header>

      <main className="max-w-3xl mx-auto px-3 sm:px-4 py-4 sm:py-8 space-y-3">
        {invoices.length === 0 ? (
          <p className="text-gray-500 text-center py-12">{t('parent.noInvoices')}</p>
        ) : (
          invoices.map((inv) => (
            <div key={inv.id} className="bg-white rounded-xl border p-3 sm:p-4 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="font-medium text-gray-900 flex items-center gap-2">
                  <FileText className="w-4 h-4 text-gray-400 flex-shrink-0" />
                  <span className="truncate">{inv.invoice_number}</span>
                </p>
                <p className="text-sm text-gray-500">{format(new Date(inv.issue_date), 'yyyy-MM-dd')}</p>
              </div>
              <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
                <span className="font-medium text-gray-800 text-sm">{Number(inv.total_amount).toFixed(2)} €</span>
                <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap', statusColor[inv.status] || statusColor.issued)}>
                  {inv.status}
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
      </main>
    </div>
  );
}
