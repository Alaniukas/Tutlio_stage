/**
 * Company Tvarkarastis (Schedule) Page
 *
 * Allows org admins to view and manage all org tutors' calendars
 *
 * Features (controlled by feature flags):
 * - org_admin_calendar_view: View calendars + create sessions
 * - org_admin_calendar_full_control: Full control (create/edit/delete availability + sessions)
 */

import { useEffect, useState, useMemo } from 'react';
import { Calendar as BigCalendar, dateFnsLocalizer, Views } from 'react-big-calendar';
import type { View } from 'react-big-calendar';
import {
  format,
  parse,
  parseISO,
  startOfWeek,
  endOfWeek,
  startOfDay,
  endOfDay,
  getDay,
  addHours,
  addDays,
  addWeeks,
  addMonths,
  isBefore,
} from 'date-fns';
import { lt } from 'date-fns/locale';
import { enUS } from 'date-fns/locale';
import type { Locale } from 'date-fns';
import 'react-big-calendar/lib/css/react-big-calendar.css';

import { useTranslation } from '@/lib/i18n';
import { getCached, setCache } from '@/lib/dataCache';
import { supabase } from '@/lib/supabase';
import { sendEmail } from '@/lib/email';
import { assertTutorSlotsFree, runOrgAdminCreateSession } from '@/pages/company/orgAdminSessionCreate';
import { recurringAvailabilityAppliesOnDate } from '@/lib/availabilityRecurring';
import { useOrgFeatures } from '@/hooks/useOrgFeatures';
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
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { DateInput } from '@/components/ui/date-input';
import { Checkbox } from '@/components/ui/checkbox';
import TimeSpinner, { DateTimeSpinner } from '@/components/TimeSpinner';
import { cn } from '@/lib/utils';
import { sortStudentsByFullName } from '@/lib/sortStudentsByFullName';
import {
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  Users,
  Clock,
  Plus,
  AlertCircle,
  Loader2,
  Filter,
  X,
  Edit2,
  Search,
  UserX,
  RotateCcw,
} from 'lucide-react';
import MarkStudentNoShowDialog from '@/components/MarkStudentNoShowDialog';
import FindTutorModal from '@/components/FindTutorModal';
import { buildNoShowSessionPatch, noShowWhenLabelLt, type NoShowWhen } from '@/lib/noShowWhen';

const locales = { lt, en: enUS };
const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek,
  getDay,
  locales,
});

function weekdayLongFromDow(dow: number, locale: Locale): string {
  const sun = parseISO('2024-01-07T12:00:00');
  return format(addDays(sun, dow), 'EEEE', { locale });
}

async function emailOrgTutorAvailabilityNotice(
  tutorId: string,
  action: 'created' | 'updated',
  scheduleSummaryHtml: string,
) {
  const { data: tutor } = await supabase.from('profiles').select('full_name, email').eq('id', tutorId).single();
  if (!tutor?.email) return;
  void sendEmail({
    type: 'org_tutor_availability_notice',
    to: tutor.email,
    data: {
      action,
      tutorName: tutor.full_name || '',
      scheduleSummaryHtml,
    },
  }).catch(err => console.error('[OrgSchedule] availability notice', err));
}

interface OrgTutor {
  id: string;
  full_name: string;
  email: string | null;
}

interface Session {
  id: string;
  tutor_id: string;
  student_id: string;
  start_time: Date;
  end_time: Date;
  status: 'active' | 'cancelled' | 'completed' | 'no_show';
  paid: boolean;
  topic?: string;
  price?: number;
  meeting_link?: string;
  subject_id?: string;
  subject_name?: string;
  recurring_session_id?: string | null;
  no_show_when?: string | null;
  tutor_comment?: string | null;
  student?: {
    full_name: string;
    email?: string;
  };
  tutor?: {
    full_name: string;
  };
}

interface Availability {
  id: string;
  tutor_id: string;
  day_of_week: number | null;
  start_time: string;
  end_time: string;
  is_recurring: boolean;
  specific_date: string | null;
  end_date?: string | null;
  start_date?: string | null;
  created_at?: string | null;
  subject_ids?: string[];
  tutor?: {
    full_name: string;
  };
}

/** Postgres time / JS time → HH:MM:SS */
function normalizeTimeHMS(t: string): string {
  if (!t || !String(t).includes(':')) return '09:00:00';
  const parts = String(t).split(':');
  const h = Math.min(23, Math.max(0, parseInt(parts[0] || '9', 10) || 0));
  const m = Math.min(59, Math.max(0, parseInt(parts[1] || '0', 10) || 0));
  const s = Math.min(59, Math.max(0, parseInt(parts[2] || '0', 10) || 0));
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/** All free-time windows for the selected day (recurring + one-time rules). */
function buildAvailWindowsForDay(
  avails: Availability[],
  tutorId: string,
  datePart: string,
  dayJs: number
): Array<{ start: Date; end: Date }> {
  const windows: Array<{ start: Date; end: Date }> = [];
  for (const a of avails) {
    if (a.tutor_id !== tutorId) continue;
    if (a.is_recurring && a.day_of_week !== null) {
      if (!recurringAvailabilityAppliesOnDate(a, datePart, dayJs)) continue;
      const [sh, sm] = a.start_time.split(':').map(Number);
      const [eh, em] = a.end_time.split(':').map(Number);
      const base = parseISO(`${datePart}T00:00:00`);
      const s = new Date(base);
      s.setHours(sh, sm || 0, 0, 0);
      const e = new Date(base);
      e.setHours(eh, em || 0, 0, 0);
      windows.push({ start: s, end: e });
    } else if (!a.is_recurring && a.specific_date === datePart) {
      const [sh, sm] = a.start_time.split(':').map(Number);
      const [eh, em] = a.end_time.split(':').map(Number);
      const base = parseISO(`${datePart}T00:00:00`);
      const s = new Date(base);
      s.setHours(sh, sm || 0, 0, 0);
      const e = new Date(base);
      e.setHours(eh, em || 0, 0, 0);
      windows.push({ start: s, end: e });
    }
  }
  return windows;
}

/** Does the full session (start–end) fit inside at least one free-time window? */
function sessionInsideAvailWindows(
  start: Date,
  end: Date,
  windows: Array<{ start: Date; end: Date }>
): boolean {
  if (windows.length === 0) return false;
  return windows.some(
    w => start.getTime() >= w.start.getTime() && end.getTime() <= w.end.getTime()
  );
}

interface Subject {
  id: string;
  name: string;
  duration_minutes: number;
  price: number;
  color: string;
  tutor_id: string;
  is_group?: boolean | null;
  max_students?: number | null;
  meeting_link?: string | null;
  grade_min?: number | null;
  grade_max?: number | null;
}

interface Student {
  id: string;
  full_name: string;
  tutor_id: string;
  email?: string;
}

export default function CompanyTvarkarastis() {
  const { t, locale, dateFnsLocale } = useTranslation();
  const { loading: featuresLoading, hasFeature, organizationId } = useOrgFeatures();

  // Feature flags
  const canView = hasFeature('org_admin_calendar_view') || hasFeature('org_admin_calendar_full_control');
  const canFullControl = hasFeature('org_admin_calendar_full_control');

  const tc = getCached<{
    orgTutors: OrgTutor[];
    sessions: Session[];
    availability: Availability[];
    subjects: Subject[];
    students: Student[];
    individualPricing: Array<{ student_id: string; subject_id: string; price: number }>;
  }>('company_tvarkarastis');

  // Data state
  const [loading, setLoading] = useState(!tc);
  const [orgTutors, setOrgTutors] = useState<OrgTutor[]>(tc?.orgTutors ?? []);
  const [sessions, setSessions] = useState<Session[]>(tc?.sessions ?? []);
  const [availability, setAvailability] = useState<Availability[]>(tc?.availability ?? []);
  const [subjects, setSubjects] = useState<Subject[]>(tc?.subjects ?? []);
  const [students, setStudents] = useState<Student[]>(tc?.students ?? []);

  // Filter state
  const [selectedTutorIds, setSelectedTutorIds] = useState<string[]>(
    () => (tc?.orgTutors ?? []).map((t: { id: string }) => t.id),
  );
  const [tutorSearchQuery, setTutorSearchQuery] = useState('');
  const [selectedSubjectIds, setSelectedSubjectIds] = useState<string[]>([]);
  const [showOnlyAvailability, setShowOnlyAvailability] = useState(false);
  const [showOnlySessions, setShowOnlySessions] = useState(false);

  // Calendar state
  const [currentView, setCurrentView] = useState<View>(Views.WEEK);
  const [currentDate, setCurrentDate] = useState<Date>(new Date());

  // Modal state
  const [isCreateSessionOpen, setIsCreateSessionOpen] = useState(false);
  const [isEventDetailOpen, setIsEventDetailOpen] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<Session | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<{ start: Date; end: Date } | null>(null);

  // Edit session state
  const [isEditingSession, setIsEditingSession] = useState(false);
  const [editStartTime, setEditStartTime] = useState('');
  const [editEndTime, setEditEndTime] = useState('');
  const [editDurationMinutes, setEditDurationMinutes] = useState<number>(60);
  const [editTopic, setEditTopic] = useState('');
  const [editMeetingLink, setEditMeetingLink] = useState('');
  const [editPrice, setEditPrice] = useState<number>(0);
  const [editSubjectId, setEditSubjectId] = useState('');
  const [editStudentId, setEditStudentId] = useState('');
  const [editTutorId, setEditTutorId] = useState('');
  const [groupEditChoice, setGroupEditChoice] = useState<'single' | 'all_future'>('single');
  const [editPaid, setEditPaid] = useState(false);
  const [editStatus, setEditStatus] = useState<'active' | 'completed' | 'cancelled' | 'no_show'>('active');
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false);
  const [cancellationReason, setCancellationReason] = useState('');

  // Availability edit state
  const [isAvailabilityEditOpen, setIsAvailabilityEditOpen] = useState(false);
  const [editingAvailability, setEditingAvailability] = useState<Availability | null>(null);
  const [availEditStart, setAvailEditStart] = useState('');
  const [availEditEnd, setAvailEditEnd] = useState('');
  const [availEditDayOfWeek, setAvailEditDayOfWeek] = useState('1');
  const [availEditSpecificDate, setAvailEditSpecificDate] = useState('');
  const [availEditEndDate, setAvailEditEndDate] = useState('');
  const [availEditSubjectIds, setAvailEditSubjectIds] = useState<string[]>([]);
  const [availEditSaving, setAvailEditSaving] = useState(false);

  // Create availability state
  const [isCreateAvailabilityOpen, setIsCreateAvailabilityOpen] = useState(false);
  const [createAvailTutorId, setCreateAvailTutorId] = useState('');
  const [createAvailIsRecurring, setCreateAvailIsRecurring] = useState(true);
  const [createAvailDayOfWeek, setCreateAvailDayOfWeek] = useState('1');
  const [createAvailSpecificDate, setCreateAvailSpecificDate] = useState('');
  const [createAvailEndDate, setCreateAvailEndDate] = useState('');
  const [createAvailStart, setCreateAvailStart] = useState('09:00');
  const [createAvailEnd, setCreateAvailEnd] = useState('11:00');
  const [createAvailSubjectIds, setCreateAvailSubjectIds] = useState<string[]>([]);
  const [createAvailSaving, setCreateAvailSaving] = useState(false);

  // Create session from availability slot
  const [createFromAvailOpen, setCreateFromAvailOpen] = useState(false);
  const [createFromAvailStudentId, setCreateFromAvailStudentId] = useState('');
  const [createFromAvailStudentIds, setCreateFromAvailStudentIds] = useState<string[]>([]);
  const [createFromAvailSubjectId, setCreateFromAvailSubjectId] = useState('');
  const [createFromAvailTopic, setCreateFromAvailTopic] = useState('');
  const [createFromAvailSelectedSlot, setCreateFromAvailSelectedSlot] = useState('');
  const [createFromAvailBaseDate, setCreateFromAvailBaseDate] = useState('');
  const [createFromAvailSaving, setCreateFromAvailSaving] = useState(false);

  // Create session form
  const [createTutorId, setCreateTutorId] = useState('');
  const [createStudentId, setCreateStudentId] = useState('');
  const [createSubjectId, setCreateSubjectId] = useState('');
  const [createTutorSearch, setCreateTutorSearch] = useState('');
  const [createSubjectSearch, setCreateSubjectSearch] = useState('');
  const [createStudentSearch, setCreateStudentSearch] = useState('');
  const [createStartTime, setCreateStartTime] = useState('');
  const [createEndTime, setCreateEndTime] = useState('');
  const [createTopic, setCreateTopic] = useState('');
  const [createMeetingLink, setCreateMeetingLink] = useState('');
  const [createStudentIds, setCreateStudentIds] = useState<string[]>([]);
  const [createIsRecurring, setCreateIsRecurring] = useState(false);
  const [createRecurringEndDate, setCreateRecurringEndDate] = useState('');
  const [createIsPaid, setCreateIsPaid] = useState(false);
  const [createPrice, setCreatePrice] = useState(0);
  const [createTutorComment, setCreateTutorComment] = useState('');
  const [createShowCommentToStudent, setCreateShowCommentToStudent] = useState(false);
  const [createSelectedFreeSlot, setCreateSelectedFreeSlot] = useState('');
  const [individualPricing, setIndividualPricing] = useState<
    Array<{ student_id: string; subject_id: string; price: number }>
  >(tc?.individualPricing ?? []);
  const [tutorSubjectPrices, setTutorSubjectPrices] = useState<Array<{ tutor_id: string; org_subject_template_id: string; price: number; duration_minutes: number }>>([]);
  const [orgSubjectTemplates, setOrgSubjectTemplates] = useState<Array<{ id: string; name: string }>>([]);
  const [saving, setSaving] = useState(false);
  const [noShowDialogOpen, setNoShowDialogOpen] = useState(false);
  const [noShowSaving, setNoShowSaving] = useState(false);
  const [findLessonOpen, setFindLessonOpen] = useState(false);

  useEffect(() => {
    if (!featuresLoading && organizationId && !getCached('company_tvarkarastis')) {
      fetchData();
    }
  }, [featuresLoading, organizationId]);

  const fetchData = async () => {
    if (!organizationId) return;
    if (!getCached('company_tvarkarastis')) setLoading(true);

    try {
      // Exclude organization admins from tutor list (org_admin != org_korep)
      const { data: adminUsers } = await supabase
        .from('organization_admins')
        .select('user_id')
        .eq('organization_id', organizationId);
      const adminIds = new Set((adminUsers || []).map((a: any) => a.user_id));

      // Fetch org tutors
      const { data: tutorsData } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .eq('organization_id', organizationId)
        .order('full_name');
      const filteredTutors = (tutorsData || []).filter((t: any) => !adminIds.has(t.id));
      const tutorIds = filteredTutors.map((t: any) => t.id);
      setOrgTutors(filteredTutors);

      // Select all tutors by default
      if (filteredTutors.length > 0 && selectedTutorIds.length === 0) {
        setSelectedTutorIds(tutorIds);
      }

      // Fetch sessions for org tutors
      const { data: sessionsData } = await supabase
        .from('sessions')
        .select(`
          *,
          student:students(full_name, email, admin_comment),
          tutor:profiles!sessions_tutor_id_fkey(full_name)
        `)
        .in('tutor_id', tutorIds)
        .not('hidden_from_calendar', 'eq', true)
        .limit(1000);

      const parsedSessions = (sessionsData || []).map((session: any) => ({
        ...session,
        start_time: new Date(session.start_time),
        end_time: new Date(session.end_time),
      }));
      setSessions(parsedSessions);

      // Fetch availability for org tutors
      const { data: availabilityData } = await supabase
        .from('availability')
        .select(`
          *,
          tutor:profiles!availability_tutor_id_fkey(full_name)
        `)
        .in('tutor_id', tutorIds);

      setAvailability(availabilityData || []);

      // Fetch subjects for org tutors
      const { data: subjectsData } = await supabase
        .from('subjects')
        .select('*')
        .in('tutor_id', tutorIds);

      setSubjects(subjectsData || []);

      // Fetch students for org tutors
      const { data: studentsData } = await supabase
        .from('students')
        .select('id, full_name, tutor_id, email')
        .in('tutor_id', tutorIds);

      setStudents(studentsData || []);

      const { data: pricingData } = await supabase
        .from('student_individual_pricing')
        .select('student_id, subject_id, price')
        .in('tutor_id', tutorIds);
      setIndividualPricing(pricingData || []);

      const { data: tspData } = await supabase
        .from('tutor_subject_prices')
        .select('tutor_id, org_subject_template_id, price, duration_minutes')
        .in('tutor_id', tutorIds);
      setTutorSubjectPrices(tspData || []);

      if (organizationId) {
        const { data: orgRow } = await supabase.from('organizations').select('org_subject_templates').eq('id', organizationId).maybeSingle();
        const tpl = (orgRow as any)?.org_subject_templates;
        if (Array.isArray(tpl)) {
          setOrgSubjectTemplates(tpl.filter((t: any) => t?.id && t?.name).map((t: any) => ({ id: t.id, name: String(t.name).trim() })));
        }
      }

      setCache('company_tvarkarastis', {
        orgTutors: filteredTutors,
        sessions: parsedSessions,
        availability: availabilityData || [],
        subjects: subjectsData || [],
        students: studentsData || [],
        individualPricing: pricingData || [],
      });
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  // Filter data based on selected filters
  const filteredSessions = useMemo(() => {
    let filtered = sessions;

    filtered = filtered.filter(s => selectedTutorIds.includes(s.tutor_id));

    if (selectedSubjectIds.length > 0) {
      filtered = filtered.filter(s => s.subject_id && selectedSubjectIds.includes(s.subject_id));
    }

    return filtered;
  }, [sessions, selectedTutorIds, selectedSubjectIds]);

  const filteredAvailability = useMemo(() => {
    let filtered = availability;

    filtered = filtered.filter(a => selectedTutorIds.includes(a.tutor_id));

    return filtered;
  }, [availability, selectedTutorIds]);

  // Generate availability blocks for calendar display
  const availabilityBlocks = useMemo(() => {
    if (showOnlySessions) return [];

    const blocks: any[] = [];
    const startOfPeriod = new Date(currentDate);
    startOfPeriod.setDate(startOfPeriod.getDate() - 30);
    const endOfPeriod = new Date(currentDate);
    endOfPeriod.setDate(endOfPeriod.getDate() + 60);

    filteredAvailability.forEach(avail => {
      if (avail.is_recurring && avail.day_of_week !== null) {
        // Generate recurring blocks
        for (let d = new Date(startOfPeriod); d <= endOfPeriod; d.setDate(d.getDate() + 1)) {
          const dateStr = format(d, 'yyyy-MM-dd');
          if (!recurringAvailabilityAppliesOnDate(avail, dateStr, d.getDay())) continue;
          const [startHour, startMin] = avail.start_time.split(':');
          const [endHour, endMin] = avail.end_time.split(':');
          const blockStart = new Date(d);
          blockStart.setHours(parseInt(startHour), parseInt(startMin), 0);
          const blockEnd = new Date(d);
          blockEnd.setHours(parseInt(endHour), parseInt(endMin), 0);

          blocks.push({
            id: `avail-${avail.id}-${d.toISOString()}`,
            title: `Laisvas: ${avail.tutor?.full_name || 'Tutorius'}`,
            start: blockStart,
            end: blockEnd,
            type: 'availability',
            availabilityId: avail.id,
            tutorId: avail.tutor_id,
          });
        }
      } else if (!avail.is_recurring && avail.specific_date) {
        // One-time availability
        const specificDate = new Date(avail.specific_date);
        const [startHour, startMin] = avail.start_time.split(':');
        const [endHour, endMin] = avail.end_time.split(':');
        const blockStart = new Date(specificDate);
        blockStart.setHours(parseInt(startHour), parseInt(startMin), 0);
        const blockEnd = new Date(specificDate);
        blockEnd.setHours(parseInt(endHour), parseInt(endMin), 0);

        blocks.push({
          id: `avail-${avail.id}`,
          title: `Laisvas: ${avail.tutor?.full_name || 'Tutorius'}`,
          start: blockStart,
          end: blockEnd,
          type: 'availability',
          availabilityId: avail.id,
          tutorId: avail.tutor_id,
        });
      }
    });

    return blocks;
  }, [filteredAvailability, currentDate, showOnlySessions]);

  // Calendar events
  const calendarEvents = useMemo(() => {
    const events: any[] = [];

    // Add availability blocks (green)
    if (!showOnlySessions) {
      events.push(...availabilityBlocks.map(block => ({
        ...block,
        resource: { type: 'availability' },
      })));
    }

    // Add sessions (colored by status)
    if (!showOnlyAvailability) {
      events.push(...filteredSessions.map(session => ({
        id: session.id,
        title: `${session.student?.full_name || 'Mokinys'}${session.student?.admin_comment ? ' ❓' : ''} - ${session.tutor?.full_name || 'Tutorius'}`,
        start: session.start_time,
        end: session.end_time,
        resource: {
          type: 'session',
          session,
        },
      })));
    }

    return events;
  }, [filteredSessions, availabilityBlocks, showOnlySessions, showOnlyAvailability]);

  const filteredOrgTutorsForList = useMemo(() => {
    const q = tutorSearchQuery.trim().toLowerCase();
    if (!q) return orgTutors;
    return orgTutors.filter(
      t =>
        t.full_name.toLowerCase().includes(q) ||
        (t.email && t.email.toLowerCase().includes(q))
    );
  }, [orgTutors, tutorSearchQuery]);

  const timeRangeBounds = useMemo(() => {
    const defaultMin = new Date(1970, 0, 1, 7, 0, 0);
    const defaultMax = new Date(1970, 0, 1, 21, 0, 0);
    const defaultScroll = new Date(1970, 0, 1, 7, 0, 0);

    if (currentView === Views.MONTH) {
      return { min: defaultMin, max: defaultMax, scrollToTime: defaultScroll };
    }

    let rangeStart: Date;
    let rangeEnd: Date;
    if (currentView === Views.DAY) {
      rangeStart = startOfDay(currentDate);
      rangeEnd = endOfDay(currentDate);
    } else {
      rangeStart = startOfWeek(currentDate, { weekStartsOn: 1 });
      rangeEnd = endOfWeek(currentDate, { weekStartsOn: 1 });
    }

    const relevant = calendarEvents.filter(ev => {
      const s = ev.start instanceof Date ? ev.start : new Date(ev.start);
      const e = ev.end instanceof Date ? ev.end : new Date(ev.end);
      return s.getTime() < rangeEnd.getTime() && e.getTime() > rangeStart.getTime();
    });

    if (relevant.length === 0) {
      return { min: defaultMin, max: defaultMax, scrollToTime: defaultScroll };
    }

    // Use min/max *time-of-day* across all overlapping events (not min start date vs max end date).
    // Pairing global earliest instant with global latest instant breaks week views: e.g. Mon 10:00
    // vs Sun 08:00 yields max clock 08:45 < min clock 09:30 and collapses the time gutter.
    let minMinutes = 24 * 60;
    let maxMinutes = 0;
    relevant.forEach((ev) => {
      const s = ev.start instanceof Date ? ev.start : new Date(ev.start);
      const e = ev.end instanceof Date ? ev.end : new Date(ev.end);
      const sm = s.getHours() * 60 + s.getMinutes();
      const em = e.getHours() * 60 + e.getMinutes();
      minMinutes = Math.min(minMinutes, sm);
      maxMinutes = Math.max(maxMinutes, em);
    });

    if (maxMinutes < minMinutes) {
      return { min: defaultMin, max: defaultMax, scrollToTime: defaultScroll };
    }

    const padBefore = 30;
    const padAfter = 45;
    let startMin = Math.max(0, minMinutes - padBefore);
    let endMin = Math.min(24 * 60 - 1, maxMinutes + padAfter);
    if (endMin <= startMin) {
      endMin = Math.min(24 * 60 - 1, startMin + 120);
    }
    // Keep at least a 2h window so labels are readable
    if (endMin - startMin < 120) {
      endMin = Math.min(24 * 60 - 1, startMin + 120);
    }
    // Stay within a sensible day band (still driven by events)
    startMin = Math.max(0, Math.min(startMin, 23 * 60 + 30));
    endMin = Math.max(startMin + 30, Math.min(24 * 60, endMin));

    const minTime = new Date(1970, 0, 1, Math.floor(startMin / 60), startMin % 60, 0, 0);
    const maxTime = new Date(1970, 0, 1, Math.floor(endMin / 60), endMin % 60, 0, 0);

    return { min: minTime, max: maxTime, scrollToTime: new Date(minTime) };
  }, [calendarEvents, currentDate, currentView]);

  const calendarToolbarLabel = useMemo(() => {
    if (currentView === Views.DAY) {
      return format(currentDate, 'yyyy MMMM d', { locale: dateFnsLocale });
    }
    if (currentView === Views.WEEK) {
      const ws = startOfWeek(currentDate, { weekStartsOn: 1 });
      const we = endOfWeek(currentDate, { weekStartsOn: 1 });
      return `${format(ws, 'd MMM', { locale: dateFnsLocale })} – ${format(we, 'd MMM yyyy', { locale: dateFnsLocale })}`;
    }
    return format(currentDate, 'yyyy MMMM', { locale: dateFnsLocale });
  }, [currentDate, currentView, dateFnsLocale]);

  const createFromAvailSlots = useMemo(() => {
    if (!editingAvailability || !createFromAvailBaseDate) return [] as Array<{ label: string; startIso: string; endIso: string }>;

    const selectedSubject = subjects.find(s => s.id === createFromAvailSubjectId);
    const durationMin = selectedSubject?.duration_minutes || 60;

    const [sh, sm] = availEditStart.split(':').map(Number);
    const [eh, em] = availEditEnd.split(':').map(Number);
    if (!Number.isFinite(sh) || !Number.isFinite(sm) || !Number.isFinite(eh) || !Number.isFinite(em)) return [];

    const baseDate = new Date(`${createFromAvailBaseDate}T00:00:00`);
    const start = new Date(baseDate);
    start.setHours(sh, sm, 0, 0);
    const end = new Date(baseDate);
    end.setHours(eh, em, 0, 0);

    const slots: Array<{ label: string; startIso: string; endIso: string }> = [];
    const stepMs = 15 * 60 * 1000;
    const durMs = durationMin * 60 * 1000;

    for (let cursor = new Date(start); cursor.getTime() + durMs <= end.getTime(); cursor = new Date(cursor.getTime() + stepMs)) {
      const slotStart = new Date(cursor);
      const slotEnd = new Date(cursor.getTime() + durMs);
      slots.push({
        label: `${format(slotStart, 'HH:mm')} - ${format(slotEnd, 'HH:mm')}`,
        startIso: slotStart.toISOString(),
        endIso: slotEnd.toISOString(),
      });
    }

    return slots;
  }, [editingAvailability, createFromAvailBaseDate, availEditStart, availEditEnd, createFromAvailSubjectId, subjects]);

  /** Pasirinktos dienos laisvo laiko langai (modalui – santrauka ir tikrinimas) */
  const createModalDayWindows = useMemo(() => {
    if (!createTutorId || !createStartTime.includes('T')) {
      return { windows: [] as Array<{ start: Date; end: Date }>, datePart: '' as string };
    }
    const datePart = createStartTime.split('T')[0];
    if (!datePart) return { windows: [], datePart: '' };
    const dayJs = getDay(parseISO(`${datePart}T12:00:00`));
    return {
      windows: buildAvailWindowsForDay(availability, createTutorId, datePart, dayJs),
      datePart,
    };
  }, [createTutorId, createStartTime, availability]);

  /** Does the current start/end fit inside free time (null = cannot determine yet) */
  const createLessonFitsAvailability = useMemo(() => {
    if (!createStartTime || !createEndTime) return null;
    const start = new Date(createStartTime);
    const end = new Date(createEndTime);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
    return sessionInsideAvailWindows(start, end, createModalDayWindows.windows);
  }, [createStartTime, createEndTime, createModalDayWindows.windows]);

  /** Laisvi/langai pasirinktam korepetitoriui ir datai (pagal availability) */
  const createSessionFreeSlots = useMemo(() => {
    if (!createTutorId || !createSubjectId || !createStartTime.includes('T')) {
      return [] as Array<{ label: string; value: string }>;
    }
    const datePart = createStartTime.split('T')[0];
    if (!datePart) return [];
    const selectedSubject = subjects.find(s => s.id === createSubjectId);
    const durationMin = selectedSubject?.duration_minutes || 60;
    const dayJs = getDay(parseISO(`${datePart}T12:00:00`));
    const windows = buildAvailWindowsForDay(availability, createTutorId, datePart, dayJs);
    const slots: Array<{ label: string; value: string }> = [];
    const durMs = durationMin * 60 * 1000;
    const stepMs = 15 * 60 * 1000;
    for (const { start, end } of windows) {
      for (let cursor = new Date(start); cursor.getTime() + durMs <= end.getTime(); cursor = new Date(cursor.getTime() + stepMs)) {
        const slotStart = new Date(cursor);
        const slotEnd = new Date(cursor.getTime() + durMs);
        const st = format(slotStart, "yyyy-MM-dd'T'HH:mm");
        slots.push({
          label: `${format(slotStart, 'HH:mm')} – ${format(slotEnd, 'HH:mm')}`,
          value: st,
        });
      }
    }
    return slots;
  }, [createTutorId, createSubjectId, createStartTime, availability, subjects]);

  /** Active sessions on the selected day (for overlap detection) */
  const createModalDayBusySessions = useMemo(() => {
    if (!createTutorId || !createModalDayWindows.datePart) return [];
    const dp = createModalDayWindows.datePart;
    return sessions
      .filter(s => {
        if (s.tutor_id !== createTutorId) return false;
        if (s.status !== 'active') return false;
        return format(s.start_time, 'yyyy-MM-dd') === dp;
      })
      .map(s => ({
        id: s.id,
        start: s.start_time,
        end: s.end_time,
        studentName: s.student?.full_name || '',
        topic: s.topic || '',
      }))
      .sort((a, b) => a.start.getTime() - b.start.getTime());
  }, [sessions, createTutorId, createModalDayWindows.datePart]);

  const createSelectionOverlapsBusy = useMemo(() => {
    if (!createStartTime || !createEndTime) return false;
    const selStart = new Date(createStartTime);
    const selEnd = new Date(createEndTime);
    if (Number.isNaN(selStart.getTime()) || Number.isNaN(selEnd.getTime())) return false;
    return createModalDayBusySessions.some(
      b => selStart.getTime() < b.end.getTime() && selEnd.getTime() > b.start.getTime(),
    );
  }, [createStartTime, createEndTime, createModalDayBusySessions]);

  const applyCreateSubjectDefaults = (subjectId: string) => {
    const subj = subjects.find(s => s.id === subjectId);
    if (!subj) return;

    const matchedTpl = orgSubjectTemplates.find(t => t.name.toLowerCase() === (subj.name || '').toLowerCase());
    const tsp = matchedTpl && createTutorId
      ? tutorSubjectPrices.find(p => p.tutor_id === createTutorId && p.org_subject_template_id === matchedTpl.id)
      : undefined;

    let price = tsp?.price ?? subj.price ?? 0;
    if (createStudentId) {
      const pricing = individualPricing.find(
        p => p.student_id === createStudentId && p.subject_id === subjectId,
      );
      if (pricing && typeof pricing.price === 'number') {
        price = pricing.price;
      }
    }

    setCreatePrice(price);
    setCreateMeetingLink(subj.meeting_link || '');
    setCreateTopic(subj.name || '');

    const durationMinutes = tsp?.duration_minutes ?? subj.duration_minutes ?? 60;
    if (createStartTime && createStartTime.includes('T')) {
      const newStart = new Date(createStartTime);
      if (!Number.isNaN(newStart.getTime())) {
        const newEnd = new Date(newStart.getTime() + durationMinutes * 60 * 1000);
        setCreateEndTime(format(newEnd, "yyyy-MM-dd'T'HH:mm"));
      }
    }
  };

  const handleCreateStartTimeChange = (newVal: string) => {
    setCreateStartTime(newVal);
    const subj = subjects.find(s => s.id === createSubjectId);
    const durationMin = subj?.duration_minutes || 60;
    const newStart = new Date(newVal);
    if (!Number.isNaN(newStart.getTime())) {
      const newEnd = new Date(newStart.getTime() + durationMin * 60 * 1000);
      setCreateEndTime(format(newEnd, "yyyy-MM-dd'T'HH:mm"));
    }
  };

  // Event style getter
  const eventStyleGetter = (event: any) => {
    if (event.resource?.type === 'availability') {
      return {
        style: {
          backgroundColor: '#10b981',
          borderColor: '#059669',
          opacity: 0.6,
        },
      };
    }

    const session = event.resource?.session;
    if (!session) return {};

    if (session.status === 'cancelled') {
      return {
        style: {
          backgroundColor: '#ef4444',
          borderColor: '#ef4444',
          opacity: 0.5,
          color: '#fff',
        },
      };
    }
    if (session.status === 'no_show') {
      return {
        style: {
          backgroundColor: '#fda4af',
          borderColor: '#fda4af',
          color: '#fff',
        },
      };
    }

    const endAt = session.end_time instanceof Date ? session.end_time : new Date(session.end_time);
    const hasEnded = endAt.getTime() <= Date.now();
    const isPaid = session.paid === true || session.payment_status === 'paid' || session.payment_status === 'confirmed';

    const unpaidOccurred =
      (session.status === 'completed' && !isPaid) ||
      (session.status === 'active' && hasEnded && !isPaid) ||
      (hasEnded && session.payment_status === 'paid_by_student');

    let bgColor = '#3b82f6'; // blue - active
    if (unpaidOccurred) {
      bgColor = '#ca8a04'; // amber - completed unpaid
    } else if (isPaid || session.status === 'completed') {
      bgColor = '#10b981'; // green - completed paid
    }

    return {
      style: {
        backgroundColor: bgColor,
        borderColor: bgColor,
        color: '#fff',
      },
    };
  };

  const handleSelectSlot = (slotInfo: { start: Date; end: Date }) => {
    if (!canView) return;

    // If user clicked an availability block and calendar triggers onSelectSlot too,
    // prefer opening availability edit (org_admin full control) instead of "create session".
    if (canFullControl && !showOnlySessions) {
      const match = availabilityBlocks.find((b: any) => (
        b.start?.getTime?.() === slotInfo.start.getTime() &&
        b.end?.getTime?.() === slotInfo.end.getTime() &&
        b.availabilityId
      ));

      if (match) {
        const fakeEvent = {
          resource: { type: 'availability' },
          availabilityId: match.availabilityId,
          tutorId: match.tutorId,
        };
        // Reuse the same handler used by onSelectEvent
        handleSelectEvent(fakeEvent);
        return;
      }
    }

    setSelectedSlot(slotInfo);
    setCreateStudentId('');
    setCreateStudentIds([]);
    setCreateSubjectId('');
    setCreateSelectedFreeSlot('');
    setCreateStartTime(format(slotInfo.start, "yyyy-MM-dd'T'HH:mm"));
    setCreateEndTime(format(slotInfo.end, "yyyy-MM-dd'T'HH:mm"));
    setIsCreateSessionOpen(true);
  };

  const handleSelectEvent = (event: any) => {
    if (event.resource?.type === 'availability') {
      if (!canFullControl) return;
      const avail = availability.find(a => a.id === event.availabilityId);
      if (avail) {
        setEditingAvailability(avail);
        setAvailEditStart(avail.start_time);
        setAvailEditEnd(avail.end_time);
        setAvailEditDayOfWeek(String(avail.day_of_week ?? 1));
        setAvailEditSpecificDate(avail.specific_date || '');
        setAvailEditEndDate(String(avail.end_date || ''));
        setAvailEditSubjectIds(avail.subject_ids || []);
        setCreateFromAvailOpen(false);
        setCreateFromAvailStudentId('');
        setCreateFromAvailStudentIds([]);
        setCreateFromAvailSubjectId('');
        setCreateFromAvailTopic('');
        setCreateFromAvailSelectedSlot('');
        if (event.start) {
          setCreateFromAvailBaseDate(format(new Date(event.start), 'yyyy-MM-dd'));
        } else if (avail.specific_date) {
          setCreateFromAvailBaseDate(avail.specific_date);
        } else {
          setCreateFromAvailBaseDate(format(new Date(), 'yyyy-MM-dd'));
        }
        setIsAvailabilityEditOpen(true);
      }
      return;
    }
    if (event.resource?.type === 'session') {
      setSelectedEvent(event.resource.session);
      setIsEditingSession(false);
      setIsEventDetailOpen(true);
    }
  };

  const handleSaveSession = async () => {
    if (!selectedEvent) return;
    setSaving(true);
    try {
      const newStart = new Date(editStartTime);
      if (Number.isNaN(newStart.getTime())) {
        throw new Error(t('compSch.invalidStartDateTime'));
      }
      const newEnd = new Date(newStart.getTime() + editDurationMinutes * 60 * 1000);
      if (Number.isNaN(newEnd.getTime())) {
        throw new Error(t('compSch.invalidEndDuration'));
      }

      const payload = {
        start_time: newStart.toISOString(),
        end_time: newEnd.toISOString(),
        topic: editTopic || null,
        meeting_link: editMeetingLink || null,
        price: editPrice,
        subject_id: editSubjectId || null,
        student_id: editStudentId || selectedEvent.student_id,
        tutor_id: editTutorId || selectedEvent.tutor_id,
        paid: editPaid,
        payment_status: editPaid ? 'paid' : 'pending',
        status: editStatus,
      };

      if (groupEditChoice === 'all_future' && selectedEvent.recurring_session_id) {
        const { data, error } = await supabase
          .from('sessions')
          .update(payload)
          .eq('recurring_session_id', selectedEvent.recurring_session_id)
          .gte('start_time', selectedEvent.start_time.toISOString())
          .select('id');
        if (error) throw new Error(error.message);
        if (!data?.length) throw new Error(t('compSch.saveFailedPermissionsOrRecords'));
      } else {
        const { data, error } = await supabase
          .from('sessions')
          .update(payload)
          .eq('id', selectedEvent.id)
          .select('id');
        if (error) throw new Error(error.message);
        if (!data?.length) throw new Error(t('compSch.saveFailedPermissions'));
      }

      const oldStart = new Date(selectedEvent.start_time);
      const oldEnd = new Date(selectedEvent.end_time);
      const timeChanged =
        oldStart.getTime() !== newStart.getTime() || oldEnd.getTime() !== newEnd.getTime();

      if (timeChanged) {
        const tutorId = payload.tutor_id as string;
        const studentId = payload.student_id as string;
        const { data: tutorRow } = await supabase
          .from('profiles')
          .select('full_name, email')
          .eq('id', tutorId)
          .single();
        const { data: studentRow } = await supabase
          .from('students')
          .select('full_name, email, payment_payer, payer_email')
          .eq('id', studentId)
          .single();

        const isSeries =
          groupEditChoice === 'all_future' && Boolean(selectedEvent.recurring_session_id);
        const weekdayLt = format(newStart, 'EEEE', { locale: dateFnsLocale });
        const baseEmails = {
          studentName: studentRow?.full_name || selectedEvent.student?.full_name || '',
          tutorName: tutorRow?.full_name || selectedEvent.tutor?.full_name || '',
          oldDate: format(oldStart, 'yyyy-MM-dd'),
          oldTime: `${format(oldStart, 'HH:mm')}–${format(oldEnd, 'HH:mm')}`,
          newDate: format(newStart, 'yyyy-MM-dd'),
          newTime: `${format(newStart, 'HH:mm')}–${format(newEnd, 'HH:mm')}`,
          rescheduledBy: 'org_admin' as const,
        };

        const seriesSummaryHtml = isSeries
          ? t('compSch.seriesSummaryHtml', { fromDate: format(oldStart, 'yyyy-MM-dd'), timeRange: `${format(newStart, 'HH:mm')}–${format(newEnd, 'HH:mm')}`, weekday: weekdayLt })
          : '';

        const emailData = isSeries
          ? { ...baseEmails, isRecurringSeriesUpdate: true as const, seriesSummaryHtml }
          : { ...baseEmails, isRecurringSeriesUpdate: false as const };

        const sendRes = (to: string | undefined, recipientRole: 'tutor' | 'student' | 'payer') => {
          if (!to) return;
          void sendEmail({
            type: 'lesson_rescheduled',
            to,
            data: {
              ...emailData,
              recipientRole,
              ...(recipientRole === 'payer' ? { recipientName: 'Sveiki' } : {}),
            },
          }).catch(e => console.error('[OrgSchedule] reschedule mail', e));
        };

        sendRes(tutorRow?.email, 'tutor');
        sendRes(studentRow?.email, 'student');
        if (studentRow?.payment_payer === 'parent' && studentRow.payer_email) {
          sendRes(studentRow.payer_email, 'payer');
        }
      }

      setIsEditingSession(false);
      setIsEventDetailOpen(false);
      fetchData();
    } catch (err: any) {
      alert(t('compSch.errorSaving', { msg: err.message }));
    }
    setSaving(false);
  };

  const handleCancelSession = async () => {
    if (!selectedEvent || cancellationReason.trim().length < 3) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from('sessions')
        .update({
          status: 'cancelled',
          cancellation_reason: cancellationReason.trim(),
          cancelled_by: 'tutor',
          cancelled_at: new Date().toISOString(),
        })
        .eq('id', selectedEvent.id);

      if (!error) {
        setCancelConfirmOpen(false);
        setIsEventDetailOpen(false);
        setCancellationReason('');
        fetchData();
      } else {
        alert(t('compSch.errorCancelling', { msg: error.message }));
      }
    } catch (err: any) {
      alert(t('compSch.errorGeneric', { msg: err.message }));
    }
    setSaving(false);
  };

  const confirmMarkStudentNoShowSchedule = async (when: NoShowWhen) => {
    if (!selectedEvent) return;
    setNoShowSaving(true);
    const patch = buildNoShowSessionPatch(when, selectedEvent.tutor_comment);
    const { error } = await supabase.from('sessions').update(patch).eq('id', selectedEvent.id);
    if (!error) {
      setIsEventDetailOpen(false);
      setNoShowDialogOpen(false);
      fetchData();
    }
    setNoShowSaving(false);
  };

  const handleClearNoShow = async () => {
    if (!selectedEvent) return;
    setNoShowSaving(true);
    const { error } = await supabase
      .from('sessions')
      .update({ status: 'active', no_show_when: null })
      .eq('id', selectedEvent.id);
    if (!error) {
      setIsEventDetailOpen(false);
      fetchData();
    }
    setNoShowSaving(false);
  };

  const handleTogglePaid = async () => {
    if (!selectedEvent) return;
    setSaving(true);
    try {
      const nextPaid = !selectedEvent.paid;
      const { error } = await supabase
        .from('sessions')
        .update({
          paid: nextPaid,
          payment_status: nextPaid ? 'paid' : 'pending',
        })
        .eq('id', selectedEvent.id);

      if (error) {
        alert(t('compSch.errorPayment', { msg: error.message }));
      } else {
        setSelectedEvent((prev) => (prev ? { ...prev, paid: nextPaid } : prev));
        fetchData();
      }
    } catch (err: any) {
      alert(t('compSch.errorGeneric', { msg: err.message }));
    }
    setSaving(false);
  };

  const handleSaveAvailability = async () => {
    if (!editingAvailability) return;
    setAvailEditSaving(true);
    try {
      const payload: any = {
        start_time: normalizeTimeHMS(availEditStart),
        end_time: normalizeTimeHMS(availEditEnd),
        subject_ids: availEditSubjectIds,
      };

      if (editingAvailability.is_recurring) {
        payload.is_recurring = true;
        payload.day_of_week = parseInt(availEditDayOfWeek, 10);
        payload.specific_date = null;
        payload.end_date = availEditEndDate || null;
      } else {
        payload.is_recurring = false;
        payload.day_of_week = null;
        payload.specific_date = availEditSpecificDate || null;
        payload.end_date = null;
      }

      const { data: availUpd, error } = await supabase
        .from('availability')
        .update(payload)
        .eq('id', editingAvailability.id)
        .select('id');
      if (!error && availUpd && availUpd.length > 0) {
        const timeRange = `${normalizeTimeHMS(availEditStart).slice(0, 5)}–${normalizeTimeHMS(availEditEnd).slice(0, 5)}`;
        const schedHtml = editingAvailability.is_recurring
          ? t('compSch.recurringAvailHtml', { weekday: weekdayLongFromDow(parseInt(availEditDayOfWeek, 10), dateFnsLocale), timeRange, dateRange: availEditEndDate ? t('compSch.recurringAvailEndDatePart', { date: availEditEndDate }) : '' })
          : t('compSch.oneTimeAvailHtml', { date: availEditSpecificDate || '', timeRange });
        void emailOrgTutorAvailabilityNotice(editingAvailability.tutor_id, 'updated', schedHtml);
        setIsAvailabilityEditOpen(false);
        setEditingAvailability(null);
        fetchData();
      } else {
        alert(error?.message || t('compSch.availSaveFailed'));
      }
    } catch (err) {
      console.error(err);
    }
    setAvailEditSaving(false);
  };

  const handleCreateAvailability = async () => {
    if (!createAvailTutorId) { alert(t('compSch.selectTutorAlert')); return; }
    setCreateAvailSaving(true);
    try {
      const payload: any = {
        tutor_id: createAvailTutorId,
        start_time: createAvailStart,
        end_time: createAvailEnd,
        subject_ids: createAvailSubjectIds,
        is_recurring: createAvailIsRecurring,
        created_by_role: 'org_admin',
      };
      if (createAvailIsRecurring) {
        payload.day_of_week = parseInt(createAvailDayOfWeek, 10);
        payload.specific_date = null;
        payload.end_date = createAvailEndDate || null;
      } else {
        payload.day_of_week = null;
        payload.specific_date = createAvailSpecificDate || null;
        payload.end_date = null;
      }
      const { error } = await supabase.from('availability').insert(payload);
      if (error) throw new Error(error.message);
      const timeRangeCr = `${createAvailStart.slice(0, 5)}–${createAvailEnd.slice(0, 5)}`;
      const schedHtmlCr = createAvailIsRecurring
        ? t('compSch.recurringAvailHtml', { weekday: weekdayLongFromDow(parseInt(createAvailDayOfWeek, 10), dateFnsLocale), timeRange: timeRangeCr, dateRange: createAvailEndDate ? t('compSch.recurringAvailEndDatePart', { date: createAvailEndDate }) : '' })
        : t('compSch.oneTimeAvailHtml', { date: createAvailSpecificDate || '', timeRange: timeRangeCr });
      void emailOrgTutorAvailabilityNotice(createAvailTutorId, 'created', schedHtmlCr);
      setIsCreateAvailabilityOpen(false);
      setCreateAvailTutorId('');
      setCreateAvailSubjectIds([]);
      setCreateAvailStart('09:00');
      setCreateAvailEnd('11:00');
      fetchData();
    } catch (err: any) {
      alert(t('compSch.errorGeneric', { msg: err.message }));
    }
    setCreateAvailSaving(false);
  };

  const handleCreateSessionFromAvailability = async () => {
    if (!editingAvailability) return;
    setCreateFromAvailSaving(true);
    try {
      const subj = subjects.find(s => s.id === createFromAvailSubjectId);
      const isGroup = Boolean(subj?.is_group);
      const studentIds = isGroup
        ? createFromAvailStudentIds
        : (createFromAvailStudentId ? [createFromAvailStudentId] : []);

      if (studentIds.length === 0) {
        throw new Error(isGroup ? t('compSch.selectGroupStudents') : t('compSch.selectStudentAlert'));
      }

      const selectedSlot = createFromAvailSlots.find(s => s.startIso === createFromAvailSelectedSlot) || createFromAvailSlots[0];
      if (!selectedSlot) {
        throw new Error(t('compSch.noSlotFound'));
      }

      const availMatchedTpl = subj ? orgSubjectTemplates.find(t => t.name.toLowerCase() === (subj.name || '').toLowerCase()) : undefined;
      const availTsp = availMatchedTpl ? tutorSubjectPrices.find(p => p.tutor_id === editingAvailability.tutor_id && p.org_subject_template_id === availMatchedTpl.id) : undefined;

      const sessionRows = studentIds.map((studentId, index) => {
        const pricing = individualPricing.find(
          p => p.student_id === studentId && p.subject_id === createFromAvailSubjectId,
        );
        const studentPrice = pricing?.price ?? availTsp?.price ?? subj?.price ?? null;

        return {
          tutor_id: editingAvailability.tutor_id,
          student_id: studentId,
          subject_id: createFromAvailSubjectId || null,
          start_time: selectedSlot.startIso,
          end_time: selectedSlot.endIso,
          topic: createFromAvailTopic || subj?.name || null,
          meeting_link: subj?.meeting_link || null,
          price: studentPrice,
          status: 'active',
          paid: false,
          created_by_role: 'org_admin',
          available_spots: isGroup ? Math.max(0, (subj?.max_students ?? 5) - (index + 1)) : null,
        };
      });

      await assertTutorSlotsFree(supabase, editingAvailability.tutor_id, [
        { start: new Date(selectedSlot.startIso), end: new Date(selectedSlot.endIso) },
      ]);

      const { error } = await supabase.from('sessions').insert(sessionRows);
      if (error) throw new Error(error.message);

      setCreateFromAvailOpen(false);
      setCreateFromAvailStudentId('');
      setCreateFromAvailStudentIds([]);
      setCreateFromAvailSubjectId('');
      setCreateFromAvailTopic('');
      setCreateFromAvailSelectedSlot('');
      setIsAvailabilityEditOpen(false);
      fetchData();
    } catch (err: any) {
      alert(t('compSch.errorGeneric', { msg: err.message }));
    }
    setCreateFromAvailSaving(false);
  };

  const handleCreateSession = async () => {
    if (!canView) {
      alert(t('compSch.noCreatePermission'));
      return;
    }
    if (!createTutorId || !createSubjectId) {
      alert(t('compSch.selectTutorAndSubject'));
      return;
    }

    if (createModalDayWindows.datePart && createTutorId) {
      const noWindows = createModalDayWindows.windows.length === 0;
      const outside = createLessonFitsAvailability === false;
      if (noWindows || outside) {
        const msg = noWindows
          ? t('compSch.confirmNoAvailability')
          : t('compSch.confirmOutsideAvailability');
        if (!window.confirm(msg)) return;
      }
    }

    setSaving(true);
    try {
      const selectedSubj = subjects.find(s => s.id === createSubjectId);
      const matchedTemplate = selectedSubj
        ? orgSubjectTemplates.find(t => t.name.toLowerCase() === (selectedSubj.name || '').toLowerCase())
        : undefined;

      await runOrgAdminCreateSession({
        supabase,
        createTutorId,
        createSubjectId,
        createStudentId,
        createStudentIds,
        createStartTime,
        createEndTime,
        createTopic,
        createMeetingLink,
        createIsRecurring,
        createRecurringEndDate,
        createIsPaid,
        createPrice,
        createTutorComment,
        createShowCommentToStudent,
        subjects,
        individualPricing,
        tutorSubjectPrices,
        orgSubjectTemplateId: matchedTemplate?.id,
      });
      setIsCreateSessionOpen(false);
      resetCreateForm();
      fetchData();
    } catch (error: any) {
      console.error('Error creating session:', error);
      alert(t('compSch.errorGeneric', { msg: error.message }));
    } finally {
      setSaving(false);
    }
  };

  const resetCreateForm = () => {
    setCreateTutorId('');
    setCreateStudentId('');
    setCreateStudentIds([]);
    setCreateSubjectId('');
    setCreateTopic('');
    setCreateMeetingLink('');
    setCreateStartTime('');
    setCreateEndTime('');
    setCreateIsRecurring(false);
    setCreateRecurringEndDate('');
    setCreateIsPaid(false);
    setCreatePrice(0);
    setCreateTutorComment('');
    setCreateShowCommentToStudent(false);
    setCreateSelectedFreeSlot('');
  };

  const toggleTutorFilter = (tutorId: string) => {
    setSelectedTutorIds(prev =>
      prev.includes(tutorId)
        ? prev.filter(id => id !== tutorId)
        : [...prev, tutorId]
    );
  };

  const selectAllTutors = () => {
    setSelectedTutorIds(orgTutors.map(t => t.id));
  };

  const selectFilteredTutors = () => {
    setSelectedTutorIds(filteredOrgTutorsForList.map(t => t.id));
  };

  const deselectAllTutors = () => {
    setSelectedTutorIds([]);
  };

  const goCalendarPrev = () => {
    if (currentView === Views.DAY) setCurrentDate(d => addDays(d, -1));
    else if (currentView === Views.WEEK) setCurrentDate(d => addWeeks(d, -1));
    else if (currentView === Views.MONTH) setCurrentDate(d => addMonths(d, -1));
  };

  const goCalendarNext = () => {
    if (currentView === Views.DAY) setCurrentDate(d => addDays(d, 1));
    else if (currentView === Views.WEEK) setCurrentDate(d => addWeeks(d, 1));
    else if (currentView === Views.MONTH) setCurrentDate(d => addMonths(d, 1));
  };

  const goCalendarToday = () => {
    setCurrentDate(new Date());
  };

  // Check if feature is enabled
  if (featuresLoading) {
    return (
      <>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
        </div>
      </>
    );
  }

  if (!canView) {
    return (
      <>
        <div className="max-w-2xl mx-auto mt-12">
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-6 text-center">
            <AlertCircle className="w-12 h-12 text-amber-600 mx-auto mb-3" />
            <h2 className="text-xl font-bold text-amber-900 mb-2">
              {t('compSch.featureUnavailable')}
            </h2>
            <p className="text-amber-700 mb-4">
              {t('compSch.featureNotEnabled')}
            </p>
            <p className="text-sm text-amber-600">
              {t('compSch.contactAdmin')}
            </p>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{t('compSch.title')}</h1>
            <p className="text-sm text-gray-600 mt-1">
              {t('compSch.subtitle')}
              {canFullControl && <span className="ml-2 px-2 py-0.5 bg-purple-100 text-purple-700 text-xs rounded">{t('compSch.fullControl')}</span>}
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setFindLessonOpen(true)}>
              <Search className="w-4 h-4 mr-2" />
              {t('compSch.findLesson')}
            </Button>
            {canFullControl && (
              <Button variant="outline" onClick={() => setIsCreateAvailabilityOpen(true)}>
                <Plus className="w-4 h-4 mr-2" />
                {t('compSch.freeTime')}
              </Button>
            )}
            {canView && (
              <Button onClick={() => { resetCreateForm(); setIsCreateSessionOpen(true); }}>
                <Plus className="w-4 h-4 mr-2" />
                {t('compSch.newLesson')}
              </Button>
            )}
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-lg border p-4 space-y-4">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-gray-500" />
            <h3 className="font-semibold text-sm">{t('compSch.filters')}</h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Tutor filter */}
            <div>
              <Label className="text-sm mb-2 block">{t('compSch.tutors')}</Label>
              <div className="space-y-2 border rounded p-2">
                <div className="relative">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                  <Input
                    type="search"
                    placeholder={t('compSch.searchPlaceholder')}
                    value={tutorSearchQuery}
                    onChange={e => setTutorSearchQuery(e.target.value)}
                    className="h-9 pl-8 text-sm"
                    aria-label={t('compSch.tutorSearch')}
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={selectAllTutors} className="text-xs flex-1 min-w-[4rem]">
                    {t('compSch.all')}
                  </Button>
                  <Button size="sm" variant="outline" onClick={selectFilteredTutors} className="text-xs flex-1 min-w-[4rem] whitespace-normal leading-tight text-center">
                    {t('compSch.selectVisible')}
                  </Button>
                  <Button size="sm" variant="outline" onClick={deselectAllTutors} className="text-xs flex-1 min-w-[4rem]">
                    {t('compSch.clear')}
                  </Button>
                </div>
                <div className="max-h-48 overflow-y-auto space-y-1 pr-1">
                  {filteredOrgTutorsForList.length === 0 ? (
                    <p className="text-xs text-gray-500 py-2">{t('compSch.searchNotFound')}</p>
                  ) : (
                    filteredOrgTutorsForList.map(tutor => (
                      <div key={tutor.id} className="flex items-center space-x-2">
                        <Checkbox
                          id={`tutor-${tutor.id}`}
                          checked={selectedTutorIds.includes(tutor.id)}
                          onChange={() => toggleTutorFilter(tutor.id)}
                        />
                        <label htmlFor={`tutor-${tutor.id}`} className="text-sm cursor-pointer leading-tight">
                          {tutor.full_name}
                        </label>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            {/* View mode filter */}
            <div>
              <Label className="text-sm mb-2 block">{t('compSch.show')}</Label>
              <div className="space-y-2">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="show-availability"
                    checked={showOnlyAvailability}
                    onChange={(e) => {
                      setShowOnlyAvailability(e.target.checked);
                      if (e.target.checked) setShowOnlySessions(false);
                    }}
                  />
                  <label htmlFor="show-availability" className="text-sm cursor-pointer">
                    {t('compSch.onlyFreeTime')}
                  </label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="show-sessions"
                    checked={showOnlySessions}
                    onChange={(e) => {
                      setShowOnlySessions(e.target.checked);
                      if (e.target.checked) setShowOnlyAvailability(false);
                    }}
                  />
                  <label htmlFor="show-sessions" className="text-sm cursor-pointer">
                    {t('compSch.onlyLessons')}
                  </label>
                </div>
              </div>
            </div>

            {/* Stats */}
            <div className="md:col-span-2">
              <Label className="text-sm mb-2 block">{t('compSch.statistics')}</Label>
              <div className="grid grid-cols-3 gap-2">
                <div className="bg-gray-50 rounded p-2 text-center">
                  <div className="text-2xl font-bold text-gray-900">{orgTutors.length}</div>
                  <div className="text-xs text-gray-600">{t('compSch.tutors')}</div>
                </div>
                <div className="bg-blue-50 rounded p-2 text-center">
                  <div className="text-2xl font-bold text-blue-900">{filteredSessions.length}</div>
                  <div className="text-xs text-blue-600">{t('compSch.lessons')}</div>
                </div>
                <div className="bg-green-50 rounded p-2 text-center">
                  <div className="text-2xl font-bold text-green-900">{students.length}</div>
                  <div className="text-xs text-green-600">{t('compSch.students')}</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Calendar */}
        <div className="bg-white rounded-lg border p-4">
          {loading ? (
            <div className="flex items-center justify-center h-96">
              <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-wrap items-center gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={goCalendarToday}>
                    {t('compSch.today')}
                  </Button>
                  <div className="flex items-center gap-1 border rounded-md">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0"
                      onClick={goCalendarPrev}
                      aria-label={t('compSch.previousPeriod')}
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </Button>
                    <span className="text-sm font-medium text-gray-900 px-2 min-w-0 flex-1 text-center tabular-nums truncate">
                      {calendarToolbarLabel}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0"
                      onClick={goCalendarNext}
                      aria-label={t('compSch.nextPeriod')}
                    >
                      <ChevronRight className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
                <div className="inline-flex rounded-md border border-gray-200 p-0.5 bg-gray-50">
                  <Button
                    type="button"
                    variant={currentView === Views.DAY ? 'default' : 'ghost'}
                    size="sm"
                    className="text-xs h-8 px-3"
                    onClick={() => setCurrentView(Views.DAY)}
                  >
                    {t('compSch.day')}
                  </Button>
                  <Button
                    type="button"
                    variant={currentView === Views.WEEK ? 'default' : 'ghost'}
                    size="sm"
                    className="text-xs h-8 px-3"
                    onClick={() => setCurrentView(Views.WEEK)}
                  >
                    {t('compSch.week')}
                  </Button>
                  <Button
                    type="button"
                    variant={currentView === Views.MONTH ? 'default' : 'ghost'}
                    size="sm"
                    className="text-xs h-8 px-3"
                    onClick={() => setCurrentView(Views.MONTH)}
                  >
                    {t('compSch.month')}
                  </Button>
                </div>
              </div>
              <div style={{ height: '700px' }}>
                <BigCalendar
                  key={`${format(currentDate, 'yyyy-MM-dd')}-${currentView}-${timeRangeBounds.min.getTime()}-${timeRangeBounds.max.getTime()}`}
                  localizer={localizer}
                  events={calendarEvents}
                  startAccessor="start"
                  endAccessor="end"
                  views={[Views.DAY, Views.WEEK, Views.MONTH]}
                  view={currentView}
                  onView={setCurrentView}
                  date={currentDate}
                  onNavigate={setCurrentDate}
                  onSelectSlot={handleSelectSlot}
                  onSelectEvent={handleSelectEvent}
                  selectable={canView}
                  eventPropGetter={eventStyleGetter}
                  culture={locale}
                  {...(currentView !== Views.MONTH
                    ? {
                        min: timeRangeBounds.min,
                        max: timeRangeBounds.max,
                        scrollToTime: timeRangeBounds.scrollToTime,
                      }
                    : {})}
                  messages={{
                    next: t('compSch.next'),
                    previous: t('compSch.previous'),
                    today: t('compSch.today'),
                    month: t('compSch.month'),
                    week: t('compSch.week'),
                    day: t('compSch.day'),
                    agenda: t('compSch.agenda'),
                    date: t('compSch.dateLabel'),
                    time: t('compSch.timeLabel'),
                    event: t('compSch.event'),
                    noEventsInRange: t('compSch.noEventsInRange'),
                    showMore: (total) => t('compSch.showMore', { total: String(total) }),
                  }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Legend */}
        <div className="bg-gray-50 rounded-lg p-3 flex flex-wrap items-center gap-4 sm:gap-6 text-sm">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-green-500 rounded opacity-60"></div>
            <span>{t('compSch.freeTime')}</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded" style={{ backgroundColor: '#3b82f6' }}></div>
            <span>{t('compSch.activeLesson')}</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded" style={{ backgroundColor: '#10b981' }}></div>
            <span>{t('compSch.completedLesson')}</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded" style={{ backgroundColor: '#ca8a04' }}></div>
            <span>{t('compSch.unpaidLesson')}</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded" style={{ backgroundColor: '#ef4444', opacity: 0.5 }}></div>
            <span>{t('compSch.cancelledLesson')}</span>
          </div>
        </div>
      </div>

      {/* Create Session Modal */}
      <Dialog open={isCreateSessionOpen} onOpenChange={(open) => {
        setIsCreateSessionOpen(open);
        if (!open) resetCreateForm();
      }}>
        <DialogContent
          className="w-[min(96vw,1120px)] max-w-[1120px] max-h-[92vh] overflow-hidden gap-0 p-4 sm:p-6 flex flex-col !max-w-[1120px]"
          onWheel={(e) => e.stopPropagation()}
        >
          <DialogHeader className="pb-2 shrink-0 text-center sm:text-center max-w-3xl mx-auto w-full">
            <DialogTitle className="flex items-center justify-center gap-2 text-xl">
              <Plus className="w-5 h-5 text-indigo-600" />
              {t('compSch.createNewLesson')}
            </DialogTitle>
            <DialogDescription className="text-center">{t('compSch.fillInfoAdmin')}</DialogDescription>
          </DialogHeader>

          {(() => {
            const showDaySummaryAside = Boolean(createTutorId && createModalDayWindows.datePart);
            return (
          <div
            className={cn(
              'py-2 min-h-0 flex-1 w-full overflow-y-auto',
              showDaySummaryAside
                ? 'grid gap-6 xl:gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(272px,31%)] items-start'
                : 'flex flex-col',
            )}
          >
            <div
              className={cn(
                'min-w-0 flex flex-col gap-4 w-full',
                !showDaySummaryAside && 'lg:px-4 xl:px-8',
              )}
            >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              <div className="space-y-2 min-w-0">
                <Label>{t('compSch.tutorRequired')}</Label>
                <Select
                  value={createTutorId}
                  onValueChange={(id) => {
                    setCreateTutorId(id);
                    setCreateStudentId('');
                    setCreateStudentIds([]);
                    setCreateSubjectId('');
                  }}
                >
                  <SelectTrigger className="rounded-xl">
                    <SelectValue placeholder={t('compSch.selectTutorPlaceholder')} />
                  </SelectTrigger>
                  <SelectContent className="max-h-72 overflow-y-auto">
                    <div className="sticky top-0 z-10 bg-white p-2 border-b border-gray-100">
                      <Input
                        value={createTutorSearch}
                        onChange={(e) => setCreateTutorSearch(e.target.value)}
                        placeholder={t('common.search')}
                        className="h-9 rounded-xl"
                      />
                      {!createTutorSearch && orgTutors.length > 5 && (
                        <p className="mt-1 text-[11px] text-gray-500">{t('common.searchToSeeMore')}</p>
                      )}
                    </div>
                    {(createTutorSearch
                      ? orgTutors.filter((tu) => (tu.full_name || '').toLowerCase().includes(createTutorSearch.trim().toLowerCase()))
                      : orgTutors.slice(0, 5)
                    ).map(tutor => (
                      <SelectItem key={tutor.id} value={tutor.id}>{tutor.full_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {subjects.filter(s => !createTutorId || s.tutor_id === createTutorId).length > 0 && (
                <div className="space-y-2 min-w-0">
                  <Label>{t('compSch.subjectRequired')}</Label>
                  <Select
                    value={createSubjectId}
                    onValueChange={(id) => {
                      setCreateSubjectId(id);
                      applyCreateSubjectDefaults(id);
                    }}
                  >
                    <SelectTrigger className="rounded-xl">
                      <SelectValue placeholder={t('compSch.selectSubjectPlaceholder')} />
                    </SelectTrigger>
                    <SelectContent className="max-h-72 overflow-y-auto">
                      <div className="sticky top-0 z-10 bg-white p-2 border-b border-gray-100">
                        <Input
                          value={createSubjectSearch}
                          onChange={(e) => setCreateSubjectSearch(e.target.value)}
                          placeholder={t('common.search')}
                          className="h-9 rounded-xl"
                        />
                        {!createSubjectSearch && subjects.length > 5 && (
                          <p className="mt-1 text-[11px] text-gray-500">{t('common.searchToSeeMore')}</p>
                        )}
                      </div>
                      {(createSubjectSearch
                        ? subjects.filter((s) => (s.name || '').toLowerCase().includes(createSubjectSearch.trim().toLowerCase()))
                        : subjects.slice(0, 5)
                      )
                        .filter(s => !createTutorId || s.tutor_id === createTutorId)
                        .map(subj => (
                          <SelectItem key={subj.id} value={subj.id}>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: subj.color }} />
                              {subj.name}
                              {subj.is_group && subj.max_students && (
                                <span className="text-xs text-violet-600 font-semibold">
                                  {t('compSch.groupMax', { max: String(subj.max_students) })}
                                </span>
                              )}
                              · {subj.duration_minutes} min · €{subj.price}
                            </div>
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            {(() => {
              const selSubj = subjects.find(s => s.id === createSubjectId);
              const isGrp = Boolean(selSubj?.is_group);
              const maxSt = selSubj?.max_students || 1;
              const list = sortStudentsByFullName(students.filter(s => !createTutorId || s.tutor_id === createTutorId));
              if (isGrp) {
                return (
                  <div className="space-y-2">
                    <Label>{t('compSch.studentsMax', { max: String(maxSt) })}</Label>
                    <div className="border border-gray-200 rounded-xl p-3 space-y-2 max-h-52 overflow-y-auto">
                      {list.length === 0 ? (
                        <p className="text-sm text-gray-400 text-center py-2">{t('compSch.noStudents')}</p>
                      ) : (
                        list.map(student => (
                          <label key={student.id} className="flex items-center gap-2 p-2 hover:bg-gray-50 rounded-lg cursor-pointer">
                            <input
                              type="checkbox"
                              checked={createStudentIds.includes(student.id)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  if (createStudentIds.length < maxSt) {
                                    setCreateStudentIds([...createStudentIds, student.id]);
                                  }
                                } else {
                                  setCreateStudentIds(createStudentIds.filter(id => id !== student.id));
                                }
                              }}
                              disabled={!createStudentIds.includes(student.id) && createStudentIds.length >= maxSt}
                              className="rounded border-gray-300 text-indigo-600"
                            />
                            <span className="text-sm">{student.full_name}</span>
                          </label>
                        ))
                      )}
                    </div>
                    <p className="text-xs text-gray-500">{t('compSch.selectedCount', { count: String(createStudentIds.length), max: String(maxSt) })}</p>
                  </div>
                );
              }
              return (
                <div className="space-y-2">
                  <Label>{t('compSch.studentRequired')}</Label>
                  <Select value={createStudentId} onValueChange={setCreateStudentId}>
                    <SelectTrigger className="rounded-xl">
                      <SelectValue placeholder={t('compSch.selectStudentPlaceholder')} />
                    </SelectTrigger>
                    <SelectContent className="max-h-72 overflow-y-auto">
                      <div className="sticky top-0 z-10 bg-white p-2 border-b border-gray-100">
                        <Input
                          value={createStudentSearch}
                          onChange={(e) => setCreateStudentSearch(e.target.value)}
                          placeholder={t('common.search')}
                          className="h-9 rounded-xl"
                        />
                        {!createStudentSearch && list.length > 5 && (
                          <p className="mt-1 text-[11px] text-gray-500">{t('common.searchToSeeMore')}</p>
                        )}
                      </div>
                      {(createStudentSearch
                        ? list.filter((s) => (s.full_name || '').toLowerCase().includes(createStudentSearch.trim().toLowerCase()))
                        : list.slice(0, 5)
                      ).map(student => (
                        <SelectItem key={student.id} value={student.id}>{student.full_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              );
            })()}

            {createSessionFreeSlots.length > 0 && (
              <div className="space-y-2">
                <Label>{t('compSch.freeTimeForSubjectDay')}</Label>
                <Select
                  value={createSelectedFreeSlot || undefined}
                  onValueChange={(v) => {
                    setCreateSelectedFreeSlot(v);
                    handleCreateStartTimeChange(v);
                  }}
                >
                  <SelectTrigger className="rounded-xl">
                    <SelectValue placeholder={t('compSch.selectSlotPlaceholder')} />
                  </SelectTrigger>
                  <SelectContent>
                    {createSessionFreeSlots.map(slot => (
                      <SelectItem key={slot.value} value={slot.value}>{slot.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 lg:gap-4 items-start">
              <div className="space-y-2 min-w-0">
                <Label>{t('compSch.startTimeRequired')}</Label>
                <div className="rounded-xl border border-indigo-100 bg-indigo-50/40 p-2 sm:p-3" onWheel={(e) => e.stopPropagation()}>
                  <DateTimeSpinner value={createStartTime} onChange={handleCreateStartTimeChange} />
                </div>
              </div>
              <div className="space-y-2 min-w-0">
                <Label>{t('compSch.endTimeRequired')}</Label>
                <div className="rounded-xl border border-gray-100 p-2 sm:p-3" onWheel={(e) => e.stopPropagation()}>
                  <DateTimeSpinner value={createEndTime} onChange={setCreateEndTime} />
                </div>
              </div>
            </div>

            {createSelectionOverlapsBusy && (
              <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-900" dangerouslySetInnerHTML={{ __html: t('compSch.overlapWarning') }} />
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
              <div className="space-y-2 min-w-0">
                <Label>{t('compSch.topic')}</Label>
                <Input value={createTopic} onChange={(e) => setCreateTopic(e.target.value)} className="rounded-xl" placeholder={t('compSch.topicPlaceholder')} />
              </div>
              <div className="space-y-2 min-w-0">
                <Label>{t('compSch.meetingLink')}</Label>
                <Input value={createMeetingLink} onChange={(e) => setCreateMeetingLink(e.target.value)} className="rounded-xl" placeholder="https://..." />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 items-stretch">
              <div className="space-y-2">
                <Label>{t('compSch.price')}</Label>
                <Input type="number" value={createPrice} onChange={(e) => setCreatePrice(Number(e.target.value))} className="rounded-xl" />
              </div>
              <div className="border border-green-100 rounded-xl p-3 sm:p-4 bg-green-50/50 flex flex-col justify-center min-h-[4.5rem]">
                <button type="button" onClick={() => setCreateIsPaid(!createIsPaid)} className="flex items-center justify-between gap-3 w-full text-left">
                  <div>
                    <p className="text-sm font-medium text-green-900">{t('compSch.alreadyPaid')}</p>
                    <p className="text-xs text-green-800/80 hidden sm:block">{t('compSch.ifStudentPaid')}</p>
                  </div>
                  <div className={`relative inline-flex h-6 w-11 items-center rounded-full flex-shrink-0 ${createIsPaid ? 'bg-green-500' : 'bg-gray-300'}`}>
                    <span className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${createIsPaid ? 'translate-x-6' : 'translate-x-1'}`} />
                  </div>
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <Label>{t('compSch.commentOptional')}</Label>
              <textarea
                value={createTutorComment}
                onChange={(e) => setCreateTutorComment(e.target.value)}
                className="w-full p-3 rounded-xl border border-gray-200 text-sm resize-none"
                rows={2}
              />
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={createShowCommentToStudent}
                  onChange={(e) => setCreateShowCommentToStudent(e.target.checked)}
                  className="rounded border-gray-300 text-indigo-600"
                />
                {t('compSch.showToStudent')}
              </label>
            </div>

            <div className="border border-gray-100 rounded-xl p-3 sm:p-4 space-y-3 bg-gray-50">
              <button
                type="button"
                onClick={() => { setCreateIsRecurring(!createIsRecurring); setCreateRecurringEndDate(''); }}
                className="flex items-center justify-between w-full"
              >
                <div className="text-left">
                  <p className="text-sm font-medium text-gray-900">{t('compSch.recurringLesson')}</p>
                  <p className="text-xs text-gray-500">{t('compSch.recurringDesc')}</p>
                </div>
                <div className={`relative inline-flex h-6 w-11 items-center rounded-full flex-shrink-0 ${createIsRecurring ? 'bg-indigo-500' : 'bg-gray-300'}`}>
                  <span className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${createIsRecurring ? 'translate-x-6' : 'translate-x-1'}`} />
                </div>
              </button>
              {createIsRecurring && (
                <div className="space-y-1.5 pt-1 border-t border-gray-200">
                  <Label className="text-xs">{t('compSch.recurUntilRequired')}</Label>
                  <DateInput
                    value={createRecurringEndDate}
                    onChange={(e) => setCreateRecurringEndDate(e.target.value)}
                    min={createStartTime ? format(new Date(createStartTime), 'yyyy-MM-dd') : undefined}
                    className="rounded-xl text-sm"
                  />
                </div>
              )}
            </div>
            </div>

            {showDaySummaryAside && (
              <aside className="mt-6 lg:mt-0 space-y-4 lg:border-l border-gray-200 lg:pl-6 pt-4 lg:pt-0 border-t lg:border-t-0 shrink-0 min-w-0 w-full lg:w-auto">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">{t('compSch.selectedDay')}</p>
                  <p className="text-sm font-medium text-gray-900">
                    {format(parseISO(`${createModalDayWindows.datePart}T12:00:00`), 'yyyy-MM-dd (EEEE)', { locale: dateFnsLocale })}
                  </p>
                </div>
                <div className="rounded-xl border border-emerald-100 bg-emerald-50/70 p-3 text-sm space-y-2">
                  <p className="font-medium text-emerald-900">{t('compSch.freeTime')}</p>
                  {createModalDayWindows.windows.length > 0 ? (
                    <ul className="space-y-1 text-emerald-900">
                      {createModalDayWindows.windows.map((w, i) => (
                        <li key={i} className="flex justify-between gap-2 text-xs sm:text-sm">
                          <span className="tabular-nums">{format(w.start, 'HH:mm')}–{format(w.end, 'HH:mm')}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-amber-900 text-xs leading-relaxed">
                      {t('compSch.noFreeTimeNote')}
                    </p>
                  )}
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm space-y-2">
                  <p className="font-medium text-slate-900">{t('compSch.busyTimes')}</p>
                  {createModalDayBusySessions.length > 0 ? (
                    <ul className="space-y-2 max-h-56 overflow-y-auto pr-1">
                      {createModalDayBusySessions.map(b => (
                        <li
                          key={b.id}
                          className={cn(
                            'rounded-lg border px-2.5 py-2 text-xs leading-snug',
                            createSelectionOverlapsBusy &&
                              createStartTime &&
                              createEndTime &&
                              new Date(createStartTime).getTime() < b.end.getTime() &&
                              new Date(createEndTime).getTime() > b.start.getTime()
                              ? 'border-amber-400 bg-amber-50 text-amber-950'
                              : 'border-slate-200 bg-white text-slate-800',
                          )}
                        >
                          <span className="font-semibold tabular-nums">
                            {format(b.start, 'HH:mm')}–{format(b.end, 'HH:mm')}
                          </span>
                          <span className="block text-slate-600 mt-0.5">
                            {b.studentName}
                            {b.topic ? ` · ${b.topic}` : ''}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs text-slate-600">{t('compSch.noActiveSessionsDay')}</p>
                  )}
                </div>
                {createTutorId &&
                  createModalDayWindows.datePart &&
                  createLessonFitsAvailability === false &&
                  createModalDayWindows.windows.length > 0 && (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-950 leading-relaxed">
                      {t('compSch.outsideAvailNote')}
                    </div>
                  )}
              </aside>
            )}
          </div>
            );
          })()}

          <DialogFooter className="shrink-0 border-t border-gray-100 pt-4 mt-4 flex flex-row flex-wrap items-center justify-end gap-2 w-full">
            <Button variant="outline" className="rounded-xl" onClick={() => setIsCreateSessionOpen(false)}>{t('compSch.cancel')}</Button>
            <Button
              className="rounded-xl"
              onClick={handleCreateSession}
              disabled={saving || createSelectionOverlapsBusy || (() => {
                const selectedSubject = subjects.find(s => s.id === createSubjectId);
                const isGroupLesson = selectedSubject?.is_group;
                const hasStudents = isGroupLesson ? createStudentIds.length > 0 : !!createStudentId;
                return !createTutorId || !createSubjectId || !hasStudents || !createStartTime || !createEndTime
                  || (createIsRecurring && !createRecurringEndDate);
              })()}
            >
              {saving ? t('compSch.saving') : createIsRecurring ? t('compSch.createRecurring') : t('compSch.createLesson')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Event Detail Modal */}
      <Dialog open={isEventDetailOpen} onOpenChange={(open) => {
        setIsEventDetailOpen(open);
        if (!open) { setIsEditingSession(false); setCancelConfirmOpen(false); setCancellationReason(''); }
      }}>
        <DialogContent className="w-[95vw] sm:max-w-[440px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {isEditingSession ? (
                <><Edit2 className="w-4 h-4 text-indigo-600" /> {t('compSch.editLesson')}</>
              ) : (
                <><CalendarDays className="w-4 h-4 text-indigo-600" /> {t('compSch.lessonInfo')}</>
              )}
            </DialogTitle>
          </DialogHeader>

          {/* VIEW MODE */}
          {selectedEvent && !isEditingSession && (
            <div className="space-y-0">
              {/* Status banner */}
              <div className={`rounded-xl px-4 py-3 mb-4 flex items-center gap-3 ${
                selectedEvent.status === 'cancelled' ? 'bg-red-50 border border-red-100' :
                selectedEvent.status === 'completed' ? 'bg-gray-50 border border-gray-100' :
                'bg-indigo-50 border border-indigo-100'
              }`}>
                <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                  selectedEvent.status === 'cancelled' ? 'bg-red-500' :
                  selectedEvent.status === 'completed' ? 'bg-gray-400' : 'bg-indigo-500'
                }`} />
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm text-gray-900">
                    {format(selectedEvent.start_time, 'EEEE, d MMMM yyyy', { locale: dateFnsLocale })}
                  </p>
                  <p className="text-xs text-gray-600">
                    {format(selectedEvent.start_time, 'HH:mm')} – {format(selectedEvent.end_time, 'HH:mm')}
                    {' '}({Math.round((selectedEvent.end_time.getTime() - selectedEvent.start_time.getTime()) / 60000)} min)
                  </p>
                </div>
                <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                  selectedEvent.status === 'cancelled' ? 'bg-red-100 text-red-700' :
                  selectedEvent.status === 'completed' ? 'bg-gray-200 text-gray-700' :
                  'bg-indigo-100 text-indigo-700'
                }`}>
                  {selectedEvent.status === 'active' ? t('compSch.statusActive') : selectedEvent.status === 'cancelled' ? t('compSch.statusCancelled') : t('compSch.statusCompleted')}
                </span>
              </div>

              {selectedEvent.status === 'cancelled' && (selectedEvent as any).cancellation_reason && (
                <div className="p-3 rounded-xl bg-red-50 text-red-800 text-sm border border-red-100 mb-2">
                  <span className="font-semibold block mb-1">{t('compSch.cancellationReason')}</span>
                  {(selectedEvent as any).cancellation_reason}
                </div>
              )}

              <div className="grid grid-cols-2 gap-4 py-2">
                <div className="space-y-1">
                  <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">{t('compSch.tutor')}</p>
                  <p className="font-semibold text-gray-900 text-sm">{selectedEvent.tutor?.full_name || '–'}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">{t('compSch.student')}</p>
                  <p className="font-semibold text-gray-900 text-sm">{selectedEvent.student?.full_name || '–'}</p>
                </div>
              </div>

              {selectedEvent.topic && (
                <div className="py-2 border-t border-gray-50">
                  <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">{t('compSch.topicSubject')}</p>
                  <p className="text-sm text-gray-800">{selectedEvent.topic}</p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4 py-2 border-t border-gray-50">
                <div className="space-y-1">
                  <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">{t('compSch.priceLabel')}</p>
                  <p className="font-bold text-gray-900">{selectedEvent.price != null ? `€${selectedEvent.price}` : '–'}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">{t('compSch.payment')}</p>
                  <span className={`inline-flex items-center text-xs font-semibold px-2.5 py-1 rounded-full ${
                    selectedEvent.paid ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-amber-50 text-amber-700 border border-amber-200'
                  }`}>
                    {selectedEvent.paid ? t('compSch.paid') : t('compSch.pending')}
                  </span>
                </div>
              </div>

              {(selectedEvent as any).meeting_link && (
                <div className="py-2 border-t border-gray-50">
                  <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">{t('compSch.meetingLinkLabel')}</p>
                  <a href={(selectedEvent as any).meeting_link} target="_blank" rel="noopener noreferrer"
                    className="text-sm text-indigo-600 hover:underline truncate block">
                    {(selectedEvent as any).meeting_link}
                  </a>
                </div>
              )}

              {/* Late cancellation penalty info */}
              {(selectedEvent as any).is_late_cancelled && (
                <div className="py-2 border-t border-gray-50">
                  <div className="p-3 rounded-xl bg-red-50 border border-red-200">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700 border border-red-200">
                        {t('compSch.lateCancelBadge')}
                      </span>
                      {(selectedEvent as any).cancellation_penalty_amount != null && Number((selectedEvent as any).cancellation_penalty_amount) > 0 && (
                        <span className="text-xs font-semibold text-red-600">
                          €{Number((selectedEvent as any).cancellation_penalty_amount).toFixed(2)}
                        </span>
                      )}
                      {(selectedEvent as any).penalty_resolution && (
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                          (selectedEvent as any).penalty_resolution === 'paid' || (selectedEvent as any).penalty_resolution === 'credit_applied' ? 'bg-green-100 text-green-700' :
                          (selectedEvent as any).penalty_resolution === 'refunded' ? 'bg-blue-100 text-blue-700' :
                          (selectedEvent as any).penalty_resolution === 'invoiced' ? 'bg-amber-100 text-amber-700' :
                          'bg-gray-100 text-gray-600'
                        }`}>
                          {t(`compSch.penaltyRes_${(selectedEvent as any).penalty_resolution}` as any)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Cancel confirm inline */}
              {cancelConfirmOpen && (
                <div className="mt-3 p-4 bg-red-50 border border-red-200 rounded-xl space-y-3">
                  <p className="text-sm font-semibold text-red-800">{t('compSch.cancellationReasonRequired')}</p>
                  <Input
                    value={cancellationReason}
                    onChange={(e) => setCancellationReason(e.target.value)}
                    placeholder={t('compSch.specifyReasonPlaceholder')}
                    className="border-red-200"
                  />
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => { setCancelConfirmOpen(false); setCancellationReason(''); }}>
                      {t('compSch.back')}
                    </Button>
                    <Button size="sm" variant="destructive" onClick={handleCancelSession}
                      disabled={saving || cancellationReason.trim().length < 3}>
                      {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : t('compSch.confirmCancellation')}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* EDIT MODE */}
          {selectedEvent && isEditingSession && (
            <div className="space-y-4">
              {/* Recurring choice banner */}
              {selectedEvent.recurring_session_id && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
                  <p className="text-xs font-semibold text-amber-800 mb-2">{t('compSch.recurringSeriesPart')}</p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setGroupEditChoice('single')}
                      className={`flex-1 text-xs py-1.5 px-3 rounded-lg border font-medium transition-colors ${groupEditChoice === 'single' ? 'bg-amber-600 border-amber-600 text-white' : 'border-amber-300 text-amber-700 hover:bg-amber-100'}`}
                    >
                      {t('compSch.thisOnly')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setGroupEditChoice('all_future')}
                      className={`flex-1 text-xs py-1.5 px-3 rounded-lg border font-medium transition-colors ${groupEditChoice === 'all_future' ? 'bg-amber-600 border-amber-600 text-white' : 'border-amber-300 text-amber-700 hover:bg-amber-100'}`}
                    >
                      {t('compSch.thisAndFuture')}
                    </button>
                  </div>
                </div>
              )}

              
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>{t('compSch.start')}</Label>
                  <div
                    className="rounded-xl border border-indigo-100 bg-indigo-50/40 p-3 sm:p-4"
                    onWheel={(e) => e.stopPropagation()}
                  >
                    <DateTimeSpinner value={editStartTime} onChange={setEditStartTime} />
                  </div>
                </div>
                <div className="space-y-2 max-w-[200px]">
                  <Label>{t('compSch.durationMin')}</Label>
                  <Input
                    type="number"
                    min={15}
                    step={15}
                    value={editDurationMinutes}
                    onChange={(e) => setEditDurationMinutes(parseInt(e.target.value, 10) || 60)}
                    className="rounded-xl"
                  />
                </div>
              </div>

              {/* People */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs text-gray-500 mb-1 block">{t('compSch.tutor')}</Label>
                  <Select value={editTutorId} onValueChange={setEditTutorId}>
                    <SelectTrigger className="rounded-xl">
                      <SelectValue placeholder={t('compSch.selectPlaceholder')} />
                    </SelectTrigger>
                    <SelectContent>
                      {orgTutors.map(t => (
                        <SelectItem key={t.id} value={t.id}>{t.full_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs text-gray-500 mb-1 block">{t('compSch.student')}</Label>
                  <Select value={editStudentId} onValueChange={setEditStudentId}>
                    <SelectTrigger className="rounded-xl">
                      <SelectValue placeholder={t('compSch.selectPlaceholder')} />
                    </SelectTrigger>
                    <SelectContent>
                      {sortStudentsByFullName(students.filter(s => !editTutorId || s.tutor_id === editTutorId)).map(
                        (s) => (
                          <SelectItem key={s.id} value={s.id}>{s.full_name}</SelectItem>
                        ),
                      )}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Subject */}
              <div>
                <Label className="text-xs text-gray-500 mb-1 block">{t('compSch.subject')}</Label>
                <Select value={editSubjectId || 'none'} onValueChange={(v) => {
                  const val = v === 'none' ? '' : v;
                  setEditSubjectId(val);
                  const subj = subjects.find(s => s.id === val);
                  if (subj) { setEditTopic(subj.name); setEditPrice(subj.price); }
                }}>
                  <SelectTrigger className="rounded-xl">
                    <SelectValue placeholder={t('compSch.selectSubjectPlaceholderDots')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{t('compSch.notSpecified')}</SelectItem>
                    {subjects
                      .filter(s => !editTutorId || s.tutor_id === editTutorId)
                      .map(s => (
                        <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Topic + Price + Meeting link */}
              <div>
                <Label className="text-xs text-gray-500 mb-1 block">{t('compSch.topic')}</Label>
                <Input value={editTopic} onChange={(e) => setEditTopic(e.target.value)} placeholder={t('compSch.lessonTopicPlaceholder')} className="rounded-xl" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs text-gray-500 mb-1 block">{t('compSch.price')}</Label>
                  <Input type="number" value={editPrice} onChange={(e) => setEditPrice(parseFloat(e.target.value) || 0)} className="rounded-xl" />
                </div>
              </div>

              <div>
                <Label className="text-xs text-gray-500 mb-1 block">{t('compSch.meetingLinkLabel')}</Label>
                <Input value={editMeetingLink} onChange={(e) => setEditMeetingLink(e.target.value)} placeholder="https://..." className="rounded-xl" />
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2 border-t border-gray-100">
                <div>
                  <Label className="text-xs text-gray-500 mb-1 block">{t('compSch.status')}</Label>
                  <Select value={editStatus} onValueChange={(v) => setEditStatus(v as any)}>
                    <SelectTrigger className="rounded-xl">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">{t('compSch.statusActive')}</SelectItem>
                      <SelectItem value="completed">{t('compSch.statusCompleted')}</SelectItem>
                      <SelectItem value="cancelled">{t('compSch.statusCancelled')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-end pb-1">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editPaid}
                      onChange={(e) => setEditPaid(e.target.checked)}
                      className="w-4 h-4 rounded border-gray-300 text-indigo-600"
                    />
                    <span className="text-sm font-medium text-gray-700">{t('compSch.paidCheckbox')}</span>
                  </label>
                </div>
              </div>
            </div>
          )}

          <DialogFooter className="flex-wrap gap-2">
            {!isEditingSession ? (
              <>
                <Button variant="outline" onClick={() => setIsEventDetailOpen(false)}>{t('compSch.close')}</Button>
                {canFullControl && selectedEvent && selectedEvent.status !== 'cancelled' && !cancelConfirmOpen && (
                  <>
                    <Button
                      variant="outline"
                      onClick={handleTogglePaid}
                      disabled={saving}
                      className={selectedEvent.paid ? 'border-amber-200 text-amber-700 hover:bg-amber-50' : 'border-green-200 text-green-700 hover:bg-green-50'}
                    >
                      {selectedEvent.paid ? t('compSch.markUnpaid') : t('compSch.markPaid')}
                    </Button>
                    {selectedEvent.status === 'no_show' ? (
                      <Button
                        variant="outline"
                        onClick={() => void handleClearNoShow()}
                        disabled={saving || noShowSaving}
                        className="border-rose-200 text-rose-700 hover:bg-rose-50"
                      >
                        <RotateCcw className="w-4 h-4 mr-1" />
                        {t('dash.revertToPlannedLesson')}
                      </Button>
                    ) : (
                      <Button
                        variant="outline"
                        onClick={() => setNoShowDialogOpen(true)}
                        disabled={saving || noShowSaving}
                        className="border-rose-200 text-rose-700 hover:bg-rose-50"
                      >
                        <UserX className="w-4 h-4 mr-1" />
                        {t('common.noShow')}
                      </Button>
                    )}
                    <Button variant="outline" className="border-red-200 text-red-600 hover:bg-red-50"
                      onClick={() => setCancelConfirmOpen(true)}>
                      {t('compSch.cancelLesson')}
                    </Button>
                    <Button onClick={() => {
                      if (!selectedEvent) return;
                      const durMs = selectedEvent.end_time.getTime() - selectedEvent.start_time.getTime();
                      setEditStartTime(format(selectedEvent.start_time, "yyyy-MM-dd'T'HH:mm"));
                      setEditDurationMinutes(Math.round(durMs / 60000));
                      setEditTopic(selectedEvent.topic || '');
                      setEditMeetingLink((selectedEvent as any).meeting_link || '');
                      setEditPrice((selectedEvent as any).price || 0);
                      setEditSubjectId(selectedEvent.subject_id || '');
                      setEditStudentId(selectedEvent.student_id);
                      setEditTutorId(selectedEvent.tutor_id);
                      setEditPaid((selectedEvent as any).paid || false);
                      setEditStatus(selectedEvent.status);
                      setIsEditingSession(true);
                    }}>
                      {t('compSch.edit')}
                    </Button>
                  </>
                )}
              </>
            ) : (
              <>
                <Button variant="outline" onClick={() => setIsEditingSession(false)}>{t('compSch.back')}</Button>
                <Button onClick={handleSaveSession} disabled={saving}>
                  {saving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />{t('compSch.saving')}</> : t('compSch.save')}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Availability Edit Modal */}
      <Dialog open={isAvailabilityEditOpen} onOpenChange={(open) => {
        setIsAvailabilityEditOpen(open);
        if (!open) setEditingAvailability(null);
      }}>
        <DialogContent className="w-[95vw] sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Edit2 className="w-4 h-4 text-indigo-500" />
              {t('compSch.editFreeTime')}
            </DialogTitle>
            <DialogDescription>
              {editingAvailability?.tutor?.full_name} – {editingAvailability?.is_recurring ? t('compSch.everyDay', { day: [t('compSch.wdSun'), t('compSch.wdMon'), t('compSch.wdTue'), t('compSch.wdWed'), t('compSch.wdThu'), t('compSch.wdFri'), t('compSch.wdSat')][editingAvailability.day_of_week ?? 0] }) : editingAvailability?.specific_date}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {editingAvailability?.is_recurring && (
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label>{t('compSch.weekday')}</Label>
                  <Select value={availEditDayOfWeek} onValueChange={setAvailEditDayOfWeek}>
                    <SelectTrigger className="rounded-xl">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[
                        { v: '1', l: t('compSch.monday') },
                        { v: '2', l: t('compSch.tuesday') },
                        { v: '3', l: t('compSch.wednesday') },
                        { v: '4', l: t('compSch.thursday') },
                        { v: '5', l: t('compSch.friday') },
                        { v: '6', l: t('compSch.saturday') },
                        { v: '0', l: t('compSch.sunday') },
                      ].map(o => (
                        <SelectItem key={o.v} value={o.v}>{o.l}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>{t('compSch.repeatsUntilOptional')}</Label>
                  <DateInput
                    value={availEditEndDate}
                    onChange={(e) => setAvailEditEndDate(e.target.value)}
                    className="rounded-xl"
                  />
                </div>
              </div>
            )}

            {!editingAvailability?.is_recurring && (
              <div className="space-y-2">
                <Label>{t('compSch.dateOneTime')}</Label>
                <DateInput
                  value={availEditSpecificDate}
                  onChange={(e) => setAvailEditSpecificDate(e.target.value)}
                />
              </div>
            )}

            <div
              className="rounded-xl border border-indigo-100 bg-indigo-50/40 p-3 sm:p-4"
              onWheel={(e) => e.stopPropagation()}
            >
              <p className="text-xs text-gray-500 mb-3 text-center sm:text-left">
                {t('compSch.timeSpinnerDesc')}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1 min-w-0">
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block">{t('compSch.start')}</label>
                  <div className="flex justify-center sm:justify-start overflow-x-auto py-1">
                    <TimeSpinner value={availEditStart} onChange={setAvailEditStart} minuteStep={1} />
                  </div>
                </div>
                <div className="space-y-1 min-w-0">
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block">{t('compSch.end')}</label>
                  <div className="flex justify-center sm:justify-start overflow-x-auto py-1">
                    <TimeSpinner value={availEditEnd} onChange={setAvailEditEnd} minuteStep={1} />
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>{t('compSch.subjectsOptional')}</Label>
              <div className="border rounded-xl p-3 max-h-32 overflow-y-auto space-y-2">
                {subjects
                  .filter(s => s.tutor_id === editingAvailability?.tutor_id)
                  .map(s => (
                    <label key={s.id} className="flex items-center gap-2 text-sm cursor-pointer">
                      <Checkbox
                        checked={availEditSubjectIds.includes(s.id)}
                        onChange={(e) => {
                          const next = e.target.checked
                            ? Array.from(new Set([...availEditSubjectIds, s.id]))
                            : availEditSubjectIds.filter(id => id !== s.id);
                          setAvailEditSubjectIds(next);
                        }}
                      />
                      <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: s.color }} />
                      <span>{s.name}</span>
                    </label>
                  ))}
                {subjects.filter(s => s.tutor_id === editingAvailability?.tutor_id).length === 0 && (
                  <p className="text-xs text-gray-400">{t('compSch.tutorNoSubjects')}</p>
                )}
              </div>
            </div>
          </div>
            {/* Create session from this slot */}
            <div className="border-t border-gray-100 pt-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-semibold text-gray-700">{t('compSch.addStudentInSlot')}</p>
                <button
                  type="button"
                  onClick={() => setCreateFromAvailOpen(v => !v)}
                  className="text-xs text-indigo-600 hover:underline"
                >
                  {createFromAvailOpen ? t('compSch.cancel') : t('compSch.add')}
                </button>
              </div>
              {createFromAvailOpen && (
                <div className="space-y-3 p-3 bg-indigo-50 border border-indigo-100 rounded-xl">
                  <div className="space-y-1.5">
                    <Label className="text-xs">{t('compSch.subject')}</Label>
                    <Select value={createFromAvailSubjectId || 'none'} onValueChange={(v) => setCreateFromAvailSubjectId(v === 'none' ? '' : v)}>
                      <SelectTrigger className="rounded-xl h-9 text-sm">
                        <SelectValue placeholder={t('compSch.selectSubjectPlaceholderDots')} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">{t('compSch.notSpecified')}</SelectItem>
                        {subjects
                          .filter(s => s.tutor_id === editingAvailability?.tutor_id)
                          .map(s => (
                            <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs">{t('compSch.time')}</Label>
                    <Select value={createFromAvailSelectedSlot || ''} onValueChange={setCreateFromAvailSelectedSlot}>
                      <SelectTrigger className="rounded-xl h-9 text-sm">
                        <SelectValue placeholder={t('compSch.selectTimePlaceholder')} />
                      </SelectTrigger>
                      <SelectContent>
                        {createFromAvailSlots.map((slot) => (
                          <SelectItem key={slot.startIso} value={slot.startIso}>
                            {slot.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {(() => {
                    const selectedSubject = subjects.find(s => s.id === createFromAvailSubjectId);
                    const isGroup = Boolean(selectedSubject?.is_group);
                    return isGroup ? (
                      <div className="space-y-1.5">
                        <Label className="text-xs">{t('compSch.studentsGroup')}</Label>
                        <div className="border border-indigo-200 rounded-lg bg-white p-2 max-h-36 overflow-y-auto space-y-1.5">
                          {sortStudentsByFullName(
                            students.filter(s => s.tutor_id === editingAvailability?.tutor_id),
                          ).map(s => (
                              <label key={s.id} className="flex items-center gap-2 text-sm cursor-pointer">
                                <Checkbox
                                  checked={createFromAvailStudentIds.includes(s.id)}
                                  onChange={(e) => {
                                    const checked = (e.target as HTMLInputElement).checked;
                                    if (checked) setCreateFromAvailStudentIds(prev => Array.from(new Set([...prev, s.id])));
                                    else setCreateFromAvailStudentIds(prev => prev.filter(id => id !== s.id));
                                  }}
                                />
                                <span>{s.full_name}</span>
                              </label>
                            ))}
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-1.5">
                        <Label className="text-xs">{t('compSch.studentRequired')}</Label>
                        <Select value={createFromAvailStudentId} onValueChange={setCreateFromAvailStudentId}>
                          <SelectTrigger className="rounded-xl h-9 text-sm">
                            <SelectValue placeholder={t('compSch.selectStudentPlaceholderDots')} />
                          </SelectTrigger>
                          <SelectContent>
                            {sortStudentsByFullName(
                              students.filter(s => s.tutor_id === editingAvailability?.tutor_id),
                            ).map(s => (
                                <SelectItem key={s.id} value={s.id}>{s.full_name}</SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                      </div>
                    );
                  })()}

                  <div className="space-y-1.5">
                    <Label className="text-xs">{t('compSch.topicOptional')}</Label>
                    <Input
                      value={createFromAvailTopic}
                      onChange={(e) => setCreateFromAvailTopic(e.target.value)}
                      placeholder={t('compSch.lessonTopicPlaceholder')}
                      className="rounded-xl h-9 text-sm"
                    />
                  </div>
                  <Button
                    size="sm"
                    className="w-full rounded-xl bg-indigo-600 hover:bg-indigo-700"
                    onClick={handleCreateSessionFromAvailability}
                    disabled={createFromAvailSaving}
                  >
                    {createFromAvailSaving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />{t('compSch.creating')}</> : t('compSch.createLesson')}
                  </Button>
                </div>
              )}
            </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAvailabilityEditOpen(false)}>{t('compSch.cancel')}</Button>
            <Button onClick={handleSaveAvailability} disabled={availEditSaving}>
              {availEditSaving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />{t('compSch.saving')}</> : t('compSch.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Create Availability Modal */}
      <Dialog open={isCreateAvailabilityOpen} onOpenChange={setIsCreateAvailabilityOpen}>
        <DialogContent className="w-[95vw] sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('compSch.addFreeTime')}</DialogTitle>
            <DialogDescription>{t('compSch.addFreeTimeDesc')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>{t('compSch.tutorRequired')}</Label>
              <Select value={createAvailTutorId} onValueChange={setCreateAvailTutorId}>
                <SelectTrigger className="rounded-xl mt-1">
                  <SelectValue placeholder={t('compSch.selectPlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  {orgTutors.map(t => (
                    <SelectItem key={t.id} value={t.id}>{t.full_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setCreateAvailIsRecurring(true)}
                className={`flex-1 py-2 px-3 rounded-xl border text-sm font-medium transition-colors ${createAvailIsRecurring ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}
              >
                {t('compSch.recurring')}
              </button>
              <button
                type="button"
                onClick={() => setCreateAvailIsRecurring(false)}
                className={`flex-1 py-2 px-3 rounded-xl border text-sm font-medium transition-colors ${!createAvailIsRecurring ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}
              >
                {t('compSch.oneTime')}
              </button>
            </div>

            {createAvailIsRecurring ? (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>{t('compSch.weekday')}</Label>
                  <Select value={createAvailDayOfWeek} onValueChange={setCreateAvailDayOfWeek}>
                    <SelectTrigger className="rounded-xl">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[{ v: '1', l: t('compSch.monday') }, { v: '2', l: t('compSch.tuesday') }, { v: '3', l: t('compSch.wednesday') }, { v: '4', l: t('compSch.thursday') }, { v: '5', l: t('compSch.friday') }, { v: '6', l: t('compSch.saturday') }, { v: '0', l: t('compSch.sunday') }].map(o => (
                        <SelectItem key={o.v} value={o.v}>{o.l}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>{t('compSch.repeatsUntil')}</Label>
                  <DateInput value={createAvailEndDate} onChange={(e) => setCreateAvailEndDate(e.target.value)} className="rounded-xl" />
                </div>
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label>{t('compSch.date')}</Label>
                <DateInput value={createAvailSpecificDate} onChange={(e) => setCreateAvailSpecificDate(e.target.value)} className="rounded-xl" />
              </div>
            )}

            <div
              className="rounded-xl border border-indigo-100 bg-indigo-50/40 p-3 sm:p-4"
              onWheel={(e) => e.stopPropagation()}
            >
              <p className="text-xs text-gray-500 mb-3 text-center sm:text-left">
                {t('compSch.timeSpinnerDescShort')}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1 min-w-0">
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block">{t('compSch.start')}</label>
                  <div className="flex justify-center sm:justify-start overflow-x-auto py-1">
                    <TimeSpinner value={createAvailStart} onChange={setCreateAvailStart} minuteStep={1} />
                  </div>
                </div>
                <div className="space-y-1 min-w-0">
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block">{t('compSch.end')}</label>
                  <div className="flex justify-center sm:justify-start overflow-x-auto py-1">
                    <TimeSpinner value={createAvailEnd} onChange={setCreateAvailEnd} minuteStep={1} />
                  </div>
                </div>
              </div>
            </div>

            {createAvailTutorId && (
              <div className="space-y-1.5">
                <Label>{t('compSch.subjectsOptional')}</Label>
                <div className="border rounded-xl p-3 max-h-32 overflow-y-auto space-y-2">
                  {subjects.filter(s => s.tutor_id === createAvailTutorId).map(s => (
                    <label key={s.id} className="flex items-center gap-2 text-sm cursor-pointer">
                      <input
                        type="checkbox"
                        checked={createAvailSubjectIds.includes(s.id)}
                        onChange={(e) => {
                          if (e.target.checked) setCreateAvailSubjectIds(prev => [...prev, s.id]);
                          else setCreateAvailSubjectIds(prev => prev.filter(id => id !== s.id));
                        }}
                        className="w-4 h-4 rounded border-gray-300 text-indigo-600"
                      />
                      <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: s.color }} />
                      <span className="flex-1">{s.name}</span>
                      <span className="text-gray-400 text-xs ml-auto">{t('compSch.classAbbr', { price: String(s.price) })}{s.grade_min ? ` · ${s.grade_min}–${s.grade_max ?? s.grade_min} kl.` : ''}</span>
                    </label>
                  ))}
                  {subjects.filter(s => s.tutor_id === createAvailTutorId).length === 0 && (
                    <p className="text-xs text-gray-400">{t('compSch.tutorNoSubjects')}</p>
                  )}
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateAvailabilityOpen(false)}>{t('compSch.cancel')}</Button>
            <Button onClick={handleCreateAvailability} disabled={createAvailSaving || !createAvailTutorId}>
              {createAvailSaving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />{t('compSch.creating')}</> : t('compSch.create')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <MarkStudentNoShowDialog
        open={noShowDialogOpen && !!selectedEvent}
        onOpenChange={(open) => {
          setNoShowDialogOpen(open);
        }}
        sessionStart={selectedEvent ? new Date(selectedEvent.start_time) : new Date()}
        sessionEnd={selectedEvent ? new Date(selectedEvent.end_time) : new Date()}
        saving={noShowSaving}
        onConfirm={(w) => void confirmMarkStudentNoShowSchedule(w)}
      />
      <FindTutorModal isOpen={findLessonOpen} onClose={() => setFindLessonOpen(false)} orgId={organizationId} />
    </>
  );
}
