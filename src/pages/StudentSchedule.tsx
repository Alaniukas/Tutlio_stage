import { useEffect, useState, useCallback, useMemo } from 'react';
import StudentLayout from '@/components/StudentLayout';
import StatusBadge from '@/components/StatusBadge';
import { supabase } from '@/lib/supabase';
import { authHeaders } from '@/lib/apiHelpers';
import { format, addDays, getDay, startOfWeek, parse, addHours, isBefore, isAfter, parseISO, differenceInHours, startOfMonth, endOfMonth, startOfDay, endOfDay } from 'date-fns';
import { lt } from 'date-fns/locale';
import { useTranslation } from '@/lib/i18n';
import { Calendar as BigCalendar, dateFnsLocalizer, Views, View } from 'react-big-calendar';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import { ChevronLeft, ChevronRight, LayoutGrid, CalendarDays, List, Check, CalendarIcon, XCircle, ShieldAlert, Clock, Wallet, Info, CreditCard, Loader2, Users } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { cn, normalizeUrl } from '@/lib/utils';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { sendEmail } from '@/lib/email';
import { useStudentPaymentBlock } from '@/hooks/useStudentPaymentBlock';
import { shouldUsePackageForBooking } from '@/lib/studentPaymentModel';
import { recurringAvailabilityAppliesOnDate } from '@/lib/availabilityRecurring';
import { formatCustomerChargeEur } from '@/lib/stripeLessonPricing';

// BigCalendar Setup
const locales = { lt: lt };
const localizer = dateFnsLocalizer({ format, parse, startOfWeek, getDay, locales });

interface Availability {
  day_of_week: number | null;
  start_time: string;
  end_time: string;
  is_recurring: boolean;
  specific_date: string | null;
  end_date?: string | null;
  start_date?: string | null;
  created_at?: string | null;
}
interface ExistingSession {
    id: string;
    start_time: string;
    end_time: string;
    status: string;
    student_id: string;
    topic?: string;
    price?: number;
    paid?: boolean;
    payment_status?: string;
    meeting_link?: string;
    tutor_comment?: string | null;
    show_comment_to_student?: boolean;
    subject_id?: string | null;
    available_spots?: number | null;
    subjects?: { is_group?: boolean; max_students?: number; name?: string } | null;
}
interface Subject { id: string; name: string; price: number; duration_minutes: number; color: string; grade_min?: number | null; grade_max?: number | null; has_individual_pricing?: boolean; meeting_link?: string | null; is_group?: boolean; max_students?: number | null; is_trial?: boolean | null; }
interface LessonPackageSummary {
    id: string;
    subject_id: string;
    available_lessons: number;
    reserved_lessons: number;
    total_lessons: number;
}

// Helper function to parse student grade string to number
// e.g., "5 klasė" -> 5, "Studentas" -> 13 (DB stores Lithuanian grade strings)
function parseStudentGrade(grade: string | null): number {
    if (!grade) return 1; // Default to grade 1 if not specified
    if (grade.toLowerCase().includes('studentas')) return 13;
    const match = grade.match(/(\d+)/);
    return match ? parseInt(match[1]) : 1;
}

interface SlotEvent {
    start: Date;
    end: Date;
    title: string;
    occupied: boolean;
    sessionId?: string;
    isMySession: boolean;
    isPast: boolean;
    isBackground?: boolean;
}

export default function StudentSchedule() {
    const { t, dateFnsLocale } = useTranslation();
    const navigate = useNavigate();
    const [availability, setAvailability] = useState<Availability[]>([]);
    const [existingSessions, setExistingSessions] = useState<ExistingSession[]>([]);
    const [studentId, setStudentId] = useState('');
    const { blocked: bookingBlocked, loading: blockLoading, refetch: refetchBookingBlock } = useStudentPaymentBlock(studentId || null);
    const [tutorId, setTutorId] = useState('');
    const [subjects, setSubjects] = useState<Subject[]>([]);

    // Calendar State
    const [currentView, setCurrentView] = useState<View>(
        typeof window !== 'undefined' && window.innerWidth < 768 ? Views.DAY : Views.WEEK
    );
    const [searchParams] = useSearchParams();
    const initialDate = searchParams.get('date');
    const [currentDate, setCurrentDate] = useState<Date>(initialDate ? parseISO(initialDate) : new Date());
    const [events, setEvents] = useState<SlotEvent[]>([]);
    const [bgEvents, setBgEvents] = useState<SlotEvent[]>([]);
    const [occupiedSlots, setOccupiedSlots] = useState<{ id: string, start_time: string, end_time: string, subject_id?: string, available_spots?: number | null }[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [loadingMore, setLoadingMore] = useState(false);
    const [loadedRanges, setLoadedRanges] = useState<Array<{ start: Date, end: Date }>>([]);

    // Dialog State
    const [selectedEvent, setSelectedEvent] = useState<SlotEvent | null>(null);
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [selectedSubjectId, setSelectedSubjectId] = useState('');
    const [saving, setSaving] = useState(false);
    const [successMsg, setSuccessMsg] = useState('');
    const [cancellationHours, setCancellationHours] = useState(24);
    const [cancellationFeePercent, setCancellationFeePercent] = useState(0);
    const [minBookingHours, setMinBookingHours] = useState(1);
    const [breakBetweenLessons, setBreakBetweenLessons] = useState(0);
    const [isMySessionModalOpen, setIsMySessionModalOpen] = useState(false);
    const [mySessionData, setMySessionData] = useState<ExistingSession | null>(null);
    const [waitlistCount, setWaitlistCount] = useState(0);
    const [availableSlots, setAvailableSlots] = useState<Date[]>([]);
    const [selectedTime, setSelectedTime] = useState<Date | null>(null);
    const [selectedWaitlistSubjectId, setSelectedWaitlistSubjectId] = useState('');

    const [redirectingToStripe, setRedirectingToStripe] = useState(false);
    const [studentPaymentModel, setStudentPaymentModel] = useState<string | null>(null);
    const [studentPaymentOverrideActive, setStudentPaymentOverrideActive] = useState(false);
    const [studentPaymentPayer, setStudentPaymentPayer] = useState<string | null>(null);
    const [studentPayerEmail, setStudentPayerEmail] = useState<string | null>(null);
    const [studentEmail, setStudentEmail] = useState<string | null>(null);
    const [studentName, setStudentName] = useState<string>('');
    const [paymentTiming, setPaymentTiming] = useState<'before_lesson' | 'after_lesson'>('before_lesson');
    const [paymentDeadlineHours, setPaymentDeadlineHours] = useState(24);
    const [showPaymentModal, setShowPaymentModal] = useState(false);
    const [pendingPaymentSession, setPendingPaymentSession] = useState<{
        id: string; start: Date; end: Date; price: number | null; deadline: Date; tutorName: string;
    } | null>(null);
    const [fetchingStripe, setFetchingStripe] = useState(false);
    const [creditBalance, setCreditBalance] = useState(0);
    const [activePackages, setActivePackages] = useState<LessonPackageSummary[]>([]);
    const ACTIVE_STUDENT_PROFILE_KEY = 'tutlio_active_student_profile_id';

    useEffect(() => {
        void fetchInitialData();
        const onProfileChange = () => {
            void fetchInitialData();
        };
        window.addEventListener('student-profile-changed', onProfileChange);
        return () => window.removeEventListener('student-profile-changed', onProfileChange);
    }, []);
    // OPTIMIZED: Memoize slot calculation to avoid recalculating on every render
    const { memoizedEvents, memoizedBgEvents } = useMemo(() => {
        const generatedEvents: SlotEvent[] = [];
        const generatedBgEvents: SlotEvent[] = [];

        // Calculate range based on loaded ranges, or default to initial range (30 days ago to 7 days ahead)
        let startOfRange = addDays(new Date(), -30);
        let endOfRange = addDays(new Date(), 7);

        if (loadedRanges.length > 0) {
            startOfRange = new Date(Math.min(...loadedRanges.map(r => r.start.getTime())));
            endOfRange = new Date(Math.max(...loadedRanges.map(r => r.end.getTime())));
        }

        const now = new Date();

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

            // Generate Background Events for free working hours
            rules.forEach(rule => {
                const startDT = new Date(`${dateStr}T${rule.start_time}`);
                const endDT = new Date(`${dateStr}T${rule.end_time}`);
                if (startDT < endDT) {
                    generatedBgEvents.push({
                        start: startDT,
                        end: endDT,
                        title: 'Darbo laikas',
                        occupied: false,
                        isMySession: false,
                        isPast: isBefore(endDT, now),
                        isBackground: true
                    });
                }
            });
        }

        // Generate normal Events for occupied slots
        const addOccupiedEvent = (sStart: Date, sEnd: Date, isMySession: boolean, sessionId?: string, isGroup?: boolean, subjectName?: string) => {
            const extendedEnd = new Date(sEnd.getTime() + breakBetweenLessons * 60000);
            const isPast = isBefore(sStart, now);
            let title = isMySession ? t('stuSched.myLesson') : t('stuSched.occupied');
            if (isPast) title = isMySession ? t('stuSched.occurred') : t('stuSched.occupied');

            // Add group indicator if it's a group lesson
            if (isMySession && isGroup) {
                title = isPast ? t('stuSched.occurredGroup') : t('stuSched.myLessonGroup');
            }

            generatedEvents.push({
                start: sStart,
                end: extendedEnd,
                title,
                occupied: true,
                sessionId,
                isMySession,
                isPast
            });
        };

        existingSessions.forEach(s => {
            if (s.status !== 'cancelled') {
                const isGroup = s.subjects?.is_group === true;
                const subjectName = s.subjects?.name;
                addOccupiedEvent(
                    new Date(s.start_time),
                    new Date(s.end_time),
                    s.student_id === studentId,
                    s.id,
                    isGroup,
                    subjectName
                );
            }
        });

        occupiedSlots.forEach(s => {
            const sStart = new Date(s.start_time);
            const sEnd = new Date(s.end_time);

            // Hide the occupied slot if it belongs to a subject that is outside the student's grade level
            if (s.subject_id && !subjects.some(subj => subj.id === s.subject_id)) {
                return;
            }

            // Check if not already added by existingSessions
            const alreadyExists = existingSessions.some(mys => new Date(mys.start_time).getTime() === sStart.getTime() && mys.status !== 'cancelled');
            // Don't block group lessons that still have available spots
            const isGroupWithSpots = s.available_spots != null && s.available_spots > 0;
            if (!alreadyExists && !isGroupWithSpots) {
                addOccupiedEvent(sStart, sEnd, false, s.id);
            }
        });

        return { memoizedEvents: generatedEvents, memoizedBgEvents: generatedBgEvents };
    }, [availability, existingSessions, occupiedSlots, minBookingHours, breakBetweenLessons, studentId, subjects, loadedRanges]);

    useEffect(() => {
        // Always update events when memoized values change
        // Don't gate on availability.length - student sessions should show even without availability
        setEvents(memoizedEvents);
        setBgEvents(memoizedBgEvents);
    }, [memoizedEvents, memoizedBgEvents]);

    // Helper to check if a date range is already loaded
    const isRangeLoaded = (start: Date, end: Date) => {
        return loadedRanges.some(range =>
            start >= range.start && end <= range.end
        );
    };

    const fetchOccupiedSlotsViaApi = async (params: { tutorId: string; studentId: string; startISO: string; endISO: string }) => {
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session?.access_token) return [];
            const resp = await fetch('/api/get-occupied-slots', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${session.access_token}`,
                },
                body: JSON.stringify({
                    tutorId: params.tutorId,
                    studentId: params.studentId,
                    start: params.startISO,
                    end: params.endISO,
                }),
            });
            const json = await resp.json().catch(() => ({}));
            if (!resp.ok) {
                console.error('[StudentSchedule] occupied slots API failed:', json);
                return [];
            }
            return Array.isArray(json.slots) ? json.slots : [];
        } catch (e) {
            console.error('[StudentSchedule] occupied slots API error:', e);
            return [];
        }
    };

    // OPTIMIZED: Initial load with minimal date range (7 days) for instant display
    const fetchInitialData = async () => {
        setLoadError(null);
        setLoading(true);
        try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            setLoadError(t('stuSched.notLoggedIn'));
            return;
        }

        const selectedStudentId = typeof window !== 'undefined'
            ? localStorage.getItem(ACTIVE_STUDENT_PROFILE_KEY)
            : null;
        let { data: studentRows, error: rpcError } = await supabase.rpc('get_student_profiles', {
            p_user_id: user.id,
            p_student_id: selectedStudentId || null,
        });
        if (rpcError) {
            console.error('[StudentSchedule] get_student_profiles', rpcError);
            setLoadError(t('stuSched.profileLoadFailed'));
            return;
        }

        let st = studentRows?.[0];
        if (!st && selectedStudentId) {
            const { data: fallbackRows } = await supabase.rpc('get_student_profiles', {
                p_user_id: user.id,
                p_student_id: null,
            });
            st = fallbackRows?.[0];
            if (st && typeof window !== 'undefined') {
                localStorage.setItem(ACTIVE_STUDENT_PROFILE_KEY, st.id);
            }
        }
        if (!st) {
            setLoadError(t('stuSched.profileNotFound'));
            return;
        }
        if (!st.tutor_id) {
            setStudentId(st.id);
            setStudentName(st.full_name || '');
            setLoadError(t('stuSched.noTutorAssigned'));
            return;
        }
        setStudentId(st.id);
        setTutorId(st.tutor_id);
        setStudentPaymentModel((st as { payment_model?: string | null }).payment_model ?? null);
        setStudentPaymentOverrideActive(!!(st as { payment_override_active?: boolean }).payment_override_active);
        setStudentPaymentPayer(st.payment_payer || null);
        setStudentPayerEmail(st.payer_email || null);
        setStudentEmail((st as any).email || null);
        setStudentName(st.full_name || '');
        setCreditBalance(Number((st as any).credit_balance || 0));

        // OPTIMIZED: Initial load with 30 days past + 7 days future to show recent sessions
        const past = addDays(new Date(), -30).toISOString();
        const future = addDays(new Date(), 7).toISOString();

        const studentGrade = parseStudentGrade(st.grade);

        const [tutorProfile, subs, individualPricing, availabilityRes, packageRes, sessionsRes] = await Promise.all([
            supabase.from('profiles').select('cancellation_hours, cancellation_fee_percent, min_booking_hours, break_between_lessons, payment_timing, payment_deadline_hours, organization_id').eq('id', st.tutor_id).single(),
            supabase.from('subjects').select('*').eq('tutor_id', st.tutor_id).order('name'),
            supabase
                .from('student_individual_pricing')
                .select('*')
                .eq('student_id', st.id)
                .eq('tutor_id', st.tutor_id),
            supabase.from('availability').select('*').eq('tutor_id', st.tutor_id),
            supabase
                .from('lesson_packages')
                .select('id, subject_id, available_lessons, reserved_lessons, total_lessons')
                .eq('student_id', st.id)
                .eq('active', true)
                .eq('paid', true)
                .gt('available_lessons', 0)
                .order('created_at', { ascending: false }),
            supabase.from('sessions').select('*, subjects(is_group, max_students, name)')
                .eq('tutor_id', st.tutor_id)
                .eq('student_id', st.id)
                .gte('start_time', past)
                .lte('start_time', future),
        ]);

        // Process tutor profile data
        if (tutorProfile.data) {
            setCancellationHours(tutorProfile.data.cancellation_hours ?? 24);
            setCancellationFeePercent(tutorProfile.data.cancellation_fee_percent ?? 0);
            const rawMinBooking = tutorProfile.data.min_booking_hours ?? 1;
            const rawPaymentDeadline = tutorProfile.data.payment_deadline_hours ?? 24;
            setMinBookingHours(rawMinBooking);
            setBreakBetweenLessons(tutorProfile.data.break_between_lessons ?? 0);
            setPaymentTiming(tutorProfile.data.payment_timing ?? 'before_lesson');
            setPaymentDeadlineHours(rawPaymentDeadline);
        }

        // Filter subjects by student grade
        const filteredSubjects = (subs.data || []).filter((subject) => {
            if (subject.grade_min === null || subject.grade_max === null) return true;
            return studentGrade >= subject.grade_min && studentGrade <= subject.grade_max;
        });

        // OPTIMIZED: Batch fetch individual pricing once instead of per-subject RPC calls
        let finalSubjects = filteredSubjects;
        if (individualPricing.data && individualPricing.data.length > 0) {
            finalSubjects = filteredSubjects.map(subject => {
                const pricing = individualPricing.data!.find(ip => ip.subject_id === subject.id);
                if (pricing) {
                    return {
                        ...subject,
                        price: pricing.price,
                        duration_minutes: pricing.duration_minutes,
                        has_individual_pricing: true,
                    };
                }
                return subject;
            });
        }

        // org_student: show trial subject only after trial offer/package is actually sent.
        const isOrgStudentFlow = !!(tutorProfile.data as any)?.organization_id;
        if (isOrgStudentFlow) {
            const trialSubjectIds = finalSubjects.filter((s: any) => s.is_trial === true).map((s) => s.id);
            if (trialSubjectIds.length > 0) {
                const { data: trialPackages } = await supabase
                    .from('lesson_packages')
                    .select('id, subject_id, paid, active')
                    .eq('student_id', st.id)
                    .in('subject_id', trialSubjectIds)
                    .eq('paid', true)
                    .eq('active', true)
                    .order('created_at', { ascending: false })
                    .limit(20);
                const sentTrialSubjectIds = new Set((trialPackages || []).map((p: any) => p.subject_id));
                finalSubjects = finalSubjects.filter((s: any) => s.is_trial !== true || sentTrialSubjectIds.has(s.id));
            }
        }
        setSubjects(finalSubjects);

        const filteredAvailability = (availabilityRes.data || []).filter((avail: any) => {
            if (!avail.subject_ids || avail.subject_ids.length === 0) return true;
            return avail.subject_ids.some((subjectId: string) => finalSubjects.some((s) => s.id === subjectId));
        });
        setAvailability(filteredAvailability);
        setActivePackages((packageRes.data || []) as LessonPackageSummary[]);

        const mySessionsData = sessionsRes.data || [];
        const otherSessionsData = await fetchOccupiedSlotsViaApi({
            tutorId: st.tutor_id,
            studentId: st.id,
            startISO: past,
            endISO: future,
        });

        // Debug logging for group lessons
        const groupSessions = mySessionsData.filter((s: any) => s.subjects?.is_group === true);
        if (groupSessions.length > 0) {
            console.log(`[StudentSchedule] Found ${groupSessions.length} group lesson(s) for student:`, groupSessions);
        }

        setExistingSessions(mySessionsData);
        setOccupiedSlots(otherSessionsData);

        // Mark initial range as loaded (30 days ago to 7 days ahead)
        setLoadedRanges([{ start: addDays(new Date(), -30), end: addDays(new Date(), 7) }]);
        await refetchBookingBlock();

        // OPTIMIZATION: Pre-fetch current month in background for smooth navigation
        setTimeout(() => {
            const monthStart = startOfMonth(new Date());
            const monthEnd = endOfMonth(new Date());
            fetchDateRange(monthStart, monthEnd);
        }, 500);
        } catch (e) {
            console.error('[StudentSchedule] fetchInitialData', e);
            setLoadError(t('stuSched.calendarError'));
        } finally {
            setLoading(false);
        }
    };

    // OPTIMIZED: Fetch data for specific date range (used when user navigates calendar)
    const fetchDateRange = async (startDate: Date, endDate: Date) => {
        // Don't fetch if already loaded
        if (isRangeLoaded(startDate, endDate)) {
            return;
        }

        setLoadingMore(true);

        if (!tutorId) {
            setLoadingMore(false);
            return;
        }

        const past = startDate.toISOString();
        const future = endDate.toISOString();

        try {
            // Fetch all sessions for the new range
            const sessionsRes = await supabase.from('sessions').select('*, subjects(is_group, max_students, name)')
                .eq('tutor_id', tutorId)
                .eq('student_id', studentId)
                .gte('start_time', past)
                .lte('start_time', future);

            const myNewSessions = sessionsRes.data || [];
            const otherNewSessions = await fetchOccupiedSlotsViaApi({
                tutorId,
                studentId,
                startISO: past,
                endISO: future,
            });

            // Debug logging for group lessons
            const groupSessions = myNewSessions.filter((s: any) => s.subjects?.is_group === true);
            if (groupSessions.length > 0) {
                console.log(`[StudentSchedule] Found ${groupSessions.length} group lesson(s) in date range:`, groupSessions);
            }

            // Merge with existing data (avoid duplicates)
            setExistingSessions(prev => {
                const merged = [...prev];
                myNewSessions.forEach(newSession => {
                    if (!merged.some(s => s.id === newSession.id)) {
                        merged.push(newSession);
                    }
                });
                return merged;
            });

            setOccupiedSlots(prev => {
                const merged = [...prev];
                otherNewSessions.forEach((newSlot: any) => {
                    if (!merged.some(s => s.id === newSlot.id)) {
                        merged.push(newSlot);
                    }
                });
                return merged;
            });

            // Add this range to loaded ranges
            setLoadedRanges(prev => [...prev, { start: startDate, end: endDate }]);
        } catch (error) {
            console.error('Error fetching date range:', error);
        } finally {
            setLoadingMore(false);
        }
    };

    // Legacy fetchData for compatibility with existing code
    const fetchData = async () => {
        await fetchInitialData();
    };

    const lessonCreditBreakdown = (lessonPrice: number | null | undefined) => {
        const p = Math.max(0, Number(lessonPrice) || 0);
        const creditApplied = Math.min(creditBalance, p);
        const remaining = Math.max(0, p - creditApplied);
        return { creditApplied, remaining };
    };

    // OPTIMIZED: Handle calendar navigation with progressive loading
    const handleNavigate = useCallback(async (newDate: Date, view?: View) => {
        setCurrentDate(newDate);

        // Determine the date range to load based on the view
        let startDate: Date;
        let endDate: Date;

        const actualView = view || currentView;

        if (actualView === Views.MONTH) {
            // Load entire month
            startDate = startOfMonth(newDate);
            endDate = endOfMonth(newDate);
        } else if (actualView === Views.WEEK) {
            // Load week range
            startDate = startOfWeek(newDate, { weekStartsOn: 1 });
            endDate = addDays(startDate, 6);
        } else {
            // Day view - just load that day
            startDate = startOfDay(newDate);
            endDate = endOfDay(newDate);
        }

        // Fetch data for this range if not already loaded
        await fetchDateRange(startDate, endDate);
    }, [currentView, tutorId]);


    const handleSelectEvent = async (event: SlotEvent) => {
        if (event.isMySession && event.sessionId) {
            const sess = existingSessions.find(s => s.id === event.sessionId);
            if (sess) {
                setMySessionData(sess);
                setIsMySessionModalOpen(true);
            }
            return;
        }
        if (event.isPast) return;

        if (event.occupied && event.sessionId) {
            // Check waitlist info
            const { count } = await supabase.from('waitlists').select('*', { count: 'exact', head: true }).eq('session_id', event.sessionId);
            setWaitlistCount(count || 0);
        } else {
            setWaitlistCount(0);
        }

        setSelectedEvent(event);
        setSelectedSubjectId('');
        setSelectedWaitlistSubjectId('');
        setIsDialogOpen(true);
    };

    const handleSelectSlot = ({ start }: { start: Date }) => {
        if (isBefore(start, new Date())) return;

        // 1. Is start inside any bgEvent (Darbo laikas)?
        const insideBg = bgEvents.find(bg => start >= bg.start && start < bg.end);
        if (!insideBg) {
            return; // Ignore clicks outside working hours
        }

        // 2. Is start inside any occupied event?
        const insideOccupied = events.find(e => start >= e.start && start < e.end);
        if (insideOccupied) {
            return; // Let handleSelectEvent catch it or ignore
        }

        // 3. Min booking hours check (bgEvents already trimmed, this is a safety net)
        const hoursUntil = differenceInHours(start, new Date());
        if (hoursUntil < minBookingHours) return;

        setSelectedEvent({
            start,
            end: addHours(start, 1),
            title: 'Nauja pamoka',
            occupied: false,
            isMySession: false,
            isPast: false
        });
        setSelectedSubjectId('');
        setSelectedWaitlistSubjectId('');
        setAvailableSlots([]);
        setSelectedTime(null);
        setIsDialogOpen(true);
    };

    useEffect(() => {
        if (!selectedEvent || selectedEvent.occupied || !selectedSubjectId) {
            setAvailableSlots([]);
            setSelectedTime(null);
            return;
        }

        const subject = subjects.find(s => s.id === selectedSubjectId);
        if (!subject) return;

        const minSubDurMs = Math.min(...subjects.map(s => s.duration_minutes)) * 60000;
        const durMs = subject.duration_minutes * 60000;
        const breakMs = breakBetweenLessons * 60000;

        const dayStart = new Date(selectedEvent.start);
        dayStart.setHours(0, 0, 0, 0);
        const dayEnd = new Date(selectedEvent.start);
        dayEnd.setHours(23, 59, 59, 999);

        const dayBgEvents = bgEvents.filter(bg =>
            (bg.start >= dayStart && bg.start <= dayEnd) ||
            (bg.end >= dayStart && bg.end <= dayEnd) ||
            (bg.start <= dayStart && bg.end >= dayEnd)
        );

        // Occupied slots - other students + my own booked sessions
        const dayOccupied = events.filter(e =>
            e.occupied && (
                (e.start >= dayStart && e.start <= dayEnd) ||
                (e.end >= dayStart && e.end <= dayEnd) ||
                (e.start <= dayStart && e.end >= dayEnd)
            )
        );

        const slots: Date[] = [];
        const nowMs = Date.now();
        const minBookingMs = minBookingHours * 3600000;

        dayBgEvents.forEach(bg => {
            let t = bg.start.getTime();
            const endT = bg.end.getTime() - durMs;

            while (t <= endT) {
                const candStart = new Date(t);
                const candEnd = new Date(t + durMs);

                // If it doesn't end exactly at shift end, require a break after it
                const requiresBreak = candEnd.getTime() < bg.end.getTime();
                const candEndWithBreak = new Date(candEnd.getTime() + (requiresBreak ? breakMs : 0));

                const overlaps = dayOccupied.some(occ =>
                    (candStart >= occ.start && candStart < occ.end) ||
                    (candEndWithBreak > occ.start && candEndWithBreak <= occ.end) ||
                    (candStart <= occ.start && candEndWithBreak >= occ.end)
                );

                const isTooSoon = (candStart.getTime() - nowMs) < minBookingMs;

                if (!overlaps && !isTooSoon) {
                    let prevEnd = bg.start.getTime();
                    dayOccupied.forEach(occ => {
                        if (occ.end.getTime() <= candStart.getTime() && occ.end.getTime() > prevEnd) {
                            prevEnd = occ.end.getTime();
                        }
                    });

                    let nextStart = bg.end.getTime();
                    dayOccupied.forEach(occ => {
                        if (occ.start.getTime() >= candEndWithBreak.getTime() && occ.start.getTime() < nextStart) {
                            nextStart = occ.start.getTime();
                        }
                    });

                    const gapBefore = candStart.getTime() - prevEnd;
                    const gapAfter = nextStart - candEndWithBreak.getTime();

                    // Important: we should allow slots even when the *next* thing in the day is already occupied.
                    // Otherwise we incorrectly block valid bookings (e.g. when a lesson exists later in the free range,
                    // but the free window after the new lesson is shorter than `minSubDurMs`).
                    const prevIsFromOccupied = prevEnd !== bg.start.getTime();
                    const nextIsFromOccupied = nextStart !== bg.end.getTime();

                    const isGapBeforeValid = prevIsFromOccupied ? true : (gapBefore === 0 || gapBefore >= minSubDurMs);
                    const isGapAfterValid = nextIsFromOccupied ? true : (gapAfter === 0 || gapAfter >= minSubDurMs);

                    if (isGapBeforeValid && isGapAfterValid) slots.push(candStart);
                }
                t += 15 * 60000; // Step by 15 mins
            }
        });

        const uniqueSlots = Array.from(new Set(slots.map(s => s.getTime()))).map(t => new Date(t)).sort((a, b) => a.getTime() - b.getTime());
        setAvailableSlots(uniqueSlots);
        setSelectedTime(null);
    }, [selectedSubjectId, selectedEvent, subjects, bgEvents, events, minBookingHours, breakBetweenLessons]);

    const handleBook = async () => {
        if (!selectedEvent || !selectedTime) return;
        setSaving(true);
        const selectedSubject = subjects.find(s => s.id === selectedSubjectId);
        const activePackage = activePackages.find((pkg) => pkg.subject_id === selectedSubjectId && pkg.available_lessons > 0);
        const usesPackage = shouldUsePackageForBooking(activePackage, studentPaymentModel, studentPaymentOverrideActive);
        const durationMs = (selectedSubject?.duration_minutes || 60) * 60000;
        const endDT = new Date(selectedTime.getTime() + durationMs);

        // Validate overlap with existing events (other + own sessions) and breaks
        const isOverlapping = events.some(e =>
            e.occupied &&
            (
                (selectedTime >= e.start && selectedTime < e.end) ||
                (endDT > e.start && endDT <= e.end) ||
                (selectedTime <= e.start && endDT >= e.end)
            )
        );

        // Validate if it fits within working hours (bgEvents)
        const fitsInBg = bgEvents.some(bg => selectedTime >= bg.start && endDT <= bg.end);

        if (isOverlapping || !fitsInBg) {
            alert(t('stuSched.subjectTooLong'));
            setSaving(false);
            return;
        }

        // For group lessons: check available spots
        if (selectedSubject?.is_group) {
            const startISO = selectedTime.toISOString();
            const { data: existingGroupSessions } = await supabase
                .from('sessions')
                .select('available_spots')
                .eq('tutor_id', tutorId)
                .eq('start_time', startISO)
                .eq('subject_id', selectedSubjectId)
                .gt('available_spots', 0)
                .limit(1);

            const hasSpots = existingGroupSessions && existingGroupSessions.length > 0 && (existingGroupSessions[0].available_spots ?? 0) > 0;
            const isFirstStudent = !existingGroupSessions || existingGroupSessions.length === 0;

            if (!isFirstStudent && !hasSpots) {
                alert(t('stuSched.groupFull'));
                setSaving(false);
                return;
            }
        }

        const { data: mustBlockBooking } = await supabase.rpc('student_booking_blocked_overdue', { p_student_id: studentId });
        if (mustBlockBooking) {
            alert(t('stuSched.mustPayFirst'));
            setSaving(false);
            return;
        }

        const { data: sessionData, error } = await supabase.from('sessions').insert([{
            tutor_id: tutorId,
            student_id: studentId,
            subject_id: selectedSubjectId || null,
            start_time: selectedTime.toISOString(),
            end_time: endDT.toISOString(),
            status: 'active',
            paid: usesPackage,
            payment_status: usesPackage ? 'paid' : 'pending',
            topic: selectedSubject?.name || null,
            price: selectedSubject?.price || null,
            meeting_link: selectedSubject?.meeting_link || null,
            lesson_package_id: usesPackage && activePackage ? activePackage.id : null,
            available_spots: selectedSubject?.is_group ? (selectedSubject.max_students ?? 5) - 1 : null,
        }]).select().single();

        if (!error && sessionData) {
            // For group lessons: decrement available_spots on all other sessions at this time
            if (selectedSubject?.is_group) {
                const { data: otherSessions } = await supabase
                    .from('sessions')
                    .select('id, available_spots')
                    .eq('tutor_id', tutorId)
                    .eq('start_time', selectedTime.toISOString())
                    .eq('subject_id', selectedSubjectId)
                    .neq('id', sessionData.id)
                    .gt('available_spots', 0);

                if (otherSessions && otherSessions.length > 0) {
                    for (const session of otherSessions) {
                        const newSpots = Math.max(0, (session.available_spots ?? 1) - 1);
                        await supabase.from('sessions').update({ available_spots: newSpots }).eq('id', session.id);
                    }
                }
            }

            const { data: tutorProfile } = await supabase.from('profiles').select('email, full_name, organization_id').eq('id', tutorId).single();

            if (usesPackage && activePackage) {
                try {
                    const reserveRes = await fetch('/api/reserve-package-lesson', {
                        method: 'POST',
                        headers: await authHeaders(),
                        body: JSON.stringify({ packageId: activePackage.id }),
                    });
                    const reserveJson = await reserveRes.json().catch(() => ({}));
                    if (!reserveRes.ok) {
                        console.error('Package reserve failed after booking:', reserveJson);
                        await supabase.from('sessions').delete().eq('id', sessionData.id);
                        alert(t('stuSched.packageUpdateFailed'));
                        setSaving(false);
                        return;
                    }
                } catch (packageUpdateError) {
                    console.error('Package reserve request failed after booking:', packageUpdateError);
                    await supabase.from('sessions').delete().eq('id', sessionData.id);
                    alert(t('stuSched.packageUpdateFailed'));
                    setSaving(false);
                    return;
                }
            }

            // Calculate payment deadline and show modal immediately (no waiting for sync/email)
            const deadline = paymentTiming === 'before_lesson'
                ? new Date(selectedTime.getTime() - paymentDeadlineHours * 3600000)
                : new Date(endDT.getTime() + paymentDeadlineHours * 3600000);

            setPendingPaymentSession({
                id: sessionData.id,
                start: selectedTime,
                end: endDT,
                price: selectedSubject?.price ?? null,
                deadline,
                tutorName: tutorProfile?.full_name ?? 'Korepetitorius',
            });
            setShowPaymentModal(!usesPackage);
            setIsDialogOpen(false);
            setSaving(false);

            if (usesPackage) {
                setSuccessMsg(t('stuSched.packageReserved'));
            }

            // Run in background: tutor email, Google sync, parent checkout+email, then refresh data
            (async () => {
                if (tutorProfile?.email) {
                    const hidePaymentStatus = Boolean(tutorProfile.organization_id);
                    sendEmail({
                        type: 'booking_notification',
                        to: tutorProfile.email,
                        data: {
                            studentName: studentName || 'Mokinys',
                            tutorName: tutorProfile.full_name || '',
                            date: format(selectedTime, 'yyyy-MM-dd'),
                            time: format(selectedTime, 'HH:mm'),
                            paymentStatus: usesPackage ? 'paid' : 'pending',
                            hidePaymentStatus,
                            sessionId: sessionData.id,
                        },
                    });
                }

                if (studentEmail) {
                    const hasPayer = studentPaymentPayer === 'parent' && !!studentPayerEmail?.trim();
                    let selfPayLink: string | null = null;
                    let creditFullyCovered = false;
                    if (!hasPayer && !usesPackage && selectedSubject?.price) {
                        try {
                            const chkRes = await fetch('/api/stripe-checkout', {
                                method: 'POST',
                                headers: await authHeaders(),
                                body: JSON.stringify({ sessionId: sessionData.id }),
                            });
                            const chkJson = await chkRes.json();
                            if (chkJson.creditFullyCovered) {
                                creditFullyCovered = true;
                            } else if (chkJson.url) {
                                selfPayLink = chkJson.url;
                            }
                        } catch { /* Stripe link optional */ }
                    }
                    sendEmail({
                        type: 'booking_confirmation',
                        to: studentEmail,
                        data: {
                            studentName: studentName || 'Mokinys',
                            tutorName: tutorProfile?.full_name || 'Korepetitorius',
                            date: format(selectedTime, 'yyyy-MM-dd'),
                            time: format(selectedTime, 'HH:mm'),
                            subject: selectedSubject?.name || '',
                            price: hasPayer ? null : (selectedSubject?.price ?? null),
                            duration: selectedSubject?.duration_minutes || 60,
                            cancellationHours: hasPayer ? null : cancellationHours,
                            cancellationFeePercent: hasPayer ? null : cancellationFeePercent,
                            paymentStatus: hasPayer ? null : (usesPackage || creditFullyCovered ? 'paid' : 'pending'),
                            meetingLink: selectedSubject?.meeting_link || null,
                            hidePaymentInfo: hasPayer,
                            paymentLink: selfPayLink,
                        },
                    });
                }

                try {
                    const syncRes = await fetch(`${window.location.origin}/api/google-calendar-sync`, {
                        method: 'POST',
                        headers: await authHeaders(),
                        body: JSON.stringify({ userId: tutorId }),
                    });
                    const syncData = await syncRes.json().catch(() => ({}));
                    if (!syncRes.ok || (syncData as any).error) {
                        console.error('Google Calendar sync failed:', (syncData as any).error || syncRes.status);
                    }
                } catch (e) {
                    console.error('Failed to sync booked session to Google Calendar:', e);
                }

                // Parent pays: send booking confirmation + Stripe checkout email to parent
                const payerEmail = studentPayerEmail?.trim() || '';
                if (studentPaymentPayer === 'parent' && payerEmail) {
                    sendEmail({
                        type: 'booking_confirmation',
                        to: payerEmail,
                        data: {
                            forPayer: true,
                            bookedBy: 'student',
                            studentName: studentName || 'Mokinys',
                            tutorName: tutorProfile?.full_name || 'Korepetitorius',
                            date: format(selectedTime, 'yyyy-MM-dd'),
                            time: format(selectedTime, 'HH:mm'),
                            subject: selectedSubject?.name || '',
                            price: selectedSubject?.price ?? null,
                            duration: selectedSubject?.duration_minutes || 60,
                            cancellationHours,
                            cancellationFeePercent,
                            paymentStatus: usesPackage ? 'paid' : 'pending',
                            meetingLink: selectedSubject?.meeting_link || null,
                        },
                    }).catch((err) => console.error('Error sending payer booking confirmation:', err));

                    if (!usesPackage) {
                        try {
                            const res = await fetch('/api/stripe-checkout', {
                                method: 'POST',
                                headers: await authHeaders(),
                                body: JSON.stringify({ sessionId: sessionData.id, payerEmail }),
                            });
                            const json = await res.json();
                            if (json.url) {
                                sendEmail({
                                    type: 'stripe_payment_forwarding',
                                    to: payerEmail,
                                    data: {
                                        studentName: studentName || 'Mokinys',
                                        tutorName: tutorProfile?.full_name || 'Korepetitorius',
                                        date: format(selectedTime, 'yyyy-MM-dd'),
                                        time: format(selectedTime, 'HH:mm'),
                                        amount: selectedSubject?.price ?? null,
                                        paymentLink: json.url,
                                    },
                                }).catch((err) => console.error('Error sending parent payment email (fallback):', err));
                            }
                        } catch (e) {
                            console.error('Parent checkout/email failed:', e);
                        }
                    }
                }

                fetchData();
            })();
        } else {
            console.error('Booking error:', error);
            const msg = error?.message || '';
            if (msg.includes('Reikia apmokėti') || msg.includes('pradelst')) {
                alert(t('stuSched.mustPayFirst'));
                void refetchBookingBlock();
            } else {
                alert(t('stuSched.reservationFailed', { msg: msg || t('stuSess.unknownError') }));
            }
            setIsDialogOpen(false);
            setSaving(false);
        }
    };

    const handleGoToStripe = async (sessionId: string) => {
        setFetchingStripe(true);
        setRedirectingToStripe(true);
        try {
            const res = await fetch('/api/stripe-checkout', {
                method: 'POST',
                headers: await authHeaders(),
                body: JSON.stringify({ sessionId }),
            });
            const json = await res.json().catch(() => ({ error: t('stuSched.stripeError') }));
            if (json.creditFullyCovered) {
                setSuccessMsg(t('stuSched.paidWithCredit'));
                void fetchData();
                setFetchingStripe(false);
                setRedirectingToStripe(false);
                return;
            }
            if (json.url) {
                window.location.href = json.url;
                return;
            }
            alert(json.error || t('stuSched.paymentCreateFailed'));
        } catch {
            alert(t('stuSched.stripeError'));
        }
        setFetchingStripe(false);
        setRedirectingToStripe(false);
    };

    const handleWaitlist = async () => {
        if (!selectedEvent || !selectedWaitlistSubjectId) return;
        // Validate: latest admission time (minBookingHours before session start) must not have passed
        if (selectedEvent.start) {
            const latestAdmission = new Date(selectedEvent.start.getTime() - minBookingHours * 3600000);
            if (latestAdmission < new Date() || selectedEvent.start < new Date()) {
                setIsDialogOpen(false);
                return;
            }
        }
        const selectedWaitlistSubject = subjects.find(s => s.id === selectedWaitlistSubjectId);
        const notes = JSON.stringify({
            start_time: selectedEvent.start?.toISOString(),
            end_time: selectedEvent.end?.toISOString(),
            topic: selectedWaitlistSubject?.name || null,
            price: selectedWaitlistSubject?.price || null,
            subject_id: selectedWaitlistSubjectId,
            queue_position: waitlistCount + 1,
        });
        const { data: blockWaitlist } = await supabase.rpc('student_booking_blocked_overdue', { p_student_id: studentId });
        if (blockWaitlist) {
            alert(t('stuSched.mustPayQueue'));
            setIsDialogOpen(false);
            return;
        }
        setSaving(true);
        const { error } = await supabase.from('waitlists').insert([{
            tutor_id: tutorId, student_id: studentId,
            session_id: selectedEvent.sessionId || null,
            preferred_day: selectedEvent.start ? format(selectedEvent.start, 'EEEE', { locale: dateFnsLocale }) : '',
            preferred_time: selectedEvent.start ? format(selectedEvent.start, 'HH:mm') : '',
            notes,
        }]);
        if (!error) {
            setSuccessMsg(t('stuSched.queueSuccess'));
            fetchData();
        } else {
            console.error('Queue join error:', error);
            const em = error.message || '';
            if (em.includes('Reikia apmokėti') || em.includes('pradelst')) {
                alert(t('stuSched.mustPayQueue'));
                void refetchBookingBlock();
            } else {
                alert(t('stuSched.queueFailed', { msg: em }));
            }
        }
        setIsDialogOpen(false); setSaving(false);
        setTimeout(() => setSuccessMsg(''), 4000);
    };

    const eventStyleGetter = (event: SlotEvent) => {
        if (event.isBackground) {
            return { style: { backgroundColor: '#d1fae5', opacity: 0.5, border: 'none', color: '#065f46', fontSize: '12px' } };
        }

        let backgroundColor = '#9ca3af'; // Occupied (Gray)
        let opacity = 0.8;
        if (event.isMySession) backgroundColor = '#8b5cf6'; // Mano (Violet)
        if (event.isPast) opacity = 0.4;

        return { style: { backgroundColor, opacity, border: 'none', borderRadius: '6px', color: 'white', fontWeight: 600, fontSize: '13px' } };
    };

    const getLabel = () => {
        if (currentView === 'month') return format(currentDate, 'MMMM yyyy', { locale: dateFnsLocale });
        if (currentView === 'week') {
            // BigCalendar week view start/end depends on week start.
            // Fix header to match actually displayed days in the grid.
            const weekStart = startOfWeek(currentDate, { weekStartsOn: 0 }); // Sunday
            const weekEnd = addDays(weekStart, 6);
            return `${format(weekStart, "MMMM d", { locale: dateFnsLocale })} d. - ${format(weekEnd, "d", { locale: dateFnsLocale })} d.`;
        }
        return format(currentDate, 'EEEE, MMMM d', { locale: dateFnsLocale });
    };

    const handleNavigateButton = (direction: 'back' | 'next' | 'today') => {
        if (direction === 'today') {
            const today = new Date();
            handleNavigate(today);
            return;
        }
        const newDate = new Date(currentDate);
        if (currentView === 'month') newDate.setMonth(newDate.getMonth() + (direction === 'next' ? 1 : -1));
        else if (currentView === 'week') newDate.setDate(newDate.getDate() + (direction === 'next' ? 7 : -7));
        else newDate.setDate(newDate.getDate() + (direction === 'next' ? 1 : -1));
        handleNavigate(newDate);
    };


    return (
        <>
            <StudentLayout>
                <div className="px-4 pt-6 pb-6 h-[calc(100vh-96px)] flex flex-col">
                    <div className="mb-4">
                        <h1 className="text-2xl font-black text-gray-900 mb-1">Rezervacijos kalendorius</h1>
                        <p className="text-gray-400 text-sm">{t('stuSched.selectFreeTime')}</p>
                    </div>

                    {creditBalance > 0 && (
                        <div className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 flex items-start gap-3">
                            <Wallet className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                            <p className="text-sm text-emerald-900 font-medium">
                                {t('stuSched.creditBalanceBanner', { balance: creditBalance.toFixed(2) })}
                            </p>
                        </div>
                    )}

                    {loadError && loadError === t('stuSched.noTutorAssigned') ? (
                        <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-6 text-center">
                            <p className="text-base font-semibold text-amber-800 mb-1">{t('stuSched.noTutorAssigned')}</p>
                            <p className="text-sm text-amber-700">{t('stuSched.noTutorAssignedDesc')}</p>
                        </div>
                    ) : loadError ? (
                        <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                            {loadError}
                        </div>
                    ) : null}

                    {bookingBlocked && !blockLoading && (
                        <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <div className="flex items-start gap-3">
                                <Wallet className="w-5 h-5 text-amber-700 flex-shrink-0 mt-0.5" />
                                <div>
                                    <p className="text-sm font-bold text-amber-900">{t('stuSched.mustPayTitle')}</p>
                                    <p className="text-xs text-amber-800 mt-0.5">
                                        {t('stuSched.mustPayDesc')}
                                    </p>
                                </div>
                            </div>
                            <Button
                                type="button"
                                className="rounded-xl bg-amber-600 hover:bg-amber-700 text-white shrink-0"
                                onClick={() => navigate('/student/sessions')}
                            >
                                {t('stuSched.payBtn')}
                            </Button>
                        </div>
                    )}

                    {successMsg && (
                        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/30 backdrop-blur-sm" onClick={() => setSuccessMsg('')}>
                            <div className="bg-white rounded-3xl shadow-2xl p-8 max-w-sm mx-4 text-center animate-in zoom-in-95" onClick={(e) => e.stopPropagation()}>
                                <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4 animate-bounce">
                                    <Check className="w-8 h-8 text-green-600" />
                                </div>
                                <h3 className="text-lg font-black text-gray-900 mb-1">Pavyko!</h3>
                                <p className="text-sm text-gray-600 mb-4">{successMsg}</p>
                                <button onClick={() => setSuccessMsg('')} className="w-full py-3 rounded-2xl bg-green-600 text-white font-bold hover:bg-green-700 transition-colors">
                                    Supratau
                                </button>
                            </div>
                        </div>
                    )}

                    <div className="bg-white rounded-3xl shadow-sm border border-gray-100 flex flex-col flex-1 min-h-0 overflow-hidden">
                        {/* Header Controls */}
                        <div className="flex items-center justify-between px-4 py-4 border-b border-gray-100 flex-wrap gap-2">
                            <div className="flex items-center bg-gray-50 rounded-xl p-1 shrink-0">
                                <button onClick={() => handleNavigateButton('back')} className="p-2 hover:bg-white hover:shadow-sm rounded-lg transition-all text-gray-500"><ChevronLeft className="w-4 h-4" /></button>
                                <button onClick={() => handleNavigateButton('today')} className="px-3 py-1.5 text-sm font-bold text-gray-600 hover:text-violet-600 transition-colors">{t('stuSched.today')}</button>
                                <button onClick={() => handleNavigateButton('next')} className="p-2 hover:bg-white hover:shadow-sm rounded-lg transition-all text-gray-500"><ChevronRight className="w-4 h-4" /></button>
                            </div>

                            <div className="flex items-center gap-2 order-first w-full justify-center sm:w-auto sm:order-none">
                                <h2 className="text-base font-bold text-gray-800 capitalize">{getLabel()}</h2>
                                {loadingMore && (
                                    <Loader2 className="w-4 h-4 text-violet-600 animate-spin" />
                                )}
                            </div>

                            <div className="flex items-center bg-gray-50 rounded-xl p-1 shrink-0">
                                <button onClick={() => setCurrentView(Views.MONTH)} className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold transition-all', currentView === Views.MONTH ? 'bg-white text-violet-700 shadow-sm' : 'text-gray-500 hover:text-gray-700')}><LayoutGrid className="w-3.5 h-3.5" /><span className="hidden sm:inline">{t('stuSched.month')}</span></button>
                                <button onClick={() => setCurrentView(Views.WEEK)} className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold transition-all', currentView === Views.WEEK ? 'bg-white text-violet-700 shadow-sm' : 'text-gray-500 hover:text-gray-700')}><CalendarDays className="w-3.5 h-3.5" /><span className="hidden sm:inline">{t('stuSched.week')}</span></button>
                                <button onClick={() => setCurrentView(Views.DAY)} className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold transition-all', currentView === Views.DAY ? 'bg-white text-violet-700 shadow-sm' : 'text-gray-500 hover:text-gray-700')}><List className="w-3.5 h-3.5" /><span className="hidden sm:inline">Diena</span></button>
                            </div>
                        </div>

                        {/* Calendar Body */}
                        <div className="flex-1 p-2 sm:p-3 min-h-0">
                            {loading && events.length === 0 && !loadError ? (
                                <div className="h-full w-full flex items-center justify-center">
                                    <div className="w-8 h-8 border-2 border-violet-200 border-t-violet-600 rounded-full animate-spin" />
                                </div>
                            ) : (
                                <BigCalendar
                                    localizer={localizer}
                                    events={events}
                                    backgroundEvents={bgEvents}
                                    view={currentView}
                                    views={[Views.MONTH, Views.WEEK, Views.DAY]}
                                    date={currentDate}
                                    onNavigate={(date) => handleNavigate(date)}
                                    onView={(view) => { setCurrentView(view); handleNavigate(currentDate, view); }}
                                    min={new Date(0, 0, 0, 7, 0, 0)}
                                    max={new Date(0, 0, 0, 22, 0, 0)}
                                    culture="lt"
                                    style={{ height: '100%' }}
                                    eventPropGetter={eventStyleGetter}
                                    onSelectEvent={handleSelectEvent}
                                    selectable={true}
                                    onSelectSlot={handleSelectSlot}
                                    components={{ toolbar: () => null }}
                                    messages={{
                                        showMore: (count) => `+${count} daugiau`
                                    }}
                                    popup
                                    step={15}
                                    timeslots={4}
                                />
                            )}
                        </div>
                    </div>
                </div>

                {/* Booking / Waitlist Dialog */}
                <Dialog open={isDialogOpen} onOpenChange={(open) => { if (!open) setSelectedWaitlistSubjectId(''); setIsDialogOpen(open); }}>
                    <DialogContent className="w-[95vw] sm:max-w-md p-0 border-0 rounded-3xl max-h-[90vh] overflow-y-auto">
                        <div className={cn("p-6 text-white relative", selectedEvent?.occupied ? "bg-gradient-to-br from-amber-500 to-orange-500" : "bg-gradient-to-br from-violet-600 to-indigo-600")}>
                            <div className="absolute top-0 right-0 p-8 opacity-10">
                                <CalendarIcon className="w-24 h-24" />
                            </div>
                            <DialogTitle className="text-2xl font-black mb-1 relative z-10">
                                {selectedEvent?.occupied ? t('stuSched.waitlist') : t('stuSched.bookLesson')}
                            </DialogTitle>
                            <p className="text-white/80 text-sm font-medium relative z-10">
                                {selectedEvent?.start && format(selectedEvent.start, 'EEEE, MMMM d', { locale: dateFnsLocale })}
                                {selectedEvent?.occupied && `, ${format(selectedEvent.start, 'HH:mm')}`}
                            </p>
                        </div>

                        <div className="p-6 bg-white">
                            {!selectedEvent?.occupied && subjects.length > 0 && (
                                <div className="mb-5">
                                    <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">{t('stuSched.selectSubject')}</p>
                                    <div className="grid grid-cols-1 gap-2">
                                        {subjects.map((s: any) => (
                                            <button
                                                key={s.id}
                                                type="button"
                                                onClick={() => setSelectedSubjectId(s.id)}
                                                className={`w-full flex items-center justify-between p-3.5 rounded-2xl border-2 transition-all text-left ${selectedSubjectId === s.id
                                                    ? 'border-violet-600 bg-violet-50/50'
                                                    : 'border-gray-100 bg-white hover:border-violet-200'
                                                    }`}
                                            >
                                                <div className="flex items-center gap-3">
                                                    <div className="w-3 h-3 rounded-full shadow-sm" style={{ backgroundColor: s.color }} />
                                                    <div>
                                                        <span className="block text-sm font-bold text-gray-800 flex items-center gap-2">
                                                            {s.name}
                                                            {s.is_trial === true && (
                                                                <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-800 text-[10px] uppercase tracking-wider border border-amber-200">
                                                                    Bandomoji
                                                                </span>
                                                            )}
                                                            {s.has_individual_pricing && (
                                                                <span className="px-2 py-0.5 rounded bg-violet-100 text-violet-700 text-[10px] uppercase tracking-wider">
                                                                    Individuali kaina
                                                                </span>
                                                            )}
                                                        </span>
                                                        <span className="block text-xs font-semibold text-gray-400 mt-0.5">{s.duration_minutes} min.</span>
                                                    </div>
                                                </div>
                                                <span className={cn('text-sm font-black text-right', selectedSubjectId === s.id ? 'text-violet-700' : 'text-gray-900')}>
                                                    {(() => {
                                                        const price = Number(s.price) || 0;
                                                        const { creditApplied, remaining } = lessonCreditBreakdown(price);
                                                        if (creditBalance > 0 && creditApplied > 0 && price > 0) {
                                                            return (
                                                                <span className="flex flex-col items-end leading-tight">
                                                                    <span className="text-[11px] font-semibold text-gray-400 line-through">{price.toFixed(2)} €</span>
                                                                    <span>{t('stuSched.subjectPriceWithCredit', { amount: remaining.toFixed(2) })}</span>
                                                                </span>
                                                            );
                                                        }
                                                        return <span>{s.price} €</span>;
                                                    })()}
                                                </span>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {!selectedEvent?.occupied && selectedSubjectId && (
                                <div className="mb-5 animate-in fade-in slide-in-from-bottom-2">
                                    <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">{t('stuSched.selectTime')}</p>
                                    {availableSlots.length === 0 ? (
                                        <div className="text-sm text-gray-500 bg-gray-50 p-4 rounded-xl text-center border border-gray-100">
                                            {t('stuSched.noSlotsForDuration')}
                                        </div>
                                    ) : (
                                        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                                            {(() => {
                                                const selectedSubject = subjects.find(s => s.id === selectedSubjectId);
                                                const isGroup = Boolean(selectedSubject?.is_group) || (selectedSubject?.max_students != null && selectedSubject.max_students > 1);
                                                const maxStudents = selectedSubject?.max_students ?? 5;
                                                return availableSlots.map((slot, idx) => (
                                                    <button
                                                        key={idx}
                                                        type="button"
                                                        onClick={() => setSelectedTime(slot)}
                                                        className={cn(
                                                            "py-2 rounded-xl border text-sm font-bold transition-all flex flex-col items-center gap-0.5",
                                                            isGroup && "border-violet-300 bg-violet-50/50",
                                                            selectedTime === slot
                                                                ? "bg-violet-600 border-violet-600 text-white shadow-md"
                                                                : "bg-white border-gray-200 text-gray-700 hover:border-violet-300 hover:bg-violet-50"
                                                        )}
                                                    >
                                                        <span>{format(slot, 'HH:mm')}</span>
                                                        {isGroup && selectedTime !== slot && (
                                                            <>
                                                                <span className="text-[10px] text-violet-600 font-medium flex items-center gap-0.5">
                                                                    <Users className="w-2.5 h-2.5" />
                                                                    {t('stuSess.group')}
                                                                </span>
                                                                <span className="text-[10px] text-gray-500">{(() => {
                                                                    // Check occupied slots (other students) and own sessions (current student)
                                                                    const matchOther = occupiedSlots.find(o =>
                                                                        o.subject_id === selectedSubjectId &&
                                                                        Math.abs(new Date(o.start_time).getTime() - slot.getTime()) < 60000
                                                                    );
                                                                    const matchOwn = existingSessions.find(s =>
                                                                        s.subject_id === selectedSubjectId &&
                                                                        s.available_spots != null &&
                                                                        Math.abs(new Date(s.start_time).getTime() - slot.getTime()) < 60000
                                                                    );
                                                                    const match = matchOther ?? matchOwn;
                                                                    const free = match?.available_spots != null ? match.available_spots : maxStudents;
                                                                    return `${free}/${maxStudents} laisv.`;
                                                                })()}</span>
                                                            </>
                                                        )}
                                                    </button>
                                                ));
                                            })()}
                                        </div>
                                    )}
                                </div>
                            )}

                            {selectedEvent?.occupied && subjects.length > 0 && (
                                <div className="mb-5">
                                    <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">{t('stuSched.selectSubject')}</p>
                                    <div className="grid grid-cols-1 gap-2">
                                        {subjects.map((s) => {
                                            const sessionDurMin = Math.round(
                                                (selectedEvent.end.getTime() - selectedEvent.start.getTime() - breakBetweenLessons * 60000) / 60000
                                            );
                                            return (
                                                <button
                                                    key={s.id}
                                                    type="button"
                                                    onClick={() => setSelectedWaitlistSubjectId(s.id)}
                                                    className={`w-full flex items-center justify-between p-3.5 rounded-2xl border-2 transition-all text-left ${selectedWaitlistSubjectId === s.id
                                                        ? 'border-amber-500 bg-amber-50/50'
                                                        : 'border-gray-100 bg-white hover:border-amber-200'
                                                        }`}
                                                >
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-3 h-3 rounded-full shadow-sm" style={{ backgroundColor: s.color }} />
                                                        <div>
                                                            <span className="block text-sm font-bold text-gray-800 flex items-center gap-2">
                                                                {s.name}
                                                                {s.has_individual_pricing && (
                                                                    <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-700 text-[10px] uppercase tracking-wider">
                                                                        Individuali kaina
                                                                    </span>
                                                                )}
                                                            </span>
                                                            <span className="block text-xs font-semibold text-gray-400 mt-0.5">
                                                                {s.duration_minutes} min.
                                                                {s.duration_minutes !== sessionDurMin && (
                                                                    <span className="text-amber-500 ml-1">(laiko tarpas {sessionDurMin} min.)</span>
                                                                )}
                                                            </span>
                                                        </div>
                                                    </div>
                                                    <span className={cn('text-sm font-black', selectedWaitlistSubjectId === s.id ? 'text-amber-600' : 'text-gray-900')}>{s.price} €</span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            {selectedEvent?.occupied ? (
                                <>
                                    {(() => {
                                        const deadline = selectedEvent.start ? addHours(selectedEvent.start, -minBookingHours) : new Date();
                                        const isPastDeadline = isBefore(deadline, new Date()) || isBefore(selectedEvent.start, new Date());
                                        if (!isPastDeadline) return null;
                                        return (
                                            <div className="bg-red-50 rounded-2xl p-4 mb-4 border border-red-100 text-sm text-red-700">
                                                <p className="font-bold mb-1">{t('stuSched.queueClosed')}</p>
                                                <p className="text-xs">{t('stuSched.queueClosedDesc', { deadline: format(deadline, 'yyyy-MM-dd HH:mm') })}</p>
                                            </div>
                                        );
                                    })()}
                                </>
                            ) : (
                                <div className="bg-gray-50 rounded-2xl p-4 mb-4 border border-gray-100 text-sm text-gray-600 font-medium">
                                    {!selectedSubjectId
                                        ? t('stuSched.selectSubjectFirst')
                                        : !selectedTime
                                            ? t('stuSched.selectTimeFirst')
                                            : t('stuSched.confirmSelection')}
                                </div>
                            )}

                            {!selectedEvent?.occupied && creditBalance > 0 && selectedSubjectId && (() => {
                                const selectedSubject = subjects.find(s => s.id === selectedSubjectId);
                                const subjectPrice = selectedSubject?.price || 0;
                                const creditToApply = Math.min(creditBalance, subjectPrice);
                                const remaining = Math.max(0, subjectPrice - creditToApply);
                                if (!subjectPrice) return null;
                                return (
                                    <div className="bg-green-50 border border-green-200 rounded-2xl p-4 mb-4 flex items-start gap-3">
                                        <Wallet className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                                        <div className="text-sm text-green-700">
                                            <p className="font-semibold text-green-800 mb-0.5">{t('stuSched.creditAvailable')}</p>
                                            <p>{t('stuSched.creditWillApply', { credit: creditToApply.toFixed(2), remaining: remaining.toFixed(2) })}</p>
                                        </div>
                                    </div>
                                );
                            })()}

                            {!selectedEvent?.occupied && (
                                <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-6 flex items-start gap-3">
                                    <ShieldAlert className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                                    <div className="text-sm text-amber-700">
                                        <p className="font-semibold text-amber-800 mb-0.5">{t('stuSched.cancelRules')}</p>
                                        <p><span dangerouslySetInnerHTML={{ __html: t('stuSched.cancelFreeNote', { hours: String(cancellationHours) }) }} />
                                            {cancellationFeePercent > 0 ? (
                                                <span dangerouslySetInnerHTML={{ __html: t('stuSched.cancelFeeNote', { percent: String(cancellationFeePercent) }) }} />
                                            ) : (
                                                <span>{` ${t('stuSched.noPenalty')}`}</span>
                                            )}</p>
                                    </div>
                                </div>
                            )}

                            {selectedEvent?.occupied && (() => {
                                const deadline = selectedEvent.start ? addHours(selectedEvent.start, -minBookingHours) : new Date();
                                const isPastDeadline = isBefore(deadline, new Date()) || isBefore(selectedEvent.start, new Date());
                                if (isPastDeadline) return null;
                                return (
                                    <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-4 flex items-start gap-3">
                                        <Info className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                                        <div className="text-sm text-amber-700">
                                            <p className="font-semibold text-amber-800 mb-1">{t('stuSched.whatIsWaitlist')}</p>
                                            <p>{t('stuSched.waitlistDesc')}</p>
                                            <div className="mt-2 pt-2 border-t border-amber-200 space-y-0.5 text-xs text-amber-600">
                                                <div className="flex justify-between">
                                                    <span>{t('stuSched.yourQueuePos')}</span>
                                                    <span className="font-bold text-amber-800">{waitlistCount + 1}</span>
                                                </div>
                                                <div className="flex justify-between">
                                                    <span>Paskutinis laikas stoti:</span>
                                                    <span className="font-bold text-amber-800">{format(deadline, 'yyyy-MM-dd HH:mm')}</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })()}

                            {bookingBlocked && !blockLoading && (
                                <div className="mb-3 rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-xs text-red-800">
                                    {t('stuSched.mustPayOverdue')}
                                </div>
                            )}

                            <div className="flex gap-3">
                                <button type="button" onClick={() => setIsDialogOpen(false)} className="flex-1 py-3.5 rounded-2xl border-2 border-gray-200 text-sm font-bold text-gray-600 hover:bg-gray-50 transition-colors">
                                    {t('stuSched.cancelBtn')}
                                </button>
                                {(() => {
                                    const deadline = selectedEvent?.start ? addHours(selectedEvent.start, -minBookingHours) : new Date();
                                    const now = new Date();
                                    const isPastStartTime = selectedEvent?.start && isBefore(selectedEvent.start, now);
                                    const isPastDeadline = selectedEvent?.occupied && (isBefore(deadline, now) || isPastStartTime);

                                    if (isPastDeadline) return null; // Hide button if waitlist deadline passed

                                    return (
                                        <button
                                            type="button"
                                            onClick={() => selectedEvent?.occupied ? handleWaitlist() : handleBook()}
                                            disabled={
                                                saving ||
                                                bookingBlocked ||
                                                (!selectedEvent?.occupied && (!selectedSubjectId || !selectedTime)) ||
                                                (selectedEvent?.occupied && !selectedWaitlistSubjectId)
                                            }
                                            className={cn("flex-1 py-3.5 rounded-2xl text-white text-sm font-bold transition-all disabled:opacity-50",
                                                selectedEvent?.occupied ? "bg-amber-500 hover:bg-amber-600" : "bg-violet-600 hover:bg-violet-700")}
                                        >
                                            {saving ? t('stuSched.saving') : selectedEvent?.occupied ? t('stuSched.joinQueue') : t('stuSched.confirm')}
                                        </button>
                                    );
                                })()}
                            </div>
                        </div>
                    </DialogContent>
                </Dialog>

                {/* My Session Details Modal */}
                <Dialog open={isMySessionModalOpen} onOpenChange={setIsMySessionModalOpen}>
                    <DialogContent className="w-[95vw] sm:max-w-[440px] max-h-[90vh] overflow-y-auto">
                        <DialogHeader>
                            <DialogTitle className="flex items-center gap-2">
                                <CalendarDays className="w-5 h-5 text-violet-600" />
                                Pamokos informacija
                            </DialogTitle>
                        </DialogHeader>
                        <div className="space-y-4 py-3">
                            <div>
                                <div className="flex items-center gap-2 mb-2">
                                    <p className="text-xl font-black text-gray-900 leading-tight">{mySessionData?.topic || 'Pamoka'}</p>
                                    {mySessionData?.subjects?.is_group && (
                                        <span className="bg-violet-100 text-violet-700 px-2.5 py-1 rounded-full text-xs font-bold flex items-center gap-1">
                                            <Users className="w-3.5 h-3.5" />
                                            {t('stuSess.groupLesson')}
                                        </span>
                                    )}
                                </div>
                                <div className="flex items-center gap-2 mt-2 text-gray-600 font-medium">
                                    <Clock className="w-4 h-4" />
                                    <span>
                                        {mySessionData?.start_time && format(new Date(mySessionData.start_time), 'EEEE, MMMM d', { locale: dateFnsLocale })}
                                        {' · '}
                                        {mySessionData?.start_time && format(new Date(mySessionData.start_time), 'HH:mm')}
                                        {' – '}
                                        {mySessionData?.end_time && format(new Date(mySessionData.end_time), 'HH:mm')}
                                    </span>
                                </div>
                            </div>

                            {studentPaymentPayer !== 'parent' && (
                                <div className="grid grid-cols-2 gap-3 text-sm">
                                    <div className="bg-gray-50 rounded-xl p-3 text-center border border-gray-100">
                                        <p className="text-xs text-gray-400 mb-1 font-semibold uppercase tracking-wider">Kaina</p>
                                        <p className="font-bold text-gray-900">€{mySessionData?.price ?? '–'}</p>
                                        {mySessionData?.status === 'active' && !mySessionData.paid && mySessionData.price != null && (() => {
                                            const { creditApplied, remaining } = lessonCreditBreakdown(mySessionData.price);
                                            return (
                                                <div className="text-[11px] text-gray-500 mt-1 leading-snug space-y-0.5">
                                                    {creditApplied > 0 && (
                                                        <p className="text-emerald-700 font-medium">
                                                            {t('stuSched.creditRowApplied')}: €{creditApplied.toFixed(2)}
                                                        </p>
                                                    )}
                                                    <p>
                                                        {remaining > 0
                                                            ? t('stuSched.cardTotal', { amount: formatCustomerChargeEur(remaining) })
                                                            : t('stuSched.creditCoversFullLesson')}
                                                    </p>
                                                </div>
                                            );
                                        })()}
                                    </div>
                                    <div className="bg-gray-50 rounded-xl p-3 text-center border border-gray-100 flex flex-col items-center justify-center">
                                        <p className="text-xs text-gray-400 mb-2 font-semibold uppercase tracking-wider">Statusas</p>
                                        <StatusBadge status={mySessionData?.status || ''} paymentStatus={mySessionData?.payment_status} paid={mySessionData?.paid} endTime={mySessionData?.end_time} />
                                    </div>
                                </div>
                            )}

                            {/* Tutor comment (visible only if marked "show to student") */}
                            {mySessionData?.show_comment_to_student && mySessionData?.tutor_comment && (
                                <div className="p-3 rounded-xl bg-indigo-50 border border-indigo-100">
                                    <p className="text-xs font-semibold text-indigo-600 uppercase tracking-wider mb-1">Korepetitoriaus komentaras</p>
                                    <div className="text-sm text-indigo-900 whitespace-pre-wrap">{mySessionData.tutor_comment}</div>
                                </div>
                            )}

                            {mySessionData?.meeting_link && mySessionData.status !== 'cancelled' && (
                                <a
                                    href={normalizeUrl(mySessionData.meeting_link) || undefined}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="flex items-center justify-center gap-2 w-full py-3 rounded-xl bg-indigo-50 text-indigo-600 font-bold hover:bg-indigo-100 transition-colors border border-indigo-100"
                                >
                                    🔗 Prisijungti prie pamokos
                                </a>
                            )}

                            {mySessionData?.status === 'active' && !mySessionData.paid && studentPaymentPayer !== 'parent' && (() => {
                                const { remaining } = lessonCreditBreakdown(mySessionData.price);
                                return (
                                    <button
                                        onClick={() => handleGoToStripe(mySessionData.id)}
                                        disabled={fetchingStripe}
                                        className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 text-white font-bold hover:from-violet-700 hover:to-indigo-700 transition-all shadow-md disabled:opacity-60"
                                    >
                                        {fetchingStripe
                                            ? <><Loader2 className="w-4 h-4 animate-spin" /> Jungiamasi...</>
                                            : (
                                                <>
                                                    <CreditCard className="w-4 h-4" />
                                                    {remaining > 0
                                                        ? `${t('stuSched.payStripe')} — €${formatCustomerChargeEur(remaining)}`
                                                        : `${t('stuSched.payStripe')} — ${t('stuSess.payWithCredit')}`}
                                                </>
                                            )}
                                    </button>
                                );
                            })()}

                            {/* Reschedule and Cancel buttons for active sessions */}
                            {mySessionData?.status === 'active' && mySessionData.start_time && isAfter(new Date(mySessionData.start_time), new Date()) && (
                                <div className="grid grid-cols-2 gap-3">
                                    <Button
                                        variant="outline"
                                        onClick={() => {
                                            setIsMySessionModalOpen(false);
                                            navigate('/student/sessions', { state: { sessionId: mySessionData.id, flow: 'reschedule', returnTo: '/student/schedule' } });
                                        }}
                                        className="rounded-xl border-indigo-200 text-indigo-600 hover:bg-indigo-50"
                                    >
                                        📅 Perkelti
                                    </Button>
                                    <Button
                                        variant="outline"
                                        onClick={() => {
                                            setIsMySessionModalOpen(false);
                                            navigate('/student/sessions', { state: { sessionId: mySessionData.id, flow: 'cancel' } });
                                        }}
                                        className="rounded-xl border-red-200 text-red-600 hover:bg-red-50"
                                    >
                                        {t('stuSched.cancelLesson')}
                                    </Button>
                                </div>
                            )}
                        </div>
                        <DialogFooter>
                            <Button variant="outline" onClick={() => { setIsMySessionModalOpen(false); navigate('/student/sessions'); }} className="rounded-xl">
                                {t('stuSched.viewAll')}
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>

            </StudentLayout>

            {/* Stripe redirect overlay */}
            {redirectingToStripe && (
                <div className="fixed inset-0 z-50 bg-white/90 backdrop-blur-sm flex flex-col items-center justify-center gap-4">
                    <div className="w-20 h-20 rounded-full bg-violet-100 flex items-center justify-center">
                        <Loader2 className="w-10 h-10 text-violet-600 animate-spin" />
                    </div>
                    <p className="text-lg font-semibold text-gray-800">
                        {fetchingStripe ? t('stuSched.creatingStripe') : t('stuSched.redirectingStripe')}
                    </p>
                    <p className="text-sm text-gray-500">{t('stuSched.stripeWait')}</p>
                </div>
            )}

            {/* Payment modal after booking */}
            <Dialog open={showPaymentModal} onOpenChange={setShowPaymentModal}>
                <DialogContent className="w-[95vw] sm:max-w-[420px] max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-emerald-700">
                            <Check className="w-5 h-5" /> {t('stuSched.lessonBooked')}
                        </DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-2">
                        {pendingPaymentSession && (
                            <div className="bg-gray-50 rounded-xl p-4 text-sm space-y-1 text-gray-700">
                                <p><span className="font-medium">Data:</span> {format(pendingPaymentSession.start, 'yyyy-MM-dd HH:mm', { locale: dateFnsLocale })}</p>
                                {pendingPaymentSession.price != null && (() => {
                                    const { creditApplied, remaining } = lessonCreditBreakdown(pendingPaymentSession.price);
                                    return (
                                        <>
                                            <p><span className="font-medium">Pamokos kaina:</span> €{pendingPaymentSession.price}</p>
                                            {creditApplied > 0 && (
                                                <p className="text-emerald-700 font-medium">
                                                    {t('stuSched.creditRowApplied')}: €{creditApplied.toFixed(2)}
                                                </p>
                                            )}
                                            <p>
                                                {remaining > 0 ? (
                                                    <>
                                                        <span className="font-medium">{t('stuSched.cardPayTotal')}</span> €{formatCustomerChargeEur(remaining)}
                                                    </>
                                                ) : (
                                                    <span className="font-medium text-emerald-800">{t('stuSched.creditCoversFullLesson')}</span>
                                                )}
                                            </p>
                                        </>
                                    );
                                })()}
                                <p className="text-amber-700 font-medium pt-1">
                                    {paymentTiming === 'after_lesson'
                                        ? <>{t('stuSched.payAfterLesson', { deadline: format(pendingPaymentSession.deadline, 'yyyy-MM-dd HH:mm', { locale: dateFnsLocale }) })}</>
                                        : <>{t('stuSched.payBefore', { deadline: format(pendingPaymentSession.deadline, 'yyyy-MM-dd HH:mm', { locale: dateFnsLocale }) })}</>
                                    }
                                </p>
                            </div>
                        )}

                        {studentPaymentPayer === 'parent' ? (
                            <div className="flex items-start gap-3 p-4 bg-blue-50 border border-blue-200 rounded-xl">
                                <Info className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
                                <p className="text-sm text-blue-800">
                                    {paymentTiming === 'after_lesson'
                                        ? <span dangerouslySetInnerHTML={{ __html: t('stuSched.payerParentAfter', { email: studentPayerEmail || t('stuSched.payerEmailPlaceholder') }) }} />
                                        : studentPayerEmail?.trim()
                                            ? <span dangerouslySetInnerHTML={{ __html: t('stuSched.payerParentBefore', { email: studentPayerEmail }) }} />
                                            : <>{t('stuSched.payerNoEmail')}</>}
                                </p>
                            </div>
                        ) : (
                            <button
                                onClick={() => pendingPaymentSession && handleGoToStripe(pendingPaymentSession.id)}
                                disabled={fetchingStripe}
                                className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 text-white font-bold hover:from-violet-700 hover:to-indigo-700 transition-all shadow-md disabled:opacity-60"
                            >
                                {fetchingStripe
                                    ? <><Loader2 className="w-4 h-4 animate-spin" /> Jungiamasi...</>
                                    : (
                                        <>
                                            <CreditCard className="w-4 h-4" />
                                            {pendingPaymentSession?.price != null
                                                ? (() => {
                                                    const { remaining } = lessonCreditBreakdown(pendingPaymentSession.price);
                                                    return remaining > 0
                                                        ? `${t('stuSched.payStripe')} — €${formatCustomerChargeEur(remaining)}`
                                                        : `${t('stuSched.payStripe')} — ${t('stuSess.payWithCredit')}`;
                                                })()
                                                : t('stuSched.payStripe')}
                                        </>
                                    )}
                            </button>
                        )}
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowPaymentModal(false)} className="rounded-xl w-full">
                            {t('stuSched.payLater')}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}
