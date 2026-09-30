import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertCircle, ChevronRight, X } from 'lucide-react';
import { format } from 'date-fns';
import { Link } from 'react-router-dom';
import { useDismissibleDashboardItemIds } from '@/hooks/useDismissibleDashboardItemIds';
import { authHeaders } from '@/lib/apiHelpers';
import { useTranslation } from '@/lib/i18n';
import { schoolDate } from '@/lib/schoolTime';

type ContractAttendanceAlert = {
  id: string;
  studentId: string;
  studentName: string;
  tutorName: string;
  groupId: string;
  groupName: string;
  startTime: string;
  endTime: string;
  statusConfirmedAt: string;
  contractId?: string | null;
};

export default function SchoolContractAttendanceAlerts({ organizationId, canReviewContracts }: {
  organizationId: string;
  canReviewContracts: boolean;
}) {
  const { t, dateFnsLocale } = useTranslation();
  const [result, setResult] = useState<{ organizationId: string; alerts: ContractAttendanceAlert[]; total: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const controllerRef = useRef<AbortController | null>(null);
  const { dismissedIds, dismiss, restoreAll, ready } = useDismissibleDashboardItemIds(
    `tutlio:v1:school_dash_contract_attendance:${organizationId}`,
  );

  const loadAlerts = useCallback(async (showLoading = true) => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    if (showLoading) {
      setLoading(true);
      setLoadError(false);
    }
    try {
      const response = await fetch('/api/school-group-attendance?action=alerts', {
        headers: await authHeaders(),
        signal: controller.signal,
      });
      const body = await response.json();
      if (!response.ok || body?.ok !== true || !Array.isArray(body.alerts)) throw new Error('alerts unavailable');
      if (controller.signal.aborted) return;
      setResult({ organizationId, alerts: body.alerts, total: Number(body.total) || body.alerts.length });
      setLoadError(false);
    } catch {
      if (!controller.signal.aborted) setLoadError(true);
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    void loadAlerts();
    const timer = window.setInterval(() => void loadAlerts(false), 60_000);
    return () => {
      window.clearInterval(timer);
      controllerRef.current?.abort();
    };
  }, [loadAlerts]);

  const alerts = result?.organizationId === organizationId ? result.alerts : [];
  const visibleAlerts = ready ? alerts.filter(alert => !dismissedIds.has(alert.id)) : [];
  if (!loading && !loadError && alerts.length === 0) return null;

  return (
    <section className="overflow-hidden rounded-2xl border border-rose-200 bg-white shadow-sm" aria-labelledby="school-contract-attendance-title">
      <div className="flex items-start gap-3 border-b border-rose-100 bg-rose-50/70 px-4 py-3 sm:px-5">
        <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-rose-700" />
        <div className="min-w-0 flex-1">
          <h2 id="school-contract-attendance-title" className="font-semibold text-gray-950">{t('schoolDash.attendedWithoutContractTitle')}</h2>
          <p className="mt-1 text-xs leading-5 text-rose-800">{t('schoolDash.attendedWithoutContractDescription')}</p>
        </div>
        <span className="shrink-0 rounded-full bg-white px-2.5 py-1 text-sm font-bold text-rose-800">{visibleAlerts.length}</span>
      </div>
      {loading ? <p role="status" className="px-4 py-4 text-sm text-gray-500 sm:px-5">{t('common.loading')}</p> : null}
      {loadError ? (
        <div role="alert" className="px-4 py-4 text-sm text-rose-700 sm:px-5">
          {t('schoolDash.contractAttendanceLoadFailed')}
          <button type="button" className="ml-3 min-h-[44px] font-semibold underline" onClick={() => void loadAlerts()}>{t('stuSess.retryLoad')}</button>
        </div>
      ) : null}
      {ready && alerts.length > 0 && visibleAlerts.length === 0 ? (
        <p className="px-4 py-4 text-sm text-gray-500 sm:px-5">{t('dash.allRowsHiddenHint')}</p>
      ) : null}
      <div className="divide-y divide-gray-100">
        {visibleAlerts.map(alert => (
          <div key={alert.id} className="flex items-start gap-2 px-4 py-3 sm:px-5">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-gray-950">{alert.studentName}</p>
              <p className="mt-0.5 text-xs leading-5 text-gray-500">
                <time dateTime={alert.startTime}>{format(schoolDate(alert.startTime), 'd MMM yyyy, HH:mm', { locale: dateFnsLocale })}</time>
                {' · '}{alert.groupName}{' · '}{alert.tutorName}
              </p>
              {canReviewContracts ? (
                <Link to="/school/contracts" className="mt-1 inline-flex min-h-[44px] items-center gap-1 text-xs font-semibold text-indigo-700 hover:underline">
                  {t('schoolDash.openContracts')}<ChevronRight className="h-3 w-3" />
                </Link>
              ) : null}
            </div>
            <button type="button" className="flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-xl text-gray-400 hover:bg-rose-50 hover:text-gray-700" aria-label={t('dash.dismissRow')} onClick={() => dismiss(alert.id)}>
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
      {result?.organizationId === organizationId && result.total > alerts.length ? (
        <p className="px-4 py-3 text-xs text-gray-500 sm:px-5">{t('schoolDash.contractAttendanceShownCount', { shown: alerts.length, total: result.total })}</p>
      ) : null}
      {alerts.some(alert => dismissedIds.has(alert.id)) ? (
        <button type="button" className="w-full min-h-[44px] border-t border-gray-100 px-4 py-3 text-xs font-semibold text-indigo-700 hover:underline" onClick={restoreAll}>{t('dash.restoreHiddenRows')}</button>
      ) : null}
    </section>
  );
}
