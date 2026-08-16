import { useMemo, useState } from 'react';
import { FileSpreadsheet, Printer, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useTranslation } from '@/lib/i18n';
import { useSchoolPaymentsData } from '@/hooks/useSchoolPaymentsData';
import {
  buildSchoolFinanceRows,
  filterSchoolFinanceRows,
  paymentMethodLabel,
  paymentStatusLabel,
  signingStatusLabel,
  schoolFinanceDateKey,
  summarizeSchoolFinanceRows,
  type SchoolFinanceFilters,
} from '@/lib/schoolFinanceExport';
import { downloadSchoolFinanceXlsx } from '@/lib/schoolFinanceXlsxExport';

const defaultFilters: SchoolFinanceFilters = {
  paymentStatus: 'all',
  search: '',
  paidFrom: '',
  paidTo: '',
};

export default function CompanySchoolFinanceReport() {
  const { t } = useTranslation();
  const { orgName, contracts, installments, loading } = useSchoolPaymentsData();
  const [filters, setFilters] = useState<SchoolFinanceFilters>(defaultFilters);
  const [exporting, setExporting] = useState(false);

  const exportRows = useMemo(() => {
    const allRows = buildSchoolFinanceRows(contracts, installments);
    return filterSchoolFinanceRows(allRows, filters);
  }, [contracts, installments, filters]);

  const summary = useMemo(() => summarizeSchoolFinanceRows(exportRows), [exportRows]);

  const exportXlsx = async () => {
    setExporting(true);
    try {
      const date = new Date().toISOString().slice(0, 10);
      await downloadSchoolFinanceXlsx(exportRows, t, summary, `mokejimai-${date}.xlsx`, orgName);
    } finally {
      setExporting(false);
    }
  };

  const formatDate = (value: string | null) => schoolFinanceDateKey(value) || '—';

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-2 border-emerald-200 border-t-emerald-600 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <>
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #school-finance-print, #school-finance-print * { visibility: visible; }
          #school-finance-print { position: absolute; left: 0; top: 0; width: 100%; }
          .school-finance-report-screen { display: none !important; }
        }
      `}</style>

      <div className="max-w-6xl mx-auto space-y-6 school-finance-report-screen">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{t('school.financeExportTitle')}</h1>
            <p className="text-sm text-gray-500 mt-1">{t('school.financeExportSubtitle')}</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button size="sm" variant="outline" onClick={() => void exportXlsx()} disabled={exportRows.length === 0 || exporting}>
              <FileSpreadsheet className="w-4 h-4 mr-1.5" /> {exporting ? '...' : t('school.financeExportXlsx')}
            </Button>
            <Button size="sm" variant="outline" onClick={() => window.print()} disabled={exportRows.length === 0}>
              <Printer className="w-4 h-4 mr-1.5" /> {t('school.financePrint')}
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <div className="rounded-xl border border-gray-200 bg-white px-4 py-3">
            <p className="text-xs text-gray-500">{t('school.financeSummaryInstallmentCount')}</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{summary.totalInstallmentCount}</p>
          </div>
          <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3">
            <p className="text-xs text-green-700">{t('school.financeSummaryPaidInstallments')}</p>
            <p className="text-2xl font-bold text-green-800 mt-1">{summary.paidCount}</p>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white px-4 py-3">
            <p className="text-xs text-gray-500">{t('school.financeSummaryTotalDue')}</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">€{summary.totalDue.toFixed(2)}</p>
          </div>
          <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3">
            <p className="text-xs text-green-700">{t('school.financeSummaryTotalPaid')}</p>
            <p className="text-2xl font-bold text-green-800 mt-1">€{summary.totalPaid.toFixed(2)}</p>
          </div>
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
            <p className="text-xs text-amber-700">{t('school.financeSummaryOutstanding')}</p>
            <p className="text-2xl font-bold text-amber-900 mt-1">€{summary.totalOutstanding.toFixed(2)}</p>
          </div>
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3">
            <p className="text-xs text-red-700">{t('school.financeSummaryUnpaidCount')}</p>
            <p className="text-2xl font-bold text-red-800 mt-1">{summary.unpaidCount}</p>
          </div>
        </div>

        {summary.contractsWithoutSchedule > 0 && (
          <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
            {t('school.financeSummaryNoScheduleHint', { count: summary.contractsWithoutSchedule })}
          </p>
        )}

        <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">{t('school.financeFilterAll')}</Label>
              <Select
                value={filters.paymentStatus}
                onValueChange={(value) => setFilters((prev) => ({ ...prev, paymentStatus: value as SchoolFinanceFilters['paymentStatus'] }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('school.financeFilterAll')}</SelectItem>
                  <SelectItem value="unpaid">{t('school.financeFilterUnpaid')}</SelectItem>
                  <SelectItem value="paid">{t('school.financeFilterPaid')}</SelectItem>
                  <SelectItem value="overdue">{t('school.financeFilterOverdue')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1 lg:col-span-2">
              <Label className="text-xs">{t('school.searchContracts')}</Label>
              <div className="relative">
                <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <Input
                  className="pl-9"
                  value={filters.search}
                  onChange={(e) => setFilters((prev) => ({ ...prev, search: e.target.value }))}
                  placeholder={t('school.financeSearchPlaceholder')}
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{t('school.financePaidFrom')}</Label>
              <Input type="date" value={filters.paidFrom} onChange={(e) => setFilters((prev) => ({ ...prev, paidFrom: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{t('school.financePaidTo')}</Label>
              <Input type="date" value={filters.paidTo} onChange={(e) => setFilters((prev) => ({ ...prev, paidTo: e.target.value }))} />
            </div>
          </div>

          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs text-gray-500 uppercase tracking-wide">
                <tr>
                  <th className="px-3 py-2">{t('school.financeColStudent')}</th>
                  <th className="px-3 py-2">{t('school.financeColParent')}</th>
                  <th className="px-3 py-2">{t('school.financeColContract')}</th>
                  <th className="px-3 py-2">{t('school.financeColInstallment')}</th>
                  <th className="px-3 py-2">{t('school.financeColAmount')}</th>
                  <th className="px-3 py-2">{t('school.financeColDueDate')}</th>
                  <th className="px-3 py-2">{t('school.financeColStatus')}</th>
                  <th className="px-3 py-2">{t('school.financeColPaidAt')}</th>
                  <th className="px-3 py-2">{t('school.financeColMethod')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {exportRows.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-3 py-6 text-center text-gray-500">{t('school.financeNoRows')}</td>
                  </tr>
                ) : exportRows.map((row, idx) => (
                  <tr key={`${row.contractId}-${row.installmentNumber ?? 'none'}-${idx}`} className="hover:bg-gray-50/50">
                    <td className="px-3 py-2 font-medium text-gray-900">{row.studentName || '—'}</td>
                    <td className="px-3 py-2 text-gray-700">{row.parentName || '—'}</td>
                    <td className="px-3 py-2 text-gray-600">{row.contractNumber || '—'}</td>
                    <td className="px-3 py-2">{row.installmentNumber == null ? '—' : `#${row.installmentNumber}`}</td>
                    <td className="px-3 py-2">{row.installmentAmount == null ? '—' : `€${row.installmentAmount.toFixed(2)}`}</td>
                    <td className="px-3 py-2">{formatDate(row.dueDate)}</td>
                    <td className="px-3 py-2">{paymentStatusLabel(row.paymentStatus, t)}</td>
                    <td className="px-3 py-2">{formatDate(row.paidAt)}</td>
                    <td className="px-3 py-2">{paymentMethodLabel(row.paymentMethod, t)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div id="school-finance-print" className="hidden print:block p-6">
        <h1 className="text-xl font-bold mb-1">{orgName} — {t('school.financeExportTitle')}</h1>
        <p className="text-sm text-gray-600 mb-4">{new Date().toLocaleDateString('lt-LT')}</p>
        <div className="grid grid-cols-3 gap-4 mb-4 text-sm">
          <div><span className="text-gray-500">{t('school.financeSummaryInstallmentCount')}: </span><strong>{summary.totalInstallmentCount}</strong></div>
          <div><span className="text-gray-500">{t('school.financeSummaryPaidInstallments')}: </span><strong>{summary.paidCount}</strong></div>
          <div><span className="text-gray-500">{t('school.financeSummaryTotalDue')}: </span><strong>€{summary.totalDue.toFixed(2)}</strong></div>
          <div><span className="text-gray-500">{t('school.financeSummaryTotalPaid')}: </span><strong>€{summary.totalPaid.toFixed(2)}</strong></div>
          <div><span className="text-gray-500">{t('school.financeSummaryOutstanding')}: </span><strong>€{summary.totalOutstanding.toFixed(2)}</strong></div>
          <div><span className="text-gray-500">{t('school.financeSummaryUnpaidCount')}: </span><strong>{summary.unpaidCount}</strong></div>
        </div>
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="border-b border-gray-300">
              <th className="text-left py-1 pr-2">{t('school.financeColStudent')}</th>
              <th className="text-left py-1 pr-2">{t('school.financeColParent')}</th>
              <th className="text-left py-1 pr-2">{t('school.financeColContract')}</th>
              <th className="text-left py-1 pr-2">{t('school.financeColSigningStatus')}</th>
              <th className="text-right py-1 pr-2">{t('school.financeColAnnualFee')}</th>
              <th className="text-right py-1 pr-2">{t('school.financeColInstallment')}</th>
              <th className="text-right py-1 pr-2">{t('school.financeColAmount')}</th>
              <th className="text-left py-1 pr-2">{t('school.financeColDueDate')}</th>
              <th className="text-left py-1 pr-2">{t('school.financeColStatus')}</th>
              <th className="text-left py-1 pr-2">{t('school.financeColPaidAt')}</th>
              <th className="text-left py-1 pr-2">{t('school.financeColMethod')}</th>
            </tr>
          </thead>
          <tbody>
            {exportRows.map((row, idx) => (
              <tr key={`print-${row.contractId}-${row.installmentNumber ?? 'none'}-${idx}`} className="border-b border-gray-100">
                <td className="py-1 pr-2">{row.studentName}</td>
                <td className="py-1 pr-2">{row.parentName}</td>
                <td className="py-1 pr-2">{row.contractNumber}</td>
                <td className="py-1 pr-2">{signingStatusLabel(row.contractSigningStatus, t)}</td>
                <td className="py-1 pr-2 text-right">{row.annualFee.toFixed(2)}</td>
                <td className="py-1 pr-2 text-right">{row.installmentNumber ?? '—'}</td>
                <td className="py-1 pr-2 text-right">{row.installmentAmount == null ? '—' : row.installmentAmount.toFixed(2)}</td>
                <td className="py-1 pr-2">{formatDate(row.dueDate)}</td>
                <td className="py-1 pr-2">{paymentStatusLabel(row.paymentStatus, t)}</td>
                <td className="py-1 pr-2">{formatDate(row.paidAt)}</td>
                <td className="py-1 pr-2">{paymentMethodLabel(row.paymentMethod, t)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
