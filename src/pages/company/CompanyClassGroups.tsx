import { useEffect, useMemo, useState } from 'react';
import { Pencil, Plus, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { authHeaders } from '@/lib/apiHelpers';
import { invalidateCache } from '@/lib/dataCache';
import { useOrgFeatures } from '@/hooks/useOrgFeatures';
import { useStaffLabels } from '@/hooks/useStaffLabels';
import { useTranslation } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';
import { getOrgVisibleTutors } from '@/lib/orgVisibleTutors';
import ClassGroupFormDialog, {
  type ClassGroupStudentOption,
  type ClassGroupTutorOption,
} from '@/components/company/ClassGroupFormDialog';
import { usesLaisviStyleExtraLessonsPrefill } from '@/lib/laisviVaikaiExtraLessonsDefaults';
import {
  classGroupMatchesQuery,
  classGroupTutorName,
  groupClassGroupsByTutor,
  scheduleLabelFromGroupSlots,
  type SchoolClassGroupRecord,
} from '@/lib/schoolClassGroups';

function formatLtDate(iso: string): string {
  const d = String(iso || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return d || '—';
  const [y, m, day] = d.split('-');
  return `${day}.${m}.${y}`;
}

/** Calendars cache their session lists; a saved group must show up on the next open, not in 5 minutes. */
function dropCalendarCaches() {
  invalidateCache('company_tvarkarastis');
  invalidateCache('company_sessions');
  invalidateCache('company_dashboard');
  invalidateCache('tutor_dashboard');
}

export default function CompanyClassGroups() {
  const { t } = useTranslation();
  const { hasFeature } = useOrgFeatures();
  const { staff } = useStaffLabels();
  const [groups, setGroups] = useState<SchoolClassGroupRecord[]>([]);
  const [students, setStudents] = useState<ClassGroupStudentOption[]>([]);
  const [tutors, setTutors] = useState<ClassGroupTutorOption[]>([]);
  const [isOrgAdmin, setIsOrgAdmin] = useState(false);
  const [userId, setUserId] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<SchoolClassGroupRecord | null>(null);
  const [tutorFilter, setTutorFilter] = useState<string>('all');
  const [query, setQuery] = useState('');
  const [orgId, setOrgId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [materializeWarning, setMaterializeWarning] = useState<string | null>(null);

  const loadGroups = async () => {
    const headers = await authHeaders();
    const res = await fetch('/api/school-class-groups', { headers });
    const data = await res.json().catch(() => ({}));
    if (res.ok) setGroups(data.groups || []);
    setLoaded(true);
  };

  useEffect(() => { void loadGroups(); }, []);

  useEffect(() => {
    void (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setUserId(user.id);
      const { data: adminRow } = await supabase
        .from('organization_admins')
        .select('organization_id')
        .eq('user_id', user.id)
        .maybeSingle();
      const { data: profile } = await supabase
        .from('profiles')
        .select('id, full_name, organization_id')
        .eq('id', user.id)
        .maybeSingle();
      const orgIdResolved = adminRow?.organization_id || profile?.organization_id || null;
      setOrgId(orgIdResolved);
      const admin = Boolean(adminRow?.organization_id);
      setIsOrgAdmin(admin);
      if (!orgIdResolved) return;

      const { data: studentRows } = await supabase
        .from('students')
        .select('id, full_name, grade, enrollment_status')
        .eq('organization_id', orgIdResolved)
        .is('detached_at', null)
        .order('full_name');
      setStudents((studentRows || []) as ClassGroupStudentOption[]);

      if (admin) {
        const tutorFields = usesLaisviStyleExtraLessonsPrefill(orgIdResolved)
          ? 'id, full_name, personal_meeting_link'
          : 'id, full_name';
        const visible = await getOrgVisibleTutors(supabase as never, orgIdResolved, tutorFields);
        setTutors(visible.map((row) => ({
          id: row.id,
          full_name: row.full_name || row.id,
          personal_meeting_link: (row as { personal_meeting_link?: string | null }).personal_meeting_link ?? null,
        })));
      } else if (profile) {
        setTutors([{ id: profile.id, full_name: profile.full_name || profile.id }]);
      }
    })();
  }, []);

  const tutorNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const tutor of tutors) map.set(tutor.id, tutor.full_name);
    for (const group of groups) {
      if (!map.has(group.tutor_id)) map.set(group.tutor_id, classGroupTutorName(group, staff));
    }
    return map;
  }, [tutors, groups, staff]);

  /** Only teachers that actually own a group — the point is to split a long list, not to list staff. */
  const tutorFilterOptions = useMemo(() => {
    const ids = [...new Set(groups.map((group) => group.tutor_id))];
    return ids
      .map((id) => ({ id, full_name: tutorNameById.get(id) || staff }))
      .sort((a, b) => a.full_name.localeCompare(b.full_name, 'lt'));
  }, [groups, tutorNameById, staff]);

  const filteredGroups = useMemo(
    () => groups.filter((group) =>
      (tutorFilter === 'all' || group.tutor_id === tutorFilter)
      && classGroupMatchesQuery(group, query, tutorNameById.get(group.tutor_id))),
    [groups, tutorFilter, query, tutorNameById],
  );

  const sections = useMemo(
    () => groupClassGroupsByTutor(filteredGroups, (id) => tutorNameById.get(id) || staff),
    [filteredGroups, tutorNameById, staff],
  );

  const showTutorTools = isOrgAdmin && tutorFilterOptions.length > 1;
  const showSearch = groups.length > 3 || query.length > 0;

  if (!hasFeature('school_class_groups')) {
    return <p className="text-sm text-gray-500">{t('school.groups.disabled')}</p>;
  }

  const openCreate = () => {
    setEditing(null);
    setModalOpen(true);
  };

  const openEdit = (group: SchoolClassGroupRecord) => {
    setEditing(group);
    setModalOpen(true);
  };

  const deleteGroup = async (group: SchoolClassGroupRecord): Promise<boolean> => {
    const headers = await authHeaders();
    const res = await fetch(`/api/school-class-groups?id=${encodeURIComponent(group.id)}`, {
      method: 'DELETE',
      headers,
    });
    if (!res.ok) return false;
    dropCalendarCaches();
    setGroups((prev) => prev.filter((row) => row.id !== group.id));
    void loadGroups();
    return true;
  };

  const renderCard = (g: SchoolClassGroupRecord) => (
    <button
      key={g.id}
      type="button"
      className="w-full text-left rounded-xl border bg-white p-4 hover:border-emerald-300 hover:shadow-sm transition-colors"
      onClick={() => openEdit(g)}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-semibold text-gray-900">{g.name}</div>
          <div className="text-sm text-gray-600">
            {formatLtDate(g.school_year_start)} – {formatLtDate(g.school_year_end)} · {g.platform} · {g.duration_minutes} min.
          </div>
          <div className="text-sm text-gray-600 mt-1">
            {scheduleLabelFromGroupSlots(g.slots || []) || '—'}
          </div>
          {isOrgAdmin && tutorFilter === 'all' && sections.length <= 1 && (
            <div className="text-sm text-gray-500 mt-1">
              {staff}: {tutorNameById.get(g.tutor_id) || '—'}
            </div>
          )}
          <div className="text-sm text-gray-500 mt-1">
            {t('school.groups.members')}: {(g.members || []).map((m) => m.student?.full_name).filter(Boolean).join(', ') || '—'}
          </div>
        </div>
        <span className="inline-flex items-center gap-1 shrink-0 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-800">
          <Pencil className="w-3.5 h-3.5" />
          {t('school.groups.edit')}
        </span>
      </div>
    </button>
  );

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('school.groups.title')}</h1>
          <p className="text-sm text-gray-600 mt-1">{t('school.groups.lead')}</p>
        </div>
        <Button className="bg-emerald-600 hover:bg-emerald-700 rounded-xl" onClick={openCreate}>
          <Plus className="w-4 h-4 mr-1" />
          {t('school.groups.new')}
        </Button>
      </div>

      {materializeWarning && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900" role="alert">
          <p className="font-semibold">{t('school.groups.materializeWarningTitle')}</p>
          <p className="mt-1">{materializeWarning}</p>
        </div>
      )}

      {(showTutorTools || showSearch) && (
        <div className="flex flex-col sm:flex-row gap-2">
          {showTutorTools && (
            <select
              aria-label={staff}
              className="border rounded-xl h-10 px-3 text-sm bg-white sm:w-64"
              value={tutorFilter}
              onChange={(e) => setTutorFilter(e.target.value)}
            >
              <option value="all">{t('school.groups.filterAll')}</option>
              {tutorFilterOptions.map((tutor) => (
                <option key={tutor.id} value={tutor.id}>{tutor.full_name}</option>
              ))}
            </select>
          )}
          {showSearch && (
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t('school.groups.search')}
                className="rounded-xl pl-9 h-10"
              />
            </div>
          )}
        </div>
      )}

      <div className="space-y-5">
        {groups.length === 0 ? (
          <p className="text-sm text-gray-500">{loaded ? t('school.groups.emptyList') : '…'}</p>
        ) : filteredGroups.length === 0 ? (
          <p className="text-sm text-gray-500">{t('school.groups.noMatches')}</p>
        ) : isOrgAdmin && tutorFilter === 'all' && sections.length > 1 ? (
          sections.map((section) => (
            <section key={section.tutorId} className="space-y-3">
              <h2 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                <span>{section.tutorName}</span>
                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">{section.groups.length}</span>
              </h2>
              {section.groups.map(renderCard)}
            </section>
          ))
        ) : (
          <div className="space-y-3">{filteredGroups.map(renderCard)}</div>
        )}
      </div>

      <ClassGroupFormDialog
        open={modalOpen}
        onOpenChange={setModalOpen}
        mode={editing ? 'edit' : 'create'}
        group={editing}
        students={students}
        tutors={tutors}
        canEditMembers={isOrgAdmin}
        canDelete={isOrgAdmin}
        defaultTutorId={isOrgAdmin ? (tutors.length === 1 ? tutors[0].id : '') : userId}
        organizationId={orgId}
        onSaved={(result) => {
          setMaterializeWarning(result?.materializeError ? t('school.groups.materializeWarningBody') : null);
          dropCalendarCaches();
          void loadGroups();
        }}
        onDelete={deleteGroup}
      />
    </div>
  );
}
