import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { authHeaders } from '@/lib/apiHelpers';
import { useTranslation } from '@/lib/i18n';
import { useOrgFeatures } from '@/hooks/useOrgFeatures';
import { schoolConsultationsEnabled } from '@/lib/schoolConsultationsOrg';
import { CONSULTATION_STATUS_I18N, type ConsultationStatus } from '@/lib/schoolConsultationStatuses';
import ConsultationProposeDialog from '@/components/consultations/ConsultationProposeDialog';
import { downloadSchoolConsultationsXlsx } from '@/lib/schoolConsultationsXlsxExport';
import { consultationSchoolYear } from '@/lib/schoolConsultationYear';

export default function CompanyConsultations() {
  const { t } = useTranslation();
  const { features, organizationId } = useOrgFeatures();
  const enabled = schoolConsultationsEnabled(organizationId, features as Record<string, unknown>);
  const [requests, setRequests] = useState<any[]>([]);
  const [consultations, setConsultations] = useState<any[]>([]);
  const [proposeOpen, setProposeOpen] = useState(false);
  const [proposeRequestIds, setProposeRequestIds] = useState<string[]>([]);

  const load = useCallback(async () => {
    if (!organizationId || !enabled) return;
    const headers = await authHeaders();
    const res = await fetch(
      `/api/school-consultations?scope=admin&organization_id=${encodeURIComponent(organizationId)}`,
      { headers },
    );
    const json = await res.json();
    if (res.ok) {
      setRequests(json.requests || []);
      setConsultations(json.consultations || []);
    }
  }, [organizationId, enabled]);

  useEffect(() => {
    load();
  }, [load]);

  if (!enabled) {
    return <p className="text-sm text-muted-foreground">{t('common.error')}</p>;
  }

  const statusLabel = (status: string) => {
    const key = CONSULTATION_STATUS_I18N[status as ConsultationStatus];
    return key ? t(key) : status;
  };

  return (
    <>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold">{t('schoolConsult.title')}</h1>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              const schoolYear = consultationSchoolYear() || '';
              void downloadSchoolConsultationsXlsx({
                students: [...new Map(
                  [...requests, ...consultations]
                    .map((r) => r.student)
                    .filter(Boolean)
                    .map((s: any) => [s.id, s]),
                ).values()],
                consultations,
                schoolYear,
                t,
              });
            }}
          >
            Excel
          </Button>
        </div>

        <section className="space-y-3">
          <h2 className="text-lg font-medium">{t('schoolConsult.admin.requests')}</h2>
          {requests.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('schoolConsult.emptyRequests')}</p>
          ) : (
            <ul className="space-y-2">
              {requests.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3">
                  <div>
                    <p className="font-medium">{r.student?.full_name}</p>
                    <p className="text-sm">{r.topic}</p>
                    <Badge variant="secondary">{statusLabel(r.status)}</Badge>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => { setProposeRequestIds([r.id]); setProposeOpen(true); }}
                  >
                    {t('schoolConsult.proposeTime')}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-medium">{t('schoolConsult.admin.confirmed')}</h2>
          {consultations.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('schoolConsult.emptyConsultations')}</p>
          ) : (
            <ul className="space-y-2">
              {consultations.map((c) => (
                <li key={c.id} className="rounded-lg border p-3">
                  <p className="font-medium">{c.student?.full_name}</p>
                  <p className="text-sm text-muted-foreground">
                    {c.start_time ? new Date(c.start_time).toLocaleString('lt-LT') : '—'}
                  </p>
                  <Badge variant="secondary">{statusLabel(c.status)}</Badge>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <ConsultationProposeDialog
        open={proposeOpen}
        onOpenChange={setProposeOpen}
        organizationId={organizationId || ''}
        requestIds={proposeRequestIds}
        onProposed={load}
      />
    </>
  );
}
