import { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { DateInput } from '@/components/ui/date-input';
import { TimeInput } from '@/components/ui/time-input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/lib/supabase';
import { Loader2, Search, CalendarDays } from 'lucide-react';
import { useTranslation } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { format, addDays, startOfDay, endOfDay } from 'date-fns';

export interface TutorSlotPick {
  tutorId: string;
  subjectId: string;
  tutorName: string;
  subjectName: string;
  price: number;
  start: Date;
  end: Date;
}

interface FindTutorModalProps {
  isOpen: boolean;
  onClose: () => void;
  orgId: string | null;
  /** Paspaudus rezultatą – uždaryti paiešką ir atidaryti užsakymą (pvz. org tvarkaraštyje) */
  onPickSlot?: (slot: TutorSlotPick) => void;
}

type TutorSlot = TutorSlotPick;

export default function FindTutorModal({ isOpen, onClose, orgId, onPickSlot }: FindTutorModalProps) {
  const { t } = useTranslation();
  const [subjects, setSubjects] = useState<{ id: string; name: string; price: number; tutor_id: string }[]>([]);
  const [selectedSubjectName, setSelectedSubjectName] = useState('');
  const [dateFrom, setDateFrom] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [dateTo, setDateTo] = useState(format(addDays(new Date(), 7), 'yyyy-MM-dd'));
  const [timeFrom, setTimeFrom] = useState('08:00');
  const [timeTo, setTimeTo] = useState('20:00');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<TutorSlot[]>([]);
  const [searched, setSearched] = useState(false);
  const [tutors, setTutors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!isOpen || !orgId) return;
    (async () => {
      const { data: adminUsers } = await supabase.from('organization_admins').select('user_id').eq('organization_id', orgId);
      const adminIds = new Set((adminUsers || []).map((a: any) => a.user_id));
      const { data: profiles } = await supabase.from('profiles').select('id, full_name, email, has_active_license').eq('organization_id', orgId);
      const { data: linkedStudents } = await supabase
        .from('students')
        .select('linked_user_id, email')
        .eq('organization_id', orgId);
      const linkedStudentUserIds = new Set(
        (linkedStudents || [])
          .map((s: any) => s.linked_user_id)
          .filter((id: string | null | undefined): id is string => Boolean(id)),
      );
      const linkedStudentEmails = new Set(
        (linkedStudents || [])
          .map((s: any) => String(s.email || '').trim().toLowerCase())
          .filter((email: string) => email.length > 0),
      );
      const { data: orgRow } = await supabase
        .from('organizations')
        .select('tutor_license_count, tutor_limit')
        .eq('id', orgId)
        .single();
      const orgUsesLicenses =
        Math.max(Number(orgRow?.tutor_license_count) || 0, Number(orgRow?.tutor_limit) || 0) > 0;
      const tutorList = (profiles || []).filter(
        (p: any) =>
          !adminIds.has(p.id) &&
          !linkedStudentUserIds.has(p.id) &&
          !linkedStudentEmails.has(String(p.email || '').trim().toLowerCase()) &&
          (!orgUsesLicenses || p.has_active_license !== false),
      );
      const map: Record<string, string> = {};
      tutorList.forEach((t: any) => { map[t.id] = t.full_name; });
      setTutors(map);

      const tutorIds = tutorList.map((t: any) => t.id);
      if (tutorIds.length === 0) return;
      const { data: subjectsData } = await supabase.from('subjects').select('id, name, price, tutor_id').in('tutor_id', tutorIds).order('name');
      setSubjects(subjectsData || []);
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

    const from = startOfDay(new Date(dateFrom));
    const to = endOfDay(new Date(dateTo));

    const { data: availability } = await supabase
      .from('availability')
      .select('tutor_id, day_of_week, start_time, end_time')
      .in('tutor_id', tutorIds);

    const { data: sessions } = await supabase
      .from('sessions')
      .select('tutor_id, start_time, end_time')
      .in('tutor_id', tutorIds)
      .gte('start_time', from.toISOString())
      .lte('end_time', to.toISOString())
      .neq('status', 'cancelled');

    const sessionsByTutor: Record<string, { start: Date; end: Date }[]> = {};
    for (const s of sessions || []) {
      if (!sessionsByTutor[s.tutor_id]) sessionsByTutor[s.tutor_id] = [];
      sessionsByTutor[s.tutor_id].push({ start: new Date(s.start_time), end: new Date(s.end_time) });
    }

    const matchingSubjects = selectedSubjectName
      ? subjects.filter(s => s.name === selectedSubjectName)
      : subjects;
    const tutorSubjectMap: Record<string, { id: string; name: string; price: number }[]> = {};
    for (const s of matchingSubjects) {
      if (!tutorSubjectMap[s.tutor_id]) tutorSubjectMap[s.tutor_id] = [];
      tutorSubjectMap[s.tutor_id].push({ id: s.id, name: s.name, price: s.price });
    }

    const slots: TutorSlot[] = [];
    const [fromH, fromM] = timeFrom.split(':').map(Number);
    const [toH, toM] = timeTo.split(':').map(Number);
    const fromMinutes = fromH * 60 + fromM;
    const toMinutes = toH * 60 + toM;

    for (let d = new Date(from); d <= to; d = addDays(d, 1)) {
      const dayOfWeek = d.getDay();
      for (const avail of (availability || [])) {
        if (avail.day_of_week !== dayOfWeek) continue;
        const tutorSubs = tutorSubjectMap[avail.tutor_id];
        if (!tutorSubs || tutorSubs.length === 0) continue;

        const [aH, aM] = avail.start_time.split(':').map(Number);
        const [eH, eM] = avail.end_time.split(':').map(Number);
        const availStart = Math.max(aH * 60 + aM, fromMinutes);
        const availEnd = Math.min(eH * 60 + eM, toMinutes);
        if (availEnd <= availStart) continue;

        const slotStart = new Date(d);
        slotStart.setHours(Math.floor(availStart / 60), availStart % 60, 0, 0);
        const slotEnd = new Date(d);
        slotEnd.setHours(Math.floor(availEnd / 60), availEnd % 60, 0, 0);

        const tutorSessions = sessionsByTutor[avail.tutor_id] || [];
        const hasConflict = tutorSessions.some(s => s.start < slotEnd && s.end > slotStart);
        if (hasConflict) continue;

        for (const sub of tutorSubs) {
          slots.push({
            tutorId: avail.tutor_id,
            subjectId: sub.id,
            tutorName: tutors[avail.tutor_id] || '—',
            subjectName: sub.name,
            price: sub.price,
            start: slotStart,
            end: slotEnd,
          });
        }
      }
    }

    slots.sort((a, b) => a.start.getTime() - b.start.getTime());
    setResults(slots);
    setLoading(false);
  };

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

          {results.length > 0 && (
            <div className="space-y-2 max-h-[300px] overflow-y-auto">
              {onPickSlot && (
                <p className="text-xs text-indigo-700 bg-indigo-50 border border-indigo-100 rounded-lg px-2.5 py-1.5">
                  {t('findLesson.tapToBook')}
                </p>
              )}
              {results.map((slot) => (
                <button
                  key={`${slot.tutorId}-${slot.subjectId}-${slot.start.getTime()}`}
                  type="button"
                  disabled={!onPickSlot}
                  onClick={() => {
                    if (!onPickSlot) return;
                    onPickSlot(slot);
                    onClose();
                  }}
                  className={cn(
                    'w-full flex items-center justify-between p-3 border border-gray-200 rounded-xl text-left transition-colors',
                    onPickSlot
                      ? 'hover:border-indigo-400 hover:bg-indigo-50/50 cursor-pointer'
                      : 'opacity-90 cursor-default',
                  )}
                >
                  <div>
                    <p className="text-sm font-medium text-gray-900">{slot.tutorName}</p>
                    <p className="text-xs text-gray-500">
                      {slot.subjectName} &middot; {format(slot.start, 'MMM d, HH:mm')}–{format(slot.end, 'HH:mm')} &middot; €{slot.price}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
