import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useUser } from '@/contexts/UserContext';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useTranslation } from '@/lib/i18n';
import { format } from 'date-fns';
import { ArrowLeft, CalendarDays, ListOrdered, MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import StatusBadge from '@/components/StatusBadge';

interface Session {
  id: string;
  start_time: string;
  end_time: string;
  status: string;
  topic: string | null;
  price: number | null;
  paid: boolean;
  payment_status?: string | null;
  tutor_comment?: string | null;
  show_comment_to_student?: boolean | null;
  cancelled_by?: 'tutor' | 'student' | null;
  no_show_when?: string | null;
  subjects?: { name: string } | null;
}

export default function ParentSessions() {
  const { user } = useUser();
  const { studentId } = useParams<{ studentId: string }>();
  const { t, dateFnsLocale } = useTranslation();
  const navigate = useNavigate();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [studentName, setStudentName] = useState('');
  const [loading, setLoading] = useState(true);
  const [validChild, setValidChild] = useState(false);

  useEffect(() => {
    if (!user || !studentId) return;
    (async () => {
      setLoading(true);

      const { data: parentRow, error: parentErr } = await supabase
        .rpc('get_parent_profile_id_by_user_id', { p_user_id: user.id });
      if (parentErr) {
        console.warn('[ParentSessions] parent profile rpc failed:', parentErr);
      }

      if (!parentRow) {
        setLoading(false);
        setValidChild(false);
        return;
      }

      const { data: link } = await supabase
        .from('parent_students')
        .select('id')
        .eq('parent_id', parentRow)
        .eq('student_id', studentId)
        .maybeSingle();

      if (!link) {
        setLoading(false);
        setValidChild(false);
        return;
      }
      setValidChild(true);

      const { data: student } = await supabase.from('students').select('full_name').eq('id', studentId).single();

      if (student) setStudentName(student.full_name);

      const { data } = await supabase
        .from('sessions')
        .select(
          'id, start_time, end_time, status, topic, price, paid, payment_status, tutor_comment, show_comment_to_student, cancelled_by, no_show_when, subjects(name)',
        )
        .eq('student_id', studentId)
        .order('start_time', { ascending: false })
        .limit(100);

      setSessions((data ?? []) as unknown as Session[]);
      setLoading(false);
    })();
  }, [user?.id, studentId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f7f7fb] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-violet-200 border-t-violet-600 rounded-full animate-spin" />
      </div>
    );
  }

  if (!validChild) {
    return (
      <div className="min-h-screen bg-[#f7f7fb] flex flex-col items-center justify-center gap-4 px-4">
        <p className="text-gray-600 text-center">{t('parent.noAccessChild')}</p>
        <Button variant="outline" onClick={() => navigate('/parent')}>
          {t('parent.back')}
        </Button>
      </div>
    );
  }

  const schedulePath = `/parent/calendar?studentId=${studentId}`;
  const waitlistPath = `/parent/lessons`;
  const messagesLink = `/parent/messages?studentId=${encodeURIComponent(studentId ?? '')}`;
  const invoicesLink = `/parent/invoices?studentId=${encodeURIComponent(studentId ?? '')}`;

  return (
    <div className="min-h-screen bg-[#f7f7fb]">
      <header className="bg-white border-b px-6 py-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => navigate('/parent')}>
            <ArrowLeft className="w-4 h-4 mr-1" /> {t('parent.back')}
          </Button>
          <div>
            <h1 className="text-lg font-bold text-gray-900">{studentName}</h1>
            <p className="text-sm text-gray-500">{t('parent.sessionsTitle')}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" className="rounded-lg" asChild>
            <Link to={schedulePath}>
              <CalendarDays className="w-4 h-4 mr-1.5" />
              {t('parent.bookSchedule')}
            </Link>
          </Button>
          <Button variant="outline" size="sm" className="rounded-lg" asChild>
            <Link to={waitlistPath}>
              <ListOrdered className="w-4 h-4 mr-1.5" />
              {t('parent.waitlistTitle')}
            </Link>
          </Button>
          <Button variant="outline" size="sm" className="rounded-lg" asChild>
            <Link to={messagesLink}>
              <MessageCircle className="w-4 h-4 mr-1.5" />
              {t('parent.messagesShort')}
            </Link>
          </Button>
          <Button variant="outline" size="sm" className="rounded-lg" asChild>
            <Link to={invoicesLink}>{t('parent.invoicesShort')}</Link>
          </Button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8 space-y-3">
        {sessions.length === 0 ? (
          <p className="text-gray-500 text-center py-12">{t('parent.noSessions')}</p>
        ) : (
          sessions.map((s) => (
            <div key={s.id} className="bg-white rounded-xl border p-4 space-y-2">
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                <div>
                  <p className="font-medium text-gray-900">
                    {(s.subjects as { name?: string } | null)?.name ?? t('parent.lesson')}
                    {s.topic ? ` — ${s.topic}` : ''}
                  </p>
                  <p className="text-sm text-gray-500">
                    {format(new Date(s.start_time), 'yyyy-MM-dd HH:mm', { locale: dateFnsLocale })}
                    {' – '}
                    {format(new Date(s.end_time), 'HH:mm', { locale: dateFnsLocale })}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {s.price != null && (
                    <span className="text-sm font-medium text-gray-700">{Number(s.price).toFixed(2)} €</span>
                  )}
                  <StatusBadge
                    status={s.status}
                    paymentStatus={s.payment_status ?? undefined}
                    paid={s.paid}
                    endTime={s.end_time}
                  />
                </div>
              </div>

              {s.status === 'active' && (
                <p className="text-xs text-gray-600">
                  {s.paid ? (
                    <span className="text-green-700 font-medium">{t('stuSess.paid')}</span>
                  ) : (
                    <span className="text-amber-700 font-medium">{t('stuSess.awaitingPayment')}</span>
                  )}
                </p>
              )}

              {s.status === 'cancelled' && (
                <p className="text-xs text-red-700">
                  {s.cancelled_by === 'tutor'
                    ? t('sessions.cancelledByTutor')
                    : s.cancelled_by === 'student'
                      ? t('sessions.cancelledByStudent')
                      : t('status.cancelled')}
                </p>
              )}

              {s.show_comment_to_student && s.tutor_comment?.trim() ? (
                <div className="rounded-lg bg-indigo-50 border border-indigo-100 px-3 py-2">
                  <p className="text-[11px] font-semibold text-indigo-800 uppercase tracking-wide">{t('stuSess.tutorComment')}</p>
                  <p className="text-sm text-indigo-900 whitespace-pre-wrap mt-1">{s.tutor_comment}</p>
                </div>
              ) : null}
            </div>
          ))
        )}
      </main>
    </div>
  );
}
