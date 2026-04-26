import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useUser } from '@/contexts/UserContext';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from '@/lib/i18n';
import { format } from 'date-fns';
import { ArrowLeft, CalendarDays, CheckCircle, XCircle, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import StatusBadge from '@/components/StatusBadge';

interface Session {
  id: string;
  start_time: string;
  end_time: string;
  status: string;
  topic: string | null;
  price: number | null;
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

  useEffect(() => {
    if (!user || !studentId) return;
    (async () => {
      setLoading(true);

      // Verify parent-student link
      const { data: parentProfile } = await supabase
        .from('parent_profiles')
        .select('id')
        .eq('user_id', user.id)
        .single();

      if (!parentProfile) { setLoading(false); return; }

      const { data: link } = await supabase
        .from('parent_students')
        .select('id')
        .eq('parent_id', parentProfile.id)
        .eq('student_id', studentId)
        .maybeSingle();

      if (!link) { setLoading(false); return; }

      const { data: student } = await supabase
        .from('students')
        .select('full_name')
        .eq('id', studentId)
        .single();

      if (student) setStudentName(student.full_name);

      const { data } = await supabase
        .from('sessions')
        .select('id, start_time, end_time, status, topic, price, subjects(name)')
        .eq('student_id', studentId)
        .order('start_time', { ascending: false })
        .limit(100);

      setSessions(data ?? []);
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

  return (
    <div className="min-h-screen bg-[#f7f7fb]">
      <header className="bg-white border-b px-6 py-4 flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => navigate('/parent')}>
          <ArrowLeft className="w-4 h-4 mr-1" /> {t('parent.back')}
        </Button>
        <div>
          <h1 className="text-lg font-bold text-gray-900">{studentName}</h1>
          <p className="text-sm text-gray-500">{t('parent.sessionsTitle')}</p>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8 space-y-3">
        {sessions.length === 0 ? (
          <p className="text-gray-500 text-center py-12">{t('parent.noSessions')}</p>
        ) : (
          sessions.map((s) => (
            <div key={s.id} className="bg-white rounded-xl border p-4 flex items-center justify-between">
              <div>
                <p className="font-medium text-gray-900">
                  {(s.subjects as any)?.name ?? t('parent.lesson')}
                  {s.topic ? ` — ${s.topic}` : ''}
                </p>
                <p className="text-sm text-gray-500">
                  {format(new Date(s.start_time), 'yyyy-MM-dd HH:mm', { locale: dateFnsLocale })}
                  {' – '}
                  {format(new Date(s.end_time), 'HH:mm', { locale: dateFnsLocale })}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {s.price != null && (
                  <span className="text-sm font-medium text-gray-700">{s.price.toFixed(2)} €</span>
                )}
                <StatusBadge status={s.status} />
              </div>
            </div>
          ))
        )}
      </main>
    </div>
  );
}
