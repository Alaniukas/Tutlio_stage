import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { authHeaders } from '@/lib/apiHelpers';
import { useTranslation } from '@/lib/i18n';
import { CONSULTATION_STATUS_I18N, type ConsultationStatus } from '@/lib/schoolConsultationStatuses';
import { HELP_TEAM_CATEGORY_I18N, type HelpTeamCategory } from '@/lib/schoolHelpTeamQuota';
import ConsultationNeedDialog from '@/components/consultations/ConsultationNeedDialog';
import HelpTeamBookDialog from '@/components/consultations/HelpTeamBookDialog';
import ConsultationNotesDialog from '@/components/consultations/ConsultationNotesDialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { schoolFamilyConsultationText } from '@/lib/i18n/schoolFamilyConsultationTranslations';
import { schoolFamilyConsultationsForView } from '@/lib/schoolFamilyConsultations';

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
  familyPortal?: boolean;
  organizationId?: string;
};

export default function ConsultationsPortal(props: {
  organizationId?: string | null;
  subjects?: { id: string; name: string }[];
  selectedStudentId?: string | null;
}) {
  const { t, locale } = useTranslation();
  const [childFilter, setChildFilter] = useState('');
  const [notesId, setNotesId] = useState<string | null>(null);
  const selectedStudentId = props.selectedStudentId || childFilter;
  const [data, setData] = useState<PortalData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [needOpen, setNeedOpen] = useState(false);
  const [bookOpen, setBookOpen] = useState(false);
  const [bookCategory, setBookCategory] = useState<HelpTeamCategory | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const requestVersion = useRef(0);

  const orgId = props.organizationId || data?.organizationId || data?.students?.[0]?.organization_id || '';

  const load = useCallback(async () => {
    const version = ++requestVersion.current;
    try {
      const headers = await authHeaders();
      const qs = `${orgId ? `?scope=portal&organization_id=${encodeURIComponent(orgId)}` : '?scope=portal'}${selectedStudentId ? `&student_id=${encodeURIComponent(selectedStudentId)}` : ''}`;
      const res = await fetch(`/api/school-consultations${qs}`, { headers });
      const json = await res.json();
      if (version !== requestVersion.current) return;
      if (!res.ok) {
        setError(json.error || t('common.error'));
        setData(null);
        return;
      }
      setData(json);
      setError(null);
    } catch {
      if (version === requestVersion.current) { setError(t('common.error')); setData(null); }
    }
  }, [orgId, selectedStudentId, t]);

  useEffect(() => {
    void load();
    return () => { requestVersion.current += 1; };
  }, [load]);
  useEffect(() => { setNotesId(null); }, [orgId, selectedStudentId]);

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

  if (!data.inSeason && !data.familyPortal) {
    return <p className="text-sm">{t('schoolConsult.offSeason')}</p>;
  }

  if (!eligibleStudents.length) {
    return <p className="text-sm text-muted-foreground">{t('schoolConsult.emptyRequests')}</p>;
  }

  return (
    <div className="space-y-8">
      {!data.inSeason && <p className="text-sm">{t('schoolConsult.offSeason')}</p>}
      {data.familyPortal && !props.selectedStudentId && <Select value={childFilter || 'family-overview'} onValueChange={value => setChildFilter(value === 'family-overview' ? '' : value)}>
        <SelectTrigger aria-label={schoolFamilyConsultationText(locale, 'overview')}><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="family-overview">{schoolFamilyConsultationText(locale, 'overview')}</SelectItem>
          {eligibleStudents.map(student => <SelectItem key={student.id} value={student.id}>{student.full_name}</SelectItem>)}
        </SelectContent>
      </Select>}
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">{t('schoolConsult.usSection')}</h2>
          <Button type="button" disabled={!data.inSeason} onClick={() => setNeedOpen(true)}>{t('schoolConsult.submitNeed')}</Button>
        </div>
        {eligibleStudents.filter(student => !data.familyPortal || !selectedStudentId || student.id === selectedStudentId).map((st) => {
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
                disabled={!data.inSeason}
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
        {data.familyPortal && <div className="space-y-3">
          <h3 className="font-medium">{schoolFamilyConsultationText(locale, 'bookings')}</h3>
          <ul className="space-y-2">{schoolFamilyConsultationsForView(data.consultations || [], selectedStudentId).filter(row => row.kind === 'help_team').map(row => <li key={row.id} className="space-y-2 rounded-xl border p-4">
            <p className="font-medium">{row.target_kind === 'family' ? schoolFamilyConsultationText(locale, 'family') : eligibleStudents.find(student => student.id === row.student_id)?.full_name}</p>
            <p className="text-sm text-muted-foreground">{row.start_time ? new Date(row.start_time).toLocaleString('lt-LT') : ''} · {statusLabel(row.status)}</p>
            {row.canReadNotes && <Button variant="outline" size="sm" onClick={() => setNotesId(row.id)}>{schoolFamilyConsultationText(locale, 'notesOpen')}</Button>}
          </li>)}</ul>
        </div>}
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
          familyPortal={data.familyPortal === true}
          initialStudentId={selectedStudentId || undefined}
          onBooked={load}
        />
      )}
      <ConsultationNotesDialog consultationId={notesId} onClose={() => setNotesId(null)} />
    </div>
  );
}
