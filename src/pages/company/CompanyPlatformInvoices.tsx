import { useCallback, useEffect, useState } from 'react';
import { Download, FileText, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { authHeaders } from '@/lib/apiHelpers';
import { useTranslation } from '@/lib/i18n';
import { useMarketMoney } from '@/hooks/useMarketMoney';

interface PlatformInvoice {
  id: string;
  invoice_number: string;
  period_start: string;
  period_end: string;
  total_amount: number;
  deducted_amount: number;
  amount_due: number;
  pdf_storage_path: string | null;
  sent_at: string | null;
  created_at: string;
}

/** Invoices issued by MB Tutlio to this agency (RLS limits rows to the admin's org). */
export default function CompanyPlatformInvoices() {
  const { t } = useTranslation();
  const { fmt } = useMarketMoney();
  const [invoices, setInvoices] = useState<PlatformInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('platform_invoices')
      .select('id, invoice_number, period_start, period_end, total_amount, deducted_amount, amount_due, pdf_storage_path, sent_at, created_at')
      .order('period_start', { ascending: false });
    setInvoices((data as PlatformInvoice[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleDownload = async (inv: PlatformInvoice) => {
    setDownloadingId(inv.id);
    try {
      const res = await fetch(`/api/platform-invoice-pdf?id=${inv.id}`, {
        headers: await authHeaders(),
      });
      if (!res.ok) throw new Error('Download failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${inv.invoice_number.replace(/[/\\?%*:|"<>]/g, '-')}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      window.alert(t('platformInvoices.downloadFailed'));
    } finally {
      setDownloadingId(null);
    }
  };

  const periodLabel = (inv: PlatformInvoice) => {
    const d = new Date(inv.period_start);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">{t('platformInvoices.title')}</h2>
        <p className="text-sm text-gray-500 mt-1">{t('platformInvoices.desc')}</p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-10 text-gray-400">
          <Loader2 className="w-5 h-5 animate-spin" />
        </div>
      ) : invoices.length === 0 ? (
        <div className="text-center py-10">
          <FileText className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-sm text-gray-500">{t('platformInvoices.empty')}</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500 border-b border-gray-200">
                <th className="py-2.5 pr-3 font-medium">{t('platformInvoices.number')}</th>
                <th className="py-2.5 pr-3 font-medium">{t('platformInvoices.period')}</th>
                <th className="py-2.5 pr-3 font-medium text-right">{t('platformInvoices.total')}</th>
                <th className="py-2.5 pr-3 font-medium text-right">{t('platformInvoices.deducted')}</th>
                <th className="py-2.5 pr-3 font-medium text-right">{t('platformInvoices.amountDue')}</th>
                <th className="py-2.5 font-medium" />
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => (
                <tr key={inv.id} className="border-b border-gray-100 text-gray-700">
                  <td className="py-3 pr-3 whitespace-nowrap font-medium text-gray-900">{inv.invoice_number}</td>
                  <td className="py-3 pr-3 whitespace-nowrap">{periodLabel(inv)}</td>
                  <td className="py-3 pr-3 text-right whitespace-nowrap">{fmt(Number(inv.total_amount))}</td>
                  <td className="py-3 pr-3 text-right whitespace-nowrap text-gray-500">
                    {Number(inv.deducted_amount) > 0 ? `-${fmt(Number(inv.deducted_amount))}` : '—'}
                  </td>
                  <td className="py-3 pr-3 text-right whitespace-nowrap font-semibold text-gray-900">
                    {fmt(Number(inv.amount_due))}
                  </td>
                  <td className="py-3 text-right">
                    <button
                      type="button"
                      onClick={() => handleDownload(inv)}
                      disabled={downloadingId === inv.id}
                      className="inline-flex items-center gap-1.5 text-indigo-600 hover:text-indigo-700 disabled:opacity-50 font-medium"
                    >
                      {downloadingId === inv.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                      PDF
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
