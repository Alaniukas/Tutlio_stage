import { useEffect, useMemo, useState } from 'react';
import { CalendarRange, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useTranslation } from '@/lib/i18n';
import { countStudentSessionStats, type StudentSessionCounters } from '@/lib/session-stats';
import { withRequestDeadline } from '@/lib/requestDeadline';
import { Button } from '@/components/ui/button';

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

type ScheduleTemplateRow = Omit<ScheduleTemplate, 'subject' | 'tutor'> & {
  subject: ScheduleTemplate['subject'] | NonNullable<ScheduleTemplate['subject']>[];
  tutor: ScheduleTemplate['tutor'] | NonNullable<ScheduleTemplate['tutor']>[];
};

type ScheduleSnapshot = {
  idsKey: string;
  templates: ScheduleTemplate[];
  counters: StudentSessionCounters;
};

const hhmm = (value: string | null | undefined) => String(value || '').slice(0, 5);

/**
 * Student card block: the recurring lesson schedule (weekday/time/subject/
 * tutor + effective times per week), completed lesson total, and move/cancel
 * counters split by who initiated them.
 */
export default function StudentScheduleSummary({ studentRowIds, refreshKey }: StudentScheduleSummaryProps) {
  const { t } = useTranslation();
  const [snapshot, setSnapshot] = useState<ScheduleSnapshot | null>(null);
  const [loadState, setLoadState] = useState({ idsKey: '', loading: false, failed: false });
  const [retry, setRetry] = useState(0);
  const idsKey = [...new Set(studentRowIds)].sort().join(',');
  // Keep the last successful refresh for this child, never another child's data.
  const currentSnapshot = snapshot?.idsKey === idsKey ? snapshot : null;
  const loading = loadState.idsKey !== idsKey || loadState.loading;
  const failed = loadState.idsKey === idsKey && loadState.failed;
  const templates = currentSnapshot?.templates;
  const counters = currentSnapshot?.counters;

  useEffect(() => {
    if (!idsKey) return;
    const studentIds = idsKey.split(',');
    const controller = new AbortController();
    let cancelled = false;
    (async () => {
      setLoadState({ idsKey, loading: true, failed: false });
      try {
        const { templateRows, sessionRows } = await withRequestDeadline(async (deadlineSignal) => {
          const signal = AbortSignal.any([controller.signal, deadlineSignal]);
          const readTemplates = async () => {
            const { data, error } = await supabase
              .from('recurring_individual_sessions')
              .select('id, day_of_week, start_time, end_time, frequency, subject:subjects(name, color), tutor:profiles!recurring_individual_sessions_tutor_id_fkey(full_name)')
              .in('student_id', studentIds)
              .eq('active', true)
              .abortSignal(signal);
            if (error) throw error;
            return (data || []) as ScheduleTemplateRow[];
          };
          const readSessions = async () => {
            const { data, error } = await supabase
              .from('sessions')
              .select('id, status, exclude_from_lesson_count, cancelled_by, rescheduled_at, reschedule_reason, reschedule_requested_by')
              .in('student_id', studentIds)
              .abortSignal(signal);
            if (error) throw error;
            return data || [];
          };
          const [templateRows, sessionRows] = await Promise.all([readTemplates(), readSessions()]);
          return { templateRows, sessionRows };
        });
        if (cancelled) return;
        const normalized: ScheduleTemplate[] = templateRows.map((row) => ({
          ...row,
          subject: Array.isArray(row.subject) ? row.subject[0] ?? null : row.subject ?? null,
          tutor: Array.isArray(row.tutor) ? row.tutor[0] ?? null : row.tutor ?? null,
        }));
        normalized.sort(
          (a, b) =>
            ((a.day_of_week + 6) % 7) - ((b.day_of_week + 6) % 7) ||
            String(a.start_time).localeCompare(String(b.start_time)),
        );
        setSnapshot({ idsKey, templates: normalized, counters: countStudentSessionStats(sessionRows) });
        setLoadState({ idsKey, loading: false, failed: false });
      } catch (err) {
        if (cancelled) return;
        console.error('[StudentScheduleSummary] load failed:', err);
        setLoadState({ idsKey, loading: false, failed: true });
      }
    })();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [idsKey, refreshKey, retry]);

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
    for (const template of templates || []) {
      if (template.frequency === 'biweekly') total += 0.5;
      else if (template.frequency === 'monthly') total += 0.25;
      else total += 1;
    }
    return Math.round(total * 10) / 10;
  }, [templates]);

  if (!idsKey) return null;

  return (
    <div>
      <h4 className="font-semibold text-gray-900 flex items-center gap-2 mb-2">
        <CalendarRange className="w-4 h-4 text-indigo-500" />
        {t('compStu.scheduleTitle')}
      </h4>

      {loading && <Loader2 aria-label={t('common.loading')} className="mb-2 h-4 w-4 animate-spin" />}
      {failed && (
        <div role="alert" className="mb-2 text-sm text-red-600">
          {t('compStu.scheduleLoadFailed')}
          <Button type="button" size="sm" variant="ghost" onClick={() => setRetry((value) => value + 1)}>
            {t('stuSess.retry')}
          </Button>
        </div>
      )}

      {templates && templates.length > 0 ? (
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
      ) : currentSnapshot ? (
        <p className="text-xs text-gray-400 mb-2">{t('compStu.scheduleEmpty')}</p>
      ) : null}

      {counters && (
        <div className="grid grid-cols-2 gap-1.5 text-xs">
          <div className="col-span-2 rounded-lg border border-indigo-100 bg-indigo-50 px-2.5 py-1.5 font-medium text-indigo-700">
            {t('compStu.lessonsHadCount', { count: String(counters.lessonsHad) })}
          </div>
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
