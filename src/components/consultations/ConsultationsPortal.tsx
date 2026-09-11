import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { authHeaders } from '@/lib/apiHelpers';
import { useTranslation } from '@/lib/i18n';
import { CONSULTATION_STATUS_I18N, type ConsultationStatus } from '@/lib/schoolConsultationStatuses';
import { HELP_TEAM_CATEGORY_I18N, type HelpTeamCategory } from '@/lib/schoolHelpTeamQuota';
import ConsultationNeedDialog from '@/components/consultations/ConsultationNeedDialog';
import HelpTeamBookDialog from '@/components/consultations/HelpTeamBookDialog';

type StudentRow = {
  id: string;
  full_name: string;
  grade?: string | null;
  organization_id?: string;
};

type PortalData = {
  schoolYear: string;
  inSeason: boolean;
  students: StudentRow[];
  eligibleStudentIds: string[];
  requests: any[];
  consultations: any[];
  balances: Record<string, { annualLimit: number | null; usedMinutes: number; reservedMinutes: number; remainingMinutes: number | null }>;
  familyQuota: number;
  helpQuotas: Record<string, { quota: number; used: number; reserved: number; remaining: number; nextIsPaid: boolean }>;
  specialists: { id: string; full_name: string; help_team_category: string }[];
};

export default function ConsultationsPortal(props: {
  organizationId?: string | null;
  subjects?: { id: string; name: string }[];
}) {
  const { t } = useTranslation();
  const [data, setData] = useState<PortalData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [needOpen, setNeedOpen] = useState(false);
  const [bookOpen, setBookOpen] = useState(false);
  const [bookCategory, setBookCategory] = useState<HelpTeamCategory | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const orgId = props.organizationId || data?.students?.[0]?.organization_id || '';

  const load = useCallback(async () => {
    try {
      const headers = await authHeaders();
      const qs = orgId ? `?scope=portal&organization_id=${encodeURIComponent(orgId)}` : '?scope=portal';
      const res = await fetch(`/api/school-consultations${qs}`, { headers });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || t('common.error'));
        setData(null);
        return;
      }
      setData(json);
      setError(null);
    } catch {
      setError(t('common.error'));
    }
  }, [orgId, t]);

  useEffect(() => {
    load();
  }, [load]);

  const eligibleStudents = useMemo(
    () => (data?.students || []).filter((s) => data?.eligibleStudentIds?.includes(s.id)),
    [data],
  );

  const statusLabel = (status: string) => {
    const key = CONSULTATION_STATUS_I18N[status as ConsultationStatus];
    return key ? t(key) : status;
  };

  const act = async (body: Record<string, unknown>) => {
    const headers = await authHeaders();
    const res = await fetch('/api/school-consultations', {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || t('common.error'));
    await load();
  };

  const confirmConsultation = async (id: string) => {
    setBusyId(id);
    try {
      await act({ action: 'confirm', consultation_id: id });
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusyId(null);
    }
  };

  const rejectConsultation = async (id: string) => {
    setBusyId(id);
    try {
      await act({ action: 'reject', consultation_id: id });
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusyId(null);
    }
  };

  if (error && !data) {
    return <p className="text-sm text-destructive">{error}</p>;
  }

  if (!data) {
    return <p className="text-sm text-muted-foreground">{t('common.loading')}</p>;
  }

  if (!data.inSeason) {
    return <p className="text-sm">{t('schoolConsult.offSeason')}</p>;
  }

  if (!eligibleStudents.length) {
    return <p className="text-sm text-muted-foreground">{t('schoolConsult.emptyRequests')}</p>;
  }

  return (
    <div className="space-y-8">
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">{t('schoolConsult.usSection')}</h2>
          <Button type="button" onClick={() => setNeedOpen(true)}>{t('schoolConsult.submitNeed')}</Button>
        </div>
        {eligibleStudents.map((st) => {
          const bal = data.balances[st.id];
          if (!bal || bal.annualLimit === null) return null;
          return (
            <div key={st.id} className="rounded-xl border bg-card p-4 text-sm">
              <p className="font-medium">{st.full_name}</p>
              <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                <span>{t('schoolConsult.balance.limit')}: {bal.annualLimit} {t('schoolConsult.minutesShort')}</span>
                <span>{t('schoolConsult.balance.used')}: {bal.usedMinutes}</span>
                <span>{t('schoolConsult.balance.reserved')}: {bal.reservedMinutes}</span>
                <span>{t('schoolConsult.balance.remaining')}: {bal.remainingMinutes ?? 0}</span>
              </div>
              {bal.remainingMinutes === 0 && (
                <p className="mt-2 text-amber-700">{t('schoolConsult.extraLessonsCta')}</p>
              )}
            </div>
          );
        })}
        {(data.requests || []).length === 0 && (data.consultations || []).filter((c) => c.kind === 'teacher_subject').length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('schoolConsult.emptyRequests')}</p>
        ) : (
          <ul className="space-y-2">
            {(data.consultations || []).filter((c) => c.kind === 'teacher_subject').map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3">
                <div>
                  <p className="font-medium">{c.student?.full_name || ''}</p>
                  <p className="text-sm text-muted-foreground">
                    {c.start_time ? new Date(c.start_time).toLocaleString('lt-LT') : '—'}
                  </p>
                  <Badge variant="secondary" className="mt-1">{statusLabel(c.status)}</Badge>
                </div>
                {c.status === 'awaiting_parent_confirm' && (
                  <div className="flex gap-2">
                    <Button size="sm" disabled={busyId === c.id} onClick={() => confirmConsultation(c.id)}>
                      {t('schoolConsult.confirm')}
                    </Button>
                    <Button size="sm" variant="outline" disabled={busyId === c.id} onClick={() => rejectConsultation(c.id)}>
                      {t('schoolConsult.reject')}
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">{t('schoolConsult.helpSection')}</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {(['speech', 'psychologist', 'special_pedagogue', 'additional_help'] as HelpTeamCategory[]).map((cat) => {
            const q = data.helpQuotas?.[cat];
            return (
              <button
                key={cat}
                type="button"
                className="rounded-xl border bg-card p-4 text-left transition hover:border-primary/40"
                onClick={() => { setBookCategory(cat); setBookOpen(true); }}
              >
                <p className="font-medium">{t(HELP_TEAM_CATEGORY_I18N[cat])}</p>
                {q && (
                  <p className="mt-1 text-sm text-muted-foreground">
                    {q.used + q.reserved}/{q.quota}
                    {q.nextIsPaid ? ' · mokama' : ''}
                  </p>
                )}
              </button>
            );
          })}
        </div>
      </section>

      <ConsultationNeedDialog
        open={needOpen}
        onOpenChange={setNeedOpen}
        students={eligibleStudents}
        subjects={props.subjects || []}
        onSubmitted={load}
      />
      {bookCategory && (
        <HelpTeamBookDialog
          open={bookOpen}
          onOpenChange={setBookOpen}
          category={bookCategory}
          organizationId={orgId}
          students={eligibleStudents}
          specialists={(data.specialists || []).filter((s) => s.help_team_category === bookCategory)}
          helpQuota={data.helpQuotas?.[bookCategory]}
          onBooked={load}
        />
      )}
    </div>
  );
}
