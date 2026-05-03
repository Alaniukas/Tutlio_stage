import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Calendar as BigCalendar, dateFnsLocalizer, Views } from 'react-big-calendar';
import type { View } from 'react-big-calendar';
import {
  addDays,
  addMonths,
  addWeeks,
  endOfDay,
  endOfMonth,
  endOfWeek,
  format,
  getDay,
  parse,
  parseISO,
  startOfDay,
  startOfMonth,
  startOfWeek,
  isBefore,
  isValid,
} from 'date-fns';
import { lt } from 'date-fns/locale';
import { enUS } from 'date-fns/locale';
import 'react-big-calendar/lib/css/react-big-calendar.css';

import { supabase } from '@/lib/supabase';
import { authHeaders } from '@/lib/apiHelpers';
import { cn } from '@/lib/utils';
import { useTranslation } from '@/lib/i18n';
import { Button } from '@/components/ui/button';
import ParentLayout from '@/components/ParentLayout';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { CalendarDays, ChevronLeft, ChevronRight, Loader2, ShieldAlert, Wallet } from 'lucide-react';
import { recurringAvailabilityAppliesOnDate } from '@/lib/availabilityRecurring';

type SessionRow = {
  id: string;
  start_time: string;
  end_time: string;
  status: 'active' | 'cancelled' | 'completed' | 'no_show';
  topic: string | null;
  student_id: string;
  subjects?: { name?: string | null } | null;
};

type StudentMeta = {
  studentId: string;
  studentName: string;
  studentGrade: number | null;
  tutorId: string | null;
  tutorName: string | null;
};

type AvailabilityRule = {
  day_of_week: number | null;
  start_time: string;
  end_time: string;
  is_recurring: boolean;
  specific_date: string | null;
  end_date?: string | null;
  start_date?: string | null;
  created_at?: string | null;
};

type OccupiedSlot = {
  id: string;
  start_time: string;
  end_time: string;
};

type SubjectRow = {
  id: string;
  name: string;
  price: number | null;
  duration_minutes: number | null;
  grade_min: number | null;
  grade_max: number | null;
  is_trial?: boolean | null;
  is_group?: boolean | null;
  max_students?: number | null;
  meeting_link?: string | null;
};

type CalEvent = {
  id: string;
  title: string;
  start: Date;
  end: Date;
  kind: 'mine' | 'occupied' | 'free';
  resource: {
    session?: SessionRow;
    studentName: string;
    tutorName: string | null;
  };
};

const locales = { lt, en: enUS };
const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek,
  getDay,
  locales,
});

function rangeToBounds(range: unknown, view: View, date: Date, localeKey: 'lt' | 'en'): { start: Date; end: Date } {
  const weekStartsOn = localeKey === 'lt' ? 1 : 0;
  const asAny = range as any;
  if (Array.isArray(asAny) && asAny.length > 0) {
    const min = new Date(Math.min(...asAny.map((d) => new Date(d).getTime())));
    const max = new Date(Math.max(...asAny.map((d) => new Date(d).getTime())));
    return { start: startOfDay(min), end: endOfDay(max) };
  }
  if (asAny?.start && asAny?.end) {
    return { start: startOfDay(new Date(asAny.start)), end: endOfDay(new Date(asAny.end)) };
  }

  if (view === Views.MONTH) {
    return { start: startOfMonth(date), end: endOfMonth(date) };
  }
  if (view === Views.WEEK) {
    return { start: startOfWeek(date, { weekStartsOn }), end: endOfWeek(date, { weekStartsOn }) };
  }
  return { start: startOfDay(date), end: endOfDay(date) };
}

function colorFromId(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i += 1) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  const hue = h % 360;
  return `hsl(${hue} 80% 45%)`;
}

function parseStudentGrade(grade: string | number | null | undefined): number {
  if (grade == null) return 0;
  if (typeof grade === 'number') return grade;
  const n = parseInt(String(grade).replace(/\D+/g, ''), 10);
  return Number.isFinite(n) ? n : 0;
}

const CHILD_STORAGE_KEY = 'tutlio_parent_calendar_child_id';

export default function ParentCalendar() {
  const { t, locale, dateFnsLocale } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const localeKey = (locale === 'en' ? 'en' : 'lt') as 'lt' | 'en';
  const [currentView, setCurrentView] = useState<View>(
    typeof window !== 'undefined' && window.innerWidth < 768 ? Views.DAY : Views.WEEK,
  );
  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const [loading, setLoading] = useState(true);

  const [studentMeta, setStudentMeta] = useState<Map<string, StudentMeta>>(new Map());
  const studentIdsRef = useRef<string[]>([]);
  const [selectedChildId, setSelectedChildId] = useState<string | null>(() => {
    const fromUrl = typeof window !== 'undefined'
      ? new URLSearchParams(window.location.search).get('studentId')
      : null;
    if (fromUrl) return fromUrl;
    try {
      return typeof window !== 'undefined'
        ? localStorage.getItem(CHILD_STORAGE_KEY)
        : null;
    } catch {
      return null;
    }
  });

  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [availability, setAvailability] = useState<AvailabilityRule[]>([]);
  const [occupiedSlots, setOccupiedSlots] = useState<OccupiedSlot[]>([]);

  const [selected, setSelected] = useState<CalEvent | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);

  // Inline booking dialog state (mirrors student-side flow)
  const [bookingOpen, setBookingOpen] = useState(false);
  const [bookingSlot, setBookingSlot] = useState<{ start: Date; end: Date } | null>(null);
  const [bookingSubjects, setBookingSubjects] = useState<SubjectRow[]>([]);
  const [bookingSubjectId, setBookingSubjectId] = useState<string>('');
  const [bookingTimeOptions, setBookingTimeOptions] = useState<Date[]>([]);
  const [bookingTime, setBookingTime] = useState<Date | null>(null);
  const [bookingSaving, setBookingSaving] = useState(false);
  const [bookingError, setBookingError] = useState<string | null>(null);
  const [bookingSuccess, setBookingSuccess] = useState<string | null>(null);
  // Tutor cancellation / payment policy (mirrors student-side modal info)
  const [cancellationHours, setCancellationHours] = useState<number>(24);
  const [cancellationFeePercent, setCancellationFeePercent] = useState<number>(0);
  const [paymentTiming, setPaymentTiming] = useState<'before_lesson' | 'after_lesson'>('before_lesson');
  const [paymentDeadlineHours, setPaymentDeadlineHours] = useState<number>(24);

  const loadedSessionBoundsRef = useRef<{ start: Date; end: Date } | null>(null);
  const loadedOccupiedBoundsRef = useRef<{ start: Date; end: Date; tutorId: string; studentId: string } | null>(null);

  const loadChildren = useCallback(async () => {
    const { data: links, error } = await supabase
      .from('parent_students')
      .select('student_id, students(id, full_name, grade, tutor_id, profiles:tutor_id(full_name))');

    if (error) {
      console.warn('[ParentCalendar] parent_students load failed:', error);
      setStudentMeta(new Map());
      studentIdsRef.current = [];
      return new Map<string, StudentMeta>();
    }

    const meta = new Map<string, StudentMeta>();
    const studentIds: string[] = [];

    for (const link of links ?? []) {
      const s = (link as any).students as any;
      if (!s?.id) continue;
      studentIds.push(s.id);
      meta.set(s.id, {
        studentId: s.id,
        studentName: s.full_name ?? '',
        studentGrade: parseStudentGrade(s.grade),
        tutorId: s.tutor_id ?? null,
        tutorName: (s.profiles as any)?.full_name ?? null,
      });
    }

    setStudentMeta(meta);
    studentIdsRef.current = [...new Set(studentIds)];
    return meta;
  }, []);

  // Pick / repair selected child once we know the list.
  useEffect(() => {
    if (studentIdsRef.current.length === 0) return;
    // If selectedChildId is missing OR no longer in our list — pick the first.
    if (!selectedChildId || !studentMeta.has(selectedChildId)) {
      setSelectedChildId(studentIdsRef.current[0]);
    }
  }, [studentMeta, selectedChildId]);

  useEffect(() => {
    if (!selectedChildId) return;
    try {
      localStorage.setItem(CHILD_STORAGE_KEY, selectedChildId);
    } catch {
      /* ignore */
    }
  }, [selectedChildId]);

  // Sync ?studentId= back into URL so reload keeps the right child.
  useEffect(() => {
    if (!selectedChildId) return;
    const current = searchParams.get('studentId');
    if (current === selectedChildId) return;
    const next = new URLSearchParams(searchParams);
    next.set('studentId', selectedChildId);
    const url = `${window.location.pathname}?${next.toString()}`;
    window.history.replaceState(null, '', url);
    // We intentionally don't call setSearchParams to avoid re-renders.
  }, [selectedChildId, searchParams]);

  const loadSessions = useCallback(async (bounds: { start: Date; end: Date }) => {
    if (studentIdsRef.current.length === 0) {
      setSessions([]);
      return;
    }

    const padStart = addDays(bounds.start, -7);
    const padEnd = addDays(bounds.end, 7);

    const { data, error } = await supabase
      .from('sessions')
      .select('id, start_time, end_time, status, topic, student_id, subjects(name)')
      .in('student_id', studentIdsRef.current)
      .gte('start_time', padStart.toISOString())
      .lte('start_time', padEnd.toISOString())
      .order('start_time', { ascending: true })
      .limit(3000);

    if (error) {
      console.warn('[ParentCalendar] sessions load failed:', error);
      setSessions([]);
      return;
    }

    setSessions((data ?? []) as SessionRow[]);
    loadedSessionBoundsRef.current = { start: padStart, end: padEnd };
  }, []);

  const loadAvailability = useCallback(async (tutorId: string | null) => {
    if (!tutorId) {
      setAvailability([]);
      return;
    }
    const { data, error } = await supabase
      .from('availability')
      .select('*')
      .eq('tutor_id', tutorId);
    if (error) {
      console.warn('[ParentCalendar] availability load failed:', error);
      setAvailability([]);
      return;
    }
    const rules: AvailabilityRule[] = (data ?? []).map((row: any) => ({
      day_of_week: row.day_of_week ?? null,
      start_time: row.start_time,
      end_time: row.end_time,
      is_recurring: Boolean(row.is_recurring),
      specific_date: row.specific_date ?? null,
      end_date: row.end_date ?? null,
      start_date: row.start_date ?? null,
      created_at: row.created_at ?? null,
    }));
    setAvailability(rules);
  }, []);

  const loadOccupied = useCallback(async (tutorId: string | null, studentId: string | null, bounds: { start: Date; end: Date }) => {
    if (!tutorId || !studentId) {
      setOccupiedSlots([]);
      return;
    }
    const padStart = addDays(bounds.start, -1);
    const padEnd = addDays(bounds.end, 1);
    const cached = loadedOccupiedBoundsRef.current;
    if (
      cached &&
      cached.tutorId === tutorId &&
      cached.studentId === studentId &&
      padStart >= cached.start &&
      padEnd <= cached.end
    ) {
      return;
    }

    try {
      const headers = await authHeaders();
      const res = await fetch('/api/get-occupied-slots', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          tutorId,
          studentId,
          start: padStart.toISOString(),
          end: padEnd.toISOString(),
        }),
      });
      if (!res.ok) {
        console.warn('[ParentCalendar] get-occupied-slots HTTP', res.status);
        setOccupiedSlots([]);
        return;
      }
      const json = await res.json();
      const slots = Array.isArray(json?.slots) ? json.slots : [];
      setOccupiedSlots(
        slots.map((s: any) => ({
          id: s.id,
          start_time: s.start_time,
          end_time: s.end_time,
        })),
      );
      loadedOccupiedBoundsRef.current = {
        start: padStart,
        end: padEnd,
        tutorId,
        studentId,
      };
    } catch (err) {
      console.warn('[ParentCalendar] get-occupied-slots failed:', err);
      setOccupiedSlots([]);
    }
  }, []);

  // Initial load
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      await loadChildren();
      if (cancelled) return;
      const bounds = rangeToBounds(null, currentView, currentDate, localeKey);
      await loadSessions(bounds);
      if (cancelled) return;
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Whenever the selected child or view bounds change, refresh availability + occupied for that tutor.
  useEffect(() => {
    if (!selectedChildId) {
      setAvailability([]);
      setOccupiedSlots([]);
      return;
    }
    const meta = studentMeta.get(selectedChildId);
    if (!meta?.tutorId) {
      setAvailability([]);
      setOccupiedSlots([]);
      return;
    }
    void loadAvailability(meta.tutorId);
    const bounds = rangeToBounds(null, currentView, currentDate, localeKey);
    void loadOccupied(meta.tutorId, selectedChildId, bounds);
  }, [selectedChildId, studentMeta, currentView, currentDate, localeKey, loadAvailability, loadOccupied]);

  const handleNavigate = (action: 'TODAY' | 'PREV' | 'NEXT') => {
    let nextDate = currentDate;
    if (action === 'TODAY') {
      nextDate = new Date();
    } else if (action === 'PREV') {
      nextDate =
        currentView === Views.MONTH ? addMonths(currentDate, -1) :
        currentView === Views.WEEK ? addWeeks(currentDate, -1) :
        addDays(currentDate, -1);
    } else {
      nextDate =
        currentView === Views.MONTH ? addMonths(currentDate, 1) :
        currentView === Views.WEEK ? addWeeks(currentDate, 1) :
        addDays(currentDate, 1);
    }
    setCurrentDate(nextDate);
    const bounds = rangeToBounds(null, currentView, nextDate, localeKey);
    void loadSessions(bounds);
  };

  const onRangeChange = (range: any) => {
    const bounds = rangeToBounds(range, currentView, currentDate, localeKey);
    void loadSessions(bounds);
  };

  const eventPropGetter = useCallback((event: CalEvent) => {
    if (event.kind === 'free') {
      return {
        style: {
          backgroundColor: 'rgba(16, 185, 129, 0.15)',
          color: '#047857',
          border: '1px dashed rgba(16, 185, 129, 0.55)',
          borderRadius: 6,
          cursor: 'pointer',
        },
      };
    }
    if (event.kind === 'occupied') {
      return {
        style: {
          backgroundColor: 'rgba(148, 163, 184, 0.55)',
          color: '#1f2937',
          opacity: 0.9,
        },
      };
    }
    const studentId = event.resource.session?.student_id ?? '';
    const status = event.resource.session?.status ?? 'active';
    const opacity = status === 'cancelled' ? 0.35 : status === 'completed' ? 0.65 : 0.95;
    return {
      style: {
        backgroundColor: studentId ? colorFromId(studentId) : '#7c3aed',
        opacity,
      },
    };
  }, []);

  const events = useMemo<CalEvent[]>(() => {
    const out: CalEvent[] = [];
    const now = new Date();

    for (const s of sessions) {
      const start = parseISO(s.start_time);
      const end = parseISO(s.end_time);
      if (!isValid(start) || !isValid(end)) continue;
      const meta = studentMeta.get(s.student_id);
      const subjectName = (s.subjects as any)?.name ?? null;
      const titleParts = [meta?.studentName || t('common.student')];
      if (subjectName) titleParts.push(subjectName);
      else if (s.topic) titleParts.push(s.topic);
      out.push({
        id: `mine-${s.id}`,
        title: titleParts.join(' · '),
        start,
        end,
        kind: 'mine',
        resource: {
          session: s,
          studentName: meta?.studentName || '',
          tutorName: meta?.tutorName ?? null,
        },
      });
    }

    if (!selectedChildId) return out;
    const meta = studentMeta.get(selectedChildId);
    if (!meta?.tutorId) return out;

    const myMineSet = new Set(out.map((e) => `${e.start.getTime()}|${e.end.getTime()}`));
    for (const o of occupiedSlots) {
      const start = parseISO(o.start_time);
      const end = parseISO(o.end_time);
      if (!isValid(start) || !isValid(end)) continue;
      const key = `${start.getTime()}|${end.getTime()}`;
      if (myMineSet.has(key)) continue;
      out.push({
        id: `occ-${o.id}`,
        title: t('stuSched.occupied') || 'Užimta',
        start,
        end,
        kind: 'occupied',
        resource: {
          studentName: '',
          tutorName: meta.tutorName ?? null,
        },
      });
    }

    const bounds = rangeToBounds(null, currentView, currentDate, localeKey);
    const startOfRange = addDays(bounds.start, -7);
    const endOfRange = addDays(bounds.end, 14);

    const occupiedRanges = [
      ...sessions
        .filter((s) => s.status !== 'cancelled' && s.student_id === selectedChildId)
        .map((s) => ({ start: parseISO(s.start_time).getTime(), end: parseISO(s.end_time).getTime() })),
      ...occupiedSlots.map((o) => ({ start: parseISO(o.start_time).getTime(), end: parseISO(o.end_time).getTime() })),
    ];

    for (let d = startOfRange; d < endOfRange; d = addDays(d, 1)) {
      const dayOfWeek = d.getDay();
      const dateStr = format(d, 'yyyy-MM-dd');

      const rules = availability.filter((a) => {
        if (a.is_recurring && a.day_of_week !== null) {
          return recurringAvailabilityAppliesOnDate(a, dateStr, dayOfWeek);
        }
        if (!a.is_recurring && a.specific_date === dateStr) return true;
        return false;
      });

      rules.forEach((rule, idx) => {
        const startDT = new Date(`${dateStr}T${rule.start_time}`);
        const endDT = new Date(`${dateStr}T${rule.end_time}`);
        if (!(startDT < endDT)) return;

        const windows: Array<{ start: number; end: number }> = [
          { start: startDT.getTime(), end: endDT.getTime() },
        ];
        for (const occ of occupiedRanges) {
          for (let i = 0; i < windows.length; i += 1) {
            const w = windows[i];
            if (occ.end <= w.start || occ.start >= w.end) continue;
            const left = { start: w.start, end: Math.max(w.start, occ.start) };
            const right = { start: Math.min(w.end, occ.end), end: w.end };
            windows.splice(i, 1);
            if (left.end > left.start) windows.splice(i, 0, left);
            if (right.end > right.start) windows.splice(left.end > left.start ? i + 1 : i, 0, right);
            i = -1;
          }
        }

        windows.forEach((w, wi) => {
          if (w.end - w.start < 30 * 60 * 1000) return;
          const ws = new Date(w.start);
          const we = new Date(w.end);
          if (isBefore(we, now)) return;
          out.push({
            id: `free-${dateStr}-${idx}-${wi}`,
            title: t('parent.freeSlot'),
            start: ws,
            end: we,
            kind: 'free',
            resource: {
              studentName: meta.studentName,
              tutorName: meta.tutorName ?? null,
            },
          });
        });
      });
    }

    return out;
  }, [sessions, availability, occupiedSlots, selectedChildId, studentMeta, currentView, currentDate, localeKey, t]);

  const emptyState = useMemo(() => {
    const hasChildren = studentIdsRef.current.length > 0;
    if (!hasChildren) return t('parent.noChildren');
    return t('parent.noSessions');
  }, [t, studentMeta]);

  const childrenList = useMemo(
    () => [...studentMeta.values()].sort((a, b) => a.studentName.localeCompare(b.studentName)),
    [studentMeta],
  );

  const selectedMeta = selectedChildId ? studentMeta.get(selectedChildId) ?? null : null;

  const openBookingDialog = useCallback(async (slotStart: Date, slotEnd: Date) => {
    if (!selectedChildId) return;
    const meta = studentMeta.get(selectedChildId);
    if (!meta?.tutorId) return;

    setBookingSlot({ start: slotStart, end: slotEnd });
    setBookingError(null);
    setBookingSuccess(null);
    setBookingSubjectId('');
    setBookingTime(null);
    setBookingTimeOptions([]);
    setBookingSubjects([]);
    setBookingOpen(true);

    try {
      const [subsRes, individualPricingRes, tutorProfRes] = await Promise.all([
        supabase
          .from('subjects')
          .select('id, name, price, duration_minutes, grade_min, grade_max, is_trial, is_group, max_students, meeting_link')
          .eq('tutor_id', meta.tutorId)
          .order('name'),
        supabase
          .from('student_individual_pricing')
          .select('subject_id, price, duration_minutes')
          .eq('student_id', selectedChildId)
          .eq('tutor_id', meta.tutorId),
        supabase
          .from('profiles')
          .select('cancellation_hours, cancellation_fee_percent, payment_timing, payment_deadline_hours')
          .eq('id', meta.tutorId)
          .maybeSingle(),
      ]);

      const grade = meta.studentGrade ?? 0;
      let subs: SubjectRow[] = (subsRes.data ?? []).filter((s: any) => {
        if (s.is_trial) return false;
        if (s.grade_min == null || s.grade_max == null) return true;
        return grade >= s.grade_min && grade <= s.grade_max;
      });
      const pricing = individualPricingRes.data ?? [];
      if (pricing.length > 0) {
        subs = subs.map((s) => {
          const p = pricing.find((ip: any) => ip.subject_id === s.id);
          if (!p) return s;
          return { ...s, price: (p as any).price ?? s.price, duration_minutes: (p as any).duration_minutes ?? s.duration_minutes };
        });
      }
      setBookingSubjects(subs);

      const tp = tutorProfRes.data as any;
      if (tp) {
        setCancellationHours(Number(tp.cancellation_hours ?? 24));
        setCancellationFeePercent(Number(tp.cancellation_fee_percent ?? 0));
        setPaymentTiming(tp.payment_timing === 'after_lesson' ? 'after_lesson' : 'before_lesson');
        setPaymentDeadlineHours(Number(tp.payment_deadline_hours ?? 24));
      }
    } catch (err) {
      console.warn('[ParentCalendar] subjects load failed:', err);
      setBookingError(t('parent.bookingErrorLoadingSubjects'));
    }
  }, [selectedChildId, studentMeta, t]);

  // Recompute available start-time slots when subject changes.
  useEffect(() => {
    if (!bookingSlot || !bookingSubjectId) {
      setBookingTimeOptions([]);
      setBookingTime(null);
      return;
    }
    const subj = bookingSubjects.find((s) => s.id === bookingSubjectId);
    if (!subj) {
      setBookingTimeOptions([]);
      setBookingTime(null);
      return;
    }
    const durMs = (subj.duration_minutes ?? 60) * 60_000;
    const startMs = bookingSlot.start.getTime();
    const endMs = bookingSlot.end.getTime() - durMs;
    const nowMs = Date.now();
    const out: Date[] = [];
    for (let tMs = startMs; tMs <= endMs; tMs += 15 * 60_000) {
      if (tMs < nowMs) continue;
      out.push(new Date(tMs));
    }
    setBookingTimeOptions(out);
    setBookingTime(out[0] ?? null);
  }, [bookingSlot, bookingSubjectId, bookingSubjects]);

  const handleConfirmBooking = useCallback(async () => {
    if (!bookingSlot || !selectedChildId || !bookingTime) return;
    const meta = studentMeta.get(selectedChildId);
    if (!meta?.tutorId) return;
    const subj = bookingSubjects.find((s) => s.id === bookingSubjectId);
    if (!subj) return;

    setBookingError(null);
    setBookingSaving(true);
    try {
      const durMs = (subj.duration_minutes ?? 60) * 60_000;
      const startISO = bookingTime.toISOString();
      const endTime = new Date(bookingTime.getTime() + durMs);
      if (endTime > bookingSlot.end) {
        setBookingError(t('parent.bookingErrorTooLong'));
        return;
      }

      // Re-check overlap right before insert.
      const { data: clash } = await supabase
        .from('sessions')
        .select('id')
        .eq('tutor_id', meta.tutorId)
        .neq('status', 'cancelled')
        .lte('start_time', endTime.toISOString())
        .gte('end_time', startISO)
        .limit(1);
      if (clash && clash.length > 0) {
        setBookingError(t('parent.bookingErrorClash'));
        return;
      }

      const { error: insErr } = await supabase.from('sessions').insert([{
        tutor_id: meta.tutorId,
        student_id: selectedChildId,
        subject_id: subj.id,
        start_time: startISO,
        end_time: endTime.toISOString(),
        status: 'active',
        paid: false,
        payment_status: 'pending',
        topic: subj.name || null,
        price: subj.price ?? null,
        meeting_link: subj.meeting_link ?? null,
      }]);

      if (insErr) {
        console.error('[ParentCalendar] booking insert failed:', insErr);
        setBookingError(insErr.message || t('parent.bookingErrorGeneric'));
        return;
      }

      setBookingSuccess(t('parent.bookingSuccess'));
      const bounds = rangeToBounds(null, currentView, currentDate, localeKey);
      loadedSessionBoundsRef.current = null;
      loadedOccupiedBoundsRef.current = null;
      await Promise.all([
        loadSessions(bounds),
        loadOccupied(meta.tutorId, selectedChildId, bounds),
      ]);
      setTimeout(() => {
        setBookingOpen(false);
      }, 800);
    } catch (err: any) {
      console.error('[ParentCalendar] booking exception:', err);
      setBookingError(err?.message || t('parent.bookingErrorGeneric'));
    } finally {
      setBookingSaving(false);
    }
  }, [bookingSlot, bookingSubjectId, bookingSubjects, bookingTime, selectedChildId, studentMeta, currentView, currentDate, localeKey, loadSessions, loadOccupied, t]);

  const selectedSubject = bookingSubjects.find((s) => s.id === bookingSubjectId) ?? null;

  // Compute calendar visible time range from availability rules.
  // - Start at the earliest availability hour (skip dead night hours).
  // - Always show at least ~12 hours so the grid actually fills the page,
  //   instead of compressing into 2-3 rows.
  // - Fallback: 8:00–22:00 when no availability exists.
  const { calendarMin, calendarMax } = useMemo(() => {
    const fallbackMin = new Date(0, 0, 0, 8, 0, 0);
    const fallbackMax = new Date(0, 0, 0, 22, 0, 0);
    if (availability.length === 0) {
      return { calendarMin: fallbackMin, calendarMax: fallbackMax };
    }
    let earliestMin = 24 * 60;
    let latestMax = 0;
    availability.forEach((a) => {
      const [sh, sm] = (a.start_time || '00:00').split(':').map((v) => parseInt(v, 10));
      const [eh, em] = (a.end_time || '00:00').split(':').map((v) => parseInt(v, 10));
      const startMin = (Number.isFinite(sh) ? sh : 0) * 60 + (Number.isFinite(sm) ? sm : 0);
      const endMin = (Number.isFinite(eh) ? eh : 0) * 60 + (Number.isFinite(em) ? em : 0);
      if (startMin < earliestMin) earliestMin = startMin;
      if (endMin > latestMax) latestMax = endMin;
    });
    if (earliestMin === 24 * 60 || latestMax === 0) {
      return { calendarMin: fallbackMin, calendarMax: fallbackMax };
    }
    const MIN_VIEW_HOURS = 12;
    let minHour = Math.max(0, Math.floor(earliestMin / 60));
    let maxHour = Math.min(23, Math.ceil(latestMax / 60));
    // Ensure the grid spans at least MIN_VIEW_HOURS for a comfortable view.
    if (maxHour - minHour < MIN_VIEW_HOURS) {
      maxHour = Math.min(23, minHour + MIN_VIEW_HOURS);
      // If we hit the 23h ceiling, also pull minHour back so the span stays >= MIN_VIEW_HOURS.
      if (maxHour - minHour < MIN_VIEW_HOURS) {
        minHour = Math.max(0, maxHour - MIN_VIEW_HOURS);
      }
    }
    return {
      calendarMin: new Date(0, 0, 0, minHour, 0, 0),
      calendarMax: new Date(0, 0, 0, maxHour, 0, 0),
    };
  }, [availability]);

  return (
    <ParentLayout>
      <div className="flex-1 min-h-0 flex flex-col px-3 sm:px-4 pt-4 pb-4 max-w-7xl mx-auto w-full">
        <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-2xl bg-violet-100 flex items-center justify-center">
              <CalendarDays className="w-5 h-5 text-violet-700" />
            </div>
            <div>
              <h1 className="text-xl font-black text-gray-900">{t('nav.calendar')}</h1>
              <p className="text-xs text-gray-500">
                {format(currentDate, currentView === Views.MONTH ? 'LLLL yyyy' : 'yyyy-MM-dd', { locale: dateFnsLocale })}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {childrenList.length > 1 && (
              <select
                value={selectedChildId ?? ''}
                onChange={(e) => setSelectedChildId(e.target.value || null)}
                className="h-10 rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium text-gray-800"
              >
                {childrenList.map((c) => (
                  <option key={c.studentId} value={c.studentId}>
                    {c.studentName}
                  </option>
                ))}
              </select>
            )}
            <Button variant="outline" className="rounded-2xl" onClick={() => handleNavigate('TODAY')}>
              {t('cal.today')}
            </Button>
            <Button variant="outline" className="rounded-2xl px-3" onClick={() => handleNavigate('PREV')}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button variant="outline" className="rounded-2xl px-3" onClick={() => handleNavigate('NEXT')}>
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>

        <div className="flex items-center gap-2 mb-3">
          <Button
            variant={currentView === Views.DAY ? 'default' : 'outline'}
            className="rounded-2xl"
            onClick={() => {
              setCurrentView(Views.DAY);
              const bounds = rangeToBounds(null, Views.DAY, currentDate, localeKey);
              void loadSessions(bounds);
            }}
          >
            {t('cal.dayView')}
          </Button>
          <Button
            variant={currentView === Views.WEEK ? 'default' : 'outline'}
            className="rounded-2xl"
            onClick={() => {
              setCurrentView(Views.WEEK);
              const bounds = rangeToBounds(null, Views.WEEK, currentDate, localeKey);
              void loadSessions(bounds);
            }}
          >
            {t('cal.week')}
          </Button>
          <Button
            variant={currentView === Views.MONTH ? 'default' : 'outline'}
            className="rounded-2xl"
            onClick={() => {
              setCurrentView(Views.MONTH);
              const bounds = rangeToBounds(null, Views.MONTH, currentDate, localeKey);
              void loadSessions(bounds);
            }}
          >
            {t('cal.month')}
          </Button>
        </div>

        <div className="flex-1 min-h-0 bg-white rounded-[1.75rem] border border-gray-200 shadow-sm overflow-hidden">
          {loading && events.length === 0 ? (
            <div className="h-full flex items-center justify-center">
              <div className="w-8 h-8 border-4 border-violet-200 border-t-violet-600 rounded-full animate-spin" />
            </div>
          ) : (
            <div className="h-full flex flex-col p-2 sm:p-3">
              <div className={cn('flex-1 min-h-0', loading && 'opacity-60 pointer-events-none')}>
                <BigCalendar
                  localizer={localizer}
                  culture={localeKey}
                  events={events}
                  startAccessor="start"
                  endAccessor="end"
                  view={currentView}
                  date={currentDate}
                  min={calendarMin}
                  max={calendarMax}
                  step={15}
                  timeslots={4}
                  onNavigate={(d) => {
                    setCurrentDate(d);
                    const bounds = rangeToBounds(null, currentView, d, localeKey);
                    void loadSessions(bounds);
                  }}
                  onView={(v) => {
                    setCurrentView(v);
                    const bounds = rangeToBounds(null, v, currentDate, localeKey);
                    void loadSessions(bounds);
                  }}
                  onRangeChange={onRangeChange}
                  onSelectEvent={(ev) => {
                    const event = ev as CalEvent;
                    if (event.kind === 'free') {
                      void openBookingDialog(event.start, event.end);
                      return;
                    }
                    setSelected(event);
                    setDetailsOpen(true);
                  }}
                  eventPropGetter={eventPropGetter as any}
                  popup
                  messages={{
                    showMore: (total) => `+${total}`,
                  }}
                  style={{ height: '100%' }}
                />
              </div>

              {!loading && events.length === 0 && (
                <div className="pt-2 pb-1 text-center space-y-1">
                  <p className="text-sm text-gray-500">{emptyState}</p>
                  {selectedMeta && !selectedMeta.tutorId && (
                    <p className="text-xs text-amber-600">{t('parent.noTutorAssigned')}</p>
                  )}
                  {selectedMeta?.tutorId && (
                    <p className="text-xs text-gray-400">{t('parent.noAvailabilityHint')}</p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Existing session details dialog */}
      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="w-[95vw] sm:max-w-[520px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarDays className="w-5 h-5 text-violet-700" />
              {selected?.resource.studentName || t('common.lesson')}
            </DialogTitle>
            <DialogDescription>
              {selected?.resource.tutorName ? `${t('parent.tutor')}: ${selected.resource.tutorName}` : ''}
            </DialogDescription>
          </DialogHeader>

          {selected && selected.resource.session && (() => {
            const s = selected.resource.session;
            const subjectName = (s.subjects as any)?.name ?? null;
            return (
              <div className="space-y-3 py-2">
                <div className="rounded-2xl border border-gray-100 bg-gray-50/70 p-3">
                  <p className="text-sm font-bold text-gray-900">{subjectName || s.topic || t('common.lesson')}</p>
                  <p className="text-xs text-gray-600 mt-1">
                    {format(parseISO(s.start_time), 'yyyy-MM-dd HH:mm', { locale: dateFnsLocale })}
                    {' – '}
                    {format(parseISO(s.end_time), 'HH:mm', { locale: dateFnsLocale })}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">Statusas: {s.status}</p>
                </div>
              </div>
            );
          })()}

          <DialogFooter>
            <Button
              className="rounded-2xl flex-1 bg-violet-600 hover:bg-violet-700 text-white"
              onClick={() => {
                setDetailsOpen(false);
                navigate('/parent/lessons');
              }}
            >
              {t('parent.sessionsTitle')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Inline booking dialog (free slot click) — mirrors student-side flow:
          1) pick subject (defines duration), 2) pick a specific start time. */}
      <Dialog
        open={bookingOpen}
        onOpenChange={(open) => {
          if (!bookingSaving) setBookingOpen(open);
        }}
      >
        <DialogContent className="w-[95vw] sm:max-w-md p-0 border-0 rounded-3xl max-h-[90vh] overflow-y-auto">
          <div className="bg-gradient-to-br from-violet-600 to-indigo-600 p-6 text-white relative">
            <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none">
              <CalendarDays className="w-24 h-24" />
            </div>
            <DialogTitle className="text-2xl font-black mb-1 relative z-10">
              {t('stuSched.bookLesson')}
            </DialogTitle>
            <DialogDescription className="text-white/80 text-sm font-medium relative z-10">
              {bookingSlot && format(bookingSlot.start, 'EEEE, MMMM d', { locale: dateFnsLocale })}
              {selectedMeta && ` · ${selectedMeta.studentName}`}
              {selectedMeta?.tutorName && ` · ${selectedMeta.tutorName}`}
            </DialogDescription>
          </div>

          <div className="p-6 bg-white">
            {bookingSubjects.length === 0 ? (
              <div className="text-sm text-gray-500 bg-gray-50 p-4 rounded-xl text-center border border-gray-100">
                {t('parent.bookingNoSubjects')}
              </div>
            ) : (
              <div className="mb-5">
                <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">
                  {t('stuSched.selectSubject')}
                </p>
                <div className="grid grid-cols-1 gap-2">
                  {bookingSubjects.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setBookingSubjectId(s.id)}
                      className={cn(
                        'w-full flex items-center justify-between p-3.5 rounded-2xl border-2 transition-all text-left',
                        bookingSubjectId === s.id
                          ? 'border-violet-600 bg-violet-50/50'
                          : 'border-gray-100 bg-white hover:border-violet-200',
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={cn(
                            'w-2.5 h-2.5 rounded-full',
                            bookingSubjectId === s.id ? 'bg-violet-600' : 'bg-gray-300',
                          )}
                        />
                        <div>
                          <span className="block text-sm font-bold text-gray-800">
                            {s.name}
                          </span>
                          <span className="block text-xs font-semibold text-gray-400 mt-0.5">
                            {s.duration_minutes ?? 60} min.
                          </span>
                        </div>
                      </div>
                      <span
                        className={cn(
                          'text-sm font-black text-right',
                          bookingSubjectId === s.id ? 'text-violet-700' : 'text-gray-900',
                        )}
                      >
                        {s.price != null ? `${Number(s.price).toFixed(2)} €` : ''}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {bookingSubjectId && (
              <div className="mb-5 animate-in fade-in slide-in-from-bottom-2">
                <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">
                  {t('stuSched.selectTime')}
                </p>
                {bookingTimeOptions.length === 0 ? (
                  <div className="text-sm text-gray-500 bg-gray-50 p-4 rounded-xl text-center border border-gray-100">
                    {t('stuSched.noSlotsForDuration')}
                  </div>
                ) : (
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                    {bookingTimeOptions.map((slot, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => setBookingTime(slot)}
                        className={cn(
                          'py-2 rounded-xl border text-sm font-bold transition-all',
                          bookingTime && slot.getTime() === bookingTime.getTime()
                            ? 'bg-violet-600 border-violet-600 text-white shadow-md'
                            : 'bg-white border-gray-200 text-gray-700 hover:border-violet-300 hover:bg-violet-50',
                        )}
                      >
                        {format(slot, 'HH:mm')}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {selectedSubject?.price != null && bookingTime && (
              <div className="mb-4 rounded-2xl bg-gray-50 p-3 flex items-center justify-between">
                <span className="text-xs text-gray-600">{t('parent.bookingPrice')}</span>
                <span className="text-sm font-bold text-gray-900">
                  {Number(selectedSubject.price).toFixed(2)} €
                </span>
              </div>
            )}

            {/* Cancellation rules (mirrors student-side info box) */}
            {bookingSubjectId && bookingTime && (
              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-4 flex items-start gap-3">
                <ShieldAlert className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-amber-700">
                  <p className="font-semibold text-amber-800 mb-0.5">{t('stuSched.cancelRules')}</p>
                  <p>
                    <span dangerouslySetInnerHTML={{ __html: t('stuSched.cancelFreeNote', { hours: String(cancellationHours) }) }} />
                    {cancellationFeePercent > 0 ? (
                      <span dangerouslySetInnerHTML={{ __html: t('stuSched.cancelFeeNote', { percent: String(cancellationFeePercent) }) }} />
                    ) : (
                      <span>{` ${t('stuSched.noPenalty')}`}</span>
                    )}
                  </p>
                </div>
              </div>
            )}

            {/* Payment timing info */}
            {bookingSubjectId && bookingTime && selectedSubject?.price != null && Number(selectedSubject.price) > 0 && (
              <div className="bg-violet-50 border border-violet-200 rounded-2xl p-4 mb-4 flex items-start gap-3">
                <Wallet className="w-5 h-5 text-violet-600 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-violet-700">
                  <p className="font-semibold text-violet-800 mb-0.5">
                    {paymentTiming === 'before_lesson'
                      ? t('parent.paymentBeforeLesson')
                      : t('parent.paymentAfterLesson')}
                  </p>
                  <p>
                    {paymentTiming === 'before_lesson'
                      ? t('parent.paymentDeadlineBefore', { hours: String(paymentDeadlineHours) })
                      : t('parent.paymentDeadlineAfter', { hours: String(paymentDeadlineHours) })}
                  </p>
                </div>
              </div>
            )}

            {bookingError && (
              <div className="mb-3 rounded-xl bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
                {bookingError}
              </div>
            )}
            {bookingSuccess && (
              <div className="mb-3 rounded-xl bg-emerald-50 border border-emerald-200 px-3 py-2 text-xs text-emerald-700">
                {bookingSuccess}
              </div>
            )}
          </div>

          <DialogFooter className="flex gap-2 sm:flex-row p-6 pt-0 bg-white">
            <Button
              variant="outline"
              className="rounded-2xl flex-1"
              disabled={bookingSaving}
              onClick={() => setBookingOpen(false)}
            >
              {t('common.cancel')}
            </Button>
            <Button
              className="rounded-2xl flex-1 bg-violet-600 hover:bg-violet-700 text-white"
              disabled={bookingSaving || !bookingSubjectId || !bookingTime}
              onClick={handleConfirmBooking}
            >
              {bookingSaving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                  {t('common.saving')}
                </>
              ) : (
                t('parent.bookingConfirm')
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ParentLayout>
  );
}
