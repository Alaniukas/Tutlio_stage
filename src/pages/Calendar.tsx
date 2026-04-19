import { useEffect, useState, useCallback, useMemo } from 'react';
import { Calendar as BigCalendar, dateFnsLocalizer, Views } from 'react-big-calendar';
import type { View } from 'react-big-calendar';
import {
  format,
  parse,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  startOfDay,
  endOfDay,
  getDay,
  addHours,
  addDays,
  isBefore,
  isAfter,
  addWeeks,
  addMonths,
  parseISO,
} from 'date-fns';
import { lt } from 'date-fns/locale';
import { enUS } from 'date-fns/locale';
import 'react-big-calendar/lib/css/react-big-calendar.css';

import Layout from '@/components/Layout';
import { useTranslation } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';
import { useUser } from '@/contexts/UserContext';
import { sendEmail } from '@/lib/email';
import { authHeaders } from '@/lib/apiHelpers';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import StatusBadge from '@/components/StatusBadge';
import { buildNoShowSessionPatch, defaultNoShowWhenForNow } from '@/lib/noShowWhen';
import type { NoShowWhen } from '@/lib/noShowWhen';
import { noShowWhenLabelLt } from '@/lib/noShowWhen';
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
import { cn, normalizeUrl } from '@/lib/utils';
import TimeSpinner, { DateTimeSpinner } from '@/components/TimeSpinner';
import AvailabilityManager from '@/components/AvailabilityManager';
import SessionFiles from '@/components/SessionFiles';
import {
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  LayoutGrid,
  List,
  Plus,
  Settings2,
  Clock,
  CheckCircle,
  XCircle,
  Wallet,
  ArrowRight,
  Edit2,
  AlertCircle,
  CreditCard,
  Loader2,
  Trash2,
  Users,
  UserX,
  RotateCcw,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { cancelSessionAndFillWaitlist } from '@/lib/lesson-actions';
import { recurringAvailabilityAppliesOnDate } from '@/lib/availabilityRecurring';
import { useOrgTutorPolicy } from '@/hooks/useOrgTutorPolicy';
import { useOrgFeatures } from '@/hooks/useOrgFeatures';
import { formatContactForTutorView } from '@/lib/orgContactVisibility';
import Toast from '@/components/Toast';

const locales = { lt, en: enUS };

const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek,
  getDay,
  locales,
});

interface Session {
  id: string;
  tutor_id: string;
  student_id: string;
  start_time: Date;
  end_time: Date;
  status: 'active' | 'cancelled' | 'completed' | 'no_show';
  paid: boolean;
  meeting_link?: string;
  cancellation_reason?: string;
  cancelled_at?: string;
  topic?: string;
  price?: number;
  payment_status?: string;
  tutor_comment?: string;
  show_comment_to_student?: boolean;
  hidden_from_calendar?: boolean;
  subject_id?: string;
  subjects?: { name?: string | null; is_trial?: boolean } | null;
  available_spots?: number | null;
  recurring_session_id?: string | null;
  student?: {
    full_name: string;
    email?: string;
    phone?: string;
    payer_email?: string;
    payer_phone?: string;
    grade?: string;
  };
}

interface Student {
  id: string;
  full_name: string;
  grade?: string;
  email?: string;
  payment_payer?: string | null;
  payer_email?: string | null;
  payment_model?: string | null;
}

interface Subject {
  id: string;
  name: string;
  duration_minutes: number;
  price: number;
  color: string;
  meeting_link?: string;
  grade_min?: number | null;
  grade_max?: number | null;
  is_group?: boolean;
  max_students?: number | null;
}

interface Availability {
  id: string;
  day_of_week: number | null;
  start_time: string;
  end_time: string;
  meeting_link?: string | null;
  is_recurring: boolean;
  specific_date: string | null;
  end_date?: string | null;
  /** If set — from this day (inclusive); otherwise from created_at */
  start_date?: string | null;
  created_at?: string | null;
  subject_ids?: string[];
}

function parseStudentGrade(grade: string | null | undefined): number {
  if (!grade) return 1; // Default to grade 1 if not specified
  if (grade.toLowerCase().includes('studentas')) return 13;
  const match = grade.match(/(\d+)/);
  return match ? parseInt(match[1]) : 1;
}

export default function CalendarPage() {
  const { t, locale, dateFnsLocale } = useTranslation();
  const navigate = useNavigate();
  const orgPolicy = useOrgTutorPolicy();
  const { contactVisibility } = useOrgFeatures();
  const [toastMessage, setToastMessage] = useState<{ message: string; type: 'success' | 'error' | 'warning' } | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [individualPricing, setIndividualPricing] = useState<any[]>([]);
  const [tutorSubjectPrices, setTutorSubjectPrices] = useState<any[]>([]);
  const [calOrgSubjectTemplates, setCalOrgSubjectTemplates] = useState<{ id: string; name: string }[]>([]);
  const [availability, setAvailability] = useState<Availability[]>([]);
  const [loading, setLoading] = useState(true);
  const [stripeConnected, setStripeConnected] = useState(false);
  const [isOrgTutor, setIsOrgTutor] = useState(false);

  // Google Calendar state
  const [googleCalendarConnected, setGoogleCalendarConnected] = useState(false);
  const [googleCalendarSyncing, setGoogleCalendarSyncing] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  // Calendar view & date state – default to day view on mobile
  const [currentView, setCurrentView] = useState<View>(
    typeof window !== 'undefined' && window.innerWidth < 768 ? Views.DAY : Views.WEEK
  );
  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const [calendarExpanded, setCalendarExpanded] = useState(false);

  // Modal states
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEventModalOpen, setIsEventModalOpen] = useState(false);
  const [isDeleteRecurringDialogOpen, setIsDeleteRecurringDialogOpen] = useState(false);
  const handleEventModalOpenChange = (open: boolean) => {
    setIsEventModalOpen(open);
    if (!open) {
      setCancelConfirmId(null);
      setIsEditingSession(false);
      setGroupEditChoice(null);
      setGroupCancelChoice(null);
    }
  };
  const [isAvailabilityModalOpen, setIsAvailabilityModalOpen] = useState(false);
  const [isUpcomingListModalOpen, setIsUpcomingListModalOpen] = useState(false);
  const [isCancelledListModalOpen, setIsCancelledListModalOpen] = useState(false);
  const [isMassCancelModalOpen, setIsMassCancelModalOpen] = useState(false);

  // BigCalendar Setup
  const [selectedSlot, setSelectedSlot] = useState<{ start: Date; end: Date } | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<Session | null>(null);
  const [selectedGroupSessions, setSelectedGroupSessions] = useState<Session[]>([]);
  const [isGroupSession, setIsGroupSession] = useState(false);
  const [cancelConfirmId, setCancelConfirmId] = useState<string | null>(null);

  // Form states
  const [selectedStudentId, setSelectedStudentId] = useState<string>('');
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]); // For group lessons
  const [selectedSubjectId, setSelectedSubjectId] = useState<string>('');
  const [meetingLink, setMeetingLink] = useState('');
  const [topic, setTopic] = useState('');
  const [price, setPrice] = useState<number>(25);
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [saving, setSaving] = useState(false);
  const [noShowSavingId, setNoShowSavingId] = useState<string | null>(null);
  const [newSessionId, setNewSessionId] = useState<string | null>(null);
  const [newTutorComment, setNewTutorComment] = useState('');
  const [newShowCommentToStudent, setNewShowCommentToStudent] = useState(false);
  const [cancellationReason, setCancellationReason] = useState('');

  // Mass cancel states
  const [massCancelStartDate, setMassCancelStartDate] = useState('');
  const [massCancelEndDate, setMassCancelEndDate] = useState('');
  const [massCancelPreviewSessions, setMassCancelPreviewSessions] = useState<Session[]>([]);
  const [massCancellationReason, setMassCancellationReason] = useState('');
  const [massCancelPreviewMode, setMassCancelPreviewMode] = useState(false);
  const [massCancelLoading, setMassCancelLoading] = useState(false);
  const [massCancelError, setMassCancelError] = useState<string | null>(null);
  const [isEditingSession, setIsEditingSession] = useState(false);
  const [editNewStartTime, setEditNewStartTime] = useState('');
  const [editDurationMinutes, setEditDurationMinutes] = useState<number>(60);
  const [editTopic, setEditTopic] = useState('');
  const [editMeetingLink, setEditMeetingLink] = useState('');
  const [editTutorComment, setEditTutorComment] = useState('');
  const [editShowCommentToStudent, setEditShowCommentToStudent] = useState(false);
  const [isPaid, setIsPaid] = useState(false);

  // View-mode comment (visible when opening session without "Redaguoti")
  const [viewCommentText, setViewCommentText] = useState('');
  const [viewShowToStudent, setViewShowToStudent] = useState(false);
  const [forceTrialCommentVisibility, setForceTrialCommentVisibility] = useState(false);
  const [viewCommentSaving, setViewCommentSaving] = useState(false);

  // Recurring session
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurringEndDate, setRecurringEndDate] = useState('');
  const [recurringFrequency, setRecurringFrequency] = useState<'weekly' | 'biweekly' | 'monthly'>('weekly');
  const [selectedWeekdays, setSelectedWeekdays] = useState<number[]>([]);

  // Waitlist prompt
  // Removed: showWaitlistPrompt (auto-fill is now automatic)

  // Availability slot edit
  const [isSlotEditOpen, setIsSlotEditOpen] = useState(false);
  const [editingSlot, setEditingSlot] = useState<{ ruleId: string; ruleStart: string; ruleEnd: string; ruleIsRecurring: boolean; ruleDate: string | null; ruleDayOfWeek: number | null; blockStart: Date; subjectIds: string[]; meetingLink?: string | null } | null>(null);
  const [slotEditStart, setSlotEditStart] = useState('');
  const [slotEditEnd, setSlotEditEnd] = useState('');
  const [slotEditSubjects, setSlotEditSubjects] = useState<string[]>([]);
  const [slotEditMeetingLink, setSlotEditMeetingLink] = useState('');
  const [slotSaving, setSlotSaving] = useState(false);

  // Assign student to availability slot
  const [isAssignStudentOpen, setIsAssignStudentOpen] = useState(false);
  const [assignStudentId, setAssignStudentId] = useState<string>('');
  const [assignStudentIds, setAssignStudentIds] = useState<string[]>([]); // For group lessons
  const [assignSubjectId, setAssignSubjectId] = useState<string>('');
  const [assignAvailableSlots, setAssignAvailableSlots] = useState<string[]>([]);
  const [assignSelectedSlot, setAssignSelectedSlot] = useState<string>('');
  const [assignDuration, setAssignDuration] = useState<number>(60);
  const [assignMeetingLink, setAssignMeetingLink] = useState<string>('');
  const [assignTopic, setAssignTopic] = useState<string>('');
  const [assignSaving, setAssignSaving] = useState(false);

  // Add student to group lesson states
  const [isAddToGroupOpen, setIsAddToGroupOpen] = useState(false);
  const [addToGroupStudentIds, setAddToGroupStudentIds] = useState<string[]>([]);
  const [addToGroupChoice, setAddToGroupChoice] = useState<'single' | 'all_future'>('single');

  // Group edit/cancel choice states
  const [groupEditChoice, setGroupEditChoice] = useState<'single' | 'all_future' | null>(null);
  const [groupCancelChoice, setGroupCancelChoice] = useState<'single' | 'all_future' | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  // Set default dates when mass cancel modal opens
  useEffect(() => {
    if (isMassCancelModalOpen) {
      const today = new Date();
      const thirtyDaysFromNow = addDays(today, 30);
      setMassCancelStartDate(format(today, 'yyyy-MM-dd'));
      setMassCancelEndDate(format(thirtyDaysFromNow, 'yyyy-MM-dd'));
      setMassCancelPreviewMode(false);
      setMassCancelPreviewSessions([]);
      setMassCancellationReason('');
      setMassCancelError(null);
    }
  }, [isMassCancelModalOpen]);

  // Check for Google Calendar OAuth callback
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const gcalConnected = params.get('gcal_connected');
    const gcalError = params.get('gcal_error');

    if (gcalConnected === 'true') {
      setGoogleCalendarConnected(true);
      alert(t('cal.googleConnected'));
      // Clean up URL
      window.history.replaceState({}, '', '/calendar');
    } else if (gcalError) {
      alert(`${t('cal.failedToConnect')}: ${gcalError}`);
      window.history.replaceState({}, '', '/calendar');
    }
  }, []);

  // Sync view comment fields when opening a session (so comment is visible and editable in view mode)
  useEffect(() => {
    let cancelled = false;
    if (!selectedEvent) return;
    setViewCommentText(selectedEvent.tutor_comment ?? '');
    setViewShowToStudent(selectedEvent.show_comment_to_student ?? false);
    setForceTrialCommentVisibility(false);

    (async () => {
      const subjectId = (selectedEvent as any)?.subject_id as string | null | undefined;
      if (!subjectId) return;
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: tutorProfile } = await supabase
        .from('profiles')
        .select('organization_id')
        .eq('id', user.id)
        .maybeSingle();
      const orgId = (tutorProfile as any)?.organization_id as string | null | undefined;
      if (!orgId) return;
      const [{ data: orgRow }, { data: subjRow }] = await Promise.all([
        supabase.from('organizations').select('features').eq('id', orgId).maybeSingle(),
        supabase.from('subjects').select('is_trial').eq('id', subjectId).maybeSingle(),
      ]);
      const feat = (orgRow as any)?.features;
      const featObj = feat && typeof feat === 'object' && !Array.isArray(feat) ? (feat as Record<string, unknown>) : {};
      const shouldForce = featObj['trial_lesson_comment_mode'] === 'student_and_parent' && (subjRow as any)?.is_trial === true;
      if (!cancelled && shouldForce) {
        setForceTrialCommentVisibility(true);
        setViewShowToStudent(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedEvent?.id]);

  const fetchData = async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }
    setCurrentUserId(user.id);

    // Use UserContext profile instead of fetching again
    const { data: profileData } = await supabase
      .from('profiles')
      .select('stripe_account_id, google_calendar_connected, organization_id')
      .eq('id', user.id)
      .single();
    setIsOrgTutor(!!profileData?.organization_id);
    setStripeConnected(!!profileData?.stripe_account_id);
    setGoogleCalendarConnected(!!profileData?.google_calendar_connected);

    // Auto-hide cancelled sessions older than 12 hours (client-side)
    const now = new Date();
    const twelveHoursAgo = new Date(now.getTime() - 12 * 60 * 60 * 1000);

    // Find sessions to auto-hide
    const { data: toHide } = await supabase
      .from('sessions')
      .select('id')
      .eq('tutor_id', user.id)
      .eq('status', 'cancelled')
      .eq('hidden_from_calendar', false)
      .lt('cancelled_at', twelveHoursAgo.toISOString());

    // Auto-hide them
    if (toHide && toHide.length > 0) {
      await supabase
        .from('sessions')
        .update({ hidden_from_calendar: true })
        .in('id', toHide.map(s => s.id));
    }

    // Fetch sessions (excluding hidden ones)
    // Note: Use .not() instead of .eq(false) to include NULL values (for backwards compatibility)
    const { data: sessionsData } = await supabase
      .from('sessions')
      .select('*, student:students(full_name, email, phone, payer_email, payer_phone, grade)')
      .eq('tutor_id', user.id)
      .not('hidden_from_calendar', 'eq', true)
      .limit(1000);

    const parsedSessions = (sessionsData || []).map((session: any) => ({
      ...session,
      start_time: new Date(session.start_time),
      end_time: new Date(session.end_time),
    }));
    setSessions(parsedSessions);

    const { data: studentsData } = await supabase
      .from('students')
      .select('id, full_name, grade, email, payment_payer, payer_email, payment_model')
      .eq('tutor_id', user.id);
    setStudents(studentsData || []);

    const { data: subjectsData } = await supabase
      .from('subjects')
      .select('id, name, duration_minutes, price, color, meeting_link, grade_min, grade_max, is_group, max_students')
      .eq('tutor_id', user.id);
    setSubjects(subjectsData || []);

    // Fetch individual pricing for all students - batch fetch (GOOD, keep it)
    const { data: pricingData } = await supabase
      .from('student_individual_pricing')
      .select('*')
      .eq('tutor_id', user.id);
    setIndividualPricing(pricingData || []);

    const { data: tspData } = await supabase
      .from('tutor_subject_prices')
      .select('*')
      .eq('tutor_id', user.id);
    setTutorSubjectPrices(tspData || []);

    if (profileData?.organization_id) {
      const { data: orgRow } = await supabase.from('organizations').select('org_subject_templates').eq('id', profileData.organization_id).maybeSingle();
      const tpl = (orgRow as any)?.org_subject_templates;
      if (Array.isArray(tpl)) {
        setCalOrgSubjectTemplates(tpl.filter((t: any) => t?.id && t?.name).map((t: any) => ({ id: t.id, name: String(t.name).trim() })));
      }
    }

    const { data: av } = await supabase
      .from('availability')
      .select('*')
      .eq('tutor_id', user.id);
    setAvailability(av || []);

    setLoading(false);
  };

  const getTutorSubjectPrice = useCallback((subjectName: string | null | undefined) => {
    if (!subjectName) return undefined;
    const tpl = calOrgSubjectTemplates.find(t => t.name.toLowerCase() === subjectName.toLowerCase());
    if (!tpl) return undefined;
    return tutorSubjectPrices.find((p: any) => p.org_subject_template_id === tpl.id);
  }, [calOrgSubjectTemplates, tutorSubjectPrices]);

  // Filter subjects based on selected student's grade
  const filteredSubjects = useMemo(() => {
    if (!selectedStudentId || !subjects.length) {
      return subjects;
    }

    const selectedStudent = students.find(s => s.id === selectedStudentId);
    if (!selectedStudent || !selectedStudent.grade) {
      return subjects;
    }

    const studentGrade = parseStudentGrade(selectedStudent.grade);

    const filtered = subjects.filter(subject => {
      if (!subject.grade_min || !subject.grade_max) return true;
      return studentGrade >= subject.grade_min && studentGrade <= subject.grade_max;
    });

    return filtered;
  }, [selectedStudentId, students, subjects]);

  // Subjects available in "assign student to slot" flow
  const assignFilteredSubjects = useMemo(() => {
    // If no student selected, return all subjects (for new flow where subject comes first)
    if (!assignStudentId) {
      // Still apply slot subject_ids filter if available
      if (editingSlot?.subjectIds?.length) {
        return subjects.filter(subj => editingSlot.subjectIds!.includes(subj.id));
      }
      return subjects;
    }

    const student = students.find(s => s.id === assignStudentId);
    const studentGrade = parseStudentGrade(student?.grade);

    return subjects.filter(subj => {
      // Grade check (only when subject range is explicitly set)
      if (subj.grade_min != null && subj.grade_max != null) {
        if (studentGrade < subj.grade_min || studentGrade > subj.grade_max) {
          return false;
        }
      }

      // Slot subject_ids check (if slot was restricted to specific subjects)
      if (editingSlot?.subjectIds?.length) {
        return editingSlot.subjectIds.includes(subj.id);
      }

      return true;
    });
  }, [assignStudentId, students, subjects, editingSlot]);

  const backgroundEvents = useMemo(() => {
    const generated: any[] = [];
    if (!availability.length) return generated;

    // Entire visible calendar grid (month = full weeks including adjacent months' days),
    // not a narrow window from currentDate — otherwise free time disappears for half the month's days.
    const weekOpts = { weekStartsOn: 1 as const };
    let rangeStart: Date;
    let rangeEndExclusive: Date;
    if (currentView === Views.MONTH) {
      rangeStart = startOfDay(startOfWeek(startOfMonth(currentDate), weekOpts));
      rangeEndExclusive = addDays(startOfDay(endOfWeek(endOfMonth(currentDate), weekOpts)), 1);
    } else if (currentView === Views.WEEK) {
      rangeStart = startOfDay(startOfWeek(currentDate, weekOpts));
      rangeEndExclusive = addDays(startOfDay(endOfWeek(currentDate, weekOpts)), 1);
    } else {
      rangeStart = startOfDay(currentDate);
      rangeEndExclusive = addDays(rangeStart, 1);
    }

    for (let d = rangeStart; d < rangeEndExclusive; d = addDays(d, 1)) {
      const dayOfWeek = d.getDay();
      const dateStr = format(d, 'yyyy-MM-dd');

      const rules = availability.filter((a) => {
        if (a.is_recurring && a.day_of_week !== null) {
          return recurringAvailabilityAppliesOnDate(a, dateStr, dayOfWeek);
        }
        if (!a.is_recurring && a.specific_date === dateStr) return true;
        return false;
      });

      rules.forEach(rule => {
        let startHour = parseInt(rule.start_time.split(':')[0]);
        const startMin = parseInt(rule.start_time.split(':')[1] || '0');
        const endHour = parseInt(rule.end_time.split(':')[0]);
        const endMin = parseInt(rule.end_time.split(':')[1] || '0');

        // Create the full continuous block as a single background event
        const slotStart = new Date(d);
        slotStart.setHours(startHour, startMin, 0, 0);

        const slotEnd = new Date(d);
        slotEnd.setHours(endHour, endMin, 0, 0);

        // Slicing logic: subtract overlapping scheduled sessions
        let freeBlocks = [{ start: slotStart, end: slotEnd }];

        const overlappingSessions = sessions.filter(s =>
          s.status !== 'cancelled' &&
          s.start_time < slotEnd &&
          s.end_time > slotStart
        );

        overlappingSessions.forEach(session => {
          const newFreeBlocks: { start: Date; end: Date }[] = [];
          freeBlocks.forEach(freeBlock => {
            // Check for overlap
            if (session.start_time < freeBlock.end && session.end_time > freeBlock.start) {
              // Free time before the session
              if (session.start_time > freeBlock.start) {
                newFreeBlocks.push({ start: freeBlock.start, end: session.start_time });
              }
              // Free time after the session
              if (session.end_time < freeBlock.end) {
                newFreeBlocks.push({ start: session.end_time, end: freeBlock.end });
              }
            } else {
              newFreeBlocks.push(freeBlock);
            }
          });
          freeBlocks = newFreeBlocks;
        });

        // Add the resulting sliced blocks as background events
        freeBlocks.forEach(block => {
          if (block.end.getTime() - block.start.getTime() > 0) {
            generated.push({
              start_time: block.start,
              end_time: block.end,
              status: 'availability_block',
              isBackground: true,
              ruleId: rule.id,
              ruleStart: rule.start_time,
              ruleEnd: rule.end_time,
              ruleIsRecurring: rule.is_recurring,
              ruleDate: rule.specific_date,
              ruleDayOfWeek: rule.day_of_week,
              ruleSubjectIds: rule.subject_ids || [],
              ruleMeetingLink: rule.meeting_link || '',
            });
          }
        });
      });
    }
    return generated;
  }, [availability, currentDate, currentView, sessions]);

  // Helper function to merge group lesson sessions
  const mergeGroupSessions = useCallback((sessions: Session[]) => {
    const grouped = new Map<string, Session[]>();
    const individual: Session[] = [];

    // Group sessions by time + subject for group lessons
    sessions.forEach(session => {
      const subject = subjects.find(s => s.id === session.subject_id);
      if (subject?.is_group) {
        const key = `${session.start_time.getTime()}_${session.end_time.getTime()}_${session.subject_id}`;
        if (!grouped.has(key)) {
          grouped.set(key, []);
        }
        grouped.get(key)!.push(session);
      } else {
        individual.push(session);
      }
    });

    // Create merged events for groups
    const mergedGroups: Session[] = [];
    grouped.forEach((groupSessions, key) => {
      if (groupSessions.length > 0) {
        const first = groupSessions[0];
        const subject = subjects.find(s => s.id === first.subject_id);
        const studentNames = groupSessions.map(s => s.student?.full_name || 'N/A').join(', ');
        const allPaid = groupSessions.every(s => s.paid);
        const somePaid = groupSessions.some(s => s.paid);
        const paidCount = groupSessions.filter(s => s.paid).length;

        // For single-student group lessons, show with clear indication it's a group lesson
        const displayTopic = groupSessions.length === 1
          ? `${first.topic || t('cal.groupLesson')} (1/${subject?.max_students || 1} ${t('cal.seatsMany')})`
          : `${first.topic || t('cal.groupLesson')}: ${studentNames}`;

        mergedGroups.push({
          ...first,
          id: `group_${key}`, // Unique ID for the group
          topic: displayTopic,
          student: {
            full_name: `${groupSessions.length}/${subject?.max_students || groupSessions.length} ${t('cal.seatsMany')}${
              !orgPolicy.isOrgTutor && somePaid
                ? ` (${t('cal.paidCount', { count: String(paidCount) })})`
                : ''
            }`,
          },
          // Store original sessions for modal access
          _groupSessions: groupSessions,
          _isGroup: true,
        } as any);
      }
    });

    return [...individual, ...mergedGroups];
  }, [subjects, orgPolicy.isOrgTutor]);

  const mergedSessions = useMemo(() => mergeGroupSessions(sessions), [sessions, mergeGroupSessions]);

  const allEvents = useMemo(() => {
    return [...mergedSessions, ...backgroundEvents];
  }, [mergedSessions, backgroundEvents]);

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

    const relevant = allEvents.filter(ev => {
      const s = new Date(ev.start_time);
      const e = new Date(ev.end_time);
      return s.getTime() < rangeEnd.getTime() && e.getTime() > rangeStart.getTime();
    });

    if (relevant.length === 0) {
      return { min: defaultMin, max: defaultMax, scrollToTime: defaultScroll };
    }

    let minH = 24;
    let maxH = 0;
    relevant.forEach(ev => {
      const s = new Date(ev.start_time);
      const e = new Date(ev.end_time);
      minH = Math.min(minH, s.getHours());
      const eH = e.getHours() + (e.getMinutes() > 0 ? 1 : 0);
      maxH = Math.max(maxH, eH);
    });

    const floorH = Math.min(minH, 7);
    const ceilH = Math.max(maxH, 21);
    const min = new Date(1970, 0, 1, floorH, 0, 0);
    const max = new Date(1970, 0, 1, Math.min(23, ceilH), 59, 0);
    const scrollToTime = new Date(1970, 0, 1, Math.max(floorH, Math.min(minH, 7)), 0, 0);

    return { min, max, scrollToTime };
  }, [allEvents, currentDate, currentView]);

  // Google Calendar handlers
  const handleGoogleCalendarConnect = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Redirect to Google OAuth
    window.location.href = `/api/google-calendar-auth?userId=${user.id}`;
  };

  const handleGoogleCalendarDisconnect = async () => {
    if (!confirm(t('cal.googleDisconnectConfirm'))) {
      return;
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    setGoogleCalendarSyncing(true);
    try {
      const response = await fetch('/api/google-calendar-disconnect', {
        method: 'POST',
        headers: await authHeaders(),
        body: JSON.stringify({ userId: user.id }),
      });

      if (response.ok) {
        setGoogleCalendarConnected(false);
        alert(t('cal.googleDisconnected'));
      } else {
        alert(t('cal.failedToDisconnect'));
      }
    } catch (err) {
      console.error('Disconnect error:', err);
      alert(t('cal.errorGeneric'));
    } finally {
      setGoogleCalendarSyncing(false);
    }
  };

  const handleGoogleCalendarSync = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    setGoogleCalendarSyncing(true);
    try {
      const response = await fetch('/api/google-calendar-sync', {
        method: 'POST',
        headers: await authHeaders(),
        body: JSON.stringify({ userId: user.id }),
      });

      const data = await response.json().catch(() => ({}));
      if (response.ok && data.success !== false) {
        const n = data.sessionsCount ?? data.synced?.sessions ?? 0;
        const total = data.totalSessions ?? data.synced?.totalSessions;
        const availCount = data.availabilityCreated ?? 0;
        const availErr = data.availabilityError;
        let msg = t('cal.syncSuccess', { sessions: String(n), avail: String(availCount) });
        if (availErr) {
          msg += `\n\nLaisvo laiko klaida: ${availErr}`;
        }
        if (total !== undefined && total > 0 && n < total && data.sessionError) {
          msg += '\n\n' + t('cal.syncSendFailed', { error: data.sessionError });
        } else if (data.sessionError) {
          msg += '\n\n' + t('cal.syncSessionError', { error: data.sessionError });
        }
        if ((n > 0 || availCount > 0) && !availErr && !data.sessionError) {
          msg += '\n\n' + t('cal.syncCheckGoogle');
        }
        alert(msg);
      } else {
        const msg = data?.message || data?.error || t('cal.failedToSync');
        alert('Google Calendar: ' + msg);
      }
    } catch (err: any) {
      console.error('Sync error:', err);
      const isNetworkError = err?.message?.includes('fetch') || err?.name === 'TypeError';
      if (isNetworkError) {
        alert(t('cal.syncServerFail'));
      } else {
        alert(t('cal.errorGeneric'));
      }
    } finally {
      setGoogleCalendarSyncing(false);
    }
  };

  const handleSelectSlot = useCallback(({ start, end }: { start: Date; end: Date }, opts?: { forceCreate?: boolean }) => {
    if (isAvailabilityModalOpen || isEventModalOpen || isCreateModalOpen || isUpcomingListModalOpen) return;
    // Only require Stripe + subjects for individual tutors. Org tutors manage calendars/sessions without their own Stripe.
    if (!isOrgTutor && (!stripeConnected || subjects.length === 0)) {
      alert(t('cal.connectStripeFirst'));
      return;
    }
    // If click is on a background (availability) event, open slot edit modal instead of create
    if (!opts?.forceCreate) {
      const hit = backgroundEvents.find((e: any) => e.isBackground && e.start_time < end && e.end_time > start);
      if (hit) {
        setEditingSlot({
          ruleId: hit.ruleId,
          ruleStart: hit.ruleStart,
          ruleEnd: hit.ruleEnd,
          ruleIsRecurring: hit.ruleIsRecurring,
          ruleDate: hit.ruleDate,
          ruleDayOfWeek: hit.ruleDayOfWeek,
          blockStart: hit.start_time,
          subjectIds: hit.ruleSubjectIds || [],
        });
        setSlotEditStart(hit.ruleStart);
        setSlotEditEnd(hit.ruleEnd);
        setSlotEditSubjects(hit.ruleSubjectIds || []);
        setIsSlotEditOpen(true);
        return;
      }
    }
    setSelectedSlot({ start, end });
    setStartTime(format(start, "yyyy-MM-dd'T'HH:mm"));
    setEndTime(format(end, "yyyy-MM-dd'T'HH:mm"));
    setSelectedStudentId('');
    setSelectedSubjectId('');
    setMeetingLink('');
    setTopic('');
    setPrice(25);
    setNewTutorComment('');
    setNewShowCommentToStudent(false);
    setIsRecurring(false);
    setRecurringEndDate('');
    setIsCreateModalOpen(true);
  }, [isAvailabilityModalOpen, isEventModalOpen, isCreateModalOpen, isUpcomingListModalOpen, backgroundEvents, stripeConnected, subjects.length, isOrgTutor]);

  const handleSelectEvent = useCallback((event: any) => {
    if (event.isBackground) {
      // Open availability slot edit modal
      setEditingSlot({
        ruleId: event.ruleId,
        ruleStart: event.ruleStart,
        ruleEnd: event.ruleEnd,
        ruleIsRecurring: event.ruleIsRecurring,
        ruleDate: event.ruleDate,
        ruleDayOfWeek: event.ruleDayOfWeek,
        blockStart: event.start_time,
        subjectIds: event.ruleSubjectIds,
        meetingLink: event.ruleMeetingLink,
      });
      setSlotEditStart(event.ruleStart);
      setSlotEditEnd(event.ruleEnd);
      setSlotEditSubjects(event.ruleSubjectIds);
      setSlotEditMeetingLink(event.ruleMeetingLink || '');
      setIsSlotEditOpen(true);
      return;
    }

    // Check if this is a group session
    if (event._isGroup && event._groupSessions) {
      setIsGroupSession(true);
      setSelectedGroupSessions(event._groupSessions);
      setSelectedEvent(event._groupSessions[0]); // Use first session as base
    } else {
      setIsGroupSession(false);
      setSelectedGroupSessions([]);
      setSelectedEvent(event);
    }
    setIsEventModalOpen(true);
  }, []);

  // When student changes, check for individual pricing to auto-fill
  const handleStudentChange = (studentId: string) => {
    setSelectedStudentId(studentId);

    // If no subject is selected yet, just store the student – price/topic will be set when subject is chosen.
    if (!selectedSubjectId) return;

    const subj = subjects.find((s) => s.id === selectedSubjectId);
    if (!subj || subj.is_group) {
      // Individual pricing applies only to individual lessons
      return;
    }

    // Check if there's individual pricing for this student and subject
    const pricing = individualPricing.find(
      (p) => p.student_id === studentId && p.subject_id === selectedSubjectId,
    );
    const tsp = getTutorSubjectPrice(subj.name);
    const effectivePrice = pricing?.price ?? tsp?.price ?? subj.price;

    setTopic(subj.name || '');
    if (typeof effectivePrice === 'number') {
      setPrice(effectivePrice);
    }
    setMeetingLink(subj.meeting_link || '');

    // Auto-adjust end time based on individual duration (if available) or subject duration
    const durationMinutes =
      (pricing && typeof pricing.duration_minutes === 'number'
        ? pricing.duration_minutes
        : subj.duration_minutes) || 60;

    if (startTime) {
      const start = new Date(startTime);
      if (!Number.isNaN(start.getTime())) {
        const end = new Date(start.getTime() + durationMinutes * 60 * 1000);
        setEndTime(format(end, "yyyy-MM-dd'T'HH:mm"));
      }
    }
  };

  // When subject changes, autofill topic and price
  const handleSubjectChange = (subjectId: string) => {
    setSelectedSubjectId(subjectId);
    const subj = subjects.find((s) => s.id === subjectId);

    // Clear student selection when switching between group/individual
    if (subj?.is_group) {
      setSelectedStudentId('');
      setSelectedStudentIds([]);
    } else {
      setSelectedStudentIds([]);
    }

    if (subj) {
      // Check if there's individual pricing for this student and subject
      const pricing = individualPricing.find(
        (p) => p.student_id === selectedStudentId && p.subject_id === subjectId
      );

      if (pricing) {
        // Use individual pricing
        setTopic(subj.name);
        setPrice(pricing.price);
        setMeetingLink(subj.meeting_link || '');
        // Auto-adjust end time based on individual duration
        if (startTime) {
          const start = new Date(startTime);
          const end = new Date(start.getTime() + pricing.duration_minutes * 60 * 1000);
          setEndTime(format(end, "yyyy-MM-dd'T'HH:mm"));
        }
      } else {
        const tsp = getTutorSubjectPrice(subj.name);
        setTopic(subj.name);
        setPrice(tsp?.price ?? subj.price);
        setMeetingLink(subj.meeting_link || '');
        const dur = tsp?.duration_minutes ?? subj.duration_minutes ?? 60;
        if (startTime) {
          const start = new Date(startTime);
          const end = new Date(start.getTime() + dur * 60 * 1000);
          setEndTime(format(end, "yyyy-MM-dd'T'HH:mm"));
        }
      }
    }
  };

  const getSubjectDuration = () => {
    if (selectedSubjectId) {
      const pricing = individualPricing.find(
        (p) => p.student_id === selectedStudentId && p.subject_id === selectedSubjectId
      );
      if (pricing) return pricing.duration_minutes;

      const subj = subjects.find(s => s.id === selectedSubjectId);
      if (subj) {
        const tsp = getTutorSubjectPrice(subj.name);
        return tsp?.duration_minutes ?? subj.duration_minutes;
      }
    }
    return 60;
  };

  // Calculate available time slots when assigning student to availability slot
  const calculateAssignSlots = useCallback(() => {
    if (!editingSlot || !assignSubjectId || !assignStudentId) {
      setAssignAvailableSlots([]);
      return;
    }

    const student = students.find(s => s.id === assignStudentId);
    const subject = subjects.find(s => s.id === assignSubjectId);

    const pricing = individualPricing.find(
      (p) => p.student_id === assignStudentId && p.subject_id === assignSubjectId
    );
    const tspCalc = getTutorSubjectPrice(subject?.name);
    const duration = pricing?.duration_minutes ?? tspCalc?.duration_minutes ?? subject?.duration_minutes ?? 60;
    setAssignDuration(duration);

    const breakBetweenLessons = 0; // No break needed for tutor-side scheduling

    // Get the date from editingSlot
    let dateStr: string;
    if (editingSlot.ruleIsRecurring) {
      // For recurring, use blockStart date
      dateStr = format(editingSlot.blockStart, 'yyyy-MM-dd');
    } else {
      // For specific date
      dateStr = editingSlot.ruleDate || format(editingSlot.blockStart, 'yyyy-MM-dd');
    }

    const slots: string[] = [];
    const toMinutes = (time: string) => {
      const [h, m] = time.split(':').map(Number);
      return h * 60 + m;
    };

    let currentMin = toMinutes(editingSlot.ruleStart);
    const endMin = toMinutes(editingSlot.ruleEnd);

    while (currentMin + duration <= endMin) {
      const hh = Math.floor(currentMin / 60).toString().padStart(2, '0');
      const mm = (currentMin % 60).toString().padStart(2, '0');
      const timeStr = `${hh}:${mm}`;

      const slotStart = new Date(`${dateStr}T${timeStr}`);
      const slotEnd = new Date(slotStart.getTime() + duration * 60 * 1000);

      // Check if this slot overlaps with existing sessions (ANY tutor's sessions or student's own sessions)
      const overlappingSession = sessions.find(session => {
        const sStart = new Date(session.start_time);
        const sEnd = new Date(new Date(session.end_time).getTime() + breakBetweenLessons * 60000);
        return session.status !== 'cancelled' && slotStart < sEnd && slotEnd > sStart;
      });

      // Also check if the selected student has any sessions at this time
      const studentHasSession = sessions.find(session => {
        if (session.student_id !== assignStudentId) return false;
        const sStart = new Date(session.start_time);
        const sEnd = new Date(session.end_time);
        return session.status !== 'cancelled' && slotStart < sEnd && slotEnd > sStart;
      });

      if (overlappingSession || studentHasSession) {
        const blockingSession = overlappingSession || studentHasSession;
        if (!blockingSession) {
          currentMin += 5;
          continue;
        }
        // Fast-forward currentMin to the end of the overlapping session
        const sEnd = new Date(new Date(blockingSession.end_time).getTime() + breakBetweenLessons * 60000);
        const overrideMin = sEnd.getHours() * 60 + sEnd.getMinutes();
        currentMin = Math.max(currentMin + 5, overrideMin);
      } else {
        slots.push(timeStr);
        currentMin += duration;
      }
    }

    setAssignAvailableSlots(slots.sort());
  }, [editingSlot, assignSubjectId, assignStudentId, students, subjects, individualPricing, tutorSubjectPrices, calOrgSubjectTemplates, sessions, getTutorSubjectPrice]);

  // When assign student/subject/duration changes, recalculate slots
  useEffect(() => {
    if (isAssignStudentOpen && assignStudentId && assignSubjectId) {
      calculateAssignSlots();
    }
  }, [isAssignStudentOpen, assignStudentId, assignSubjectId, assignDuration, calculateAssignSlots]);

  // Keep selected subject valid when filters change
  useEffect(() => {
    if (!assignSubjectId) return;
    const stillAvailable = assignFilteredSubjects.some(s => s.id === assignSubjectId);
    if (!stillAvailable) {
      setAssignSubjectId('');
      setAssignSelectedSlot('');
    }
  }, [assignSubjectId, assignFilteredSubjects]);

  const handleStartTimeChange = (newVal: string) => {
    setStartTime(newVal);
    const newStart = new Date(newVal);
    if (!isNaN(newStart.getTime())) {
      const durationMs = getSubjectDuration() * 60 * 1000;
      const newEnd = new Date(newStart.getTime() + durationMs);
      setEndTime(format(newEnd, "yyyy-MM-dd'T'HH:mm"));
    }
  };

  const handleCreateSession = async () => {
    // Check if we have students selected (either individual or group)
    const selectedSubject = subjects.find(s => s.id === selectedSubjectId);
    const isGroupLesson = selectedSubject?.is_group;
    const hasStudents = isGroupLesson ? selectedStudentIds.length > 0 : !!selectedStudentId;

    if (!hasStudents || !startTime || !endTime) {
      alert(t('cal.selectStudentAndTime'));
      return;
    }

    if (!isOrgTutor && !stripeConnected) {
      alert(t('cal.stripeRequired'));
      return;
    }
    setSaving(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSaving(false); return; }

    const startDate = new Date(startTime);
    const endDate = new Date(endTime);
    const durationMs = endDate.getTime() - startDate.getTime();

    if (isRecurring && recurringEndDate) {
      // Get subject data for group lesson logic
      const subject = subjects.find((s) => s.id === selectedSubjectId);
      const studentIdsToCreate = isGroupLesson ? selectedStudentIds : [selectedStudentId];

      const tspRecur = getTutorSubjectPrice(subject?.name);
      // Determine which days to create templates for
      const daysToCreate = (recurringFrequency !== 'monthly' && selectedWeekdays.length > 0)
        ? selectedWeekdays
        : [getDay(startDate)];
      const timeStr = format(startDate, 'HH:mm:ss');
      const endTimeStr = format(endDate, 'HH:mm:ss');

      // Create recurring template for each (student × weekday) combination
      const recurringTemplates: any[] = [];
      for (const dayOfWeek of daysToCreate) {
        let firstOccurrence = new Date(startDate);
        const startDow = firstOccurrence.getDay();
        if (startDow !== dayOfWeek) {
          const diff = (dayOfWeek - startDow + 7) % 7;
          firstOccurrence = addDays(firstOccurrence, diff);
        }

        for (const studentId of studentIdsToCreate) {
          const pricing = individualPricing.find(
            (p) => p.student_id === studentId && p.subject_id === selectedSubjectId
          );
          const studentPrice = pricing?.price ?? tspRecur?.price ?? subject?.price ?? price;

          const { data: template } = await supabase
            .from('recurring_individual_sessions')
            .insert({
              tutor_id: user.id,
              student_id: studentId,
              subject_id: selectedSubjectId || null,
              day_of_week: dayOfWeek,
              start_time: timeStr,
              end_time: endTimeStr,
              start_date: format(firstOccurrence, 'yyyy-MM-dd'),
              end_date: recurringEndDate,
              meeting_link: meetingLink || null,
              topic: topic || null,
              price: studentPrice,
              active: true,
            })
            .select('id, student_id')
            .single();

          if (template) {
            recurringTemplates.push({ ...template, firstOccurrence, dayOfWeek });
          }
        }
      }

      // Check for lesson packages for each student template (for recurring sessions)
      const packagesByStudent = new Map();
      if (!isPaid && selectedSubjectId) {
        const uniqueStudentIds = [...new Set(recurringTemplates.map((t: any) => t.student_id))];
        for (const sid of uniqueStudentIds) {
          const { data: packages } = await supabase
            .from('lesson_packages')
            .select('*')
            .eq('student_id', sid)
            .eq('subject_id', selectedSubjectId)
            .eq('active', true)
            .eq('paid', true)
            .gt('available_lessons', 0)
            .order('created_at', { ascending: true })
            .limit(1);

          if (packages && packages.length > 0) {
            packagesByStudent.set(sid, packages[0]);
          }
        }
      }

      const sessions: any[] = [];
      const packagesUsage = new Map();
      const endLimit = parseISO(recurringEndDate);

      const advanceCurrent = (d: Date): Date => {
        switch (recurringFrequency) {
          case 'biweekly': return addWeeks(d, 2);
          case 'monthly': return addMonths(d, 1);
          default: return addWeeks(d, 1);
        }
      };

      for (const template of recurringTemplates) {
        let current = new Date(template.firstOccurrence);
        const pricing = individualPricing.find(
          (p: any) => p.student_id === template.student_id && p.subject_id === selectedSubjectId
        );
        const studentPrice = pricing?.price ?? tspRecur?.price ?? subject?.price ?? price;

        while (!isBefore(endLimit, current)) {
          const sessionEnd = new Date(current.getTime() + durationMs);

          let sessionPaid = isPaid;
          let sessionPaymentStatus = isPaid ? 'paid' : 'pending';
          let lessonPackageId = null;

          if (!isPaid) {
            const pkg = packagesByStudent.get(template.student_id);
            if (pkg) {
              const used = packagesUsage.get(pkg.id) || 0;
              const remaining = pkg.available_lessons - used;

              if (remaining > 0) {
                lessonPackageId = pkg.id;
                sessionPaid = true;
                sessionPaymentStatus = 'confirmed';
                packagesUsage.set(pkg.id, used + 1);
              }
            }
          }

          sessions.push({
            tutor_id: user.id,
            student_id: template.student_id,
            subject_id: selectedSubjectId || null,
            start_time: current.toISOString(),
            end_time: sessionEnd.toISOString(),
            status: 'active',
            meeting_link: meetingLink || null,
            topic: topic || null,
            price: studentPrice,
            paid: sessionPaid,
            payment_status: sessionPaymentStatus,
            lesson_package_id: lessonPackageId,
            tutor_comment: newTutorComment || null,
            show_comment_to_student: newShowCommentToStudent,
            recurring_session_id: template.id,
            available_spots: subject?.is_group ? subject.max_students : null,
          });

          current = advanceCurrent(current);
        }
      }

      if (sessions.length > 0) {
        const { data: createdSessions, error } = await supabase.from('sessions').insert(sessions).select();
        if (error) {
          console.error('Error creating recurring sessions:', error);
          alert('Klaida kuriant pamokas: ' + error.message);
          setSaving(false);
          return;
        }

        // Update lesson packages based on usage
        if (packagesUsage.size > 0) {
          for (const [pkgId, usedCount] of packagesUsage.entries()) {
            const pkg = Array.from(packagesByStudent.values()).find(p => p.id === pkgId);
            if (pkg) {
              const { error: pkgError } = await supabase
                .from('lesson_packages')
                .update({
                  available_lessons: pkg.available_lessons - usedCount,
                  reserved_lessons: pkg.reserved_lessons + usedCount,
                })
                .eq('id', pkgId);

              if (pkgError) {
                console.error('Error updating lesson package:', pkgError);
              } else {
                console.log(`[Calendar] Auto-deducted ${usedCount} lessons from package ${pkgId} (recurring)`);
              }
            }
          }
        }

        // Send emails to all students (for group lessons)
        if (createdSessions && createdSessions.length > 0) {
          const { data: tutorProfile } = await supabase
            .from('profiles')
            .select('full_name, stripe_account_id, organization_id, payment_timing, enable_per_lesson, enable_monthly_billing, cancellation_hours, cancellation_fee_percent')
            .eq('id', user.id)
            .single();
          let effectiveEnablePerLesson = !!(tutorProfile as any)?.enable_per_lesson;
          let effectiveEnableMonthlyBilling = !!(tutorProfile as any)?.enable_monthly_billing;
          let effectivePaymentTiming = ((tutorProfile as any)?.payment_timing as string | null) ?? 'before_lesson';
          if ((tutorProfile as any)?.organization_id) {
            const { data: orgPayFlags } = await supabase
              .from('organizations')
              .select('enable_per_lesson, enable_monthly_billing, payment_timing')
              .eq('id', (tutorProfile as any).organization_id)
              .maybeSingle();
            if (orgPayFlags) {
              effectiveEnablePerLesson = !!(orgPayFlags as any).enable_per_lesson;
              effectiveEnableMonthlyBilling = !!(orgPayFlags as any).enable_monthly_billing;
              effectivePaymentTiming = ((orgPayFlags as any).payment_timing as string | null) || effectivePaymentTiming;
            }
          }

          // Group ALL sessions by student_id
          const allStudentSessions = new Map<string, any[]>();
          createdSessions.forEach(session => {
            const arr = allStudentSessions.get(session.student_id) || [];
            arr.push(session);
            allStudentSessions.set(session.student_id, arr);
          });

          // Send consolidated recurring email to each student
          for (const [studentId, studentSessionList] of Array.from(allStudentSessions)) {
            const { data: studentData } = await supabase
              .from('students')
              .select('full_name, email, payment_payer, payer_email, payer_name, payment_model')
              .eq('id', studentId)
              .single();

            if (!studentData) continue;

            const firstSession = studentSessionList[0];
            const firstStart = new Date(firstSession.start_time);
            const sessionDates = studentSessionList
              .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())
              .map(s => ({
                date: format(new Date(s.start_time), 'yyyy-MM-dd'),
                time: format(new Date(s.start_time), 'HH:mm'),
              }));

            const normalizedPayer = String(studentData.payment_payer || '').trim().toLowerCase();
            const payerEmail = String(studentData.payer_email || '').trim();
            const hasPayer = normalizedPayer === 'parent' && payerEmail.length > 0;

            if (studentData.email) {
              sendEmail({
                type: 'recurring_booking_confirmation',
                to: studentData.email,
                data: {
                  studentName: studentData.full_name,
                  tutorName: tutorProfile?.full_name || '',
                  subject: topic || null,
                  duration: Math.round(durationMs / 60000),
                  totalLessons: studentSessionList.length,
                  sessions: sessionDates,
                },
              }).catch(err => console.error('Error sending recurring booking email:', err));
            }

            if (hasPayer) {
              sendEmail({
                type: 'recurring_booking_confirmation',
                to: payerEmail,
                data: {
                  forPayer: true,
                  bookedBy: 'tutor',
                  studentName: studentData.full_name,
                  payerName: (studentData as any).payer_name || studentData.full_name,
                  tutorName: tutorProfile?.full_name || '',
                  subject: topic || null,
                  duration: Math.round(durationMs / 60000),
                  totalLessons: studentSessionList.length,
                  sessions: sessionDates,
                  paymentReminderNote: true,
                },
              }).catch(err => console.error('Error sending payer recurring booking email:', err));
            }

            // 2) Payment email to parent (only if not paid via package)
            const studentModel = (studentData as any)?.payment_model as string | null | undefined;
            const allowsPerLessonNow =
              studentModel === 'per_lesson'
                ? true
                : studentModel === 'monthly_billing' || studentModel === 'prepaid_packages'
                  ? false
                  : effectiveEnablePerLesson && !effectiveEnableMonthlyBilling;

            const shouldSendParentPaymentNow =
              !firstSession.paid &&
              !firstSession.lesson_package_id &&
              normalizedPayer === 'parent' &&
              payerEmail.length > 0 &&
              allowsPerLessonNow &&
              effectivePaymentTiming === 'before_lesson';

            if (shouldSendParentPaymentNow) {
              const checkoutRes = await fetch('/api/stripe-checkout', {
                method: 'POST',
                headers: await authHeaders(),
                body: JSON.stringify({
                  sessionId: firstSession.id,
                  payerEmail: studentData.payer_email,
                }),
              });
              const checkoutJson = await checkoutRes.json().catch(() => ({} as any));
              if (checkoutJson?.creditFullyCovered) {
                console.info('[Calendar] Credit fully covered lesson (recurring)');
              } else if (checkoutRes.ok && checkoutJson?.url) {
                sendEmail({
                  type: 'stripe_payment_forwarding',
                  to: payerEmail,
                  data: {
                    studentName: studentData.full_name,
                    tutorName: tutorProfile?.full_name || '',
                    date: format(firstStart, 'yyyy-MM-dd'),
                    time: format(firstStart, 'HH:mm'),
                    amount: firstSession.price ?? price,
                    paymentLink: checkoutJson.url,
                  },
                }).catch((err) => console.error('Error sending parent payment email (recurring):', err));
              } else {
                console.error(
                  'Failed creating checkout for parent (recurring):',
                  checkoutJson?.error || checkoutJson || { status: checkoutRes.status }
                );
              }
            } else if (!firstSession.paid && studentData.payment_payer === 'parent') {
              console.info('[Calendar] Parent payment email skipped (recurring)', {
                sessionId: firstSession.id,
                paymentModel: studentModel ?? null,
                paymentTiming: effectivePaymentTiming,
                effectiveEnablePerLesson,
                effectiveEnableMonthlyBilling,
                hasPayerEmail: payerEmail.length > 0,
                hasPackage: !!firstSession.lesson_package_id,
              });
            }

            // 3) Comment email
            if (newShowCommentToStudent && newTutorComment && studentData.email) {
              sendEmail({
                type: 'session_comment_added',
                to: studentData.email,
                data: {
                  studentName: studentData.full_name,
                  tutorName: tutorProfile?.full_name || '',
                  date: format(firstStart, 'yyyy-MM-dd'),
                  time: format(firstStart, 'HH:mm'),
                  comment: newTutorComment,
                },
              }).catch(err => console.error('Error sending comment email:', err));
            }
          }
        }

        // Sync new sessions to Google Calendar
        if (googleCalendarConnected && createdSessions && createdSessions.length > 0) {
          for (const session of createdSessions) {
            const syncRes = await fetch('/api/google-calendar-sync', {
              method: 'POST',
              headers: await authHeaders(),
              body: JSON.stringify({ userId: user.id, sessionId: session.id }),
            }).catch(err => ({ ok: false, json: async () => ({ error: err?.message }) }));
            const syncData = await (syncRes as Response).json?.().catch(() => ({}));
            if (!(syncRes as Response).ok || syncData?.success === false) {
              alert(t('cal.syncGoogleFailed', { error: syncData?.error || syncData?.message || 'unknown' }));
            }
          }
        }

        const recurringCreatedCount = createdSessions?.length ?? sessions.length;
        if (recurringCreatedCount > 0) {
          setToastMessage({
            message: recurringCreatedCount === 1
              ? t('cal.lessonCreated')
              : t('cal.lessonsCreated', { count: String(recurringCreatedCount) }),
            type: 'success',
          });
        }
        fetchData();
        setSaving(false);
        return;
      }
    } else {
      // Get subject data for group lesson logic
      const subject = subjects.find((s) => s.id === selectedSubjectId);
      const isGroupLesson = subject?.is_group;

      // Determine which students to create sessions for
      const studentIdsToCreate = isGroupLesson ? selectedStudentIds : [selectedStudentId];

      // Check for lesson packages for each student and prepare sessions
      const sessionsToInsert = [];
      const packagesToUpdate = [];
      const tspSingle = getTutorSubjectPrice(subject?.name);

      for (const studentId of studentIdsToCreate) {
        // Check for individual pricing for THIS student
        const pricing = individualPricing.find(
          (p) => p.student_id === studentId && p.subject_id === selectedSubjectId
        );
        const studentPrice = pricing?.price ?? tspSingle?.price ?? subject?.price ?? price;

        // Check if student has available lesson package for this subject
        let sessionPaid = isPaid;
        let sessionPaymentStatus = isPaid ? 'paid' : 'pending';
        let lessonPackageId = null;

        if (!isPaid && selectedSubjectId) {
          const { data: packages } = await supabase
            .from('lesson_packages')
            .select('*')
            .eq('student_id', studentId)
            .eq('subject_id', selectedSubjectId)
            .eq('active', true)
            .eq('paid', true)
            .gt('available_lessons', 0)
            .order('created_at', { ascending: true })
            .limit(1);

          if (packages && packages.length > 0) {
            const pkg = packages[0];
            lessonPackageId = pkg.id;
            sessionPaid = true;
            sessionPaymentStatus = 'confirmed';

            // Track package update
            packagesToUpdate.push({
              id: pkg.id,
              available_lessons: pkg.available_lessons - 1,
              reserved_lessons: pkg.reserved_lessons + 1,
              studentId: studentId
            });
          }
        }

        sessionsToInsert.push({
          tutor_id: user.id,
          student_id: studentId,
          subject_id: selectedSubjectId || null,
          start_time: startDate.toISOString(),
          end_time: endDate.toISOString(),
          status: 'active',
          meeting_link: meetingLink || null,
          topic: topic || null,
          price: studentPrice,
          paid: sessionPaid,
          payment_status: sessionPaymentStatus,
          lesson_package_id: lessonPackageId,
          tutor_comment: newTutorComment || null,
          show_comment_to_student: newShowCommentToStudent,
          available_spots: subject?.is_group ? subject.max_students : null,
        });
      }

      const { data: created, error } = await supabase.from('sessions').insert(sessionsToInsert).select();

      // Update lesson packages
      if (!error && packagesToUpdate.length > 0) {
        for (const pkgUpdate of packagesToUpdate) {
          const { error: pkgError } = await supabase
            .from('lesson_packages')
            .update({
              available_lessons: pkgUpdate.available_lessons,
              reserved_lessons: pkgUpdate.reserved_lessons,
            })
            .eq('id', pkgUpdate.id);

          if (pkgError) {
            console.error('Error updating lesson package:', pkgError);
          } else {
            console.log(`[Calendar] Auto-deducted 1 lesson from package ${pkgUpdate.id} for student ${pkgUpdate.studentId}`);
          }
        }
      }

      if (error) {
        console.error('Error creating session:', error);
        alert(t('cal.errorCreating', { msg: error.message }));
        setSaving(false);
        return;
      } else {
        // Keep modal open for file upload (use first session ID for group lessons)
        if (created && created.length > 0) {
          setNewSessionId(created[0].id);
        }

        // Fetch tutor info for emails (same for all students)
        const { data: tutorProfile } = await supabase
          .from('profiles')
          .select('full_name, stripe_account_id, organization_id, payment_timing, enable_per_lesson, enable_monthly_billing, cancellation_hours, cancellation_fee_percent')
          .eq('id', user.id)
          .single();
        let effectiveEnablePerLesson = !!(tutorProfile as any)?.enable_per_lesson;
        let effectiveEnableMonthlyBilling = !!(tutorProfile as any)?.enable_monthly_billing;
        let effectivePaymentTiming = ((tutorProfile as any)?.payment_timing as string | null) ?? 'before_lesson';
        if ((tutorProfile as any)?.organization_id) {
          const { data: orgPayFlags } = await supabase
            .from('organizations')
            .select('enable_per_lesson, enable_monthly_billing, payment_timing')
            .eq('id', (tutorProfile as any).organization_id)
            .maybeSingle();
          if (orgPayFlags) {
            effectiveEnablePerLesson = !!(orgPayFlags as any).enable_per_lesson;
            effectiveEnableMonthlyBilling = !!(orgPayFlags as any).enable_monthly_billing;
            effectivePaymentTiming = ((orgPayFlags as any).payment_timing as string | null) || effectivePaymentTiming;
          }
        }

        // Send emails to each student
        for (const session of created || []) {
          const { data: studentData } = await supabase
            .from('students')
            .select('full_name, email, payment_payer, payer_email, payment_model')
            .eq('id', session.student_id)
            .single();

          // 1) Booking confirmation to student
          const normalizedPayer = String(studentData?.payment_payer || '').trim().toLowerCase();
          const payerEmail = String(studentData?.payer_email || '').trim();
          const hasPayer = normalizedPayer === 'parent' && payerEmail.length > 0;

          if (studentData?.email) {
            sendEmail({
              type: 'booking_confirmation',
              to: studentData.email,
              data: {
                studentName: studentData.full_name,
                tutorName: tutorProfile?.full_name || '',
                date: format(startDate, 'yyyy-MM-dd'),
                time: format(startDate, 'HH:mm'),
                subject: topic || null,
                price: hasPayer ? null : price,
                duration: Math.round(durationMs / 60000),
                cancellationHours: hasPayer ? null : (tutorProfile?.cancellation_hours ?? 24),
                cancellationFeePercent: hasPayer ? null : (tutorProfile?.cancellation_fee_percent ?? 0),
                paymentStatus: hasPayer ? null : (session.paid ? 'paid' : 'pending'),
                meetingLink: meetingLink || null,
                hidePaymentInfo: hasPayer,
              },
            }).catch(err => console.error('Error sending booking confirmation email:', err));
          }

          if (hasPayer) {
            sendEmail({
              type: 'booking_confirmation',
              to: payerEmail,
              data: {
                forPayer: true,
                bookedBy: 'tutor',
                studentName: studentData?.full_name || '',
                tutorName: tutorProfile?.full_name || '',
                date: format(startDate, 'yyyy-MM-dd'),
                time: format(startDate, 'HH:mm'),
                subject: topic || null,
                price,
                duration: Math.round(durationMs / 60000),
                cancellationHours: tutorProfile?.cancellation_hours ?? 24,
                cancellationFeePercent: tutorProfile?.cancellation_fee_percent ?? 0,
                paymentStatus: session.paid ? 'paid' : 'pending',
                meetingLink: meetingLink || null,
              },
            }).catch(err => console.error('Error sending payer booking confirmation email:', err));
          }

          // 2) Send payment email to parent if needed (only if not paid via package)
          const studentModel = (studentData as any)?.payment_model as string | null | undefined;
          const allowsPerLessonNow =
            studentModel === 'per_lesson'
              ? true
              : studentModel === 'monthly_billing' || studentModel === 'prepaid_packages'
                ? false
                : effectiveEnablePerLesson && !effectiveEnableMonthlyBilling;

          const shouldSendParentPaymentNow =
            !session.paid &&
            !session.lesson_package_id &&
            normalizedPayer === 'parent' &&
            payerEmail.length > 0 &&
            allowsPerLessonNow &&
            effectivePaymentTiming === 'before_lesson';

          if (shouldSendParentPaymentNow) {
            const checkoutRes = await fetch('/api/stripe-checkout', {
              method: 'POST',
              headers: await authHeaders(),
              body: JSON.stringify({
                sessionId: session.id,
                payerEmail: studentData.payer_email,
              }),
            });
            const checkoutJson = await checkoutRes.json().catch(() => ({} as any));

            if (checkoutJson?.creditFullyCovered) {
              console.info('[Calendar] Credit fully covered lesson');
            } else if (checkoutRes.ok && checkoutJson?.url) {
              sendEmail({
                type: 'stripe_payment_forwarding',
                to: payerEmail,
                data: {
                  studentName: studentData.full_name || '',
                  tutorName: tutorProfile?.full_name || '',
                  date: format(startDate, 'yyyy-MM-dd'),
                  time: format(startDate, 'HH:mm'),
                  amount: session.price ?? price,
                  paymentLink: checkoutJson.url,
                },
              }).catch((err) => console.error('Error sending parent payment email:', err));
            } else {
              console.error(
                'Failed creating checkout for parent:',
                checkoutJson?.error || checkoutJson || { status: checkoutRes.status }
              );
            }
          } else if (!session.paid && studentData?.payment_payer === 'parent') {
            console.info('[Calendar] Parent payment email skipped', {
              sessionId: session.id,
              paymentModel: studentModel ?? null,
              paymentTiming: effectivePaymentTiming,
              effectiveEnablePerLesson,
              effectiveEnableMonthlyBilling,
              hasPayerEmail: payerEmail.length > 0,
              hasPackage: !!session.lesson_package_id,
            });
          }

          // Send comment email to student if "show to student" was checked
          if (newShowCommentToStudent && newTutorComment && studentData?.email) {
            sendEmail({
              type: 'session_comment_added',
              to: studentData.email,
              data: {
                studentName: studentData.full_name || '',
                tutorName: tutorProfile?.full_name || '',
                date: format(startDate, 'yyyy-MM-dd'),
                time: format(startDate, 'HH:mm'),
                comment: newTutorComment,
              },
            }).catch(err => console.error('Error sending comment email:', err));
          }

          // Sync each session to Google Calendar
          if (googleCalendarConnected) {
            const syncRes = await fetch('/api/google-calendar-sync', {
              method: 'POST',
              headers: await authHeaders(),
              body: JSON.stringify({ userId: user.id, sessionId: session.id }),
            }).catch(err => ({ ok: false, json: async () => ({ error: err?.message }) }));
            const syncData = await (syncRes as Response).json?.().catch(() => ({}));
            if (!(syncRes as Response).ok || syncData?.success === false) {
              console.error('Google Calendar sync failed for session ' + session.id);
            }
          }
        }

        const createdCount = created?.length ?? sessionsToInsert.length;
        if (createdCount > 0) {
          setToastMessage({
            message: createdCount === 1
              ? t('cal.lessonCreated')
              : t('cal.lessonsCreated', { count: String(createdCount) }),
            type: 'success',
          });
        }

        fetchData();
        setSaving(false);
        return;
      }
    }

    setIsCreateModalOpen(false);
    fetchData();
    setSaving(false);
  };

  const handleSaveViewComment = async () => {
    if (!selectedEvent) return;
    setViewCommentSaving(true);
    const { data: tutorProfile } = await supabase.from('profiles').select('full_name, organization_id').eq('id', (await supabase.auth.getUser()).data.user?.id).single();
    const effectiveShowToStudent = forceTrialCommentVisibility ? true : viewShowToStudent;
    const { error } = await supabase
      .from('sessions')
      .update({
        tutor_comment: viewCommentText.trim() || null,
        show_comment_to_student: effectiveShowToStudent,
      })
      .eq('id', selectedEvent.id);
    if (!error) {
      const updated = { ...selectedEvent, tutor_comment: viewCommentText.trim() || null, show_comment_to_student: effectiveShowToStudent };
      setSessions((prev) => prev.map((s) => (s.id === selectedEvent.id ? { ...s, ...updated } : s)));
      setSelectedEvent(updated);
      if (effectiveShowToStudent && viewCommentText.trim()) {
        const alreadySent = selectedEvent.show_comment_to_student && selectedEvent.tutor_comment === viewCommentText.trim();
        if (!alreadySent) {
          let studentEmail = selectedEvent.student?.email;
          let payerEmail: string | null = null;
          if (!studentEmail && selectedEvent.student_id) {
            const { data: studentRow } = await supabase.from('students').select('email, payer_email, full_name').eq('id', selectedEvent.student_id).single();
            studentEmail = studentRow?.email;
            if (studentRow && !updated.student) updated.student = { full_name: studentRow.full_name, email: studentRow.email };
            payerEmail = (studentRow?.payer_email || null) as any;
          } else if (selectedEvent.student_id) {
            const { data: studentRow } = await supabase.from('students').select('payer_email').eq('id', selectedEvent.student_id).single();
            payerEmail = (studentRow?.payer_email || null) as any;
          }
          if (studentEmail) {
            let to: string | string[] = studentEmail;
            try {
              const orgId = (tutorProfile as any)?.organization_id as string | null | undefined;
              const subjectId = (selectedEvent as any)?.subject_id as string | null | undefined;
              if (orgId && subjectId && payerEmail && payerEmail.trim().length > 0 && payerEmail.trim() !== studentEmail.trim()) {
                const [{ data: orgRow }, { data: subjRow }] = await Promise.all([
                  supabase.from('organizations').select('features').eq('id', orgId).maybeSingle(),
                  supabase.from('subjects').select('is_trial').eq('id', subjectId).maybeSingle(),
                ]);
                const feat = (orgRow as any)?.features;
                const featObj = feat && typeof feat === 'object' && !Array.isArray(feat) ? (feat as Record<string, unknown>) : {};
                const mode = featObj['trial_lesson_comment_mode'];
                const sendToParent = mode === 'student_and_parent' && (subjRow as any)?.is_trial === true;
                if (sendToParent) to = [studentEmail, payerEmail.trim()];
              }
            } catch {
              /* ignore parent email decision errors */
            }
            const ok = await sendEmail({
              type: 'session_comment_added',
              to,
              data: {
                studentName: updated.student?.full_name || selectedEvent.student?.full_name || '',
                tutorName: tutorProfile?.full_name || '',
                date: format(selectedEvent.start_time, 'yyyy-MM-dd'),
                time: format(selectedEvent.start_time, 'HH:mm'),
                comment: viewCommentText.trim(),
              },
            }).catch((err) => { console.error('Error sending comment email:', err); return false; });
            if (!ok) alert(t('cal.commentSavedEmailFailed'));
          } else {
            alert(t('cal.commentSavedNoEmail'));
          }
        }
      }
    }
    setViewCommentSaving(false);
  };

  // Handle assigning student to availability slot
  const handleAssignStudent = async () => {
    // Check if we have at least one student (either single or multi-select)
    const hasStudents = assignStudentIds.length > 0 || assignStudentId;
    if (!hasStudents || !assignSubjectId || !assignSelectedSlot || !editingSlot) return;
    setAssignSaving(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setAssignSaving(false);
      return;
    }

    const subject = subjects.find(s => s.id === assignSubjectId);

    // Determine which students to process
    const studentIdsToProcess = assignStudentIds.length > 0 ? assignStudentIds : [assignStudentId];

    const duration = assignDuration;

    // Get the date
    let dateStr: string;
    if (editingSlot.ruleIsRecurring) {
      dateStr = format(editingSlot.blockStart, 'yyyy-MM-dd');
    } else {
      dateStr = editingSlot.ruleDate || format(editingSlot.blockStart, 'yyyy-MM-dd');
    }

    const startDateTime = new Date(`${dateStr}T${assignSelectedSlot}`).toISOString();
    const endDateTime = new Date(new Date(`${dateStr}T${assignSelectedSlot}`).getTime() + duration * 60 * 1000).toISOString();

    // For group lessons, check if we have enough spots for all students
    if (subject?.is_group) {
      const { data: existingSessions } = await supabase
        .from('sessions')
        .select('id')
        .eq('tutor_id', user.id)
        .eq('start_time', startDateTime)
        .eq('subject_id', assignSubjectId)
        .eq('status', 'active');

      const currentCount = existingSessions?.length || 0;
      const maxStudents = subject.max_students || 5;
      const spotsNeeded = studentIdsToProcess.length;

      if (currentCount + spotsNeeded > maxStudents) {
        alert(t('cal.notEnoughSpots', { needed: String(spotsNeeded), available: String(maxStudents - currentCount) }));
        setAssignSaving(false);
        return;
      }
    }

    const tspAssign = getTutorSubjectPrice(subject?.name);
    for (const studentId of studentIdsToProcess) {
      const student = students.find(s => s.id === studentId);

      const pricing = individualPricing.find(
        (p) => p.student_id === studentId && p.subject_id === assignSubjectId
      );
      const price = pricing?.price ?? tspAssign?.price ?? subject?.price ?? 25;

      // Check if student has available lesson package for this subject
      let sessionPaid = false;
      let sessionPaymentStatus = 'pending';
      let lessonPackageId = null;

      if (assignSubjectId) {
        const { data: packages } = await supabase
          .from('lesson_packages')
          .select('*')
          .eq('student_id', studentId)
          .eq('subject_id', assignSubjectId)
          .eq('active', true)
          .eq('paid', true)
          .gt('available_lessons', 0)
          .order('created_at', { ascending: true })
          .limit(1);

        if (packages && packages.length > 0) {
          const pkg = packages[0];
          lessonPackageId = pkg.id;
          sessionPaid = true;
          sessionPaymentStatus = 'confirmed';

          // Update package: available_lessons-- and reserved_lessons++
          const { error: pkgError } = await supabase
            .from('lesson_packages')
            .update({
              available_lessons: pkg.available_lessons - 1,
              reserved_lessons: pkg.reserved_lessons + 1,
            })
            .eq('id', pkg.id);

          if (pkgError) {
            console.error('Error updating lesson package:', pkgError);
          } else {
            console.log(`[Calendar] Auto-deducted 1 lesson from package ${pkg.id} for student ${studentId}`);
          }
        }
      }

      const { data: sessionData, error: sessionError } = await supabase
        .from('sessions')
        .insert([{
          tutor_id: user.id,
          student_id: studentId,
          subject_id: assignSubjectId,
          start_time: startDateTime,
          end_time: endDateTime,
          status: 'active',
          paid: sessionPaid,
          payment_status: sessionPaymentStatus,
          lesson_package_id: lessonPackageId,
          price: price,
          topic: assignTopic || subject?.name || '',
          meeting_link: assignMeetingLink || subject?.meeting_link || null,
          available_spots: null, // Will be updated after all students are added
        }])
        .select()
        .single();

      if (sessionError || !sessionData) {
        console.error(`Error creating session for student ${studentId}:`, sessionError);
        continue; // Skip this student and continue with others
      }

      // Notify student & parent/payer
      if (student) {
        const { data: tutorProfile } = await supabase
          .from('profiles')
          .select('full_name, cancellation_hours, cancellation_fee_percent, stripe_account_id, organization_id, payment_timing, enable_per_lesson, enable_monthly_billing')
          .eq('id', user.id)
          .single();

        const normalizedPayer = String(student.payment_payer || '').trim().toLowerCase();
        const payerEmail = String(student.payer_email || '').trim();
        const hasPayer = normalizedPayer === 'parent' && payerEmail.length > 0;

        if (student.email) {
          sendEmail({
            type: 'booking_confirmation',
            to: student.email,
            data: {
              studentName: student.full_name,
              tutorName: tutorProfile?.full_name || '',
              date: dateStr,
              time: assignSelectedSlot,
              subject: subject?.name || '',
              price: hasPayer ? null : price,
              duration: duration,
              cancellationHours: hasPayer ? null : (tutorProfile?.cancellation_hours || 24),
              cancellationFeePercent: hasPayer ? null : (tutorProfile?.cancellation_fee_percent || 0),
              paymentStatus: hasPayer ? null : (sessionPaid ? 'paid' : 'pending'),
              meetingLink: meetingLink || null,
              hidePaymentInfo: hasPayer,
            },
          }).catch(err => console.error('Error sending booking email:', err));
        }

        if (hasPayer) {
          sendEmail({
            type: 'booking_confirmation',
            to: payerEmail,
            data: {
              forPayer: true,
              bookedBy: 'tutor',
              studentName: student.full_name,
              tutorName: tutorProfile?.full_name || '',
              date: dateStr,
              time: assignSelectedSlot,
              subject: subject?.name || '',
              price,
              duration: duration,
              cancellationHours: tutorProfile?.cancellation_hours ?? 24,
              cancellationFeePercent: tutorProfile?.cancellation_fee_percent ?? 0,
              paymentStatus: sessionPaid ? 'paid' : 'pending',
              meetingLink: meetingLink || null,
            },
          }).catch(err => console.error('Error sending payer booking confirmation email:', err));

          let effectivePaymentTiming = ((tutorProfile as any)?.payment_timing as string | null) ?? 'before_lesson';
          let effectiveEnablePerLesson = !!(tutorProfile as any)?.enable_per_lesson;
          let effectiveEnableMonthlyBilling = !!(tutorProfile as any)?.enable_monthly_billing;
          if ((tutorProfile as any)?.organization_id) {
            const { data: orgPayFlags } = await supabase
              .from('organizations')
              .select('enable_per_lesson, enable_monthly_billing, payment_timing')
              .eq('id', (tutorProfile as any).organization_id)
              .maybeSingle();
            if (orgPayFlags) {
              effectiveEnablePerLesson = !!(orgPayFlags as any).enable_per_lesson;
              effectiveEnableMonthlyBilling = !!(orgPayFlags as any).enable_monthly_billing;
              effectivePaymentTiming = ((orgPayFlags as any).payment_timing as string | null) || effectivePaymentTiming;
            }
          }

          const studentModel = student.payment_model as string | null | undefined;
          const allowsPerLessonNow =
            studentModel === 'per_lesson'
              ? true
              : studentModel === 'monthly_billing' || studentModel === 'prepaid_packages'
                ? false
                : effectiveEnablePerLesson && !effectiveEnableMonthlyBilling;

          const shouldSendParentPaymentNow =
            !sessionPaid &&
            !lessonPackageId &&
            allowsPerLessonNow &&
            effectivePaymentTiming === 'before_lesson';

          if (shouldSendParentPaymentNow) {
            try {
              const checkoutRes = await fetch('/api/stripe-checkout', {
                method: 'POST',
                headers: await authHeaders(),
                body: JSON.stringify({ sessionId: sessionData.id, payerEmail }),
              });
              const checkoutJson = await checkoutRes.json().catch(() => ({} as any));
              if (checkoutJson?.creditFullyCovered) {
                console.info('[Calendar] Credit fully covered lesson (assign)');
              } else if (checkoutRes.ok && checkoutJson?.url) {
                sendEmail({
                  type: 'stripe_payment_forwarding',
                  to: payerEmail,
                  data: {
                    studentName: student.full_name,
                    tutorName: tutorProfile?.full_name || '',
                    date: dateStr,
                    time: assignSelectedSlot,
                    amount: sessionData.price ?? price,
                    paymentLink: checkoutJson.url,
                  },
                }).catch(err => console.error('Error sending parent payment email:', err));
              }
            } catch (err) {
              console.error('Error creating checkout for parent:', err);
            }
          }
        }
      }

      // Sync to Google Calendar
      if (googleCalendarConnected) {
        void (async () => {
          await fetch('/api/google-calendar-sync', {
            method: 'POST',
            headers: await authHeaders(),
            body: JSON.stringify({ userId: user.id, sessionId: sessionData.id }),
          });
        })().catch(err => console.error('Google Calendar sync error:', err));
      }
    }

    // Update available_spots for all sessions at this time (for group lessons)
    if (subject?.is_group) {
      const { data: allSessionsAtTime } = await supabase
        .from('sessions')
        .select('id')
        .eq('tutor_id', user.id)
        .eq('start_time', startDateTime)
        .eq('subject_id', assignSubjectId)
        .eq('status', 'active');

      if (allSessionsAtTime) {
        const remaining = (subject.max_students || 5) - allSessionsAtTime.length;
        await supabase
          .from('sessions')
          .update({ available_spots: Math.max(0, remaining) })
          .in('id', allSessionsAtTime.map(s => s.id));
      }
    }

    // Close modals and refresh
    setIsAssignStudentOpen(false);
    setIsSlotEditOpen(false);
    setAssignStudentId('');
    setAssignStudentIds([]);
    setAssignSubjectId('');
    setAssignSelectedSlot('');
    setAssignMeetingLink('');
    setAssignTopic('');
    fetchData();
    setAssignSaving(false);
  };

  const handleMarkPaid = async () => {
    if (!selectedEvent) return;
    if (!orgPolicy.canToggleSessionPaid) return;
    setSaving(true);

    const newPaid = !selectedEvent.paid;
    const newStatus = newPaid ? 'confirmed' : 'pending';

    const { error } = await supabase
      .from('sessions')
      .update({ paid: newPaid, payment_status: newStatus })
      .eq('id', selectedEvent.id);

    if (!error) {
      setIsEventModalOpen(false);
      fetchData();
    }
    setSaving(false);
  };

  const handleCancelSession = async () => {
    if (!selectedEvent) return;

    // Step 1: Show cancel button (first click)
    if (cancelConfirmId !== selectedEvent.id) {
      // For recurring or group sessions, ask whether to cancel one or all future
      if ((isGroupSession || selectedEvent.recurring_session_id) && !groupCancelChoice) {
        setGroupCancelChoice('single'); // Open the choice dialog
        return;
      }
      setCancelConfirmId(selectedEvent.id);
      setCancellationReason('');
      return;
    }

    // Step 2: Validate cancellation reason
    if (cancellationReason.trim().length < 5) return;

    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { data: tutorProfile } = await supabase.from('profiles').select('full_name, email').eq('id', user?.id).single();

    try {
      if (groupCancelChoice === 'all_future' && (isGroupSession || selectedEvent.recurring_session_id)) {
        // Cancel all future sessions in the same recurring/group scope
        let futureQuery = supabase
          .from('sessions')
          .select('*, student:students(full_name, email)')
          .eq('tutor_id', user?.id || '')
          .gte('start_time', selectedEvent.start_time.toISOString())
          .eq('status', 'active');

        if (selectedEvent.recurring_session_id) {
          futureQuery = futureQuery.eq('recurring_session_id', selectedEvent.recurring_session_id);
        } else {
          futureQuery = futureQuery.eq('subject_id', selectedEvent.subject_id);
        }

        const { data: futureSessions } = await futureQuery;

        if (futureSessions && futureSessions.length > 0) {
          let successCount = 0;
          for (const session of futureSessions) {
            const { data: studentData } = await supabase.from('students').select('email, full_name').eq('id', session.student_id).single();

            const { success } = await cancelSessionAndFillWaitlist({
              sessionId: session.id,
              tutorId: user?.id || '',
              reason: cancellationReason.trim(),
              cancelledBy: 'tutor',
              studentName: studentData?.full_name || '',
              tutorName: tutorProfile?.full_name || '',
              studentEmail: studentData?.email || null,
              tutorEmail: tutorProfile?.email || null,
            });

            if (success) successCount++;
          }

          if (successCount > 0) {
            alert(t('cal.cancelledCount', { count: String(successCount) }));
          }
        }
      } else {
        // Cancel single session
        const { data: studentData } = await supabase.from('students').select('email').eq('id', selectedEvent.student_id).single();

        const { success } = await cancelSessionAndFillWaitlist({
          sessionId: selectedEvent.id,
          tutorId: user?.id || '',
          reason: cancellationReason.trim(),
          cancelledBy: 'tutor',
          studentName: selectedEvent.student?.full_name || '',
          tutorName: tutorProfile?.full_name || '',
          studentEmail: studentData?.email || null,
          tutorEmail: tutorProfile?.email || null,
        });

        if (!success) {
          alert(t('cal.errorCancelling'));
        }
      }

      setIsEventModalOpen(false);
      setCancelConfirmId(null);
      setCancellationReason('');
      setGroupCancelChoice(null);
      fetchData();
      // Update Google Calendar – remove cancelled session and update free time blocks
      try {
        if (user?.id) {
          await fetch('/api/google-calendar-sync', {
            method: 'POST',
            headers: await authHeaders(),
            body: JSON.stringify({ userId: user.id }),
          });
        }
      } catch (err) {
        console.error('Google Calendar sync after cancel:', err);
      }
    } catch (error) {
      console.error('Error cancelling session:', error);
      alert(t('cal.errorCancelling'));
    }

    setSaving(false);
  };

  // Mass Cancel Handlers
  const handleMassCancelPreview = async () => {
    if (!massCancelStartDate || !massCancelEndDate) {
      setMassCancelError(t('cal.fillBothDates'));
      return;
    }

    // Validate date range
    const start = new Date(massCancelStartDate);
    const end = new Date(massCancelEndDate);
    const daysDiff = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));

    if (daysDiff < 0) {
      setMassCancelError(t('cal.endDateAfterStart'));
      return;
    }

    if (daysDiff > 90) {
      setMassCancelError(t('cal.periodMax90Days'));
      return;
    }

    setMassCancelLoading(true);
    setMassCancelError(null);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error(t('cal.notAuthorized'));

      // Fetch active sessions in date range
      const { data, error: fetchError } = await supabase
        .from('sessions')
        .select('*, student:students!inner(full_name, email), subjects(name, is_trial)')
        .eq('tutor_id', user.id)
        .eq('status', 'active')
        .gte('start_time', massCancelStartDate + 'T00:00:00')
        .lte('start_time', massCancelEndDate + 'T23:59:59')
        .order('start_time', { ascending: true });

      if (fetchError) throw fetchError;

      if (!data || data.length === 0) {
        setMassCancelError(t('cal.noActiveSessionsInPeriod'));
        setMassCancelPreviewSessions([]);
        setMassCancelPreviewMode(false);
      } else {
        const parsedSessions = data.map(session => ({
          ...session,
          start_time: new Date(session.start_time),
          end_time: new Date(session.end_time),
        }));
        setMassCancelPreviewSessions(parsedSessions);
        setMassCancelPreviewMode(true);
      }
    } catch (err: any) {
      console.error('Error fetching sessions for mass cancel:', err);
      setMassCancelError(err.message || t('cal.massCancelError'));
    } finally {
      setMassCancelLoading(false);
    }
  };

  const handleMassCancelConfirm = async () => {
    if (massCancelPreviewSessions.length === 0) {
      setMassCancelError(t('cal.noCancelSessions'));
      return;
    }

    if (massCancellationReason.trim().length < 5) {
      setMassCancelError(t('cal.cancellationMin5'));
      return;
    }

    setMassCancelLoading(true);
    setMassCancelError(null);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error(t('cal.notAuthorized'));

      const { data: tutorProfile } = await supabase
        .from('profiles')
        .select('full_name, email')
        .eq('id', user.id)
        .single();

      let successCount = 0;
      let failCount = 0;

      // Cancel each session individually
      for (const session of massCancelPreviewSessions) {
        try {
          const { success } = await cancelSessionAndFillWaitlist({
            sessionId: session.id,
            tutorId: user.id,
            reason: massCancellationReason.trim(),
            cancelledBy: 'tutor',
            studentName: session.student?.full_name || '',
            tutorName: tutorProfile?.full_name || '',
            studentEmail: session.student?.email || null,
            tutorEmail: tutorProfile?.email || null,
          });

          if (success) {
            successCount++;
          } else {
            failCount++;
          }
        } catch (err) {
          console.error(`Failed to cancel session ${session.id}:`, err);
          failCount++;
        }
      }

      // Sync with Google Calendar
      try {
        await fetch('/api/google-calendar-sync', {
          method: 'POST',
          headers: await authHeaders(),
          body: JSON.stringify({ userId: user.id }),
        });
      } catch (err) {
        console.error('Google Calendar sync after mass cancel:', err);
      }

      // Close modal and refresh data
      setIsMassCancelModalOpen(false);
      setMassCancelPreviewMode(false);
      setMassCancelPreviewSessions([]);
      setMassCancellationReason('');
      setMassCancelStartDate('');
      setMassCancelEndDate('');
      fetchData();

      // Show success message
      alert(
        t('cal.massCancelSuccess', { success: String(successCount), failPart: failCount > 0 ? t('cal.massCancelFailed', { count: String(failCount) }) : '' })
      );
    } catch (err: any) {
      console.error('Error during mass cancel:', err);
      setMassCancelError(err.message || t('cal.massCancelError'));
    } finally {
      setMassCancelLoading(false);
    }
  };

  const handleMassCancelModalClose = () => {
    if (!massCancelLoading) {
      setIsMassCancelModalOpen(false);
      setMassCancelPreviewMode(false);
      setMassCancelPreviewSessions([]);
      setMassCancellationReason('');
      setMassCancelError(null);
    }
  };

  const handleSaveChanges = async () => {
    if (!selectedEvent || !editNewStartTime) return;
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setSaving(false); return; }
      const { data: tutorProfile } = await supabase.from('profiles').select('full_name, email').eq('id', user.id).single();

      const oldStart = selectedEvent.start_time;
      const oldEnd = selectedEvent.end_time;
      if (!editDurationMinutes || editDurationMinutes <= 0) {
        alert(t('cal.durationMustBePositive'));
        setSaving(false);
        return;
      }
      const durMs = Math.max(1, Number(editDurationMinutes || 0)) * 60 * 1000;

      const newStart = new Date(editNewStartTime);
      const newEnd = new Date(newStart.getTime() + durMs);

      const timeChanged = oldStart.getTime() !== newStart.getTime();
      const durationChanged =
        Math.round((oldEnd.getTime() - oldStart.getTime()) / 60000) !== Math.round(editDurationMinutes);

      if (timeChanged || durationChanged) {
        const { data: overlapping } = await supabase
          .from('sessions')
          .select('*')
          .eq('tutor_id', user.id)
          .neq('status', 'cancelled')
          .neq('id', selectedEvent.id)
          .or(`start_time.lte.${newEnd.toISOString()},end_time.gte.${newStart.toISOString()}`);

        const hasRealOverlap = overlapping?.some(o => {
          const os = new Date(o.start_time).getTime();
          const oe = new Date(o.end_time).getTime();
          const ns = newStart.getTime();
          const ne = newEnd.getTime();
          return (ns >= os && ns < oe) || (ne > os && ne <= oe) || (ns <= os && ne >= oe);
        });

        if (hasRealOverlap) {
          alert(t('cal.duplicateTime'));
          setSaving(false);
          return;
        }
      }

      const applyToAllFuture = groupEditChoice === 'all_future' && (isGroupSession || !!selectedEvent.recurring_session_id);
      let error: any = null;

      if (applyToAllFuture) {
        let futureQuery = supabase
          .from('sessions')
          .select('id, start_time, end_time')
          .eq('tutor_id', user.id)
          .gte('start_time', selectedEvent.start_time.toISOString())
          .eq('status', 'active');

        if (selectedEvent.recurring_session_id) {
          futureQuery = futureQuery.eq('recurring_session_id', selectedEvent.recurring_session_id);
        } else {
          futureQuery = futureQuery.eq('subject_id', selectedEvent.subject_id);
        }

        const { data: futureSessions, error: futureError } = await futureQuery;
        if (futureError) {
          error = futureError;
        } else {
          const shiftMs = newStart.getTime() - oldStart.getTime();

          for (const session of (futureSessions || [])) {
            const rowOldStart = new Date(session.start_time);
            const rowNewStart = new Date(rowOldStart.getTime() + shiftMs);
            const rowNewEnd = new Date(rowNewStart.getTime() + durMs);

            const { data: overlapping } = await supabase
              .from('sessions')
              .select('id, start_time, end_time')
              .eq('tutor_id', user.id)
              .neq('status', 'cancelled')
              .neq('id', session.id)
              .or(`start_time.lte.${rowNewEnd.toISOString()},end_time.gte.${rowNewStart.toISOString()}`);

            const hasRealOverlap = overlapping?.some(o => {
              const os = new Date(o.start_time).getTime();
              const oe = new Date(o.end_time).getTime();
              const ns = rowNewStart.getTime();
              const ne = rowNewEnd.getTime();
              return (ns >= os && ns < oe) || (ne > os && ne <= oe) || (ns <= os && ne >= oe);
            });

            if (hasRealOverlap) {
              error = new Error(`Laiko konfliktas ${format(rowOldStart, 'yyyy-MM-dd')}`);
              break;
            }

            const { error: rowError } = await supabase.from('sessions').update({
              start_time: rowNewStart.toISOString(),
              end_time: rowNewEnd.toISOString(),
              topic: editTopic,
              meeting_link: editMeetingLink,
              tutor_comment: editTutorComment || null,
              show_comment_to_student: editShowCommentToStudent
            }).eq('id', session.id);

            if (rowError) {
              error = rowError;
              break;
            }
          }
        }
      } else {
        const { error: singleError } = await supabase.from('sessions').update({
          start_time: newStart.toISOString(),
          end_time: newEnd.toISOString(),
          topic: editTopic,
          meeting_link: editMeetingLink,
          tutor_comment: editTutorComment || null,
          show_comment_to_student: editShowCommentToStudent
        }).eq('id', selectedEvent.id);
        error = singleError;
      }

      if (!error) {
        // Send comment email if checkbox is checked AND it wasn't already checked/sent
        if (editShowCommentToStudent && editTutorComment && (editTutorComment !== selectedEvent.tutor_comment || (!selectedEvent.show_comment_to_student && editShowCommentToStudent))) {
          let studentEmail = selectedEvent?.student?.email;
          if (!studentEmail && selectedEvent?.student_id) {
            const { data: studentRow } = await supabase.from('students').select('email, full_name').eq('id', selectedEvent.student_id).single();
            studentEmail = studentRow?.email;
          }
          if (studentEmail) {
            const ok = await sendEmail({
              type: 'session_comment_added',
              to: studentEmail,
              data: {
                studentName: selectedEvent?.student?.full_name || '',
                tutorName: tutorProfile?.full_name || '',
                date: format(newStart, 'yyyy-MM-dd'),
                time: format(newStart, 'HH:mm'),
                comment: editTutorComment,
              },
            }).catch((err) => { console.error('Error sending comment email:', err); return false; });
            if (!ok) alert(t('cal.commentSavedEmailFailed2'));
          } else {
            alert(t('cal.commentSavedNoEmail'));
          }
        }

        // Send reschedule email only to student
        if (timeChanged) {
          const { data: studentData } = await supabase.from('students').select('email').eq('id', selectedEvent.student_id).single();
          if (studentData?.email) {
            await sendEmail({
              type: 'lesson_rescheduled',
              to: studentData.email,
              data: {
                studentName: selectedEvent.student?.full_name || '',
                tutorName: tutorProfile?.full_name || '',
                oldDate: format(oldStart, 'yyyy-MM-dd'),
                oldTime: format(oldStart, 'HH:mm'),
                newDate: format(newStart, 'yyyy-MM-dd'),
                newTime: format(newStart, 'HH:mm'),
                rescheduledBy: 'tutor',
                recipientRole: 'student',
              }
            });
          }
        }

        if (googleCalendarConnected && (timeChanged || durationChanged)) {
          try {
            if (applyToAllFuture) {
              await fetch('/api/google-calendar-sync', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: user.id }),
              });
            } else {
              await fetch('/api/google-calendar-sync', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: user.id, sessionId: selectedEvent.id }),
              });
            }
          } catch (e) {
            console.error('Google Calendar sync error:', e);
          }
        }

        setIsEditingSession(false);
        setGroupEditChoice(null);
        fetchData();
      } else {
        alert(t('cal.failedToUpdate') + ': ' + error.message);
      }
    } catch (err) {
      console.error(err);
    }
    setSaving(false);
  };

  const hardDeleteSession = async (sessionId: string, deleteScope: 'single' | 'future' = 'single') => {
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) throw new Error('Neautorizuota');

    const resp = await fetch('/api/delete-session', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ sessionId, deleteScope }),
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      throw new Error(text || t('cal.deleteFailed'));
    }
  };

  const hardDeleteSelectedWithApproval = async (deleteScope: 'single' | 'future') => {
    if (!selectedEvent) return;
    const msg =
      deleteScope === 'future'
        ? t('cal.deleteConfirmFuture')
        : t('cal.deleteConfirmSingle');
    const confirmed = confirm(msg);
    if (!confirmed) return;

    setSaving(true);
    try {
      await hardDeleteSession(selectedEvent.id, deleteScope);
      setIsDeleteRecurringDialogOpen(false);
      setIsEventModalOpen(false);
      setSelectedEvent(null);
      setSelectedGroupSessions([]);
      fetchData();
    } catch (e: any) {
      alert(e?.message || t('cal.deleteFailed'));
    } finally {
      setSaving(false);
    }
  };

  const handleHardDeleteSelected = async () => {
    if (!selectedEvent) return;
    const isRecurring = Boolean((selectedEvent as any)?.recurring_session_id);
    if (isRecurring) {
      setIsDeleteRecurringDialogOpen(true);
      return;
    }
    await hardDeleteSelectedWithApproval('single');
  };

  const handleMarkCompleted = async () => {
    if (!selectedEvent) return;
    setSaving(true);

    const { error } = await supabase
      .from('sessions')
      .update({ status: 'completed', no_show_when: null })
      .eq('id', selectedEvent.id);

    if (!error) {
      setIsEventModalOpen(false);
      fetchData();
    }
    setSaving(false);
  };

  const handleMarkStudentNoShowForSession = async (session: Session, when?: NoShowWhen) => {
    if (session.status !== 'active' && session.status !== 'completed') return;
    setNoShowSavingId(session.id);
    try {
      const resolvedWhen =
        when ??
        defaultNoShowWhenForNow(new Date(session.start_time), new Date(session.end_time));
      const patch = buildNoShowSessionPatch(resolvedWhen, (session as any).tutor_comment);
      const { error } = await supabase
        .from('sessions')
        .update(patch)
        .eq('id', session.id);

      if (!error) {
        if (isGroupSession) {
          setSelectedGroupSessions((prev) =>
            prev.map((s) => (s.id === session.id ? { ...s, status: 'no_show' } : s))
          );
          setSelectedEvent((prev) =>
            prev && prev.id === session.id ? { ...prev, status: 'no_show' } : prev
          );
        } else {
          setIsEventModalOpen(false);
        }
        fetchData();
        void (async () => {
          await fetch('/api/notify-session-no-show', {
            method: 'POST',
            headers: await authHeaders(),
            body: JSON.stringify({ sessionId: session.id }),
          });
        })().catch(() => {});
      }
    } finally {
      setNoShowSavingId(null);
    }
  };

  const handleRevertSessionToPlanned = async (session: Session) => {
    setNoShowSavingId(session.id);
    try {
      const { error } = await supabase
        .from('sessions')
        .update({ status: 'active', no_show_when: null })
        .eq('id', session.id);
      if (!error) {
        if (isGroupSession) {
          setSelectedGroupSessions((prev) =>
            prev.map((s) => (s.id === session.id ? { ...s, status: 'active' as const, no_show_when: null } : s))
          );
          setSelectedEvent((prev) =>
            prev && prev.id === session.id ? { ...prev, status: 'active' as const, no_show_when: null } : prev
          );
        } else {
          setSelectedEvent((prev) =>
            prev && prev.id === session.id ? { ...prev, status: 'active' as const, no_show_when: null } : prev
          );
        }
        fetchData();
      }
    } finally {
      setNoShowSavingId(null);
    }
  };

  const handleAddStudentToGroup = async () => {
    if (!selectedEvent || addToGroupStudentIds.length === 0) return;
    setSaving(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setSaving(false); return; }

      const { data: tutorProfile } = await supabase
        .from('profiles')
        .select('full_name, email')
        .eq('id', user.id)
        .single();

      const subject = subjects.find(s => s.id === selectedEvent.subject_id);
      const durationMs = selectedEvent.end_time.getTime() - selectedEvent.start_time.getTime();

      let totalAddedSessions = 0;

      // Loop through each selected student
      for (const studentId of addToGroupStudentIds) {
        const { data: studentData } = await supabase
          .from('students')
          .select('full_name, email')
          .eq('id', studentId)
          .single();

        if (addToGroupChoice === 'all_future') {
          // Add student to all future sessions in recurring group
          // Find all future sessions with same subject, tutor, and time slot
          const { data: futureSessions } = await supabase
            .from('sessions')
            .select('*')
            .eq('tutor_id', user.id)
            .eq('subject_id', selectedEvent.subject_id)
            .gte('start_time', selectedEvent.start_time)
            .eq('status', 'active');

          if (futureSessions && futureSessions.length > 0) {
            // Group sessions by start_time to find unique occurrences
            const uniqueTimes = new Map<string, any>();
            futureSessions.forEach(session => {
              const timeKey = session.start_time;
              if (!uniqueTimes.has(timeKey)) {
                uniqueTimes.set(timeKey, session);
              }
            });

            // Create session for student at each unique time
            const newSessions = [];
            for (const [, sessionTemplate] of Array.from(uniqueTimes)) {
              newSessions.push({
                tutor_id: user.id,
                student_id: studentId,
                subject_id: selectedEvent.subject_id,
                start_time: sessionTemplate.start_time,
                end_time: sessionTemplate.end_time,
                status: 'active',
                meeting_link: sessionTemplate.meeting_link || null,
                topic: sessionTemplate.topic || null,
                price: sessionTemplate.price,
                paid: false,
                payment_status: 'pending',
                recurring_session_id: sessionTemplate.recurring_session_id || null,
                available_spots: null,
              });
            }

            const { data: createdSessions, error } = await supabase
              .from('sessions')
              .insert(newSessions)
              .select();

            if (error) {
              console.error(`Error adding student ${studentData?.full_name}:`, error.message);
              continue; // Skip this student and continue with others
            }

            totalAddedSessions += createdSessions?.length || 0;

            // Update available_spots for all existing sessions
            for (const [timeKey] of Array.from(uniqueTimes)) {
              const { data: sessionsAtTime } = await supabase
                .from('sessions')
                .select('id')
                .eq('tutor_id', user.id)
                .eq('start_time', timeKey)
                .eq('subject_id', selectedEvent.subject_id)
                .eq('status', 'active');

              if (sessionsAtTime) {
                const remaining = (subject?.max_students || 0) - sessionsAtTime.length;
                await supabase
                  .from('sessions')
                  .update({ available_spots: Math.max(0, remaining) })
                  .in('id', sessionsAtTime.map(s => s.id));
              }
            }

            if (studentData?.email && createdSessions && createdSessions.length > 0) {
              const firstSession = createdSessions[0];
              await sendEmail({
                type: 'booking_confirmation',
                to: studentData.email,
                data: {
                  studentName: studentData.full_name,
                  tutorName: tutorProfile?.full_name || '',
                  date: format(new Date(firstSession.start_time), 'yyyy-MM-dd'),
                  time: format(new Date(firstSession.start_time), 'HH:mm'),
                  subject: selectedEvent.topic || null,
                  price: selectedEvent.price || 0,
                  duration: Math.round(durationMs / 60000),
                  cancellationHours: 24,
                  cancellationFeePercent: 0,
                  paymentStatus: 'pending',
                  meetingLink: selectedEvent.meeting_link || null,
                },
              }).catch(err => console.error('Error sending booking confirmation:', err));
            }
          }
        } else {
          // Add student to single session
          const { data: newSession, error } = await supabase
            .from('sessions')
            .insert({
              tutor_id: user.id,
              student_id: studentId,
              subject_id: selectedEvent.subject_id,
              start_time: selectedEvent.start_time.toISOString(),
              end_time: selectedEvent.end_time.toISOString(),
              status: 'active',
              meeting_link: selectedEvent.meeting_link || null,
              topic: selectedEvent.topic || null,
              price: selectedEvent.price,
              paid: false,
              payment_status: 'pending',
              recurring_session_id: selectedEvent.recurring_session_id || null,
              available_spots: null,
            })
            .select()
            .single();

          if (error) {
            console.error(`Error adding student ${studentData?.full_name}:`, error.message);
            continue; // Skip this student and continue with others
          }

          totalAddedSessions += 1;

          // Update available_spots for all sessions at this time
          const { data: sessionsAtTime } = await supabase
            .from('sessions')
            .select('id')
            .eq('tutor_id', user.id)
            .eq('start_time', selectedEvent.start_time.toISOString())
            .eq('subject_id', selectedEvent.subject_id)
            .eq('status', 'active');

          if (sessionsAtTime && subject) {
            const remaining = (subject.max_students || 0) - sessionsAtTime.length;
            await supabase
              .from('sessions')
              .update({ available_spots: Math.max(0, remaining) })
              .in('id', sessionsAtTime.map(s => s.id));
          }

          if (studentData?.email && newSession) {
            await sendEmail({
              type: 'booking_confirmation',
              to: studentData.email,
              data: {
                studentName: studentData.full_name,
                tutorName: tutorProfile?.full_name || '',
                date: format(selectedEvent.start_time, 'yyyy-MM-dd'),
                time: format(selectedEvent.start_time, 'HH:mm'),
                subject: selectedEvent.topic || null,
                price: selectedEvent.price || 0,
                duration: Math.round(durationMs / 60000),
                cancellationHours: 24,
                cancellationFeePercent: 0,
                paymentStatus: 'pending',
                meetingLink: selectedEvent.meeting_link || null,
              },
            }).catch(err => console.error('Error sending booking confirmation:', err));
          }
        }
      }

      alert(t('cal.addStudentsSuccess', { count: String(addToGroupStudentIds.length) }));
      setIsAddToGroupOpen(false);
      setAddToGroupStudentIds([]);
      setAddToGroupChoice('single');
      fetchData();
    } catch (err) {
      console.error('Error adding student to group:', err);
      alert(t('cal.errorAddingStudentAlert'));
    }

    setSaving(false);
  };

  const handleRemoveStudentFromGroup = async (sessionToRemove: Session) => {
    if (!selectedEvent) return;

    const studentName = sessionToRemove.student?.full_name || t('cal.thisStudent');
    const confirmed = confirm(t('cal.confirmRemoveStudent', { name: studentName }));
    if (!confirmed) return;

    setSaving(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setSaving(false); return; }

      const subject = subjects.find(s => s.id === selectedEvent.subject_id);

      try {
        await hardDeleteSession(sessionToRemove.id);
      } catch (e: any) {
        alert(t('cal.errorRemovingStudent', { msg: e?.message || t('cal.failedToRemove') }));
        setSaving(false);
        return;
      }

      // Update available_spots for all sessions at this time
      const { data: sessionsAtTime } = await supabase
        .from('sessions')
        .select('id')
        .eq('tutor_id', user.id)
        .eq('start_time', selectedEvent.start_time.toISOString())
        .eq('subject_id', selectedEvent.subject_id)
        .eq('status', 'active');

      if (sessionsAtTime) {
        const remaining = (subject?.max_students || 0) - sessionsAtTime.length;
        await supabase
          .from('sessions')
          .update({ available_spots: Math.max(0, remaining) })
          .in('id', sessionsAtTime.map(s => s.id));
      }

      // Send cancellation email to removed student
      if (sessionToRemove.student?.email) {
        const { data: tutorProfile } = await supabase
          .from('profiles')
          .select('full_name, email')
          .eq('id', user.id)
          .single();

        await sendEmail({
          type: 'session_cancelled',
          to: sessionToRemove.student.email,
          data: {
            studentName: sessionToRemove.student.full_name,
            tutorName: tutorProfile?.full_name || '',
            date: format(selectedEvent.start_time, 'yyyy-MM-dd'),
            time: format(selectedEvent.start_time, 'HH:mm'),
            subject: selectedEvent.topic || '',
            reason: t('cal.removedFromGroup'),
          },
        }).catch(err => console.error('Error sending cancellation email:', err));
      }

      fetchData();
      setIsEventModalOpen(false);
    } catch (err) {
      console.error('Error removing student from group:', err);
      alert(t('cal.errorRemovingStudentAlert'));
    }

    setSaving(false);
  };

  const eventStyleGetter = (event: any) => {
    if (event.isBackground) {
      return {
        style: {
          backgroundColor: 'rgba(16, 185, 129, 0.2)',
          border: '1px dashed rgba(5, 150, 105, 0.55)',
          borderRadius: '8px',
          color: '#047857',
          pointerEvents: 'auto' as const,
          cursor: 'pointer',
        }
      };
    }

    const subj = subjects.find((s) => s.name === event.topic);
    let backgroundColor = subj?.color || '#6366f1';

    if (event.status === 'cancelled') {
      return {
        style: {
          backgroundColor: '#ef4444',
          opacity: 0.5,
          border: 'none',
          borderRadius: '8px',
          color: 'white',
        },
      };
    }
    if (event.status === 'no_show') {
      return {
        style: {
          backgroundColor: '#fda4af',
          opacity: 1,
          border: 'none',
          borderRadius: '8px',
          color: 'white',
        },
      };
    }

    const endAt = event.end ?? event.end_time;
    const hasEnded = new Date(endAt).getTime() <= Date.now();
    const isPaid =
      event.paid === true ||
      event.payment_status === 'paid' ||
      event.payment_status === 'confirmed';

    const unpaidOccurred =
      (event.status === 'completed' && !isPaid) ||
      (event.status === 'active' && hasEnded && !isPaid) ||
      (hasEnded && event.payment_status === 'paid_by_student');

    if (unpaidOccurred) {
      backgroundColor = '#ca8a04';
    } else if (isPaid || event.status === 'completed') {
      backgroundColor = '#10b981';
    }

    return {
      style: {
        backgroundColor,
        opacity: 1,
        border: 'none',
        borderRadius: '8px',
        color: 'white',
      },
    };
  };

  // Stats
  const activeSessions = sessions.filter((s) => s.status === 'active').length;
  const paidSessions = sessions.filter((s) => s.paid).length;
  const cancelledSessions = sessions.filter((s) => s.status === 'cancelled').length;

  // Calendar label
  const getLabel = () => {
    if (currentView === 'month') {
      return format(currentDate, 'MMMM yyyy', { locale: dateFnsLocale });
    }
    if (currentView === 'week') {
      return format(currentDate, "'" + t('cal.week') + ":' w, MMMM yyyy", { locale: dateFnsLocale });
    }
    return format(currentDate, 'EEEE, d MMMM yyyy', { locale: dateFnsLocale });
  };

  const getLabelShort = () => {
    if (currentView === 'month') return format(currentDate, 'MMM yyyy', { locale: dateFnsLocale });
    if (currentView === 'week') return format(currentDate, "w 'sav.'", { locale: dateFnsLocale });
    return format(currentDate, 'EEE, d MMM', { locale: dateFnsLocale });
  };

  const handleNavigate = (direction: 'back' | 'next' | 'today') => {
    if (direction === 'today') {
      setCurrentDate(new Date());
      return;
    }
    const newDate = new Date(currentDate);
    if (currentView === 'month') {
      newDate.setMonth(newDate.getMonth() + (direction === 'next' ? 1 : -1));
    } else if (currentView === 'week') {
      newDate.setDate(newDate.getDate() + (direction === 'next' ? 7 : -7));
    } else {
      newDate.setDate(newDate.getDate() + (direction === 'next' ? 1 : -1));
    }
    setCurrentDate(newDate);
  };

  return (
    <Layout>
      <div className="flex flex-col w-full">
        {toastMessage && (
          <Toast
            message={toastMessage.message}
            type={toastMessage.type}
            onClose={() => setToastMessage(null)}
          />
        )}
        <div className="flex flex-col w-full max-w-none px-0 sm:px-1">
        {/* Header */}
        <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center mb-4 flex-shrink-0">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Kalendorius</h1>
          <p className="text-sm text-gray-500 mt-0.5">{t('cal.manageSchedule')}</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {googleCalendarConnected ? (
            <div className="flex gap-2">
              <Button
                variant="default"
                onClick={handleGoogleCalendarSync}
                disabled={googleCalendarSyncing}
                className="gap-2 rounded-2xl bg-green-600 hover:bg-green-700 text-white shadow-sm border border-green-500"
                title="Sinchronizuoti su Google Calendar"
              >
                <CalendarDays className="w-4 h-4" />
                {googleCalendarSyncing ? (
                  <span className="hidden sm:inline font-semibold">Sinchronizuojama...</span>
                ) : (
                  <span className="hidden sm:inline font-semibold">Sinchronizuoti Google Calendar</span>
                )}
              </Button>
              <Button
                variant="outline"
                onClick={handleGoogleCalendarDisconnect}
                disabled={googleCalendarSyncing}
                className="gap-2 rounded-xl border-gray-200 text-gray-600 hover:bg-gray-50"
                title="Atjungti Google Calendar"
              >
                <XCircle className="w-4 h-4" />
              </Button>
            </div>
          ) : (
            <Button
              variant="outline"
              onClick={handleGoogleCalendarConnect}
              className="gap-2 rounded-xl border-blue-200 text-blue-700 hover:bg-blue-50"
              title="Prijungti Google Calendar"
            >
              <CalendarDays className="w-4 h-4" />
              <span className="hidden sm:inline">Prijungti Google Calendar</span>
            </Button>
          )}
          <Button
            variant="outline"
            onClick={() => {
              if (!isOrgTutor && (!stripeConnected || subjects.length === 0)) {
                alert(t('cal.connectStripeFirstShort'));
                return;
              }
              setIsAvailabilityModalOpen(true);
            }}
            className="gap-2 rounded-xl border-gray-200"
          >
            <Settings2 className="w-4 h-4" />
            <span className="hidden sm:inline">{t('cal.scheduleSettings')}</span>
          </Button>
          <Button
            variant="outline"
            onClick={() => setIsMassCancelModalOpen(true)}
            className="gap-2 rounded-xl border-red-200 text-red-700 hover:bg-red-50"
          >
            <XCircle className="w-4 h-4" />
            <span className="hidden sm:inline">{t('cal.cancelLessons')}</span>
          </Button>
          <Button
            onClick={() => {
              const now = new Date();
              const end = addHours(now, 1);
              handleSelectSlot({ start: now, end }, { forceCreate: true });
            }}
            className="gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white shadow-md hover:shadow-lg transition-all font-semibold"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">{t('cal.createLesson')}</span>
          </Button>
        </div>
      </div>

      {/* Reminder: Stripe / lesson types – individual tutors only, not org_tutor */}
      {!isOrgTutor && (!stripeConnected || subjects.length === 0) && (
        <div className="mb-4 p-4 rounded-2xl border border-amber-200 bg-amber-50 flex flex-wrap items-center gap-3">
          <AlertCircle className="w-6 h-6 text-amber-600 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-900">{t('cal.beforeCreatingSchedule')}</p>
            <p className="text-xs text-gray-600 mt-0.5">
              {t('cal.connectStripeDesc')}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link to="/finance">
              <Button variant="outline" size="sm" className="gap-1.5 rounded-xl border-amber-300 text-amber-800 hover:bg-amber-100">
                <CreditCard className="w-4 h-4" />
                Finansai (Stripe)
              </Button>
            </Link>
            <Link to="/lesson-settings">
              <Button variant="outline" size="sm" className="gap-1.5 rounded-xl border-amber-300 text-amber-800 hover:bg-amber-100">
                <Settings2 className="w-4 h-4" />
                {t('cal.lessonSettings')}
              </Button>
            </Link>
          </div>
        </div>
      )}

      {/* Stats row */}
      <div className="grid gap-2 sm:gap-4 mb-3 sm:mb-4 w-full grid-cols-3 max-w-none">
        <div
          className="stat-card cursor-pointer"
          onClick={() => setIsUpcomingListModalOpen(true)}
        >
          <div className="flex items-center justify-between mb-2 sm:mb-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-600 flex items-center justify-center">
              <CalendarDays className="w-4 h-4 text-white" />
            </div>
          </div>
          <p className="text-xl sm:text-2xl font-bold text-gray-900">{activeSessions}</p>
          <p className="text-[10px] sm:text-xs text-gray-500 mt-0.5 font-medium">{t('cal.cardReserved')}</p>
        </div>
        <div className="stat-card">
          <div className="flex items-center justify-between mb-2 sm:mb-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500 to-green-600 flex items-center justify-center">
              <Wallet className="w-4 h-4 text-white" />
            </div>
          </div>
          <p className="text-xl sm:text-2xl font-bold text-gray-900">{paidSessions}</p>
          <p className="text-[10px] sm:text-xs text-gray-500 mt-0.5 font-medium">
            {orgPolicy.isOrgTutor ? t('cal.confirmed') : t('cal.paid')}
          </p>
        </div>
        <div
          className="stat-card cursor-pointer"
          onClick={() => setIsCancelledListModalOpen(true)}
        >
          <div className="flex items-center justify-between mb-2 sm:mb-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-red-400 to-red-500 flex items-center justify-center">
              <XCircle className="w-4 h-4 text-white" />
            </div>
          </div>
          <p className="text-xl sm:text-2xl font-bold text-gray-900">{cancelledSessions}</p>
          <p className="text-[10px] sm:text-xs text-gray-500 mt-0.5 font-medium">{t('cal.cancelled')}</p>
        </div>
      </div>

        {/* Calendar card – make it dominant workspace */}
        <div className={cn(
          'bg-white rounded-2xl shadow-sm border border-gray-100 flex flex-col relative mb-4',
          calendarExpanded ? 'calendar-expanded' : 'calendar-collapsed',
        )}>
        {/* Custom Toolbar */}
        <div className="flex items-center justify-between gap-2 px-3 sm:px-6 py-3 sm:py-4 border-b border-gray-100">
          {/* Left: prev / today / next */}
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => handleNavigate('back')}
              className="p-2 rounded-xl border border-gray-200 hover:bg-gray-50 transition-colors text-gray-600"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => handleNavigate('today')}
              className="px-2 sm:px-4 py-2 rounded-xl border border-gray-200 hover:bg-gray-50 transition-colors text-xs sm:text-sm font-medium text-gray-700"
            >
              {t('cal.today')}
            </button>
            <button
              type="button"
              onClick={() => handleNavigate('next')}
              className="p-2 rounded-xl border border-gray-200 hover:bg-gray-50 transition-colors text-gray-600"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Center: label */}
          <h2 className="text-xs sm:text-base font-semibold text-gray-800 capitalize text-center flex-1 truncate px-1">
            <span className="hidden sm:inline">{getLabel()}</span>
            <span className="sm:hidden">{getLabelShort()}</span>
          </h2>

          {/* Right: view switcher */}
          <div className="flex items-center bg-gray-100 rounded-xl p-1 gap-0.5">
            <button
              type="button"
              onClick={() => setCurrentView(Views.MONTH)}
              className={cn(
                'flex items-center gap-1 px-2 sm:px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-all',
                currentView === Views.MONTH
                  ? 'bg-white text-indigo-700 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              )}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{t('cal.month')}</span>
            </button>
            <button
              type="button"
              onClick={() => setCurrentView(Views.WEEK)}
              className={cn(
                'flex items-center gap-1 px-2 sm:px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-all',
                currentView === Views.WEEK
                  ? 'bg-white text-indigo-700 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              )}
            >
              <CalendarDays className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{t('cal.week')}</span>
            </button>
            <button
              type="button"
              onClick={() => setCurrentView(Views.DAY)}
              className={cn(
                'flex items-center gap-1 px-2 sm:px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-all',
                currentView === Views.DAY
                  ? 'bg-white text-indigo-700 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              )}
            >
              <List className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Diena</span>
            </button>
          </div>
        </div>

        <div
          className={cn(
            'p-1.5 sm:p-3',
            !calendarExpanded && 'max-h-[50vh] overflow-y-auto',
            (isAvailabilityModalOpen || isEventModalOpen || isCreateModalOpen || isSlotEditOpen) && 'pointer-events-none',
          )}
        >
          {loading ? (
            <div className="flex items-center justify-center py-32 text-gray-400">
              <div className="text-center">
                <div className="w-12 h-12 border-4 border-indigo-200 border-t-indigo-500 rounded-full animate-spin mx-auto mb-3" />
                <p className="text-sm">Kraunamas kalendorius...</p>
              </div>
            </div>
          ) : (
            <BigCalendar
              localizer={localizer}
              events={mergedSessions}
              backgroundEvents={backgroundEvents}
              startAccessor="start_time"
              endAccessor="end_time"
              views={[Views.MONTH, Views.WEEK, Views.DAY]}
              view={currentView}
              date={currentDate}
              onView={(view) => setCurrentView(view)}
              onNavigate={(date) => setCurrentDate(date)}
              selectable
              onSelectSlot={handleSelectSlot}
              onSelectEvent={handleSelectEvent}
              eventPropGetter={eventStyleGetter}
              dayLayoutAlgorithm={'no-overlap'}
              culture={locale}
              components={{
                toolbar: () => null, // hide default toolbar
              }}
              messages={{
                noEventsInRange: t('cal.noEventsInRange'),
                showMore: (count) => `+${count} daugiau`,
              }}
              {...(currentView !== Views.MONTH
                ? {
                    min: timeRangeBounds.min,
                    max: timeRangeBounds.max,
                    scrollToTime: timeRangeBounds.scrollToTime,
                  }
                : { scrollToTime: timeRangeBounds.scrollToTime })}
              titleAccessor={(event) => {
                if (event.isBackground) return t('cal.freeSlot');

                const name = event.student?.full_name || t('cal.unknown');
                const topic = event.topic ? ` · ${event.topic}` : '';

                let statusText = '';
                if (event.status === 'cancelled') {
                  statusText = t('cal.statusCancelled');
                } else if (orgPolicy.isOrgTutor) {
                  // no payment status text for org_tutor
                } else if (event.paid) {
                  statusText = t('cal.statusPaid');
                } else if (event.payment_status === 'paid_by_student') {
                  statusText = t('cal.statusAwaitingConfirm');
                } else {
                  statusText = t('cal.statusPending');
                }

                return `${name}${topic}${statusText}`;
              }}
            />
          )}
        </div>

        {/* Floating expand/collapse toggle pinned to bottom edge */}
        <button
          type="button"
          onClick={() => setCalendarExpanded(prev => !prev)}
          className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 z-10 w-7 h-7 flex items-center justify-center rounded-full bg-white border border-gray-200 shadow-sm text-gray-400 hover:text-indigo-500 hover:border-indigo-200 transition-colors cursor-pointer"
        >
          {calendarExpanded
            ? <ChevronUp className="w-3.5 h-3.5" />
            : <ChevronDown className="w-3.5 h-3.5" />}
        </button>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-4 sm:gap-6 mt-4 px-1">
        <div className="flex items-center gap-2">
          <span
            className="w-3 h-3 rounded border border-dashed border-emerald-600"
            style={{ backgroundColor: 'rgba(16, 185, 129, 0.28)' }}
          />
          <span className="text-xs text-gray-500">{t('cal.legendFreeTime')}</span>
        </div>
        {[
          { color: '#6366f1', label: t('cal.legendReserved') },
          { color: '#10b981', label: t('cal.legendCompleted') },
          { color: '#ca8a04', label: t('cal.legendUnpaidOccurred') },
          { color: '#ef4444', label: t('cal.legendCancelled'), opacity: true },
        ].map((item) => (
          <div key={item.label} className="flex items-center gap-2">
            <span
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: item.color, opacity: item.opacity ? 0.5 : 1 }}
            />
            <span className="text-xs text-gray-500">{item.label}</span>
          </div>
        ))}
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500 font-medium">
            {orgPolicy.isOrgTutor ? t('cal.legendConfirmed') : t('cal.legendPaid')}
          </span>
        </div>
      </div>

      {/* === CREATE SESSION MODAL === */}
      <Dialog open={isCreateModalOpen} onOpenChange={(open) => {
        setIsCreateModalOpen(open);
        if (!open) {
          setNewSessionId(null);
          setSelectedStudentIds([]);
        }
      }}>
        <DialogContent className="w-[95vw] sm:max-w-[520px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="w-5 h-5 text-indigo-600" />
              {t('cal.createNewLesson')}
            </DialogTitle>
            <DialogDescription>{t('cal.fillLessonInfo')}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-5 py-4">
            {/* Subject - MOVED TO TOP so user selects subject first */}
            {filteredSubjects.length > 0 && (
              <div className="space-y-2">
                <Label>{t('compStu.subjectLabel')} *</Label>
                <Select value={selectedSubjectId} onValueChange={handleSubjectChange}>
                  <SelectTrigger className="rounded-xl">
                    <SelectValue placeholder={t('cal.selectSubjectPlaceholder')} />
                  </SelectTrigger>
                  <SelectContent>
                    {filteredSubjects.map((subj) => (
                      <SelectItem key={subj.id} value={subj.id}>
                        <div className="flex items-center gap-2">
                          <span
                            className="w-2.5 h-2.5 rounded-full"
                            style={{ backgroundColor: subj.color }}
                          />
                          {subj.name}
                          {subj.is_group && subj.max_students && (
                            <span className="text-xs text-violet-600 font-semibold">
                              {t('cal.groupMaxSeats', { max: String(subj.max_students) })}
                            </span>
                          )}
                          {subj.grade_min && subj.grade_max && (
                            <span className="text-xs text-emerald-600">
                              ({subj.grade_min}-{subj.grade_max === 13 ? 'Studentas' : `${subj.grade_max} kl`})
                            </span>
                          )}
                          · {subj.duration_minutes}min
                          {!orgPolicy.hideMoney && <> · €{subj.price}</>}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Student Selection - Different UI for group lessons */}
            {(() => {
              const selectedSubject = subjects.find(s => s.id === selectedSubjectId);
              const isGroupLesson = selectedSubject?.is_group;
              const maxStudents = selectedSubject?.max_students || 1;

              if (isGroupLesson) {
                return (
                  <div className="space-y-2">
                    <Label>{t('cal.studentsRequired', { max: String(maxStudents) })}</Label>
                    <div className="border border-gray-200 rounded-xl p-3 space-y-2 max-h-60 overflow-y-auto">
                      {students.length === 0 ? (
                        <p className="text-sm text-gray-400 text-center py-2">{t('cal.noStudents')}</p>
                      ) : (
                        students.map((student) => (
                          <label key={student.id} className="flex items-center gap-2 p-2 hover:bg-gray-50 rounded-lg cursor-pointer">
                            <input
                              type="checkbox"
                              checked={selectedStudentIds.includes(student.id)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  if (selectedStudentIds.length < maxStudents) {
                                    setSelectedStudentIds([...selectedStudentIds, student.id]);
                                  }
                                } else {
                                  setSelectedStudentIds(selectedStudentIds.filter(id => id !== student.id));
                                }
                              }}
                              disabled={!selectedStudentIds.includes(student.id) && selectedStudentIds.length >= maxStudents}
                              className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                            />
                            <span className="text-sm">{student.full_name}</span>
                          </label>
                        ))
                      )}
                    </div>
                    <p className="text-xs text-gray-500">
                      {t('cal.selectedCount', { count: String(selectedStudentIds.length), max: String(maxStudents) })}
                    </p>
                  </div>
                );
              } else {
                return (
                  <div className="space-y-2">
                    <Label>{t('cal.studentRequired')}</Label>
                    <Select value={selectedStudentId} onValueChange={handleStudentChange}>
                      <SelectTrigger className="rounded-xl">
                        <SelectValue placeholder={t('cal.selectStudentPlaceholder')} />
                      </SelectTrigger>
                      <SelectContent>
                        {students.map((student) => (
                          <SelectItem key={student.id} value={student.id}>
                            {student.full_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                );
              }
            })()}

            {/* Start time */}
            <div className="space-y-2">
              <Label>{t('cal.startTimeRequired')}</Label>
              <DateTimeSpinner
                value={startTime}
                onChange={handleStartTimeChange}
              />
            </div>

            {/* End time */}
            <div className="space-y-2">
              <Label>{t('cal.endTimeRequired')}</Label>
              <DateTimeSpinner
                value={endTime}
                onChange={setEndTime}
              />
            </div>

            {/* Topic */}
            <div className="space-y-2">
              <Label>{t('cal.topicLabel')}</Label>
                <Input
                placeholder={t('cal.topicExample')}
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                className="rounded-xl"
              />
            </div>

            {/* Meeting link */}
            <div className="space-y-2">
              <Label>Nuoroda (Zoom / Meet)</Label>
              <Input
                placeholder="https://meet.google.com/..."
                value={meetingLink}
                onChange={(e) => setMeetingLink(e.target.value)}
                className="rounded-xl"
              />
            </div>

            {/* Price */}
            {!orgPolicy.hideMoney && (
            <div className="space-y-2">
              <Label>{t('lessonSet.priceLabel')}</Label>
              <Input
                type="number"
                value={price}
                onChange={(e) => setPrice(Number(e.target.value))}
                className="rounded-xl"
              />
            </div>
            )}

            {/* Is Paid toggle */}
            {orgPolicy.canToggleSessionPaid && (
            <div className="border border-green-100 rounded-xl p-4 space-y-3 bg-green-50/50">
              <button
                type="button"
                onClick={() => setIsPaid(!isPaid)}
                className="flex items-center justify-between w-full"
              >
                <div>
                  <p className="text-sm font-medium text-green-900 text-left">{t('cal.alreadyPaid')}</p>
                  <p className="text-xs text-green-700/70 text-left mt-0.5">{t('cal.markIfPaid')}</p>
                </div>
                <div className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 flex-shrink-0 ml-4 ${isPaid ? 'bg-green-500' : 'bg-gray-300'}`}>
                  <span className={`inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200 ${isPaid ? 'translate-x-6' : 'translate-x-1'}`} />
                </div>
              </button>
            </div>
            )}

            {/* Comment */}
            <div className="space-y-2">
              <Label>{t('cal.commentOptional')}</Label>
              <textarea
                value={newTutorComment}
                onChange={(e) => setNewTutorComment(e.target.value)}
                placeholder={t('cal.topicPlaceholder')}
                className="w-full p-3 rounded-xl border border-gray-200 text-sm resize-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-300 outline-none"
                rows={2}
              />
              <label className="flex items-center gap-2 cursor-pointer mt-1">
                <input
                  type="checkbox"
                  checked={newShowCommentToStudent}
                  onChange={(e) => setNewShowCommentToStudent(e.target.checked)}
                  className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                />
                <span className="text-sm text-gray-700">{t('cal.showToStudent')}</span>
              </label>
            </div>

            {/* Recurring toggle */}
            <div className="border border-gray-100 rounded-xl p-4 space-y-3 bg-gray-50">
              <button
                type="button"
                onClick={() => {
                  const next = !isRecurring;
                  setIsRecurring(next);
                  setRecurringEndDate('');
                  setRecurringFrequency('weekly');
                  if (next && startTime) {
                    setSelectedWeekdays([new Date(startTime).getDay()]);
                  } else {
                    setSelectedWeekdays([]);
                  }
                }}
                className="flex items-center justify-between w-full"
              >
                <div>
                  <p className="text-sm font-medium text-gray-900 text-left">{t('cal.recurringLesson')}</p>
                  <p className="text-xs text-gray-500 text-left mt-0.5">{t('cal.recurringDesc')}</p>
                </div>
                <div className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 flex-shrink-0 ml-4 ${isRecurring ? 'bg-indigo-500' : 'bg-gray-300'}`}>
                  <span className={`inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200 ${isRecurring ? 'translate-x-6' : 'translate-x-1'}`} />
                </div>
              </button>

              {isRecurring && (
                <div className="space-y-3 pt-1 border-t border-gray-200">
                  <div className="space-y-1.5">
                    <Label className="text-xs">{t('cal.recurringFrequencyLabel')}</Label>
                    <select
                      value={recurringFrequency}
                      onChange={(e) => setRecurringFrequency(e.target.value as 'weekly' | 'biweekly' | 'monthly')}
                      className="w-full rounded-xl text-sm border border-gray-300 px-3 py-2 bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    >
                      <option value="weekly">{t('cal.freqWeekly')}</option>
                      <option value="biweekly">{t('cal.freqBiweekly')}</option>
                      <option value="monthly">{t('cal.freqMonthly')}</option>
                    </select>
                  </div>
                  {recurringFrequency !== 'monthly' && (
                    <div className="space-y-1.5">
                      <Label className="text-xs">{t('cal.weekdaysLabel')}</Label>
                      <div className="flex gap-1.5 flex-wrap">
                        {[1, 2, 3, 4, 5, 6, 0].map((day) => {
                          const labels = [t('cal.wdSun'), t('cal.wdMon'), t('cal.wdTue'), t('cal.wdWed'), t('cal.wdThu'), t('cal.wdFri'), t('cal.wdSat')];
                          const isSelected = selectedWeekdays.includes(day);
                          return (
                            <button
                              key={day}
                              type="button"
                              onClick={() => {
                                setSelectedWeekdays(prev =>
                                  isSelected
                                    ? prev.filter(d => d !== day)
                                    : [...prev, day]
                                );
                              }}
                              className={cn(
                                'px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors border',
                                isSelected
                                  ? 'bg-indigo-500 text-white border-indigo-500'
                                  : 'bg-white text-gray-600 border-gray-200 hover:border-indigo-300',
                              )}
                            >
                              {labels[day]}
                            </button>
                          );
                        })}
                      </div>
                      {selectedWeekdays.length === 0 && (
                        <p className="text-xs text-amber-600">{t('cal.selectAtLeastOneDay')}</p>
                      )}
                    </div>
                  )}
                  <div className="space-y-1.5">
                    <Label className="text-xs">Kartotis iki *</Label>
                    <DateInput
                      value={recurringEndDate}
                      onChange={(e) => setRecurringEndDate(e.target.value)}
                      min={startTime ? format(addWeeks(new Date(startTime), 1), 'yyyy-MM-dd') : undefined}
                      className="rounded-xl text-sm"
                    />
                    {recurringEndDate && startTime && (() => {
                      const startMs = new Date(startTime).getTime();
                      const endMs = parseISO(recurringEndDate).getTime();
                      const diffMs = endMs - startMs;
                      let countPerDay: number;
                      if (recurringFrequency === 'monthly') {
                        const s = new Date(startTime);
                        const e = parseISO(recurringEndDate);
                        countPerDay = (e.getFullYear() - s.getFullYear()) * 12 + (e.getMonth() - s.getMonth()) + 1;
                      } else {
                        const weekInterval = recurringFrequency === 'biweekly' ? 2 : 1;
                        countPerDay = Math.floor(diffMs / (weekInterval * 7 * 24 * 60 * 60 * 1000)) + 1;
                      }
                      const daysCount = (recurringFrequency !== 'monthly' && selectedWeekdays.length > 0) ? selectedWeekdays.length : 1;
                      const count = countPerDay * daysCount;
                      return (
                        <p className="text-xs text-indigo-600 font-medium">
                          Bus sukurta ≈{count} pamok{count === 1 ? 'a' : 'os'}
                          {daysCount > 1 && ` (${daysCount} d/sav × ≈${countPerDay})`}
                        </p>
                      );
                    })()}
                  </div>
                </div>
              )}
            </div>
          </div>

          {newSessionId ? (
            <div className="space-y-3 pt-2">
              <SessionFiles sessionId={newSessionId} role="tutor" />
              <Button className="w-full rounded-xl" onClick={() => { setIsCreateModalOpen(false); setNewSessionId(null); }}>
                Baigti
              </Button>
            </div>
          ) : (
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsCreateModalOpen(false)} className="rounded-xl">
                {t('cal.cancel')}
              </Button>
              <Button
                onClick={handleCreateSession}
                disabled={(() => {
                  const selectedSubject = subjects.find(s => s.id === selectedSubjectId);
                  const isGroupLesson = selectedSubject?.is_group;
                  const hasStudents = isGroupLesson ? selectedStudentIds.length > 0 : !!selectedStudentId;
                  const weekdayMissing = isRecurring && recurringFrequency !== 'monthly' && selectedWeekdays.length === 0;
                  return saving || !hasStudents || !startTime || !endTime || (isRecurring && !recurringEndDate) || weekdayMissing;
                })()}
                className="rounded-xl"
              >
                {saving ? t('cal.saving') : isRecurring ? t('cal.createRecurring') : t('cal.createLessonBtn')}
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>

      {/* === EVENT DETAILS MODAL === */}
      <Dialog open={isEventModalOpen} onOpenChange={handleEventModalOpenChange}>
        <DialogContent className="w-[95vw] sm:max-w-[440px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 pr-6">
              <CalendarDays className="w-5 h-5 text-indigo-600 flex-shrink-0" />
              <span className="flex-1 truncate">{t('cal.lessonInfo')}</span>
              {!isEditingSession && (selectedEvent?.status === 'active' || selectedEvent?.status === 'completed') && (
                <div className="flex items-center gap-1 flex-shrink-0">
                {selectedEvent?.status === 'active' && (
                <Button variant="ghost" size="sm" onClick={() => {
                  if ((isGroupSession || selectedEvent?.recurring_session_id) && !groupEditChoice) {
                    setGroupEditChoice('single');
                    return;
                  }
                  setEditNewStartTime(format(selectedEvent.start_time, "yyyy-MM-dd'T'HH:mm"));
                  setEditDurationMinutes(Math.max(5, Math.round((selectedEvent.end_time.getTime() - selectedEvent.start_time.getTime()) / 60000)));
                  setEditTopic(selectedEvent.topic || '');
                  setEditMeetingLink(selectedEvent.meeting_link || '');
                  setEditTutorComment(selectedEvent.tutor_comment || '');
                  setEditShowCommentToStudent(selectedEvent.show_comment_to_student || false);
                  setIsEditingSession(true);
                }} className="text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 h-8 px-2 flex-shrink-0">
                  <Edit2 className="w-3.5 h-3.5 mr-1" /> <span className="hidden sm:inline">{t('cal.editBtn')}</span>
                </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void handleHardDeleteSelected()}
                  className="text-red-600 hover:text-red-700 hover:bg-red-50 h-8 px-2 flex-shrink-0"
                  title={t('cal.deleteSession')}
                >
                  <Trash2 className="w-3.5 h-3.5 mr-1" /> <span className="hidden sm:inline">{t('cal.delete')}</span>
                </Button>
                </div>
              )}
            </DialogTitle>
          </DialogHeader>

          {isEditingSession ? (
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label>{t('compSch.topicSubject')}</Label>
                <Input value={editTopic} onChange={(e) => setEditTopic(e.target.value)} placeholder={t('cal.topicPlaceholder')} className="rounded-xl" />
              </div>
              <div className="space-y-2">
                <Label>{t('cal.timeLabel')}</Label>
                <DateTimeSpinner value={editNewStartTime} onChange={setEditNewStartTime} />
              </div>
              <div className="space-y-2">
                <Label>{t('cal.durationLabel')}</Label>
                <Input
                  type="number"
                  value={editDurationMinutes}
                  onChange={(e) => setEditDurationMinutes(Number(e.target.value))}
                  className="rounded-xl"
                  min={15}
                  max={240}
                  step={5}
                />
                <p className="text-xs text-gray-500">
                  {t('cal.durationHint')}
                </p>
              </div>
              <div className="space-y-2">
                <Label>{t('cal.meetingLinkLabel')}</Label>
                <Input value={editMeetingLink} onChange={(e) => setEditMeetingLink(e.target.value)} placeholder="https://meet.google.com/..." className="rounded-xl" />
              </div>
              <div className="space-y-2">
                <Label>{t('dash.commentLabel')}</Label>
                <textarea
                  value={editTutorComment}
                  onChange={(e) => setEditTutorComment(e.target.value)}
                  placeholder={t('dash.commentPlaceholder')}
                  className="w-full p-3 rounded-xl border border-gray-200 text-sm resize-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-300 outline-none"
                  rows={2}
                />
                <label className="flex items-center gap-2 cursor-pointer mt-1">
                  <input
                    type="checkbox"
                    checked={editShowCommentToStudent}
                    onChange={(e) => setEditShowCommentToStudent(e.target.checked)}
                    className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span className="text-sm text-gray-700">{t('cal.showToStudent')}</span>
                </label>
              </div>
              <div className="flex gap-2 pt-2">
                <Button variant="outline" className="flex-1 rounded-xl" onClick={() => setIsEditingSession(false)}>{t('cal.cancelEdit')}</Button>
                <Button onClick={handleSaveChanges} disabled={saving} className="flex-1 rounded-xl">
                  {saving ? t('cal.savingEdit') : t('cal.saveEdit')}
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-3 py-2">
              {/* Student name - Group or Individual */}
              {isGroupSession ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between bg-violet-50 rounded-xl px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Users className="w-5 h-5 text-violet-600" />
                      <div>
                        <p className="font-bold text-gray-900">{t('cal.groupLessonTitle')}</p>
                        <p className="text-xs text-violet-600">
                          {t('cal.studentsCount', { count: String(selectedGroupSessions.length) })}
                          {selectedEvent?.topic && ` • ${selectedEvent.topic}`}
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="space-y-1.5 max-h-48 overflow-y-auto">
                    {selectedGroupSessions.map((session, idx) => (
                      <div key={session.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                        <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center text-white font-bold text-xs flex-shrink-0">
                          {session.student?.full_name?.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2) || '?'}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-gray-900">{session.student?.full_name}</p>
                          {session.student?.grade && (
                            <p className="text-xs text-emerald-600">🎓 {session.student.grade}</p>
                          )}
                        </div>
                        {!orgPolicy.hideMoney && (
                        <div className="text-xs">
                          {session.paid ? (
                            <span className="text-green-600 font-semibold">{t('cal.studentPaid')}</span>
                          ) : (
                            <span className="text-orange-500 font-semibold">{t('cal.studentUnpaid')}</span>
                          )}
                        </div>
                        )}
                        <div className="flex items-center gap-1 flex-shrink-0 flex-wrap justify-end">
                          {(() => {
                            const rowEnd = new Date(session.end_time);
                            const rowFuture = isAfter(rowEnd, new Date());
                            if (session.status === 'no_show') {
                              return rowFuture ? (
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  className="h-8 px-2 text-xs text-indigo-700 border-indigo-200 hover:bg-indigo-50"
                                  disabled={noShowSavingId === session.id || saving}
                                  onClick={() => void handleRevertSessionToPlanned(session)}
                                >
                                  <RotateCcw className="w-3.5 h-3.5 mr-1" />
                                  {t('dash.revertToPlannedLesson')}
                                </Button>
                              ) : (
                                <span className="text-xs font-semibold text-rose-600">{t('common.noShow')}</span>
                              );
                            }
                            if (session.status === 'active') {
                              return (
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  className="h-8 px-2 text-xs text-rose-700 border-rose-200 hover:bg-rose-50"
                                  disabled={noShowSavingId === session.id || saving}
                                  onClick={() => void handleMarkStudentNoShowForSession(session)}
                                >
                                  <UserX className="w-3.5 h-3.5 mr-1" />
                                  {noShowSavingId === session.id ? '…' : t('common.noShow')}
                                </Button>
                              );
                            }
                            if (session.status === 'completed' && rowFuture) {
                              return (
                                <div className="flex flex-wrap gap-1 justify-end">
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="h-8 px-2 text-xs text-indigo-700 border-indigo-200 hover:bg-indigo-50"
                                    disabled={noShowSavingId === session.id || saving}
                                    onClick={() => void handleRevertSessionToPlanned(session)}
                                  >
                                    <RotateCcw className="w-3.5 h-3.5 mr-1" />
                                    {t('dash.revertToPlannedLesson')}
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="h-8 px-2 text-xs text-rose-700 border-rose-200 hover:bg-rose-50"
                                    disabled={noShowSavingId === session.id || saving}
                                    onClick={() => void handleMarkStudentNoShowForSession(session)}
                                  >
                                    <UserX className="w-3.5 h-3.5 mr-1" />
                                    {noShowSavingId === session.id ? '…' : t('common.noShow')}
                                  </Button>
                                </div>
                              );
                            }
                            return null;
                          })()}
                          {session.status === 'active' && (
                            <button
                              type="button"
                              onClick={() => handleRemoveStudentFromGroup(session)}
                              disabled={saving}
                              className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
                              title={t('cal.removeStudent')}
                            >
                              <XCircle className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="bg-indigo-50 rounded-xl px-4 py-3 flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-indigo-600 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                    {selectedEvent?.student?.full_name?.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2) || '?'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-900">{selectedEvent?.student?.full_name}</p>
                    {selectedEvent?.student?.grade && (
                      <p className="text-xs text-emerald-600 font-medium">🎓 {selectedEvent.student.grade}</p>
                    )}
                    <p className="text-xs text-gray-500 truncate">
                      {contactVisibility
                        ? formatContactForTutorView(
                          selectedEvent?.student?.email,
                          selectedEvent?.student?.payer_email,
                          contactVisibility.tutorSeesStudentEmail,
                        )
                        : ((selectedEvent?.student?.email || '').trim() || '—')}
                    </p>
                    <p className="text-xs text-gray-500 truncate">
                      {contactVisibility
                        ? formatContactForTutorView(
                          selectedEvent?.student?.phone,
                          selectedEvent?.student?.payer_phone,
                          contactVisibility.tutorSeesStudentPhone,
                        )
                        : ((selectedEvent?.student?.phone || '').trim() || '—')}
                    </p>
                    {selectedEvent?.topic && (
                      <p className="text-xs text-indigo-600 mt-0.5 font-medium">{selectedEvent.topic}</p>
                    )}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="bg-gray-50 rounded-xl p-3">
                  <p className="text-xs text-gray-400 font-medium flex items-center gap-1 mb-1">
                    <Clock className="w-3 h-3" /> {t('cal.start')}
                  </p>
                  <p className="font-semibold text-gray-800">
                    {selectedEvent?.start_time.toLocaleString('lt-LT', { dateStyle: 'short', timeStyle: 'short' })}
                  </p>
                </div>
                <div className="bg-gray-50 rounded-xl p-3">
                  <p className="text-xs text-gray-400 font-medium flex items-center gap-1 mb-1">
                    <Clock className="w-3 h-3" /> {t('dash.end')}
                  </p>
                  <p className="font-semibold text-gray-800">
                    {selectedEvent?.end_time.toLocaleString('lt-LT', { dateStyle: 'short', timeStyle: 'short' })}
                  </p>
                </div>
              </div>

              <div
                className={cn(
                  'grid gap-2 text-sm',
                  orgPolicy.hideMoney ? 'grid-cols-1' : 'grid-cols-3',
                )}
              >
                {!orgPolicy.hideMoney && (
                <div className="bg-gray-50 rounded-xl p-2 sm:p-3 text-center">
                  <p className="text-xs text-gray-400 mb-1">{t('dash.priceLabel')}</p>
                  <p className="font-bold text-gray-900">€{selectedEvent?.price || '–'}</p>
                </div>
                )}
                <div className="bg-gray-50 rounded-xl p-2 sm:p-3 text-center flex flex-col items-center justify-center">
                  <p className="text-xs text-gray-400 mb-1">{t('dash.statusLabel')}</p>
                  <StatusBadge
                    status={selectedEvent?.status || ''}
                    paymentStatus={selectedEvent?.payment_status}
                    paid={selectedEvent?.paid}
                    isTrial={(selectedEvent as any)?.subjects?.is_trial === true}
                    orgTutorCopy={orgPolicy.isOrgTutor}
                    hidePaymentStatus={orgPolicy.isOrgTutor}
                    endTime={selectedEvent?.end_time}
                  />
                </div>
                {!orgPolicy.hideMoney && !orgPolicy.isOrgTutor && (
                <div className="bg-gray-50 rounded-xl p-2 sm:p-3 text-center">
                  <p className="text-xs text-gray-400 mb-1">{t('cal.paidLabel')}</p>
                  {selectedEvent?.payment_status === 'paid_by_student' ? (
                    <span className="text-green-600 font-semibold text-[10px] sm:text-xs bg-green-100 px-1 py-0.5 rounded leading-tight block">{t('cal.studentMarkedPaid')}</span>
                  ) : (
                    <span className={selectedEvent?.paid ? 'text-green-600 font-semibold text-xs' : 'text-red-500 font-semibold text-xs'}>
                      {selectedEvent?.paid ? t('dash.paidYes') : t('dash.paidNo')}
                    </span>
                  )}
                </div>
                )}
              </div>

              {/* Comment – always visible and editable in view mode */}
              <div className="space-y-2 mt-3 pt-3 border-t border-gray-100">
                <p className="text-sm font-semibold text-gray-700">{t('dash.commentLabel')}</p>
                <textarea
                  value={viewCommentText}
                  onChange={(e) => setViewCommentText(e.target.value)}
                  placeholder={t('cal.commentPlaceholder')}
                  className="w-full p-3 rounded-xl border border-gray-200 text-sm resize-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-300 outline-none"
                  rows={2}
                />
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={viewShowToStudent}
                    onChange={(e) => {
                      if (forceTrialCommentVisibility) return;
                      setViewShowToStudent(e.target.checked);
                    }}
                    disabled={forceTrialCommentVisibility}
                    className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span className="text-sm text-gray-700">
                    {forceTrialCommentVisibility
                      ? t('cal.orgCommentAutoSend')
                      : t('cal.showToStudentCheckbox')}
                  </span>
                </label>
                <Button
                  size="sm"
                  onClick={handleSaveViewComment}
                  disabled={viewCommentSaving}
                  className="rounded-xl"
                >
                  {viewCommentSaving ? t('cal.savingComment') : t('cal.saveComment')}
                </Button>
                {selectedEvent?.tutor_comment && (
                  <div className={`mt-2 p-3 rounded-lg text-sm border ${selectedEvent.show_comment_to_student ? 'bg-indigo-50 border-indigo-100 text-indigo-800' : 'bg-gray-50 border-gray-100 text-gray-700'}`}>
                    <span className="font-semibold block mb-1">
                      {t('dash.commentVisibleNow')} {selectedEvent.show_comment_to_student ? t('dash.visibleToStudent') : t('dash.visibleOnlyYou')}
                    </span>
                    <div className="whitespace-pre-wrap">{selectedEvent.tutor_comment}</div>
                  </div>
                )}
              </div>

              {selectedEvent?.meeting_link && (
                <a
                  href={normalizeUrl(selectedEvent.meeting_link) || undefined}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-blue-50 text-blue-600 text-sm font-semibold hover:bg-blue-100 transition-colors border border-blue-100 mt-2"
                >
                  {t('cal.joinVideoCall')}
                </a>
              )}
              {selectedEvent && (
                <SessionFiles sessionId={selectedEvent.id} role="tutor" />
              )}
            </div>
          )}

          {/* Cancellation reason textarea */}
          {cancelConfirmId === selectedEvent?.id && (
            <div className="space-y-2 pt-2 border-t border-gray-100">
              <label className="text-sm font-semibold text-gray-700">{t('cal.cancellationReasonLabel')}</label>
              <textarea
                value={cancellationReason}
                onChange={(e) => setCancellationReason(e.target.value)}
                placeholder={t('cal.cancellationPlaceholder')}
                className="w-full p-3 rounded-xl border border-gray-200 text-sm resize-none focus:ring-2 focus:ring-red-200 focus:border-red-300 outline-none"
                rows={3}
                autoFocus
              />
              {cancellationReason.length > 0 && cancellationReason.trim().length < 5 && (
                <p className="text-xs text-red-500">{t('dash.minChars', { min: '5', current: String(cancellationReason.trim().length) })}</p>
              )}
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => { setCancelConfirmId(null); setCancellationReason(''); }} className="rounded-xl flex-1">
                  {t('cal.cancelBtn')}
                </Button>
                <Button variant="destructive" size="sm" onClick={handleCancelSession} disabled={saving || cancellationReason.trim().length < 5} className="rounded-xl flex-1">
                  {saving ? t('cal.cancelling') : t('cal.confirmCancellation')}
                </Button>
              </div>
            </div>
          )}

          <div className="flex flex-col gap-2 pt-2">
            {selectedEvent?.status === 'completed' && (
              <div className="flex flex-wrap gap-2">
                <Button
                  variant={cancelConfirmId === selectedEvent.id ? "default" : "destructive"}
                  onClick={() => {
                    if (cancelConfirmId !== selectedEvent.id) {
                      handleCancelSession();
                    }
                  }}
                  disabled={saving}
                  size="sm"
                  className={cn(
                    "rounded-xl flex-1",
                    cancelConfirmId === selectedEvent.id ? "bg-orange-500 hover:bg-orange-600 text-white" : ""
                  )}
                >
                  <XCircle className="w-4 h-4 mr-1" />
                  {cancelConfirmId === selectedEvent.id ? t('cal.cancellingStatus') : t('cal.cancelCompletedLabel')}
                </Button>
              </div>
            )}
            {selectedEvent?.status === 'active' && (
              <div className="flex flex-wrap gap-2">
                <Button
                  variant={cancelConfirmId === selectedEvent.id ? "default" : "destructive"}
                  onClick={() => {
                    if (cancelConfirmId !== selectedEvent.id) {
                      handleCancelSession();
                    }
                  }}
                  disabled={saving}
                  size="sm"
                  className={cn(
                    "rounded-xl flex-1",
                    cancelConfirmId === selectedEvent.id ? "bg-orange-500 hover:bg-orange-600 text-white" : ""
                  )}
                >
                  <XCircle className="w-4 h-4 mr-1" />
                  {cancelConfirmId === selectedEvent.id ? t('cal.cancellingStatus') : t('cal.cancelLabel')}
                </Button>
                <Button
                  variant="outline"
                  onClick={handleMarkCompleted}
                  disabled={saving}
                  size="sm"
                  className="rounded-xl flex-1 text-green-700 border-green-200 hover:bg-green-50"
                >
                  <CheckCircle className="w-4 h-4 mr-1" />
                  {t('cal.completed')}
                </Button>
                {!isGroupSession && selectedEvent && (
                  <Button
                    variant="outline"
                    onClick={() => {
                      if (selectedEvent) void handleMarkStudentNoShowForSession(selectedEvent);
                    }}
                    disabled={saving || noShowSavingId === selectedEvent.id}
                    size="sm"
                    className="rounded-xl flex-1 text-rose-700 border-rose-200 hover:bg-rose-50"
                  >
                    <UserX className="w-4 h-4 mr-1" />
                    {noShowSavingId === selectedEvent.id ? '…' : t('common.noShow')}
                  </Button>
                )}
              </div>
            )}
            {!isGroupSession &&
              selectedEvent &&
              (selectedEvent.status === 'completed' || selectedEvent.status === 'no_show') &&
              isAfter(selectedEvent.end_time, new Date()) && (
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    onClick={() => void handleRevertSessionToPlanned(selectedEvent)}
                    disabled={saving || noShowSavingId === selectedEvent.id}
                    size="sm"
                    className="rounded-xl flex-1 text-indigo-700 border-indigo-200 hover:bg-indigo-50"
                  >
                    <RotateCcw className="w-4 h-4 mr-1" />
                    {t('dash.revertToPlannedLesson')}
                  </Button>
                  {selectedEvent.status === 'completed' && (
                    <Button
                      variant="outline"
                      onClick={() => void handleMarkStudentNoShowForSession(selectedEvent)}
                      disabled={saving || noShowSavingId === selectedEvent.id}
                      size="sm"
                      className="rounded-xl flex-1 text-rose-700 border-rose-200 hover:bg-rose-50"
                    >
                      <UserX className="w-4 h-4 mr-1" />
                      {noShowSavingId === selectedEvent.id ? '…' : t('common.noShow')}
                    </Button>
                  )}
                </div>
              )}
            {selectedEvent?.status !== 'cancelled' &&
              orgPolicy.canToggleSessionPaid &&
              !orgPolicy.isOrgTutor && (
              <Button
                onClick={handleMarkPaid}
                disabled={saving}
                size="sm"
                variant={selectedEvent?.payment_status === 'paid_by_student' ? "default" : selectedEvent?.paid ? "default" : "default"}
                className={cn(
                  "rounded-xl w-full font-semibold shadow-sm transition-all",
                  selectedEvent?.payment_status === 'paid_by_student'
                    ? "bg-green-600 hover:bg-green-700 text-white border-transparent ring-2 ring-green-200"
                    : selectedEvent?.paid
                      ? "bg-amber-500 hover:bg-amber-600 text-white border-transparent ring-2 ring-amber-200"
                      : "bg-emerald-600 hover:bg-emerald-700 text-white border-transparent ring-2 ring-emerald-200"
                )}
              >
                {selectedEvent?.payment_status === 'paid_by_student' ? (
                  <>
                    <CheckCircle className="w-5 h-5 mr-1.5" />
                    {t('cal.confirmPayment')}
                  </>
                ) : (
                  <>
                    <Wallet className="w-5 h-5 mr-1.5" />
                    {selectedEvent?.paid ? t('cal.markUnpaid') : t('cal.markPaid')}
                  </>
                )}
              </Button>
            )}

            {/* Additional actions */}
            <div className="flex gap-2 mt-2">
              {/* Hide from calendar button */}
              {selectedEvent?.status === 'cancelled' && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    if (!selectedEvent) return;
                    const sessionIds = isGroupSession
                      ? selectedGroupSessions.map(s => s.id)
                      : [selectedEvent.id];

                    const { error } = await supabase
                      .from('sessions')
                      .update({ hidden_from_calendar: true })
                      .in('id', sessionIds);

                    if (!error) {
                      setIsEventModalOpen(false);
                      fetchData();
                    }
                  }}
                  className="rounded-xl flex-1 text-gray-600 border-gray-300"
                >
                  <Trash2 className="w-4 h-4 mr-1" />
                  {t('cal.deleteFromCalendar')}
                </Button>
              )}

              {/* Add student to group lesson */}
              {isGroupSession && selectedEvent?.status === 'active' && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const subject = subjects.find(s => s.id === selectedEvent?.subject_id);
                    // Count current students in this group
                    const currentStudentCount = selectedGroupSessions.length;
                    const maxStudents = subject?.max_students || 5;

                    if (currentStudentCount >= maxStudents) {
                      alert(t('cal.groupFull', { max: String(maxStudents) }));
                      return;
                    }

                    setIsAddToGroupOpen(true);
                    setAddToGroupStudentIds([]);
                    setAddToGroupChoice('single');
                  }}
                  className="rounded-xl flex-1 text-violet-600 border-violet-300"
                >
                  <Plus className="w-4 h-4 mr-1" />
                  {t('cal.addStudent')}
                </Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* === RECURRING DELETE SCOPE DIALOG === */}
      <Dialog open={isDeleteRecurringDialogOpen} onOpenChange={setIsDeleteRecurringDialogOpen}>
        <DialogContent className="w-[95vw] sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Trash2 className="w-5 h-5 text-red-600" />
              {t('cal.deleteRecurringTitle')}
            </DialogTitle>
          </DialogHeader>
          <div className="text-sm text-gray-600 space-y-2">
            <p>{t('cal.deleteChoose')}</p>
            <p className="text-xs text-gray-500">{t('cal.deleteHint')}</p>
          </div>
          <DialogFooter className="flex flex-col sm:flex-row gap-2 sm:gap-3">
            <Button
              variant="outline"
              onClick={() => setIsDeleteRecurringDialogOpen(false)}
              className="rounded-xl"
              disabled={saving}
            >
              {t('cal.cancelBtn')}
            </Button>
            <Button
              variant="outline"
              onClick={() => void hardDeleteSelectedWithApproval('single')}
              className="rounded-xl border-red-200 text-red-700 hover:bg-red-50"
              disabled={saving}
            >
              {t('cal.deleteOnlyThis')}
            </Button>
            <Button
              onClick={() => void hardDeleteSelectedWithApproval('future')}
              className="rounded-xl bg-red-600 hover:bg-red-700 text-white"
              disabled={saving}
            >
              {t('cal.deleteThisAndFuture')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* === ADD STUDENT TO GROUP MODAL === */}
      <Dialog open={isAddToGroupOpen} onOpenChange={(open) => {
        setIsAddToGroupOpen(open);
        if (!open) {
          setAddToGroupStudentIds([]);
          setAddToGroupChoice('single');
        }
      }}>
        <DialogContent className="w-[95vw] sm:max-w-[440px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="w-5 h-5 text-violet-600" />
              {t('cal.addStudentToGroup')}
            </DialogTitle>
            <DialogDescription>
              {t('cal.selectStudentsForGroup')}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>{t('cal.studentsLabel')}</Label>
              <div className="max-h-48 overflow-y-auto border rounded-lg p-2 space-y-1">
                {students
                  .filter(student => !selectedGroupSessions.some(s => s.student_id === student.id))
                  .map(student => (
                    <label key={student.id} className="flex items-center gap-2 cursor-pointer p-2 hover:bg-gray-50 rounded">
                      <input
                        type="checkbox"
                        checked={addToGroupStudentIds.includes(student.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setAddToGroupStudentIds([...addToGroupStudentIds, student.id]);
                          } else {
                            setAddToGroupStudentIds(addToGroupStudentIds.filter(id => id !== student.id));
                          }
                        }}
                        className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                      />
                      <span className="text-sm">
                        {student.grade ? t('cal.studentGrade', { name: student.full_name, grade: student.grade }) : student.full_name}
                      </span>
                    </label>
                  ))}
              </div>
              {addToGroupStudentIds.length > 0 && (
                <p className="text-xs text-indigo-600 font-medium">
                  {t('cal.selectedStudents', { count: String(addToGroupStudentIds.length) })}
                </p>
              )}
              {selectedGroupSessions.length > 0 && (
                <p className="text-xs text-gray-500">
                  {t('cal.alreadyInGroup', { names: selectedGroupSessions.map(s => s.student?.full_name).join(', ') })}
                </p>
              )}
            </div>

            {(selectedEvent?.recurring_session_id || isGroupSession) && (
              <div className="space-y-2">
                <Label>{t('cal.whichLessonsToAdd')}</Label>
                <div className="space-y-2">
                  <label className="flex items-center gap-2 cursor-pointer p-3 border rounded-lg hover:bg-gray-50">
                    <input
                      type="radio"
                      name="addToGroupChoice"
                      checked={addToGroupChoice === 'single'}
                      onChange={() => setAddToGroupChoice('single')}
                      className="rounded-full border-gray-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    <div>
                      <p className="text-sm font-medium">{t('cal.thisLessonOnly')}</p>
                      <p className="text-xs text-gray-500">{t('cal.addToSelected')}</p>
                    </div>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer p-3 border rounded-lg hover:bg-gray-50">
                    <input
                      type="radio"
                      name="addToGroupChoice"
                      checked={addToGroupChoice === 'all_future'}
                      onChange={() => setAddToGroupChoice('all_future')}
                      className="rounded-full border-gray-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    <div>
                      <p className="text-sm font-medium">{t('cal.allFutureLessons')}</p>
                      <p className="text-xs text-gray-500">{t('cal.addToAllFuture')}</p>
                    </div>
                  </label>
                </div>
              </div>
            )}

            {selectedEvent?.subject_id && (
              <div className="p-3 bg-blue-50 rounded-lg border border-blue-100">
                <p className="text-xs text-blue-800">
                  {t('cal.noteStudentEmail')}
                </p>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsAddToGroupOpen(false)}
              className="rounded-xl"
            >
              {t('cal.cancelAddStudent')}
            </Button>
            <Button
              onClick={handleAddStudentToGroup}
              disabled={addToGroupStudentIds.length === 0 || saving}
              className="rounded-xl"
            >
              {saving ? t('cal.adding') : t('cal.addStudentsBtn', { count: String(addToGroupStudentIds.length) })}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* === EDIT SCOPE CHOICE DIALOG === */}
      <Dialog open={groupEditChoice !== null && !isEditingSession} onOpenChange={(open) => {
        if (!open) setGroupEditChoice(null);
      }}>
        <DialogContent className="w-[95vw] sm:max-w-[400px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Edit2 className="w-5 h-5 text-indigo-600" />
              {t('cal.editLesson')}
            </DialogTitle>
            <DialogDescription>
              {t('cal.editChoiceDesc')}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 py-2">
            <label className="flex items-center gap-2 cursor-pointer p-3 border rounded-lg hover:bg-gray-50">
              <input
                type="radio"
                name="groupEditChoice"
                checked={groupEditChoice === 'single'}
                onChange={() => setGroupEditChoice('single')}
                className="rounded-full border-gray-300 text-indigo-600 focus:ring-indigo-500"
              />
              <div>
                <p className="text-sm font-medium">{t('cal.editThisOnly')}</p>
                <p className="text-xs text-gray-500">{t('cal.editThisOnlyDesc')}</p>
              </div>
            </label>
            <label className="flex items-center gap-2 cursor-pointer p-3 border rounded-lg hover:bg-gray-50">
              <input
                type="radio"
                name="groupEditChoice"
                checked={groupEditChoice === 'all_future'}
                onChange={() => setGroupEditChoice('all_future')}
                className="rounded-full border-gray-300 text-indigo-600 focus:ring-indigo-500"
              />
              <div>
                <p className="text-sm font-medium">{t('cal.editAllFuture')}</p>
                <p className="text-xs text-gray-500">{t('cal.editAllFutureDesc')}</p>
              </div>
            </label>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setGroupEditChoice(null)}
              className="rounded-xl"
            >
              {t('cal.cancelChoice')}
            </Button>
            <Button
              onClick={() => {
                if (selectedEvent) {
                  setEditNewStartTime(format(selectedEvent.start_time, "yyyy-MM-dd'T'HH:mm"));
                  setEditDurationMinutes(Math.max(5, Math.round((selectedEvent.end_time.getTime() - selectedEvent.start_time.getTime()) / 60000)));
                  setEditTopic(selectedEvent.topic || '');
                  setEditMeetingLink(selectedEvent.meeting_link || '');
                  setEditTutorComment(selectedEvent.tutor_comment || '');
                  setEditShowCommentToStudent(selectedEvent.show_comment_to_student || false);
                  setIsEditingSession(true);
                }
              }}
              className="rounded-xl"
            >
              {t('cal.continue')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* === CANCEL SCOPE CHOICE DIALOG === */}
      <Dialog open={groupCancelChoice !== null && cancelConfirmId === null} onOpenChange={(open) => {
        if (!open) setGroupCancelChoice(null);
      }}>
        <DialogContent className="w-[95vw] sm:max-w-[400px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <XCircle className="w-5 h-5 text-red-600" />
              {t('cal.cancelLessonTitle')}
            </DialogTitle>
            <DialogDescription>
              {t('cal.cancelChoiceDesc')}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 py-2">
            <label className="flex items-center gap-2 cursor-pointer p-3 border rounded-lg hover:bg-gray-50">
              <input
                type="radio"
                name="groupCancelChoice"
                checked={groupCancelChoice === 'single'}
                onChange={() => setGroupCancelChoice('single')}
                className="rounded-full border-gray-300 text-indigo-600 focus:ring-indigo-500"
              />
              <div>
                <p className="text-sm font-medium">{t('cal.cancelThisOnly')}</p>
                <p className="text-xs text-gray-500">{t('cal.cancelThisOnlyDesc')}</p>
              </div>
            </label>
            <label className="flex items-center gap-2 cursor-pointer p-3 border rounded-lg hover:bg-gray-50">
              <input
                type="radio"
                name="groupCancelChoice"
                checked={groupCancelChoice === 'all_future'}
                onChange={() => setGroupCancelChoice('all_future')}
                className="rounded-full border-gray-300 text-indigo-600 focus:ring-indigo-500"
              />
              <div>
                <p className="text-sm font-medium">{t('cal.cancelAllFuture')}</p>
                <p className="text-xs text-gray-500">{t('cal.cancelAllFutureDesc')}</p>
              </div>
            </label>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setGroupCancelChoice(null)}
              className="rounded-xl"
            >
              Atgal
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                setCancelConfirmId(selectedEvent?.id || null);
                setCancellationReason('');
              }}
              className="rounded-xl"
            >
              {t('cal.continueCancel')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* === AVAILABILITY SETTINGS MODAL === */}
      <Dialog
        open={isAvailabilityModalOpen}
        onOpenChange={(open) => {
          setIsAvailabilityModalOpen(open);
          if (!open) {
            // Refetch when closing so the calendar gets new availability slots immediately
            fetchData();
          }
        }}
      >
        <DialogContent className="w-[95vw] sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('cal.scheduleSettings')}</DialogTitle>
            <DialogDescription>
              {t('cal.setWorkHours')}
            </DialogDescription>
          </DialogHeader>
          <AvailabilityManager />
        </DialogContent>
      </Dialog>
      {/* === UPCOMING SESSIONS LIST MODAL === */}
      <Dialog open={isUpcomingListModalOpen} onOpenChange={setIsUpcomingListModalOpen}>
        <DialogContent className="w-[95vw] sm:max-w-[480px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarDays className="w-5 h-5 text-indigo-600" />
              {t('cal.upcomingLessons')}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-2 max-h-[60vh] py-2 pr-1">
            {sessions.filter(s => s.status === 'active' && new Date(s.start_time).getTime() >= new Date().setHours(0, 0, 0, 0))
              .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime()).length === 0 ? (
              <div className="text-center py-6">
                <p className="text-gray-500 font-medium">{t('cal.noUpcomingLessons')}</p>
              </div>
            ) : (
              sessions.filter(s => s.status === 'active' && new Date(s.start_time).getTime() >= new Date().setHours(0, 0, 0, 0))
                .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())
                .map(s => {
                  const start = new Date(s.start_time);
                  const isToday = start.toDateString() === new Date().toDateString();
                  return (
                    <div
                      key={s.id}
                      onClick={() => {
                        setIsUpcomingListModalOpen(false);
                        setSelectedEvent(s);
                        setIsEventModalOpen(true);
                      }}
                      className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer hover:shadow-md transition-all ${isToday ? 'bg-indigo-50 border border-indigo-100' : 'bg-gray-50 border border-transparent'}`}
                    >
                      <div className={`w-1 h-10 rounded-full flex-shrink-0 ${isToday ? 'bg-indigo-500' : 'bg-gray-300'}`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-900 truncate">{s.student?.full_name}</p>
                        <p className="text-xs text-gray-500">
                          {format(start, isToday ? "'" + t('cal.todayAt') + "' HH:mm" : "EEE d MMM, HH:mm", { locale: dateFnsLocale })}
                          {s.topic && <span className="ml-1">· {s.topic}</span>}
                        </p>
                      </div>
                      <ArrowRight className="w-4 h-4 text-gray-400" />
                    </div>
                  );
                })
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* === CANCELLED SESSIONS LIST MODAL === */}
      <Dialog open={isCancelledListModalOpen} onOpenChange={setIsCancelledListModalOpen}>
        <DialogContent className="w-[95vw] sm:max-w-[480px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <XCircle className="w-5 h-5 text-red-600" />
              {t('cal.cancelledLessons')}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3 max-h-[60vh] py-2 pr-1">
            {sessions.filter(s => s.status === 'cancelled')
              .sort((a, b) => new Date(b.start_time).getTime() - new Date(a.start_time).getTime()).length === 0 ? (
              <div className="text-center py-8 text-gray-400">
                <XCircle className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">{t('cal.noCancelledLessons')}</p>
              </div>
            ) : (
              sessions.filter(s => s.status === 'cancelled')
                .sort((a, b) => new Date(b.start_time).getTime() - new Date(a.start_time).getTime())
                .map(s => {
                  const start = new Date(s.start_time);
                  return (
                    <div
                      key={s.id}
                      className="flex flex-col gap-2 p-4 rounded-xl border border-red-100 bg-red-50/30"
                    >
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-semibold text-gray-900">{s.student?.full_name}</p>
                        <span className="px-2 py-0.5 rounded-md bg-red-100 text-red-700 text-xs font-medium">{t('cal.cancelledBadge')}</span>
                      </div>
                      <p className="text-xs text-gray-500 font-medium">
                        {format(start, "EEEE, d MMM yyyy, HH:mm", { locale: dateFnsLocale })}
                        {s.topic && <span className="ml-1">· {s.topic}</span>}
                      </p>
                      {s.cancellation_reason && (
                        <div className="mt-2 p-2 rounded-lg bg-red-50 text-red-800 text-xs border border-red-100">
                          <span className="font-semibold block mb-1">{t('cal.reason')}</span>
                          {s.cancellation_reason}
                        </div>
                      )}
                    </div>
                  );
                })
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* === AVAILABILITY SLOT EDIT MODAL === */}
      <Dialog open={isSlotEditOpen} onOpenChange={(open) => { setIsSlotEditOpen(open); if (!open) setEditingSlot(null); }}>
        <DialogContent className="w-[95vw] sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Edit2 className="w-4 h-4 text-indigo-500" />
              {t('cal.editFreeTime')}
            </DialogTitle>
            <DialogDescription>
              {editingSlot && (
                editingSlot.ruleIsRecurring
                  ? `${t('cal.recurringTimePrefix')} · ${[t('cal.wdSun'), t('cal.wdMon'), t('cal.wdTue'), t('cal.wdWed'), t('cal.wdThu'), t('cal.wdFri'), t('cal.wdSat')][editingSlot.ruleDayOfWeek ?? 0]}`
                  : `Konkreti data · ${editingSlot.ruleDate}`
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{t('cal.startLabel')}</label>
                <TimeSpinner value={slotEditStart} onChange={setSlotEditStart} minuteStep={1} />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{t('dash.end')}</label>
                <TimeSpinner value={slotEditEnd} onChange={setSlotEditEnd} minuteStep={1} />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{t('cal.subjectsForSlot')}</label>
              <div className="text-xs text-gray-400 mb-2">
                {slotEditSubjects.length > 0
                  ? t('cal.selectedSubjects', { count: String(slotEditSubjects.length) })
                  : t('cal.noSubjectsSelected')}
              </div>
              <div className="grid grid-cols-2 gap-2 max-h-[160px] overflow-y-auto pr-1">
                {subjects.map(subject => (
                  <label key={subject.id} className="flex items-start gap-2 p-2 rounded-lg border border-gray-100 hover:bg-gray-50 cursor-pointer">
                    <input
                      type="checkbox"
                      className="mt-0.5 rounded text-indigo-600 focus:ring-indigo-500"
                      checked={slotEditSubjects.includes(subject.id)}
                      onChange={(e) => {
                        if (e.target.checked) setSlotEditSubjects([...slotEditSubjects, subject.id]);
                        else setSlotEditSubjects(slotEditSubjects.filter(id => id !== subject.id));
                      }}
                    />
                    <div className="flex flex-col">
                      <span className="text-sm font-medium text-gray-700">
                        {subject.name}
                        {subject.is_group && subject.max_students && (
                          <span className="text-xs text-violet-600 font-semibold ml-1">
                            {t('cal.groupMaxSeats', { max: String(subject.max_students) })}
                          </span>
                        )}
                      </span>
                      {subject.grade_min && subject.grade_max && (
                        <span className="text-[10px] text-gray-400">{subject.grade_min}-{subject.grade_max === 13 ? 'Stud.' : `${subject.grade_max} kl`}</span>
                      )}
                    </div>
                  </label>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{t('cal.linkLabel')}</label>
              <Input
                type="url"
                value={slotEditMeetingLink}
                onChange={(e) => setSlotEditMeetingLink(e.target.value)}
                className="rounded-xl"
                placeholder="https://zoom.us/j/... arba https://meet.google.com/..."
              />
              <p className="text-xs text-gray-400">{t('cal.linkUsedAsDefault')}</p>
            </div>

            {/* Add Student Button */}
            <div className="pt-2 border-t border-gray-100 space-y-2">
              <Button
                onClick={() => {
                  setAssignStudentId('');
                  setAssignSubjectId('');
                  setAssignSelectedSlot('');
                  setAssignMeetingLink('');
                  setAssignTopic('');
                  setIsAssignStudentOpen(true);
                }}
                className="w-full rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold"
                disabled={slotSaving}
              >
                <Plus className="w-4 h-4 mr-2" />
                {t('cal.addStudentToSlot')}
              </Button>
              {editingSlot?.ruleIsRecurring && (
                <Button
                  variant="outline"
                  onClick={() => {
                    if (!editingSlot) return;
                    const blockDate = format(editingSlot.blockStart, 'yyyy-MM-dd');
                    const slotStart = editingSlot.ruleStart;
                    const slotEnd = editingSlot.ruleEnd;
                    const [sh, sm] = slotStart.split(':').map(Number);
                    const [eh, em] = slotEnd.split(':').map(Number);
                    const durMin = (eh * 60 + em) - (sh * 60 + sm);
                    const lessonDur = Math.min(durMin, 60);
                    const endH = Math.floor((sh * 60 + sm + lessonDur) / 60);
                    const endM = (sh * 60 + sm + lessonDur) % 60;
                    setStartTime(`${blockDate}T${slotStart}`);
                    setEndTime(`${blockDate}T${String(endH).padStart(2,'0')}:${String(endM).padStart(2,'0')}`);
                    setMeetingLink(editingSlot.meetingLink || '');
                    setIsRecurring(true);
                    setRecurringFrequency('weekly');
                    setRecurringEndDate('');
                    setSelectedWeekdays([editingSlot.ruleDayOfWeek ?? new Date(editingSlot.blockStart).getDay()]);
                    setIsSlotEditOpen(false);
                    setEditingSlot(null);
                    setIsCreateModalOpen(true);
                  }}
                  className="w-full rounded-xl border-indigo-200 text-indigo-600 hover:bg-indigo-50"
                  disabled={slotSaving}
                >
                  <RefreshCw className="w-4 h-4 mr-2" />
                  {t('cal.addRecurringFromSlot')}
                </Button>
              )}
            </div>

            <div className="flex gap-2 pt-1">
              <Button
                variant="outline"
                className="flex-1 rounded-xl border-red-200 text-red-600 hover:bg-red-50"
                disabled={slotSaving}
                onClick={async () => {
                  if (!editingSlot) return;
                  if (!confirm(t('cal.confirmDeleteSlot'))) return;
                  setSlotSaving(true);
                  const { error } = await supabase.from('availability').delete().eq('id', editingSlot.ruleId);
                  if (!error && currentUserId) {
                    try {
                      const url = `${window.location.origin}/api/google-calendar-sync`;
                      await fetch(url, {
                        method: 'POST',
                        headers: await authHeaders(),
                        body: JSON.stringify({ userId: currentUserId }),
                      });
                    } catch (_) {}
                  }
                  setSlotSaving(false);
                  setIsSlotEditOpen(false);
                  fetchData();
                }}
              >
                {t('cal.delete')}
              </Button>
              <Button
                className="flex-1 rounded-xl"
                disabled={slotSaving || !slotEditStart || !slotEditEnd || slotEditStart >= slotEditEnd}
                onClick={async () => {
                  if (!editingSlot) return;
                  setSlotSaving(true);
                  const { error } = await supabase.from('availability').update({
                    start_time: slotEditStart,
                    end_time: slotEditEnd,
                    subject_ids: slotEditSubjects,
                    meeting_link: slotEditMeetingLink || null
                  }).eq('id', editingSlot.ruleId);
                  if (!error && currentUserId) {
                    try {
                      const url = `${window.location.origin}/api/google-calendar-sync`;
                      await fetch(url, {
                        method: 'POST',
                        headers: await authHeaders(),
                        body: JSON.stringify({ userId: currentUserId }),
                      });
                    } catch (_) {}
                  }
                  setSlotSaving(false);
                  setIsSlotEditOpen(false);
                  fetchData();
                }}
              >
                {slotSaving ? t('cal.slotSaving') : t('cal.slotSave')}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* === ASSIGN STUDENT TO SLOT MODAL === */}
      <Dialog open={isAssignStudentOpen} onOpenChange={(open) => {
        setIsAssignStudentOpen(open);
        if (!open) {
          setAssignStudentId('');
          setAssignStudentIds([]);
          setAssignSubjectId('');
          setAssignSelectedSlot('');
          setAssignMeetingLink('');
          setAssignTopic('');
        }
      }}>
        <DialogContent className="w-[95vw] sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="w-5 h-5 text-indigo-600" />
              {t('cal.assignStudent')}
            </DialogTitle>
            <DialogDescription>
              {editingSlot && (
                editingSlot.ruleIsRecurring
                  ? `${[t('cal.sunday'), t('cal.monday'), t('cal.tuesday'), t('cal.wednesday'), t('cal.thursday'), t('cal.friday'), t('cal.saturday')][editingSlot.ruleDayOfWeek ?? 0]} · ${editingSlot.ruleStart} - ${editingSlot.ruleEnd}`
                  : `${editingSlot.ruleDate} · ${editingSlot.ruleStart} - ${editingSlot.ruleEnd}`
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Subject Selection - MOVED TO TOP */}
            <div className="space-y-2">
              <Label className="text-sm font-semibold">{t('cal.selectSubjectRequired')}</Label>
              <Select value={assignSubjectId} onValueChange={(val) => {
                setAssignSubjectId(val);
                setAssignSelectedSlot('');
                setAssignStudentId('');
                setAssignStudentIds([]);
                // Auto-fill meeting link from availability slot (or subject if slot has none)
                const selectedSubject = subjects.find(s => s.id === val);
                if (selectedSubject) {
                  const slotMeetingLink = editingSlot?.meetingLink || '';
                  setAssignMeetingLink(slotMeetingLink || selectedSubject.meeting_link || '');
                  setAssignDuration(selectedSubject.duration_minutes);
                }
              }}>
                <SelectTrigger className="rounded-xl">
                  <SelectValue placeholder={t('cal.selectSubjectPlaceholderDots')} />
                </SelectTrigger>
                <SelectContent>
                  {subjects.length > 0 ? (
                    subjects.map(s => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                        {s.is_group && s.max_students && (
                          <span className="text-xs text-violet-600 font-semibold ml-2">
                            {t('cal.groupMaxSeats', { max: String(s.max_students) })}
                          </span>
                        )}
                        {s.grade_min && s.grade_max && (
                          <span className="text-xs text-gray-500 ml-2">
                            ({s.grade_min}-{s.grade_max === 13 ? 'Stud.' : `${s.grade_max} kl`})
                          </span>
                        )}
                        <span className="text-xs text-gray-500 ml-2">
                          ({s.duration_minutes} min{!orgPolicy.hideMoney && <>, €{s.price}</>})
                        </span>
                      </SelectItem>
                    ))
                  ) : (
                    <div className="px-3 py-2 text-sm text-gray-500">
                      {t('cal.noSubjectsCreated')}
                    </div>
                  )}
                </SelectContent>
              </Select>
            </div>

            {/* Student Selection - Shows after subject is selected */}
            {assignSubjectId && (() => {
              const selectedSubject = subjects.find(s => s.id === assignSubjectId);
              const isGroupLesson = selectedSubject?.is_group;
              const maxStudents = selectedSubject?.max_students || 1;

              if (isGroupLesson) {
                return (
                  <div className="space-y-2">
                    <Label className="text-sm font-semibold">{t('cal.studentsRequired', { max: String(maxStudents) })}</Label>
                    <div className="border border-gray-200 rounded-xl p-3 space-y-2 max-h-60 overflow-y-auto">
                      {students.length === 0 ? (
                        <p className="text-sm text-gray-400 text-center py-2">{t('cal.noStudents')}</p>
                      ) : (
                        students.map((student) => (
                          <label key={student.id} className="flex items-center gap-2 p-2 hover:bg-gray-50 rounded-lg cursor-pointer">
                            <input
                              type="checkbox"
                              checked={assignStudentIds.includes(student.id)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  if (assignStudentIds.length < maxStudents) {
                                    setAssignStudentIds([...assignStudentIds, student.id]);
                                  }
                                } else {
                                  setAssignStudentIds(assignStudentIds.filter(id => id !== student.id));
                                }
                              }}
                              disabled={!assignStudentIds.includes(student.id) && assignStudentIds.length >= maxStudents}
                              className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                            />
                            <span className="text-sm">
                              {student.full_name}
                              {student.grade && <span className="text-xs text-gray-500 ml-2">({student.grade})</span>}
                            </span>
                          </label>
                        ))
                      )}
                    </div>
                    <p className="text-xs text-gray-500">
                      {t('cal.selectedCount', { count: String(assignStudentIds.length), max: String(maxStudents) })}
                    </p>
                  </div>
                );
              } else {
                return (
                  <div className="space-y-2">
                    <Label className="text-sm font-semibold">{t('cal.selectStudentRequired')}</Label>
                    <Select value={assignStudentId} onValueChange={(val) => {
                      setAssignStudentId(val);
                      setAssignSelectedSlot('');
                    }}>
                      <SelectTrigger className="rounded-xl">
                        <SelectValue placeholder={t('cal.selectStudentPlaceholderDots')} />
                      </SelectTrigger>
                      <SelectContent>
                        {students.map(s => (
                          <SelectItem key={s.id} value={s.id}>
                            {s.full_name}
                            {s.grade && <span className="text-xs text-gray-500 ml-2">({s.grade})</span>}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                );
              }
            })()}

            {/* Duration (editable) */}
            {assignSubjectId && (
              <>
                <div className="space-y-2">
                  <Label className="text-sm font-semibold">{t('cal.durationMinutes')}</Label>
                  <Input
                    type="number"
                    value={assignDuration}
                    onChange={(e) => setAssignDuration(Number(e.target.value))}
                    className="rounded-xl"
                    min={5}
                    step={5}
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-semibold">{t('cal.meetingLink')}</Label>
                  <Input
                    type="url"
                    value={assignMeetingLink}
                    onChange={(e) => setAssignMeetingLink(e.target.value)}
                    className="rounded-xl"
                    placeholder="https://zoom.us/j/... arba https://meet.google.com/..."
                  />
                  <p className="text-xs text-gray-400">
                    {editingSlot?.meetingLink
                      ? t('cal.linkFromSlot')
                      : t('cal.linkFromSubject')}
                  </p>
                </div>
              </>
            )}

            {/* Time Slot Selection */}
            {assignSubjectId && assignAvailableSlots.length > 0 && (
              <div className="space-y-2">
                <Label className="text-sm font-semibold">{t('cal.selectTime')}</Label>
                <div className="grid grid-cols-3 gap-2 max-h-[200px] overflow-y-auto pr-2">
                  {assignAvailableSlots.map((slot) => (
                    <Button
                      key={slot}
                      variant={assignSelectedSlot === slot ? "default" : "outline"}
                      className={cn(
                        "rounded-xl text-sm font-medium",
                        assignSelectedSlot === slot && "bg-indigo-600 hover:bg-indigo-700"
                      )}
                      onClick={() => setAssignSelectedSlot(slot)}
                    >
                      {slot}
                    </Button>
                  ))}
                </div>
              </div>
            )}

            {assignSubjectId && assignAvailableSlots.length === 0 && (
              <div className="text-center py-4 text-gray-500 text-sm">
                {t('cal.noFreeSlots')}
              </div>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setIsAssignStudentOpen(false)}
              className="rounded-xl"
            >
              {t('cal.cancelAssign')}
            </Button>
            <Button
              onClick={handleAssignStudent}
              disabled={(!assignStudentId && assignStudentIds.length === 0) || !assignSubjectId || !assignSelectedSlot || assignSaving}
              className="rounded-xl bg-indigo-600 hover:bg-indigo-700"
            >
              {assignSaving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Sukuriama...
                </>
              ) : (
                <>
                  <CheckCircle className="w-4 h-4 mr-2" />
                  {t('cal.createLessonFromSlot')}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Mass Cancel Modal */}
      <Dialog open={isMassCancelModalOpen} onOpenChange={handleMassCancelModalClose}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto sm:max-w-3xl w-[95vw] sm:w-full">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <XCircle className="w-5 h-5 text-red-600" />
              {t('cal.massCancelTitle')}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {!massCancelPreviewMode ? (
              <>
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                  <p className="text-sm text-amber-900">
                    {t('cal.massCancelDesc')}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-sm font-semibold text-gray-700 flex items-center gap-1">
                      <CalendarDays className="w-4 h-4" />
                      Nuo datos *
                    </Label>
                    <DateInput
                      value={massCancelStartDate}
                      onChange={(e) => setMassCancelStartDate(e.target.value)}
                      className="mt-1 rounded-lg"
                    />
                  </div>
                  <div>
                    <Label className="text-sm font-semibold text-gray-700 flex items-center gap-1">
                      <CalendarDays className="w-4 h-4" />
                      Iki datos *
                    </Label>
                    <DateInput
                      value={massCancelEndDate}
                      onChange={(e) => setMassCancelEndDate(e.target.value)}
                      className="mt-1 rounded-lg"
                    />
                  </div>
                </div>

                {massCancelError && (
                  <div className="bg-red-50 border border-red-200 rounded-xl p-3">
                    <p className="text-sm text-red-700">{massCancelError}</p>
                  </div>
                )}

                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={handleMassCancelModalClose}
                    disabled={massCancelLoading}
                    className="flex-1 rounded-lg"
                  >
                    {t('cal.massCancelCancel')}
                  </Button>
                  <Button
                    onClick={handleMassCancelPreview}
                    disabled={massCancelLoading || !massCancelStartDate || !massCancelEndDate}
                    className="flex-1 rounded-lg bg-indigo-600 hover:bg-indigo-700"
                  >
                    {massCancelLoading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin mr-2" />
                        {t('cal.massCancelSearching')}
                      </>
                    ) : (
                      t('cal.massCancelPreview')
                    )}
                  </Button>
                </div>
              </>
            ) : (
              <>
                <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <p className="text-sm font-semibold text-red-900">
                        Laikotarpis: {format(new Date(massCancelStartDate), 'yyyy-MM-dd')} - {format(new Date(massCancelEndDate), 'yyyy-MM-dd')}
                      </p>
                      <p className="text-xs text-red-700 mt-1">
                        {t('cal.massCancelCount', { count: String(massCancelPreviewSessions.length) })}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setMassCancelPreviewMode(false)}
                      className="text-xs"
                      disabled={massCancelLoading}
                    >
                      ← Atgal
                    </Button>
                  </div>
                </div>

                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-semibold text-amber-900">Svarbu!</p>
                      <p className="text-xs text-amber-800 mt-1">
                        {t('cal.massCancelNote')}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="space-y-2 max-h-[300px] overflow-y-auto border border-gray-200 rounded-xl p-3">
                  <p className="text-sm font-semibold text-gray-700 mb-2">{t('cal.massCancelList')}</p>
                  {massCancelPreviewSessions.map((session) => {
                    const subject = session.subjects as any;
                    return (
                      <div key={session.id} className="bg-white border border-gray-200 rounded-lg p-3 text-sm">
                        <div className="flex justify-between items-start">
                          <div>
                            <p className="font-semibold text-gray-900">
                              {format(session.start_time, 'yyyy-MM-dd')} {format(session.start_time, 'HH:mm')} - {format(session.end_time, 'HH:mm')}
                            </p>
                            <p className="text-xs text-gray-600 mt-0.5">
                              {t('cal.studentInfo')}: {session.student?.full_name || t('cal.notSpecified')}
                            </p>
                            {subject?.name && (
                              <p className="text-xs text-gray-600">
                                {t('cal.subjectInfo')}: {subject.name}
                              </p>
                            )}
                          </div>
                          {session.price && !orgPolicy.hideMoney && (
                            <p className="text-sm font-semibold text-gray-700">€{session.price.toFixed(2)}</p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div>
                  <Label className="text-sm font-semibold text-gray-700">
                    {t('cal.massCancelReasonLabel')}
                  </Label>
                  <textarea
                    value={massCancellationReason}
                    onChange={(e) => setMassCancellationReason(e.target.value)}
                    placeholder={t('cal.massCancelReasonPlaceholder')}
                    className="mt-1 w-full rounded-lg border border-gray-300 p-3 text-sm min-h-[100px] focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    disabled={massCancelLoading}
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    {t('cal.massCancelChars', { count: String(massCancellationReason.length) })}
                  </p>
                </div>

                {massCancelError && (
                  <div className="bg-red-50 border border-red-200 rounded-xl p-3">
                    <p className="text-sm text-red-700">{massCancelError}</p>
                  </div>
                )}

                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => setMassCancelPreviewMode(false)}
                    disabled={massCancelLoading}
                    className="flex-1 rounded-lg"
                  >
                    Atgal
                  </Button>
                  <Button
                    onClick={handleMassCancelConfirm}
                    disabled={massCancelLoading || massCancellationReason.trim().length < 5}
                    className="flex-1 rounded-lg bg-red-600 hover:bg-red-700"
                  >
                    {massCancelLoading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin mr-2" />
                        {t('cal.massCancelProcessing')}
                      </>
                    ) : (
                      t('cal.massCancelConfirm', { count: String(massCancelPreviewSessions.length) })
                    )}
                  </Button>
                </div>

                <p className="text-xs text-gray-500 text-center">
                  {t('cal.massCancelEmailNote')}
                </p>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
      </div>
      </div>
    </Layout>
  );
}
