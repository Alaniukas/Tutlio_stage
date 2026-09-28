import { useCallback, useEffect, useState } from 'react';
import Layout from '@/components/Layout';
import { Button } from '@/components/ui/button';
import ConsultationNotesDialog from '@/components/consultations/ConsultationNotesDialog';
import { useOrgFeatures } from '@/hooks/useOrgFeatures';
import { authHeaders } from '@/lib/apiHelpers';
import { useTranslation } from '@/lib/i18n';
import { schoolFamilyConsultationText } from '@/lib/i18n/schoolFamilyConsultationTranslations';
import { CONSULTATION_STATUS_I18N, type ConsultationStatus } from '@/lib/schoolConsultationStatuses';

export default function TutorConsultations() {
  const { t, locale } = useTranslation();
  const { organizationId, entityType, hasFeature, loading } = useOrgFeatures();
  const [rows, setRows] = useState<any[]>([]);
  const [notesId, setNotesId] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const enabled = entityType === 'school' && hasFeature('school_family_portal');
  const load = useCallback(async () => {
    if (!organizationId || !enabled) return;
    try {
      const headers = await authHeaders();
      const res = await fetch(`/api/school-consultations?scope=specialist&organization_id=${encodeURIComponent(organizationId)}`, { headers });
      const json = await res.json();
      if (!res.ok) throw new Error();
      setRows(json.consultations || []); setError(false);
    } catch { setRows([]); setError(true); }
  }, [organizationId, enabled]);
  useEffect(() => { void load(); }, [load]);
  return <Layout><div className="space-y-5 p-4">
    <h1 className="text-2xl font-semibold">{t('schoolConsult.title')}</h1>
    {loading ? <p>{t('common.loading')}</p> : !enabled || error ? <p role="alert">{t('common.error')}</p> : rows.length === 0 ? <p>{t('schoolConsult.emptyConsultations')}</p> :
      <ul className="space-y-3">{rows.map(row => <li key={row.id} className="space-y-2 rounded-xl border p-4">
        <p className="font-medium">{row.target_kind === 'family' ? schoolFamilyConsultationText(locale, 'family') : row.student?.full_name}</p>
        <p className="text-sm">{row.start_time ? new Date(row.start_time).toLocaleString(locale) : ''}</p>
        <p className="text-sm text-muted-foreground">{t(CONSULTATION_STATUS_I18N[row.status as ConsultationStatus] || row.status)}</p>
        {row.canReadNotes && <Button size="sm" variant="outline" onClick={() => setNotesId(row.id)}>{schoolFamilyConsultationText(locale, row.canWriteNotes ? 'notesEdit' : 'notesOpen')}</Button>}
      </li>)}</ul>}
    <ConsultationNotesDialog consultationId={notesId} onClose={() => setNotesId(null)} />
  </div></Layout>;
}
