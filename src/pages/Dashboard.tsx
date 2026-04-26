import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import Layout from '@/components/Layout';
import TutorOnboarding from '@/components/TutorOnboarding';
import SessionFiles from '@/components/SessionFiles';
import { supabase } from '@/lib/supabase';
import { getCached, setCache } from '@/lib/dataCache';
import { authHeaders } from '@/lib/apiHelpers';
import { useUser } from '@/contexts/UserContext';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { sendEmail } from '@/lib/email';
import { format, isAfter, isBefore, addDays, subDays } from 'date-fns';
import { useTranslation } from '@/lib/i18n';
import { Link } from 'react-router-dom';
import Toast from '@/components/Toast';
import {
    CalendarDays,
    AlertCircle,
    CheckCircle,
    Clock,
    TrendingUp,
    Users,
    Wallet,
    ChevronRight,
    ArrowRight,
    XCircle,
    CreditCard,
    UserX,
    RotateCcw,
} from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { cn, normalizeUrl } from '@/lib/utils';
import StatusBadge from '@/components/StatusBadge';
import { DateTimeSpinner } from '@/components/TimeSpinner';
import { Edit2 } from 'lucide-react';
import { cancelSessionAndFillWaitlist } from '@/lib/lesson-actions';
import { useOrgFeatures } from '@/hooks/useOrgFeatures';
import { formatContactForTutorView } from '@/lib/orgContactVisibility';
import MarkStudentNoShowDialog from '@/components/MarkStudentNoShowDialog';
import { buildNoShowSessionPatch, noShowWhenLabelLt, type NoShowWhen } from '@/lib/noShowWhen';

interface Session {
    id: string;
    student_id: string;
    subject_id?: string | null;
    start_time: string;
    end_time: string;
    status: string;
    paid: boolean;
    price: number | null;
    topic: string | null;
    created_at?: string;
    meeting_link?: string | null;
    cancellation_reason?: string | null;
    payment_status?: string;
    tutor_comment?: string | null;
    show_comment_to_student?: boolean;
    no_show_when?: string | null;
    is_late_cancelled?: boolean;
    cancellation_penalty_amount?: number | null;
    penalty_resolution?: string | null;
    cancelled_by?: string | null;
    credit_applied_amount?: number | null;
    subjects?: { is_trial?: boolean; name?: string | null } | null;
    student?: {
        full_name: string;
        email?: string;
        phone?: string;
        payer_email?: string;
        payer_phone?: string;
        grade?: string;
    };
}

interface RecentPayment {
    id: string;
    type: 'lesson' | 'package' | 'invoice';
    title: string;
    subtitle: string;
    amount: number;
    paidAt: string;
}

interface TutorUpdateItem {
    id: string;
    message: string;
    tone: 'warning' | 'info';
    when?: string;
    sessionId?: string;
}

export default function DashboardPage() {
    const { t, dateFnsLocale } = useTranslation();
    const { profile } = useUser();
    const { contactVisibility } = useOrgFeatures();
    const [searchParams, setSearchParams] = useSearchParams();
    const dc = getCached<any>('tutor_dashboard');
    const [sessions, setSessions] = useState<Session[]>(dc?.sessions ?? []);
    const [studentCount, setStudentCount] = useState(dc?.studentCount ?? 0);
    const [loading, setLoading] = useState(!dc);
    const [tutorName, setTutorName] = useState(dc?.tutorName ?? '');
    const [showAllOverdue, setShowAllOverdue] = useState(false);
    const [showAllUpcoming, setShowAllUpcoming] = useState(false);
    const [showAllCancelled, setShowAllCancelled] = useState(false);

    const [selectedSession, setSelectedSession] = useState<Session | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [cancelConfirmId, setCancelConfirmId] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const [cancellationReason, setCancellationReason] = useState('');
    const [toastMessage, setToastMessage] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
    const [noShowPickerOpen, setNoShowPickerOpen] = useState(false);
    const [isOnboardingOpen, setIsOnboardingOpen] = useState(false);
    const [currentUserId, setCurrentUserId] = useState('');
    const [isStripeConnected, setIsStripeConnected] = useState(false);
    const [hasSubjects, setHasSubjects] = useState(false);
    const [orgTutorFallback, setOrgTutorFallback] = useState<boolean | null>(null);
    const isOrgTutor: boolean | null = profile ? !!profile.organization_id : orgTutorFallback;
    const [isEditingTime, setIsEditingTime] = useState(false);
    const [editNewStartTime, setEditNewStartTime] = useState('');

    // View comment (same as Calendar – add/edit without full edit)
    const [viewCommentText, setViewCommentText] = useState('');
    const [viewShowToStudent, setViewShowToStudent] = useState(false);
    const [forceTrialCommentVisibility, setForceTrialCommentVisibility] = useState(false);
    const [viewCommentSaving, setViewCommentSaving] = useState(false);
    const [paymentTiming, setPaymentTiming] = useState<'before_lesson' | 'after_lesson'>('before_lesson');
    const [paymentDeadlineHours, setPaymentDeadlineHours] = useState<number | null>(null);
    const [recentPayments, setRecentPayments] = useState<RecentPayment[]>([]);
    const [showAllRecentPayments, setShowAllRecentPayments] = useState(false);
    const [tutorUpdates, setTutorUpdates] = useState<TutorUpdateItem[]>([]);

    // After successful Stripe payment redirect - update subscription, show success; clean URL after 300ms
    useEffect(() => {
        const success = searchParams.get('subscription_success');
        if (success !== '1') return;
        let timeoutId: ReturnType<typeof setTimeout> | null = null;
        const run = async () => {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) return;
            try {
                const res = await fetch('/api/refresh-my-subscription', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
                });
                if (res.ok) setToastMessage({ message: t('dash.subActivated'), type: 'success' });
            } finally {
                timeoutId = setTimeout(() => setSearchParams({}, { replace: true }), 300);
            }
        };
        run();
        return () => { if (timeoutId) clearTimeout(timeoutId); };
    }, [searchParams, setSearchParams]);

    useEffect(() => {
        fetchData();
    }, []);

    useEffect(() => {
        if (!loading && tutorName) {
            setCache('tutor_dashboard', { sessions, studentCount, tutorName });
        }
    }, [loading, sessions, studentCount, tutorName]);

    useEffect(() => {
        let cancelled = false;
        if (!selectedSession) return;
        setViewCommentText(selectedSession.tutor_comment ?? '');
        setViewShowToStudent(selectedSession.show_comment_to_student ?? false);
        setForceTrialCommentVisibility(false);

        (async () => {
            if (!selectedSession.subjects?.is_trial) return;
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;
            const { data: tutorProfile } = await supabase
                .from('profiles')
                .select('organization_id')
                .eq('id', user.id)
                .maybeSingle();
            const orgId = (tutorProfile as any)?.organization_id as string | null | undefined;
            if (!orgId) return;
            const { data: orgRow } = await supabase
                .from('organizations')
                .select('features')
                .eq('id', orgId)
                .maybeSingle();
            const feat = (orgRow as any)?.features;
            const featObj = feat && typeof feat === 'object' && !Array.isArray(feat) ? (feat as Record<string, unknown>) : {};
            const shouldForce = featObj['trial_lesson_comment_mode'] === 'student_and_parent';
            if (!cancelled && shouldForce) {
                setForceTrialCommentVisibility(true);
                setViewShowToStudent(true);
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [selectedSession?.id]);

    const fetchData = async () => {
        if (!getCached('tutor_dashboard')) setLoading(true);
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { setLoading(false); return; }

        // OPTIMIZED: Use UserContext profile to avoid duplicate fetch
        const { data: profileData } = await supabase
            .from('profiles')
            .select('full_name, organization_id, stripe_account_id, payment_timing, payment_deadline_hours')
            .eq('id', user.id)
            .single();
        setTutorName(profileData?.full_name || user.email?.split('@')[0] || 'Korepetitorius');
        setIsStripeConnected(!!profileData?.stripe_account_id);
        setPaymentTiming((profileData?.payment_timing as 'before_lesson' | 'after_lesson') || 'before_lesson');
        setPaymentDeadlineHours(profileData?.payment_deadline_hours ?? null);
        setOrgTutorFallback(!!profileData?.organization_id);

        // OPTIMIZED: Add limit for safety and performance
        const { data: sessionsData } = await supabase
            .from('sessions')
            .select('*, subjects(is_trial, name), student:students(full_name, email, phone, payer_email, payer_phone, grade)')
            .eq('tutor_id', user.id)
            .order('start_time', { ascending: true })
            .limit(500);
        setSessions(sessionsData || []);

        if (profileData?.organization_id) {
            const [recentAvailRes, recentCreatedSessionsRes, orgFeatRes] = await Promise.all([
                supabase
                    .from('availability')
                    .select('id, created_at')
                    .eq('tutor_id', user.id)
                    .eq('created_by_role', 'org_admin')
                    .gte('created_at', subDays(new Date(), 7).toISOString())
                    .order('created_at', { ascending: false })
                    .limit(6),
                supabase
                    .from('sessions')
                    .select('id, created_at, start_time')
                    .eq('tutor_id', user.id)
                    .eq('created_by_role', 'org_admin')
                    .gte('created_at', subDays(new Date(), 7).toISOString())
                    .order('created_at', { ascending: false })
                    .limit(6),
                supabase
                    .from('organizations')
                    .select('features')
                    .eq('id', profileData.organization_id)
                    .maybeSingle(),
            ]);

            const orgFeat = orgFeatRes.data?.features;
            const orgFeatObj = orgFeat && typeof orgFeat === 'object' && !Array.isArray(orgFeat) ? (orgFeat as Record<string, unknown>) : {};
            const trialCommentRequired = orgFeatObj['trial_comment_required'] === true;

            const missingTrialComments = trialCommentRequired
                ? (sessionsData || [])
                    .filter((s: any) => s.status === 'completed' && s.subjects?.is_trial === true && !String(s.tutor_comment || '').trim())
                    .slice(0, 5)
                : [];

            const updates: TutorUpdateItem[] = [
                ...missingTrialComments.map((s: any) => ({
                    id: `missing_comment_${s.id}`,
                    tone: 'warning' as const,
                    message: t('dash.trialCommentMissing', { count: 1 }),
                    when: s.start_time,
                    sessionId: s.id,
                })),
                ...(recentCreatedSessionsRes.data || []).map((s: any) => ({
                    id: `session_created_${s.id}`,
                    tone: 'info' as const,
                    message: t('dash.newSessionCreated'),
                    when: s.created_at || s.start_time,
                    sessionId: s.id as string,
                })),
                ...(recentAvailRes.data || []).map((a: any) => ({
                    id: `availability_created_${a.id}`,
                    tone: 'info' as const,
                    message: t('dash.newSlotAdded'),
                    when: a.created_at,
                })),
            ]
                .sort((a, b) => new Date(b.when || 0).getTime() - new Date(a.when || 0).getTime())
                .slice(0, 8);

            setTutorUpdates(updates);
        } else {
            setTutorUpdates([]);
        }

        // Aggregate latest payments from lesson payments + package payments + monthly invoice payments.
        // For org tutors we skip package/invoice queries entirely to avoid RLS 403 noise.
        try {
            const paidLessonsRes = await supabase
                .from('sessions')
                .select('id, start_time, price, topic, lesson_package_id, student:students(full_name)')
                .eq('tutor_id', user.id)
                .eq('paid', true)
                .is('lesson_package_id', null)
                .is('payment_batch_id', null) // Exclude sessions paid via monthly invoice
                .neq('status', 'cancelled')
                .order('start_time', { ascending: false })
                .limit(20);

            const isOrgTutorProfile = !!profileData?.organization_id;
            const [paidPackagesRes, paidInvoicesRes] = isOrgTutorProfile
                ? [{ data: [], error: null } as any, { data: [], error: null } as any]
                : await Promise.all([
                    supabase
                        .from('lesson_packages')
                        .select('id, paid_at, total_price, total_lessons, students!student_id(full_name), subjects!subject_id(name)')
                        .eq('tutor_id', user.id)
                        .eq('paid', true)
                        .not('paid_at', 'is', null)
                        .order('paid_at', { ascending: false })
                        .limit(20),
                    supabase
                        .from('billing_batches')
                        .select('id, paid_at, total_amount, period_start_date, period_end_date, payer_name')
                        .eq('tutor_id', user.id)
                        .eq('paid', true)
                        .not('paid_at', 'is', null)
                        .order('paid_at', { ascending: false })
                        .limit(20),
                ]);

            // Log any errors but don't block the page
            if (paidLessonsRes.error) console.error('[Dashboard] Error fetching paid lessons:', paidLessonsRes.error);
            if (paidPackagesRes.error) console.error('[Dashboard] Error fetching paid packages:', paidPackagesRes.error);
            if (paidInvoicesRes.error) console.error('[Dashboard] Error fetching billing batches:', paidInvoicesRes.error);

            const lessonPayments: RecentPayment[] = (paidLessonsRes.data || []).map((s: any) => ({
                id: `lesson_${s.id}`,
                type: 'lesson',
                title: s.student?.full_name || 'Mokinys',
                subtitle: `${format(new Date(s.start_time), "d MMM", { locale: dateFnsLocale })}${s.topic ? ` · ${s.topic}` : ''}`,
                amount: Number(s.price || 0),
                paidAt: s.start_time,
            }));

            const packagePayments: RecentPayment[] = (paidPackagesRes.data || []).map((p: any) => ({
                id: `package_${p.id}`,
                type: 'package',
                title: p.students?.full_name || 'Mokinys',
                subtitle: `${p.total_lessons || 0} pam. · ${p.subjects?.name || 'Paketas'}`,
                amount: Number(p.total_price || 0),
                paidAt: p.paid_at,
            }));

            const invoicePayments: RecentPayment[] = (paidInvoicesRes.data || []).map((b: any) => ({
                id: `invoice_${b.id}`,
                type: 'invoice',
                title: b.payer_name || t('dash.payer'),
                subtitle: `${t('dash.invoice')} · ${b.period_start_date} - ${b.period_end_date}`,
                amount: Number(b.total_amount || 0),
                paidAt: b.paid_at,
            }));

            const mergedRecentPayments = [...lessonPayments, ...packagePayments, ...invoicePayments]
                .sort((a, b) => new Date(b.paidAt).getTime() - new Date(a.paidAt).getTime())
                .slice(0, 30);
            setRecentPayments(mergedRecentPayments);
        } catch (err) {
            console.error('[Dashboard] Error fetching payment history:', err);
            setRecentPayments([]);
        }

        // OPTIMIZED: Use 'estimated' count for better performance
        const { count } = await supabase
            .from('students')
            .select('*', { count: 'estimated', head: true })
            .eq('tutor_id', user.id);
        setStudentCount(count || 0);

        setCurrentUserId(user.id);

        // Skip onboarding for org tutors — they are managed by the company
        if (!profileData?.organization_id) {
            // Check if Stripe connected
            const isStripeSetup = !!profileData?.stripe_account_id;

            // OPTIMIZED: Check if has subjects using 'estimated' count
            const { count: subjectsCount } = await supabase
                .from('subjects')
                .select('*', { count: 'estimated', head: true })
                .eq('tutor_id', user.id);
            const hasSubjectsSetup = (subjectsCount || 0) > 0;

            setHasSubjects(hasSubjectsSetup);

            // Show onboarding only until Stripe is connected; after that, no more step modal
            if (!isStripeSetup) {
                setIsOnboardingOpen(true);
            } else {
                setIsOnboardingOpen(false);
            }
        }

        setLoading(false);
    };

    // Refresh recent payments quickly after Stripe webhook updates DB
    const fetchRecentPayments = async () => {
        if (!currentUserId) return;

        try {
            const paidLessonsRes = await supabase
                .from('sessions')
                .select('id, start_time, price, topic, lesson_package_id, student:students(full_name)')
                .eq('tutor_id', currentUserId)
                .eq('paid', true)
                .is('lesson_package_id', null)
                .is('payment_batch_id', null) // Exclude sessions paid via monthly invoice
                .neq('status', 'cancelled')
                .order('start_time', { ascending: false })
                .limit(20);

            const [paidPackagesRes, paidInvoicesRes] = isOrgTutor === true
                ? [{ data: [], error: null } as any, { data: [], error: null } as any]
                : await Promise.all([
                    supabase
                        .from('lesson_packages')
                        .select('id, paid_at, total_price, total_lessons, students!student_id(full_name), subjects!subject_id(name)')
                        .eq('tutor_id', currentUserId)
                        .eq('paid', true)
                        .not('paid_at', 'is', null)
                        .order('paid_at', { ascending: false })
                        .limit(20),
                    supabase
                        .from('billing_batches')
                        .select('id, paid_at, total_amount, period_start_date, period_end_date, payer_name')
                        .eq('tutor_id', currentUserId)
                        .eq('paid', true)
                        .not('paid_at', 'is', null)
                        .order('paid_at', { ascending: false })
                        .limit(20),
                ]);

            if (paidLessonsRes.error) console.error('[Dashboard] Error fetching paid lessons (poll):', paidLessonsRes.error);
            if (paidPackagesRes.error) console.error('[Dashboard] Error fetching paid packages (poll):', paidPackagesRes.error);
            if (paidInvoicesRes.error) console.error('[Dashboard] Error fetching billing batches (poll):', paidInvoicesRes.error);

            const lessonPayments: RecentPayment[] = (paidLessonsRes.data || []).map((s: any) => ({
                id: `lesson_${s.id}`,
                type: 'lesson',
                title: s.student?.full_name || 'Mokinys',
                subtitle: `${format(new Date(s.start_time), "d MMM", { locale: dateFnsLocale })}${s.topic ? ` · ${s.topic}` : ''}`,
                amount: Number(s.price || 0),
                paidAt: s.start_time,
            }));

            const packagePayments: RecentPayment[] = (paidPackagesRes.data || []).map((p: any) => ({
                id: `package_${p.id}`,
                type: 'package',
                title: p.students?.full_name || 'Mokinys',
                subtitle: `${p.total_lessons || 0} pam. · ${p.subjects?.name || 'Paketas'}`,
                amount: Number(p.total_price || 0),
                paidAt: p.paid_at,
            }));

            const invoicePayments: RecentPayment[] = (paidInvoicesRes.data || []).map((b: any) => ({
                id: `invoice_${b.id}`,
                type: 'invoice',
                title: b.payer_name || t('dash.payer'),
                subtitle: `${t('dash.invoice')} · ${b.period_start_date} - ${b.period_end_date}`,
                amount: Number(b.total_amount || 0),
                paidAt: b.paid_at,
            }));

            const mergedRecentPayments = [...lessonPayments, ...packagePayments, ...invoicePayments]
                .sort((a, b) => new Date(b.paidAt).getTime() - new Date(a.paidAt).getTime())
                .slice(0, 30);
            setRecentPayments(mergedRecentPayments);
        } catch (err) {
            console.error('[Dashboard] Error polling payment history:', err);
        }
    };

    useEffect(() => {
        if (!currentUserId) return;
        let attempts = 0;
        const maxAttempts = 8; // ~2 minutes

        const intervalId = setInterval(() => {
            attempts += 1;
            void fetchRecentPayments();
            if (attempts >= maxAttempts) clearInterval(intervalId);
        }, 15000);

        return () => clearInterval(intervalId);
    }, [currentUserId]);

    const syncSessionToGoogleCalendar = async (sessionId: string) => {
        if (!sessionId || !currentUserId) return;
        try {
            await fetch('/api/google-calendar-sync', {
                method: 'POST',
                headers: await authHeaders(),
                body: JSON.stringify({ userId: currentUserId, sessionId }),
            });
        } catch (err) {
            console.error('Google Calendar sync after session update failed:', err);
        }
    };

    const handleMarkPaid = async () => {
        if (!selectedSession || isOrgTutor === true) return;
        setSaving(true);
        const newPaid = true; // tutor manual confirm = true
        const newStatus = 'confirmed';
        const { error } = await supabase.from('sessions').update({ paid: newPaid, payment_status: newStatus }).eq('id', selectedSession.id);
        if (!error) {
            setSelectedSession({ ...selectedSession, paid: newPaid, payment_status: newStatus });
            syncSessionToGoogleCalendar(selectedSession.id);
            setTimeout(() => {
                setIsModalOpen(false);
                fetchData();
            }, 600); // Give user time to see the green success state change
        }
        setSaving(false);
    };

    const handleRejectPayment = async () => {
        if (!selectedSession || isOrgTutor === true) return;
        setSaving(true);
        // revert to pending
        const { error } = await supabase.from('sessions').update({ paid: false, payment_status: 'pending' }).eq('id', selectedSession.id);

        if (!error) {
            // Send email to student
            const studentEmail = await supabase.from('students').select('email').eq('id', selectedSession.student_id).single();
            if (studentEmail?.data?.email && selectedSession.student) {
                await sendEmail({
                    type: 'payment_rejection_reminder',
                    to: studentEmail.data.email,
                    data: {
                        studentName: selectedSession.student.full_name,
                        tutorName: tutorName,
                        date: format(new Date(selectedSession.start_time), 'yyyy-MM-dd'),
                        time: format(new Date(selectedSession.start_time), 'HH:mm')
                    }
                });
                setToastMessage({ message: t('dash.reminderSent'), type: 'success' });
            }
            setIsModalOpen(false);
            fetchData();
            syncSessionToGoogleCalendar(selectedSession.id);
        } else {
            setToastMessage({ message: t('dash.rejectError'), type: 'error' });
        }
        setSaving(false);
    };

    const handleCancelSession = async () => {
        if (!selectedSession) return;

        if (cancelConfirmId !== selectedSession.id) {
            setCancelConfirmId(selectedSession.id);
            setCancellationReason('');
            return;
        }

        if (cancellationReason.trim().length < 5) return;

        setSaving(true);
        const { data: { user } } = await supabase.auth.getUser();
        const { data: studentData } = await supabase.from('students').select('email').eq('id', selectedSession.student_id || '').single();
        const studentName = selectedSession.student?.full_name || '';

        const { success } = await cancelSessionAndFillWaitlist({
            sessionId: selectedSession.id,
            tutorId: user?.id || '',
            reason: cancellationReason.trim(),
            cancelledBy: 'tutor',
            studentName,
            tutorName,
            studentEmail: studentData?.email || null,
            tutorEmail: user?.email || null,
        });

        if (success) {
            setIsModalOpen(false);
            setCancelConfirmId(null);
            setCancellationReason('');
            fetchData();
            if (selectedSession.paid) {
                setToastMessage({ message: t('dash.cancelledRefund'), type: 'success' });
            }
            // Full sync so Google Calendar removes session and recreates free time
            if (currentUserId) {
                try {
                    await fetch('/api/google-calendar-sync', {
                        method: 'POST',
                        headers: await authHeaders(),
                        body: JSON.stringify({ userId: currentUserId }),
                    });
                } catch (err) {
                    console.error('Failed to full-sync Google Calendar after cancellation:', err);
                }
            }
        } else {
            setToastMessage({ message: t('dash.cancelFailed'), type: 'error' });
        }
        setSaving(false);
    };

    const handleReschedule = async () => {
        if (!selectedSession || !editNewStartTime) return;
        setSaving(true);
        try {
            const oldStart = new Date(selectedSession.start_time);
            const oldEnd = new Date(selectedSession.end_time);
            const durMs = oldEnd.getTime() - oldStart.getTime();

            const newStart = new Date(editNewStartTime);
            const newEnd = new Date(newStart.getTime() + durMs);

            // Fetch to check overlaps (excluding current session)
            const { data: overlapping } = await supabase
                .from('sessions')
                .select('*')
                .eq('tutor_id', currentUserId)
                .neq('status', 'cancelled')
                .neq('id', selectedSession.id)
                .or(`start_time.lte.${newEnd.toISOString()},end_time.gte.${newStart.toISOString()}`);

            // Filter precisely in JS
            const hasRealOverlap = overlapping?.some(o => {
                const os = new Date(o.start_time).getTime();
                const oe = new Date(o.end_time).getTime();
                const ns = newStart.getTime();
                const ne = newEnd.getTime();
                return (ns >= os && ns < oe) || (ne > os && ne <= oe) || (ns <= os && ne >= oe);
            });

            if (hasRealOverlap) {
                alert(t('dash.overlapError'));
                setSaving(false);
                return;
            }
            const { error } = await supabase.from('sessions').update({
                start_time: newStart.toISOString(),
                end_time: newEnd.toISOString()
            }).eq('id', selectedSession.id);

            if (!error) {
                // Notify only student about lesson reschedule
                const { data: studentData } = await supabase.from('students').select('email').eq('id', selectedSession.student_id).single();

                if (studentData?.email) {
                    await sendEmail({
                        type: 'lesson_rescheduled',
                        to: studentData.email,
                        data: {
                            studentName: selectedSession.student?.full_name || '',
                            tutorName,
                            oldDate: format(oldStart, 'yyyy-MM-dd'),
                            oldTime: format(oldStart, 'HH:mm'),
                            newDate: format(newStart, 'yyyy-MM-dd'),
                            newTime: format(newStart, 'HH:mm'),
                            rescheduledBy: 'tutor',
                            recipientRole: 'student',
                        }
                    });
                }

                syncSessionToGoogleCalendar(selectedSession.id);

                setIsEditingTime(false);
                setToastMessage({ message: t('dash.rescheduleSuccess'), type: 'success' });
                fetchData();
                setIsModalOpen(false);
            } else {
                alert('Nepavyko pakeisti pamokos laiko: ' + error.message);
            }
        } catch (err) {
            console.error(err);
        }
        setSaving(false);
    };

    const handleMarkCompleted = async () => {
        if (!selectedSession) return;
        setSaving(true);
        const { error } = await supabase.from('sessions').update({ status: 'completed', no_show_when: null }).eq('id', selectedSession.id);
        if (!error) {
            setIsModalOpen(false);
            fetchData();
            syncSessionToGoogleCalendar(selectedSession.id);
        }
        setSaving(false);
    };

    const confirmMarkStudentNoShowDashboard = async (when: NoShowWhen) => {
        if (!selectedSession) return;
        setSaving(true);
        const patch = buildNoShowSessionPatch(when, selectedSession.tutor_comment);
        const { error } = await supabase.from('sessions').update(patch).eq('id', selectedSession.id);
        if (!error) {
            setNoShowPickerOpen(false);
            setIsModalOpen(false);
            fetchData();
            syncSessionToGoogleCalendar(selectedSession.id);
            void fetch('/api/notify-session-no-show', {
                method: 'POST',
                headers: await authHeaders(),
                body: JSON.stringify({ sessionId: selectedSession.id }),
            }).catch(() => {});
        }
        setSaving(false);
    };

    const handleRevertLessonToPlannedDashboard = async () => {
        if (!selectedSession) return;
        setSaving(true);
        const { error } = await supabase
            .from('sessions')
            .update({ status: 'active', no_show_when: null })
            .eq('id', selectedSession.id);
        if (!error) {
            const updated = { ...selectedSession, status: 'active', no_show_when: null };
            setSessions((prev) => prev.map((s) => (s.id === selectedSession.id ? { ...s, ...updated } : s)));
            setSelectedSession(updated);
            fetchData();
            syncSessionToGoogleCalendar(selectedSession.id);
        }
        setSaving(false);
    };

    const handleConfirmPayment = async () => {
        if (!selectedSession || isOrgTutor === true) return;
        setSaving(true);
        const { error } = await supabase.from('sessions').update({
            paid: true,
            payment_status: 'paid'
        }).eq('id', selectedSession.id);

        if (!error) {
            setToastMessage({ message: t('dash.paymentConfirmed'), type: 'success' });
            setIsModalOpen(false);
            fetchData();
        } else {
            alert(t('dash.paymentConfirmFailed') + error.message);
        }
        setSaving(false);
    };

    const handleSaveViewComment = async () => {
        if (!selectedSession) return;
        setViewCommentSaving(true);
        const { data: { user } } = await supabase.auth.getUser();
        const { data: tutorProfile } = await supabase.from('profiles').select('full_name, organization_id').eq('id', user?.id).single();
        const effectiveShowToStudent = forceTrialCommentVisibility ? true : viewShowToStudent;
        const { error } = await supabase
            .from('sessions')
            .update({
                tutor_comment: viewCommentText.trim() || null,
                show_comment_to_student: effectiveShowToStudent,
            })
            .eq('id', selectedSession.id);
        if (!error) {
            const updated = { ...selectedSession, tutor_comment: viewCommentText.trim() || null, show_comment_to_student: effectiveShowToStudent };
            setSessions((prev) => prev.map((s) => (s.id === selectedSession.id ? { ...s, ...updated } : s)));
            setSelectedSession(updated);
            if ((viewCommentText || '').trim().length > 0) {
                setTutorUpdates((prev) => prev.filter((u) => u.id !== `missing_comment_${selectedSession.id}`));
            }
            if (effectiveShowToStudent && viewCommentText.trim()) {
                const alreadySent = selectedSession.show_comment_to_student && selectedSession.tutor_comment === viewCommentText.trim();
                if (!alreadySent) {
                    let studentEmail = selectedSession.student?.email;
                    let payerEmail: string | null = null;
                    if (!studentEmail && selectedSession.student_id) {
                        const { data: studentRow } = await supabase.from('students').select('email, payer_email, full_name').eq('id', selectedSession.student_id).single();
                        studentEmail = studentRow?.email;
                        payerEmail = (studentRow?.payer_email || null) as any;
                    } else if (selectedSession.student_id) {
                        const { data: studentRow } = await supabase.from('students').select('payer_email').eq('id', selectedSession.student_id).single();
                        payerEmail = (studentRow?.payer_email || null) as any;
                    }
                    if (studentEmail) {
                        let to: string | string[] = studentEmail;
                        try {
                            const orgId = (tutorProfile as any)?.organization_id as string | null | undefined;
                            const subjectId = (selectedSession as any)?.subject_id as string | null | undefined;
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
                                studentName: updated.student?.full_name || selectedSession.student?.full_name || '',
                                tutorName: tutorProfile?.full_name || '',
                                date: format(new Date(selectedSession.start_time), 'yyyy-MM-dd'),
                                time: format(new Date(selectedSession.start_time), 'HH:mm'),
                                comment: viewCommentText.trim(),
                            },
                        }).catch((err) => { console.error('Error sending comment email:', err); return false; });
                        if (!ok) alert(t('dash.commentSavedNoEmail'));
                    } else {
                        alert(t('dash.commentSavedNoStudentEmail'));
                    }
                }
            }
        }
        setViewCommentSaving(false);
    };

    const openUpdateSessionModal = async (sessionId: string | undefined) => {
        if (!sessionId) return;
        const existing = sessions.find((s) => s.id === sessionId);
        if (existing) {
            setSelectedSession(existing);
            setIsModalOpen(true);
            return;
        }
        const { data, error } = await supabase
            .from('sessions')
            .select('*, subjects(is_trial, name), student:students(full_name, email, phone, payer_email, payer_phone, grade)')
            .eq('id', sessionId)
            .maybeSingle();
        if (error || !data) {
            setToastMessage({ message: t('dash.updateOpenSessionFailed'), type: 'error' });
            return;
        }
        const row = data as Session;
        setSessions((prev) => (prev.some((s) => s.id === row.id) ? prev : [...prev, row]));
        setSelectedSession(row);
        setIsModalOpen(true);
    };

    const now = new Date();
    const next7days = addDays(now, 7);
    const past30days = subDays(now, 30);

    // Upcoming active (7d): for org tutor - including unpaid; for individual - only paid
    const upcomingSessionsAll = sessions
        .filter((s) => {
            const inWindow =
                s.status === 'active' &&
                isAfter(new Date(s.end_time), now) &&
                isBefore(new Date(s.start_time), next7days);
            if (!inWindow) return false;
            if (isOrgTutor === true) return true;
            return s.paid;
        })
        .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());
    const upcomingSessions = showAllUpcoming ? upcomingSessionsAll : upcomingSessionsAll.slice(0, 5);

    // Today's sessions
    const todaySessions = sessions.filter((s) => {
        const d = new Date(s.start_time);
        return s.status === 'active' && d.toDateString() === now.toDateString();
    });

    // Needs attention: sessions where payment deadline is approaching (within 6h) or passed and still unpaid
    const nowMs = now.getTime();
    const attentionWindowMs = 6 * 3600000; // 6 val. langas
    const overduePayments = sessions
        .filter((s) => {
            if (s.paid || s.status === 'cancelled') return false;
            const start = new Date(s.start_time);
            const end = new Date(s.end_time);
            // Bazinis deadline pagal nustatymus
            const deadlineBaseHours = paymentDeadlineHours ?? 24;
            const deadline =
                paymentTiming === 'before_lesson'
                    ? new Date(start.getTime() - deadlineBaseHours * 3600000)
                    : new Date(end.getTime() + deadlineBaseHours * 3600000);
            const deadlineMs = deadline.getTime();
            const isOverdue = deadlineMs <= nowMs;
            const isSoon = deadlineMs > nowMs && (deadlineMs - nowMs) <= attentionWindowMs;
            const isRecent = isAfter(start, past30days);
            // Always include if student marked as paid but not yet confirmed
            const pendingConfirm = s.payment_status === 'paid_by_student';
            return isRecent && (isOverdue || isSoon || pendingConfirm);
        })
        .sort((a, b) => {
            // Always show on top those with payment_status === 'paid_by_student'
            if (a.payment_status === 'paid_by_student' && b.payment_status !== 'paid_by_student') return -1;
            if (b.payment_status === 'paid_by_student' && a.payment_status !== 'paid_by_student') return 1;
            return new Date(a.start_time).getTime() - new Date(b.start_time).getTime();
        });

    const displayedOverdue = showAllOverdue ? overduePayments : overduePayments.slice(0, 5);
    const displayedRecentPayments = showAllRecentPayments ? recentPayments : recentPayments.slice(0, 5);

    const cancelledSessionsAll = sessions
        .filter((s) => {
            if (s.status !== 'cancelled') return false;
            if (isOrgTutor === true) return true;
            return s.paid;
        })
        .sort((a, b) => new Date(b.start_time).getTime() - new Date(a.start_time).getTime());
    const cancelledSessions = showAllCancelled ? cancelledSessionsAll : cancelledSessionsAll.slice(0, 5);

    // Total stats
    const totalRevenue = sessions.filter((s) => s.paid && s.status !== 'cancelled').reduce((sum, s) => sum + (s.price || 0), 0);
    const pendingRevenue = overduePayments.reduce((sum, s) => sum + (s.price || 0), 0);
    const thisMonthRevenue = sessions
        .filter((s) => s.paid && s.status !== 'cancelled' && isAfter(new Date(s.start_time), past30days))
        .reduce((sum, s) => sum + (s.price || 0), 0);

    const getHour = () => {
        const h = now.getHours();
        if (h < 12) return t('dash.greetMorning');
        if (h < 17) return t('dash.greetAfternoon');
        return t('dash.greetEvening');
    };

    return (
        <Layout>
            {toastMessage && (
                <Toast
                    message={toastMessage.message}
                    type={toastMessage.type}
                    onClose={() => setToastMessage(null)}
                />
            )}
            {isOrgTutor === null ? (
                <div className="max-w-5xl mx-auto flex justify-center py-16">
                    <div className="w-8 h-8 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
                </div>
            ) : (
            <div className="max-w-5xl mx-auto space-y-6 animate-fade-in">
                {/* Greeting – centered */}
                <div className="mb-2 text-center">
                    <h1 className="text-2xl font-bold text-gray-900">
                        {getHour()}, {tutorName.split(' ')[0]} 👋
                    </h1>
                    <p className="text-gray-500 text-sm mt-1">
                        {format(now, "EEEE, d MMMM yyyy", { locale: dateFnsLocale })}
                        {todaySessions.length > 0 && (
                            <span className="ml-2 text-indigo-600 font-medium">
                                {t('dash.todayLessons', { count: String(todaySessions.length) })}
                            </span>
                        )}
                    </p>
                </div>

                {/* Top stats – centered when few cards (e.g. org_tutor) */}
                <div className={cn(
                  'grid gap-4',
                  isOrgTutor === true ? 'grid-cols-2 max-w-md mx-auto' : 'grid-cols-2 md:grid-cols-4'
                )}>
                    <div className="stat-card">
                        <div className="flex items-center justify-between mb-3">
                            <div className="w-9 h-9 rounded-xl bg-indigo-100 flex items-center justify-center">
                                <Users className="w-4.5 h-4.5 text-indigo-600" />
                            </div>
                            <span className="text-xs text-gray-400 font-medium">{t('dash.total')}</span>
                        </div>
                        <p className="text-2xl font-bold text-gray-900">{studentCount}</p>
                        <p className="text-xs text-gray-500 mt-1">{t('nav.students')}</p>
                    </div>

                    {isOrgTutor === false && (
                      <>
                        <div className="stat-card">
                            <div className="flex items-center justify-between mb-3">
                                <div className="w-9 h-9 rounded-xl bg-emerald-100 flex items-center justify-center">
                                    <TrendingUp className="w-4.5 h-4.5 text-emerald-600" />
                                </div>
                                <span className="text-xs text-gray-400 font-medium">30 d.</span>
                            </div>
                            <p className="text-2xl font-bold text-gray-900">€{thisMonthRevenue.toFixed(0)}</p>
                            <p className="text-xs text-gray-500 mt-1">{t('dash.revenue')}</p>
                        </div>

                        <div className="stat-card">
                            <div className="flex items-center justify-between mb-3">
                                <div className="w-9 h-9 rounded-xl bg-amber-100 flex items-center justify-center">
                                    <AlertCircle className="w-4.5 h-4.5 text-amber-600" />
                                </div>
                                <span className="text-xs text-gray-400 font-medium">{t('dash.pending')}</span>
                            </div>
                            <p className="text-2xl font-bold text-gray-900">€{pendingRevenue.toFixed(0)}</p>
                            <p className="text-xs text-gray-500 mt-1">{t('dash.unpaid')}</p>
                        </div>
                      </>
                    )}

                    <div className="stat-card">
                        <div className="flex items-center justify-between mb-3">
                            <div className="w-9 h-9 rounded-xl bg-blue-100 flex items-center justify-center">
                                <CalendarDays className="w-4.5 h-4.5 text-blue-600" />
                            </div>
                            <span className="text-xs text-gray-400 font-medium">7 d.</span>
                        </div>
                        <p className="text-2xl font-bold text-gray-900">{upcomingSessionsAll.length}</p>
                        <p className="text-xs text-gray-500 mt-1">{t('dash.upcomingLessons')}</p>
                    </div>
                </div>

                <div className={cn('grid grid-cols-1 gap-6', isOrgTutor === true ? '' : 'md:grid-cols-2')}>
                    {/* Sessions: org tutor — separate upcoming + cancelled (no € / penalty resolution); others — tabs */}
                    {isOrgTutor === true ? (
                      <>
                        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
                          <div className="flex items-center justify-between mb-4">
                            <h2 className="text-lg font-bold text-gray-900">{t('dash.activeTab')}</h2>
                            <Link to="/calendar" className="text-xs text-indigo-600 hover:underline flex items-center gap-1">
                              {t('dash.viewAll')} <ChevronRight className="w-3 h-3" />
                            </Link>
                          </div>
                          {loading ? (
                            <div className="space-y-3">
                              {[1, 2, 3].map(i => <div key={i} className="h-14 bg-gray-100 rounded-xl animate-pulse" />)}
                            </div>
                          ) : upcomingSessions.length === 0 ? (
                            <div className="text-center py-8 text-gray-400">
                              <CalendarDays className="w-8 h-8 mx-auto mb-2 opacity-30" />
                              <p className="text-sm">{t('dash.noLessonsThisWeek')}</p>
                            </div>
                          ) : (
                            <div className="space-y-2">
                              {upcomingSessions.map((s, idx) => {
                                const start = new Date(s.start_time);
                                const isToday = start.toDateString() === now.toDateString();
                                return (
                                  <div key={s.id} onClick={() => { setSelectedSession(s); setIsModalOpen(true); }} className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer hover:shadow-md transition-all ${isToday ? 'bg-indigo-50 border border-indigo-100' : 'bg-gray-50 border border-transparent'} ${idx === 0 ? 'ring-2 ring-indigo-200/80' : ''}`}>
                                    <div className={`w-1 h-10 rounded-full flex-shrink-0 ${isToday ? 'bg-indigo-500' : 'bg-gray-300'}`} />
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-2 flex-wrap">
                                        <p className="text-sm font-semibold text-gray-900 truncate">
                                          {s.student?.full_name}
                                        </p>
                                        {s.subjects?.is_trial && (
                                          <span className="text-[10px] font-semibold uppercase tracking-wide text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded">
                                            {t('dash.trialBadge')}
                                          </span>
                                        )}
                                        {idx === 0 && (
                                          <span className="text-[10px] font-semibold uppercase tracking-wide text-indigo-600 bg-indigo-100 px-1.5 py-0.5 rounded">{t('dash.nearest')}</span>
                                        )}
                                      </div>
                                      <div className="text-xs text-gray-500 mt-0.5 flex items-center gap-2 flex-wrap">
                                        <span>
                                          {isToday ? `${t('stuSched.today')}, ${format(start, 'HH:mm')}` : format(start, 'EEE d MMM, HH:mm', { locale: dateFnsLocale })}
                                          {s.topic && <span className="ml-1">· {s.topic}</span>}
                                        </span>
                                        <div className="scale-90 origin-left"><StatusBadge status={s.status} paymentStatus={s.payment_status} paid={s.paid} isTrial={s.subjects?.is_trial === true} orgTutorCopy={isOrgTutor === true} hidePaymentStatus={isOrgTutor === true} endTime={s.end_time} /></div>
                                      </div>
                                    </div>
                                    {isOrgTutor !== true && s.price && <span className="text-sm font-semibold text-gray-700 flex-shrink-0">€{s.price}</span>}
                                  </div>
                                );
                              })}
                              {upcomingSessionsAll.length > 5 && (
                                <button
                                  onClick={() => setShowAllUpcoming(v => !v)}
                                  className="w-full text-center text-sm text-indigo-600 font-medium py-2 hover:bg-gray-50 rounded-xl transition-colors"
                                >
                                  {showAllUpcoming ? t('dash.showLess') : t('dash.showMore', { count: String(upcomingSessionsAll.length) })}
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
                          <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-2">
                              <XCircle className="w-5 h-5 text-red-500" />
                              <h2 className="text-lg font-bold text-gray-900">{t('dash.cancelledLessons')}</h2>
                            </div>
                          </div>
                          {loading ? (
                            <div className="space-y-3">
                              {[1, 2].map(i => <div key={i} className="h-14 bg-gray-100 rounded-xl animate-pulse" />)}
                            </div>
                          ) : cancelledSessions.length === 0 ? (
                            <div className="text-center py-8 text-gray-400">
                              <CheckCircle className="w-8 h-8 mx-auto mb-2 opacity-30 text-green-400" />
                              <p className="text-sm">{t('dash.noCancelledLessons')}</p>
                            </div>
                          ) : (
                            <div className="space-y-2">
                              {cancelledSessions.map((s) => {
                                const start = new Date(s.start_time);
                                return (
                                  <div key={s.id} onClick={() => { setSelectedSession(s); setIsModalOpen(true); }} className="flex flex-col gap-2 p-3 rounded-xl cursor-pointer border border-red-100 hover:shadow-md transition-all bg-red-50/50">
                                    <div className="flex items-center justify-between">
                                      <p className="text-sm font-semibold text-gray-900 truncate">{s.student?.full_name}</p>
                                      <div className="scale-90 origin-right"><StatusBadge status={s.status} paymentStatus={s.payment_status} paid={s.paid} isTrial={s.subjects?.is_trial === true} orgTutorCopy={isOrgTutor === true} hidePaymentStatus={isOrgTutor === true} endTime={s.end_time} /></div>
                                    </div>
                                    <p className="text-xs text-gray-500">
                                      {format(start, "EEE d MMM yyyy, HH:mm", { locale: dateFnsLocale })}
                                      {s.topic && <span className="ml-1">· {s.topic}</span>}
                                    </p>
                                    {s.cancellation_reason && (
                                      <div className="mt-1 p-2 rounded-lg bg-red-50 text-red-800 text-xs border border-red-100">
                                        <span className="font-semibold block mb-1">{t('dash.reason')}</span>
                                        {s.cancellation_reason}
                                      </div>
                                    )}
                                    {s.is_late_cancelled && (
                                      <div className="mt-1 flex items-center gap-2 flex-wrap">
                                        <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700 border border-red-200">
                                          {t('dash.lateCancelBadge')}
                                        </span>
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                              {cancelledSessionsAll.length > 5 && (
                                <button
                                  onClick={() => setShowAllCancelled(v => !v)}
                                  className="w-full text-center text-sm text-indigo-600 font-medium py-2 hover:bg-gray-50 rounded-xl transition-colors"
                                >
                                  {showAllCancelled ? t('dash.showLess') : t('dash.showMore', { count: String(cancelledSessionsAll.length) })}
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
                          <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-2">
                              <AlertCircle className="w-5 h-5 text-indigo-500" />
                              <h2 className="text-lg font-bold text-gray-900">{t('dash.updates')}</h2>
                            </div>
                            <span className="text-xs font-medium bg-indigo-100 text-indigo-700 px-2 py-1 rounded-md">
                              {tutorUpdates.length}
                            </span>
                          </div>
                          {tutorUpdates.length === 0 ? (
                            <p className="text-sm text-gray-400 text-center py-8">{t('dash.noUpdates')}</p>
                          ) : (
                            <div className="space-y-2">
                              {tutorUpdates.map((u) => (
                                <div
                                  key={u.id}
                                  role={u.sessionId ? 'button' : undefined}
                                  tabIndex={u.sessionId ? 0 : undefined}
                                  onClick={u.sessionId ? () => void openUpdateSessionModal(u.sessionId) : undefined}
                                  onKeyDown={
                                    u.sessionId
                                      ? (e) => {
                                            if (e.key === 'Enter' || e.key === ' ') {
                                              e.preventDefault();
                                              void openUpdateSessionModal(u.sessionId);
                                            }
                                          }
                                      : undefined
                                  }
                                  className={cn(
                                    'p-3 rounded-xl border',
                                    u.sessionId ? 'cursor-pointer hover:shadow-sm transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300' : '',
                                    u.tone === 'warning' ? 'bg-amber-50 border-amber-200' : 'bg-indigo-50 border-indigo-100'
                                  )}
                                >
                                  <p className="text-sm font-medium text-gray-900">{u.message}</p>
                                  {u.when && (
                                    <p className="text-xs text-gray-500 mt-1">
                                      {format(new Date(u.when), "d MMM yyyy, HH:mm", { locale: dateFnsLocale })}
                                    </p>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </>
                    ) : (
                    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
                        <Tabs defaultValue="upcoming" className="w-full">
                            <div className="flex items-center justify-between mb-4">
                                <TabsList className="bg-gray-100/80 p-1">
                                    <TabsTrigger value="upcoming" className="text-sm">{t('dash.activeTab')}</TabsTrigger>
                                    <TabsTrigger value="cancelled" className="text-sm">{t('dash.cancelledTab')}</TabsTrigger>
                                </TabsList>
                                <Link to="/calendar" className="text-xs text-indigo-600 hover:underline flex items-center gap-1">
                                    {t('dash.viewAll')} <ChevronRight className="w-3 h-3" />
                                </Link>
                            </div>

                            <TabsContent value="upcoming" className="m-0 focus-visible:outline-none focus-visible:ring-0">
                                {loading ? (
                                    <div className="space-y-3">
                                        {[1, 2, 3].map(i => <div key={i} className="h-14 bg-gray-100 rounded-xl animate-pulse" />)}
                                    </div>
                                ) : upcomingSessions.length === 0 ? (
                                    <div className="text-center py-8 text-gray-400">
                                        <CalendarDays className="w-8 h-8 mx-auto mb-2 opacity-30" />
                                        <p className="text-sm">{t('dash.noLessonsThisWeek')}</p>
                                    </div>
                                ) : (
                                    <div className="space-y-2">
                                        {upcomingSessions.map((s) => {
                                            const start = new Date(s.start_time);
                                            const isToday = start.toDateString() === now.toDateString();
                                            return (
                                                <div key={s.id} onClick={() => { setSelectedSession(s); setIsModalOpen(true); }} className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer hover:shadow-md transition-all ${isToday ? 'bg-indigo-50 border border-indigo-100' : 'bg-gray-50 border border-transparent'}`}>
                                                    <div className={`w-1 h-10 rounded-full flex-shrink-0 ${isToday ? 'bg-indigo-500' : 'bg-gray-300'}`} />
                                                    <div className="flex-1 min-w-0">
                                                        <p className="text-sm font-semibold text-gray-900 truncate">
                                                            {s.student?.full_name}
                                                        </p>
                                                        <div className="text-xs text-gray-500 mt-0.5 flex items-center gap-2">
                                                            <span>
                                                                {isToday ? `${t('stuSched.today')}, ${format(start, 'HH:mm')}` : format(start, 'EEE d MMM, HH:mm', { locale: dateFnsLocale })}
                                                                {s.topic && <span className="ml-1">· {s.topic}</span>}
                                                            </span>
                                                            <div className="scale-90 origin-left"><StatusBadge status={s.status} paymentStatus={s.payment_status} paid={s.paid} endTime={s.end_time} /></div>
                                                        </div>
                                                    </div>
                                                    {s.price && <span className="text-sm font-semibold text-gray-700 flex-shrink-0">€{s.price}</span>}
                                                </div>
                                            );
                                        })}
                                        {upcomingSessionsAll.length > 5 && (
                                            <button
                                                onClick={() => setShowAllUpcoming(v => !v)}
                                                className="w-full text-center text-sm text-indigo-600 font-medium py-2 hover:bg-gray-50 rounded-xl transition-colors"
                                            >
                                                {showAllUpcoming ? t('dash.showLess') : t('dash.showMore', { count: String(upcomingSessionsAll.length) })}
                                            </button>
                                        )}
                                    </div>
                                )}
                            </TabsContent>

                            <TabsContent value="cancelled" className="m-0 focus-visible:outline-none focus-visible:ring-0">
                                {loading ? (
                                    <div className="space-y-3">
                                        {[1, 2].map(i => <div key={i} className="h-14 bg-gray-100 rounded-xl animate-pulse" />)}
                                    </div>
                                ) : cancelledSessions.length === 0 ? (
                                    <div className="text-center py-8 text-gray-400">
                                        <CheckCircle className="w-8 h-8 mx-auto mb-2 opacity-30 text-green-400" />
                                        <p className="text-sm">{t('dash.noCancelledLessons')}</p>
                                    </div>
                                ) : (
                                    <div className="space-y-2">
                                        {cancelledSessions.map((s) => {
                                            const start = new Date(s.start_time);
                                            return (
                                                <div key={s.id} onClick={() => { setSelectedSession(s); setIsModalOpen(true); }} className="flex flex-col gap-2 p-3 rounded-xl cursor-pointer border border-red-100 hover:shadow-md transition-all bg-red-50/50">
                                                    <div className="flex items-center justify-between">
                                                        <p className="text-sm font-semibold text-gray-900 truncate">{s.student?.full_name}</p>
                                                        <div className="scale-90 origin-right"><StatusBadge status={s.status} paymentStatus={s.payment_status} paid={s.paid} endTime={s.end_time} /></div>
                                                    </div>
                                                    <p className="text-xs text-gray-500">
                                                        {format(start, "EEE d MMM yyyy, HH:mm", { locale: dateFnsLocale })}
                                                        {s.topic && <span className="ml-1">· {s.topic}</span>}
                                                    </p>
                                                    {s.cancellation_reason && (
                                                        <div className="mt-1 p-2 rounded-lg bg-red-50 text-red-800 text-xs border border-red-100">
                                                            <span className="font-semibold block mb-1">{t('dash.reason')}</span>
                                                            {s.cancellation_reason}
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                        {cancelledSessionsAll.length > 5 && (
                                            <button
                                                onClick={() => setShowAllCancelled(v => !v)}
                                                className="w-full text-center text-sm text-indigo-600 font-medium py-2 hover:bg-gray-50 rounded-xl transition-colors"
                                            >
                                                {showAllCancelled ? t('dash.showLess') : t('dash.showMore', { count: String(cancelledSessionsAll.length) })}
                                            </button>
                                        )}
                                    </div>
                                )}
                            </TabsContent>
                        </Tabs>
                    </div>
                    )}

                    {/* Needs attention - for non-org tutors */}
                    {isOrgTutor !== true && (
                    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 flex flex-col h-full">
                        <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-2">
                                <AlertCircle className="w-5 h-5 text-amber-500" />
                                <h2 className="text-lg font-bold text-gray-900">{t('dash.needsAttention')}</h2>
                            </div>
                            {(() => {
                                const setupIncomplete = isOrgTutor === false && (!isStripeConnected || !hasSubjects);
                                const setupCount = setupIncomplete ? (!isStripeConnected ? 1 : 0) + (!hasSubjects ? 1 : 0) : 0;
                                const attentionCount = overduePayments.length + setupCount;
                                return (
                                    <span className="text-xs font-medium bg-amber-100 text-amber-700 px-2 py-1 rounded-md">
                                        {attentionCount} laukia
                                    </span>
                                );
                            })()}
                        </div>

                        {loading ? (
                            <div className="space-y-3">
                                {[1, 2, 3].map(i => <div key={i} className="h-16 bg-gray-100 rounded-xl animate-pulse" />)}
                            </div>
                        ) : isOrgTutor === false && !isStripeConnected && !hasSubjects ? (
                            <div className="flex-1 flex flex-col gap-3 py-4">
                                <p className="text-sm font-medium text-gray-700">{t('dash.beforeSchedule')}</p>
                                <Link to="/finance" className="flex items-center gap-3 p-3 rounded-xl border border-amber-200 bg-amber-50 hover:bg-amber-100 transition-colors group">
                                    <div className="w-10 h-10 rounded-full bg-amber-100 group-hover:bg-amber-200 flex items-center justify-center flex-shrink-0">
                                        <CreditCard className="w-5 h-5 text-amber-600" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-semibold text-gray-900">{t('dash.connectStripe')}</p>
                                        <p className="text-xs text-gray-500">{t('dash.stripeRequired')}</p>
                                    </div>
                                    <ChevronRight className="w-4 h-4 text-amber-600 flex-shrink-0" />
                                </Link>
                                <Link to="/lesson-settings" className="flex items-center gap-3 p-3 rounded-xl border border-amber-200 bg-amber-50 hover:bg-amber-100 transition-colors group">
                                    <div className="w-10 h-10 rounded-full bg-amber-100 group-hover:bg-amber-200 flex items-center justify-center flex-shrink-0">
                                        <CalendarDays className="w-5 h-5 text-amber-600" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-semibold text-gray-900">{t('dash.addSubjects')}</p>
                                        <p className="text-xs text-gray-500">{t('dash.subjectsDesc')}</p>
                                    </div>
                                    <ChevronRight className="w-4 h-4 text-amber-600 flex-shrink-0" />
                                </Link>
                            </div>
                        ) : isOrgTutor === false && !isStripeConnected ? (
                            <div className="flex-1 flex flex-col gap-3 py-4">
                                <p className="text-sm font-medium text-gray-700">{t('dash.connectStripeSchedule')}</p>
                                <Link to="/finance" className="flex items-center gap-3 p-3 rounded-xl border border-amber-200 bg-amber-50 hover:bg-amber-100 transition-colors group">
                                    <div className="w-10 h-10 rounded-full bg-amber-100 group-hover:bg-amber-200 flex items-center justify-center flex-shrink-0">
                                        <CreditCard className="w-5 h-5 text-amber-600" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-semibold text-gray-900">{t('dash.connectStripe')}</p>
                                    </div>
                                    <ChevronRight className="w-4 h-4 text-amber-600 flex-shrink-0" />
                                </Link>
                            </div>
                        ) : isOrgTutor === false && !hasSubjects ? (
                            <div className="flex-1 flex flex-col gap-3 py-4">
                                <p className="text-sm font-medium text-gray-700">{t('dash.addSubjectsSchedule')}</p>
                                <Link to="/lesson-settings" className="flex items-center gap-3 p-3 rounded-xl border border-amber-200 bg-amber-50 hover:bg-amber-100 transition-colors group">
                                    <div className="w-10 h-10 rounded-full bg-amber-100 group-hover:bg-amber-200 flex items-center justify-center flex-shrink-0">
                                        <CalendarDays className="w-5 h-5 text-amber-600" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-semibold text-gray-900">{t('dash.addSubjects')}</p>
                                    </div>
                                    <ChevronRight className="w-4 h-4 text-amber-600 flex-shrink-0" />
                                </Link>
                            </div>
                        ) : overduePayments.length === 0 ? (
                            <div className="flex-1 flex flex-col items-center justify-center py-8 text-gray-400">
                                <CheckCircle className="w-10 h-10 mb-2 opacity-30 text-green-500" />
                                <p className="text-sm font-medium">{t('dash.allDone')}</p>
                                <p className="text-xs opacity-70 mt-1">{t('dash.noAttention')}</p>
                            </div>
                        ) : (
                            <div className="space-y-2 flex-1">
                                {displayedOverdue.map((s) => {
                                    const start = new Date(s.start_time);
                                    const end = new Date(s.end_time);
                                    const isPendingConfirm = s.payment_status === 'paid_by_student';
                                    const deadlineBaseHours = paymentDeadlineHours ?? 24;
                                    const deadline =
                                        paymentTiming === 'before_lesson'
                                            ? new Date(start.getTime() - deadlineBaseHours * 3600000)
                                            : new Date(end.getTime() + deadlineBaseHours * 3600000);
                                    const diffMs = deadline.getTime() - now.getTime();
                                    const remainingHours = Math.max(0, Math.floor(diffMs / 3600000));

                                    return (
                                        <div key={s.id} onClick={() => { setSelectedSession(s); setIsModalOpen(true); }} className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 hover:shadow-md transition-all cursor-pointer group">
                                            <div className={cn(
                                                "w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 transition-colors",
                                                isPendingConfirm ? "bg-amber-100 group-hover:bg-amber-200" : "bg-red-50 group-hover:bg-red-100"
                                            )}>
                                                {isPendingConfirm ? (
                                                    <CreditCard className="w-5 h-5 text-amber-600" />
                                                ) : (
                                                    <AlertCircle className="w-5 h-5 text-red-500" />
                                                )}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex justify-between items-start">
                                                    <p className="text-sm font-semibold text-gray-900 truncate">
                                                        {s.student?.full_name}
                                                    </p>
                                                    <span className="text-sm font-bold text-gray-900">€{s.price}</span>
                                                </div>
                                                <div className="text-xs text-gray-500 flex items-center gap-1.5 mt-0.5">
                                                    <span>{format(start, "d MMM", { locale: dateFnsLocale })}</span>
                                                    <span>·</span>
                                                    <span className={isPendingConfirm ? "text-amber-600 font-medium bg-amber-50 px-1.5 py-0.5 rounded-md" : "text-red-500"}>
                                                        {isPendingConfirm ? t('dash.paidPendingConfirm') : t('dash.unpaid')}
                                                    </span>
                                                </div>
                                                <p className="text-[11px] mt-1 font-medium px-1.5 py-0.5 rounded-md inline-block">
                                                    {isPendingConfirm ? (
                                                        <span className="text-amber-700 bg-amber-50">{t('dash.reasonPendingConfirm')}</span>
                                                    ) : diffMs <= 0 ? (
                                                        <span className="text-red-600 bg-red-50">{t('dash.deadlinePassed')}</span>
                                                    ) : (
                                                        <span className="text-amber-700 bg-amber-50">{t('dash.hoursLeft', { n: String(remainingHours || '<1') })}</span>
                                                    )}
                                                </p>
                                            </div>
                                        </div>
                                    );
                                })}
                                {!showAllOverdue && overduePayments.length > 5 && (
                                    <button
                                        onClick={() => setShowAllOverdue(true)}
                                        className="w-full text-center text-sm text-indigo-600 font-medium py-2 hover:bg-gray-50 rounded-xl transition-colors"
                                    >
                                        {t('dash.showMore', { count: String(overduePayments.length) })}
                                    </button>
                                )}
                                {showAllOverdue && overduePayments.length > 5 && (
                                    <button
                                        onClick={() => setShowAllOverdue(false)}
                                        className="w-full text-center text-sm text-gray-500 font-medium py-2 hover:bg-gray-50 rounded-xl transition-colors"
                                    >
                                        {t('dash.hide')}
                                    </button>
                                )}
                            </div>
                        )}
                    </div>
                    )}

                    {/* Recent payments – hidden for org_tutor */}
                    {isOrgTutor === false && (
                    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="font-semibold text-gray-900 flex items-center gap-2">
                                <Wallet className="w-4 h-4 text-green-500" />
                                {t('dash.recentPayments')}
                            </h2>
                            <Link to="/finance" className="text-xs text-indigo-600 hover:underline flex items-center gap-1">
                                {t('dash.viewAll')} <ChevronRight className="w-3 h-3" />
                            </Link>
                        </div>

                        {loading ? (
                            <div className="space-y-3">
                                {[1, 2, 3].map(i => <div key={i} className="h-12 bg-gray-100 rounded-xl animate-pulse" />)}
                            </div>
                        ) : recentPayments.length === 0 ? (
                            <div className="text-center py-8 text-gray-400">
                                <Wallet className="w-8 h-8 mx-auto mb-2 opacity-30" />
                                <p className="text-sm">{t('dash.noPayments')}</p>
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {displayedRecentPayments.map((p) => (
                                    <div key={p.id} className="flex items-center justify-between p-3 rounded-xl bg-green-50 border border-green-100">
                                        <div className="flex items-center gap-3">
                                            <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />
                                            <div>
                                                <p className="text-sm font-semibold text-gray-900">{p.title}</p>
                                                <p className="text-xs text-gray-500">
                                                    {p.subtitle}
                                                    <span className="ml-1 text-[10px] uppercase text-green-700 font-semibold">
                                                        · {p.type === 'lesson' ? t('dash.lesson') : p.type === 'package' ? t('dash.package') : t('dash.invoice')}
                                                    </span>
                                                </p>
                                            </div>
                                        </div>
                                        <span className="text-sm font-bold text-green-700">+€{p.amount.toFixed(2)}</span>
                                    </div>
                                ))}
                                {recentPayments.length > 5 && (
                                    <button
                                        onClick={() => setShowAllRecentPayments((v) => !v)}
                                        className="w-full text-center text-sm text-indigo-600 font-medium py-2 hover:bg-gray-50 rounded-xl transition-colors"
                                    >
                                        {showAllRecentPayments ? t('dash.showLess') : t('dash.showMore', { count: String(recentPayments.length) })}
                                    </button>
                                )}
                            </div>
                        )}
                    </div>
                    )}

                    {/* Quick overview – hidden for org_tutor */}
                    {isOrgTutor === false && (
                    <div className="bg-gradient-to-br from-indigo-600 to-indigo-800 rounded-2xl p-5 text-white">
                        <h2 className="font-semibold mb-3 flex items-center gap-2">
                            <TrendingUp className="w-4 h-4" />
                            {t('dash.quickOverview')}
                        </h2>
                        <div className="space-y-3">
                            <div className="flex justify-between items-center">
                                <span className="text-indigo-200 text-sm">{t('dash.totalRevenue')}</span>
                                <span className="font-bold">€{totalRevenue.toFixed(0)}</span>
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="text-indigo-200 text-sm">{t('dash.pendingPayments')}</span>
                                <span className="font-bold text-amber-300">€{pendingRevenue.toFixed(0)}</span>
                            </div>
                            <div className="border-t border-indigo-500 pt-2 flex justify-between items-center">
                                <span className="text-indigo-200 text-sm">{t('dash.thisMonth')}</span>
                                <span className="font-bold text-green-300">€{thisMonthRevenue.toFixed(0)}</span>
                            </div>
                        </div>
                        <Link
                            to="/finance"
                            className="mt-4 flex items-center gap-2 text-sm text-indigo-200 hover:text-white transition-colors"
                        >
                            {t('dash.openFinance')} <ArrowRight className="w-4 h-4" />
                        </Link>
                    </div>
                    )}
                </div>
            </div>
            )}

            {/* Session Details Modal */}
            <Dialog
                open={isModalOpen}
                onOpenChange={(open) => {
                    setIsModalOpen(open);
                    if (!open) {
                        setCancelConfirmId(null);
                        setIsEditingTime(false);
                        setNoShowPickerOpen(false);
                    }
                }}
            >
                <DialogContent className="w-[95vw] sm:max-w-[480px] max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <CalendarDays className="w-5 h-5 text-indigo-600" />
                            {t('cal.lessonInfo')}
                        </DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-2">
                        {/* Attention reason banner (not shown to org tutors — payment-related) */}
                        {isOrgTutor !== true && selectedSession && !selectedSession.paid && selectedSession.status !== 'cancelled' && (() => {
                            const isPendingConfirm = selectedSession.payment_status === 'paid_by_student';
                            const s = selectedSession;
                            const sStart = new Date(s.start_time);
                            const sEnd = new Date(s.end_time);
                            const deadlineBase = paymentDeadlineHours ?? 24;
                            const dlDate = paymentTiming === 'before_lesson'
                                ? new Date(sStart.getTime() - deadlineBase * 3600000)
                                : new Date(sEnd.getTime() + deadlineBase * 3600000);
                            const diff = dlDate.getTime() - now.getTime();
                            const overdue = diff <= 0;
                            const soon = !overdue && diff <= 6 * 3600000;
                            if (!isPendingConfirm && !overdue && !soon) return null;
                            return (
                                <div className={cn(
                                    "rounded-xl px-4 py-3 border text-sm flex items-start gap-2",
                                    isPendingConfirm ? "bg-amber-50 border-amber-200" : "bg-red-50 border-red-200"
                                )}>
                                    {isPendingConfirm
                                        ? <CreditCard className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                                        : <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />}
                                    <p className={isPendingConfirm ? "text-amber-800 font-medium" : "text-red-700 font-medium"}>
                                        {isPendingConfirm
                                            ? t('dash.reasonPendingConfirm')
                                            : overdue
                                                ? t('dash.deadlinePassed')
                                                : t('dash.hoursLeft', { n: String(Math.max(1, Math.floor(diff / 3600000))) })}
                                    </p>
                                </div>
                            );
                        })()}
                        {(() => {
                            const visibleStudentEmail = contactVisibility
                                ? formatContactForTutorView(
                                    selectedSession?.student?.email,
                                    selectedSession?.student?.payer_email,
                                    contactVisibility.tutorSeesStudentEmail,
                                )
                                : ((selectedSession?.student?.email || '').trim() || '—');
                            const visibleStudentPhone = contactVisibility
                                ? formatContactForTutorView(
                                    selectedSession?.student?.phone,
                                    selectedSession?.student?.payer_phone,
                                    contactVisibility.tutorSeesStudentPhone,
                                )
                                : ((selectedSession?.student?.phone || '').trim() || '—');
                            const isContactPlaceholder = (v: string) => !String(v).trim() || String(v).trim() === '—';
                            const showStudentEmail = !isContactPlaceholder(visibleStudentEmail);
                            const showStudentPhone = !isContactPlaceholder(visibleStudentPhone);
                            return (
                                <>
                        {/* Student name + contacts */}
                        <div className="bg-indigo-50 rounded-xl px-4 py-3 flex items-start gap-3">
                            <div className="w-9 h-9 rounded-full bg-indigo-600 flex items-center justify-center text-white font-bold text-sm flex-shrink-0 mt-0.5">
                                {selectedSession?.student?.full_name?.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2) || '?'}
                            </div>
                            <div className="min-w-0 flex-1">
                                <p className="font-semibold text-gray-900">{selectedSession?.student?.full_name}</p>
                                {selectedSession?.student?.grade && (
                                    <p className="text-xs text-emerald-600 font-medium">🎓 {selectedSession.student.grade}</p>
                                )}
                                {selectedSession?.topic && (
                                    <p className="text-xs text-gray-500">{selectedSession.topic}</p>
                                )}
                                {showStudentEmail && (
                                    <p className="text-xs text-indigo-600 block truncate mt-1">{visibleStudentEmail}</p>
                                )}
                                {showStudentPhone && (
                                    <p className="text-xs text-gray-600 block mt-0.5">{visibleStudentPhone}</p>
                                )}
                                {!showStudentEmail && !showStudentPhone && isOrgTutor === true && (
                                    <p className="text-xs text-gray-500 mt-1.5">{t('dash.contactsHiddenByOrg')}</p>
                                )}
                            </div>
                        </div>
                                </>
                            );
                        })()}

                        <div className="grid grid-cols-2 gap-3 text-sm">
                            <div className="bg-gray-50 rounded-xl p-3">
                                <div className="flex items-center gap-1 mb-2 min-h-[22px]">
                                    <p className="text-xs text-gray-400 font-medium flex items-center gap-1 flex-1 min-w-0">
                                        <Clock className="w-3 h-3 shrink-0" /> {t('dash.start')}
                                    </p>
                                    {!isEditingTime && selectedSession?.status === 'active' && (
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setEditNewStartTime(format(new Date(selectedSession.start_time), "yyyy-MM-dd'T'HH:mm"));
                                                setIsEditingTime(true);
                                            }}
                                            className="text-gray-400 hover:text-indigo-600 p-1 rounded-md transition-colors shrink-0 -mr-1"
                                            title={t('dash.changeTime')}
                                        >
                                            <Edit2 className="w-3.5 h-3.5" />
                                        </button>
                                    )}
                                </div>
                                {isEditingTime ? (
                                    <div className="mt-2 space-y-2">
                                        <DateTimeSpinner value={editNewStartTime} onChange={setEditNewStartTime} />
                                        <div className="flex gap-2">
                                            <Button size="sm" variant="outline" className="h-7 px-2 text-xs flex-1 rounded-lg" onClick={() => setIsEditingTime(false)}>{t('dash.cancelEdit')}</Button>
                                            <Button size="sm" className="h-7 px-2 text-xs flex-1 rounded-lg" onClick={handleReschedule} disabled={saving}>{saving ? '...' : t('dash.saveEdit')}</Button>
                                        </div>
                                    </div>
                                ) : (
                                    <p className="font-semibold text-gray-800">
                                        {selectedSession?.start_time ? format(new Date(selectedSession.start_time), "yyyy-MM-dd HH:mm") : ''}
                                    </p>
                                )}
                            </div>
                            <div className="bg-gray-50 rounded-xl p-3">
                                <div className="flex items-center gap-1 mb-2 min-h-[22px]">
                                    <p className="text-xs text-gray-400 font-medium flex items-center gap-1">
                                        <Clock className="w-3 h-3 shrink-0" /> {t('dash.end')}
                                    </p>
                                </div>
                                <p className="font-semibold text-gray-800">
                                    {isEditingTime && editNewStartTime ? (
                                        (() => {
                                            const newStart = new Date(editNewStartTime);
                                            const oldStart = new Date(selectedSession!.start_time);
                                            const oldEnd = new Date(selectedSession!.end_time);
                                            const durMs = oldEnd.getTime() - oldStart.getTime();
                                            return format(new Date(newStart.getTime() + durMs), "yyyy-MM-dd HH:mm");
                                        })()
                                    ) : (
                                        selectedSession?.end_time ? format(new Date(selectedSession.end_time), "yyyy-MM-dd HH:mm") : ''
                                    )}
                                </p>
                            </div>
                        </div>

                        {isOrgTutor === true ? (
                            <div className="bg-gray-50 rounded-xl p-3 flex flex-row items-center justify-between gap-3 text-sm">
                                <p className="text-xs text-gray-500 font-medium shrink-0">{t('dash.statusLabel')}</p>
                                <div className="min-w-0 flex justify-end">
                                    <StatusBadge
                                        status={selectedSession?.status || ''}
                                        paymentStatus={selectedSession?.payment_status}
                                        paid={selectedSession?.paid}
                                        isTrial={selectedSession?.subjects?.is_trial === true}
                                        orgTutorCopy
                                        hidePaymentStatus
                                        endTime={selectedSession?.end_time}
                                    />
                                </div>
                            </div>
                        ) : (
                            <div className="grid gap-3 text-sm grid-cols-3">
                                <div className="bg-gray-50 rounded-xl p-3 text-center">
                                    <p className="text-xs text-gray-400 mb-1">{t('dash.priceLabel')}</p>
                                    <p className="font-bold text-gray-900">€{selectedSession?.price || '–'}</p>
                                    {selectedSession?.credit_applied_amount != null && selectedSession.credit_applied_amount > 0 && (
                                        <p className="text-[11px] text-green-600 mt-1">{t('dash.creditApplied', { amount: selectedSession.credit_applied_amount.toFixed(2) })}</p>
                                    )}
                                </div>
                                <div className="bg-gray-50 rounded-xl p-3 text-center flex flex-col items-center justify-center">
                                    <p className="text-xs text-gray-400 mb-1">{t('dash.statusLabel')}</p>
                                    <StatusBadge
                                        status={selectedSession?.status || ''}
                                        paymentStatus={selectedSession?.payment_status}
                                        paid={selectedSession?.paid}
                                        isTrial={selectedSession?.subjects?.is_trial === true}
                                        orgTutorCopy={false}
                                        hidePaymentStatus={false}
                                        endTime={selectedSession?.end_time}
                                    />
                                </div>
                                <div className="bg-gray-50 rounded-xl p-3 text-center">
                                    <p className="text-xs text-gray-400 mb-1">{t('dash.paidLabel')}</p>
                                    {selectedSession?.payment_status === 'paid_by_student' ? (
                                        <span className="text-green-600 font-semibold text-xs bg-green-100 px-2 py-0.5 rounded">{t('dash.studentMarked')}</span>
                                    ) : (
                                        <span className={selectedSession?.paid ? 'text-green-600 font-semibold text-xs' : 'text-red-500 font-semibold text-xs'}>
                                            {selectedSession?.paid ? t('dash.paidYes') : t('dash.paidNo')}
                                        </span>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Comment - in detail view (same as Calendar) */}
                        <div className="space-y-2 pt-3 border-t border-gray-100">
                            <p className="text-sm font-semibold text-gray-700">{t('dash.commentLabel')}</p>
                            <textarea
                                value={viewCommentText}
                                onChange={(e) => setViewCommentText(e.target.value)}
                                placeholder={t('dash.commentPlaceholder')}
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
                                        ? t('dash.commentAutoSend')
                                        : t('dash.commentShowStudent')}
                                </span>
                            </label>
                            <Button size="sm" onClick={handleSaveViewComment} disabled={viewCommentSaving} className="rounded-xl w-full sm:w-auto">
                                {viewCommentSaving ? t('dash.savingComment') : t('dash.saveComment')}
                            </Button>
                            {selectedSession?.tutor_comment && (
                                <div className={`mt-2 p-3 rounded-lg text-sm border ${selectedSession.show_comment_to_student ? 'bg-indigo-50 border-indigo-100 text-indigo-800' : 'bg-gray-50 border-gray-100 text-gray-700'}`}>
                                    <span className="font-semibold block mb-1">{t('dash.commentVisibleNow')} {selectedSession.show_comment_to_student ? t('dash.visibleToStudent') : t('dash.visibleOnlyYou')}</span>
                                    <div className="whitespace-pre-wrap">{selectedSession.tutor_comment}</div>
                                </div>
                            )}
                        </div>

                        {selectedSession?.meeting_link && (
                            <a
                                href={normalizeUrl(selectedSession.meeting_link) || undefined}
                                target="_blank"
                                rel="noreferrer"
                                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-50 text-blue-600 text-sm hover:bg-blue-100 transition-colors"
                            >
                                {t('dash.joinVideoCall')}
                            </a>
                        )}

                        {/* Action buttons area */}
                        {isOrgTutor !== true && selectedSession?.payment_status === 'paid_by_student' && !selectedSession?.paid && (
                            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mt-2">
                                <div className="flex items-start gap-3 mb-3">
                                    <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                                    <div>
                                        <p className="text-sm font-bold text-amber-900 leading-tight">{t('dash.studentMarkedPaid')}</p>
                                        <p className="text-xs text-amber-700 mt-0.5">{t('dash.checkBankConfirm')}</p>
                                    </div>
                                </div>
                                <Button
                                    onClick={handleConfirmPayment}
                                    disabled={saving}
                                    className="w-full bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-xl"
                                >
                                    {saving ? t('dash.confirming') : t('dash.confirmPayment')}
                                </Button>
                            </div>
                        )}
                    </div>

                    {/* Cancellation reason textarea */}
                    {cancelConfirmId === selectedSession?.id && (
                        <div className="space-y-2 pt-2 border-t border-gray-100">
                            <label className="text-sm font-semibold text-gray-700">📝 {t('dash.cancelReasonLabel')}</label>
                            <textarea
                                value={cancellationReason}
                                onChange={(e) => setCancellationReason(e.target.value)}
                                placeholder={t('dash.cancelReasonPlaceholder')}
                                className="w-full p-3 rounded-xl border border-gray-200 text-sm resize-none focus:ring-2 focus:ring-red-200 focus:border-red-300 outline-none"
                                rows={3}
                                autoFocus
                            />
                            {cancellationReason.length > 0 && cancellationReason.trim().length < 5 && (
                                <p className="text-xs text-red-500">{t('dash.minChars', { min: '5', current: String(cancellationReason.trim().length) })}</p>
                            )}
                            <div className="flex gap-2 mt-3">
                                <Button variant="outline" size="sm" onClick={() => { setCancelConfirmId(null); setCancellationReason(''); }} className="rounded-xl flex-1">
                                    {t('dash.cancelBtn')}
                                </Button>
                                <Button variant="destructive" size="sm" onClick={handleCancelSession} disabled={saving || cancellationReason.trim().length < 5} className="rounded-xl flex-1">
                                    {saving ? t('dash.cancelling') : t('dash.confirmCancel')}
                                </Button>
                            </div>
                        </div>
                    )}

                    {/* File uploads/downloads */}
                    {selectedSession?.id && (
                        <SessionFiles sessionId={selectedSession.id} role="tutor" />
                    )}

                    <DialogFooter className="flex flex-col gap-3 pt-4 mt-1 border-t border-gray-100 w-full sm:flex-col">
                        {selectedSession?.status === 'active' && (
                            <div className="flex w-full flex-col gap-2">
                                <div className="grid grid-cols-2 gap-2">
                                    <Button
                                        variant={cancelConfirmId === selectedSession.id ? 'default' : 'outline'}
                                        onClick={() => {
                                            if (cancelConfirmId !== selectedSession.id) {
                                                handleCancelSession();
                                            }
                                        }}
                                        disabled={saving}
                                        size="sm"
                                        className={cn(
                                            'rounded-xl w-full',
                                            cancelConfirmId === selectedSession.id
                                                ? 'bg-orange-500 hover:bg-orange-600 text-white border-transparent'
                                                : 'border-red-200 text-red-700 hover:bg-red-50',
                                        )}
                                    >
                                        <XCircle className="w-4 h-4 mr-1" />
                                        {cancelConfirmId === selectedSession.id ? t('dash.cancellingSession') : t('dash.cancelBtn')}
                                    </Button>
                                    <Button
                                        variant="outline"
                                        onClick={handleMarkCompleted}
                                        disabled={saving}
                                        size="sm"
                                        className="rounded-xl w-full border-green-200 text-green-700 hover:bg-green-50"
                                    >
                                        <CheckCircle className="w-4 h-4 mr-1" />
                                        {t('dash.completed')}
                                    </Button>
                                </div>
                                <Button
                                    variant="outline"
                                    onClick={() => setNoShowPickerOpen(true)}
                                    disabled={saving}
                                    size="sm"
                                    className="rounded-xl w-full border-rose-200 text-rose-700 hover:bg-rose-50"
                                >
                                    <UserX className="w-4 h-4 mr-1" />
                                    {t('common.noShow')}
                                </Button>
                            </div>
                        )}
                        {selectedSession &&
                            (selectedSession.status === 'completed' || selectedSession.status === 'no_show') &&
                            isAfter(new Date(selectedSession.end_time), new Date()) && (
                            <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-2">
                                <Button
                                    variant="outline"
                                    onClick={() => void handleRevertLessonToPlannedDashboard()}
                                    disabled={saving}
                                    size="sm"
                                    className="rounded-xl w-full text-indigo-700 border-indigo-200 hover:bg-indigo-50"
                                >
                                    <RotateCcw className="w-4 h-4 mr-1" />
                                    {t('dash.revertToPlannedLesson')}
                                </Button>
                                {selectedSession.status === 'completed' && (
                                    <Button
                                        variant="outline"
                                        onClick={() => setNoShowPickerOpen(true)}
                                        disabled={saving}
                                        size="sm"
                                        className="rounded-xl w-full text-rose-700 border-rose-200 hover:bg-rose-50"
                                    >
                                        <UserX className="w-4 h-4 mr-1" />
                                        {t('common.noShow')}
                                    </Button>
                                )}
                            </div>
                        )}
                        {selectedSession?.status !== 'cancelled' && isOrgTutor !== true && (
                            <div className="flex w-full flex-col gap-2">
                                {selectedSession?.payment_status === 'paid_by_student' && (
                                    <Button
                                        onClick={handleRejectPayment}
                                        disabled={saving}
                                        size="sm"
                                        variant="outline"
                                        className="rounded-xl w-full border-red-200 text-red-600 hover:bg-red-50"
                                    >
                                        <XCircle className="w-4 h-4 mr-1" />
                                        Negavau pavedimo
                                    </Button>
                                )}
                                {selectedSession?.payment_status !== 'paid_by_student' && (
                                    <Button
                                        onClick={handleMarkPaid}
                                        disabled={saving}
                                        size="sm"
                                        variant="default"
                                        className={cn(
                                            "rounded-xl w-full font-semibold shadow-sm transition-all",
                                            selectedSession?.paid
                                                ? "bg-amber-500 hover:bg-amber-600 text-white border-transparent ring-2 ring-amber-200"
                                                : "bg-emerald-600 hover:bg-emerald-700 text-white border-transparent ring-2 ring-emerald-200"
                                        )}
                                    >
                                        <Wallet className="w-5 h-5 mr-1.5" />
                                        {selectedSession?.paid ? t('dash.markUnpaid') : t('dash.markPaid')}
                                    </Button>
                                )}
                            </div>
                        )}
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Onboarding Dialog */}
            <TutorOnboarding
                open={isOnboardingOpen}
                onOpenChange={setIsOnboardingOpen}
                isStripeConnected={isStripeConnected}
                hasSubjects={hasSubjects}
            />

            <MarkStudentNoShowDialog
                open={noShowPickerOpen && !!selectedSession}
                onOpenChange={(open) => {
                    if (!open) setNoShowPickerOpen(false);
                }}
                sessionStart={selectedSession ? new Date(selectedSession.start_time) : new Date()}
                sessionEnd={selectedSession ? new Date(selectedSession.end_time) : new Date()}
                saving={saving}
                onConfirm={(w) => void confirmMarkStudentNoShowDashboard(w)}
            />
        </Layout>
    );
}
