import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Landmark, Loader2, CheckCircle2, XCircle, Clock, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTranslation } from '@/lib/i18n';

interface LedgerRow {
  id: string;
  volume: number;
  net_amount: number;
  status: string;
  created_at: string;
  paid_out_at: string | null;
}

interface Props {
  entityType: 'tutor' | 'org';
  entityId: string;
}

export default function PerlasFinanceSection({ entityType, entityId }: Props) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [iban, setIban] = useState('');
  const [recipientName, setRecipientName] = useState('');
  const [bic, setBic] = useState('');
  const [country, setCountry] = useState('LT');
  const [city, setCity] = useState('');
  const [address, setAddress] = useState('');
  const [postalCode, setPostalCode] = useState('');

  const [pendingNet, setPendingNet] = useState(0);
  const [reservedNet, setReservedNet] = useState(0);
  const [paidOutNet, setPaidOutNet] = useState(0);
  const [ledger, setLedger] = useState<LedgerRow[]>([]);

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const table = entityType === 'tutor' ? 'profiles' : 'organizations';

  const fetchData = useCallback(async () => {
    setLoading(true);

    const { data: entity } = await supabase
      .from(table)
      .select('payout_iban, payout_recipient_name, payout_bank_bic, payout_country, payout_city, payout_address, payout_postal_code')
      .eq('id', entityId)
      .single();

    if (entity) {
      setIban(entity.payout_iban || '');
      setRecipientName(entity.payout_recipient_name || '');
      setBic(entity.payout_bank_bic || '');
      setCountry(entity.payout_country || 'LT');
      setCity(entity.payout_city || '');
      setAddress(entity.payout_address || '');
      setPostalCode(entity.payout_postal_code || '');
    }

    const { data: breakdown } = await supabase.rpc('get_perlas_balance_breakdown', {
      p_entity_type: entityType,
      p_entity_id: entityId,
    });

    if (breakdown && breakdown.length > 0) {
      const b = breakdown[0];
      setPendingNet(Number(b.pending_net ?? 0));
      setReservedNet(Number(b.reserved_net ?? 0));
      setPaidOutNet(Number(b.total_paid_out_net ?? 0));
    }

    const { data: ledgerRows } = await supabase
      .from('perlas_ledger')
      .select('id, volume, net_amount, status, created_at, paid_out_at')
      .eq('entity_type', entityType)
      .eq('entity_id', entityId)
      .order('created_at', { ascending: false })
      .limit(30);

    setLedger((ledgerRows as LedgerRow[]) || []);
    setLoading(false);
  }, [entityType, entityId, table]);

  useEffect(() => { void fetchData(); }, [fetchData]);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    const trimmedIban = iban.trim().toUpperCase().replace(/\s/g, '');
    const trimmedName = recipientName.trim();

    if (!trimmedIban || !trimmedName) {
      setError(t('perlasFinance.ibanAndNameRequired'));
      setSaving(false);
      return;
    }

    const { error: updateErr } = await supabase
      .from(table)
      .update({
        payout_iban: trimmedIban,
        payout_recipient_name: trimmedName,
        payout_bank_bic: bic.trim() || null,
        payout_country: country.trim() || 'LT',
        payout_city: city.trim() || null,
        payout_address: address.trim() || null,
        payout_postal_code: postalCode.trim() || null,
      })
      .eq('id', entityId);

    if (updateErr) {
      setError(updateErr.message);
    } else {
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    }
    setSaving(false);
  };

  if (loading) {
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-teal-100 p-6 text-center">
        <Loader2 className="w-5 h-5 animate-spin text-gray-400 mx-auto" />
      </div>
    );
  }

  const statusIcon = (s: string) => {
    if (s === 'paid_out') return <CheckCircle2 className="w-4 h-4 text-emerald-500" />;
    if (s === 'reserved') return <Clock className="w-4 h-4 text-amber-500" />;
    return <Clock className="w-4 h-4 text-blue-500" />;
  };

  return (
    <div className="space-y-6">
      {/* Balance card */}
      <div className="bg-gradient-to-br from-teal-50 to-emerald-50 rounded-2xl border border-teal-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Landmark className="w-5 h-5 text-teal-700" />
            <h2 className="text-lg font-semibold text-gray-900">{t('perlasFinance.title')}</h2>
          </div>
          <button onClick={() => void fetchData()} className="text-teal-600 hover:text-teal-800">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <span className="text-xs text-gray-500">{t('perlasFinance.pending')}</span>
            <p className="text-2xl font-bold text-gray-900">{`€${pendingNet.toFixed(2)}`}</p>
          </div>
          <div>
            <span className="text-xs text-amber-600">{t('perlasFinance.reserved')}</span>
            <p className="text-2xl font-bold text-amber-600">{`€${reservedNet.toFixed(2)}`}</p>
          </div>
          <div>
            <span className="text-xs text-emerald-600">{t('perlasFinance.paidOut')}</span>
            <p className="text-2xl font-bold text-emerald-600">{`€${paidOutNet.toFixed(2)}`}</p>
          </div>
        </div>
      </div>

      {/* Bank & address details */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-4">
        <h3 className="text-sm font-semibold text-gray-900">{t('perlasFinance.bankDetails')}</h3>
        <p className="text-xs text-gray-500">{t('perlasFinance.bankDetailsDesc')}</p>

        {saved && (
          <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-xl">
            <CheckCircle2 className="w-4 h-4 text-green-600" />
            <span className="text-sm text-green-700">{t('common.saved')}</span>
          </div>
        )}
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">{error}</div>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs">{t('perlasFinance.recipientName')}</Label>
            <Input value={recipientName} onChange={e => setRecipientName(e.target.value)} placeholder="UAB Pavyzdys / Jonas Jonaitis" className="rounded-xl" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">IBAN</Label>
            <Input value={iban} onChange={e => setIban(e.target.value)} placeholder="LT12 3456 7890 1234 5678" className="rounded-xl font-mono text-sm" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">{`BIC / SWIFT (${t('common.optional')})`}</Label>
            <Input value={bic} onChange={e => setBic(e.target.value)} placeholder="HABALT22" className="rounded-xl font-mono text-sm" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">{t('perlasFinance.country')}</Label>
            <Input value={country} onChange={e => setCountry(e.target.value)} placeholder="LT" maxLength={2} className="rounded-xl" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">{t('perlasFinance.city')}</Label>
            <Input value={city} onChange={e => setCity(e.target.value)} placeholder="Vilnius" className="rounded-xl" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">{t('perlasFinance.address')}</Label>
            <Input value={address} onChange={e => setAddress(e.target.value)} placeholder="Gedimino pr. 1-5" className="rounded-xl" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">{t('perlasFinance.postalCode')}</Label>
            <Input value={postalCode} onChange={e => setPostalCode(e.target.value)} placeholder="01103" className="rounded-xl" />
          </div>
        </div>
        <Button size="sm" onClick={handleSave} disabled={saving} className="rounded-xl bg-teal-600 hover:bg-teal-700 text-white">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : t('perlasFinance.saveBankDetails')}
        </Button>
      </div>

      {/* Ledger history */}
      {ledger.length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-4">
          <h3 className="text-sm font-semibold text-gray-900">{t('perlasFinance.payoutHistory')}</h3>
          <div className="border rounded-xl divide-y max-h-[400px] overflow-y-auto">
            {ledger.map(l => (
              <div key={l.id} className="px-4 py-3 flex items-center justify-between">
                <div className="flex items-center gap-3 min-w-0">
                  {statusIcon(l.status)}
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {`€${Number(l.net_amount).toFixed(2)}`}
                      <span className="text-xs text-gray-400 ml-2">{`(apimtis: €${Number(l.volume).toFixed(2)})`}</span>
                    </p>
                    <p className="text-xs text-gray-500">
                      {new Date(l.created_at).toLocaleDateString('lt-LT')}
                      {l.paid_out_at && ` · Išmokėta ${new Date(l.paid_out_at).toLocaleDateString('lt-LT')}`}
                    </p>
                  </div>
                </div>
                <span className={cn(
                  'text-xs font-medium px-2 py-0.5 rounded-full',
                  l.status === 'paid_out' && 'bg-emerald-100 text-emerald-700',
                  l.status === 'reserved' && 'bg-amber-100 text-amber-700',
                  l.status === 'pending' && 'bg-blue-100 text-blue-700',
                )}>
                  {l.status === 'paid_out' ? t('perlasFinance.statusSuccess') :
                   l.status === 'reserved' ? t('perlasFinance.reserved') :
                   t('perlasFinance.pending')}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
