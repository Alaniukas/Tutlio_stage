import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { authHeaders } from '@/lib/apiHelpers';
import {
  buildExtraLessonsOrderSnapshot,
  formatScheduleLabel,
  indicativeMonthlyPrice,
  type ExtraLessonsScheduleSlot,
} from '@/lib/extraLessonsContract';
import { countExtraLessonsInFirstMonth } from '@/lib/extraLessonsMonthlyCount';
import {
  laisviVaikaiExtraUnitPriceEur,
  LAISVI_VAIKIAI_EXTRA_DEFAULT_END_DATE,
  LAISVI_VAIKIAI_EXTRA_DURATION_MINUTES,
  LAISVI_VAIKIAI_EXTRA_PLATFORM,
  usesLaisviStyleExtraLessonsPrefill,
} from '@/lib/laisviVaikaiExtraLessonsDefaults';
import { formatStudentPickerLabel } from '@/lib/orgStudentIdentity';
import { DateRangeFields, ScheduleSlotPicker } from '@/components/company/ScheduleSlotPicker';

type Student = { id: string; full_name: string; payer_email?: string | null; grade?: string | null };
export type ExtraLessonsOfferGroup = {
  id: string;
  name: string;
  tutor_name?: string | null;
  platform?: string | null;
  duration_minutes?: number | null;
  meeting_link?: string | null;
  school_year_end?: string | null;
  slots?: { weekday: number; start_time: string; end_time: string }[];
  members?: { student_id: string; schedule_slots?: { weekday: number; start_time: string; end_time: string }[] | null }[];
};
type Group = ExtraLessonsOfferGroup;

function laisviOpenDefaults(organizationId: string | null | undefined) {
  if (!usesLaisviStyleExtraLessonsPrefill(organizationId)) {
    return { platform: '', duration: '', unitPrice: '' };
  }
  return {
    platform: LAISVI_VAIKIAI_EXTRA_PLATFORM,
    duration: String(LAISVI_VAIKIAI_EXTRA_DURATION_MINUTES),
    unitPrice: laisviVaikaiExtraUnitPriceEur('group').toFixed(2),
  };
}

function durationFromGroup(group: Group | undefined, slots: ExtraLessonsScheduleSlot[]): string {
  if (group?.duration_minutes && group.duration_minutes > 0) {
    return String(group.duration_minutes);
  }
  const first = slots[0];
  if (first?.start_time && first?.end_time) {
    const [sh, sm] = first.start_time.split(':').map(Number);
    const [eh, em] = first.end_time.split(':').map(Number);
    const mins = (eh * 60 + em) - (sh * 60 + sm);
    if (mins > 0) return String(mins);
  }
  return '';
}

function applyGroupDefaults(
  organizationId: string | null | undefined,
  group: Group,
  serviceType: '' | 'group' | 'individual',
  startDate: string,
  endDate: string,
) {
  const styled = usesLaisviStyleExtraLessonsPrefill(organizationId);
  const slots: ExtraLessonsScheduleSlot[] = (group.slots || []).map((s) => ({
    weekday: Number(s.weekday),
    start_time: String(s.start_time).slice(0, 5),
    end_time: String(s.end_time || '').slice(0, 5) || null,
  }));
  const type = serviceType || 'group';
  const duration = durationFromGroup(group, slots)
    || (styled ? String(LAISVI_VAIKIAI_EXTRA_DURATION_MINUTES) : '');
  const platform = group.platform?.trim()
    || (styled ? LAISVI_VAIKIAI_EXTRA_PLATFORM : '');
  const unit = styled ? laisviVaikaiExtraUnitPriceEur(type) : 0;
  const base = styled && slots.length
    ? countExtraLessonsInFirstMonth({
      scheduleSlots: slots,
      startDate,
      endDate,
      schoolYearEnd: group.school_year_end || undefined,
    })
    : 0;
  return {
    platform,
    duration,
    slots,
    unitPrice: unit > 0 ? unit.toFixed(2) : '',
    baseLessons: base > 0 ? String(base) : '',
  };
}

export type ExtraLessonsTaughtSubject = {
  id: string;
  name: string;
  duration_minutes?: number | null;
  price?: number | null;
  tutor_name?: string | null;
};

export default function ExtraLessonsOfferDialog(props: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  organizationId?: string | null;
  students: Student[];
  groups: Group[];
  individualSubjects?: ExtraLessonsTaughtSubject[];
  onCreated: (info: {
    acceptUrl: string;
    contractNumber: string;
    emailSent?: boolean;
    emailTo?: string | null;
  }) => void;
}) {
  const styledPrefill = usesLaisviStyleExtraLessonsPrefill(props.organizationId);
  const openDefaults = laisviOpenDefaults(props.organizationId);
  const [studentId, setStudentId] = useState('');
  const [serviceName, setServiceName] = useState('');
  const [serviceType, setServiceType] = useState<'' | 'group' | 'individual'>('');
  const [platform, setPlatform] = useState(openDefaults.platform);
  const [duration, setDuration] = useState(openDefaults.duration);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [unitPrice, setUnitPrice] = useState(openDefaults.unitPrice);
  const [baseLessons, setBaseLessons] = useState('');
  const [slots, setSlots] = useState<ExtraLessonsScheduleSlot[]>([]);
  const [groupId, setGroupId] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [studentSearch, setStudentSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const baseLessonsManual = useRef(false);
  const unitPriceManual = useRef(false);

  useEffect(() => {
    if (!props.open) return;
    const lv = laisviOpenDefaults(props.organizationId);
    setStudentId('');
    setStudentSearch('');
    setServiceName('');
    setServiceType('');
    setPlatform(lv.platform);
    setDuration(lv.duration);
    setStartDate('');
    setEndDate(styledPrefill ? LAISVI_VAIKIAI_EXTRA_DEFAULT_END_DATE : '');
    setUnitPrice(lv.unitPrice);
    setBaseLessons('');
    setSlots([]);
    setGroupId('');
    setSubjectId('');
    setError(null);
    baseLessonsManual.current = false;
    unitPriceManual.current = false;
  }, [props.open, props.organizationId, styledPrefill]);

  const sortedStudents = useMemo(
    () => [...props.students].sort((a, b) => (a.full_name || '').localeCompare(b.full_name || '', 'lt')),
    [props.students],
  );

  const filteredStudents = useMemo(() => {
    const q = studentSearch.trim().toLowerCase();
    if (!q) return sortedStudents;
    return sortedStudents.filter((s) => {
      const label = formatStudentPickerLabel(s.full_name, s.grade).toLowerCase();
      return label.includes(q) || (s.full_name || '').toLowerCase().includes(q);
    });
  }, [sortedStudents, studentSearch]);

  const [loadedSubjects, setLoadedSubjects] = useState<ExtraLessonsTaughtSubject[]>([]);
  const [subjectsLoading, setSubjectsLoading] = useState(false);
  const [subjectsError, setSubjectsError] = useState<string | null>(null);
  useEffect(() => {
    if (!props.open || props.individualSubjects !== undefined) return;
    let cancelled = false;
    setLoadedSubjects([]);
    setSubjectsLoading(true);
    setSubjectsError(null);
    void (async () => {
      try {
        const response = await fetch('/api/school-individual-subjects', { headers: await authHeaders() });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Nepavyko įkelti dalykų.');
        if (!cancelled) setLoadedSubjects(data.subjects || []);
      } catch (err) {
        if (!cancelled) setSubjectsError(err instanceof Error ? err.message : 'Nepavyko įkelti dalykų.');
      } finally {
        if (!cancelled) setSubjectsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [props.open, props.organizationId, props.individualSubjects]);
  const subjects = props.individualSubjects ?? loadedSubjects;
  const selectedGroup = props.groups.find((g) => g.id === groupId);

  const recalcBaseLessons = (nextSlots: ExtraLessonsScheduleSlot[], start: string, end: string, group?: Group) => {
    if (!styledPrefill || baseLessonsManual.current || !nextSlots.length) return;
    const count = countExtraLessonsInFirstMonth({
      scheduleSlots: nextSlots,
      startDate: start,
      endDate: end,
      schoolYearEnd: group?.school_year_end || undefined,
    });
    if (count > 0) setBaseLessons(String(count));
  };

  const applyGroupSelection = (id: string, selectedStudentId = studentId) => {
    setGroupId(id);
    setSubjectId('');
    const g = props.groups.find((x) => x.id === id);
    if (!g) return;
    setServiceType('group');
    setServiceName((prev) => prev || g.name);
    const memberSlots = g.members?.find(member => member.student_id === selectedStudentId)?.schedule_slots;
    const defaults = applyGroupDefaults(props.organizationId, { ...g, slots: memberSlots ?? g.slots }, 'group', startDate, endDate);
    setSlots(defaults.slots);
    if (defaults.platform) setPlatform(defaults.platform);
    if (defaults.duration) setDuration(defaults.duration);
    if (!unitPriceManual.current && defaults.unitPrice) setUnitPrice(defaults.unitPrice);
    if (!baseLessonsManual.current && defaults.baseLessons) setBaseLessons(defaults.baseLessons);
    recalcBaseLessons(defaults.slots, startDate, endDate, g);
  };

  const applySubjectSelection = (id: string) => {
    setSubjectId(id);
    setGroupId('');
    const subject = subjects.find((x) => x.id === id);
    if (!subject) return;
    setServiceType('individual');
    setServiceName(subject.name);
    if (subject.duration_minutes && Number(subject.duration_minutes) > 0) {
      setDuration(String(subject.duration_minutes));
    } else if (styledPrefill && !duration) {
      setDuration(String(LAISVI_VAIKIAI_EXTRA_DURATION_MINUTES));
    }
    if (styledPrefill && !unitPriceManual.current) {
      setUnitPrice(laisviVaikaiExtraUnitPriceEur('individual').toFixed(2));
    } else if (!unitPriceManual.current && subject.price && Number(subject.price) > 0) {
      setUnitPrice(String(subject.price));
    }
    if (styledPrefill && !platform) {
      setPlatform(LAISVI_VAIKIAI_EXTRA_PLATFORM);
    }
  };

  const onServiceTypeChange = (next: '' | 'group' | 'individual') => {
    setServiceType(next);
    if (styledPrefill && !unitPriceManual.current) {
      setUnitPrice(laisviVaikaiExtraUnitPriceEur(next).toFixed(2));
    }
    if (next === 'individual') {
      setGroupId('');
    }
    if (next === 'group') {
      setSubjectId('');
    }
    if (styledPrefill && next === 'group' && !platform) {
      setPlatform(LAISVI_VAIKIAI_EXTRA_PLATFORM);
    }
    if (styledPrefill && next && !duration) {
      setDuration(String(LAISVI_VAIKIAI_EXTRA_DURATION_MINUTES));
    }
    if (next === 'group' && groupId) {
      const g = props.groups.find((x) => x.id === groupId);
      if (g) applyGroupSelection(groupId);
    }
  };

  useEffect(() => {
    if (!styledPrefill || !props.open) return;
    recalcBaseLessons(slots, startDate, endDate, selectedGroup);
  }, [startDate, endDate, slots, styledPrefill, props.open, selectedGroup]);

  const previewMonthly = indicativeMonthlyPrice(Number(baseLessons) || 0, Number(unitPrice) || 0);
  const scheduleLabel = useMemo(() => formatScheduleLabel(slots), [slots]);

  const submit = async () => {
    setBusy(true);
    setError(null);
    const group = props.groups.find((g) => g.id === groupId);
    const subject = subjects.find((s) => s.id === subjectId);
    const order = buildExtraLessonsOrderSnapshot({
      service_name: serviceName || subject?.name || group?.name || '',
      service_type: serviceType,
      platform,
      duration_minutes: Number(duration) || Number(subject?.duration_minutes) || 0,
      schedule_slots: slots,
      schedule_label: scheduleLabel,
      start_date: startDate,
      end_date: endDate,
      unit_price_eur: Number(unitPrice) || 0,
      base_lessons_per_month: Number(baseLessons) || 0,
      group_id: serviceType === 'individual' ? null : (groupId || null),
      group_name: serviceType === 'individual' ? null : (group?.name || null),
      tutor_name: subject?.tutor_name || group?.tutor_name || null,
      subject_id: serviceType === 'group' ? null : (subjectId || null),
      subject_name: serviceType === 'group' ? null : (subject?.name || null),
    });
    try {
      const headers = await authHeaders();
      const res = await fetch('/api/extra-lessons-contract-offer', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          student_id: studentId,
          ...order,
          send: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Nepavyko sukurti pasiūlymo.');
        setBusy(false);
        return;
      }
      props.onCreated({
        acceptUrl: data.acceptUrl,
        contractNumber: data.contractNumber,
        emailSent: data.emailSent === true,
        emailTo: data.emailTo || null,
      });
      props.onOpenChange(false);
    } catch {
      setError('Nepavyko sukurti pasiūlymo.');
    }
    setBusy(false);
  };

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Papildomų užsiėmimų sutartis</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-gray-500">
          Privaloma: mokinys ir užsiėmimo kaina. Grupinei sutarčiai rinkitės klasės grupę, individualiai — dėstomą dalyką.
          Grafiką, datas ir kiekius galite palikti tuščius — tėvai juos užpildys priimdami sutartį.
        </p>
        <div className="space-y-3">
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div>
            <Label>Mokinys *</Label>
            <Select value={studentId} onValueChange={id => { setStudentId(id); if (groupId) applyGroupSelection(groupId, id); }}>
              <SelectTrigger className="w-full rounded-md h-9">
                <SelectValue placeholder="Pasirinkite…" />
              </SelectTrigger>
              <SelectContent className="max-h-72 overflow-y-auto">
                <div className="sticky top-0 z-10 bg-white p-2 border-b border-gray-100">
                  <Input
                    value={studentSearch}
                    onChange={(e) => setStudentSearch(e.target.value)}
                    placeholder="Ieškoti mokinio…"
                    className="h-9 rounded-xl"
                    onKeyDown={(e) => e.stopPropagation()}
                  />
                </div>
                {filteredStudents.length === 0 ? (
                  <p className="px-3 py-4 text-sm text-gray-500 text-center">Nerasta</p>
                ) : (
                  filteredStudents.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {formatStudentPickerLabel(s.full_name, s.grade)}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Paslaugos pavadinimas</Label>
            <Input
              value={serviceName}
              onChange={(e) => setServiceName(e.target.value)}
              placeholder={serviceType === 'individual' ? 'užpildoma iš dalyko' : 'nebūtina, jei pasirinkta grupė'}
            />
          </div>
          <div>
            <Label>Tipas</Label>
            <select className="w-full border rounded-md h-9 px-2 text-sm" value={serviceType} onChange={(e) => onServiceTypeChange(e.target.value as '' | 'group' | 'individual')}>
              <option value="">Tėvai pasirinks</option>
              <option value="group">Grupinė</option>
              <option value="individual">Individuali</option>
            </select>
          </div>
          {serviceType !== 'individual' && (
            <div>
              <Label>Grupė</Label>
              <select className="w-full border rounded-md h-9 px-2 text-sm" value={groupId} onChange={(e) => applyGroupSelection(e.target.value)}>
                <option value="">—</option>
                {props.groups.map((g) => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
            </div>
          )}
          {serviceType === 'individual' && (
            <div>
              <Label>Dėstomas dalykas</Label>
              <select className="w-full border rounded-md h-9 px-2 text-sm" value={subjectId} onChange={(e) => applySubjectSelection(e.target.value)}>
                <option value="">Pasirinkite dalyką…</option>
                {subjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.tutor_name ? `${s.name} — ${s.tutor_name}` : s.name}
                  </option>
                ))}
              </select>
              {subjectsLoading && <p className="text-xs text-gray-500 mt-1">Įkeliami dalykai…</p>}
              {subjectsError && <p role="alert" className="text-xs text-red-600 mt-1">{subjectsError}</p>}
              {!subjectsLoading && !subjectsError && subjects.length === 0 && (
                <p className="text-xs text-amber-700 mt-1">
                  Nėra individualių dėstomų dalykų. Pridėkite juos nustatymuose (dalykų valdymas).
                </p>
              )}
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Platforma</Label>
              <Input value={platform} onChange={(e) => setPlatform(e.target.value)} placeholder="pvz. Google Meet" />
            </div>
            <div>
              <Label>Trukmė (min)</Label>
              <Input value={duration} onChange={(e) => setDuration(e.target.value)} placeholder="45" />
            </div>
          </div>
          <div>
            <Label>Grafikas (pasirinkite dienas)</Label>
            <ScheduleSlotPicker
              slots={slots}
              onChange={(next) => {
                setSlots(next);
                recalcBaseLessons(next, startDate, endDate, selectedGroup);
              }}
              durationMinutes={Number(duration) || 45}
            />
          </div>
          <DateRangeFields startDate={startDate} endDate={endDate} onStart={setStartDate} onEnd={setEndDate} />
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Užsiėmimo kaina (€) *</Label>
              <Input
                value={unitPrice}
                onChange={(e) => {
                  unitPriceManual.current = true;
                  setUnitPrice(e.target.value);
                }}
                placeholder={styledPrefill ? '6.00 / 20.00' : '12.00'}
              />
            </div>
            <div>
              <Label>Bazinis kiekis / mėn.</Label>
              <Input
                value={baseLessons}
                onChange={(e) => {
                  baseLessonsManual.current = true;
                  setBaseLessons(e.target.value);
                }}
                placeholder="8"
              />
            </div>
          </div>
          <p className="text-sm text-gray-600">Orientacinė mėnesio kaina: <strong>{previewMonthly.toFixed(2)} €</strong></p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => props.onOpenChange(false)}>Atšaukti</Button>
          <Button className="bg-emerald-600 hover:bg-emerald-700" disabled={busy || !studentId || !(Number(unitPrice) > 0)} onClick={submit}>
            {busy ? 'Siunčiama…' : 'Siųsti tėvams'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
