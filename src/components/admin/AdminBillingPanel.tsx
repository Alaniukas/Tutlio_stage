import { useCallback, useEffect, useState } from 'react';
import { Download, Loader2, Mail, RefreshCw, Send } from 'lucide-react';
import { fmtMoney } from '@/lib/marketMoney';
import AdminB2cInvoicesSection from './AdminB2cInvoicesSection';
import { downloadBlob } from './adminDownload';

interface Props {
  adminSecret: string;
}

interface PlatformInvoiceRow {
  id: string;
  invoice_number: string;
  organization_id: string;
  organization_name: string | null;
  total_amount: number;
  deducted_amount: number;
  amount_due: number;
  has_pdf: boolean;
  sent_at: string | null;
  created_at: string;
}

interface GenerateResult {
  generated: { organizationId: string; organizationName: string; invoiceNumber: string; amountDue: number; emailed: boolean }[];
  skipped: { organizationId: string; organizationName: string; reason: string }[];
  message?: string;
}

/** Default to the previous month — reports are generated after month end. */
function previousMonth(): string {
  const d = new Date();
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export default function AdminBillingPanel({ adminSecret }: Props) {
  const [month, setMonth] = useState(previousMonth());
  const [b2bGenerating, setB2bGenerating] = useState(false);
  const [genResult, setGenResult] = useState<GenerateResult | null>(null);
  const [invoices, setInvoices] = useState<PlatformInvoiceRow[]>([]);
  const [invoicesLoading, setInvoicesLoading] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadInvoices = useCallback(async (m: string) => {
    setInvoicesLoading(true);
    try {
      const res = await fetch(`/api/admin-b2b-invoices?month=${encodeURIComponent(m)}`, {
        headers: { 'x-admin-secret': adminSecret },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Nepavyko įkelti sąskaitų');
      setInvoices(json.invoices || []);
    } catch (e: any) {
      setError(e.message || 'Nepavyko įkelti sąskaitų');
    } finally {
      setInvoicesLoading(false);
    }
  }, [adminSecret]);

  useEffect(() => {
    setGenResult(null);
    setError(null);
    void loadInvoices(month);
  }, [month, loadInvoices]);

  const generateB2bInvoices = async () => {
    if (!window.confirm(`Generuoti ir išsiųsti ${month} mėn. sąskaitas agentūroms?`)) return;
    setB2bGenerating(true);
    setError(null);
    setGenResult(null);
    try {
      const res = await fetch('/api/admin-b2b-invoices', {
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
      setB2bGenerating(false);
    }
  };

  const downloadInvoicePdf = async (inv: PlatformInvoiceRow) => {
    setDownloadingId(inv.id);
    setError(null);
    try {
      const res = await fetch(`/api/admin-b2b-invoices?invoiceId=${encodeURIComponent(inv.id)}&download=1`, {
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

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 flex-wrap">
        <label className="text-sm text-slate-400" htmlFor="billing-month">Laikotarpis</label>
        <input
          id="billing-month"
          type="month"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white [color-scheme:dark]"
        />
      </div>

      {error && (
        <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">{error}</div>
      )}

      {/* B2C commission invoices per client (agency / tutor) */}
      <AdminB2cInvoicesSection adminSecret={adminSecret} month={month} />

      {/* B2B agency invoices */}
      <div className="bg-white/5 border border-white/10 rounded-2xl p-5 space-y-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h3 className="text-white font-semibold">B2B sąskaitos agentūroms</h3>
            <p className="text-sm text-slate-400 mt-1">
              Mėnesio abonementas + išmokėjimų pavedimų mokesčiai. PDF išsiunčiamas agentūrai el. paštu.
            </p>
          </div>
          <button
            type="button"
            onClick={generateB2bInvoices}
            disabled={b2bGenerating}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-teal-600 text-white hover:bg-teal-500 disabled:opacity-50 transition-colors"
          >
            {b2bGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            Generuoti sąskaitas agentūroms
          </button>
        </div>

        {genResult && (
          <div className="text-sm space-y-1">
            {genResult.message && <p className="text-slate-400">{genResult.message}</p>}
            {genResult.generated.map((g) => (
              <p key={g.organizationId} className="text-emerald-400">
                ✓ {g.organizationName} — {g.invoiceNumber}, mokėtina {fmtMoney(g.amountDue)}{g.emailed ? ', išsiųsta' : ' (el. laiškas neišsiųstas)'}
              </p>
            ))}
            {genResult.skipped.map((s) => (
              <p key={s.organizationId} className="text-amber-400">
                ⚠ {s.organizationName} — {s.reason === 'already_invoiced' ? 'sąskaita jau išrašyta' : s.reason}
              </p>
            ))}
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
              <RefreshCw className={`w-4 h-4 ${invoicesLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>
          {invoices.length === 0 ? (
            <p className="text-sm text-slate-500 py-2">{invoicesLoading ? 'Kraunama…' : 'Šio mėnesio sąskaitų nėra.'}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-slate-500 text-xs">
                    <th className="py-2 pr-3 font-medium">Nr.</th>
                    <th className="py-2 pr-3 font-medium">Agentūra</th>
                    <th className="py-2 pr-3 font-medium text-right">Iš viso</th>
                    <th className="py-2 pr-3 font-medium text-right">Mokėtina</th>
                    <th className="py-2 pr-3 font-medium">El. paštas</th>
                    <th className="py-2 font-medium" />
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((inv) => (
                    <tr key={inv.id} className="border-t border-white/5 text-slate-300">
                      <td className="py-2 pr-3 whitespace-nowrap">{inv.invoice_number}</td>
                      <td className="py-2 pr-3">{inv.organization_name || inv.organization_id}</td>
                      <td className="py-2 pr-3 text-right whitespace-nowrap">{fmtMoney(inv.total_amount)}</td>
                      <td className="py-2 pr-3 text-right whitespace-nowrap font-medium text-white">{fmtMoney(inv.amount_due)}</td>
                      <td className="py-2 pr-3 whitespace-nowrap">
                        {inv.sent_at ? (
                          <span className="inline-flex items-center gap-1 text-emerald-400"><Mail className="w-3.5 h-3.5" /> išsiųsta</span>
                        ) : (
                          <span className="text-slate-500">neišsiųsta</span>
                        )}
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
    </div>
  );
}
