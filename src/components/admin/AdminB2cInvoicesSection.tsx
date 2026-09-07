import { useCallback, useEffect, useState } from 'react';
import { Download, FileSpreadsheet, Loader2, RefreshCw, Send } from 'lucide-react';
import { fmtMoney } from '@/lib/marketMoney';
import { downloadBlob } from './adminDownload';

interface Props {
  adminSecret: string;
  month: string;
}

interface B2cInvoiceRow {
  id: string;
  invoice_number: string;
  counterparty_name: string;
  counterparty_type: 'org' | 'tutor';
  total_amount: number;
  has_pdf: boolean;
  created_at: string;
}

interface GenerateResult {
  generated: { counterparty: string; invoiceNumber: string; totalAmount: number }[];
  skipped: { counterparty: string; reason: string }[];
  unattributedOperations: number;
  message?: string;
}

/**
 * Monthly B2C commission invoices (sąskaitos faktūros klientams):
 * one per agency / individual tutor, issued as already paid (fees deducted).
 */
export default function AdminB2cInvoicesSection({ adminSecret, month }: Props) {
  const [invoices, setInvoices] = useState<B2cInvoiceRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [csvLoading, setCsvLoading] = useState(false);
  const [genResult, setGenResult] = useState<GenerateResult | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadInvoices = useCallback(async (m: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin-b2c-invoices?month=${encodeURIComponent(m)}`, {
        headers: { 'x-admin-secret': adminSecret },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Nepavyko įkelti sąskaitų');
      setInvoices(json.invoices || []);
    } catch (e: any) {
      setError(e.message || 'Nepavyko įkelti sąskaitų');
    } finally {
      setLoading(false);
    }
  }, [adminSecret]);

  useEffect(() => {
    setGenResult(null);
    setError(null);
    void loadInvoices(month);
  }, [month, loadInvoices]);

  const generateInvoices = async () => {
    if (!window.confirm(`Generuoti ${month} mėn. tarpininkavimo sąskaitas visiems klientams?`)) return;
    setGenerating(true);
    setError(null);
    setGenResult(null);
    try {
      const res = await fetch('/api/admin-b2c-invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-secret': adminSecret },
        body: JSON.stringify({ month }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Nepavyko sugeneruoti sąskaitų');
      setGenResult(json as GenerateResult);
      void loadInvoices(month);
    } catch (e: any) {
      setError(e.message || 'Nepavyko sugeneruoti sąskaitų');
    } finally {
      setGenerating(false);
    }
  };

  const downloadInvoicePdf = async (inv: B2cInvoiceRow) => {
    setDownloadingId(inv.id);
    setError(null);
    try {
      const res = await fetch(`/api/admin-b2c-invoices?invoiceId=${encodeURIComponent(inv.id)}&download=1`, {
        headers: { 'x-admin-secret': adminSecret },
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || 'Nepavyko atsisiųsti PDF');
      }
      await downloadBlob(res, `${inv.invoice_number}.pdf`);
    } catch (e: any) {
      setError(e.message || 'Nepavyko atsisiųsti PDF');
    } finally {
      setDownloadingId(null);
    }
  };

  const downloadCsv = async () => {
    setCsvLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin-b2c-report?month=${encodeURIComponent(month)}`, {
        headers: { 'x-admin-secret': adminSecret },
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || 'Nepavyko sugeneruoti suvestinės');
      }
      await downloadBlob(res, `b2c-suvestine-${month}.csv`);
    } catch (e: any) {
      setError(e.message || 'Nepavyko sugeneruoti suvestinės');
    } finally {
      setCsvLoading(false);
    }
  };

  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl p-5 space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-white font-semibold">B2C tarpininkavimo sąskaitos klientams</h3>
          <p className="text-sm text-slate-400 mt-1">
            Atskira sąskaita faktūra kiekvienai agentūrai ir individualiam korepetitoriui — „Tutlio tarpininkavimo
            mokesčiai" (Stripe + Perlas). Išrašoma kaip apmokėta (mokestis jau išskaičiuotas). VMI deklaravimui.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            type="button"
            onClick={generateInvoices}
            disabled={generating}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-50 transition-colors"
          >
            {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            Generuoti sąskaitas klientams
          </button>
          <button
            type="button"
            onClick={downloadCsv}
            disabled={csvLoading}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-white/5 text-slate-300 hover:bg-white/10 disabled:opacity-50 transition-colors"
          >
            {csvLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileSpreadsheet className="w-4 h-4" />}
            Suvestinė (CSV)
          </button>
        </div>
      </div>

      {error && (
        <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">{error}</div>
      )}

      {genResult && (
        <div className="text-sm space-y-1">
          {genResult.message && <p className="text-slate-400">{genResult.message}</p>}
          {genResult.generated.map((g) => (
            <p key={g.invoiceNumber} className="text-emerald-400">
              ✓ {g.counterparty} — {g.invoiceNumber}, {fmtMoney(g.totalAmount)} (apmokėta)
            </p>
          ))}
          {genResult.skipped.map((s, i) => (
            <p key={`${s.counterparty}-${i}`} className="text-amber-400">
              ⚠ {s.counterparty} — {s.reason === 'already_invoiced' ? 'sąskaita jau išrašyta' : s.reason}
            </p>
          ))}
          {genResult.unattributedOperations > 0 && (
            <p className="text-slate-400">
              {genResult.unattributedOperations} operacijos be priskirto kliento — matomos tik CSV suvestinėje.
            </p>
          )}
        </div>
      )}

      <div className="border-t border-white/10 pt-3">
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-sm font-medium text-slate-300">Išrašytos sąskaitos ({month})</h4>
          <button
            type="button"
            onClick={() => void loadInvoices(month)}
            className="text-slate-400 hover:text-white"
            title="Atnaujinti"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
        {invoices.length === 0 ? (
          <p className="text-sm text-slate-500 py-2">{loading ? 'Kraunama…' : 'Šio mėnesio sąskaitų nėra.'}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-500 text-xs">
                  <th className="py-2 pr-3 font-medium">Nr.</th>
                  <th className="py-2 pr-3 font-medium">Klientas</th>
                  <th className="py-2 pr-3 font-medium">Tipas</th>
                  <th className="py-2 pr-3 font-medium text-right">Suma</th>
                  <th className="py-2 font-medium" />
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => (
                  <tr key={inv.id} className="border-t border-white/5 text-slate-300">
                    <td className="py-2 pr-3 whitespace-nowrap">{inv.invoice_number}</td>
                    <td className="py-2 pr-3">{inv.counterparty_name}</td>
                    <td className="py-2 pr-3 whitespace-nowrap">
                      {inv.counterparty_type === 'org' ? 'Agentūra' : 'Korepetitorius'}
                    </td>
                    <td className="py-2 pr-3 text-right whitespace-nowrap font-medium text-white">
                      {fmtMoney(inv.total_amount)}
                    </td>
                    <td className="py-2 text-right">
                      {inv.has_pdf && (
                        <button
                          type="button"
                          onClick={() => downloadInvoicePdf(inv)}
                          disabled={downloadingId === inv.id}
                          className="inline-flex items-center gap-1 text-indigo-400 hover:text-indigo-300 disabled:opacity-50"
                        >
                          {downloadingId === inv.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                          PDF
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
