import { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/lib/supabase';
import { Loader2, Search, CalendarDays } from 'lucide-react';
import { useTranslation } from '@/lib/i18n';
import { format, addDays, startOfDay, endOfDay } from 'date-fns';

interface FindTutorModalProps {
  isOpen: boolean;
  onClose: () => void;
  orgId: string | null;
}

interface TutorSlot {
  tutorId: string;
  tutorName: string;
  subjectName: string;
  price: number;
  start: Date;
  end: Date;
}

export default function FindTutorModal({ isOpen, onClose, orgId }: FindTutorModalProps) {
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
      const { data: profiles } = await supabase.from('profiles').select('id, full_name, has_active_license').eq('organization_id', orgId);
      const { data: orgRow } = await supabase.from('organizations').select('tutor_license_count').eq('id', orgId).single();
      const orgUsesLicenses = (Number(orgRow?.tutor_license_count) || 0) > 0;
      const tutorList = (profiles || []).filter((p: any) => !adminIds.has(p.id) && (!orgUsesLicenses || p.has_active_license !== false));
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
    const tutorSubjectMap: Record<string, { name: string; price: number }[]> = {};
    for (const s of matchingSubjects) {
      if (!tutorSubjectMap[s.tutor_id]) tutorSubjectMap[s.tutor_id] = [];
      tutorSubjectMap[s.tutor_id].push({ name: s.name, price: s.price });
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
            <div>
              <Label className="text-xs">{t('findLesson.dateFrom')}</Label>
              <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="w-full rounded-xl border border-gray-200 px-3 py-1.5 text-sm" />
            </div>
            <div>
              <Label className="text-xs">{t('findLesson.dateTo')}</Label>
              <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="w-full rounded-xl border border-gray-200 px-3 py-1.5 text-sm" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">{t('findLesson.timeFrom')}</Label>
              <input type="time" value={timeFrom} onChange={e => setTimeFrom(e.target.value)} className="w-full rounded-xl border border-gray-200 px-3 py-1.5 text-sm" />
            </div>
            <div>
              <Label className="text-xs">{t('findLesson.timeTo')}</Label>
              <input type="time" value={timeTo} onChange={e => setTimeTo(e.target.value)} className="w-full rounded-xl border border-gray-200 px-3 py-1.5 text-sm" />
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
              {results.map((slot, i) => (
                <div key={i} className="flex items-center justify-between p-3 border border-gray-200 rounded-xl hover:border-indigo-200 transition-colors">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{slot.tutorName}</p>
                    <p className="text-xs text-gray-500">
                      {slot.subjectName} &middot; {format(slot.start, 'MMM d, HH:mm')}–{format(slot.end, 'HH:mm')} &middot; €{slot.price}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
