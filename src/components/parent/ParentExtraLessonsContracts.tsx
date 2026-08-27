import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { authHeaders } from '@/lib/apiHelpers';
import { isExtraLessonsContractKind } from '@/lib/extraLessonsContract';
import { parentSchoolContractStatusI18nKey } from '@/lib/extraLessonsParentPortal';
import { useTranslation } from '@/lib/i18n';

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
  kind?: string | null;
  signingStatus?: string | null;
};

export default function ParentExtraLessonsContracts({ showEmpty = false }: { showEmpty?: boolean }) {
  const { t } = useTranslation();
  const [rows, setRows] = useState<ExtraRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = async () => {
    try {
      const headers = await authHeaders();
      const res = await fetch('/api/extra-lessons-parent-contracts', { headers });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || t('parent.contractsLoadError'));
        setRows([]);
        return;
      }
      setRows(data.contracts || []);
    } catch {
      setError(t('parent.contractsLoadError'));
      setRows([]);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once on mount
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
    const ok = window.confirm(
      intended === 'withdrawal' ? t('parent.contractsWithdrawConfirm') : t('parent.contractsTerminateConfirm'),
    );
    if (!ok) return;
    setBusyId(id);
    setError(null);
    const headers = await authHeaders();
    const res = await fetch('/api/extra-lessons-contract-withdraw', {
      method: 'POST',
      headers,
      body: JSON.stringify({ contract_id: id, intended_kind: intended }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) setError(data.error || t('parent.contractsLoadError'));
    else await load();
    setBusyId(null);
  };

  if (rows === null && !error) {
    return (
      <div className="flex justify-center py-10">
        <div className="w-8 h-8 border-2 border-violet-200 border-t-violet-600 rounded-full animate-spin" />
      </div>
    );
  }

  if (!rows?.length && !error) {
    if (!showEmpty) return null;
    return (
      <div className="rounded-3xl border border-dashed border-gray-200 bg-white p-8 text-center text-sm text-gray-500">
        {t('parent.contractsEmpty')}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {error && <p className="text-sm text-red-600">{error}</p>}
      {(rows || []).map((row) => (
        <div key={row.id} className="rounded-3xl border border-gray-100 bg-white p-4 shadow-sm space-y-2">
          <p className="text-sm font-medium text-gray-900">
            {t('parent.contractsNumber', { name: row.studentName, n: row.contractNumber || '—' })}
          </p>
          <p className="text-xs text-gray-500">
            {isExtraLessonsContractKind(row.kind) ? t('parent.contractsKindExtra') : t('parent.contractsKindAnnual')}
            {' · '}
            {t(parentSchoolContractStatusI18nKey(row.signingStatus))}
          </p>
          {row.revisionLabel && (
            <p className="text-xs text-gray-500">{t('parent.contractsRevision', { label: row.revisionLabel })}</p>
          )}
          {row.withdrawn && (
            <p className="text-xs text-amber-700">
              {row.extraEndKind === 'termination' ? t('parent.contractsTerminated') : t('parent.contractsWithdrawn')}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            {row.hasPdf && (
              <Button type="button" variant="outline" size="sm" onClick={() => void openFile(row.id, 'pdf')}>
                {t('parent.contractsDownload')}
              </Button>
            )}
            {row.hasStatement && (
              <Button type="button" variant="outline" size="sm" onClick={() => void openFile(row.id, 'statement')}>
                {t('parent.contractsStatement')}
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
                {t('parent.contractsWithdraw')}
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
                {t('parent.contractsTerminate')}
              </Button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
