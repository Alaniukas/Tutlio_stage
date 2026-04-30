import { useEffect, useState } from 'react';
import Layout from '@/components/Layout';
import { supabase } from '@/lib/supabase';
import { getCached, setCache, invalidateCache } from '@/lib/dataCache';
import { authHeaders } from '@/lib/apiHelpers';
import { Button } from '@/components/ui/button';
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
import { Trash2, Plus, Clock, User, BookOpen, AlertCircle, CheckCircle, ChevronDown, ChevronUp, Sparkles } from 'lucide-react';
import { format } from 'date-fns';
import { useTranslation } from '@/lib/i18n';
import { sortStudentsByFullName } from '@/lib/sortStudentsByFullName';

interface WaitlistEntry {
  id: string;
  student_id: string;
  session_id: string | null;
  notes: string | null;
  student?: { full_name: string; email: string; phone: string };
  session?: {
    id: string;
    start_time: string;
    end_time: string;
    topic: string | null;
    status: string;
  };
}

interface Student {
  id: string;
  full_name: string;
  email?: string;
}

interface Session {
  id: string;
  start_time: string;
  end_time: string;
  topic: string | null;
  status: string;
  student?: { full_name: string };
}

export default function WaitlistPage() {
  const { t, dateFnsLocale } = useTranslation();
  const wc = getCached<any>('tutor_waitlist');
  const [waitlist, setWaitlist] = useState<WaitlistEntry[]>(wc?.waitlist ?? []);
  const [students, setStudents] = useState<Student[]>(wc?.students ?? []);
  const [sessions, setSessions] = useState<Session[]>(wc?.sessions ?? []);
  const [loading, setLoading] = useState(!wc);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [newEntry, setNewEntry] = useState({ student_id: '', session_id: '', notes: '' });
  const [saving, setSaving] = useState(false);
  const [isWaitlistExpanded, setIsWaitlistExpanded] = useState(true);
  const [isCancelledExpanded, setIsCancelledExpanded] = useState(false);

  const WAITLIST_TIP_KEY = 'tutlio_waitlist_tip_seen';
  const [waitlistTipExpanded, setWaitlistTipExpanded] = useState(() => {
    if (typeof window === 'undefined') return true;
    return !localStorage.getItem(WAITLIST_TIP_KEY);
  });

  const setWaitlistTipSeen = () => {
    if (typeof window !== 'undefined') localStorage.setItem(WAITLIST_TIP_KEY, '1');
  };

  useEffect(() => { if (!getCached('tutor_waitlist')) fetchData(); }, []);

  useEffect(() => {
    if (!loading) setCache('tutor_waitlist', { waitlist, students, sessions });
  }, [loading, waitlist, students, sessions]);

  const fetchData = async () => {
    if (!getCached('tutor_waitlist')) setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: waitlistData } = await supabase
      .from('waitlists')
      .select('*, student:students(full_name, email, phone), session:sessions(id, start_time, end_time, topic, status)')
      .eq('tutor_id', user.id)
      .order('created_at', { ascending: false });

    const now = new Date();
    const filtered = (waitlistData || []).filter(entry => {
      if (!entry.session) return true;
      return new Date(entry.session.end_time) >= now;
    });
    setWaitlist(filtered);

    const { data: studentsData } = await supabase
      .from('students')
      .select('id, full_name, email')
      .eq('tutor_id', user.id);
    setStudents(studentsData || []);

    const { data: sessionsData } = await supabase
      .from('sessions')
      .select('*, student:students(full_name)')
      .eq('tutor_id', user.id)
      .eq('status', 'active')
      .gte('start_time', new Date().toISOString())
      .order('start_time', { ascending: true });
    setSessions(sessionsData || []);
    invalidateCache('tutor_calendar');
    setLoading(false);
  };

  const handleAddToWaitlist = async () => {
    if (!newEntry.student_id) return;
    setSaving(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const sessionId = newEntry.session_id && newEntry.session_id !== 'any' ? newEntry.session_id : null;
    const { error } = await supabase.from('waitlists').insert([
      {
        tutor_id: user.id,
        student_id: newEntry.student_id,
        session_id: sessionId,
        notes: newEntry.notes || null,
        preferred_day: '',
        preferred_time: '',
      },
    ]);

    if (!error) {
      try {
        const selectedStudent = students.find(s => s.id === newEntry.student_id);
        const { data: tutorProfile } = await supabase
          .from('profiles')
          .select('full_name, email')
          .eq('id', user.id)
          .single();

        const tutorName = tutorProfile?.full_name || t('waitlist.defaultTutor');

        let sessionInfo = null;
        if (newEntry.session_id && newEntry.session_id !== 'any') {
          const selectedSession = sessions.find(s => s.id === newEntry.session_id);
          if (selectedSession) {
            sessionInfo = {
              startTime: new Date(selectedSession.start_time).toLocaleString('lt-LT', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              }),
              topic: selectedSession.topic || t('common.lesson'),
            };
          }
        }

        if (selectedStudent?.email) {
          await fetch('/api/send-email', {
            method: 'POST',
            headers: await authHeaders(),
            body: JSON.stringify({
              type: 'waitlist_added',
              to: selectedStudent.email,
              data: {
                studentName: selectedStudent.full_name || t('common.student'),
                tutorName,
                sessionInfo,
              },
            }),
          });
        }
      } catch (emailErr) {
        console.error('[Waitlist] Error sending waitlist confirmation email:', emailErr);
      }

      setIsDialogOpen(false);
      setNewEntry({ student_id: '', session_id: '', notes: '' });
      fetchData();
    }
    setSaving(false);
  };

  const handleAssignToSession = async (waitlistId: string, sessionId: string) => {
    if (!confirm(t('waitlist.assignConfirm'))) return;
    const entry = waitlist.find((w) => w.id === waitlistId);
    if (!entry) return;

    const { error } = await supabase
      .from('sessions')
      .update({ student_id: entry.student_id, status: 'active' })
      .eq('id', sessionId);

    if (!error) {
      await supabase.from('waitlists').delete().eq('id', waitlistId);
      fetchData();
    }
  };

  const handleDeleteEntry = async (id: string) => {
    if (!confirm(t('waitlist.removeConfirm'))) return;
    await supabase.from('waitlists').delete().eq('id', id);
    fetchData();
  };

  const formatSessionLabel = (s: Session) => {
    try {
      const start = new Date(s.start_time);
      return `${format(start, 'EEE, d MMM HH:mm', { locale: dateFnsLocale })}${s.topic ? ` · ${s.topic}` : ''}${s.student?.full_name ? ` (${s.student.full_name})` : ''}`;
    } catch {
      return s.id;
    }
  };

  return (
    <Layout>
      <div className="max-w-4xl mx-auto space-y-6 animate-fade-in">
        <div className="rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 overflow-hidden text-white shadow-lg">
          <button
            type="button"
            onClick={() => {
              setWaitlistTipExpanded((e) => {
                if (e) setWaitlistTipSeen();
                return !e;
              });
            }}
            className="w-full flex items-center justify-between p-4 sm:p-5 text-left hover:bg-white/5 transition-colors"
          >
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 flex-shrink-0" />
              <h2 className="text-lg font-bold">{t('waitlist.howItWorks')}</h2>
            </div>
            {waitlistTipExpanded ? <ChevronUp className="w-5 h-5 flex-shrink-0 text-indigo-200" /> : <ChevronDown className="w-5 h-5 flex-shrink-0 text-indigo-200" />}
          </button>
          {waitlistTipExpanded && (
            <div className="px-4 sm:px-5 pb-5 pt-0 border-t border-white/10">
              <p className="text-sm text-indigo-50 mb-3">{t('waitlist.howItWorksDesc')}</p>
              <ul className="text-sm text-indigo-50 space-y-1.5">
                <li>• <strong>{t('common.student')}</strong> {t('waitlist.howItWorksBullet1')}</li>
                <li>• <strong>{t('common.tutor')}</strong> {t('waitlist.howItWorksBullet2')}</li>
              </ul>
            </div>
          )}
        </div>

        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{t('waitlist.title')}</h1>
            <p className="text-sm text-gray-500 mt-0.5">{t('waitlist.subtitle')}</p>
          </div>
          <Button onClick={() => setIsDialogOpen(true)} className="gap-2 rounded-xl w-full sm:w-auto shrink-0">
            <Plus className="w-4 h-4" />
            {t('waitlist.addToQueue')}
          </Button>
        </div>

        {sessions.length > 0 && (
          <div className="bg-blue-50 border border-blue-200 rounded-2xl overflow-hidden">
            <button
              onClick={() => setIsCancelledExpanded(!isCancelledExpanded)}
              className="w-full flex items-center justify-between px-4 py-3.5 hover:bg-blue-100/50 transition-colors"
            >
              <div className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-blue-600" />
                <span className="text-sm font-semibold text-blue-800">{t('waitlist.reservedSessions', { count: sessions.length })}</span>
              </div>
              {isCancelledExpanded ? <ChevronUp className="w-4 h-4 text-blue-600 flex-shrink-0" /> : <ChevronDown className="w-4 h-4 text-blue-600 flex-shrink-0" />}
            </button>
            {isCancelledExpanded && (
              <div className="px-4 pb-4 space-y-2">
                {sessions.map((s) => (
                  <div key={s.id} className="flex items-center justify-between gap-2 bg-white rounded-xl px-3 sm:px-4 py-2.5 border border-blue-100">
                    <div className="flex items-center gap-2 sm:gap-3 text-sm min-w-0">
                      <Clock className="w-3.5 h-3.5 text-blue-600 flex-shrink-0" />
                      <span className="text-gray-700 font-medium truncate">{format(new Date(s.start_time), 'EEE, d MMMM HH:mm', { locale: dateFnsLocale })}</span>
                      {s.topic && <span className="text-gray-400 hidden sm:inline">· {s.topic}</span>}
                      {s.student?.full_name && <span className="text-gray-400 hidden sm:inline">· {s.student.full_name}</span>}
                    </div>
                    <span className="text-xs text-blue-600 font-medium flex-shrink-0">{t('waitlist.reserved')}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {loading ? (
          <div className="text-center py-12 text-gray-400">{t('common.loading')}</div>
        ) : waitlist.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
            <div className="text-center py-16 px-6">
              <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4">
                <User className="w-8 h-8 text-gray-300" />
              </div>
              <p className="text-gray-500 font-medium">{t('waitlist.emptyTitle')}</p>
              <p className="text-gray-400 text-sm mt-1">{t('waitlist.emptyHint')}</p>
              <Button onClick={() => setIsDialogOpen(true)} variant="outline" size="sm" className="mt-4 rounded-xl gap-2">
                <Plus className="w-4 h-4" /> {t('waitlist.addFirst')}
              </Button>
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden animate-fade-in">
            <button
              onClick={() => setIsWaitlistExpanded(!isWaitlistExpanded)}
              className="w-full flex items-center justify-between p-5 bg-gray-50/50 hover:bg-gray-50 transition-colors border-b border-gray-100"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center">
                  <User className="w-5 h-5 text-indigo-600" />
                </div>
                <div className="text-left">
                  <h3 className="font-semibold text-gray-900">{t('waitlist.waitingList')}</h3>
                  <p className="text-xs text-gray-500">{t('waitlist.studentsWaiting', { count: waitlist.length })}</p>
                </div>
              </div>
              {isWaitlistExpanded ? <ChevronUp className="w-5 h-5 text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-400" />}
            </button>

            {isWaitlistExpanded && (
              <div className="divide-y divide-gray-100">
                {waitlist.map((entry, idx) => (
                  <div key={entry.id} className="p-5 hover:bg-gray-50/50 transition-colors animate-fade-in" style={{ animationDelay: `${idx * 50}ms` }}>
                    <div className="space-y-2">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold text-sm flex-shrink-0">
                            {entry.student?.full_name?.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2) || '?'}
                          </div>
                          <div className="min-w-0">
                            <p className="font-semibold text-gray-900 truncate">{entry.student?.full_name}</p>
                            <p className="text-xs text-gray-400 truncate">{entry.student?.email} · {entry.student?.phone}</p>
                          </div>
                        </div>
                        <button type="button" onClick={() => handleDeleteEntry(entry.id)} className="p-2 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors flex-shrink-0">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>

                      <div className="flex flex-col sm:flex-row sm:items-center gap-2 flex-wrap sm:pl-[52px] pl-0">
                        <div className="flex-1 min-w-0">
                          {entry.session ? (
                            <div className="flex items-center gap-2 text-sm">
                              <BookOpen className="w-4 h-4 text-indigo-400 flex-shrink-0" />
                              <div className="min-w-0">
                                <p className="text-gray-700 font-medium">
                                  {t('waitlist.waitingFor', { time: format(new Date(entry.session.start_time), 'EEE, d MMM HH:mm', { locale: dateFnsLocale }) })}
                                </p>
                                {entry.session.topic && <p className="text-xs text-gray-400 truncate">{entry.session.topic}</p>}
                                <p className="text-xs text-blue-600 mt-0.5">{t('waitlist.autoNotify')}</p>
                              </div>
                            </div>
                          ) : (
                            <span className="text-xs bg-gray-100 text-gray-500 px-3 py-1 rounded-full">{t('waitlist.anyTime')}</span>
                          )}
                          {entry.notes && (() => { try { JSON.parse(entry.notes!); return null; } catch { return <p className="text-xs text-gray-400 mt-1 italic">{entry.notes}</p>; } })()}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="w-[95vw] sm:max-w-[440px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('waitlist.addToWaitlistTitle')}</DialogTitle>
            <DialogDescription>{t('waitlist.addToWaitlistDesc')}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">{t('waitlist.studentRequired')}</label>
              <Select value={newEntry.student_id} onValueChange={(val) => setNewEntry({ ...newEntry, student_id: val })}>
                <SelectTrigger className="rounded-xl"><SelectValue placeholder={t('waitlist.selectStudent')} /></SelectTrigger>
                <SelectContent>
                  {sortStudentsByFullName(students).map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.full_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {sessions.length > 0 ? (
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">{t('waitlist.lessonOptional')}</label>
                <Select value={newEntry.session_id} onValueChange={(val) => setNewEntry({ ...newEntry, session_id: val })}>
                  <SelectTrigger className="rounded-xl"><SelectValue placeholder={t('waitlist.anyFreeLesson')} /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="any">{t('waitlist.anyFreeLesson')}</SelectItem>
                    {sessions.map((s) => (<SelectItem key={s.id} value={s.id}>{formatSessionLabel(s)}</SelectItem>))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-gray-400">{t('waitlist.lessonHint')}</p>
              </div>
            ) : (
              <div className="flex items-start gap-3 p-3 bg-gray-50 border border-gray-200 rounded-xl">
                <AlertCircle className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-gray-700">{t('waitlist.noReservedLessons')}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{t('waitlist.noReservedHint')}</p>
                </div>
              </div>
            )}

            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">{t('waitlist.notesOptional')}</label>
              <textarea
                placeholder={t('waitlist.notesPlaceholder')}
                value={newEntry.notes}
                onChange={(e) => setNewEntry({ ...newEntry, notes: e.target.value })}
                rows={2}
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)} className="rounded-xl">{t('common.cancel')}</Button>
            <Button onClick={handleAddToWaitlist} disabled={saving || !newEntry.student_id} className="rounded-xl">
              {saving ? t('waitlist.savingText') : t('waitlist.addToQueueBtn')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
