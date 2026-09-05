import { useEffect, useMemo, useState } from 'react';
import { Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DateInput } from '@/components/ui/date-input';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScheduleSlotPicker } from '@/components/company/ScheduleSlotPicker';
import { authHeaders } from '@/lib/apiHelpers';
import { useStaffLabels } from '@/hooks/useStaffLabels';
import { useTranslation } from '@/lib/i18n';
import {
  addMinutesToTime,
  defaultSchoolYearRange,
  groupToWriteDraft,
  normalizeGroupSlots,
  studentsForGroupPicker,
  toggleMemberIds,
  validateSchoolClassGroup,
  withSlotEnds,
  type SchoolClassGroupRecord,
  type SchoolClassGroupSlot,
} from '@/lib/schoolClassGroups';

export type ClassGroupStudentOption = {
  id: string;
  full_name: string;
  grade?: string | null;
  enrollment_status?: string | null;
};

export type ClassGroupTutorOption = {
  id: string;
  full_name: string;
};

const WEEKDAY_KEYS: { v: number; key: 'cal.monday' | 'cal.tuesday' | 'cal.wednesday' | 'cal.thursday' | 'cal.friday' | 'cal.saturday' | 'cal.sunday' }[] = [
  { v: 1, key: 'cal.monday' },
  { v: 2, key: 'cal.tuesday' },
  { v: 3, key: 'cal.wednesday' },
  { v: 4, key: 'cal.thursday' },
  { v: 5, key: 'cal.friday' },
  { v: 6, key: 'cal.saturday' },
  { v: 0, key: 'cal.sunday' },
];

function emptyDraft(tutorId: string) {
  const year = defaultSchoolYearRange();
  const start = '16:00';
  const duration = 45;
  return {
    name: '',
    tutor_id: tutorId,
    school_year_start: year.start,
    school_year_end: year.end,
    platform: 'Google Meet',
    duration_minutes: duration,
    meeting_link: '',
    slots: [{ weekday: 1, start_time: start, end_time: addMinutesToTime(start, duration) }] as SchoolClassGroupSlot[],
    student_ids: [] as string[],
  };
}

export default function ClassGroupFormDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: 'create' | 'edit';
  group: SchoolClassGroupRecord | null;
  students: ClassGroupStudentOption[];
  tutors: ClassGroupTutorOption[];
  canEditMembers: boolean;
  /** Org admins may delete a group (its future lessons go with it). */
  canDelete?: boolean;
  defaultTutorId: string;
  onSaved: () => void;
  /** Resolves true when the group is gone; the dialog closes itself. */
  onDelete?: (group: SchoolClassGroupRecord) => Promise<boolean>;
}) {
  const { t } = useTranslation();
  const { staff } = useStaffLabels();
  const [deleting, setDeleting] = useState(false);

  const remove = async () => {
    if (!props.group || !props.onDelete) return;
    if (!window.confirm(t('school.groups.deleteConfirm', { name: props.group.name }))) return;
    setDeleting(true);
    setError(null);
    try {
      const ok = await props.onDelete(props.group);
      if (!ok) {
        setError(t('school.groups.deleteFailed'));
        setDeleting(false);
        return;
      }
      props.onOpenChange(false);
    } catch {
      setError(t('school.groups.deleteFailed'));
    }
    setDeleting(false);
  };
  const [name, setName] = useState('');
  const [tutorId, setTutorId] = useState('');
  const [yearStart, setYearStart] = useState('');
  const [yearEnd, setYearEnd] = useState('');
  const [platform, setPlatform] = useState('Google Meet');
  const [duration, setDuration] = useState(45);
  const [meetingLink, setMeetingLink] = useState('');
  const [slots, setSlots] = useState<SchoolClassGroupSlot[]>(
    emptyDraft('').slots,
  );
  const [studentIds, setStudentIds] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!props.open) return;
    setError(null);
    setQuery('');
    if (props.mode === 'edit' && props.group) {
      const draft = groupToWriteDraft(props.group);
      setName(draft.name);
      setTutorId(draft.tutor_id);
      setYearStart(draft.school_year_start);
      setYearEnd(draft.school_year_end);
      setPlatform(draft.platform || 'Google Meet');
      setDuration(draft.duration_minutes || 45);
      setMeetingLink(draft.meeting_link || '');
      setSlots(draft.slots.length ? draft.slots : emptyDraft(draft.tutor_id).slots);
      setStudentIds(draft.student_ids || []);
      return;
    }
    const blank = emptyDraft(props.defaultTutorId);
    setName(blank.name);
    setTutorId(blank.tutor_id);
    setYearStart(blank.school_year_start);
    setYearEnd(blank.school_year_end);
    setPlatform(blank.platform);
    setDuration(blank.duration_minutes);
    setMeetingLink(blank.meeting_link);
    setSlots(blank.slots);
    setStudentIds([]);
  }, [props.open, props.mode, props.group, props.defaultTutorId]);

  const normalizedSlots = useMemo(
    () => normalizeGroupSlots(slots, duration),
    [slots, duration],
  );
  const weekdayOptions = useMemo(
    () => WEEKDAY_KEYS.map((day) => ({ v: day.v, label: t(day.key) })),
    [t],
  );

  const pickerStudents = useMemo(() => {
    const visible = studentsForGroupPicker(props.students, studentIds);
    const q = query.trim().toLowerCase();
    if (!q) return visible;
    return visible.filter((student) => {
      const hay = `${student.full_name} ${student.grade || ''}`.toLowerCase();
      return hay.includes(q);
    });
  }, [props.students, studentIds, query]);

  const selectedStudents = useMemo(
    () => studentIds.map((id) => {
      const fromList = props.students.find((student) => student.id === id);
      if (fromList) return { id, full_name: fromList.full_name };
      const fromGroup = props.group?.members?.find((m) => m.student_id === id)?.student?.full_name;
      return { id, full_name: fromGroup || id };
    }),
    [studentIds, props.students, props.group],
  );

  const tutorOptions = useMemo(() => {
    if (tutorId && !props.tutors.some((tutor) => tutor.id === tutorId)) {
      return [{ id: tutorId, full_name: staff }, ...props.tutors];
    }
    return props.tutors;
  }, [props.tutors, tutorId, staff]);

  const save = async () => {
    const draft = {
      name,
      tutor_id: tutorId,
      school_year_start: yearStart,
      school_year_end: yearEnd,
      platform,
      duration_minutes: duration,
      meeting_link: meetingLink,
      slots: normalizedSlots,
    };
    const fields = validateSchoolClassGroup(draft);
    if (fields.length) {
      setError(t('school.groups.invalid'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const headers = await authHeaders();
      const payload: Record<string, unknown> = {
        ...draft,
        slots: normalizedSlots,
        student_ids: props.canEditMembers ? studentIds : undefined,
      };
      if (props.mode === 'edit' && props.group) payload.id = props.group.id;
      const res = await fetch('/api/school-class-groups', {
        method: props.mode === 'edit' ? 'PATCH' : 'POST',
        headers,
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data.error === 'string' ? data.error : t('school.groups.saveError'));
        setBusy(false);
        return;
      }
      props.onSaved();
      props.onOpenChange(false);
    } catch {
      setError(t('school.groups.saveError'));
    }
    setBusy(false);
  };

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="!w-[min(56rem,calc(100vw-2rem))] !max-w-[min(56rem,calc(100vw-2rem))] max-h-[90vh] overflow-y-auto overflow-x-hidden sm:p-6">
        <DialogHeader>
          <DialogTitle>
            {props.mode === 'edit' ? t('school.groups.editTitle') : t('school.groups.new')}
          </DialogTitle>
        </DialogHeader>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="grid grid-cols-1 min-[42rem]:grid-cols-[minmax(0,1.45fr)_minmax(18rem,1fr)] gap-5 min-[42rem]:gap-6 items-stretch">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 min-w-0 content-start">
            <div className="sm:col-span-2">
              <Label>{t('school.groups.name')}</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="pvz. Matematika 5 kl."
                className="rounded-xl"
              />
            </div>
            <div>
              <Label>{staff}</Label>
              <select
                className="w-full border rounded-xl h-9 px-2 text-sm bg-white"
                value={tutorId}
                onChange={(e) => setTutorId(e.target.value)}
              >
                <option value="">{t('school.groups.pickTeacher')}</option>
                {tutorOptions.map((tutor) => (
                  <option key={tutor.id} value={tutor.id}>{tutor.full_name}</option>
                ))}
              </select>
            </div>
            <div>
              <Label>{t('school.groups.platform')}</Label>
              <Input value={platform} onChange={(e) => setPlatform(e.target.value)} className="rounded-xl" />
            </div>
            <div>
              <Label>{t('school.groups.yearStart')}</Label>
              <DateInput value={yearStart} onChange={(e) => setYearStart(e.target.value)} className="rounded-xl" />
            </div>
            <div>
              <Label>{t('school.groups.yearEnd')}</Label>
              <DateInput value={yearEnd} onChange={(e) => setYearEnd(e.target.value)} className="rounded-xl" />
            </div>
            <div>
              <Label>{t('school.groups.duration')}</Label>
              <Input
                type="number"
                min={15}
                step={5}
                value={duration}
                onChange={(e) => setDuration(Math.max(15, Number(e.target.value) || 45))}
                className="rounded-xl"
              />
            </div>
            <div className="sm:col-span-2">
              <Label>{t('school.groups.meetingLink')}</Label>
              <Input
                value={meetingLink}
                onChange={(e) => setMeetingLink(e.target.value)}
                placeholder="https://meet.google.com/…"
                className="rounded-xl"
              />
            </div>
            <div className="sm:col-span-2">
              <Label>{t('school.groups.slots')}</Label>
              <div className="mt-1">
                <ScheduleSlotPicker
                  slots={slots}
                  onChange={(next) => setSlots(withSlotEnds(next, duration))}
                  durationMinutes={duration}
                  weekdays={weekdayOptions}
                  addLabel={t('school.groups.addSlot')}
                  removeLabel={t('school.groups.removeSlot')}
                  weekdayLabel={t('school.groups.weekday')}
                  untilLabel={(time) => t('school.groups.untilTime', { time })}
                  hideSummary
                  allowEmpty={false}
                />
              </div>
            </div>
          </div>

          <div className="rounded-xl border bg-slate-50 p-3 flex flex-col gap-3 min-h-[18rem] min-w-0">
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-semibold text-sm text-gray-900">{t('school.groups.members')}</h3>
              <span className="text-xs text-gray-500">{studentIds.length}</span>
            </div>
            <div className="flex flex-wrap gap-1.5 min-h-[2.25rem]">
              {selectedStudents.length === 0 ? (
                <p className="text-xs text-gray-500">{t('school.groups.emptyMembers')}</p>
              ) : selectedStudents.map((student) => (
                <span key={student.id} className="inline-flex items-center gap-1 rounded-full bg-white border px-2 py-0.5 text-xs text-gray-800">
                  {student.full_name}
                  {props.canEditMembers && (
                    <button
                      type="button"
                      className="text-gray-400 hover:text-gray-700"
                      onClick={() => setStudentIds((prev) => toggleMemberIds(prev, student.id))}
                      aria-label={t('school.groups.removeStudent')}
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </span>
              ))}
            </div>
            {props.canEditMembers && (
              <>
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={t('school.groups.searchStudents')}
                  className="rounded-xl bg-white"
                />
                <div className="flex-1 min-h-[12rem] max-h-[22rem] overflow-y-auto rounded-lg border bg-white divide-y">
                  {pickerStudents.length === 0 ? (
                    <p className="text-xs text-gray-500 p-3">{t('school.groups.noStudents')}</p>
                  ) : pickerStudents.map((student) => {
                    const on = studentIds.includes(student.id);
                    return (
                      <label key={student.id} className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-slate-50">
                        <input
                          type="checkbox"
                          className="rounded border-gray-300"
                          checked={on}
                          onChange={() => setStudentIds((prev) => toggleMemberIds(prev, student.id))}
                        />
                        <span className="min-w-0 truncate">{student.full_name}</span>
                        {student.grade ? <span className="ml-auto text-xs text-gray-400 shrink-0">{student.grade}</span> : null}
                      </label>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </div>
        <DialogFooter className="sm:justify-between gap-2">
          {props.mode === 'edit' && props.group && props.canDelete && props.onDelete ? (
            <Button
              type="button"
              variant="outline"
              className="rounded-xl border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700 sm:mr-auto"
              disabled={busy || deleting}
              onClick={() => void remove()}
            >
              <Trash2 className="w-4 h-4 mr-1" />
              {deleting ? '…' : t('common.delete')}
            </Button>
          ) : <span className="hidden sm:block" />}
          <div className="flex gap-2 justify-end">
            <Button variant="outline" className="rounded-xl" onClick={() => props.onOpenChange(false)}>
              {t('common.cancel')}
            </Button>
            <Button className="bg-emerald-600 hover:bg-emerald-700 rounded-xl" disabled={busy || deleting} onClick={() => void save()}>
              {busy ? '…' : props.mode === 'edit' ? t('common.save') : t('school.groups.create')}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
