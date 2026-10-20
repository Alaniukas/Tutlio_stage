import { useEffect, useMemo, useState } from 'react';
import { Archive, Download, Loader2, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { authHeaders } from '@/lib/apiHelpers';
import { useTranslation } from '@/lib/i18n';
import { filterArchivedSchoolContracts, type ArchivedSchoolContract } from '@/lib/schoolContractArchive';
import { downloadSchoolContractsZip } from '@/lib/schoolContractsZipExport';

const PAGE_SIZE = 20;

export default function CompanyContractArchive() {
  const { t } = useTranslation();
  const [contracts, setContracts] = useState<ArchivedSchoolContract[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [actionError, setActionError] = useState(false);
  const [revision, setRevision] = useState(0);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [downloading, setDownloading] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setLoadError(false);
    void (async () => {
      try {
        const response = await fetch('/api/school-contract-archive', {
          headers: await authHeaders(), signal: controller.signal,
        });
        const body = await response.json();
        if (!response.ok || !Array.isArray(body.contracts)) throw new Error('Archive unavailable');
        if (!controller.signal.aborted) setContracts(body.contracts);
      } catch {
        if (!controller.signal.aborted) setLoadError(true);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [revision]);

  const filtered = useMemo(() => filterArchivedSchoolContracts(contracts, search), [contracts, search]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const visible = filtered.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);

  const downloadContract = async (contractId: string) => {
    setDownloading(contractId);
    setActionError(false);
    try {
      const response = await fetch('/api/school-contract-archive', {
        method: 'POST',
        headers: { ...(await authHeaders()), 'Content-Type': 'application/json' },
        body: JSON.stringify({ contractId }),
      });
      const body = await response.json();
      if (!response.ok || !body.signedUrl) throw new Error('Download unavailable');
      const link = document.createElement('a');
      link.href = body.signedUrl;
      link.click();
    } catch {
      setActionError(true);
    } finally {
      setDownloading(null);
    }
  };

  const downloadZip = async () => {
    setDownloading('zip');
    setActionError(false);
    try {
      const result = await downloadSchoolContractsZip({
        studentContractIds: filtered.filter(row => row.hasFile).map(row => row.id),
        archivedOnly: true,
      }, { authHeaders: await authHeaders() });
      if (!result.downloaded || result.failedIds.length) setActionError(true);
    } catch {
      setActionError(true);
    } finally {
      setDownloading(null);
    }
  };

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-4 sm:p-6 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold text-gray-900">
            <Archive className="h-5 w-5" aria-hidden /> {t('school.archive.title')}
          </h1>
          <p className="mt-1 text-sm text-gray-500">{t('school.archive.description')}</p>
        </div>
        <Button variant="outline" className="h-auto min-h-9 max-w-full whitespace-normal text-left" onClick={() => void downloadZip()}
          disabled={loading || loadError || Boolean(downloading) || !filtered.some(row => row.hasFile)}>
          {downloading === 'zip' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
          {t('school.exportContractsZip')}
        </Button>
      </div>
      <div className="relative max-w-xl">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" aria-hidden />
        <Input type="search" className="pl-9" aria-label={t('school.archive.search')}
          placeholder={t('school.archive.search')} value={search}
          onChange={event => { setSearch(event.target.value); setPage(0); }} />
      </div>
      {actionError && <p role="alert" className="text-sm text-red-700">{t('school.archive.downloadError')}</p>}
      {loading ? <p role="status">{t('common.loadingDots')}</p>
        : loadError ? <div role="alert" className="space-y-2 text-red-700">
          <p>{t('common.error')}</p>
          <Button variant="outline" onClick={() => setRevision(value => value + 1)}>{t('companyPaymentReport.retry')}</Button>
        </div>
          : filtered.length === 0 ? <p className="py-8 text-center text-sm text-gray-500">{t('school.archive.empty')}</p>
            : <>
              <p className="text-sm text-gray-500">{t('companyPaymentReport.records')}: {filtered.length}</p>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b text-gray-500"><tr>
                    <th className="p-3">{t('school.financeColContract')}</th>
                    <th className="p-3">{t('school.financeColStudent')}</th>
                    <th className="p-3">{t('school.financeColParent')}</th>
                    <th className="p-3">{t('school.archive.archivedAt')}</th>
                    <th className="p-3"><span className="sr-only">{t('invoices.downloadPdf')}</span></th>
                  </tr></thead>
                  <tbody>{visible.map(row => <tr key={row.id} className="border-b last:border-b-0">
                    <td className="p-3 font-medium">{row.contractNumber || '—'}</td>
                    <td className="p-3">{row.studentName || '—'}</td>
                    <td className="p-3"><div>{row.payerName || '—'}</div><div className="text-xs text-gray-500">{row.payerEmail}</div></td>
                    <td className="p-3 whitespace-nowrap">{row.archivedAt.slice(0, 10)}</td>
                    <td className="p-3 text-right">{row.hasFile
                      ? <Button size="sm" variant="outline" disabled={Boolean(downloading)} onClick={() => void downloadContract(row.id)}>
                        <Download className="mr-1.5 h-4 w-4" /> {t('common.download')}
                      </Button>
                      : <span className="text-xs text-gray-500">{t('school.archive.missingFile')}</span>}</td>
                  </tr>)}</tbody>
                </table>
              </div>
              <div className="flex items-center justify-end gap-3">
                <Button variant="outline" size="sm" disabled={safePage === 0} onClick={() => setPage(safePage - 1)}>{t('companyPaymentReport.previous')}</Button>
                <span className="text-sm">{safePage + 1} / {pageCount}</span>
                <Button variant="outline" size="sm" disabled={safePage + 1 >= pageCount} onClick={() => setPage(safePage + 1)}>{t('companyPaymentReport.next')}</Button>
              </div>
            </>}
    </section>
  );
}
