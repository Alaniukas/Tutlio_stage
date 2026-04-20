import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { authHeaders } from '@/lib/apiHelpers';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { format } from 'date-fns';
import type { Locale } from 'date-fns';
import {
  ListOrdered,
  Plus,
  Trash2,
  Clock,
  User,
  BookOpen,
  AlertCircle,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { useTranslation } from '@/lib/i18n';
import { sortStudentsByFullName } from '@/lib/sortStudentsByFullName';

export type OrgTutorOption = {
  id: string;
  full_name: string;
};

interface WaitlistRow {
  id: string;
  tutor_id: string;
  student_id: string;
  session_id: string | null;
  notes: string | null;
  preferred_day: string | null;
  preferred_time: string | null;
  created_at: string;
  student?: { full_name: string; email: string | null; phone: string | null; tutor_id?: string } | null;
  session?: {
    id: string;
    start_time: string;
    end_time: string;
    topic: string | null;
    status: string;
  } | null;
}

interface StudentRow {
  id: string;
  full_name: string;
  email: string | null;
  tutor_id: string;
}

interface SessionRow {
  id: string;
  start_time: string;
  end_time: string;
  topic: string | null;
  status: string;
  student?: { full_name: string } | null;
}

function parseNotesPreview(notes: string | null, locale: Locale): string | null {
  if (!notes) return null;
  try {
    const j = JSON.parse(notes) as { start_time?: string; topic?: string; queue_position?: number };
    if (j.start_time) {
      const d = new Date(j.start_time);
      return `${format(d, 'EEE d MMM, HH:mm', { locale })}${j.topic ? ` · ${j.topic}` : ''}`;
    }
  } catch {
    /* plain text */
  }
  return notes.length > 120 ? `${notes.slice(0, 120)}…` : notes;
}

export default function CompanyOrgWaitlistPanel({
  tutors,
  variant = 'embed',
}: {
  tutors: OrgTutorOption[];
  variant?: 'embed' | 'page';
}) {
  const { t, dateFnsLocale } = useTranslation();
  const tutorIds = useMemo(() => tutors.map((tu) => tu.id), [tutors]);
  const tutorName = useCallback(
    (id: string) => tutors.find((tu) => tu.id === id)?.full_name || '–',
    [tutors]
  );

  const [loading, setLoading] = useState(true);
  const [entries, setEntries] = useState<WaitlistRow[]>([]);
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [filterTutor, setFilterTutor] = useState('');
  const [expanded, setExpanded] = useState(true);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newEntry, setNewEntry] = useState({
    tutor_id: '',
    student_id: '',
    session_id: '',
    notes: '',
  });
  const [tutorSessions, setTutorSessions] = useState<SessionRow[]>([]);

  const loadEntries = useCallback(async () => {
    if (tutorIds.length === 0) {
      setEntries([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from('waitlists')
      .select(
        'id, tutor_id, student_id, session_id, notes, preferred_day, preferred_time, created_at, student:students(full_name, email, phone, tutor_id), session:sessions(id, start_time, end_time, topic, status)'
      )
      .in('tutor_id', tutorIds)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('[CompanyWaitlist]', error);
      setEntries([]);
      setLoading(false);
      return;
    }

    const now = new Date();
    const rows = (data || []).map((r: any) => ({
      ...r,
      student: Array.isArray(r.student) ? r.student[0] ?? null : r.student ?? null,
      session: Array.isArray(r.session) ? r.session[0] ?? null : r.session ?? null,
    })) as WaitlistRow[];

    const filtered = rows.filter((entry) => {
      if (!entry.session) return true;
      return new Date(entry.session.end_time) >= now;
    });

    setEntries(filtered);
    setLoading(false);
  }, [tutorIds]);

  const loadStudents = useCallback(async () => {
    if (tutorIds.length === 0) {
      setStudents([]);
      return;
    }
    const { data } = await supabase
      .from('students')
      .select('id, full_name, email, tutor_id')
      .in('tutor_id', tutorIds)
      .order('full_name');
    setStudents(data || []);
  }, [tutorIds]);

  useEffect(() => {
    void loadEntries();
    void loadStudents();
  }, [loadEntries, loadStudents]);

  const loadSessionsForTutor = async (tid: string) => {
    if (!tid) {
      setTutorSessions([]);
      return;
    }
    const { data } = await supabase
      .from('sessions')
      .select('id, start_time, end_time, topic, status, student:students(full_name)')
      .eq('tutor_id', tid)
      .eq('status', 'active')
      .gte('start_time', new Date().toISOString())
      .order('start_time', { ascending: true });
    const list = (data || []).map((s: any) => ({
      ...s,
      student: Array.isArray(s.student) ? s.student[0] : s.student,
    }));
    setTutorSessions(list);
  };

  useEffect(() => {
    if (dialogOpen && newEntry.tutor_id) void loadSessionsForTutor(newEntry.tutor_id);
    else if (!dialogOpen) setTutorSessions([]);
  }, [dialogOpen, newEntry.tutor_id]);

  const studentsForTutor = useMemo(
    () => sortStudentsByFullName(students.filter((s) => s.tutor_id === newEntry.tutor_id)),
    [students, newEntry.tutor_id]
  );

  const filteredEntries = useMemo(() => {
    if (!filterTutor) return entries;
    return entries.filter((e) => e.tutor_id === filterTutor);
  }, [entries, filterTutor]);

  const formatSessionLabel = (s: SessionRow) => {
    try {
      const start = new Date(s.start_time);
      return `${format(start, 'EEE, d MMM HH:mm', { locale: dateFnsLocale })}${s.topic ? ` · ${s.topic}` : ''}${s.student?.full_name ? ` (${s.student.full_name})` : ''}`;
    } catch {
      return s.id;
    }
  };

  const handleAdd = async () => {
    if (!newEntry.tutor_id || !newEntry.student_id) return;
    const st = students.find((s) => s.id === newEntry.student_id);
    if (!st || st.tutor_id !== newEntry.tutor_id) {
      alert(t('companyWait.studentMustBelong'));
      return;
    }
    setSaving(true);
    const sessionId =
      newEntry.session_id && newEntry.session_id !== 'any' ? newEntry.session_id : null;
    const { error } = await supabase.from('waitlists').insert([
      {
        tutor_id: newEntry.tutor_id,
        student_id: newEntry.student_id,
        session_id: sessionId,
        notes: newEntry.notes.trim() || null,
        preferred_day: '',
        preferred_time: '',
      },
    ]);

    if (!error) {
      try {
        const tutorProfile = await supabase
          .from('profiles')
          .select('full_name')
          .eq('id', newEntry.tutor_id)
          .single();
        const tutorN = tutorProfile.data?.full_name || t('common.tutor');
        if (st.email) {
          await fetch('/api/send-email', {
            method: 'POST',
            headers: await authHeaders(),
            body: JSON.stringify({
              type: 'waitlist_added',
              to: st.email,
              data: {
                studentName: st.full_name || t('common.student'),
                tutorName: tutorN,
                sessionInfo: null,
              },
            }),
          }).catch(() => {});
        }
      } catch {
        /* optional email */
      }
      setDialogOpen(false);
      setNewEntry({ tutor_id: '', student_id: '', session_id: '', notes: '' });
      await loadEntries();
    } else {
      alert(error.message || t('companyWait.failedToAdd'));
    }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm(t('companyWait.removeConfirm'))) return;
    const { error } = await supabase.from('waitlists').delete().eq('id', id);
    if (!error) await loadEntries();
    else alert(error.message);
  };

  if (tutors.length === 0) {
    if (variant === 'page') {
      return (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center text-gray-500 text-sm">
          {t('companyWait.noTutors')}
        </div>
      );
    }
    return null;
  }

  const toolbarAdd = (
    <Button
      type="button"
      size="sm"
      className="rounded-xl gap-1.5 bg-indigo-600 hover:bg-indigo-700"
      onClick={(e) => {
        e.stopPropagation();
        setNewEntry({ tutor_id: tutors[0]?.id || '', student_id: '', session_id: '', notes: '' });
        setDialogOpen(true);
      }}
    >
      <Plus className="w-4 h-4" />
      {t('common.add')}
    </Button>
  );

  const dialogContent = (
    <>
      <DialogHeader>
        <DialogTitle>{t('companyWait.addToQueue')}</DialogTitle>
        <DialogDescription>{t('companyWait.addToQueueDesc')}</DialogDescription>
      </DialogHeader>
      <div className="grid gap-4 py-2">
        <div className="space-y-2">
          <Label>{t('companyWait.tutorRequired')}</Label>
          <Select
            value={newEntry.tutor_id}
            onValueChange={(val) =>
              setNewEntry({ tutor_id: val, student_id: '', session_id: '', notes: newEntry.notes })
            }
          >
            <SelectTrigger className="rounded-xl">
              <SelectValue placeholder={t('companyWait.selectPlaceholder')} />
            </SelectTrigger>
            <SelectContent>
              {tutors.map((tu) => (
                <SelectItem key={tu.id} value={tu.id}>
                  {tu.full_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>{t('companyWait.studentRequired')}</Label>
          <Select
            value={newEntry.student_id}
            onValueChange={(val) => setNewEntry({ ...newEntry, student_id: val })}
            disabled={!newEntry.tutor_id}
          >
            <SelectTrigger className="rounded-xl">
              <SelectValue placeholder={newEntry.tutor_id ? t('companyWait.selectStudent') : t('companyWait.tutorFirst')} />
            </SelectTrigger>
            <SelectContent>
              {studentsForTutor.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.full_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {newEntry.tutor_id && studentsForTutor.length === 0 && (
            <p className="text-xs text-amber-700 flex items-center gap-1">
              <AlertCircle className="w-3.5 h-3.5" /> {t('companyWait.noStudentsForTutor')}
            </p>
          )}
        </div>

        {newEntry.tutor_id && (
          <div className="space-y-2">
            <Label>{t('companyWait.lessonOptional')}</Label>
            {tutorSessions.length > 0 ? (
              <Select
                value={newEntry.session_id}
                onValueChange={(val) => setNewEntry({ ...newEntry, session_id: val })}
              >
                <SelectTrigger className="rounded-xl">
                  <SelectValue placeholder={t('companyWait.anyTimeQueue')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">{t('companyWait.generalQueue')}</SelectItem>
                  {tutorSessions.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {formatSessionLabel(s)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <div className="flex items-start gap-2 p-3 bg-gray-50 rounded-xl text-xs text-gray-600">
                <Clock className="w-4 h-4 text-gray-400 flex-shrink-0" />
                {t('companyWait.noFutureSessions')}
              </div>
            )}
          </div>
        )}

        <div className="space-y-2">
          <Label>{t('companyWait.notes')}</Label>
          <textarea
            value={newEntry.notes}
            onChange={(e) => setNewEntry({ ...newEntry, notes: e.target.value })}
            rows={2}
            className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
            placeholder={t('companyWait.notesPlaceholder')}
          />
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" className="rounded-xl" onClick={() => setDialogOpen(false)}>
          {t('common.cancel')}
        </Button>
        <Button
          className="rounded-xl bg-indigo-600 hover:bg-indigo-700"
          disabled={saving || !newEntry.tutor_id || !newEntry.student_id}
          onClick={() => void handleAdd()}
        >
          {saving ? '…' : t('common.add')}
        </Button>
      </DialogFooter>
    </>
  );

  const body = (
    <div className="p-4 space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Label className="text-xs text-gray-500">{t('companyWait.filter')}</Label>
            <select
              value={filterTutor}
              onChange={(e) => setFilterTutor(e.target.value)}
              className="text-sm border border-gray-200 rounded-xl px-3 py-2 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-200"
            >
              <option value="">{t('companyWait.allTutors')}</option>
              {tutors.map((tu) => (
                <option key={tu.id} value={tu.id}>
                  {tu.full_name}
                </option>
              ))}
            </select>
            <span className="text-xs text-gray-400">
              {t('companyWait.ofTotal', { filtered: String(filteredEntries.length), total: String(entries.length) })}
            </span>
          </div>

          {loading ? (
            <p className="text-sm text-gray-400 text-center py-8">{t('common.loadingDots')}</p>
          ) : filteredEntries.length === 0 ? (
            <div className="text-center py-10 px-4 border border-dashed border-gray-200 rounded-xl">
              <User className="w-10 h-10 text-gray-200 mx-auto mb-2" />
              <p className="text-sm text-gray-500">{t('companyWait.emptyQueue')}</p>
            </div>
          ) : (
            <>
              {/* Mobile cards */}
              <div className="md:hidden divide-y divide-gray-100 rounded-xl border border-gray-100 overflow-hidden bg-white">
                {filteredEntries.map((entry, idx) => (
                  <div key={entry.id} className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-[11px] text-gray-400 font-semibold uppercase tracking-wide">
                          #{idx + 1} · {tutorName(entry.tutor_id)}
                        </p>
                        <p className="text-sm font-semibold text-gray-900 truncate mt-1">
                          {entry.student?.full_name || '–'}
                        </p>
                        <p className="text-xs text-gray-500 truncate">
                          {entry.student?.email || '—'}
                        </p>
                        <div className="mt-2 text-xs text-gray-600">
                          {entry.session ? (
                            <div className="flex items-start gap-2">
                              <BookOpen className="w-4 h-4 text-indigo-500 flex-shrink-0 mt-0.5" />
                              <div className="min-w-0">
                                <p className="font-medium text-gray-800">
                                  {format(new Date(entry.session.start_time), 'd MMM HH:mm', { locale: dateFnsLocale })}
                                  {entry.session.topic ? ` · ${entry.session.topic}` : ''}
                                </p>
                                <p className="text-[11px] text-gray-400 mt-0.5">
                                  {format(new Date(entry.created_at), 'yyyy-MM-dd HH:mm')}
                                </p>
                              </div>
                            </div>
                          ) : (
                            <>
                              <p className="text-gray-600">
                                {parseNotesPreview(entry.notes, dateFnsLocale) || t('companyWait.generalQueueShort')}
                              </p>
                              <p className="text-[11px] text-gray-400 mt-1">
                                {t('companyWait.inQueueSince', { date: format(new Date(entry.created_at), 'yyyy-MM-dd HH:mm') })}
                              </p>
                            </>
                          )}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDelete(entry.id)}
                        className="p-2 rounded-lg text-gray-300 hover:text-red-600 hover:bg-red-50 transition-colors flex-shrink-0"
                        title={t('common.remove')}
                        aria-label={t('companyWait.removeConfirm')}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Desktop table */}
              <div className="hidden md:block overflow-x-auto rounded-xl border border-gray-100">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      <th className="px-3 py-2.5">#</th>
                      <th className="px-3 py-2.5">{t('companyWait.thTutor')}</th>
                      <th className="px-3 py-2.5">{t('companyWait.thStudent')}</th>
                      <th className="px-3 py-2.5">{t('companyWait.thRequest')}</th>
                      <th className="px-3 py-2.5">{t('companyWait.thSince')}</th>
                      <th className="px-3 py-2.5 text-right">{t('companyWait.thActions')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {filteredEntries.map((entry, idx) => (
                      <tr key={entry.id} className="hover:bg-gray-50/80">
                        <td className="px-3 py-3 text-gray-400 font-medium">{idx + 1}</td>
                        <td className="px-3 py-3 font-medium text-gray-900">{tutorName(entry.tutor_id)}</td>
                        <td className="px-3 py-3">
                          <p className="font-medium text-gray-800">{entry.student?.full_name || '–'}</p>
                          <p className="text-xs text-gray-400 truncate max-w-[200px]">{entry.student?.email || ''}</p>
                        </td>
                        <td className="px-3 py-3 text-gray-600">
                          {entry.session ? (
                            <span className="inline-flex items-start gap-1.5">
                              <BookOpen className="w-3.5 h-3.5 text-indigo-500 mt-0.5 flex-shrink-0" />
                              <span>
                                {format(new Date(entry.session.start_time), 'd MMM HH:mm', { locale: dateFnsLocale })}
                                {entry.session.topic ? ` · ${entry.session.topic}` : ''}
                              </span>
                            </span>
                          ) : (
                            <span className="text-xs text-gray-500">
                              {(entry.preferred_day || entry.preferred_time) && (
                                <>
                                  {entry.preferred_day} {entry.preferred_time}
                                  <br />
                                </>
                              )}
                              {parseNotesPreview(entry.notes, dateFnsLocale) || t('companyWait.generalQueueShort')}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-3 text-gray-500 whitespace-nowrap text-xs">
                          {format(new Date(entry.created_at), 'yyyy-MM-dd HH:mm')}
                        </td>
                        <td className="px-3 py-3 text-right">
                          <button
                            type="button"
                            onClick={() => handleDelete(entry.id)}
                            className="p-2 rounded-lg text-gray-300 hover:text-red-600 hover:bg-red-50 transition-colors inline-flex"
                            title={t('common.remove')}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
    </div>
  );

  if (variant === 'page') {
    return (
      <>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-gray-100 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-gray-600">{t('companyWait.allRecords')}</p>
            {toolbarAdd}
          </div>
          {body}
        </div>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="w-[95vw] sm:max-w-[440px] max-h-[90vh] overflow-y-auto">
            {dialogContent}
          </DialogContent>
        </Dialog>
      </>
    );
  }

  return (
    <>
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="w-full flex items-center justify-between p-4 sm:p-5 bg-gradient-to-r from-indigo-50/80 to-violet-50/80 hover:from-indigo-50 hover:to-violet-50 transition-colors border-b border-gray-100"
        >
          <div className="flex items-center gap-3 text-left min-w-0">
            <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center flex-shrink-0">
              <ListOrdered className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-lg font-bold text-gray-900">{t('companyWait.title')}</h2>
              <p className="text-xs text-gray-500 truncate">{t('companyWait.titleDesc')}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {toolbarAdd}
            {expanded ? <ChevronUp className="w-5 h-5 text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-400" />}
          </div>
        </button>

        {expanded && body}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="w-[95vw] sm:max-w-[440px] max-h-[90vh] overflow-y-auto">
          {dialogContent}
        </DialogContent>
      </Dialog>
    </>
  );
}
