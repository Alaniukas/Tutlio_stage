import { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { DateInput } from '@/components/ui/date-input';
import { TimeInput } from '@/components/ui/time-input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/lib/supabase';
import { Loader2, Search, CalendarDays, Star } from 'lucide-react';
import { useTranslation } from '@/lib/i18n';
import { fmtMoney } from '@/lib/marketMoney';
import { cn } from '@/lib/utils';
import { format, addDays } from 'date-fns';
import {
  computeTutorSlots,
  groupAndRankTutors,
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
  /** When opened from a student context, this tutor is ranked first. */
  primaryTutorId?: string | null;
  /** Enables the lessons-per-week frequency search + ranked grouping (org feature flag). */
  frequencyEnabled?: boolean;
}

export default function FindTutorModal({ isOpen, onClose, orgId, onPickSlot, primaryTutorId, frequencyEnabled }: FindTutorModalProps) {
  const { t } = useTranslation();
  const [subjects, setSubjects] = useState<MatchSubject[]>([]);
  const [selectedSubjectName, setSelectedSubjectName] = useState('');
  const [dateFrom, setDateFrom] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [dateTo, setDateTo] = useState(format(addDays(new Date(), 7), 'yyyy-MM-dd'));
  const [timeFrom, setTimeFrom] = useState('08:00');
  const [timeTo, setTimeTo] = useState('20:00');
  const [frequency, setFrequency] = useState(1);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<MatchSlot[]>([]);
  const [searched, setSearched] = useState(false);
  const [tutors, setTutors] = useState<Record<string, string>>({});

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

  const handleSearch = async () => {
    setLoading(true);
    setSearched(true);
    const tutorIds = Object.keys(tutors);
    if (tutorIds.length === 0) { setResults([]); setLoading(false); return; }

    const from = new Date(dateFrom);
    from.setHours(0, 0, 0, 0);
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
      .gte('start_time', from.toISOString())
      .lte('end_time', to.toISOString())
      .neq('status', 'cancelled');

    const busy: BusyInterval[] = (sessions || []).map((s: any) => ({
      tutor_id: s.tutor_id,
      start: new Date(s.start_time),
      end: new Date(s.end_time),
    }));

    const slots = computeTutorSlots(
      (availability as AvailabilityRule[]) || [],
      busy,
      subjects,
      tutors,
      { dateFrom, dateTo, timeFrom, timeTo, subjectName: selectedSubjectName },
    );

    setResults(slots);
    setLoading(false);
  };

  const groups = useMemo(
    () => groupAndRankTutors(results, { frequencyPerWeek: frequency, primaryTutorId }),
    [results, frequency, primaryTutorId],
  );

  const renderSlotButton = (slot: MatchSlot) => (
    <button
      key={`${slot.tutorId}-${slot.subjectId}-${slot.start.getTime()}`}
      type="button"
      disabled={!onPickSlot}
      onClick={() => {
        if (!onPickSlot) return;
        onPickSlot(slot);
      }}
      className={cn(
        'w-full flex items-center justify-between p-3 border border-gray-200 rounded-xl text-left transition-colors',
        onPickSlot
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
          <div className={cn('grid gap-3', frequencyEnabled ? 'grid-cols-2' : 'grid-cols-1')}>
            <div>
              <Label className="text-xs">{t('findLesson.subject')}</Label>
              <Select value={selectedSubjectName || '__all__'} onValueChange={v => setSelectedSubjectName(v === '__all__' ? '' : v)}>
                <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">{t('findLesson.allSubjects')}</SelectItem>
                  {uniqueSubjectNames.map(n => <SelectItem key={n} value={n}>{n}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {frequencyEnabled && (
              <div>
                <Label className="text-xs">{t('findLesson.frequency')}</Label>
                <Select value={String(frequency)} onValueChange={v => setFrequency(Number(v))}>
                  <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[1, 2, 3, 4, 5].map(n => (
                      <SelectItem key={n} value={String(n)}>{t('findLesson.lessonsPerWeek', { count: n })}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">{t('findLesson.dateFrom')}</Label>
              <DateInput
                value={dateFrom}
                onChange={e => setDateFrom(e.target.value)}
                max={dateTo}
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{t('findLesson.dateTo')}</Label>
              <DateInput
                value={dateTo}
                onChange={e => setDateTo(e.target.value)}
                min={dateFrom}
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
              />
            </div>
          </div>

          <div
            className="grid grid-cols-2 gap-3 rounded-xl border border-indigo-100 bg-indigo-50/40 p-3"
            onWheel={(e) => e.stopPropagation()}
          >
            <div className="space-y-1.5 min-w-0">
              <Label className="text-xs">{t('findLesson.timeFrom')}</Label>
              <TimeInput
                value={timeFrom}
                onChange={setTimeFrom}
                minuteStep={1}
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
              />
            </div>
            <div className="space-y-1.5 min-w-0">
              <Label className="text-xs">{t('findLesson.timeTo')}</Label>
              <TimeInput
                value={timeTo}
                onChange={setTimeTo}
                minuteStep={1}
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
              />
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

          {results.length > 0 && onPickSlot && (
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
