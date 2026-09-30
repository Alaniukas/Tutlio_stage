import { useEffect, useState } from 'react';
import { Loader2, MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTranslation } from '@/lib/i18n';
import { loadStudentAdminNotes, saveStudentNotes, type StudentNotesDraft } from '@/lib/studentNotes';
import StudentNotesFields from './StudentNotesFields';

type Props = {
  studentId: string;
  studentIds: string[];
  tutorComment: string;
  canEdit: boolean;
  onSaved: (draft: StudentNotesDraft) => void;
};

export default function StudentNotesCard({ studentId, studentIds, tutorComment, canEdit, onSaved }: Props) {
  const { t } = useTranslation();
  const [notes, setNotes] = useState<StudentNotesDraft | null>(null);
  const [draft, setDraft] = useState<StudentNotesDraft | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const studentIdsKey = [...new Set(studentIds)].sort().join(',');

  useEffect(() => {
    let cancelled = false;
    setNotes(null);
    setDraft(null);
    setEditing(false);
    setError('');
    void loadStudentAdminNotes(studentId, studentIdsKey.split(',')).then((data) => {
      if (!cancelled) {
        setNotes({ admin_comment: data?.admin_comment || '', last_contacted_at: data?.last_contacted_at || '', tutor_comment: tutorComment });
      }
    }).catch(() => {
      if (!cancelled) setError('load');
    });
    return () => { cancelled = true; };
  }, [studentId, studentIdsKey, tutorComment, retry]);

  const save = async () => {
    if (!draft) return;
    setSaving(true);
    setError('');
    try {
      await saveStudentNotes(studentIds, draft);
      const saved = { ...draft, admin_comment: draft.admin_comment.trim(), tutor_comment: draft.tutor_comment.trim() };
      setNotes(saved);
      setEditing(false);
      onSaved(saved);
    } catch {
      setError('save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <h4 className="flex items-center gap-2 font-semibold text-gray-900">
          <MessageSquare className="h-4 w-4 text-blue-500" />{t('compStu.adminNotesTitle')}
        </h4>
        {!editing && canEdit && notes && (
          <Button type="button" size="sm" variant="outline" className="rounded-lg text-xs"
            onClick={() => { setDraft(notes); setEditing(true); setError(''); }}>{t('compStu.editBtn')}</Button>
        )}
      </div>
      {error && (
        <div role="alert" className="mb-3 text-sm text-red-600">
          {t(error === 'load' ? 'compStu.notesLoadFailed' : 'compStu.commentSaveFailed')}
          {error === 'load' && <Button type="button" size="sm" variant="ghost" onClick={() => setRetry((value) => value + 1)}>{t('stuSess.retry')}</Button>}
        </div>
      )}
      {!notes && !error && <Loader2 aria-label={t('common.loading')} className="h-4 w-4 animate-spin" />}
      {editing && draft ? (
        <div className="space-y-3">
          <StudentNotesFields value={draft} onChange={setDraft} disabled={saving} />
          <div className="flex gap-2">
            <Button type="button" variant="outline" className="flex-1 rounded-lg text-xs" disabled={saving}
              onClick={() => { setEditing(false); setError(''); }}>{t('compStu.cancelBtn')}</Button>
            <Button type="button" className="flex-1 rounded-lg text-xs" disabled={saving} onClick={() => void save()}>
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : t('compStu.saveBtn')}
            </Button>
          </div>
        </div>
      ) : notes ? (
        <div className="space-y-4 text-sm">
          <div className="space-y-2 rounded-xl border border-indigo-100 bg-indigo-50/40 p-3">
            <p className="text-gray-500">{t('compStu.lastContactedAt')}: <span className="text-gray-900">{notes.last_contacted_at || '—'}</span></p>
            <p className="whitespace-pre-wrap text-gray-800">{notes.admin_comment || t('compStu.noComment')}</p>
            <p className="text-xs text-gray-500">{t('compStu.commentVisibleAdmin')}</p>
          </div>
          <div className="space-y-2">
            <h5 className="font-medium text-gray-900">{t('compStu.tutorComment')}</h5>
            <p className="whitespace-pre-wrap text-gray-800">{notes.tutor_comment || t('compStu.noComment')}</p>
            <p className="text-xs text-gray-500">{t('compStu.tutorCommentHint')}</p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
