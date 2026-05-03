import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { getCached, setCache } from '@/lib/dataCache';
import { parentProfileDeduped, parentStudentLinksDeduped } from '@/lib/preload';
import { useUser } from '@/contexts/UserContext';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from '@/lib/i18n';
import {
  Users,
  CalendarDays,
  Clock,
  MessageSquare,
  BookOpen,
  FileText,
  Zap,
  Play,
  ChevronRight,
  AlertTriangle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import PwaInstallGuide from '@/components/PwaInstallGuide';
import {
  ParentLessonDetailModal,
  type ParentTutorContactPolicy,
} from '@/components/parent/ParentLessonDetailModal';
import StatusBadge from '@/components/StatusBadge';
import ParentLayout from '@/components/ParentLayout';
import { format, isAfter } from 'date-fns';
import { cn, normalizeUrl } from '@/lib/utils';

type ChildTutorPolicy = ParentTutorContactPolicy;

interface ChildSession {
  id: string;
  start_time: string;
  end_time: string;
  status: string;
  topic: string | null;
  subjectName: string | null;
  isGroupSubject?: boolean;
  paid: boolean;
  payment_status?: string;
  price: number | null;
  meeting_link: string | null;
  cancelled_by?: string | null;
  tutor_comment?: string | null;
  show_comment_to_student?: boolean;
}

interface ChildInfo {
  studentId: string;
  linkedUserId: string | null;
  fullName: string;
  tutorName: string | null;
  tutorId: string | null;
  upcoming: ChildSession[];
  completedCount: number;
  cancelledCount: number;
  noShowCount: number;
  totalCount: number;
  unpaidPastCount: number;
  nextSession: ChildSession | null;
  otherUpcoming: ChildSession[];
  tutorPolicy?: ChildTutorPolicy | null;
}

export default function ParentDashboard() {
  const { user } = useUser();
  const { t, locale, dateFnsLocale } = useTranslation();
  const navigate = useNavigate();
  const pdc = getCached<any>('parent_dashboard');
  const [parentName, setParentName] = useState<string | null>(pdc?.parentName ?? null);
  const [children, setChildren] = useState<ChildInfo[]>(pdc?.children ?? []);
  const [loading, setLoading] = useState(!pdc);
  const [selected, setSelected] = useState<ChildSession | null>(null);
  const [selectedChildName, setSelectedChildName] = useState<string>('');
  const [selectedChildId, setSelectedChildId] = useState<string>('');
  const [selectedTutorPolicy, setSelectedTutorPolicy] =
    useState<ChildTutorPolicy | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const now = useMemo(() => new Date(), []);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      if (!getCached('parent_dashboard')) setLoading(true);

      const [parentProfileRes, linksRes] = await Promise.all([
        parentProfileDeduped(user.id),
        parentStudentLinksDeduped(user.id),
      ]);

      const parentRow = Array.isArray(parentProfileRes.data)
        ? parentProfileRes.data[0]
        : parentProfileRes.data;
      if (!cancelled && (parentRow as any)?.full_name) {
        setParentName((parentRow as any).full_name);
      }

      const linksErr = linksRes.error;
      if (linksErr) {
        console.warn('[ParentDashboard] parent_students load failed:', linksErr);
        if (!cancelled) {
          setChildren([]);
          setLoading(false);
        }
        return;
      }

      const studentsRaw = (linksRes.data ?? [])
        .map((l: any) => l.students)
        .filter((s: any) => s?.id);

      const studentIds: string[] = [...new Set(studentsRaw.map((s: any) => s.id))];
      if (studentIds.length === 0) {
        if (!cancelled) {
          setChildren([]);
          setLoading(false);
        }
        return;
      }

      const past = new Date(now);
      past.setMonth(past.getMonth() - 6);
      const future = new Date(now);
      future.setMonth(future.getMonth() + 3);

      const tutorIds = [
        ...new Set(
          studentsRaw
            .map((s: any) => s.tutor_id as string | null | undefined)
            .filter(Boolean) as string[],
        ),
      ];

      const [sessionsRes, tutorProfilesRes] = await Promise.all([
        supabase
          .from('sessions')
          .select(
            'id, student_id, start_time, end_time, status, cancelled_by, topic, paid, payment_status, price, meeting_link, tutor_comment, show_comment_to_student, subjects(name, is_group)',
          )
          .in('student_id', studentIds)
          .gte('start_time', past.toISOString())
          .lte('start_time', future.toISOString())
          .order('start_time', { ascending: true })
          .limit(2000),
        tutorIds.length > 0
          ? supabase
              .from('profiles')
              .select(
                'id, full_name, email, phone, cancellation_hours, cancellation_fee_percent, payment_timing, payment_deadline_hours',
              )
              .in('id', tutorIds)
          : Promise.resolve({ data: [], error: null } as any),
      ]);

      const { data: sessions, error: sessErr } = sessionsRes;

      if (sessErr) {
        console.warn('[ParentDashboard] sessions load failed:', sessErr);
      }

      const tutorById = new Map<string, ChildTutorPolicy>();
      for (const tp of (tutorProfilesRes as any).data ?? []) {
        tutorById.set(tp.id, {
          tutorId: tp.id,
          tutorName: tp.full_name ?? null,
          tutorEmail: tp.email ?? null,
          tutorPhone: tp.phone ?? null,
          cancellationHours: tp.cancellation_hours ?? 24,
          cancellationFeePercent: tp.cancellation_fee_percent ?? 0,
          paymentTiming: (tp.payment_timing ?? 'before_lesson') as
            | 'before_lesson'
            | 'after_lesson',
          paymentDeadlineHours: tp.payment_deadline_hours ?? 24,
        });
      }

      const byStudent = new Map<string, ChildSession[]>();
      for (const s of sessions ?? []) {
        const arr = byStudent.get((s as any).student_id) ?? [];
        arr.push({
          id: (s as any).id,
          start_time: (s as any).start_time,
          end_time: (s as any).end_time,
          status: (s as any).status,
          topic: (s as any).topic ?? null,
          subjectName: (s as any).subjects?.name ?? null,
          isGroupSubject: !!(s as any).subjects?.is_group,
          paid: !!(s as any).paid,
          payment_status: (s as any).payment_status,
          price: (s as any).price ?? null,
          meeting_link: (s as any).meeting_link ?? null,
          cancelled_by: (s as any).cancelled_by ?? null,
          tutor_comment: (s as any).tutor_comment ?? null,
          show_comment_to_student: !!(s as any).show_comment_to_student,
        });
        byStudent.set((s as any).student_id, arr);
      }

      const kids: ChildInfo[] = studentsRaw.map((s: any) => {
        const list = byStudent.get(s.id) ?? [];
        const upcoming = list.filter(
          (x) => x.status === 'active' && isAfter(new Date(x.end_time), now),
        );
        const completed = list.filter((x) => x.status === 'completed');
        const cancelledSessions = list.filter((x) => x.status === 'cancelled');
        const noShow = list.filter((x) => x.status === 'no_show');
        const unpaidPast = list.filter(
          (x) =>
            !x.paid &&
            x.payment_status !== 'paid_by_student' &&
            (x.status === 'completed' ||
              (x.status === 'active' && new Date(x.end_time).getTime() < now.getTime())),
        );

        return {
          studentId: s.id,
          linkedUserId: s.linked_user_id ?? null,
          fullName: s.full_name ?? '',
          tutorName: (s.profiles as any)?.full_name ?? null,
          tutorId: s.tutor_id ?? null,
          upcoming,
          completedCount: completed.length,
          cancelledCount: cancelledSessions.length,
          noShowCount: noShow.length,
          totalCount: list.length,
          unpaidPastCount: unpaidPast.length,
          nextSession: upcoming[0] ?? null,
          otherUpcoming: upcoming.slice(1, 4),
          tutorPolicy: s.tutor_id ? tutorById.get(s.tutor_id) ?? null : null,
        };
      });

      kids.sort((a, b) => {
        const at = a.nextSession?.start_time
          ? new Date(a.nextSession.start_time).getTime()
          : Number.POSITIVE_INFINITY;
        const bt = b.nextSession?.start_time
          ? new Date(b.nextSession.start_time).getTime()
          : Number.POSITIVE_INFINITY;
        if (at !== bt) return at - bt;
        return a.fullName.localeCompare(b.fullName);
      });

      if (!cancelled) {
        setParentName((prev) => (parentRow as any)?.full_name || prev);
        setChildren(kids);
        setLoading(false);
        setCache('parent_dashboard', {
          parentName: (parentRow as any)?.full_name || null,
          children: kids,
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user?.id, now]);

  const greetingName = useMemo(() => {
    if (parentName && parentName.trim()) return parentName.split(' ')[0];
    const raw = (user?.email?.split('@')[0] || '').replace(/[._-]+/g, ' ').trim();
    if (!raw) return t('parent.portalGreetingFallback');
    const loc = locale === 'lt' ? 'lt-LT' : 'en-US';
    const parts = raw
      .split(/\s+/)
      .map((part) =>
        part
          ? part.charAt(0).toLocaleUpperCase(loc) + part.slice(1).toLocaleLowerCase(loc)
          : '',
      )
      .filter(Boolean);
    return parts[0] ?? t('parent.portalGreetingFallback');
  }, [parentName, user?.email, locale, t]);

  const getGreeting = () => {
    const h = now.getHours();
    if (h < 12) return t('studentDash.goodMorning') || 'Labas rytas';
    if (h < 17) return t('studentDash.goodDay') || 'Laba diena';
    return t('studentDash.goodEvening') || 'Labas vakaras';
  };

  const formatCountdown = (dateStr: string) => {
    const d = new Date(dateStr);
    const diffH = Math.round((d.getTime() - now.getTime()) / 3600000);
    if (diffH < 1) return t('studentDash.rightNow');
    if (diffH < 24) return t('studentDash.inNHours', { n: diffH });
    return t('studentDash.inNDays', { n: Math.floor(diffH / 24) });
  };

  const openSessionModal = (
    s: ChildSession,
    childName: string,
    studentId: string,
    tutorPolicy: ChildTutorPolicy | null,
  ) => {
    setSelected(s);
    setSelectedChildName(childName);
    setSelectedChildId(studentId);
    setSelectedTutorPolicy(tutorPolicy);
    setModalOpen(true);
  };

  if (loading) {
    return (
      <ParentLayout>
        <div className="flex h-[80vh] items-center justify-center">
          <div className="w-8 h-8 border-4 border-violet-200 border-t-violet-600 rounded-full animate-spin" />
        </div>
      </ParentLayout>
    );
  }

  const totalUpcoming = children.reduce((sum, c) => sum + c.upcoming.length, 0);
  const totalUnpaid = children.reduce((sum, c) => sum + c.unpaidPastCount, 0);

  return (
    <ParentLayout>
      <div className="w-full max-w-2xl mx-auto px-4 sm:px-6 pt-6 pb-8 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-gray-500 font-medium text-sm mb-0.5">{getGreeting()},</p>
            <h1 className="text-3xl font-black text-gray-900 leading-tight">
              {greetingName} 👋
            </h1>
            {children.length > 0 && (
              <p className="text-xs text-gray-500 font-semibold mt-1">
                {t('parent.children')}:{' '}
                <span className="text-gray-700">{children.length}</span>
              </p>
            )}
          </div>
          {children.length > 0 && (
            <div className="bg-violet-100/80 text-violet-700 px-3 py-1.5 rounded-2xl text-xs font-black shadow-sm border border-violet-200/50">
              {totalUpcoming} {t('parent.upcoming')}
            </div>
          )}
        </div>

        {totalUnpaid > 0 && (
          <div className="rounded-3xl border border-amber-200 bg-amber-50 p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
                <AlertTriangle className="w-4 h-4 text-amber-700" />
              </div>
              <div>
                <p className="text-sm font-bold text-amber-900">
                  {t('parent.invoiceAttention')}
                </p>
                <p className="text-xs text-amber-800 mt-0.5">
                  {t('parent.unpaidLessonsCount', { n: String(totalUnpaid) })}
                </p>
              </div>
            </div>
            <Button
              type="button"
              className="rounded-2xl bg-amber-600 hover:bg-amber-700 text-white shrink-0"
              onClick={() => navigate('/parent/invoices')}
            >
              {t('studentDash.pay')}
            </Button>
          </div>
        )}

        {children.length === 0 ? (
          <div className="rounded-[2rem] p-10 bg-white border-2 border-dashed border-gray-200 text-center">
            <div className="w-16 h-16 rounded-full bg-gray-50 flex items-center justify-center mx-auto mb-4">
              <Users className="w-7 h-7 text-gray-400" />
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-1 tracking-tight">
              {t('parent.noChildren')}
            </h3>
            <p className="text-gray-500 text-sm font-medium">
              {t('parent.noChildrenHint')}
            </p>
          </div>
        ) : (
          <>
            {/* Top-level quick actions (visible when more than one child too) */}
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <button
                type="button"
                onClick={() => navigate('/parent/calendar')}
                className="bg-white hover:bg-violet-50 hover:border-violet-200 transition-all rounded-3xl py-5 px-4 min-h-[5.75rem] flex flex-col items-center justify-center gap-2 border border-gray-100 shadow-sm group"
              >
                <div className="w-12 h-12 rounded-full bg-violet-100 flex items-center justify-center group-hover:scale-110 transition-transform">
                  <CalendarDays className="w-5 h-5 text-violet-600" />
                </div>
                <span className="text-xs font-bold text-gray-700">
                  {t('nav.calendar')}
                </span>
              </button>
              <button
                type="button"
                onClick={() => navigate('/parent/messages')}
                className="bg-white hover:bg-blue-50 hover:border-blue-200 transition-all rounded-3xl py-5 px-4 min-h-[5.75rem] flex flex-col items-center justify-center gap-2 border border-gray-100 shadow-sm group"
              >
                <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center group-hover:scale-110 transition-transform">
                  <MessageSquare className="w-5 h-5 text-blue-600" />
                </div>
                <span className="text-xs font-bold text-gray-700">
                  {t('parent.messages')}
                </span>
              </button>
              <button
                type="button"
                onClick={() => navigate('/parent/invoices')}
                className="bg-white hover:bg-emerald-50 hover:border-emerald-200 transition-all rounded-3xl py-5 px-4 min-h-[5.75rem] flex flex-col items-center justify-center gap-2 border border-gray-100 shadow-sm group sm:aspect-auto col-span-2 sm:col-span-1"
              >
                <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center group-hover:scale-110 transition-transform">
                  <FileText className="w-5 h-5 text-emerald-600" />
                </div>
                <span className="text-xs font-bold text-gray-700">
                  {t('parent.invoices')}
                </span>
              </button>
            </div>

            {children.map((child) => (
              <ChildBlock
                key={child.studentId}
                child={child}
                t={t}
                dateFnsLocale={dateFnsLocale}
                onOpenSession={openSessionModal}
                navigate={navigate}
                formatCountdown={formatCountdown}
              />
            ))}

            <PwaInstallGuide />
          </>
        )}
      </div>

      <ParentLessonDetailModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        session={selected}
        childName={selectedChildName}
        childId={selectedChildId}
        tutorPolicy={selectedTutorPolicy}
        now={now}
        navigate={navigate}
        t={t}
        dateFnsLocale={dateFnsLocale}
        stripePayerEmail={user?.email ?? ''}
      />
    </ParentLayout>
  );
}

function ChildBlock({
  child,
  t,
  dateFnsLocale,
  onOpenSession,
  navigate,
  formatCountdown,
}: {
  child: ChildInfo;
  t: (key: string, params?: Record<string, string | number>) => string;
  dateFnsLocale: ReturnType<typeof useTranslation>['dateFnsLocale'];
  onOpenSession: (
    s: ChildSession,
    childName: string,
    studentId: string,
    tutorPolicy: ChildTutorPolicy | null,
  ) => void;
  navigate: ReturnType<typeof useNavigate>;
  formatCountdown: (dateStr: string) => string;
}) {
  const next = child.nextSession;
  const schedulePath = `/parent/calendar?studentId=${child.studentId}`;
  const lessonsPath = `/parent/lessons?studentId=${child.studentId}`;
  const messagesPath = `/parent/messages?studentId=${child.studentId}`;

  return (
    <div className="space-y-4 pt-2">
      <div className="flex items-center justify-between gap-2 px-1">
        <div className="min-w-0">
          <h2 className="text-lg font-black text-gray-900 tracking-tight truncate">
            {child.fullName || t('studentDash.defaultStudent')}
          </h2>
          {child.tutorName && (
            <p className="text-xs text-gray-500 font-semibold truncate">
              {t('parent.tutor')}: {child.tutorName}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => navigate(lessonsPath)}
          className="text-xs font-bold text-violet-600 hover:text-violet-700 inline-flex items-center gap-0.5 shrink-0"
        >
          {t('parent.viewAll')}
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <button
          type="button"
          onClick={() => navigate(schedulePath)}
          className="bg-white hover:bg-violet-50 hover:border-violet-200 transition-all rounded-3xl py-5 px-4 min-h-[5.75rem] flex flex-col items-center justify-center gap-2 border border-gray-100 shadow-sm group"
        >
          <div className="w-12 h-12 rounded-full bg-violet-100 flex items-center justify-center group-hover:scale-110 transition-transform">
            <CalendarDays className="w-5 h-5 text-violet-600" />
          </div>
          <span className="text-xs font-bold text-gray-700">
            {t('studentDash.book')}
          </span>
        </button>
        <button
          type="button"
          onClick={() => navigate(lessonsPath)}
          className="bg-white hover:bg-blue-50 hover:border-blue-200 transition-all rounded-3xl py-5 px-4 min-h-[5.75rem] flex flex-col items-center justify-center gap-2 border border-gray-100 shadow-sm group"
        >
          <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center group-hover:scale-110 transition-transform">
            <BookOpen className="w-5 h-5 text-blue-600" />
          </div>
          <span className="text-xs font-bold text-gray-700">
            {t('parent.sessionsTitle')}
          </span>
        </button>
        <button
          onClick={() => navigate(messagesPath)}
          className="bg-white hover:bg-rose-50 hover:border-rose-200 transition-all rounded-3xl p-4 flex flex-col items-center justify-center gap-2 border border-gray-100 shadow-sm aspect-square group"
        >
          <div className="w-12 h-12 rounded-full bg-rose-100 flex items-center justify-center group-hover:scale-110 transition-transform">
            <MessageSquare className="w-5 h-5 text-rose-600" />
          </div>
          <span className="text-xs font-bold text-gray-700">
            {t('parent.write')}
          </span>
        </button>
      </div>

      {next ? (
        <div>
          <div className="flex items-center justify-between mb-3 px-1">
            <h3 className="text-sm font-black text-gray-700 tracking-tight uppercase">
              {t('studentDash.nextLesson')}
            </h3>
            <span className="text-xs font-bold text-violet-600 bg-violet-100 px-2.5 py-1 rounded-full">
              {formatCountdown(next.start_time)}
            </span>
          </div>
          <div
            onClick={() =>
              onOpenSession(
                next,
                child.fullName,
                child.studentId,
                child.tutorPolicy ?? null,
              )
            }
            className="cursor-pointer"
          >
            <div
              className="relative overflow-hidden rounded-[2rem] p-6 shadow-xl shadow-violet-200/50 hover:shadow-2xl hover:shadow-violet-300/50 transition-shadow"
              style={{
                background: 'linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%)',
              }}
            >
              <div className="absolute -right-12 -top-12 w-48 h-48 rounded-full bg-white/10 blur-2xl" />
              <div className="absolute -left-12 -bottom-12 w-48 h-48 rounded-full bg-indigo-900/20 blur-2xl" />

              <div className="relative z-10 flex flex-col h-full justify-between gap-6">
                <div>
                  <h3 className="text-white text-3xl font-black leading-none mb-2">
                    {format(new Date(next.start_time), 'EEEE', {
                      locale: dateFnsLocale,
                    })}
                  </h3>
                  <p className="text-violet-200 text-lg font-medium inline-flex items-center gap-2">
                    <Clock className="w-4 h-4" />{' '}
                    {format(new Date(next.start_time), 'd MMMM · HH:mm', {
                      locale: dateFnsLocale,
                    })}
                  </p>
                </div>

                <div className="bg-white/10 backdrop-blur-md rounded-2xl p-4 flex items-center justify-between border border-white/20">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
                      <Zap className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <p className="text-white font-bold">
                        {next.subjectName || next.topic || t('common.lesson')}
                      </p>
                      <p className="text-violet-200 text-xs font-medium mb-1">
                        {child.fullName}
                      </p>
                      <div className="mt-1">
                        <StatusBadge
                          status={next.status}
                          paymentStatus={next.payment_status}
                          paid={next.paid}
                          endTime={next.end_time}
                        />
                      </div>
                    </div>
                  </div>
                  {next.meeting_link && (
                    <a
                      href={normalizeUrl(next.meeting_link) || undefined}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="w-10 h-10 rounded-full bg-white text-violet-600 flex items-center justify-center hover:scale-105 transition-transform shadow-lg"
                    >
                      <Play className="w-4 h-4 ml-0.5 fill-current" />
                    </a>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div
          onClick={() => navigate(schedulePath)}
          className="rounded-[2rem] p-8 bg-white border-2 border-dashed border-gray-200 text-center cursor-pointer hover:border-violet-300 hover:bg-violet-50/50 transition-all flex flex-col items-center justify-center group"
        >
          <div className="w-16 h-16 rounded-full bg-gray-50 group-hover:bg-violet-100 flex items-center justify-center mb-4 transition-colors">
            <CalendarDays className="w-7 h-7 text-gray-400 group-hover:text-violet-600 transition-colors" />
          </div>
          <h3 className="text-lg font-bold text-gray-900 mb-1 tracking-tight">
            {t('parent.noUpcomingFor', { name: child.fullName })}
          </h3>
          <p className="text-gray-500 text-sm font-medium">
            {t('parent.tapToBook')}
          </p>
        </div>
      )}

      {child.otherUpcoming.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3 px-1">
            <h3 className="font-bold text-gray-800 text-sm">
              {t('studentDash.otherReservations')}
            </h3>
          </div>
          <div className="grid gap-3">
            {child.otherUpcoming.map((s) => (
              <div
                key={s.id}
                onClick={() =>
                  onOpenSession(
                    s,
                    child.fullName,
                    child.studentId,
                    child.tutorPolicy ?? null,
                  )
                }
                className="bg-white rounded-[1.5rem] p-4 flex items-center gap-4 border border-gray-100 shadow-sm cursor-pointer hover:shadow-md hover:border-gray-200 transition-all"
              >
                <div className="w-12 h-12 rounded-2xl bg-indigo-50 border border-indigo-100 flex flex-col items-center justify-center flex-shrink-0 text-indigo-600">
                  <span className="text-[10px] font-bold uppercase">
                    {format(new Date(s.start_time), 'MMM', {
                      locale: dateFnsLocale,
                    })}
                  </span>
                  <span className="text-lg font-black leading-none">
                    {format(new Date(s.start_time), 'd')}
                  </span>
                </div>
                <div className="flex-1 min-w-0 flex items-center justify-between">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-gray-900 truncate">
                      {s.subjectName || s.topic || t('common.lesson')}
                    </p>
                    <p className="text-xs text-gray-500 font-medium flex items-center gap-1.5 mt-0.5">
                      <Clock className="w-3.5 h-3.5" />{' '}
                      {format(new Date(s.start_time), 'HH:mm')}
                    </p>
                  </div>
                  <StatusBadge
                    status={s.status}
                    paymentStatus={s.payment_status}
                    paid={s.paid}
                    endTime={s.end_time}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm text-center">
          <div className="w-10 h-10 rounded-full bg-violet-50 flex items-center justify-center mx-auto mb-2">
            <BookOpen className="w-4 h-4 text-violet-600" />
          </div>
          <p className="text-3xl font-black text-gray-900">
            {child.completedCount}
          </p>
          <p className="text-xs text-gray-500 font-bold mt-1 uppercase tracking-wider">
            {t('parent.statsCompleted')}
          </p>
        </div>
        <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm text-center">
          <div
            className={cn(
              'w-10 h-10 rounded-full flex items-center justify-center mx-auto mb-2',
              child.upcoming.length > 0 ? 'bg-emerald-50' : 'bg-gray-50',
            )}
          >
            <Zap
              className={cn(
                'w-4 h-4',
                child.upcoming.length > 0 ? 'text-emerald-600' : 'text-gray-400',
              )}
            />
          </div>
          <p className="text-3xl font-black text-gray-900">
            {child.upcoming.length}
          </p>
          <p className="text-xs text-gray-500 font-bold mt-1 uppercase tracking-wider">
            {t('parent.statsUpcoming')}
          </p>
        </div>
      </div>
    </div>
  );
}
