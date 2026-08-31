import { useEffect, useMemo, useState } from 'react';
import { CalendarRange } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useTranslation } from '@/lib/i18n';
import { countStudentSessionStats, type StudentSessionCounters } from '@/lib/session-stats';

interface StudentScheduleSummaryProps {
  /** All students.id rows of the selected identity group. */
  studentRowIds: string[];
  /** Bump to refetch (e.g. after booking from the card). */
  refreshKey?: number;
}

type ScheduleTemplate = {
  id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  frequency: string | null;
  subject: { name: string | null; color: string | null } | null;
  tutor: { full_name: string | null } | null;
};

const hhmm = (value: string | null | undefined) => String(value || '').slice(0, 5);

/**
 * Student card block: the recurring lesson schedule (weekday/time/subject/
 * tutor + effective times per week) and move/cancel counters split by who
 * initiated them (req: "pamokų tvarkaraštis ... kiek mokinys perkėlė/atšaukė").
 */
export default function StudentScheduleSummary({ studentRowIds, refreshKey }: StudentScheduleSummaryProps) {
  const { t } = useTranslation();
  const [templates, setTemplates] = useState<ScheduleTemplate[]>([]);
  const [counters, setCounters] = useState<StudentSessionCounters | null>(null);
  const [loading, setLoading] = useState(false);

  const idsKey = studentRowIds.join(',');

  useEffect(() => {
    if (studentRowIds.length === 0) {
      setTemplates([]);
      setCounters(null);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [{ data: templateRows }, { data: sessionRows }] = await Promise.all([
          supabase
            .from('recurring_individual_sessions')
            .select('id, day_of_week, start_time, end_time, frequency, subject:subjects(name, color), tutor:profiles!recurring_individual_sessions_tutor_id_fkey(full_name)')
            .in('student_id', studentRowIds)
            .eq('active', true),
          supabase
            .from('sessions')
            .select('id, status, cancelled_by, rescheduled_at, reschedule_reason, reschedule_requested_by')
            .in('student_id', studentRowIds),
        ]);
        if (cancelled) return;
        const normalized = ((templateRows || []) as any[]).map((row) => ({
          ...row,
          subject: Array.isArray(row.subject) ? row.subject[0] ?? null : row.subject ?? null,
          tutor: Array.isArray(row.tutor) ? row.tutor[0] ?? null : row.tutor ?? null,
        })) as ScheduleTemplate[];
        normalized.sort(
          (a, b) =>
            ((a.day_of_week + 6) % 7) - ((b.day_of_week + 6) % 7) ||
            String(a.start_time).localeCompare(String(b.start_time)),
        );
        setTemplates(normalized);
        setCounters(countStudentSessionStats((sessionRows || []) as any[]));
      } catch (err) {
        console.error('[StudentScheduleSummary] load failed:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey, refreshKey]);

  const weekdayLabels = useMemo(() => [
    t('compSch.wdSun'),
    t('compSch.wdMon'),
    t('compSch.wdTue'),
    t('compSch.wdWed'),
    t('compSch.wdThu'),
    t('compSch.wdFri'),
    t('compSch.wdSat'),
  ], [t]);

  const effectivePerWeek = useMemo(() => {
    let total = 0;
    for (const template of templates) {
      if (template.frequency === 'biweekly') total += 0.5;
      else if (template.frequency === 'monthly') total += 0.25;
      else total += 1;
    }
    return Math.round(total * 10) / 10;
  }, [templates]);

  if (loading && templates.length === 0 && !counters) return null;
  if (templates.length === 0 && !counters) return null;

  return (
    <div>
      <h4 className="font-semibold text-gray-900 flex items-center gap-2 mb-2">
        <CalendarRange className="w-4 h-4 text-indigo-500" />
        {t('compStu.scheduleTitle')}
      </h4>

      {templates.length > 0 ? (
        <div className="space-y-1.5 mb-2">
          {templates.map((template) => (
            <div key={template.id} className="flex items-center gap-2 text-sm text-gray-700 min-w-0">
              <span
                className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: template.subject?.color || '#6366f1' }}
              />
              <span className="font-medium">{weekdayLabels[template.day_of_week] ?? ''}</span>
              <span className="tabular-nums">
                {hhmm(template.start_time)}–{hhmm(template.end_time)}
              </span>
              <span className="truncate">{template.subject?.name || t('compStu.subjectFallback')}</span>
              {template.tutor?.full_name && (
                <span className="text-gray-400 truncate">· {template.tutor.full_name}</span>
              )}
              {template.frequency === 'biweekly' && (
                <span className="text-xs text-gray-400">({t('cal.freqBiweekly')})</span>
              )}
              {template.frequency === 'monthly' && (
                <span className="text-xs text-gray-400">({t('cal.freqMonthly')})</span>
              )}
            </div>
          ))}
          <p className="text-xs text-gray-500">
            {t('compStu.effectivePerWeek', { count: String(effectivePerWeek) })}
          </p>
        </div>
      ) : (
        <p className="text-xs text-gray-400 mb-2">{t('compStu.scheduleEmpty')}</p>
      )}

      {counters && (
        <div className="grid grid-cols-2 gap-1.5 text-xs">
          <div className="rounded-lg bg-gray-50 border border-gray-100 px-2.5 py-1.5 text-gray-600">
            {t('compStu.movedByStudentCount', { count: String(counters.movedByStudent) })}
          </div>
          <div className="rounded-lg bg-gray-50 border border-gray-100 px-2.5 py-1.5 text-gray-600">
            {t('compStu.cancelledByStudentCount', { count: String(counters.cancelledByStudent) })}
          </div>
          <div className="rounded-lg bg-gray-50 border border-gray-100 px-2.5 py-1.5 text-gray-600">
            {t('compStu.movedByTutorCount', { count: String(counters.movedByTutor) })}
          </div>
          <div className="rounded-lg bg-gray-50 border border-gray-100 px-2.5 py-1.5 text-gray-600">
            {t('compStu.cancelledByTutorCount', { count: String(counters.cancelledByTutor) })}
          </div>
        </div>
      )}
    </div>
  );
}
