import { useEffect, useState } from 'react';
import { Pencil, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { authHeaders } from '@/lib/apiHelpers';
import { useOrgFeatures } from '@/hooks/useOrgFeatures';
import { useTranslation } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';
import { getOrgVisibleTutors } from '@/lib/orgVisibleTutors';
import ClassGroupFormDialog, {
  type ClassGroupStudentOption,
  type ClassGroupTutorOption,
} from '@/components/company/ClassGroupFormDialog';
import { scheduleLabelFromGroupSlots, type SchoolClassGroupRecord } from '@/lib/schoolClassGroups';

function formatLtDate(iso: string): string {
  const d = String(iso || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return d || '—';
  const [y, m, day] = d.split('-');
  return `${day}.${m}.${y}`;
}

export default function CompanyClassGroups() {
  const { t } = useTranslation();
  const { hasFeature } = useOrgFeatures();
  const [groups, setGroups] = useState<SchoolClassGroupRecord[]>([]);
  const [students, setStudents] = useState<ClassGroupStudentOption[]>([]);
  const [tutors, setTutors] = useState<ClassGroupTutorOption[]>([]);
  const [isOrgAdmin, setIsOrgAdmin] = useState(false);
  const [userId, setUserId] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<SchoolClassGroupRecord | null>(null);

  const loadGroups = async () => {
    const headers = await authHeaders();
    const res = await fetch('/api/school-class-groups', { headers });
    const data = await res.json().catch(() => ({}));
    if (res.ok) setGroups(data.groups || []);
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
      const orgId = adminRow?.organization_id || profile?.organization_id;
      const admin = Boolean(adminRow?.organization_id);
      setIsOrgAdmin(admin);
      if (!orgId) return;

      const { data: studentRows } = await supabase
        .from('students')
        .select('id, full_name, grade, enrollment_status')
        .eq('organization_id', orgId)
        .is('detached_at', null)
        .order('full_name');
      setStudents((studentRows || []) as ClassGroupStudentOption[]);

      if (admin) {
        const visible = await getOrgVisibleTutors(supabase as never, orgId, 'id, full_name');
        setTutors(visible.map((row) => ({ id: row.id, full_name: row.full_name || row.id })));
      } else if (profile) {
        setTutors([{ id: profile.id, full_name: profile.full_name || profile.id }]);
      }
    })();
  }, []);

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

      <div className="space-y-3">
        {groups.length === 0 ? (
          <p className="text-sm text-gray-500">{t('school.groups.emptyList')}</p>
        ) : groups.map((g) => (
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
                <div className="text-sm text-gray-500 mt-1">
                  {t('school.groups.members')}: {(g.members || []).map((m) => m.student?.full_name).filter(Boolean).join(', ') || '—'}
                </div>
              </div>
              <span className="inline-flex items-center gap-1 shrink-0 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-800">
                <Pencil className="w-3.5 h-3.5" />
                {t('common.edit')}
              </span>
            </div>
          </button>
        ))}
      </div>

      <ClassGroupFormDialog
        open={modalOpen}
        onOpenChange={setModalOpen}
        mode={editing ? 'edit' : 'create'}
        group={editing}
        students={students}
        tutors={tutors}
        canEditMembers={isOrgAdmin}
        defaultTutorId={isOrgAdmin ? (tutors.length === 1 ? tutors[0].id : '') : userId}
        onSaved={() => { void loadGroups(); }}
      />
    </div>
  );
}
