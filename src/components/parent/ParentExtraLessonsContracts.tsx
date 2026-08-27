import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { authHeaders } from '@/lib/apiHelpers';

type ExtraRow = {
  id: string;
  contractNumber: string | null;
  revisionLabel: string | null;
  studentName: string;
  acceptedAt: string | null;
  withdrawn: boolean;
  extraEndKind: string | null;
  canWithdraw: boolean;
  canTerminate: boolean;
  hasPdf: boolean;
  hasStatement: boolean;
};

export default function ParentExtraLessonsContracts() {
  const [rows, setRows] = useState<ExtraRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = async () => {
    try {
      const headers = await authHeaders();
      const res = await fetch('/api/extra-lessons-parent-contracts', { headers });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || 'Nepavyko įkelti sutarčių.');
        return;
      }
      setRows(data.contracts || []);
    } catch {
      setError('Nepavyko įkelti sutarčių.');
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const openFile = async (contractId: string, file: 'pdf' | 'statement') => {
    const headers = await authHeaders();
    const res = await fetch(
      `/api/extra-lessons-parent-contracts?contract_id=${encodeURIComponent(contractId)}&file=${file}`,
      { headers },
    );
    const data = await res.json().catch(() => ({}));
    if (data.url) window.open(data.url, '_blank', 'noopener,noreferrer');
  };

  const endContract = async (id: string, intended: 'withdrawal' | 'termination') => {
    setBusyId(id);
    setError(null);
    const headers = await authHeaders();
    const res = await fetch('/api/extra-lessons-contract-withdraw', {
      method: 'POST',
      headers,
      body: JSON.stringify({ contract_id: id, intended_kind: intended }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) setError(data.error || 'Nepavyko pateikti prašymo.');
    else await load();
    setBusyId(null);
  };

  if (!rows.length && !error) return null;

  return (
    <div className="rounded-3xl border border-gray-100 bg-white p-4 shadow-sm space-y-3">
      <h2 className="text-sm font-bold text-gray-900">Papildomų pamokų sutartys</h2>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {rows.map((row) => (
        <div key={row.id} className="border rounded-2xl p-3 space-y-2">
          <p className="text-sm font-medium text-gray-900">
            {row.studentName} · Nr. {row.contractNumber || '—'}
          </p>
          {row.revisionLabel && <p className="text-xs text-gray-500">Redakcija {row.revisionLabel}</p>}
          {row.withdrawn && (
            <p className="text-xs text-amber-700">
              {row.extraEndKind === 'termination' ? 'Nutraukta' : 'Atsisakyta'}. Mokytojo atskirai informuoti nereikia.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            {row.hasPdf && (
              <Button type="button" variant="outline" size="sm" onClick={() => void openFile(row.id, 'pdf')}>
                Atsisiųsti sutartį
              </Button>
            )}
            {row.hasStatement && (
              <Button type="button" variant="outline" size="sm" onClick={() => void openFile(row.id, 'statement')}>
                Pareiškimo kopija
              </Button>
            )}
            {row.canWithdraw && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={busyId === row.id}
                onClick={() => void endContract(row.id, 'withdrawal')}
              >
                Atsisakyti sutarties
              </Button>
            )}
            {row.canTerminate && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={busyId === row.id}
                onClick={() => void endContract(row.id, 'termination')}
              >
                Nutraukti sutartį
              </Button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
