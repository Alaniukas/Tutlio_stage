import { useEffect, useRef, useState } from 'react';
import StudentLayout from '@/components/StudentLayout';
import StatusBadge from '@/components/StatusBadge';
import { supabase } from '@/lib/supabase';
import { getCached, setCache } from '@/lib/dataCache';
import { sendEmail } from '@/lib/email';
import { authHeaders } from '@/lib/apiHelpers';
import { format, isAfter, differenceInHours, addDays, getDay } from 'date-fns';
import { useTranslation } from '@/lib/i18n';
import { Clock, CheckCircle, XCircle, CalendarDays, RefreshCw, ShieldAlert, ListOrdered, Mail, Video, ChevronLeft, ChevronRight, CreditCard, Loader2, Package, Users } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import SessionFiles from '@/components/SessionFiles';
import { Button } from '@/components/ui/button';
import { cn, normalizeUrl } from '@/lib/utils';
import { useLocation, useNavigate } from 'react-router-dom';
import { recurringAvailabilityAppliesOnDate } from '@/lib/availabilityRecurring';
import { formatCustomerChargeEur } from '@/lib/stripeLessonPricing';

interface Session {
    id: string;
    start_time: string;
    end_time: string;
    status: string;
    paid: boolean;
    price: number | null;
    topic: string | null;
    meeting_link?: string | null;
    payment_status?: string;
    tutor_comment?: string | null;
    show_comment_to_student?: boolean;
    subject_id?: string | null;
    subjects?: { is_group?: boolean; max_students?: number } | null;
    lesson_package_id?: string | null;
    is_late_cancelled?: boolean;
    cancellation_penalty_amount?: number | null;
    penalty_resolution?: string | null;
}


interface WaitlistEntry {
    id: string;
    notes: string | null;
    session?: { start_time: string; end_time: string; topic: string | null; price: number | null } | null;
}
interface PackageSummary {
    id: string;
    available_lessons: number;
    total_lessons: number;
    subjects?: { name: string } | null;
}

function parseWaitlistNotes(notes: string | null) {
    if (!notes) return null;
    try { return JSON.parse(notes); } catch { return null; }
}

const STATUS_CONFIG = {
    active: { labelKey: 'common.reserved' as const, color: 'bg-blue-50 text-blue-700 border-blue-100', dot: 'bg-blue-400' },
    completed: { labelKey: 'stuSess.completed' as const, color: 'bg-green-50 text-green-700 border-green-100', dot: 'bg-green-400' },
    no_show: { labelKey: 'common.noShow' as const, color: 'bg-rose-50 text-rose-800 border-rose-100', dot: 'bg-rose-400' },
    cancelled: { labelKey: 'stuSess.cancelled' as const, color: 'bg-red-50 text-red-600 border-red-100', dot: 'bg-red-400' },
};

type ModalStep = 'cancel-confirm' | 'cancel-reason' | 'penalty-choice' | 'picking' | 'confirming' | 'success' | 'cancel-success';

export default function StudentSessions() {
    const { t, dateFnsLocale } = useTranslation();
    const location = useLocation();
    const navigate = useNavigate();
    const navStateConsumed = useRef(false);
    const invoiceSuccessHandledRef = useRef(false);
    const returnToRef = useRef<string | null>(null);
    const ssCache = getCached<any>('student_sessions');
    const [sessions, setSessions] = useState<Session[]>(ssCache?.sessions ?? []);
    const [waitlistEntries, setWaitlistEntries] = useState<WaitlistEntry[]>(ssCache?.waitlist ?? []);
    const [loading, setLoading] = useState(!ssCache);
    const [filter, setFilter] = useState<'all' | 'upcoming' | 'past' | 'paid' | 'unpaid' | 'cancelled'>('all');
    const [selectedSession, setSelectedSession] = useState<Session | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
    const [saving, setSaving] = useState(false);
    const [modalStep, setModalStep] = useState<ModalStep>('cancel-confirm');
    const [cancellationHours, setCancellationHours] = useState(24);
    const [cancellationFeePercent, setCancellationFeePercent] = useState(0);
    const [minBookingHours, setMinBookingHours] = useState(1);
    const [inviteCode, setInviteCode] = useState<string | null>(null);
    const [studentEmail, setStudentEmail] = useState<string | null>(null);
    const [studentName, setStudentName] = useState<string>('');
    const [paymentPayer, setPaymentPayer] = useState<string | null>(null);
    const [payerEmail, setPayerEmail] = useState<string | null>(null);
    const [tutorEmail, setTutorEmail] = useState<string | null>(null);
    const [tutorName, setTutorName] = useState<string>('');
    const [tutorId, setTutorId] = useState<string>('');
    const [noTutorAssigned, setNoTutorAssigned] = useState(false);
    const [cancellationReason, setCancellationReason] = useState('');
    // Reschedule state
    const [availableSlots, setAvailableSlots] = useState<{ date: string; label: string; slots: { start: Date; end: Date }[] }[]>([]);
    const [selectedDateKey, setSelectedDateKey] = useState<string | null>(null);
    const [selectedNewSlot, setSelectedNewSlot] = useState<{ start: Date; end: Date } | null>(null);
    const [rescheduleLoading, setRescheduleLoading] = useState(false);
    const [rescheduleError, setRescheduleError] = useState(false);
    const [stripeLoading, setStripeLoading] = useState(false);
    const [penaltyChoiceLoading, setPenaltyChoiceLoading] = useState(false);
    const [lastPenaltyChoice, setLastPenaltyChoice] = useState<'credit' | 'refund' | null>(null);
    const [refundFollowUp, setRefundFollowUp] = useState<
        { kind: 'stripe' } | { kind: 'manual'; contact: 'tutor' | 'org_admin' } | null
    >(null);
    const [studentPaymentModel, setStudentPaymentModel] = useState<string | null>(null);
    const [creditBalance, setCreditBalance] = useState(0);
    const [activePackages, setActivePackages] = useState<PackageSummary[]>([]);
    const [showAllSessions, setShowAllSessions] = useState(false);
    const [invoicePaidSuccessOpen, setInvoicePaidSuccessOpen] = useState(false);
    const [invoicePaidSuccessLoading, setInvoicePaidSuccessLoading] = useState(false);
    const ACTIVE_STUDENT_PROFILE_KEY = 'tutlio_active_student_profile_id';
    const now = new Date();

    useEffect(() => { fetchSessions(); }, []);
    useEffect(() => { setShowAllSessions(false); }, [filter]);

    // After monthly invoice payment from Stripe success_url
    useEffect(() => {
        const params = new URLSearchParams(location.search);
        if (params.get('invoice_paid') !== 'true') return;
        if (invoiceSuccessHandledRef.current) return;
        invoiceSuccessHandledRef.current = true;

        const checkoutSessionId = params.get('session_id');
        const billingBatchId = params.get('billing_batch_id');

        setInvoicePaidSuccessOpen(true);
        setInvoicePaidSuccessLoading(true);

        // Let webhook update DB, then refresh UI.
        // We also poll a bit because webhook updates can lag slightly.
        const pollAttemptsMax = 6; // ~30s
        let pollAttempts = 0;
        const pollIntervalMs = 5000;

        let intervalId: ReturnType<typeof setInterval> | null = null;

        const poll = async () => {
            pollAttempts += 1;
            try {
                await fetchSessions();
            } catch {
                // Ignore; next tick will try again
            } finally {
                if (pollAttempts === 1) setInvoicePaidSuccessLoading(false);
            }
            if (pollAttempts >= pollAttemptsMax) {
                if (intervalId) clearInterval(intervalId);
            }
        };

        const t = setTimeout(() => {
            void poll();
        }, 2000);

        intervalId = setInterval(() => {
            if (pollAttempts === 0) return;
            void poll();
        }, pollIntervalMs);

        // Hard-confirm via API endpoint to avoid webhook edge-cases.
        // This endpoint is idempotent, so it's safe if webhook already processed it.
        if (checkoutSessionId || billingBatchId) {
            void (async () => {
                const response = await fetch('/api/confirm-monthly-invoice-payment', {
                    method: 'POST',
                    headers: await authHeaders(),
                    body: JSON.stringify({ checkoutSessionId, billingBatchId }),
                });
                return response;
            })()
                .then(async (r) => {
                    try {
                        const json = await r.json().catch(() => ({}));
                        console.log('[StudentSessions] confirm-monthly-invoice-payment response:', {
                            status: r.status,
                            ok: r.ok,
                            body: json,
                        });
                    } catch {
                        console.log('[StudentSessions] confirm-monthly-invoice-payment response status:', r.status);
                    }
                    // Refresh quickly after confirm attempt
                    void poll();
                })
                .catch((e) => {
                    console.error('[StudentSessions] confirm-monthly-invoice-payment failed:', e);
                    // If this fails, polling will still try to reflect webhook-updated DB.
                });
        }

        // Clean query params so it doesn't re-open on refresh
        const t2 = setTimeout(() => {
            navigate(location.pathname, { replace: true });
        }, 2500);

        return () => {
            clearTimeout(t);
            if (intervalId) clearInterval(intervalId);
            clearTimeout(t2);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [location.search]);

    const handleStripePayment = async (session: Session, penaltyAmount?: number) => {
        setStripeLoading(true);
        try {
            const body: any = { sessionId: session.id };
            if (paymentPayer === 'parent' && payerEmail) {
                body.payerEmail = payerEmail;
            }
            if (penaltyAmount && penaltyAmount > 0) {
                body.penaltyAmount = penaltyAmount;
            }
            const res = await fetch('/api/stripe-checkout', {
                method: 'POST',
                headers: await authHeaders(),
                body: JSON.stringify(body),
            });
            const json = await res.json().catch(() => ({ error: t('stuSess.paymentConnectFailed') }));
            if (json.creditFullyCovered) {
                fetchSessions();
                setStripeLoading(false);
                return;
            }
            if (json.url) {
                window.location.href = json.url;
                return;
            }
            alert(json.error || t('stuSess.paymentCreateFailed'));
        } catch (e) {
            alert(t('stuSess.paymentConnectFailed'));
        }
        setStripeLoading(false);
    };

    // Auto-open modal when arriving from dashboard / Stripe success with navigation state
    useEffect(() => {
        if (navStateConsumed.current) return;
        const state = location.state as { sessionId?: string; flow?: 'cancel' | 'reschedule' | 'cancel_after_payment'; returnTo?: string } | null;
        if (!state?.sessionId || sessions.length === 0) return;
        const session = sessions.find(s => s.id === state.sessionId);
        if (!session) return;
        navStateConsumed.current = true;
        if (state.returnTo) {
            returnToRef.current = state.returnTo;
        }
        setSelectedSession(session);
        if (state.flow === 'reschedule') {
            setIsModalOpen(false);
            setSelectedNewSlot(null);
            setRescheduleLoading(true);
            setRescheduleError(false);
            setModalStep('picking');
            setIsCancelModalOpen(true);
            navigate(location.pathname, { replace: true, state: null });
            loadRescheduleSlots(session);
        } else if (state.flow === 'cancel') {
            setIsModalOpen(false);
            setCancellationReason('');
            setSelectedNewSlot(null);
            setModalStep('cancel-confirm');
            setIsCancelModalOpen(true);
            navigate(location.pathname, { replace: true, state: null });
        } else if (state.flow === 'cancel_after_payment') {
            // After successful Stripe payment for late cancel fee, go directly to cancel step
            setIsModalOpen(false);
            setCancellationReason('');
            setSelectedNewSlot(null);
            setModalStep('cancel-reason');
            setIsCancelModalOpen(true);
            navigate(location.pathname, { replace: true, state: null });
        }
    }, [sessions]);

    const fetchSessions = async () => {
        if (!getCached('student_sessions')) setLoading(true);
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            setLoading(false);
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
            console.error('[StudentSessions] get_student_profiles', rpcError);
            setLoading(false);
            return;
        }

        let st = studentRows?.[0];
        if (!st && selectedStudentId) {
            const { data: fallbackRows, error: fallbackError } = await supabase.rpc('get_student_profiles', {
                p_user_id: user.id,
                p_student_id: null,
            });
            if (fallbackError) {
                console.error('[StudentSessions] get_student_profiles fallback', fallbackError);
                setLoading(false);
                return;
            }
            st = fallbackRows?.[0];
            if (st && typeof window !== 'undefined') {
                localStorage.setItem(ACTIVE_STUDENT_PROFILE_KEY, st.id);
            }
        }
        if (!st) {
            setLoading(false);
            return;
        }

        setInviteCode(st.invite_code);
        setStudentName(st.full_name || '');
        setStudentEmail(st.email || null);
        setTutorId(st.tutor_id || '');
        setNoTutorAssigned(!st.tutor_id);
        setPaymentPayer(st.payment_payer || null);
        setPayerEmail(st.payer_email || null);
        setCancellationHours(st.tutor_cancellation_hours ?? 24);
        setCancellationFeePercent(st.tutor_cancellation_fee_percent ?? 0);
        setMinBookingHours(st.tutor_min_booking_hours ?? 1);
        setTutorName(st.tutor_full_name || '');
        setTutorEmail(st.tutor_email || null);
        setStudentPaymentModel(st.payment_model || null);
        setCreditBalance(Number(st.credit_balance || 0));

        // OPTIMIZED: Limit sessions to recent past + future (6 months range)
        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

        const [sessionsRes, packageRes, waitlistRes] = await Promise.all([
            supabase
                .from('sessions')
                .select('*, subjects(is_group, max_students)')
                .eq('student_id', st.id)
                .gte('start_time', sixMonthsAgo.toISOString())
                .order('start_time', { ascending: true }),
            supabase
                .from('lesson_packages')
                .select('id, available_lessons, total_lessons, subjects(name)')
                .eq('student_id', st.id)
                .eq('active', true)
                .eq('paid', true)
                .limit(20)
                .gt('available_lessons', 0),
            supabase
                .from('waitlists')
                .select('id, notes, session:sessions(start_time, end_time, topic, price)')
                .eq('student_id', st.id)
                .order('created_at', { ascending: true }),
        ]);
        const fetchedSessions = sessionsRes.data || [];
        const fetchedWaitlist = (waitlistRes.data || []) as unknown as WaitlistEntry[];
        setSessions(fetchedSessions);
        setActivePackages((packageRes.data || []) as unknown as PackageSummary[]);
        setWaitlistEntries(fetchedWaitlist);

        setCache('student_sessions', { sessions: fetchedSessions, waitlist: fetchedWaitlist });
        const dash = getCached<{ student?: unknown; sessions?: Session[] }>('student_dashboard');
        if (dash?.student) {
            setCache('student_dashboard', { ...dash, sessions: fetchedSessions });
        }
        setLoading(false);
    };

    const isLateCancellation = (session: Session) => {
        const hoursUntil = differenceInHours(new Date(session.start_time), new Date());
        return hoursUntil < cancellationHours;
    };

    const getPenaltyAmount = (session: Session) => {
        if (!isLateCancellation(session) || cancellationFeePercent === 0) return 0;
        return ((session.price || 25) * cancellationFeePercent) / 100;
    };

    // ── Open cancel flow ──────────────────────────────────────────────────────
    const openCancelFlow = () => {
        setCancellationReason('');
        setSelectedNewSlot(null);
        setModalStep('cancel-confirm');
        setIsCancelModalOpen(true);
    };

    // ── Open reschedule flow ──────────────────────────────────────────────────
    const openRescheduleFlow = () => {
        setSelectedNewSlot(null);
        setRescheduleLoading(true);
        setRescheduleError(false);
        setModalStep('picking');
        setIsCancelModalOpen(true);
        loadRescheduleSlots();
    };

    // ── Load available slots from tutor availability ──────────────────────────
    const loadRescheduleSlots = async (sessionOverride?: Session) => {
        const session = sessionOverride || selectedSession;
        if (!session || !tutorId) { setRescheduleLoading(false); return; }

        try {
            const durationMs = new Date(session.end_time).getTime() - new Date(session.start_time).getTime();
            const originalDateStr = format(new Date(session.start_time), 'yyyy-MM-dd');
            const originalStartTime = new Date(session.start_time).getTime();

            const [{ data: av }, { data: tutorProfile }] = await Promise.all([
                supabase.from('availability').select('*').eq('tutor_id', tutorId),
                supabase.from('profiles').select('min_booking_hours, break_between_lessons').eq('id', tutorId).single(),
            ]);

            const minHours = tutorProfile?.min_booking_hours ?? minBookingHours;
            const breakMs = (tutorProfile?.break_between_lessons ?? 0) * 60000;
            const minBookingTime = new Date(new Date().getTime() + minHours * 3600000);

            let occupied: { start_time: string; end_time: string }[] = [];
            try {
                const rangeStart = new Date().toISOString();
                const rangeEnd = addDays(new Date(), 60).toISOString();
                const res = await fetch(`/api/tutor-slots?tutorId=${tutorId}&start=${encodeURIComponent(rangeStart)}&end=${encodeURIComponent(rangeEnd)}&local=1`);
                if (res.ok) {
                    const contentType = res.headers.get('content-type');
                    if (contentType && contentType.indexOf('application/json') !== -1) {
                        const data = await res.json();
                        occupied = (data || []) as { start_time: string; end_time: string }[];
                    }
                }
            } catch (e) {
                console.error('Failed to fetch busy slots:', e);
            }

            const slots: { date: string; label: string; slots: { start: Date; end: Date }[] }[] = [];
            for (let i = 0; i <= 60; i++) {
                const day = addDays(new Date(), i);
                const dow = getDay(day);
                const dateStr = format(day, 'yyyy-MM-dd');
                const rules = (av || []).filter((a) =>
                    (a.is_recurring && a.day_of_week !== null && recurringAvailabilityAppliesOnDate(a, dateStr, dow)) ||
                    (!a.is_recurring && a.specific_date === dateStr)
                );
                const daySlots: { start: Date; end: Date }[] = [];
                for (const rule of rules) {
                    const [sh, sm] = rule.start_time.split(':').map(Number);
                    const [eh, em] = rule.end_time.split(':').map(Number);
                    let cursor = new Date(day); cursor.setHours(sh, sm, 0, 0);
                    const winEnd = new Date(day); winEnd.setHours(eh, em, 0, 0);
                    while (cursor.getTime() + durationMs <= winEnd.getTime()) {
                        const slotEnd = new Date(cursor.getTime() + durationMs);
                        if (cursor >= minBookingTime && cursor.getTime() !== originalStartTime) {
                            const busy = (occupied || []).some(s => {
                                const os = new Date(s.start_time).getTime();
                                const oe = new Date(s.end_time).getTime() + breakMs;
                                return cursor.getTime() < oe && slotEnd.getTime() > os;
                            });
                            if (!busy) daySlots.push({ start: new Date(cursor), end: slotEnd });
                        }
                        cursor = new Date(cursor.getTime() + 30 * 60000);
                    }
                }
                if (daySlots.length > 0) slots.push({ date: dateStr, label: format(day, 'EEEE, d MMMM', { locale: dateFnsLocale }), slots: daySlots });
            }

            setAvailableSlots(slots);
            const matchingDate = slots.find(s => s.date === originalDateStr);
            setSelectedDateKey(matchingDate ? originalDateStr : (slots[0]?.date || null));
            setRescheduleError(false);
        } catch (err) {
            console.error('Failed to load reschedule slots:', err);
            setRescheduleError(true);
        } finally {
            setRescheduleLoading(false);
        }
    };

    const handleCancelSession = async (): Promise<boolean> => {
        if (!selectedSession || cancellationReason.trim().length < 5) return false;
        setSaving(true);

        const stripeCancelId = window.localStorage.getItem('stripe_cancel_session_id');
        const penaltyPaidViaStripe = stripeCancelId === selectedSession.id;
        if (penaltyPaidViaStripe) {
            window.localStorage.removeItem('stripe_cancel_session_id');
        }

        try {
            const resp = await fetch('/api/cancel-session', {
                method: 'POST',
                headers: await authHeaders(),
                body: JSON.stringify({
                    sessionId: selectedSession.id,
                    tutorId,
                    reason: cancellationReason.trim(),
                    cancelledBy: 'student',
                    studentName,
                    tutorName,
                    studentEmail,
                    tutorEmail,
                    payerEmail: payerEmail || null,
                    cancellationHours,
                    cancellationFeePercent,
                    penaltyPaidViaStripe,
                }),
            });
            const json = await resp.json().catch(() => ({ success: false, error: t('stuSess.cancelError') }));

            if (json.success) {
                if (json.needsPenaltyChoice) {
                    setModalStep('penalty-choice');
                } else {
                    setModalStep('cancel-success');
                }
                fetchSessions();
                if (tutorId) {
                    void (async () => {
                        await fetch('/api/google-calendar-sync', {
                            method: 'POST',
                            headers: await authHeaders(),
                            body: JSON.stringify({ userId: tutorId }),
                        });
                    })().catch((e) => console.error('Failed to full-sync Google Calendar after student cancellation:', e));
                }
                return true;
            } else {
                alert(json.error || t('stuSess.cancelFailed'));
                return false;
            }
        } catch (e) {
            console.error(e);
            alert(t('stuSess.cancelError'));
            return false;
        } finally {
            setSaving(false);
        }
    };

    const handleConfirmReschedule = async () => {
        if (!selectedSession || !selectedNewSlot) return;
        setSaving(true);

        // Use RPC function to bypass RLS (students can't directly update sessions)
        const { data, error } = await supabase.rpc('student_reschedule_session', {
            p_session_id: selectedSession.id,
            p_new_start_time: selectedNewSlot.start.toISOString(),
            p_new_end_time: selectedNewSlot.end.toISOString(),
        });

        if (!error && data?.success) {
            // Notify only student about lesson reschedule
            if (studentEmail) {
                await sendEmail({
                    type: 'lesson_rescheduled',
                    to: studentEmail,
                    data: {
                        studentName, tutorName,
                        oldDate: format(new Date(selectedSession.start_time), 'yyyy-MM-dd'),
                        oldTime: format(new Date(selectedSession.start_time), 'HH:mm'),
                        newDate: format(selectedNewSlot.start, 'yyyy-MM-dd'),
                        newTime: format(selectedNewSlot.start, 'HH:mm'),
                        rescheduledBy: 'student',
                        recipientRole: 'student',
                    },
                });
            }

            // Full sync: move lesson and refresh free time slots in Google Calendar
            try {
                if (tutorId) {
                    await fetch('/api/google-calendar-sync', {
                        method: 'POST',
                        headers: await authHeaders(),
                        body: JSON.stringify({ userId: tutorId }),
                    });
                }
            } catch (e) {
                console.error('Failed to full-sync rescheduled session to Google Calendar:', e);
            }

            setModalStep('success');
            await fetchSessions();
            // If we arrived from another page (e.g. calendar), go back there after a short delay
            const returnTo = returnToRef.current;
            if (returnTo) {
                setTimeout(() => navigate(returnTo), 1200);
            }
        } else {
            const errorMsg = data?.error || error?.message || t('stuSess.unknownError');
            alert('Nepavyko perkelti: ' + errorMsg);
        }
        setSaving(false);
    };

    const getSessionPaymentType = (session: Session): 'package' | 'monthly' | 'per_lesson' => {
        if (session.lesson_package_id) return 'package';
        if (studentPaymentModel === 'monthly_billing') return 'monthly';
        return 'per_lesson';
    };

    const handlePenaltyChoice = async (choice: 'credit' | 'refund') => {
        if (!selectedSession) return;
        setPenaltyChoiceLoading(true);
        try {
            const resp = await fetch('/api/cancel-penalty-resolution', {
                method: 'POST',
                headers: await authHeaders(),
                body: JSON.stringify({ sessionId: selectedSession.id, choice }),
            });
            const json = await resp.json().catch(() => ({}));
            if (choice === 'refund') {
                console.info('[Tutlio cancel-penalty-resolution]', {
                    httpStatus: resp.status,
                    ok: resp.ok,
                    requestSessionId: selectedSession.id,
                    response: json,
                });
            }
            if (!resp.ok) {
                const msg = [json.error, json.details].filter(Boolean).join(' — ') || t('stuSess.cancelError');
                alert(msg);
                return;
            }
            if (json.success) {
                setLastPenaltyChoice(choice);
                if (choice === 'refund' && json.refundFollowUp) {
                    setRefundFollowUp(json.refundFollowUp as { kind: 'stripe' } | { kind: 'manual'; contact: 'tutor' | 'org_admin' });
                } else {
                    setRefundFollowUp(null);
                }
                setModalStep('cancel-success');
                fetchSessions();
            } else {
                alert([json.error, json.details].filter(Boolean).join(' — ') || t('stuSess.cancelError'));
            }
        } catch (e) {
            console.error(e);
            alert(t('stuSess.cancelError'));
        } finally {
            setPenaltyChoiceLoading(false);
        }
    };

    const filtered = (() => {
        const base = sessions.filter(s => {
            if (filter === 'upcoming') return isAfter(new Date(s.end_time), now) && s.status === 'active';
            if (filter === 'past') return !isAfter(new Date(s.end_time), now) && s.status !== 'cancelled';
            if (filter === 'paid') return s.paid === true && s.status === 'active';
            if (filter === 'unpaid') return s.paid === false && s.status === 'active';
            if (filter === 'cancelled') return s.status === 'cancelled';
            return true;
        });
        if (filter === 'all') {
            const upcoming = base.filter(s => isAfter(new Date(s.start_time), now)).sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());
            const past = base.filter(s => !isAfter(new Date(s.start_time), now)).sort((a, b) => new Date(b.start_time).getTime() - new Date(a.start_time).getTime());
            return [...upcoming, ...past];
        }
        return base;
    })();
    const displayedSessions = showAllSessions ? filtered : filtered.slice(0, 3);

    return (
        <StudentLayout>
            <Dialog open={invoicePaidSuccessOpen} onOpenChange={setInvoicePaidSuccessOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <CheckCircle className="w-5 h-5 text-green-500" />
                            {t('stuSess.invoicePaidSuccess')}
                        </DialogTitle>
                        <DialogDescription>
                            {invoicePaidSuccessLoading ? t('stuSess.invoiceUpdating') : t('stuSess.invoiceConfirmed')}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="bg-green-50 border border-green-100 rounded-xl p-4">
                        <p className="text-sm text-green-800">
                            {t('stuSess.invoiceNote')}
                        </p>
                    </div>
                    <DialogFooter>
                        <Button
                            className="rounded-xl bg-green-600 hover:bg-green-700 text-white"
                            onClick={() => {
                                setInvoicePaidSuccessOpen(false);
                                navigate(location.pathname, { replace: true });
                            }}
                        >
                            {t('stuSess.viewSessions')}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
            <div className="px-4 pt-6">
                <h1 className="text-2xl font-black text-gray-900 mb-1">Pamokos</h1>
                <p className="text-gray-400 text-sm mb-5">{t('stuSess.allSessions')}</p>

                {noTutorAssigned && (
                    <div className="mb-5 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-6 text-center">
                        <p className="text-base font-semibold text-amber-800 mb-1">{t('stuSess.noTutorAssigned')}</p>
                        <p className="text-sm text-amber-700">{t('stuSess.noTutorAssignedDesc')}</p>
                    </div>
                )}

                {/* Filter pills */}
                <div className="flex gap-2 mb-5 overflow-x-auto pb-1 scrollbar-hide">
                    {(['all', 'upcoming', 'past', 'paid', 'unpaid', 'cancelled'] as const).map((f) => {
                        const labels: Record<string, string> = {
                            all: 'Visos',
                            upcoming: t('stuSess.upcoming'),
                            past: t('stuSess.past'),
                            paid: t('stuSess.reserved'),
                            unpaid: t('stuSess.awaitingPayment'),
                            cancelled: t('stuSess.cancelled'),
                        };
                        return (
                            <button
                                key={f}
                                onClick={() => setFilter(f)}
                                className={`flex-shrink-0 px-4 py-2 rounded-2xl text-sm font-semibold border transition-all ${filter === f ? 'bg-gray-900 text-white border-gray-900 shadow-sm' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                                    }`}
                            >
                                {labels[f]}
                            </button>
                        );
                    })}
                </div>

                {activePackages.length > 0 && (() => {
                    const totalAvailable = activePackages.reduce((sum, p) => sum + Number(p.available_lessons), 0);
                    const totalLessons = activePackages.reduce((sum, p) => sum + p.total_lessons, 0);
                    const availableDisplay = Number.isInteger(totalAvailable) ? String(totalAvailable) : totalAvailable.toFixed(1);
                    return (
                        <div className="mb-4 bg-violet-50 border border-violet-200 rounded-2xl p-4">
                            <div className="flex items-center gap-2 mb-1">
                                <Package className="w-4 h-4 text-violet-700" />
                                <p className="text-sm font-semibold text-violet-800">
                                    {activePackages.length === 1 && activePackages[0].subjects?.name
                                        ? activePackages[0].subjects.name
                                        : t('stuSess.activePackage')}
                                </p>
                            </div>
                            <p className="text-sm text-violet-700">
                                <strong>
                                    {t('stuSess.packageCount', { available: availableDisplay, total: String(totalLessons) })}
                                </strong>
                            </p>
                        </div>
                    );
                })()}

                {/* Waitlist entries */}
                {!loading && waitlistEntries.length > 0 && (
                    <div className="mb-6">
                        <div className="flex items-center gap-2 mb-3">
                            <ListOrdered className="w-4 h-4 text-amber-500" />
                            <p className="text-sm font-bold text-gray-600 uppercase tracking-wider">{t('stuSess.waitlistTitle')}</p>
                        </div>
                        <div className="space-y-2">
                            {waitlistEntries.map((w) => {
                                const parsed = parseWaitlistNotes(w.notes);
                                const ds = w.session || (parsed?.start_time ? {
                                    start_time: parsed.start_time,
                                    end_time: parsed.end_time || '',
                                    topic: parsed.topic || null,
                                    price: parsed.price || null,
                                } : null);
                                const queuePos = parsed?.queue_position;
                                return (
                                    <div key={w.id} className="bg-amber-50 border border-amber-100 rounded-2xl p-4 flex items-center gap-4">
                                        <div className="w-14 h-14 rounded-2xl bg-amber-100 flex flex-col items-center justify-center flex-shrink-0 relative">
                                            <Clock className="w-5 h-5 text-amber-600" />
                                            {queuePos && (
                                                <span className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-amber-500 text-white text-xs font-black rounded-full flex items-center justify-center">
                                                    {queuePos}
                                                </span>
                                            )}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="font-bold text-gray-900 text-sm truncate">{ds?.topic || 'Pamoka'}</p>
                                            {ds?.start_time ? (
                                                <p className="text-xs text-gray-500 mt-0.5">
                                                    {format(new Date(ds.start_time), 'EEEE, MMMM d', { locale: dateFnsLocale })} · {format(new Date(ds.start_time), 'HH:mm')}
                                                    {ds.end_time && ` – ${format(new Date(ds.end_time), 'HH:mm')}`}
                                                </p>
                                            ) : null}
                                        </div>
                                        <div className="flex-shrink-0 text-right">
                                            <span className="text-xs font-bold px-3 py-1 rounded-full bg-amber-100 text-amber-700 border border-amber-200">
                                                {queuePos ? t('stuSess.inQueueN', { pos: String(queuePos) }) : t('stuSess.inQueue')}
                                            </span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                {loading ? (
                    <div className="space-y-3">{[1, 2, 3, 4].map(i => <div key={i} className="h-20 bg-white rounded-3xl animate-pulse" />)}</div>
                ) : filtered.length === 0 ? (
                    <div className="text-center py-16">
                        <CalendarDays className="w-12 h-12 text-gray-200 mx-auto mb-3" />
                        <p className="text-gray-500 font-semibold">{t('stuSess.noSessions')}</p>
                    </div>
                ) : (
                    <div className="grid gap-4">
                        {displayedSessions.map((s) => {
                            const statusCfg = STATUS_CONFIG[s.status as keyof typeof STATUS_CONFIG] || STATUS_CONFIG.active;
                            const isPast = !isAfter(new Date(s.end_time), now);
                            return (
                                <div key={s.id} onClick={() => { setSelectedSession(s); setIsModalOpen(true); }} className={cn("bg-white rounded-[2rem] p-5 shadow-sm border border-gray-100 flex items-center gap-5 transition-all cursor-pointer", isPast ? "opacity-75" : "hover:shadow-md")}>
                                    {/* Date block */}
                                    <div className={cn("w-16 h-16 rounded-2xl flex flex-col items-center justify-center flex-shrink-0 border", isPast ? 'bg-gray-50 border-gray-100 text-gray-400' : 'bg-violet-50 border-violet-100 text-violet-600')}>
                                        <span className="text-xs font-bold uppercase tracking-widest">
                                            {format(new Date(s.start_time), 'MMM', { locale: dateFnsLocale })}
                                        </span>
                                        <span className="text-2xl font-black leading-none mt-0.5">
                                            {format(new Date(s.start_time), 'd')}
                                        </span>
                                    </div>

                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-1">
                                            <p className="text-lg font-black text-gray-900 truncate">{s.topic || t('stuSess.selfStudy')}</p>
                                            {s.subjects?.is_group && (
                                                <span className="bg-violet-100 text-violet-700 px-2 py-0.5 rounded-full text-xs font-bold flex items-center gap-1 flex-shrink-0">
                                                    <Users className="w-3 h-3" />
                                                    {t('stuSess.group')}
                                                </span>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-2 mt-0.5 text-gray-500">
                                            <Clock className="w-4 h-4" />
                                            <span className="text-sm font-semibold">
                                                {format(new Date(s.start_time), 'HH:mm')} – {format(new Date(s.end_time), 'HH:mm')}
                                            </span>
                                            {s.meeting_link && !isPast && (
                                                <a href={normalizeUrl(s.meeting_link) || undefined} target="_blank" rel="noreferrer" className="ml-2 bg-indigo-50 text-indigo-600 px-2.5 py-1 rounded-lg text-xs font-bold hover:bg-indigo-100 transition-colors">
                                                    Prisijungti
                                                </a>
                                            )}
                                        </div>
                                    </div>

                                    <div className="text-right flex-shrink-0 flex flex-col items-end gap-2">
                                        <span className={cn("text-xs font-bold px-3 py-1 rounded-full border", statusCfg.color)}>
                                            {t(statusCfg.labelKey)}
                                        </span>
                                        {paymentPayer !== 'parent' && (
                                            <div>
                                                {s.paid ? (
                                                    <div className="flex items-center gap-1">
                                                        <CheckCircle className="w-4 h-4 text-green-500" />
                                                        <span className="text-sm text-green-600 font-bold">{t('stuSess.paid')}</span>
                                                    </div>
                                                ) : s.price ? (
                                                    <span className="text-sm font-black text-amber-600">€{s.price} <span className="text-xs text-amber-500/80 font-semibold">(Laukia)</span></span>
                                                ) : null}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                        {filtered.length > 3 && (
                            <button
                                onClick={() => setShowAllSessions((v) => !v)}
                                className="w-full text-center text-sm text-indigo-600 font-semibold py-2 hover:bg-gray-50 rounded-xl transition-colors"
                            >
                                {showAllSessions ? t('stuSess.showLess') : t('stuSess.showMore', { count: String(filtered.length) })}
                            </button>
                        )}
                    </div>
                )}
            </div>

            {/* ── Session Details Modal ───────────────────────────────────────────── */}
            <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
                <DialogContent className="w-[95vw] sm:max-w-[440px] max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <CalendarDays className="w-5 h-5 text-indigo-600" />
                            Pamokos informacija
                        </DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-3">
                        <div>
                            <div className="flex items-center gap-2 mb-2">
                                <p className="text-xl font-black text-gray-900 leading-tight">{selectedSession?.topic || t('stuSess.selfStudy')}</p>
                                {selectedSession?.subjects?.is_group && (
                                    <span className="bg-violet-100 text-violet-700 px-2.5 py-1 rounded-full text-xs font-bold flex items-center gap-1">
                                        <Users className="w-3.5 h-3.5" />
                                        {t('stuSess.groupLesson')}
                                    </span>
                                )}
                            </div>
                            <div className="flex items-center gap-2 mt-2 text-gray-600 font-medium">
                                <Clock className="w-4 h-4" />
                                <span>
                                    {selectedSession?.start_time && format(new Date(selectedSession.start_time), 'EEEE, MMMM d', { locale: dateFnsLocale })}
                                    {' '}·{' '}
                                    {selectedSession?.start_time && format(new Date(selectedSession.start_time), 'HH:mm')}
                                    {' '}–{' '}
                                    {selectedSession?.end_time && format(new Date(selectedSession.end_time), 'HH:mm')}
                                </span>
                            </div>
                        </div>

                        {paymentPayer !== 'parent' && (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                                <div className="bg-gray-50 rounded-xl p-3 text-center border border-gray-100">
                                    <p className="text-xs text-gray-400 mb-1 font-semibold uppercase tracking-wider">Kaina</p>
                                    <p className="font-bold text-gray-900">€{selectedSession?.price ?? '–'}</p>
                                    {selectedSession?.status === 'active' && !selectedSession.paid && selectedSession.price != null && (
                                        <p className="text-[11px] text-gray-500 mt-1 leading-snug">
                                            {t('stuSess.stripeChargeNote', { amount: formatCustomerChargeEur(selectedSession.price) })}
                                        </p>
                                    )}
                                </div>
                                <div className="bg-gray-50 rounded-xl p-3 text-center border border-gray-100 flex flex-col items-center justify-center">
                                    <p className="text-xs text-gray-400 mb-2 font-semibold uppercase tracking-wider">Statusas</p>
                                    <StatusBadge status={selectedSession?.status || ''} paymentStatus={selectedSession?.payment_status} paid={selectedSession?.paid} endTime={selectedSession?.end_time} />
                                </div>
                            </div>
                        )}

                        {/* Tutor comment (visible only if marked "show to student") */}
                        {selectedSession?.show_comment_to_student && selectedSession?.tutor_comment && (
                            <div className="p-3 rounded-xl bg-indigo-50 border border-indigo-100">
                                <p className="text-xs font-semibold text-indigo-600 uppercase tracking-wider mb-1">Korepetitoriaus komentaras</p>
                                <div className="text-sm text-indigo-900 whitespace-pre-wrap">{selectedSession.tutor_comment}</div>
                            </div>
                        )}

                        {/* Tutor contact */}
                        {(tutorName || tutorEmail) && (
                            <div className="bg-violet-50 rounded-xl p-3 border border-violet-100 flex items-center gap-3">
                                <div className="w-9 h-9 rounded-full bg-violet-200 flex items-center justify-center text-violet-700 font-bold text-sm flex-shrink-0">
                                    {tutorName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || '?'}
                                </div>
                                <div className="min-w-0">
                                    <p className="text-xs text-violet-500 font-semibold uppercase tracking-wider">Korepetitorius</p>
                                    <p className="font-semibold text-gray-900 text-sm">{tutorName}</p>
                                    {tutorEmail && (
                                        <a href={`mailto:${tutorEmail}`} className="text-xs text-indigo-600 hover:underline flex items-center gap-1 mt-0.5">
                                            <Mail className="w-3 h-3" />{tutorEmail}
                                        </a>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Meeting link */}
                        {selectedSession?.status !== 'cancelled' && (
                            selectedSession?.meeting_link ? (
                                <a
                                    href={normalizeUrl(selectedSession.meeting_link) || undefined}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="flex items-center justify-center gap-2 w-full py-3 rounded-xl bg-indigo-50 text-indigo-600 font-bold hover:bg-indigo-100 transition-colors border border-indigo-100"
                                >
                                    <Video className="w-4 h-4" /> Prisijungti prie susitikimo
                                </a>
                            ) : (
                                <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-gray-50 border border-gray-100 text-gray-400 text-sm">
                                    <Video className="w-4 h-4" />
                                    <span>Susitikimo nuoroda nenurodyta</span>
                                </div>
                            )
                        )}

                        {/* Credit balance + Stripe payment button for unpaid sessions (only for self-payers) */}
                        {selectedSession?.status === 'active' && !selectedSession.paid && paymentPayer !== 'parent' && (
                            <div className="space-y-2">
                                {creditBalance > 0 && (
                                    <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-green-50 border border-green-200 text-sm">
                                        <span className="text-green-700 font-medium">{t('stuSess.creditAvailable')}</span>
                                        <span className="text-green-800 font-bold">€{creditBalance.toFixed(2)}</span>
                                    </div>
                                )}
                                <button
                                    onClick={() => handleStripePayment(selectedSession)}
                                    disabled={stripeLoading}
                                    className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 text-white font-bold hover:from-violet-700 hover:to-indigo-700 transition-all shadow-md disabled:opacity-60"
                                >
                                    {stripeLoading
                                        ? <><Loader2 className="w-4 h-4 animate-spin" /> {t('stuSess.processing')}</>
                                        : creditBalance >= (selectedSession.price || 0) && (selectedSession.price || 0) > 0
                                            ? <><CreditCard className="w-4 h-4" /> {t('stuSess.payWithCredit')}</>
                                            : <><CreditCard className="w-4 h-4" /> {t('stuSess.payStripe', { amount: formatCustomerChargeEur(Math.max(0, (selectedSession.price || 0) - creditBalance)) })}</>
                                    }
                                </button>
                            </div>
                        )}

                        {selectedSession && (
                            <SessionFiles sessionId={selectedSession.id} role="student" />
                        )}
                    </div>

                    {/* Two-button footer: Reschedule + Cancel */}
                    {selectedSession?.status === 'active' && isAfter(new Date(selectedSession.end_time), new Date()) && (
                        <DialogFooter className="mt-2 flex gap-2 sm:flex-row">
                            <Button
                                variant="outline"
                                onClick={openRescheduleFlow}
                                disabled={rescheduleLoading}
                                className="flex-1 rounded-xl border-indigo-200 text-indigo-700 hover:bg-indigo-50 hover:border-indigo-300"
                            >
                                <RefreshCw className={cn("w-4 h-4 mr-2", rescheduleLoading && "animate-spin")} />
                                Perkelti
                            </Button>
                            <Button
                                variant="destructive"
                                onClick={openCancelFlow}
                                className="flex-1 rounded-xl"
                            >
                                <XCircle className="w-4 h-4 mr-2" />
                                {t('stuSess.cancelBtn')}
                            </Button>
                        </DialogFooter>
                    )}
                </DialogContent>
            </Dialog>

            {/* ── Cancel / Reschedule Modal ───────────────────────────────────────── */}
            <Dialog
                open={isCancelModalOpen}
                onOpenChange={(open) => {
                    setIsCancelModalOpen(open);
                    if (!open) { setRescheduleLoading(false); setRescheduleError(false); setPenaltyChoiceLoading(false); setLastPenaltyChoice(null); setSelectedNewSlot(null); setModalStep('cancel-confirm'); }
                }}
            >
                <DialogContent className="w-[95vw] sm:max-w-[480px] max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            {modalStep === 'picking' ? (
                                <><CalendarDays className="w-5 h-5 text-indigo-500" /> {t('stuSess.chooseNewTime')}</>
                            ) : modalStep === 'confirming' ? (
                                <><RefreshCw className="w-5 h-5 text-indigo-500" /> {t('stuSess.confirmReschedule')}</>
                            ) : modalStep === 'cancel-reason' ? (
                                <><XCircle className="w-5 h-5 text-red-500" /> {t('stuSess.confirmCancel')}</>
                            ) : modalStep === 'penalty-choice' ? (
                                <><ShieldAlert className="w-5 h-5 text-amber-500" /> {t('stuSess.penaltyChoiceTitle')}</>
                            ) : modalStep === 'success' ? (
                                <><CheckCircle className="w-5 h-5 text-green-500" /> {t('stuSess.rescheduledSuccessTitle')}</>
                            ) : modalStep === 'cancel-success' ? (
                                <><CheckCircle className="w-5 h-5 text-green-500" /> {t('stuSess.sessionCancelled')}</>
                            ) : (
                                <><ShieldAlert className="w-5 h-5 text-amber-500" /> {t('stuSess.cancelSession')}</>
                            )}
                        </DialogTitle>
                    </DialogHeader>

                    {/* ── Step: cancel-confirm ── */}
                    {modalStep === 'cancel-confirm' && selectedSession && (() => {
                        const paymentType = getSessionPaymentType(selectedSession);
                        const isLate = isLateCancellation(selectedSession);
                        const hasPenalty = isLate && cancellationFeePercent > 0;
                        const penalty = getPenaltyAmount(selectedSession);
                        const penaltyCredits = hasPenalty ? (cancellationFeePercent / 100) : 0;

                        return (
                            <div className="space-y-4 py-3">
                                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                                    <p className="text-sm font-semibold text-amber-800 mb-1">Ar tikrai nenorite perkelti pamokos?</p>
                                    <p className="text-sm text-amber-700">
                                        {t('stuSess.rescheduleNote')}
                                    </p>
                                </div>

                                {hasPenalty && (
                                    <div className="bg-red-50 border border-red-200 rounded-xl p-4 space-y-2">
                                        <div>
                                            <p className="text-sm font-semibold text-red-800 mb-1">{t('stuSess.lateCancelWarning')}</p>
                                            <p className="text-sm text-red-700">
                                                <span dangerouslySetInnerHTML={{ __html: t('stuSess.lateCancelDesc', { hours: String(cancellationHours), percent: String(cancellationFeePercent) }) }} />
                                                <span className="block text-lg font-bold mt-1">€{penalty.toFixed(2)}</span>
                                            </p>
                                        </div>
                                        {paymentType === 'package' && (
                                            <p className="text-xs font-medium text-red-800 bg-red-100/80 border border-red-200 rounded-lg px-3 py-2">
                                                {t('stuSess.penaltyPackageNote', { credits: penaltyCredits.toFixed(2) })}
                                            </p>
                                        )}
                                        {paymentType === 'monthly' && (
                                            <p className="text-xs font-medium text-red-800 bg-red-100/80 border border-red-200 rounded-lg px-3 py-2">
                                                {t('stuSess.penaltyInvoiceNote', { amount: penalty.toFixed(2) })}
                                            </p>
                                        )}
                                        {paymentType === 'per_lesson' && !selectedSession.paid && (
                                            <p className="text-xs font-medium text-red-800 bg-red-100/80 border border-red-200 rounded-lg px-3 py-2">
                                                {t('stuSess.penaltyPayNote', { amount: penalty.toFixed(2) })}
                                            </p>
                                        )}
                                        {paymentType === 'per_lesson' && selectedSession.paid && (
                                            <p className="text-xs font-medium text-red-800 bg-red-100/80 border border-red-200 rounded-lg px-3 py-2">
                                                {t('stuSess.penaltyPaidNote', { penalty: penalty.toFixed(2), refundable: ((selectedSession.price || 0) - penalty).toFixed(2) })}
                                            </p>
                                        )}
                                    </div>
                                )}

                                {!isLate && (
                                    <div className="bg-gray-50 border border-gray-200 rounded-xl p-3">
                                        <p className="text-xs text-gray-500">
                                            <span dangerouslySetInnerHTML={{ __html: t('stuSess.freeCancelNote', { hours: String(cancellationHours) }) }} />
                                        </p>
                                    </div>
                                )}

                                <div className="flex gap-3">
                                    <Button
                                        variant="outline"
                                        onClick={openRescheduleFlow}
                                        disabled={rescheduleLoading}
                                        className="flex-1 rounded-xl border-indigo-200 text-indigo-700 hover:bg-indigo-50 hover:border-indigo-300"
                                    >
                                        <RefreshCw className={cn("w-4 h-4 mr-2", rescheduleLoading && "animate-spin")} />
                                        Perkelti
                                    </Button>
                                    {hasPenalty && paymentType === 'per_lesson' && !selectedSession.paid ? (
                                        <Button
                                            variant="destructive"
                                            onClick={() => {
                                                window.localStorage.setItem('stripe_cancel_session_id', selectedSession.id);
                                                handleStripePayment(selectedSession, penalty);
                                            }}
                                            className="flex-1 rounded-xl"
                                            disabled={stripeLoading}
                                        >
                                            {stripeLoading ? (
                                                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Jungiama...</>
                                            ) : (
                                                <>
                                                    <CreditCard className="w-4 h-4 mr-2" />
                                                    {t('stuSess.payFine')} €{penalty.toFixed(2)}
                                                </>
                                            )}
                                        </Button>
                                    ) : (
                                        <Button
                                            variant="destructive"
                                            onClick={() => setModalStep('cancel-reason')}
                                            className="flex-1 rounded-xl"
                                        >
                                            <XCircle className="w-4 h-4 mr-2" />
                                            {t('stuSess.cancelFully')}
                                        </Button>
                                    )}
                                </div>
                            </div>
                        );
                    })()}

                    {/* ── Step: cancel-reason ── */}
                    {modalStep === 'cancel-reason' && selectedSession && (() => {
                        const isLate = isLateCancellation(selectedSession);
                        const hasPenalty = isLate && cancellationFeePercent > 0;
                        const penalty = getPenaltyAmount(selectedSession);
                        return (
                            <div className="space-y-4 py-3">
                                {hasPenalty ? (
                                    <div className="bg-red-50 border border-red-200 rounded-xl p-4 space-y-2">
                                        <div>
                                            <p className="text-sm font-semibold text-red-800 mb-1">{t('stuSess.lateCancelTitle')}</p>
                                            <p className="text-sm text-red-700">
                                                <span dangerouslySetInnerHTML={{ __html: t('stuSess.lateCancelPaidDesc', { hours: String(cancellationHours), percent: String(cancellationFeePercent) }) }} />
                                                <span className="block text-lg font-bold mt-1">€{penalty.toFixed(2)}</span>
                                            </p>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="bg-green-50 border border-green-200 rounded-xl p-4">
                                        <p className="text-sm text-green-700">✅ {t('stuSess.freeCancelOk')}</p>
                                    </div>
                                )}
                                <div className="space-y-2">
                                    <label className="text-sm font-semibold text-gray-700">{t('stuSess.cancelReasonLabel')}</label>
                                    <textarea
                                        value={cancellationReason}
                                        onChange={(e) => setCancellationReason(e.target.value)}
                                        placeholder={t('stuSess.cancelReasonPlaceholder')}
                                        className="w-full p-3 rounded-xl border border-gray-200 text-sm resize-none focus:ring-2 focus:ring-red-200 focus:border-red-300 outline-none"
                                        rows={3}
                                    />
                                    {cancellationReason.length > 0 && cancellationReason.trim().length < 5 && (
                                        <p className="text-xs text-red-500">Bent 5 simboliai ({cancellationReason.trim().length}/5)</p>
                                    )}
                                </div>
                                <div className="flex gap-3">
                                    <Button variant="outline" onClick={() => setModalStep('cancel-confirm')} className="flex-1 rounded-xl">{t('stuSess.goBack')}</Button>
                                    <Button variant="destructive" onClick={() => void handleCancelSession()} disabled={saving || cancellationReason.trim().length < 5} className="flex-1 rounded-xl">
                                        {saving ? t('stuSess.cancelling') : t('stuSess.confirmCancelBtn')}
                                    </Button>
                                </div>
                            </div>
                        );
                    })()}

                    {/* ── Step: penalty-choice (per-lesson paid late cancel) ── */}
                    {modalStep === 'penalty-choice' && selectedSession && (() => {
                        const penalty = getPenaltyAmount(selectedSession);
                        const refundable = (selectedSession.price || 0) - penalty;
                        const noPenalty = penalty < 0.005;
                        return (
                            <div className="py-2 space-y-4">
                                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                                    <p className="text-sm font-semibold text-amber-800 mb-1">{noPenalty ? t('stuSess.penaltyChoiceTitleEarly') : t('stuSess.penaltyChoiceTitle')}</p>
                                    <p className="text-sm text-amber-700">
                                        {noPenalty
                                            ? t('stuSess.penaltyChoiceDescEarly', { refundable: refundable.toFixed(2) })
                                            : t('stuSess.penaltyChoiceDesc', { penalty: penalty.toFixed(2), refundable: refundable.toFixed(2) })}
                                    </p>
                                </div>
                                <div className="space-y-3">
                                    <button
                                        onClick={() => handlePenaltyChoice('credit')}
                                        disabled={penaltyChoiceLoading}
                                        className="w-full text-left p-4 rounded-xl border-2 border-indigo-200 hover:border-indigo-400 hover:bg-indigo-50 transition-all disabled:opacity-60"
                                    >
                                        <p className="font-bold text-gray-900 text-sm">{t('stuSess.penaltyChoiceCredit')}</p>
                                        <p className="text-xs text-gray-500 mt-1">
                                            {t('stuSess.penaltyChoiceCreditDesc', { amount: refundable.toFixed(2) })}
                                        </p>
                                    </button>
                                    <button
                                        onClick={() => handlePenaltyChoice('refund')}
                                        disabled={penaltyChoiceLoading}
                                        className="w-full text-left p-4 rounded-xl border-2 border-green-200 hover:border-green-400 hover:bg-green-50 transition-all disabled:opacity-60"
                                    >
                                        <p className="font-bold text-gray-900 text-sm">{t('stuSess.penaltyChoiceRefund')}</p>
                                        <p className="text-xs text-gray-500 mt-1">
                                            {t('stuSess.penaltyChoiceRefundDesc', { amount: refundable.toFixed(2) })}
                                        </p>
                                    </button>
                                </div>
                                {penaltyChoiceLoading && (
                                    <div className="flex items-center justify-center gap-2 text-sm text-gray-500">
                                        <Loader2 className="w-4 h-4 animate-spin" /> {t('stuSess.processing')}
                                    </div>
                                )}
                            </div>
                        );
                    })()}

                    {/* ── Step: picking ── */}
                    {modalStep === 'picking' && (() => {
                        const dateIdx = availableSlots.findIndex(s => s.date === selectedDateKey);
                        const currentDay = availableSlots[dateIdx];
                        return (
                            <div className="py-2 space-y-4">
                                {rescheduleLoading ? (
                                    <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                                        <RefreshCw className="w-8 h-8 animate-spin mb-3 text-indigo-400" />
                                        <p className="text-sm font-medium">{t('stuSess.loadingSlots')}</p>
                                    </div>
                                ) : rescheduleError ? (
                                    <div className="text-center py-8">
                                        <XCircle className="w-10 h-10 mx-auto mb-2 text-red-300" />
                                        <p className="text-sm font-medium text-red-600 mb-3">{t('stuSess.slotLoadError')}</p>
                                        <Button variant="outline" size="sm" onClick={openRescheduleFlow} className="rounded-xl">
                                            <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> {t('stuSess.retry')}
                                        </Button>
                                    </div>
                                ) : availableSlots.length === 0 ? (
                                    <div className="text-center py-8 text-gray-400">
                                        <CalendarDays className="w-10 h-10 mx-auto mb-2 opacity-30" />
                                        <p className="text-sm font-medium">{t('stuSess.noSlotsFound')}</p>
                                    </div>
                                ) : (
                                    <>
                                        {/* Arrow date navigation */}
                                        <div className="flex items-center gap-2">
                                            <button
                                                onClick={() => setSelectedDateKey(availableSlots[dateIdx - 1].date)}
                                                disabled={dateIdx <= 0}
                                                className="w-9 h-9 rounded-xl border border-gray-200 flex items-center justify-center text-gray-500 hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-600 disabled:opacity-30 disabled:cursor-not-allowed transition-all flex-shrink-0"
                                            >
                                                <ChevronLeft className="w-4 h-4" />
                                            </button>
                                            <div className="flex-1 text-center">
                                                <p className="font-bold text-gray-900 text-sm capitalize">{currentDay?.label}</p>
                                                <p className="text-xs text-gray-400 mt-0.5">{t('stuSess.dayCounter', { current: String(dateIdx + 1), total: String(availableSlots.length) })}</p>
                                            </div>
                                            <button
                                                onClick={() => setSelectedDateKey(availableSlots[dateIdx + 1].date)}
                                                disabled={dateIdx >= availableSlots.length - 1}
                                                className="w-9 h-9 rounded-xl border border-gray-200 flex items-center justify-center text-gray-500 hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-600 disabled:opacity-30 disabled:cursor-not-allowed transition-all flex-shrink-0"
                                            >
                                                <ChevronRight className="w-4 h-4" />
                                            </button>
                                        </div>
                                        {/* All time slots for selected day */}
                                        <div className="grid grid-cols-4 gap-2">
                                            {currentDay?.slots.map((slot, i) => (
                                                <button
                                                    key={i}
                                                    onClick={() => { setSelectedNewSlot(slot); setModalStep('confirming'); }}
                                                    className="py-2.5 px-1 rounded-xl border text-sm font-bold text-center transition-all bg-white text-gray-700 border-gray-200 hover:border-indigo-400 hover:bg-indigo-50 hover:text-indigo-700 active:bg-indigo-100"
                                                >
                                                    {format(slot.start, 'HH:mm')}
                                                </button>
                                            ))}
                                        </div>
                                    </>
                                )}
                                <Button variant="outline" onClick={() => setIsCancelModalOpen(false)} className="w-full rounded-xl">{t('stuSess.close')}</Button>
                            </div>
                        );
                    })()}

                    {/* ── Step: confirming ── */}
                    {modalStep === 'confirming' && selectedNewSlot && selectedSession && (
                        <div className="py-2 space-y-4">
                            <p className="text-sm text-gray-600">{t('stuSess.rescheduleConfirm')}</p>
                            <div className="space-y-2">
                                <div className="bg-red-50 border border-red-100 rounded-xl p-3">
                                    <p className="text-xs text-red-400 font-bold uppercase tracking-wider mb-1">{t('stuSess.previousTime')}</p>
                                    <p className="font-bold text-gray-900 text-sm capitalize">
                                        {format(new Date(selectedSession.start_time), 'EEEE, d MMMM', { locale: dateFnsLocale })}
                                    </p>
                                    <p className="text-gray-600 text-sm">
                                        {format(new Date(selectedSession.start_time), 'HH:mm')} – {format(new Date(selectedSession.end_time), 'HH:mm')}
                                    </p>
                                </div>
                                <div className="flex justify-center text-gray-400 text-lg font-bold">↓</div>
                                <div className="bg-green-50 border border-green-100 rounded-xl p-3">
                                    <p className="text-xs text-green-500 font-bold uppercase tracking-wider mb-1">Naujas laikas</p>
                                    <p className="font-bold text-gray-900 text-sm capitalize">
                                        {format(selectedNewSlot.start, 'EEEE, d MMMM', { locale: dateFnsLocale })}
                                    </p>
                                    <p className="text-gray-600 text-sm">
                                        {format(selectedNewSlot.start, 'HH:mm')} – {format(selectedNewSlot.end, 'HH:mm')}
                                    </p>
                                </div>
                            </div>
                            <div className="flex gap-3">
                                <Button variant="outline" onClick={() => setModalStep('picking')} className="flex-1 rounded-xl">Keisti</Button>
                                <Button onClick={handleConfirmReschedule} disabled={saving} className="flex-1 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white">
                                    {saving ? 'Perkeliama...' : 'Taip, perkelti'}
                                </Button>
                            </div>
                        </div>
                    )}

                    {/* ── Step: cancel-success ── */}
                    {modalStep === 'cancel-success' && (
                        <div className="py-4 space-y-5 text-center">
                            <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto">
                                <CheckCircle className="w-8 h-8 text-green-500" />
                            </div>
                            <div>
                                <p className="text-lg font-black text-gray-900">{t('stuSess.cancelledSuccessTitle')}</p>
                                <p className="text-sm text-gray-500 mt-1">{t('stuSess.cancelledSuccessDesc')}</p>
                                {lastPenaltyChoice === 'credit' && (
                                    <p className="text-sm text-green-700 font-medium mt-3 px-3 py-2 bg-green-50 border border-green-200 rounded-xl">
                                        {t('stuSess.creditAppliedSuccess', { amount: ((selectedSession?.price || 0) - getPenaltyAmount(selectedSession!)).toFixed(2) })}
                                    </p>
                                )}
                                {lastPenaltyChoice === 'refund' && refundFollowUp?.kind === 'stripe' && (
                                    <div
                                        className="text-sm text-emerald-800 font-medium mt-3 px-3 py-3 bg-emerald-50 border border-emerald-200 rounded-xl text-left space-y-2"
                                        dangerouslySetInnerHTML={{ __html: t('stuSess.refundSuccessStripeNote') }}
                                    />
                                )}
                                {lastPenaltyChoice === 'refund' && refundFollowUp?.kind === 'manual' && refundFollowUp.contact === 'tutor' && (
                                    <div
                                        className="text-sm text-amber-800 font-medium mt-3 px-3 py-3 bg-amber-50 border border-amber-200 rounded-xl text-left"
                                        dangerouslySetInnerHTML={{ __html: t('stuSess.refundSuccessManualTutor', { tutor: tutorName || t('stuSess.refundTutorFallback') }) }}
                                    />
                                )}
                                {lastPenaltyChoice === 'refund' && refundFollowUp?.kind === 'manual' && refundFollowUp.contact === 'org_admin' && (
                                    <div
                                        className="text-sm text-amber-800 font-medium mt-3 px-3 py-3 bg-amber-50 border border-amber-200 rounded-xl text-left"
                                        dangerouslySetInnerHTML={{ __html: t('stuSess.refundSuccessManualOrg') }}
                                    />
                                )}
                                {lastPenaltyChoice === 'refund' && !refundFollowUp && (
                                    <p className="text-sm text-amber-700 font-medium mt-3 px-3 py-2 bg-amber-50 border border-amber-200 rounded-xl" dangerouslySetInnerHTML={{ __html: t('stuSess.refundContactNote') }} />
                                )}
                            </div>
                            <Button
                                onClick={() => { setIsCancelModalOpen(false); setIsModalOpen(false); }}
                                className="w-full rounded-xl"
                            >
                                {t('stuSess.okBtn')}
                            </Button>
                        </div>
                    )}

                    {/* ── Step: success ── */}
                    {modalStep === 'success' && selectedNewSlot && (
                        <div className="py-4 space-y-5 text-center">
                            <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto">
                                <CheckCircle className="w-8 h-8 text-green-500" />
                            </div>
                            <div>
                                <p className="text-lg font-black text-gray-900">{t('stuSess.rescheduledSuccessTitle')}</p>
                                <p className="text-sm text-gray-500 mt-1">{t('stuSess.rescheduledSuccessDesc')}</p>
                            </div>
                            <div className="bg-green-50 border border-green-100 rounded-xl p-4 text-left">
                                <p className="text-xs text-green-500 font-bold uppercase tracking-wider mb-2">Naujas laikas</p>
                                <p className="font-bold text-gray-900 capitalize">
                                    {format(selectedNewSlot.start, 'EEEE, d MMMM', { locale: dateFnsLocale })}
                                </p>
                                <p className="text-gray-600 text-sm mt-0.5">
                                    {format(selectedNewSlot.start, 'HH:mm')} – {format(selectedNewSlot.end, 'HH:mm')}
                                </p>
                            </div>
                            <Button
                                onClick={() => { setIsCancelModalOpen(false); setIsModalOpen(false); }}
                                className="w-full rounded-xl bg-green-600 hover:bg-green-700 text-white"
                            >
                                Gerai
                            </Button>
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </StudentLayout>
    );
}
