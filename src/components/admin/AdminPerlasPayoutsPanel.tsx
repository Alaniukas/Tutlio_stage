import { useCallback, useEffect, useState } from 'react';
import { Download, CheckCircle2, XCircle, RefreshCw, AlertCircle } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface Props {
  adminSecret: string;
}

interface PendingEntity {
  entity_type: string;
  entity_id: string;
  total_volume: number;
  total_net: number;
  entry_count: number;
  entity: {
    full_name?: string;
    name?: string;
    payout_iban?: string;
    payout_recipient_name?: string;
  } | null;
}

interface Batch {
  id: string;
  total_amount: number;
  entry_count: number;
  status: 'generated' | 'paid' | 'cancelled';
  xml_filename: string;
  created_at: string;
  completed_at: string | null;
}

interface FeeSettings {
  perlas_platform_fee_percent: string;
  perlas_provider_fee_percent: string;
  perlas_platform_fee_fixed: string;
  perlas_provider_fee_fixed: string;
  perlas_payout_fee_fixed: string;
}

const DEFAULT_SETTINGS: FeeSettings = {
  perlas_platform_fee_percent: '0',
  perlas_provider_fee_percent: '0',
  perlas_platform_fee_fixed: '0',
  perlas_provider_fee_fixed: '0',
  perlas_payout_fee_fixed: '0',
};

export default function AdminPerlasPayoutsPanel({ adminSecret }: Props) {
  const [entities, setEntities] = useState<PendingEntity[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [settings, setSettings] = useState<FeeSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(false);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);

  const headers = { 'x-admin-secret': adminSecret, 'Content-Type': 'application/json' };

  const fetchSummary = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin-perlas-payouts?action=summary', { headers: { 'x-admin-secret': adminSecret } });
      const data = await res.json();
      if (res.ok) setEntities(data.entities || []);
    } catch { /* ignore */ }
    setLoading(false);
  }, [adminSecret]);

  const fetchBatches = useCallback(async () => {
    try {
      const res = await fetch('/api/admin-perlas-payouts?action=batches', { headers: { 'x-admin-secret': adminSecret } });
      const data = await res.json();
      if (res.ok) setBatches(data.batches || []);
    } catch { /* ignore */ }
  }, [adminSecret]);

  const fetchSettings = useCallback(async () => {
    try {
      const res = await fetch('/api/admin-perlas-payouts?action=settings', { headers: { 'x-admin-secret': adminSecret } });
      const data = await res.json();
      if (res.ok && data.settings) {
        setSettings({ ...DEFAULT_SETTINGS, ...data.settings });
      }
    } catch { /* ignore */ }
  }, [adminSecret]);

  useEffect(() => {
    void fetchSummary();
    void fetchBatches();
    void fetchSettings();
  }, [fetchSummary, fetchBatches, fetchSettings]);

  const saveSettings = async () => {
    setSettingsLoading(true);
    setResult(null);
    try {
      const res = await fetch('/api/admin-perlas-payouts?action=settings', {
        method: 'POST', headers, body: JSON.stringify(settings),
      });
      if (res.ok) setResult({ ok: true, msg: 'Komisijos nustatymai išsaugoti' });
      else setResult({ ok: false, msg: 'Nepavyko išsaugoti' });
    } catch {
      setResult({ ok: false, msg: 'Serverio klaida' });
    }
    setSettingsLoading(false);
  };

  const generateXml = async () => {
    if (!window.confirm(`Generuoti XML mokėjimo failą?\n\nVisi laukiami ${entities.length} įrašai bus rezervuoti ir įtraukti į partiją.`)) return;
    setResult(null);
    try {
      const res = await fetch('/api/admin-perlas-payouts?action=generate-xml', {
        method: 'POST', headers: { 'x-admin-secret': adminSecret, 'Content-Type': 'application/json' },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Klaida' }));
        setResult({ ok: false, msg: err.error || 'Nepavyko sugeneruoti XML' });
        return;
      }
      const blob = await res.blob();
      const cd = res.headers.get('content-disposition');
      const filename = cd?.match(/filename="(.+)"/)?.[1] || 'payout_batch.xml';
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      setResult({ ok: true, msg: `XML failas ${filename} atsisiųstas` });
      void fetchSummary();
      void fetchBatches();
    } catch {
      setResult({ ok: false, msg: 'Nepavyko atsisiųsti XML' });
    }
  };

  const markBatch = async (batchId: string, action: 'mark-paid' | 'mark-cancelled') => {
    const msg = action === 'mark-paid'
      ? 'Pažymėti partiją kaip APMOKĖTĄ?\n\nVisi rezervuoti įrašai bus pažymėti kaip išmokėti.'
      : 'ATŠAUKTI partiją?\n\nVisi rezervuoti įrašai grįš į laukiamų eilę.';
    if (!window.confirm(msg)) return;
    setResult(null);
    try {
      const res = await fetch(`/api/admin-perlas-payouts?action=${action}`, {
        method: 'POST', headers, body: JSON.stringify({ batchId }),
      });
      if (res.ok) {
        setResult({ ok: true, msg: action === 'mark-paid' ? 'Partija pažymėta kaip apmokėta' : 'Partija atšaukta' });
        void fetchSummary();
        void fetchBatches();
      } else {
        const err = await res.json().catch(() => ({ error: 'Klaida' }));
        setResult({ ok: false, msg: err.error || 'Nepavyko' });
      }
    } catch {
      setResult({ ok: false, msg: 'Serverio klaida' });
    }
  };

  const payoutFee = Number(settings.perlas_payout_fee_fixed) || 0;
  const totalPendingNet = entities.reduce((s, e) => s + e.total_net, 0);
  const totalPendingVolume = entities.reduce((s, e) => s + e.total_volume, 0);
  const totalPayout = entities.reduce((s, e) => s + Math.max(0, e.total_net - payoutFee), 0);

  return (
    <div className="space-y-6">
      {result && (
        <div className={`flex items-center gap-2 rounded-xl px-4 py-3 text-sm ${result.ok ? 'bg-green-900/50 border border-green-700 text-green-300' : 'bg-red-900/50 border border-red-700 text-red-300'}`}>
          {result.ok ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          <span>{result.msg}</span>
        </div>
      )}

      {/* Commission Settings */}
      <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
        <h3 className="text-sm font-semibold text-white mb-4">Komisijų nustatymai</h3>
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="text-slate-400 text-xs">Platformos komisija (%)</Label>
            <Input
              type="number" step="0.01" min="0" max="100"
              value={settings.perlas_platform_fee_percent}
              onChange={e => setSettings(s => ({ ...s, perlas_platform_fee_percent: e.target.value }))}
              className="bg-white/10 border-white/20 text-white rounded-xl"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-slate-400 text-xs">Platformos fiksuotas mokestis (EUR)</Label>
            <Input
              type="number" step="0.01" min="0"
              value={settings.perlas_platform_fee_fixed}
              onChange={e => setSettings(s => ({ ...s, perlas_platform_fee_fixed: e.target.value }))}
              className="bg-white/10 border-white/20 text-white rounded-xl"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-slate-400 text-xs">PerlasFinance komisija (%)</Label>
            <Input
              type="number" step="0.01" min="0" max="100"
              value={settings.perlas_provider_fee_percent}
              onChange={e => setSettings(s => ({ ...s, perlas_provider_fee_percent: e.target.value }))}
              className="bg-white/10 border-white/20 text-white rounded-xl"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-slate-400 text-xs">PerlasFinance fiksuotas mokestis (EUR)</Label>
            <Input
              type="number" step="0.01" min="0"
              value={settings.perlas_provider_fee_fixed}
              onChange={e => setSettings(s => ({ ...s, perlas_provider_fee_fixed: e.target.value }))}
              className="bg-white/10 border-white/20 text-white rounded-xl"
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label className="text-slate-400 text-xs">Išmokėjimo mokestis per pavedimą (EUR)</Label>
            <Input
              type="number" step="0.01" min="0"
              value={settings.perlas_payout_fee_fixed}
              onChange={e => setSettings(s => ({ ...s, perlas_payout_fee_fixed: e.target.value }))}
              className="bg-white/10 border-white/20 text-white rounded-xl max-w-xs"
            />
            <p className="text-[11px] text-slate-500">Ši suma atskaitoma kiekvienam gavėjui XML faile (ne per pamoką, o per pavedimą)</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void saveSettings()}
          disabled={settingsLoading}
          className="mt-4 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-semibold rounded-xl transition-colors"
        >
          {settingsLoading ? 'Saugoma...' : 'Išsaugoti komisijas'}
        </button>
      </div>

      {/* Pending Payouts */}
      <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-white">Laukiami išmokėjimai</h3>
          <button type="button" onClick={() => void fetchSummary()} className="text-slate-400 hover:text-white">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

        {loading ? (
          <div className="text-slate-400 text-sm py-4 text-center">Kraunama...</div>
        ) : entities.length === 0 ? (
          <div className="text-slate-400 text-sm py-4 text-center">Nėra laukiamų išmokėjimų</div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/10 text-left text-slate-400">
                    <th className="px-3 py-2 font-medium">Tipas</th>
                    <th className="px-3 py-2 font-medium">Pavadinimas</th>
                    <th className="px-3 py-2 font-medium">IBAN</th>
                    <th className="px-3 py-2 font-medium text-right">Apimtis (EUR)</th>
                    <th className="px-3 py-2 font-medium text-right">Grynai (EUR)</th>
                    <th className="px-3 py-2 font-medium text-right">Išmokama (EUR)</th>
                    <th className="px-3 py-2 font-medium text-right">Įrašų</th>
                  </tr>
                </thead>
                <tbody>
                  {entities.map(e => (
                    <tr key={`${e.entity_type}:${e.entity_id}`} className="border-b border-white/5 hover:bg-white/5">
                      <td className="px-3 py-2">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${e.entity_type === 'org' ? 'bg-blue-500/20 text-blue-300' : 'bg-emerald-500/20 text-emerald-300'}`}>
                          {e.entity_type === 'org' ? 'Įmonė' : 'Korepet.'}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-white font-medium">{e.entity?.payout_recipient_name || e.entity?.full_name || '—'}</td>
                      <td className="px-3 py-2 text-slate-300 font-mono text-xs">{e.entity?.payout_iban || '—'}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-slate-300">{e.total_volume.toFixed(2)}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-emerald-300 font-semibold">{e.total_net.toFixed(2)}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-teal-300 font-semibold">{Math.max(0, e.total_net - payoutFee).toFixed(2)}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-slate-400">{e.entry_count}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-white/20 font-semibold text-white">
                    <td colSpan={3} className="px-3 py-2">Viso</td>
                    <td className="px-3 py-2 text-right tabular-nums">{totalPendingVolume.toFixed(2)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-emerald-300">{totalPendingNet.toFixed(2)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-teal-300">{totalPayout.toFixed(2)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{entities.reduce((s, e) => s + e.entry_count, 0)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>

            <button
              type="button"
              onClick={() => void generateXml()}
              className="mt-4 flex items-center gap-2 px-4 py-2.5 bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold rounded-xl transition-colors"
            >
              <Download className="w-4 h-4" />
              Generuoti XML ir rezervuoti
            </button>
          </>
        )}
      </div>

      {/* Batch History */}
      <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-white">Partijų istorija</h3>
          <button type="button" onClick={() => void fetchBatches()} className="text-slate-400 hover:text-white">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

        {batches.length === 0 ? (
          <div className="text-slate-400 text-sm py-4 text-center">Nėra partijų</div>
        ) : (
          <div className="space-y-3">
            {batches.map(b => (
              <div key={b.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-xl bg-white/5 border border-white/10">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      b.status === 'paid' ? 'bg-emerald-500/20 text-emerald-300' :
                      b.status === 'cancelled' ? 'bg-red-500/20 text-red-300' :
                      'bg-amber-500/20 text-amber-300'
                    }`}>
                      {b.status === 'paid' ? 'Apmokėta' : b.status === 'cancelled' ? 'Atšaukta' : 'Sugeneruota'}
                    </span>
                    <span className="text-xs text-slate-500">{b.xml_filename}</span>
                  </div>
                  <div className="flex gap-4 text-xs text-slate-400">
                    <span>Suma: <strong className="text-white">{Number(b.total_amount).toFixed(2)} EUR</strong></span>
                    <span>Įrašai: {b.entry_count}</span>
                    <span>{new Date(b.created_at).toLocaleString('lt-LT')}</span>
                  </div>
                </div>

                {b.status === 'generated' && (
                  <div className="flex gap-2 flex-shrink-0">
                    <button
                      type="button"
                      onClick={() => void markBatch(b.id, 'mark-paid')}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg transition-colors"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Pažymėti apmokėta
                    </button>
                    <button
                      type="button"
                      onClick={() => void markBatch(b.id, 'mark-cancelled')}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600/80 hover:bg-red-600 text-white text-xs font-semibold rounded-lg transition-colors"
                    >
                      <XCircle className="w-3.5 h-3.5" />
                      Atšaukti
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
