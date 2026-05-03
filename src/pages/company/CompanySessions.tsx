import { useEffect, useState, useMemo, useCallback } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { SessionStatCards } from '@/components/SessionStatCards';
import { calculateSessionStats } from '@/lib/session-stats';
import { supabase } from '@/lib/supabase';
import { getCached, setCache } from '@/lib/dataCache';
import { authHeaders } from '@/lib/apiHelpers';
import { format } from 'date-fns';
import { useTranslation } from '@/lib/i18n';
import { CalendarDays, Search, ChevronDown, ListOrdered, UserX, XCircle, CheckCircle, Pencil, Ban, Loader2, MessageSquare, Trash2 } from 'lucide-react';
import { defaultNoShowWhenForNow, buildNoShowSessionPatch } from '@/lib/noShowWhen';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import StatusBadge from '@/components/StatusBadge';
import { cn } from '@/lib/utils';
import { getOrgVisibleTutors } from '@/lib/orgVisibleTutors';
import { sortStudentsByFullName } from '@/lib/sortStudentsByFullName';
import { DateRangeFilter } from '@/components/DateRangeFilter';
import { DateTimeSpinner } from '@/components/TimeSpinner';

interface Session {
  id: string;
  tutor_id: string;
  student_id: string;
  start_time: string;
  end_time: string;
  status: string;
  price: number | null;
  topic: string | null;
  paid: boolean;
  payment_status: string | null;
  cancellation_reason: string | null;
  cancelled_by?: 'tutor' | 'student' | null;
  tutor_name: string;
  student_name: string;
  subject_is_group?: boolean | null;
  subject_id?: string | null;
  meeting_link?: string | null;
  recurring_session_id?: string | null;
  tutor_comment?: string | null;
  show_comment_to_student?: boolean;
  student_admin_comment?: string | null;
  student_admin_comment_visible_to_tutor?: boolean;
}

interface Subject {
  id: string;
  name: string;
  price: number;
  tutor_id: string;
}

const ORG_SESSION_DETAIL_SELECT =
  '*, student:students(full_name, admin_comment, admin_comment_visible_to_tutor), subjects(is_group), tutor_comment, show_comment_to_student';

function mapOrgSessionRow(row: any, tutorList: { id: string; full_name: string }[]): Session {
  return {
    id: row.id,
    tutor_id: row.tutor_id,
    student_id: row.student_id,
    start_time: row.start_time,
    end_time: row.end_time,
    status: row.status,
    price: row.price,
    topic: row.topic,
    paid: row.paid,
    payment_status: row.payment_status || null,
    cancellation_reason: row.cancellation_reason,
    cancelled_by: row.cancelled_by ?? null,
    tutor_name: tutorList.find((t) => t.id === row.tutor_id)?.full_name || '–',
    student_name: row.student?.full_name || '–',
    subject_is_group: row.subjects?.is_group ?? null,
    subject_id: row.subject_id || null,
    meeting_link: row.meeting_link || null,
    recurring_session_id: row.recurring_session_id || null,
    tutor_comment: row.tutor_comment || null,
    show_comment_to_student: row.show_comment_to_student ?? false,
    student_admin_comment: row.student?.admin_comment ?? null,
    student_admin_comment_visible_to_tutor: row.student?.admin_comment_visible_to_tutor ?? false,
  };
}

export default function CompanySessions() {
  const { t, locale, dateFnsLocale } = useTranslation();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const orgBasePath = location.pathname.startsWith('/school') ? '/school' : '/company';

  const statusOptions = useMemo(
    () => [
      { value: '', label: t('compSess.allStatuses') },
      { value: 'active', label: t('compSess.activeLabel') },
      { value: 'completed', label: t('compSess.completedLabel') },
      { value: 'no_show', label: t('compSess.noShowFilter') },
      { value: 'cancelled', label: t('compSess.cancelledLabel') },
    ],
    [t]
  );

  const sc = getCached<any>('company_sessions');
  const [loading, setLoading] = useState(!sc);
  const [sessions, setSessions] = useState<Session[]>(sc?.sessions ?? []);
  const [tutors, setTutors] = useState<{ id: string; full_name: string }[]>(sc?.tutors ?? []);
  const [filterTutor, setFilterTutor] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [search, setSearch] = useState('');
  const [sortNewest, setSortNewest] = useState(true);
  const [filterStartDate, setFilterStartDate] = useState<Date | null>(null);
  const [filterEndDate, setFilterEndDate] = useState<Date | null>(null);
  const [isFilterActive, setIsFilterActive] = useState(false);
  const [selectedSession, setSelectedSession] = useState<Session | null>(null);
  const [markingNoShow, setMarkingNoShow] = useState(false);
  const [cancelMode, setCancelMode] = useState(false);
  const [cancellationReason, setCancellationReason] = useState('');
  const [cancellingSession, setCancellingSession] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editTopic, setEditTopic] = useState('');
  const [editStartTime, setEditStartTime] = useState('');
  const [editDurationMinutes, setEditDurationMinutes] = useState(60);
  const [editTutorId, setEditTutorId] = useState('');
  const [editStudentId, setEditStudentId] = useState('');
  const [editSubjectId, setEditSubjectId] = useState('');
  const [editPrice, setEditPrice] = useState(0);
  const [editMeetingLink, setEditMeetingLink] = useState('');
  const [editPaid, setEditPaid] = useState(false);
  const [editStatus, setEditStatus] = useState('active');
  const [groupEditChoice, setGroupEditChoice] = useState<'single' | 'all_future'>('single');
  const [savingEdit, setSavingEdit] = useState(false);
  const [togglingPaid, setTogglingPaid] = useState(false);
  const [deletingSession, setDeletingSession] = useState(false);
  const [deleteRecurringOpen, setDeleteRecurringOpen] = useState(false);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [students, setStudents] = useState<{ id: string; full_name: string; tutor_id: string; linked_user_id: string | null }[]>(sc?.students ?? []);
  const [filterStudent, setFilterStudent] = useState('');

  useEffect(() => {
    if (!getCached('company_sessions')) loadData();
  }, []);

  const loadData = async () => {
    if (!getCached('company_sessions')) setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }

    const { data: adminRow } = await supabase
      .from('organization_admins')
      .select('organization_id')
      .eq('user_id', user.id)
      .maybeSingle();
    if (!adminRow) return;

    const tutorList = await getOrgVisibleTutors(
      supabase as any,
      adminRow.organization_id,
      'id, full_name, email',
    );
    setTutors(tutorList);

    const [studentsResult, subjectsResult] = await Promise.all([
      supabase
        .from('students')
        .select('id, full_name, tutor_id, linked_user_id')
        .eq('organization_id', adminRow.organization_id)
        .order('full_name'),
      supabase
        .from('subjects')
        .select('id, name, price, tutor_id')
        .in('tutor_id', tutorList.map(t => t.id))
        .order('name'),
    ]);
    setStudents(studentsResult.data || []);
    setSubjects(subjectsResult.data || []);

    if (tutorList.length === 0) { setLoading(false); return; }

    const tutorIds = tutorList.map(t => t.id);

    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

    const { data: sessionsData } = await supabase
      .from('sessions')
      .select(ORG_SESSION_DETAIL_SELECT)
      .in('tutor_id', tutorIds)
      .gte('start_time', threeMonthsAgo.toISOString())
      .order('start_time', { ascending: false })
      .limit(2000);

    const enriched: Session[] = (sessionsData || []).map((s: any) => mapOrgSessionRow(s, tutorList));

    setSessions(enriched);
    setCache('company_sessions', { sessions: enriched, tutors: tutorList, students: studentsResult.data || [] });
    setLoading(false);
  };

  const handleMarkStudentNoShow = async () => {
    if (!selectedSession) return;
    const sessionId = selectedSession.id;
    setMarkingNoShow(true);
    const when = defaultNoShowWhenForNow(new Date(selectedSession.start_time), new Date(selectedSession.end_time));
    const patch = buildNoShowSessionPatch(when, (selectedSession as any).tutor_comment);
    const { error } = await supabase.from('sessions').update(patch).eq('id', sessionId);
    setMarkingNoShow(false);
    if (!error) {
      setSelectedSession(null);
      loadData();
      void (async () => {
        await fetch('/api/notify-session-no-show', {
          method: 'POST',
          headers: await authHeaders(),
          body: JSON.stringify({ sessionId }),
        });
      })().catch(() => {});
    }
  };

  const handleCancelSession = async () => {
    if (!selectedSession || cancellationReason.trim().length < 5) return;
    setCancellingSession(true);
    try {
      const res = await fetch('/api/cancel-session', {
        method: 'POST',
        headers: await authHeaders(),
        body: JSON.stringify({
          sessionId: selectedSession.id,
          tutorId: selectedSession.tutor_id,
          reason: cancellationReason.trim(),
          cancelledBy: 'tutor',
          studentName: selectedSession.student_name,
          tutorName: selectedSession.tutor_name,
          studentEmail: null,
          tutorEmail: null,
        }),
      });
      if (res.ok) {
        setSelectedSession(null);
        setCancelMode(false);
        setCancellationReason('');
        loadData();
      }
    } finally {
      setCancellingSession(false);
    }
  };

  const handleTogglePaid = async () => {
    if (!selectedSession) return;
    setTogglingPaid(true);
    const newPaid = !selectedSession.paid;
    const { error } = await supabase
      .from('sessions')
      .update({ paid: newPaid, payment_status: newPaid ? 'paid' : 'pending' })
      .eq('id', selectedSession.id);
    setTogglingPaid(false);
    if (!error) {
      setSelectedSession({ ...selectedSession, paid: newPaid, payment_status: newPaid ? 'paid' : 'pending' });
      setSessions(prev => prev.map(s => s.id === selectedSession.id ? { ...s, paid: newPaid, payment_status: newPaid ? 'paid' : 'pending' } : s));
    }
  };

  const hardDeleteCompanySession = async (sessionId: string, deleteScope: 'single' | 'future' = 'single') => {
    const resp = await fetch('/api/delete-session', {
      method: 'POST',
      headers: await authHeaders(),
      body: JSON.stringify({ sessionId, deleteScope }),
    });
    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      throw new Error(text || t('cal.deleteFailed'));
    }
  };

  const hardDeleteCompanySessionWithApproval = async (deleteScope: 'single' | 'future') => {
    if (!selectedSession) return;
    const targetId = selectedSession.id;
    const msg =
      deleteScope === 'future' ? t('cal.deleteConfirmFuture') : t('cal.deleteConfirmSingle');
    if (!confirm(msg)) return;

    setDeletingSession(true);
    setDeleteRecurringOpen(false);
    setSelectedSession(null);

    try {
      await hardDeleteCompanySession(targetId, deleteScope);
      loadData();
    } catch (e: any) {
      alert(e?.message || t('cal.deleteFailed'));
      loadData();
    } finally {
      setDeletingSession(false);
    }
  };

  const handleHardDeleteCompanySession = () => {
    if (!selectedSession) return;
    if (selectedSession.recurring_session_id) {
      setDeleteRecurringOpen(true);
      return;
    }
    void hardDeleteCompanySessionWithApproval('single');
  };

  const handleSaveEdit = async () => {
    if (!selectedSession) return;
    setSavingEdit(true);
    try {
      const newStart = new Date(editStartTime);
      if (Number.isNaN(newStart.getTime())) throw new Error(t('compSch.invalidStartDateTime'));
      const newEnd = new Date(newStart.getTime() + editDurationMinutes * 60 * 1000);

      const payload: Record<string, any> = {
        start_time: newStart.toISOString(),
        end_time: newEnd.toISOString(),
        topic: editTopic || null,
        meeting_link: editMeetingLink || null,
        price: editPrice,
        subject_id: editSubjectId || null,
        student_id: editStudentId || selectedSession.student_id,
        tutor_id: editTutorId || selectedSession.tutor_id,
        paid: editPaid,
        payment_status: editPaid ? 'paid' : 'pending',
        status: editStatus,
      };

      if (groupEditChoice === 'all_future' && selectedSession.recurring_session_id) {
        const { error } = await supabase
          .from('sessions')
          .update(payload)
          .eq('recurring_session_id', selectedSession.recurring_session_id)
          .gte('start_time', selectedSession.start_time);
        if (error) throw new Error(error.message);
      } else {
        const { error } = await supabase
          .from('sessions')
          .update(payload)
          .eq('id', selectedSession.id);
        if (error) throw new Error(error.message);
      }

      setEditMode(false);
      setSelectedSession(null);
      loadData();
    } catch (err: any) {
      alert(t('compSch.errorSaving', { msg: err.message }));
    }
    setSavingEdit(false);
  };

  const openSessionDialog = useCallback(
    (session: Session) => {
      setSelectedSession(session);
      setCancelMode(false);
      setCancellationReason('');
      setEditMode(false);
      setDeleteRecurringOpen(false);
      setGroupEditChoice('single');
      setEditTopic(session.topic || '');
      const start = new Date(session.start_time);
      const end = new Date(session.end_time);
      const durMs = end.getTime() - start.getTime();
      setEditStartTime(format(start, "yyyy-MM-dd'T'HH:mm"));
      setEditDurationMinutes(Math.round(durMs / 60000));
      setEditTutorId(session.tutor_id);
      setEditStudentId(session.student_id);
      setEditSubjectId(session.subject_id || '');
      setEditPrice(session.price || 0);
      setEditMeetingLink(session.meeting_link || '');
      setEditPaid(session.paid);
      setEditStatus(session.status);

      const sid = session.id;
      void (async () => {
        const { data: row, error } = await supabase
          .from('sessions')
          .select(ORG_SESSION_DETAIL_SELECT)
          .eq('id', sid)
          .maybeSingle();
        if (error || !row) return;
        const mapped = mapOrgSessionRow(row, tutors);
        setSelectedSession((prev) => (!prev || prev.id !== sid ? prev : mapped));
        setSessions((prev) => prev.map((s) => (s.id === sid ? mapped : s)));
      })();
    },
    [tutors],
  );

  const deepLinkSessionId = searchParams.get('open')?.trim() ?? '';

  /** Open lesson modal from dashboard (or deep link): ?open=<sessionId> */
  useEffect(() => {
    if (!deepLinkSessionId || loading) return;
    if (tutors.length === 0) {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.delete('open');
          return next;
        },
        { replace: true },
      );
      return;
    }

    const clearOpenParam = () => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.delete('open');
          return next;
        },
        { replace: true },
      );
    };

    const fromList = sessions.find((s) => s.id === deepLinkSessionId);
    if (fromList) {
      openSessionDialog(fromList);
      clearOpenParam();
      return;
    }

    let cancelled = false;
    (async () => {
      const { data: row, error } = await supabase
        .from('sessions')
        .select(ORG_SESSION_DETAIL_SELECT)
        .eq('id', deepLinkSessionId)
        .maybeSingle();
      if (cancelled) return;
      if (error || !row) {
        clearOpenParam();
        return;
      }
      if (!tutors.some((tu) => tu.id === row.tutor_id)) {
        clearOpenParam();
        return;
      }
      const enriched = mapOrgSessionRow(row, tutors);
      openSessionDialog(enriched);
      clearOpenParam();
    })();

    return () => {
      cancelled = true;
    };
  }, [deepLinkSessionId, loading, sessions, tutors, setSearchParams, openSessionDialog]);

  const isFutureSession = (session: Session | null) => {
    if (!session) return false;
    return new Date(session.start_time) > new Date() && session.status === 'active';
  };

  const uniqueStudents = useMemo(() => {
    const seen = new Map<string, { id: string; full_name: string; ids: Set<string> }>();
    for (const s of students) {
      const key = s.linked_user_id || `name:${s.full_name}`;
      if (!seen.has(key)) {
        seen.set(key, { id: s.id, full_name: s.full_name, ids: new Set([s.id]) });
      } else {
        seen.get(key)!.ids.add(s.id);
      }
    }
    return Array.from(seen.values());
  }, [students]);

  const studentIdSetForFilter = useMemo(() => {
    if (!filterStudent) return null;
    const match = uniqueStudents.find(s => s.id === filterStudent);
    return match ? match.ids : new Set([filterStudent]);
  }, [filterStudent, uniqueStudents]);

  const filtered = useMemo(() => {
    const list = sessions.filter(s => {
      if (isFilterActive) {
        const when = new Date(s.start_time);
        if (filterStartDate) {
          const start = new Date(filterStartDate);
          start.setHours(0, 0, 0, 0);
          if (when < start) return false;
        }
        if (filterEndDate) {
          const end = new Date(filterEndDate);
          end.setHours(23, 59, 59, 999);
          if (when > end) return false;
        }
      }
      if (filterTutor && s.tutor_id !== filterTutor) return false;
      if (filterStatus && s.status !== filterStatus) return false;
      if (studentIdSetForFilter && !studentIdSetForFilter.has(s.student_id)) return false;
      if (search) {
        const q = search.toLowerCase();
        if (
          !s.tutor_name.toLowerCase().includes(q) &&
          !s.student_name.toLowerCase().includes(q) &&
          !(s.topic || '').toLowerCase().includes(q)
        ) return false;
      }
      return true;
    });
    return sortNewest
      ? list.sort((a, b) => new Date(b.start_time).getTime() - new Date(a.start_time).getTime())
      : list.sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());
  }, [sessions, filterTutor, filterStatus, studentIdSetForFilter, search, isFilterActive, filterStartDate, filterEndDate, sortNewest]);

  if (loading) {
    return (
      <>
        <div className="flex items-center justify-center h-64">
          <div className="w-8 h-8 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
        </div>
      </>
    );
  }

  return (
    <>
      <div className="max-w-5xl mx-auto space-y-5">
        {/* Header */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{t('compSess.lessonsTitle')}</h1>
            <p className="text-sm text-gray-500 mt-0.5">{t('compSess.totalCount', { count: sessions.length })}</p>
          </div>
          <Button variant="outline" className="gap-2 rounded-xl border-indigo-200 text-indigo-700 hover:bg-indigo-50 shrink-0" asChild>
            <Link to={`${orgBasePath}/waitlist`}>
              <ListOrdered className="w-4 h-4" />
              {t('compSess.waitlist')}
            </Link>
          </Button>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex flex-wrap gap-3">
          <div className="w-full">
            <DateRangeFilter
              startDate={filterStartDate}
              endDate={filterEndDate}
              onStartDateChange={setFilterStartDate}
              onEndDateChange={setFilterEndDate}
              onClear={() => {
                setFilterStartDate(null);
                setFilterEndDate(null);
                setIsFilterActive(false);
              }}
              onSearch={() => setIsFilterActive(true)}
            />
          </div>
          <div className="relative flex-1 min-w-0 w-full sm:min-w-[180px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              placeholder={t('compSess.searchPlaceholder')}
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9 rounded-xl"
            />
          </div>

          <Button
            variant="outline"
            size="sm"
            className="rounded-xl gap-1.5 flex-shrink-0"
            onClick={() => setSortNewest(v => !v)}
          >
            <ListOrdered className="w-4 h-4" />
            {sortNewest ? t('compSess.newestFirst') : t('compSess.oldestFirst')}
          </Button>

          <div className="relative">
            <select
              value={filterTutor}
              onChange={e => setFilterTutor(e.target.value)}
              className="appearance-none bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 pr-8 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-300"
            >
              <option value="">{t('compSess.allTutors')}</option>
              {tutors.map(t => (
                <option key={t.id} value={t.id}>{t.full_name}</option>
              ))}
            </select>
            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
          </div>

          <div className="relative">
            <select
              value={filterStatus}
              onChange={e => setFilterStatus(e.target.value)}
              className="appearance-none bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 pr-8 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-300"
            >
              {statusOptions.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
          </div>

          <div className="relative">
            <select
              value={filterStudent}
              onChange={e => setFilterStudent(e.target.value)}
              className="appearance-none bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 pr-8 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-300"
            >
              <option value="">{t('compSess.allStudents')}</option>
              {uniqueStudents.map(s => (
                <option key={s.id} value={s.id}>{s.full_name}</option>
              ))}
            </select>
            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
          </div>
        </div>

        {/* Stats */}
        {filtered.length > 0 && (() => {
          const stats = calculateSessionStats(filtered as any, null, null);
          return (
            <SessionStatCards
              totalSuccessful={stats.totalSuccessful}
              totalStudentNoShow={stats.totalStudentNoShow}
              totalCancelled={stats.totalCancelled}
              showCancellationDetails={true}
              cancelledByTutor={stats.cancelledByTutor}
              cancelledByStudent={stats.cancelledByStudent}
            />
          );
        })()}

        {/* Session list */}
        {filtered.length === 0 ? (
          <div className="bg-white rounded-2xl border border-dashed border-gray-200 p-12 text-center text-gray-400">
            <CalendarDays className="w-8 h-8 mx-auto mb-2 opacity-40" />
            <p className="text-sm">{t('compSess.noLessons')}</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          {/* Mobile cards */}
          <div className="md:hidden divide-y divide-gray-100">
            {filtered.map((session) => {
              const paid = session.paid || session.payment_status === 'paid' || session.payment_status === 'confirmed';
              return (
                <button
                  key={session.id}
                  type="button"
                  className="w-full text-left p-4 hover:bg-gray-50 transition-colors"
                  onClick={() => openSessionDialog(session)}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate flex items-center gap-1">
                        {session.student_name}
                        {session.tutor_comment && <MessageSquare className="w-3 h-3 text-blue-500 flex-shrink-0" />}
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5 truncate">
                        {session.tutor_name}
                        {session.topic ? ` · ${session.topic}` : ''}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        {format(new Date(session.start_time), 'd MMM yyyy', { locale: dateFnsLocale })}{' '}
                        · {format(new Date(session.start_time), 'HH:mm')}–{format(new Date(session.end_time), 'HH:mm')}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-2 flex-shrink-0">
                      <div className="scale-90 origin-top-right">
                        <StatusBadge
                          status={session.status}
                          paymentStatus={session.payment_status ?? undefined}
                          paid={session.paid}
                          endTime={session.end_time}
                        />
                      </div>
                      <span
                        className={cn(
                          'inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full border',
                          paid ? 'bg-green-50 text-green-700 border-green-100' : 'bg-amber-50 text-amber-700 border-amber-100'
                        )}
                      >
                        {paid ? t('compSess.paidShort') : t('compSess.pendingShort')}
                      </span>
                      <span className="text-sm font-semibold text-gray-900">
                        {session.price != null ? `${session.price.toFixed(2)} €` : '–'}
                      </span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Desktop table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  <th className="text-left px-4 py-3">{t('compSess.colDateTime')}</th>
                  <th className="text-left px-4 py-3">{t('compSess.colTutor')}</th>
                  <th className="text-left px-4 py-3">{t('compSess.colStudent')}</th>
                  <th className="text-left px-4 py-3">{t('compSess.colSubject')}</th>
                  <th className="text-left px-4 py-3">{t('compSess.colStatus')}</th>
                  <th className="text-left px-4 py-3">{t('compSess.colPayment')}</th>
                  <th className="text-right px-4 py-3">{t('compSess.colPrice')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map(session => (
                  <tr key={session.id} className="hover:bg-gray-50/70 transition-colors cursor-pointer" onClick={() => openSessionDialog(session)}>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <p className="font-medium text-gray-900">
                        {format(new Date(session.start_time), 'd MMM yyyy', { locale: dateFnsLocale })}
                      </p>
                      <p className="text-xs text-gray-500">
                        {format(new Date(session.start_time), 'HH:mm')}–{format(new Date(session.end_time), 'HH:mm')}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-800">{session.tutor_name}</p>
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      <span className="inline-flex items-center gap-1">
                        {session.student_name}
                        {session.tutor_comment && <MessageSquare className="w-3 h-3 text-blue-500" />}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600 max-w-[160px] truncate">
                      {session.topic || '–'}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge
                        status={session.status}
                        paymentStatus={session.payment_status ?? undefined}
                        paid={session.paid}
                        endTime={session.end_time}
                      />
                    </td>
                    <td className="px-4 py-3">
                      {session.paid || session.payment_status === 'paid' || session.payment_status === 'confirmed' ? (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-green-50 text-green-700 border border-green-100">
                          {t('compSess.paidShort')}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-100">
                          {t('compSess.pendingShort')}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-gray-800">
                      {session.price != null ? `${session.price.toFixed(2)} €` : '–'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </div>
        )}
      </div>

      {/* Session Detail Modal */}
      <Dialog open={!!selectedSession} onOpenChange={(open) => { if (!open) { setSelectedSession(null); setCancelMode(false); setEditMode(false); } }}>
        <DialogContent className="w-[95vw] sm:w-full max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('compSess.lessonInfo')}</DialogTitle>
          </DialogHeader>
          {selectedSession && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs text-gray-500">{t('compSess.labelTutor')}</Label>
                  <p className="font-medium text-sm mt-1">{selectedSession.tutor_name}</p>
                </div>
                <div>
                  <Label className="text-xs text-gray-500">{t('compSess.labelStudent')}</Label>
                  <p className="font-medium text-sm mt-1">{selectedSession.student_name}</p>
                </div>
              </div>

              {editMode ? (
                <div className="space-y-4">
                  {selectedSession.recurring_session_id && (
                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
                      <p className="text-xs font-semibold text-amber-800 mb-2">{t('compSch.recurringSeriesPart')}</p>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => setGroupEditChoice('single')}
                          className={`flex-1 text-xs py-1.5 px-3 rounded-lg border font-medium transition-colors ${groupEditChoice === 'single' ? 'bg-amber-600 border-amber-600 text-white' : 'border-amber-300 text-amber-700 hover:bg-amber-100'}`}
                        >
                          {t('compSch.thisOnly')}
                        </button>
                        <button
                          type="button"
                          onClick={() => setGroupEditChoice('all_future')}
                          className={`flex-1 text-xs py-1.5 px-3 rounded-lg border font-medium transition-colors ${groupEditChoice === 'all_future' ? 'bg-amber-600 border-amber-600 text-white' : 'border-amber-300 text-amber-700 hover:bg-amber-100'}`}
                        >
                          {t('compSch.thisAndFuture')}
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="space-y-3">
                    <div>
                      <Label className="text-xs text-gray-500 mb-1 block">{t('compSch.start')}</Label>
                      <DateTimeSpinner value={editStartTime} onChange={setEditStartTime} />
                    </div>
                    <div className="max-w-[140px]">
                      <Label className="text-xs text-gray-500 mb-1 block">{t('compSch.durationMin')}</Label>
                      <Input type="number" min={15} step={15} value={editDurationMinutes} onChange={e => setEditDurationMinutes(parseInt(e.target.value, 10) || 60)} className="rounded-xl" />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs text-gray-500 mb-1 block">{t('compSch.tutor')}</Label>
                      <Select value={editTutorId} onValueChange={setEditTutorId}>
                        <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {tutors.map(tu => (
                            <SelectItem key={tu.id} value={tu.id}>{tu.full_name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs text-gray-500 mb-1 block">{t('compSch.student')}</Label>
                      <Select value={editStudentId} onValueChange={setEditStudentId}>
                        <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {sortStudentsByFullName(students.filter(s => !editTutorId || s.tutor_id === editTutorId)).map(
                            (s) => (
                              <SelectItem key={s.id} value={s.id}>{s.full_name}</SelectItem>
                            ),
                          )}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div>
                    <Label className="text-xs text-gray-500 mb-1 block">{t('compSch.subject')}</Label>
                    <Select value={editSubjectId || 'none'} onValueChange={(v) => {
                      const val = v === 'none' ? '' : v;
                      setEditSubjectId(val);
                      const subj = subjects.find(s => s.id === val);
                      if (subj) { setEditTopic(subj.name); setEditPrice(subj.price); }
                    }}>
                      <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">{t('compSch.notSpecified')}</SelectItem>
                        {subjects
                          .filter(s => !editTutorId || s.tutor_id === editTutorId)
                          .map(s => (
                            <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label className="text-xs text-gray-500 mb-1 block">{t('compSch.topic')}</Label>
                    <Input value={editTopic} onChange={e => setEditTopic(e.target.value)} className="rounded-xl" />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs text-gray-500 mb-1 block">{t('compSch.price')}</Label>
                      <Input type="number" value={editPrice} onChange={e => setEditPrice(parseFloat(e.target.value) || 0)} className="rounded-xl" />
                    </div>
                    <div>
                      <Label className="text-xs text-gray-500 mb-1 block">{t('compSch.meetingLinkLabel')}</Label>
                      <Input value={editMeetingLink} onChange={e => setEditMeetingLink(e.target.value)} placeholder="https://..." className="rounded-xl" />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 pt-2 border-t border-gray-100">
                    <div>
                      <Label className="text-xs text-gray-500 mb-1 block">{t('compSch.status')}</Label>
                      <Select value={editStatus} onValueChange={v => setEditStatus(v)}>
                        <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="active">{t('compSch.statusActive')}</SelectItem>
                          <SelectItem value="completed">{t('compSch.statusCompleted')}</SelectItem>
                          <SelectItem value="cancelled">{t('compSch.statusCancelled')}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex items-end pb-1">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" checked={editPaid} onChange={e => setEditPaid(e.target.checked)} className="w-4 h-4 rounded border-gray-300 text-indigo-600" />
                        <span className="text-sm font-medium text-gray-700">{t('compSch.paidCheckbox')}</span>
                      </label>
                    </div>
                  </div>

                  <div className="flex gap-2 pt-2">
                    <Button variant="outline" className="flex-1 rounded-xl" onClick={() => setEditMode(false)}>
                      {t('compSess.close')}
                    </Button>
                    <Button className="flex-1 rounded-xl" disabled={savingEdit} onClick={handleSaveEdit}>
                      {savingEdit ? <><Loader2 className="w-4 h-4 mr-1 animate-spin" />{t('compSess.saving')}</> : t('compSess.saveChanges')}
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-xs text-gray-500">{t('compSess.labelStart')}</Label>
                      <p className="font-medium text-sm mt-1">
                        {format(new Date(selectedSession.start_time), 'yyyy-MM-dd HH:mm')}
                      </p>
                    </div>
                    <div>
                      <Label className="text-xs text-gray-500">{t('compSess.end')}</Label>
                      <p className="font-medium text-sm mt-1">
                        {format(new Date(selectedSession.end_time), 'HH:mm')}
                      </p>
                    </div>
                  </div>
                  {selectedSession.topic && (
                    <div>
                      <Label className="text-xs text-gray-500">{t('compSess.labelTopic')}</Label>
                      <p className="text-sm mt-1">{selectedSession.topic}</p>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-xs text-gray-500">{t('compSess.labelStatus')}</Label>
                      <div className="mt-1">
                        <StatusBadge
                          status={selectedSession.status}
                          paymentStatus={selectedSession.payment_status ?? undefined}
                          paid={selectedSession.paid}
                          endTime={selectedSession.end_time}
                        />
                      </div>
                    </div>
                    <div>
                      <Label className="text-xs text-gray-500">{t('compSess.labelPrice')}</Label>
                      <p className="font-semibold text-sm mt-1">
                        {selectedSession.price != null ? `${selectedSession.price.toFixed(2)} €` : '–'}
                      </p>
                    </div>
                  </div>

                  <div>
                    <Label className="text-xs text-gray-500">{t('compSess.labelPayment')}</Label>
                    <p className={`text-sm mt-1 font-medium ${selectedSession.paid ? 'text-green-600' : 'text-amber-600'}`}>
                      {selectedSession.paid || selectedSession.payment_status === 'paid' || selectedSession.payment_status === 'confirmed'
                        ? t('compSess.paid')
                        : t('compSess.paymentPending')}
                    </p>
                  </div>

                  {selectedSession.cancellation_reason && (
                    <div>
                      <Label className="text-xs text-gray-500">{t('compSess.cancellationReason')}</Label>
                      <p className="text-sm mt-1 text-red-600">{selectedSession.cancellation_reason}</p>
                    </div>
                  )}

                  {selectedSession.status === 'cancelled' && (
                    <div>
                      <Label className="text-xs text-gray-500">{t('compSess.cancelledBy')}</Label>
                      <p className="text-sm mt-1 text-red-600">
                        {selectedSession.cancelled_by === 'student'
                          ? t('sessions.cancelledByStudent')
                          : selectedSession.cancelled_by === 'tutor'
                            ? t('sessions.cancelledByTutor')
                            : '—'}
                      </p>
                    </div>
                  )}

                  {selectedSession.tutor_comment && (
                    <div>
                      <Label className="text-xs text-gray-500 flex items-center gap-1">
                        <MessageSquare className="w-3 h-3" />
                        {t('compSess.tutorComment')}
                        <span className="text-[10px] font-normal ml-1">
                          ({selectedSession.show_comment_to_student ? t('compSess.visibleToStudent') : t('compSess.tutorCommentNotForStudent')})
                        </span>
                      </Label>
                      <p className="text-sm mt-1 bg-blue-50 border border-blue-100 rounded-lg p-2 whitespace-pre-wrap">{selectedSession.tutor_comment}</p>
                    </div>
                  )}

                  {String(selectedSession.student_admin_comment || '').trim().length > 0 && (
                    <div>
                      <Label className="text-xs text-gray-500 flex items-center gap-1">
                        <MessageSquare className="w-3 h-3" />
                        {t('compStu.adminComment')}
                        <span className="text-[10px] font-normal ml-1">
                          ({selectedSession.student_admin_comment_visible_to_tutor ? t('compStu.commentVisibleBoth') : t('compStu.commentVisibleAdmin')})
                        </span>
                      </Label>
                      <p className="text-sm mt-1 bg-amber-50 border border-amber-100 rounded-lg p-2 whitespace-pre-wrap">
                        {selectedSession.student_admin_comment}
                      </p>
                    </div>
                  )}

                  {cancelMode && (
                    <div className="space-y-2 bg-red-50 rounded-xl p-3">
                      <Input
                        placeholder={t('compSess.cancelReasonPlaceholder')}
                        value={cancellationReason}
                        onChange={e => setCancellationReason(e.target.value)}
                        className="rounded-lg"
                      />
                      <div className="flex gap-2">
                        <Button variant="outline" className="flex-1 rounded-xl" onClick={() => setCancelMode(false)}>
                          {t('compSess.close')}
                        </Button>
                        <Button
                          variant="destructive"
                          className="flex-1 rounded-xl"
                          disabled={cancellingSession || cancellationReason.trim().length < 5}
                          onClick={handleCancelSession}
                        >
                          {cancellingSession ? <><Loader2 className="w-4 h-4 mr-1 animate-spin" />{t('compSess.cancelling')}</> : t('compSess.cancelConfirm')}
                        </Button>
                      </div>
                    </div>
                  )}

                  {!cancelMode && (selectedSession.status === 'active' || selectedSession.status === 'completed') && (
                    <div className="space-y-2 pt-1">
                      {selectedSession.status === 'active' && (
                        <Button
                          variant="outline"
                          className={cn('w-full rounded-xl', selectedSession.paid ? 'border-amber-200 text-amber-700 hover:bg-amber-50' : 'border-green-200 text-green-700 hover:bg-green-50')}
                          disabled={togglingPaid}
                          onClick={handleTogglePaid}
                        >
                          {togglingPaid ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : selectedSession.paid ? <XCircle className="w-4 h-4 mr-2" /> : <CheckCircle className="w-4 h-4 mr-2" />}
                          {selectedSession.paid ? t('compSess.markUnpaid') : t('compSess.markPaid')}
                        </Button>
                      )}

                      {selectedSession.status === 'active' && isFutureSession(selectedSession) && (
                        <>
                          <Button variant="outline" className="w-full rounded-xl border-indigo-200 text-indigo-700 hover:bg-indigo-50" onClick={() => setEditMode(true)}>
                            <Pencil className="w-4 h-4 mr-2" />
                            {t('compSess.editLesson')}
                          </Button>
                          <Button variant="outline" className="w-full rounded-xl border-rose-200 text-rose-700 hover:bg-rose-50" onClick={() => setCancelMode(true)}>
                            <Ban className="w-4 h-4 mr-2" />
                            {t('compSess.cancelLesson')}
                          </Button>
                        </>
                      )}

                      {selectedSession.status === 'active' && (
                        <Button
                          variant="outline"
                          className="w-full border-rose-200 text-rose-800 hover:bg-rose-50 rounded-xl"
                          disabled={markingNoShow}
                          onClick={(e) => { e.stopPropagation(); void handleMarkStudentNoShow(); }}
                        >
                          <UserX className="w-4 h-4 mr-2" />
                          {markingNoShow ? t('compSess.markNoShowSaving') : t('compSess.markNoShow')}
                        </Button>
                      )}

                      <Button
                        variant="outline"
                        className="w-full rounded-xl border-red-200 text-red-700 hover:bg-red-50"
                        disabled={deletingSession}
                        onClick={() => void handleHardDeleteCompanySession()}
                      >
                        {deletingSession ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Trash2 className="w-4 h-4 mr-2" />}
                        {t('cal.deleteSession')}
                      </Button>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedSession(null)}>{t('compSess.close')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteRecurringOpen} onOpenChange={setDeleteRecurringOpen}>
        <DialogContent className="w-[95vw] sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Trash2 className="w-5 h-5 text-red-600" />
              {t('cal.deleteRecurringTitle')}
            </DialogTitle>
          </DialogHeader>
          <div className="text-sm text-gray-600 space-y-2">
            <p>{t('cal.deleteChoose')}</p>
            <p className="text-xs text-gray-500">{t('cal.deleteHint')}</p>
          </div>
          <DialogFooter className="flex flex-col sm:flex-row gap-2 sm:gap-3">
            <Button
              variant="outline"
              onClick={() => setDeleteRecurringOpen(false)}
              className="rounded-xl"
              disabled={deletingSession}
            >
              {t('cal.cancelBtn')}
            </Button>
            <Button
              variant="outline"
              onClick={() => void hardDeleteCompanySessionWithApproval('single')}
              className="rounded-xl border-red-200 text-red-700 hover:bg-red-50"
              disabled={deletingSession}
            >
              {t('cal.deleteOnlyThis')}
            </Button>
            <Button
              onClick={() => void hardDeleteCompanySessionWithApproval('future')}
              className="rounded-xl bg-red-600 hover:bg-red-700 text-white"
              disabled={deletingSession}
            >
              {t('cal.deleteThisAndFuture')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
