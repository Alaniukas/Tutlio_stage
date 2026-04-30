import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { getCached, setCache } from '@/lib/dataCache';
import { useUser } from '@/contexts/UserContext';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from '@/lib/i18n';
import { Users, CalendarDays, FileText, MessageSquare, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface ChildInfo {
  studentId: string;
  fullName: string;
  tutorName: string | null;
  upcomingCount: number;
  completedCount: number;
  cancelledCount: number;
  noShowCount: number;
  cancelledByTutorCount: number;
  cancelledByStudentCount: number;
}

const PARENT_CACHE_KEY = 'parent_dashboard';

export default function ParentDashboard() {
  const { user } = useUser();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const cached = getCached<{ parentName: string; children: ChildInfo[] }>(PARENT_CACHE_KEY);
  const [parentName, setParentName] = useState(cached?.parentName ?? '');
  const [children, setChildren] = useState<ChildInfo[]>(cached?.children ?? []);
  const [loading, setLoading] = useState(!cached);

  useEffect(() => {
    if (!user || getCached(PARENT_CACHE_KEY)) return;
    (async () => {
      setLoading(true);

      const { data: parent } = await supabase
        .from('parent_profiles')
        .select('full_name')
        .eq('user_id', user.id)
        .single();

      if (parent) setParentName(parent.full_name);

      const { data: links } = await supabase
        .from('parent_students')
        .select('student_id, students(id, full_name, tutor_id, profiles:tutor_id(full_name))')
        .eq('parent_id', user.id);

      const now = new Date().toISOString();
      const kids: ChildInfo[] = [];

      for (const link of links ?? []) {
        const s = link.students as any;
        if (!s) continue;

        const { count: upcoming } = await supabase
          .from('sessions')
          .select('id', { count: 'exact', head: true })
          .eq('student_id', s.id)
          .gte('start_time', now)
          .neq('status', 'cancelled');

        const { count: completed } = await supabase
          .from('sessions')
          .select('id', { count: 'exact', head: true })
          .eq('student_id', s.id)
          .eq('status', 'completed');

        const { data: cancelledSessions } = await supabase
          .from('sessions')
          .select('cancelled_by')
          .eq('student_id', s.id)
          .eq('status', 'cancelled');

        const cancelledTotal = cancelledSessions?.length ?? 0;
        const cancelledByTutor = cancelledSessions?.filter((cs: any) => cs.cancelled_by === 'tutor').length ?? 0;
        const cancelledByStudent = cancelledSessions?.filter((cs: any) => cs.cancelled_by === 'student').length ?? 0;

        const { count: noShowCount } = await supabase
          .from('sessions')
          .select('id', { count: 'exact', head: true })
          .eq('student_id', s.id)
          .eq('status', 'no_show');

        kids.push({
          studentId: s.id,
          fullName: s.full_name,
          tutorName: (s.profiles as any)?.full_name ?? null,
          upcomingCount: upcoming ?? 0,
          completedCount: completed ?? 0,
          cancelledCount: cancelledTotal,
          noShowCount: noShowCount ?? 0,
          cancelledByTutorCount: cancelledByTutor,
          cancelledByStudentCount: cancelledByStudent,
        });
      }

      setChildren(kids);
      setCache(PARENT_CACHE_KEY, { parentName: parent?.full_name ?? '', children: kids });
      setLoading(false);
    })();
  }, [user?.id]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/login');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f7f7fb] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-violet-200 border-t-violet-600 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f7f7fb]">
      <header className="bg-white border-b px-4 sm:px-6 py-3 sm:py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-lg sm:text-xl font-bold text-gray-900">{t('parent.dashboard')}</h1>
          <p className="text-sm text-gray-500">{parentName}</p>
        </div>
        <div className="flex items-center gap-1 sm:gap-2 flex-wrap">
          <Button variant="ghost" size="sm" onClick={() => navigate('/parent/invoices')}>
            <FileText className="w-4 h-4 mr-1" /> <span className="hidden sm:inline">{t('parent.invoices')}</span>
          </Button>
          <Button variant="ghost" size="sm" onClick={() => navigate('/parent/messages')}>
            <MessageSquare className="w-4 h-4 mr-1" /> <span className="hidden sm:inline">{t('parent.messages')}</span>
          </Button>
          <Button variant="ghost" size="sm" onClick={handleLogout}>
            <LogOut className="w-4 h-4 mr-1" /> <span className="hidden sm:inline">{t('parent.logout')}</span>
          </Button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        <div className="flex items-center gap-2 mb-6">
          <Users className="w-5 h-5 text-violet-600" />
          <h2 className="text-lg font-semibold text-gray-900">{t('parent.children')}</h2>
        </div>

        {children.length === 0 ? (
          <p className="text-gray-500 text-center py-12">{t('parent.noChildren')}</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {children.map((child) => (
              <Card key={child.studentId} className="hover:shadow-md transition-shadow cursor-pointer"
                onClick={() => navigate(`/parent/child/${child.studentId}`)}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">{child.fullName}</CardTitle>
                  {child.tutorName && (
                    <p className="text-sm text-gray-500">{t('parent.tutor')}: {child.tutorName}</p>
                  )}
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-2 text-sm text-gray-600">
                    <span className="flex items-center gap-1">
                      <CalendarDays className="w-4 h-4 text-blue-500" />
                      {child.upcomingCount} {t('parent.upcoming')}
                    </span>
                    <span className="flex items-center gap-1">
                      <CalendarDays className="w-4 h-4 text-green-500" />
                      {child.completedCount} {t('parent.completed')}
                    </span>
                    <span className="flex items-center gap-1 text-amber-600">
                      {child.cancelledCount} {t('parent.cancelled')}
                    </span>
                    <span className="flex items-center gap-1 text-red-500">
                      {child.noShowCount} {t('parent.noShow')}
                    </span>
                  </div>
                  {child.cancelledCount > 0 && (
                    <p className="text-xs text-gray-400 mt-2">
                      {t('parent.cancelledBy', {
                        student: String(child.cancelledByStudentCount),
                        tutor: String(child.cancelledByTutorCount),
                      })}
                    </p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
