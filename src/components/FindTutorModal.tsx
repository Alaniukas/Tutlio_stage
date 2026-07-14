import { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { DateInput } from '@/components/ui/date-input';
import { TimeInput } from '@/components/ui/time-input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/lib/supabase';
import { Loader2, Search, CalendarDays, Star, Plus, Trash2 } from 'lucide-react';
import { useTranslation } from '@/lib/i18n';
import { fmtMoney } from '@/lib/marketMoney';
import { cn } from '@/lib/utils';
import { format, addDays } from 'date-fns';
import {
  computeTutorSlots,
  groupAndRankTutors,
  subtractBusyFromMatchSlots,
  type AvailabilityRule,
  type BusyInterval,
  type MatchSlot,
  type MatchSubject,
} from '@/lib/tutorMatching';

export type TutorSlotPick = MatchSlot;

interface FindTutorModalProps {
  isOpen: boolean;
  onClose: () => void;
  orgId: string | null;
  /** Paspaudus rezultatą – uždaryti paiešką ir atidaryti užsakymą (pvz. org tvarkaraštyje) */
  onPickSlot?: (slot: TutorSlotPick) => void;
  /** Student creation flow: select the matching tutor without booking a lesson yet. */
  onPickTutor?: (tutor: { id: string; name: string }) => void;
  /** When opened from a student context, this tutor is ranked first. */
  primaryTutorId?: string | null;
  /** Enables the lessons-per-week frequency search + ranked grouping (org feature flag). */
  frequencyEnabled?: boolean;
  /** Lessons created while this modal remains mounted, removed immediately from visible results. */
  busyIntervals?: BusyInterval[];
}

type PreferredWindow = {
  id: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
};

type SubjectCriterion = {
  id: string;
  subjectName: string;
  frequency: number;
};

const SEARCH_HORIZON_DAYS = 27;

function windowId(dayOfWeek: number): string {
  return `${dayOfWeek}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export default function FindTutorModal({
  isOpen,
  onClose,
  orgId,
  onPickSlot,
  onPickTutor,
  primaryTutorId,
  frequencyEnabled,
  busyIntervals = [],
}: FindTutorModalProps) {
  const { t } = useTranslation();
  const [subjects, setSubjects] = useState<MatchSubject[]>([]);
  const [subjectCriteria, setSubjectCriteria] = useState<SubjectCriterion[]>([
    { id: 'subject-default', subjectName: '', frequency: 1 },
  ]);
  const [dateFrom, setDateFrom] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [preferredWindows, setPreferredWindows] = useState<PreferredWindow[]>([
    { id: 'mon-default', dayOfWeek: 1, startTime: '16:00', endTime: '20:00' },
  ]);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<MatchSlot[]>([]);
  const [searched, setSearched] = useState(false);
  const [tutors, setTutors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (busyIntervals.length === 0) return;
    setResults((current) => subtractBusyFromMatchSlots(current, busyIntervals));
  }, [busyIntervals]);

  useEffect(() => {
    if (isOpen) return;
    setResults([]);
    setSearched(false);
    setLoading(false);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !orgId) return;
    (async () => {
      const { getOrgVisibleTutors } = await import('@/lib/orgVisibleTutors');
      const { data: orgRow } = await supabase
        .from('organizations')
        .select('tutor_license_count')
        .eq('id', orgId)
        .single();
      const orgUsesLicenses = (Number(orgRow?.tutor_license_count) || 0) > 0;
      const tutorList = (await getOrgVisibleTutors(supabase, orgId, 'id, full_name, email, has_active_license')).filter(
        (p) => !orgUsesLicenses || p.has_active_license !== false,
      );
      const map: Record<string, string> = {};
      tutorList.forEach((t: any) => { map[t.id] = t.full_name; });
      setTutors(map);

      const tutorIds = tutorList.map((t: any) => t.id);
      if (tutorIds.length === 0) return;
      const { data: subjectsData } = await supabase.from('subjects').select('id, name, price, duration_minutes, tutor_id').in('tutor_id', tutorIds).order('name');
      setSubjects((subjectsData as MatchSubject[]) || []);
    })();
  }, [isOpen, orgId]);

  const uniqueSubjectNames = useMemo(
    () => [...new Set(subjects.map(s => s.name))].sort(),
    [subjects]
  );

  const weekdays = useMemo(() => [
    { dayOfWeek: 1, label: t('compSch.wdMon') },
    { dayOfWeek: 2, label: t('compSch.wdTue') },
    { dayOfWeek: 3, label: t('compSch.wdWed') },
    { dayOfWeek: 4, label: t('compSch.wdThu') },
    { dayOfWeek: 5, label: t('compSch.wdFri') },
    { dayOfWeek: 6, label: t('compSch.wdSat') },
    { dayOfWeek: 0, label: t('compSch.wdSun') },
  ], [t]);

  const toggleWeekday = (dayOfWeek: number) => {
    setSearched(false);
    setResults([]);
    setPreferredWindows((current) => {
      const hasDay = current.some((window) => window.dayOfWeek === dayOfWeek);
      if (hasDay) return current.filter((window) => window.dayOfWeek !== dayOfWeek);
      return [...current, { id: windowId(dayOfWeek), dayOfWeek, startTime: '16:00', endTime: '20:00' }];
    });
  };

  const updatePreferredWindow = (id: string, patch: Partial<PreferredWindow>) => {
    setPreferredWindows((current) => current.map((window) => (
      window.id === id ? { ...window, ...patch } : window
    )));
  };

  const handleSearch = async () => {
    if (preferredWindows.length === 0) {
      setSearched(true);
      setResults([]);
      return;
    }
    setLoading(true);
    setSearched(true);
    const tutorIds = Object.keys(tutors);
    if (tutorIds.length === 0) { setResults([]); setLoading(false); return; }

    const from = new Date(dateFrom);
    from.setHours(0, 0, 0, 0);
    const dateTo = format(addDays(new Date(`${dateFrom}T12:00:00`), SEARCH_HORIZON_DAYS), 'yyyy-MM-dd');
    const to = new Date(dateTo);
    to.setHours(23, 59, 59, 999);

    const { data: availability } = await supabase
      .from('availability')
      .select('tutor_id, day_of_week, start_time, end_time, is_recurring, specific_date, end_date, created_at, subject_ids')
      .in('tutor_id', tutorIds);

    const { data: sessions } = await supabase
      .from('sessions')
      .select('tutor_id, start_time, end_time')
      .in('tutor_id', tutorIds)
      // Any overlap is busy: session starts before the range ends and ends
      // after the range starts. This also covers lessons crossing a boundary.
      .lt('start_time', to.toISOString())
      .gt('end_time', from.toISOString())
      .neq('status', 'cancelled');

    const busy: BusyInterval[] = (sessions || []).map((s: any) => ({
      tutor_id: s.tutor_id,
      start: new Date(s.start_time),
      end: new Date(s.end_time),
    })).concat(busyIntervals);

    const slotsByKey = new Map<string, MatchSlot>();
    for (const criterion of subjectCriteria) {
      const criterionSlots = computeTutorSlots(
        (availability as AvailabilityRule[]) || [],
        busy,
        subjects,
        tutors,
        {
          dateFrom,
          dateTo,
          timeFrom: '00:00',
          timeTo: '23:59',
          subjectName: criterion.subjectName,
          preferredWindows,
        },
      );
      for (const slot of criterionSlots) {
        slotsByKey.set(`${slot.tutorId}-${slot.subjectId}-${slot.start.getTime()}-${slot.end.getTime()}`, slot);
      }
    }

    setResults(Array.from(slotsByKey.values()).sort((a, b) => a.start.getTime() - b.start.getTime()));
    setLoading(false);
  };

  const groups = useMemo(
    () => groupAndRankTutors(results, {
      frequencyPerWeek: subjectCriteria.reduce((total, criterion) => total + criterion.frequency, 0),
      primaryTutorId,
    }),
    [results, subjectCriteria, primaryTutorId],
  );

  const renderSlotButton = (slot: MatchSlot) => (
    <button
      key={`${slot.tutorId}-${slot.subjectId}-${slot.start.getTime()}`}
      type="button"
      disabled={!onPickSlot && !onPickTutor}
      onClick={() => {
        if (onPickSlot) onPickSlot(slot);
        else if (onPickTutor) onPickTutor({ id: slot.tutorId, name: slot.tutorName });
      }}
      className={cn(
        'w-full flex items-center justify-between p-3 border border-gray-200 rounded-xl text-left transition-colors',
        onPickSlot || onPickTutor
          ? 'hover:border-indigo-400 hover:bg-indigo-50/50 cursor-pointer'
          : 'opacity-90 cursor-default',
      )}
    >
      <div>
        {!frequencyEnabled && <p className="text-sm font-medium text-gray-900">{slot.tutorName}</p>}
        <p className="text-xs text-gray-500">
          {slot.subjectName} &middot; {format(slot.start, 'MMM d, HH:mm')}–{format(slot.end, 'HH:mm')} &middot; {fmtMoney(slot.price)}
        </p>
      </div>
    </button>
  );

  return (
    <Dialog open={isOpen} onOpenChange={open => { if (!open) onClose(); }}>
      <DialogContent className="w-[95vw] max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Search className="w-5 h-5 text-indigo-600" />
            {t('findLesson.title')}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            {subjectCriteria.map((criterion, index) => (
              <div key={criterion.id} className={cn('grid items-end gap-3', frequencyEnabled ? 'grid-cols-[1fr_10rem_auto]' : 'grid-cols-[1fr_auto]')}>
                <div>
                  <Label className="text-xs">{index === 0 ? t('findLesson.subject') : t('findLesson.additionalSubject')}</Label>
                  <Select
                    value={criterion.subjectName || '__all__'}
                    onValueChange={(value) => setSubjectCriteria((current) => current.map((item) => (
                      item.id === criterion.id ? { ...item, subjectName: value === '__all__' ? '' : value } : item
                    )))}
                  >
                    <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">{t('findLesson.allSubjects')}</SelectItem>
                      {uniqueSubjectNames.map((name) => (
                        <SelectItem
                          key={name}
                          value={name}
                          disabled={subjectCriteria.some((item) => item.id !== criterion.id && item.subjectName === name)}
                        >
                          {name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {frequencyEnabled && (
                  <div>
                    <Label className="text-xs">{t('findLesson.frequency')}</Label>
                    <Select
                      value={String(criterion.frequency)}
                      onValueChange={(value) => setSubjectCriteria((current) => current.map((item) => (
                        item.id === criterion.id ? { ...item, frequency: Number(value) } : item
                      )))}
                    >
                      <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {[1, 2, 3, 4, 5].map((count) => (
                          <SelectItem key={count} value={String(count)}>{t('findLesson.lessonsPerWeek', { count })}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <button
                  type="button"
                  disabled={subjectCriteria.length === 1}
                  onClick={() => setSubjectCriteria((current) => current.filter((item) => item.id !== criterion.id))}
                  className="mb-1 inline-flex h-9 w-9 items-center justify-center rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-30"
                  aria-label={t('common.remove')}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
            {frequencyEnabled && subjectCriteria.length < Math.max(1, uniqueSubjectNames.length) && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 rounded-lg border-dashed border-indigo-300 text-xs text-indigo-700"
                onClick={() => setSubjectCriteria((current) => [
                  ...current,
                  { id: `subject-${Date.now()}-${Math.random().toString(36).slice(2)}`, subjectName: '', frequency: 1 },
                ])}
              >
                <Plus className="mr-1.5 h-3.5 w-3.5" /> {t('findLesson.addSubject')}
              </Button>
            )}
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">{t('findLesson.plannedStart')}</Label>
            <DateInput
              value={dateFrom}
              onChange={e => setDateFrom(e.target.value)}
              min={format(new Date(), 'yyyy-MM-dd')}
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
            />
          </div>

          <div className="space-y-3 rounded-xl border border-indigo-100 bg-indigo-50/40 p-3">
            <div>
              <Label className="text-xs">{t('findLesson.preferredDays')}</Label>
              <div className="mt-2 flex flex-wrap gap-2">
                {weekdays.map((weekday) => {
                  const active = preferredWindows.some((window) => window.dayOfWeek === weekday.dayOfWeek);
                  return (
                    <button
                      key={weekday.dayOfWeek}
                      type="button"
                      onClick={() => toggleWeekday(weekday.dayOfWeek)}
                      className={cn(
                        'min-w-12 rounded-full px-3 py-2 text-xs font-semibold transition-colors',
                        active ? 'bg-indigo-600 text-white' : 'bg-indigo-100 text-indigo-950 hover:bg-indigo-200',
                      )}
                    >
                      {weekday.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {weekdays.filter((weekday) => preferredWindows.some((window) => window.dayOfWeek === weekday.dayOfWeek)).map((weekday) => (
              <div key={weekday.dayOfWeek} className="rounded-xl border border-indigo-100 bg-white/80 p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-indigo-950">{weekday.label}</p>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs text-indigo-700"
                    onClick={() => setPreferredWindows((current) => [
                      ...current,
                      { id: windowId(weekday.dayOfWeek), dayOfWeek: weekday.dayOfWeek, startTime: '16:00', endTime: '20:00' },
                    ])}
                  >
                    <Plus className="w-3.5 h-3.5 mr-1" /> {t('findLesson.addTime')}
                  </Button>
                </div>
                {preferredWindows.filter((window) => window.dayOfWeek === weekday.dayOfWeek).map((window) => (
                  <div key={window.id} className="grid grid-cols-[1fr_auto_1fr_auto] items-end gap-2" onWheel={(e) => e.stopPropagation()}>
                    <div className="space-y-1 min-w-0">
                      <Label className="text-[11px] text-gray-500">{t('findLesson.timeFrom')}</Label>
                      <TimeInput
                        value={window.startTime}
                        onChange={(value) => updatePreferredWindow(window.id, { startTime: value })}
                        minuteStep={5}
                        className="w-full rounded-lg border border-gray-200 px-2 py-2 text-sm"
                      />
                    </div>
                    <span className="pb-2 text-gray-400">–</span>
                    <div className="space-y-1 min-w-0">
                      <Label className="text-[11px] text-gray-500">{t('findLesson.timeTo')}</Label>
                      <TimeInput
                        value={window.endTime}
                        onChange={(value) => updatePreferredWindow(window.id, { endTime: value })}
                        minuteStep={5}
                        className="w-full rounded-lg border border-gray-200 px-2 py-2 text-sm"
                      />
                    </div>
                    <button
                      type="button"
                      className="mb-1 inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-600"
                      onClick={() => setPreferredWindows((current) => current.filter((item) => item.id !== window.id))}
                      aria-label={t('common.remove')}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            ))}

            {preferredWindows.length === 0 && (
              <p className="text-xs text-amber-700">{t('findLesson.selectDayHint')}</p>
            )}
            <div className="rounded-lg bg-white/70 px-3 py-2 text-xs text-indigo-700">
              {t('findLesson.noEndDateHint')}
            </div>
          </div>

          <Button className="w-full rounded-xl bg-indigo-600 hover:bg-indigo-700" disabled={loading} onClick={handleSearch}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Search className="w-4 h-4 mr-2" />}
            {t('findLesson.search')}
          </Button>

          {searched && !loading && results.length === 0 && (
            <div className="text-center py-6">
              <CalendarDays className="w-8 h-8 text-gray-300 mx-auto mb-2" />
              <p className="text-sm text-gray-500">{t('findLesson.noResults')}</p>
            </div>
          )}

          {results.length > 0 && (onPickSlot || onPickTutor) && (
            <p className="text-xs text-indigo-700 bg-indigo-50 border border-indigo-100 rounded-lg px-2.5 py-1.5">
              {t('findLesson.tapToBook')}
            </p>
          )}

          {/* Frequency mode: results grouped + ranked by tutor */}
          {frequencyEnabled && results.length > 0 && (
            <div className="space-y-3 max-h-[320px] overflow-y-auto">
              {groups.map((group) => (
                <div key={group.tutorId} className="border border-gray-200 rounded-xl p-2.5">
                  <div className="flex items-center justify-between gap-2 px-1 pb-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate">{group.tutorName}</p>
                      {group.isPrimary && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-medium bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded">
                          <Star className="w-3 h-3" />
                          {t('findLesson.primaryTutor')}
                        </span>
                      )}
                    </div>
                    <span
                      className={cn(
                        'text-[10px] font-medium px-1.5 py-0.5 rounded whitespace-nowrap',
                        group.coversFrequency ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700',
                      )}
                    >
                      {group.coversFrequency
                        ? t('findLesson.coversFrequency', { count: group.weeklyCoverage })
                        : t('findLesson.partialCoverage', { count: group.weeklyCoverage })}
                    </span>
                  </div>
                  <div className="space-y-1.5">
                    {group.slots.map(renderSlotButton)}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Default mode: flat slot list */}
          {!frequencyEnabled && results.length > 0 && (
            <div className="space-y-2 max-h-[300px] overflow-y-auto">
              {results.map(renderSlotButton)}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
