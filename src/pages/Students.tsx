import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import Layout from '@/components/Layout';
import { supabase } from '@/lib/supabase';
import { getCached, setCache } from '@/lib/dataCache';
import { useUser } from '@/contexts/UserContext';
import { authHeaders } from '@/lib/apiHelpers';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Plus, Trash2, Copy, Mail, ExternalLink, Check, User, UserX, Clock, CalendarDays, Wallet, CheckCircle, XCircle, Euro, Sparkles, Package, FileText, Edit2, RotateCcw, Loader2 } from 'lucide-react';
import SendPackageModal from '@/components/SendPackageModal';
import SendInvoiceModal from '@/components/SendInvoiceModal';
import { format, isAfter, isBefore } from 'date-fns';
import { useTranslation } from '@/lib/i18n';
import { cn, formatLithuanianPhone, normalizeUrl, validateLithuanianPhone } from '@/lib/utils';
import { useOrgTutorPolicy } from '@/hooks/useOrgTutorPolicy';
import { useOrgFeatures } from '@/hooks/useOrgFeatures';
import {
  isPerStudentPaymentOverrideEnabled,
  getEffectivePaymentActions,
  mergeOrgTutorLessonPaymentDefaults,
  type TutorPaymentFlags,
  type LessonPaymentTiming,
} from '@/lib/studentPaymentModel';
import StudentPaymentModelSection from '@/components/StudentPaymentModelSection';
import { sendEmail } from '@/lib/email';
import StatusBadge from '@/components/StatusBadge';
import Toast from '@/components/Toast';
import { DateRangeFilter } from '@/components/DateRangeFilter';
import { SessionStatCards } from '@/components/SessionStatCards';
import { SessionList } from '@/components/SessionList';
import {
  calculateSessionStats,
  getAllStudentsStats,
  getStudentSessions,
  type Session,
} from '@/lib/session-stats';
import { formatContactForTutorView, shouldShowPayerContactSection } from '@/lib/orgContactVisibility';
import { DateTimeSpinner } from '@/components/TimeSpinner';
import SessionFiles from '@/components/SessionFiles';
import MarkStudentNoShowDialog from '@/components/MarkStudentNoShowDialog';
import { buildNoShowSessionPatch, type NoShowWhen } from '@/lib/noShowWhen';

interface Student {
  id: string;
  full_name: string;
  email: string;
  phone: string;
  invite_code: string;
  payment_payer?: string | null;
  payer_email?: string | null;
  payer_phone?: string | null;
  payment_model?: string | null;
  grade?: string;
  linked_user_id?: string | null;
  remaining_lessons?: number;
  used_lessons?: number;
  total_lessons?: number;
  has_package?: boolean;
  latest_invoice?: {
    id: string;
    sent_at: string;
    paid: boolean;
    payment_status: string;
    total_amount: number;
    payment_deadline_date: string;
    payer_name?: string | null;
    payer_email?: string | null;
  } | null;
}

type StudentLatestInvoice = NonNullable<Student['latest_invoice']>;

function normInvoiceEmail(value: string | null | undefined): string {
  return String(value ?? '').trim().toLowerCase();
}

/**
 * Latest invoice badge on student cards: map student_id → batch.
 * Uses billing_batch_sessions AND sessions.payment_batch_id so cards stay in sync
 * with per-student modal logic (which reads payment_batch_id) even if the junction rows are missing.
 * Also maps by payer email (same rule as monthly invoice grouping) so siblings / same household see the batch.
 */
async function buildLatestInvoiceByStudentIdForTutor(tutorId: string): Promise<Map<string, StudentLatestInvoice>> {
  const latestInvoiceByStudentId = new Map<string, StudentLatestInvoice>();

  const { data: billingBatches } = await supabase
    .from('billing_batches')
    .select('id, sent_at, paid, payment_status, total_amount, payment_deadline_date, payer_name, payer_email')
    .eq('tutor_id', tutorId)
    .order('sent_at', { ascending: false })
    .limit(100);

  if (!billingBatches?.length) return latestInvoiceByStudentId;

  const batchIds = billingBatches.map((b: { id: string }) => b.id);
  const sessionIdsByBatch = new Map<string, Set<string>>();
  const addSessionToBatch = (batchId: string | null | undefined, sessionId: string | null | undefined) => {
    if (!batchId || !sessionId) return;
    if (!sessionIdsByBatch.has(batchId)) sessionIdsByBatch.set(batchId, new Set());
    sessionIdsByBatch.get(batchId)!.add(sessionId);
  };

  const { data: batchSessions } = await supabase
    .from('billing_batch_sessions')
    .select('billing_batch_id, session_id')
    .in('billing_batch_id', batchIds);

  (batchSessions || []).forEach((bs: { billing_batch_id?: string; session_id?: string }) => {
    addSessionToBatch(bs.billing_batch_id, bs.session_id);
  });

  const { data: sessionsWithBatch } = await supabase
    .from('sessions')
    .select('id, student_id, payment_batch_id')
    .eq('tutor_id', tutorId)
    .in('payment_batch_id', batchIds);

  const studentBySessionId = new Map<string, string>();
  (sessionsWithBatch || []).forEach((s: { id?: string; student_id?: string; payment_batch_id?: string }) => {
    if (s.payment_batch_id && s.id) addSessionToBatch(s.payment_batch_id, s.id);
    if (s.id && s.student_id) studentBySessionId.set(s.id, s.student_id);
  });

  const junctionSessionIds = new Set(
    (batchSessions || []).map((bs: { session_id?: string }) => bs.session_id).filter(Boolean) as string[],
  );
  const missingForStudent = [...junctionSessionIds].filter((id) => !studentBySessionId.has(id));
  if (missingForStudent.length > 0) {
    const { data: extraSessions } = await supabase
      .from('sessions')
      .select('id, student_id')
      .in('id', missingForStudent);
    (extraSessions || []).forEach((s: { id?: string; student_id?: string }) => {
      if (s.id && s.student_id) studentBySessionId.set(s.id, s.student_id);
    });
  }

  const { data: tutorStudents } = await supabase
    .from('students')
    .select('id, email, payer_email')
    .eq('tutor_id', tutorId);

  for (const batch of billingBatches as any[]) {
    const invoice: StudentLatestInvoice = {
      id: batch.id,
      sent_at: batch.sent_at,
      paid: !!(batch.paid || batch.payment_status === 'paid'),
      payment_status: batch.payment_status,
      total_amount: Number(batch.total_amount || 0),
      payment_deadline_date: batch.payment_deadline_date,
      payer_name: batch.payer_name ?? null,
      payer_email: batch.payer_email ?? null,
    };

    const ids = sessionIdsByBatch.get(batch.id);
    if (ids?.size) {
      for (const sessionId of ids) {
        const studentId = studentBySessionId.get(sessionId);
        if (!studentId) continue;
        if (latestInvoiceByStudentId.has(studentId)) continue;
        latestInvoiceByStudentId.set(studentId, invoice);
      }
    }

    const batchPayer = normInvoiceEmail(batch.payer_email);
    if (batchPayer && tutorStudents?.length) {
      for (const stu of tutorStudents as { id: string; email?: string | null; payer_email?: string | null }[]) {
        const billingEmail = normInvoiceEmail(stu.payer_email || stu.email);
        if (!billingEmail || billingEmail !== batchPayer) continue;
        if (latestInvoiceByStudentId.has(stu.id)) continue;
        latestInvoiceByStudentId.set(stu.id, invoice);
      }
    }
  }

  return latestInvoiceByStudentId;
}

export default function StudentsPage() {
  const { t, dateFnsLocale } = useTranslation();
  const location = useLocation();
  const { user, profile } = useUser();
  const orgPolicy = useOrgTutorPolicy();
  const { hasFeature, loading: orgFeaturesLoading, contactVisibility } = useOrgFeatures();
  const stcache = getCached<any>('tutor_students');
  const [students, setStudents] = useState<Student[]>(stcache?.students ?? []);
  const [loading, setLoading] = useState(!stcache);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [newStudent, setNewStudent] = useState({ full_name: '', email: '', phone: '' });
  const [saving, setSaving] = useState(false);

  // Individual pricing for invite creation
  const [subjects, setSubjects] = useState<any[]>([]);
  const [selectedSubjectForInvite, setSelectedSubjectForInvite] = useState<string>('');
  const [customPrice, setCustomPrice] = useState<number | ''>('');
  const [customDuration, setCustomDuration] = useState<number | ''>('');
  const [customCancellationHours, setCustomCancellationHours] = useState<number>(24);
  const [customCancellationFee, setCustomCancellationFee] = useState<number>(0);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [baseUrl, setBaseUrl] = useState('');
  const [checkingOrgStatus, setCheckingOrgStatus] = useState(true);

  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [selectedStudentPackages, setSelectedStudentPackages] = useState<any[]>([]);
  const [studentSessions, setStudentSessions] = useState<any[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [isStudentModalOpen, setIsStudentModalOpen] = useState(false);
  const [confirmingPackageId, setConfirmingPackageId] = useState<string | null>(null);
  const [dismissedInvoiceIds, setDismissedInvoiceIds] = useState<string[]>([]);
  const dismissedInvoicesKey = user?.id ? `dismissed_invoice_batches_${user.id}` : null;
  const cardInvoicePollRef = useRef<{ intervalId: ReturnType<typeof setInterval>; attempts: number } | null>(null);

  // Filtered Sessions Modal State (for "Visos pamokos" tab)
  const [selectedStudentForFilter, setSelectedStudentForFilter] = useState<Student | null>(null);
  const [isFilteredModalOpen, setIsFilteredModalOpen] = useState(false);

  // General Sessions for Pamokos Tab
  const [allSessions, setAllSessions] = useState<any[]>([]);
  const [loadingAllSessions, setLoadingAllSessions] = useState(false);

  // Date Range Filter State
  const [filterStartDate, setFilterStartDate] = useState<Date | null>(null);
  const [filterEndDate, setFilterEndDate] = useState<Date | null>(null);
  const [isFilterActive, setIsFilterActive] = useState(false);

  // Session Modal State
  const [selectedSessionForModal, setSelectedSessionForModal] = useState<any | null>(null);
  const [isSessionModalOpen, setIsSessionModalOpen] = useState(false);
  const [cancelConfirmId, setCancelConfirmId] = useState<string | null>(null);
  const [savingSession, setSavingSession] = useState(false);
  const [noShowPickerOpen, setNoShowPickerOpen] = useState(false);
  const [cancellationReason, setCancellationReason] = useState('');
  const [viewCommentText, setViewCommentText] = useState('');
  const [viewShowToStudent, setViewShowToStudent] = useState(false);
  const [viewCommentSaving, setViewCommentSaving] = useState(false);
  const [forceTrialCommentVisibility, setForceTrialCommentVisibility] = useState(false);
  const [isEditingTime, setIsEditingTime] = useState(false);
  const [editNewStartTime, setEditNewStartTime] = useState<string>('');
  const [toastMessage, setToastMessage] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Individual pricing for student modal
  const [studentIndividualPricing, setStudentIndividualPricing] = useState<any[]>([]);
  const [loadingIndividualPricing, setLoadingIndividualPricing] = useState(false);
  const [editingPricingId, setEditingPricingId] = useState<string | null>(null);
  const [addingNewPrice, setAddingNewPrice] = useState(false);
  const [newPriceSubject, setNewPriceSubject] = useState<string>('');
  const [newPriceAmount, setNewPriceAmount] = useState<number | ''>('');
  const [newPriceDuration, setNewPriceDuration] = useState<number | ''>('');
  const [newPriceCancellationHours, setNewPriceCancellationHours] = useState<number>(24);
  const [newPriceCancellationFee, setNewPriceCancellationFee] = useState<number>(0);
  const [savingIndividualPrice, setSavingIndividualPrice] = useState(false);

  // Package and Invoice Modals
  const [isSendPackageModalOpen, setIsSendPackageModalOpen] = useState(false);
  const [isSendInvoiceModalOpen, setIsSendInvoiceModalOpen] = useState(false);
  const [tutorPaymentFlags, setTutorPaymentFlags] = useState<TutorPaymentFlags>({
    enable_per_lesson: true,
    enable_monthly_billing: false,
    enable_prepaid_packages: false,
  });
  const [soloPaymentOverrideEnabled, setSoloPaymentOverrideEnabled] = useState(false);
  const [lessonPaymentInherited, setLessonPaymentInherited] = useState<{
    payment_timing: LessonPaymentTiming;
    payment_deadline_hours: number;
    min_booking_hours: number;
  }>({
    payment_timing: 'before_lesson',
    payment_deadline_hours: 24,
    min_booking_hours: 24,
  });

  useEffect(() => {
    fetchSubjects();
    setBaseUrl(window.location.origin);
    checkIfOrgTutor();
  }, []);

  // Refetch when tutor is available and when opening /students so cards are not stuck on stale tutor_students cache.
  useEffect(() => {
    if (!user?.id) return;
    if (location.pathname !== '/students') return;
    void fetchStudents();
    void fetchAllSessions();
  }, [user?.id, location.pathname]);

  useEffect(() => {
    if (!dismissedInvoicesKey) {
      setDismissedInvoiceIds([]);
      return;
    }
    try {
      const raw = localStorage.getItem(dismissedInvoicesKey);
      const parsed = raw ? JSON.parse(raw) : [];
      if (Array.isArray(parsed)) setDismissedInvoiceIds(parsed.filter(Boolean));
    } catch {
      setDismissedInvoiceIds([]);
    }
  }, [dismissedInvoicesKey]);

  useEffect(() => {
    let cancelled = false;
    if (!selectedSessionForModal) return;

    setViewCommentText(selectedSessionForModal.tutor_comment ?? '');
    setViewShowToStudent(selectedSessionForModal.show_comment_to_student ?? false);
    setForceTrialCommentVisibility(false);
    setIsEditingTime(false);
    setEditNewStartTime(selectedSessionForModal.start_time || '');

    (async () => {
      if (!selectedSessionForModal.subjects?.is_trial) return;
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
  }, [selectedSessionForModal?.id]);

  const dismissInvoiceBadge = (billingBatchId: string) => {
    if (!dismissedInvoicesKey) return;
    setDismissedInvoiceIds((prev) => {
      const next = Array.from(new Set([...prev, billingBatchId]));
      try {
        localStorage.setItem(dismissedInvoicesKey, JSON.stringify(next));
      } catch {
        // ignore localStorage errors
      }
      return next;
    });
  };

  // While student modal is open and invoice is unpaid, poll briefly.
  // Webhook updates billing_batches - here we just read from DB.
  useEffect(() => {
    if (!isStudentModalOpen) return;
    if (!user?.id) return;
    if (!selectedStudent?.id) return;
    if (!selectedStudent.latest_invoice || selectedStudent.latest_invoice.paid) return;

    let cancelled = false;
    let attempts = 0;
    const maxAttempts = 8; // ~2 minutes

    const interval = setInterval(async () => {
      if (cancelled) return;
      attempts += 1;
      if (attempts > maxAttempts) {
        clearInterval(interval);
        return;
      }

      try {
        const { data: sessionRows, error: sessionErr } = await supabase
          .from('sessions')
          .select('payment_batch_id')
          .eq('student_id', selectedStudent.id)
          .eq('tutor_id', user.id)
          .not('payment_batch_id', 'is', null)
          .order('start_time', { ascending: false })
          .limit(50);

        if (sessionErr) return;

        const batchIds = Array.from(
          new Set((sessionRows || []).map((r: any) => r.payment_batch_id).filter(Boolean))
        ).slice(0, 10);

        if (batchIds.length === 0) return;

        const { data: batches, error: batchErr } = await supabase
          .from('billing_batches')
          .select('id, sent_at, paid, payment_status, total_amount, payment_deadline_date, payer_name, payer_email')
          .in('id', batchIds)
          .order('sent_at', { ascending: false })
          .limit(1);

        if (batchErr) return;
        if (!batches || batches.length === 0) return;

        const b = batches[0] as any;
        const updatedInvoice: Student['latest_invoice'] = {
          id: b.id,
          sent_at: b.sent_at,
          paid: !!(b.paid || b.payment_status === 'paid'),
          payment_status: b.payment_status,
          total_amount: Number(b.total_amount || 0),
          payment_deadline_date: b.payment_deadline_date,
          payer_name: b.payer_name ?? null,
          payer_email: b.payer_email ?? null,
        };

        setSelectedStudent((prev) => {
          if (!prev) return prev;
          if (prev.id !== selectedStudent.id) return prev;
          return { ...prev, latest_invoice: updatedInvoice };
        });

        if (updatedInvoice?.paid) clearInterval(interval);
      } catch (_) {
        // ignore polling errors; next tick will try again
      }
    }, 15000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [isStudentModalOpen, selectedStudent?.id, selectedStudent?.latest_invoice?.paid, user?.id]);

  // Refetch sessions when filter becomes active or changes
  useEffect(() => {
    if (isFilterActive) {
      fetchAllSessions();
    }
  }, [isFilterActive, filterStartDate, filterEndDate]);

  const checkIfOrgTutor = async () => {
    setCheckingOrgStatus(true);
    if (!user) {
      setCheckingOrgStatus(false);
      return;
    }
    const { data } = await supabase
      .from('profiles')
      .select('organization_id, enable_per_lesson, enable_prepaid_packages, enable_monthly_billing, enable_per_student_payment_override, payment_timing, payment_deadline_hours, min_booking_hours')
      .eq('id', user.id)
      .single();

    let orgPay: { payment_timing?: string | null; payment_deadline_hours?: number | null } | null = null;
    if ((data as any)?.organization_id) {
      const { data: orgData } = await supabase
        .from('organizations')
        .select('payment_timing, payment_deadline_hours')
        .eq('id', (data as any).organization_id)
        .single();
      orgPay = orgData;
    }
    const merged = mergeOrgTutorLessonPaymentDefaults(
      {
        payment_timing: (data as any)?.payment_timing,
        payment_deadline_hours: (data as any)?.payment_deadline_hours,
        organization_id: (data as any)?.organization_id,
      },
      orgPay,
    );
    setLessonPaymentInherited({
      ...merged,
      min_booking_hours: Math.max(1, Number((data as any)?.min_booking_hours) || 24),
    });

    setTutorPaymentFlags({
      enable_per_lesson: (data as any)?.enable_per_lesson ?? true,
      enable_monthly_billing: !!(data as any)?.enable_monthly_billing,
      enable_prepaid_packages: !!(data as any)?.enable_prepaid_packages,
    });
    setSoloPaymentOverrideEnabled(!!(data as any)?.enable_per_student_payment_override);
    setCheckingOrgStatus(false);
  };

  const fetchAllSessions = async () => {
    setLoadingAllSessions(true);
    if (!user) return;

    let query = supabase
      .from('sessions')
      .select('*, student:students(full_name, email), subjects(is_group, is_trial, name)')
      .eq('tutor_id', user.id);

    // Apply date range filtering at query level if filters are active
    if (isFilterActive) {
      if (filterStartDate) {
        query = query.gte('start_time', filterStartDate.toISOString());
      }
      if (filterEndDate) {
        const endOfDay = new Date(filterEndDate);
        endOfDay.setHours(23, 59, 59, 999);
        query = query.lte('start_time', endOfDay.toISOString());
      }
    }

    const { data } = await query
      .order('start_time', { ascending: false })
      .limit(500);

    setAllSessions(data || []);
    setLoadingAllSessions(false);
  };

  const fetchStudents = async () => {
    if (!getCached('tutor_students')) setLoading(true);
    if (!user) { setLoading(false); return; }

    const { data, error } = await supabase
      .from('students')
      .select('*, linked_user_id')
      .eq('tutor_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching students:', error);
    } else {
      const { data: packageData, error: packageError } = await supabase
        .from('lesson_packages')
        .select('student_id, total_lessons, available_lessons, completed_lessons')
        .eq('tutor_id', user.id)
        .eq('paid', true);

      if (packageError) {
        console.error('Error fetching package balances:', packageError);
      }

      const remainingByStudent = new Map<string, number>();
      const usedByStudent = new Map<string, number>();
      const totalByStudent = new Map<string, number>();
      const hasPackageByStudent = new Map<string, boolean>();
      (packageData || []).forEach((pkg: any) => {
        remainingByStudent.set(pkg.student_id, (remainingByStudent.get(pkg.student_id) || 0) + (pkg.available_lessons || 0));
        usedByStudent.set(pkg.student_id, (usedByStudent.get(pkg.student_id) || 0) + (pkg.completed_lessons || 0));
        totalByStudent.set(pkg.student_id, (totalByStudent.get(pkg.student_id) || 0) + (pkg.total_lessons || 0));
        hasPackageByStudent.set(pkg.student_id, true);
      });

      const withPackageBalance = (data || []).map((student: any) => ({
        ...student,
        remaining_lessons: remainingByStudent.get(student.id) || 0,
        used_lessons: usedByStudent.get(student.id) || 0,
        total_lessons: totalByStudent.get(student.id) || 0,
        has_package: hasPackageByStudent.get(student.id) || false,
      }));

      // Latest invoice per student (junction + payment_batch_id on sessions — see helper)
      let withInvoiceBalance = withPackageBalance;
      try {
        const latestInvoiceByStudentId = await buildLatestInvoiceByStudentIdForTutor(user.id);
        withInvoiceBalance = withPackageBalance.map((s: any) => ({
          ...s,
          latest_invoice: latestInvoiceByStudentId.get(s.id) || null,
        }));
      } catch (e) {
        console.error('[Students] Error fetching latest invoices:', e);
      }

      setStudents(withInvoiceBalance);
      setCache('tutor_students', { students: withInvoiceBalance });
    }
    setLoading(false);
  };

  // Lightweight polling: refresh only `latest_invoice` paid status on cards.
  const refreshLatestInvoices = async () => {
    if (!user) return;
    if (orgPolicy.isOrgTutor) return;

    try {
      const latestInvoiceByStudentId = await buildLatestInvoiceByStudentIdForTutor(user.id);

      setStudents((prev) =>
        prev.map((s) => ({
          ...s,
          latest_invoice: latestInvoiceByStudentId.get(s.id) || null,
        }))
      );
    } catch (e) {
      console.error('[Students] Error refreshing latest invoices (poll):', e);
    }
  };

  // Poll card invoices briefly after payment so tutor UI updates without refresh.
  useEffect(() => {
    if (!user?.id) return;
    if (loading) return;
    if (orgPolicy.isOrgTutor) {
      if (cardInvoicePollRef.current) {
        clearInterval(cardInvoicePollRef.current.intervalId);
        cardInvoicePollRef.current = null;
      }
      return;
    }

    const hasUnpaidVisible = students.some((s) =>
      s.latest_invoice && !s.latest_invoice.paid && !dismissedInvoiceIds.includes(s.latest_invoice.id)
    );

    if (!hasUnpaidVisible) {
      if (cardInvoicePollRef.current) {
        clearInterval(cardInvoicePollRef.current.intervalId);
        cardInvoicePollRef.current = null;
      }
      return;
    }

    if (cardInvoicePollRef.current) return;

    cardInvoicePollRef.current = {
      attempts: 0,
      intervalId: setInterval(() => {
        if (!cardInvoicePollRef.current) return;
        cardInvoicePollRef.current.attempts += 1;
        void refreshLatestInvoices();
        if (cardInvoicePollRef.current.attempts >= 8) {
          clearInterval(cardInvoicePollRef.current.intervalId);
          cardInvoicePollRef.current = null;
        }
      }, 20000),
    };
  }, [user?.id, loading, students, dismissedInvoiceIds, orgPolicy.isOrgTutor]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (cardInvoicePollRef.current) {
        clearInterval(cardInvoicePollRef.current.intervalId);
        cardInvoicePollRef.current = null;
      }
    };
  }, []);

  const fetchSubjects = async () => {
    if (!user) return;

    const { data } = await supabase
      .from('subjects')
      .select('id, name, price, duration_minutes, color')
      .eq('tutor_id', user.id)
      .order('name');

    setSubjects(data || []);
  };

  const openStudentModal = async (student: Student) => {
    setSelectedStudent(student);
    setIsStudentModalOpen(true);
    setLoadingSessions(true);
    setLoadingIndividualPricing(true);

    // Fetch sessions
    const { data } = await supabase
      .from('sessions')
      .select('*')
      .eq('student_id', student.id)
      .order('start_time', { ascending: true });
    setStudentSessions(data || []);
    setLoadingSessions(false);

    // Fetch lesson packages: include unpaid pending (offers) and paid active — useMemo splits them
    let pkgQuery = supabase
      .from('lesson_packages')
      .select('*, subject:subjects(name)')
      .eq('student_id', student.id)
      .order('created_at', { ascending: true });
    if (user?.id) pkgQuery = pkgQuery.eq('tutor_id', user.id);
    const { data: packagesData, error: packagesErr } = await pkgQuery;
    if (packagesErr) {
      console.error('Error fetching lesson packages:', packagesErr);
    }
    setSelectedStudentPackages(packagesData || []);

    // Fetch individual pricing
    const { data: pricingData, error: pricingError } = await supabase
      .from('student_individual_pricing')
      .select('*, subject:subjects(name, color)')
      .eq('student_id', student.id)
      .order('created_at', { ascending: false });

    if (pricingError) {
      console.error('Error fetching individual pricing:', pricingError);
    }
    setStudentIndividualPricing(pricingData || []);
    setLoadingIndividualPricing(false);

    // Refresh latest invoice for this student so UI updates right after "Send invoice"
    try {
      const { data: sessionRows, error: sessionErr } = await supabase
        .from('sessions')
        .select('payment_batch_id')
        .eq('student_id', student.id)
        .eq('tutor_id', user?.id)
        .not('payment_batch_id', 'is', null)
        .order('start_time', { ascending: false })
        .limit(50);

      if (!sessionErr) {
        const batchIds = Array.from(new Set((sessionRows || []).map((r: any) => r.payment_batch_id).filter(Boolean))).slice(0, 10);
        if (batchIds.length > 0) {
          const { data: batches, error: batchErr } = await supabase
            .from('billing_batches')
            .select('id, sent_at, paid, payment_status, total_amount, payment_deadline_date, payer_name, payer_email')
            .in('id', batchIds)
            .order('sent_at', { ascending: false })
            .limit(1);

          if (!batchErr && batches && batches[0]) {
            const b = batches[0] as any;
            setSelectedStudent((prev) => prev ? {
              ...prev,
              latest_invoice: {
                id: b.id,
                sent_at: b.sent_at,
                paid: !!(b.paid || b.payment_status === 'paid'),
                payment_status: b.payment_status,
                total_amount: Number(b.total_amount || 0),
                payment_deadline_date: b.payment_deadline_date,
                payer_name: b.payer_name ?? null,
                payer_email: b.payer_email ?? null,
              },
            } : prev);
          }
        }
      }
    } catch (e) {
      console.error('[Students] Error refreshing latest invoice in modal:', e);
    }
  };

  const generateInviteCode = () => Math.random().toString(36).substring(2, 8).toUpperCase();

  const syncSessionToGoogleCalendar = async (sessionId: string) => {
    try {
      if (!user || !sessionId) return;
      await fetch('/api/google-calendar-sync', {
        method: 'POST',
        headers: await authHeaders(),
        body: JSON.stringify({ userId: user.id, sessionId }),
      });
    } catch (err) {
      console.error('Google Calendar sync after session update failed:', err);
    }
  };

  const handleAddStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    if (!user) { setSaving(false); return; }

    if (newStudent.phone?.trim() && !validateLithuanianPhone(newStudent.phone)) {
      alert(t('stu.phoneFormat'));
      setSaving(false);
      return;
    }

    const inviteCode = generateInviteCode();
    const bookingUrl = `${baseUrl}/book/${inviteCode}`;

    const { data: insertedStudent, error } = await supabase.from('students').insert([
      {
        tutor_id: user.id,
        full_name: newStudent.full_name,
        email: newStudent.email,
        phone: newStudent.phone?.trim() || null,
        invite_code: inviteCode,
      },
    ]).select().single();

    if (!error && insertedStudent) {
      // Save individual pricing if subject selected (org tutor has no pricing UI)
      if (!orgPolicy.hideMoney && selectedSubjectForInvite && customPrice && customDuration) {
        const { error: pricingError } = await supabase.from('student_individual_pricing').insert([{
          student_id: insertedStudent.id,
          tutor_id: user.id,
          subject_id: selectedSubjectForInvite,
          price: customPrice,
          duration_minutes: customDuration,
          cancellation_hours: customCancellationHours,
          cancellation_fee_percent: customCancellationFee,
        }]);
        if (pricingError) {
          console.error('Error saving individual pricing:', pricingError);
          alert(t('stu.priceSaveError') + pricingError.message);
        }
      }
      if (newStudent.email) {
        // Send the invite email
        if (user) {
          sendEmail({
            type: 'invite_email',
            to: newStudent.email,
            data: {
              studentName: newStudent.full_name,
              tutorName: profile?.full_name || 'Korepetitorius',
              inviteCode: inviteCode,
              bookingUrl: bookingUrl
            }
          });
        }
      }

      setIsDialogOpen(false);
      setNewStudent({ full_name: '', email: '', phone: '' });
      setSelectedSubjectForInvite('');
      setCustomPrice('');
      setCustomDuration('');
      setCustomCancellationHours(24);
      setCustomCancellationFee(0);
      fetchStudents();
    }
    setSaving(false);
  };

  const handleDeleteStudent = async (id: string) => {
    if (orgPolicy.isOrgTutor) return;
    if (!confirm(t('stu.deleteConfirm'))) return;
    await supabase.from('students').delete().eq('id', id);
    fetchStudents();
  };

  const copyInviteLink = (code: string, id: string) => {
    const url = `${baseUrl}/book/${code}`;
    navigator.clipboard.writeText(url);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const sendInviteEmail = (student: Student) => {
    const bookingUrl = `${baseUrl}/book/${student.invite_code}`;
    const subject = encodeURIComponent(t('stu.emailSubject'));
    const body = encodeURIComponent(
      `${t('stu.emailSubject')}\n\n${bookingUrl}\n\nCode: ${student.invite_code}`
    );
    window.open(`mailto:${student.email}?subject=${subject}&body=${body}`, '_blank');
  };

  const handleMarkPaid = async () => {
    if (!selectedSessionForModal) return;
    if (!orgPolicy.canToggleSessionPaid) return;
    setSavingSession(true);
    const newPaid = true; // when tutor marks paid manually, we assume true
    const newStatus = 'confirmed';
    const { error } = await supabase.from('sessions').update({ paid: newPaid, payment_status: newStatus }).eq('id', selectedSessionForModal.id);
    if (!error) {
      setIsSessionModalOpen(false);
      fetchAllSessions();
      syncSessionToGoogleCalendar(selectedSessionForModal.id);
    }
    setSavingSession(false);
  };

  const handleRejectPayment = async () => {
    if (!selectedSessionForModal) return;
    if (!orgPolicy.canToggleSessionPaid) return;
    setSavingSession(true);
    // revert to pending
    const { error } = await supabase.from('sessions').update({ paid: false, payment_status: 'pending' }).eq('id', selectedSessionForModal.id);

    if (!error) {
      // Send email to student
      const studentEmail = await supabase.from('students').select('email').eq('id', selectedSessionForModal.student_id).single();
      if (studentEmail?.data?.email && selectedSessionForModal.student && user) {
        await sendEmail({
          type: 'payment_rejection_reminder',
          to: studentEmail.data.email,
          data: {
            studentName: selectedSessionForModal.student.full_name,
            tutorName: profile?.full_name || 'Korepetitorius',
            date: format(new Date(selectedSessionForModal.start_time), 'yyyy-MM-dd'),
            time: format(new Date(selectedSessionForModal.start_time), 'HH:mm')
          }
        });
        setToastMessage({ message: t('dash.reminderSent'), type: 'success' });
      }
      setIsSessionModalOpen(false);
      fetchAllSessions();
      syncSessionToGoogleCalendar(selectedSessionForModal.id);
    } else {
      setToastMessage({ message: t('dash.rejectError'), type: 'error' });
    }
    setSavingSession(false);
  };

  const handleCancelSession = async () => {
    if (!selectedSessionForModal) return;

    if (cancelConfirmId !== selectedSessionForModal.id) {
      setCancelConfirmId(selectedSessionForModal.id);
      setCancellationReason('');
      return;
    }

    if (cancellationReason.trim().length < 5) return;

    setSavingSession(true);
    const { error } = await supabase.from('sessions').update({
      status: 'cancelled',
      cancellation_reason: cancellationReason.trim(),
      cancelled_by: 'tutor'  // Track who cancelled
    }).eq('id', selectedSessionForModal.id);
    if (!error) {
      // Send cancellation emails
      const emailDate = format(new Date(selectedSessionForModal.start_time), 'yyyy-MM-dd');
      const emailTime = format(new Date(selectedSessionForModal.start_time), 'HH:mm');
      const studentName = selectedSessionForModal.student?.full_name || '';

      const { data: studentData } = await supabase.from('students').select('email').eq('id', selectedSessionForModal.student_id || '').single();

      if (studentData?.email && user) {
        sendEmail({
          type: 'session_cancelled',
          to: studentData.email,
          data: { studentName, tutorName: profile?.full_name || '', date: emailDate, time: emailTime, cancelledBy: 'tutor', reason: cancellationReason.trim() },
        });
      }
      if (profile?.email) {
        sendEmail({
          type: 'session_cancelled',
          to: profile.email,
          data: { studentName, tutorName: profile.full_name || '', date: emailDate, time: emailTime, cancelledBy: 'tutor', reason: cancellationReason.trim() },
        });
      }

      setIsSessionModalOpen(false);
      setCancelConfirmId(null);
      setCancellationReason('');
      fetchAllSessions();
      // Full sync: remove cancelled lesson and refresh free time in Google Calendar
      try {
        if (user) {
          await fetch('/api/google-calendar-sync', {
            method: 'POST',
            headers: await authHeaders(),
            body: JSON.stringify({ userId: user.id }),
          });
        }
      } catch (err) {
        console.error('Failed to full-sync Google Calendar after tutor cancellation:', err);
      }
      syncSessionToGoogleCalendar(selectedSessionForModal.id);
    }
    setSavingSession(false);
  };

  const handleMarkCompleted = async () => {
    if (!selectedSessionForModal) return;
    setSavingSession(true);
    const { error } = await supabase
      .from('sessions')
      .update({ status: 'completed', no_show_when: null })
      .eq('id', selectedSessionForModal.id);
    if (!error) {
      setIsSessionModalOpen(false);
      fetchAllSessions();
      syncSessionToGoogleCalendar(selectedSessionForModal.id);
    }
    setSavingSession(false);
  };

  const handleReschedule = async () => {
    if (!selectedSessionForModal || !editNewStartTime) return;
    const oldStart = new Date(selectedSessionForModal.start_time);
    const oldEnd = new Date(selectedSessionForModal.end_time);
    const newStart = new Date(editNewStartTime);
    const durationMs = oldEnd.getTime() - oldStart.getTime();
    const newEnd = new Date(newStart.getTime() + durationMs);

    setSavingSession(true);
    const { error } = await supabase
      .from('sessions')
      .update({ start_time: newStart.toISOString(), end_time: newEnd.toISOString() })
      .eq('id', selectedSessionForModal.id);

    if (!error) {
      const updated = {
        ...selectedSessionForModal,
        start_time: newStart.toISOString(),
        end_time: newEnd.toISOString(),
      };
      setSelectedSessionForModal(updated);
      setAllSessions((prev) => prev.map((s: any) => (s.id === updated.id ? { ...s, ...updated } : s)));
      setIsEditingTime(false);
      syncSessionToGoogleCalendar(selectedSessionForModal.id);
      setToastMessage({ message: 'Pamokos laikas atnaujintas', type: 'success' });
    } else {
      setToastMessage({ message: 'Nepavyko pakeisti pamokos laiko', type: 'error' });
    }
    setSavingSession(false);
  };

  const handleRevertLessonToPlanned = async () => {
    if (!selectedSessionForModal) return;
    setSavingSession(true);
    const { error } = await supabase
      .from('sessions')
      .update({ status: 'active', no_show_when: null })
      .eq('id', selectedSessionForModal.id);
    if (!error) {
      const updated = { ...selectedSessionForModal, status: 'active' as const, no_show_when: null };
      setSelectedSessionForModal(updated);
      setAllSessions((prev) => prev.map((s: any) => (s.id === updated.id ? { ...s, ...updated } : s)));
      fetchAllSessions();
      syncSessionToGoogleCalendar(selectedSessionForModal.id);
    }
    setSavingSession(false);
  };

  const confirmMarkStudentNoShow = async (when: NoShowWhen) => {
    if (!selectedSessionForModal) return;
    setSavingSession(true);
    const patch = buildNoShowSessionPatch(when, selectedSessionForModal.tutor_comment);
    const { error } = await supabase.from('sessions').update(patch).eq('id', selectedSessionForModal.id);
    if (!error) {
      setNoShowPickerOpen(false);
      const updated = {
        ...selectedSessionForModal,
        status: 'no_show' as const,
        no_show_when: when,
        tutor_comment: patch.tutor_comment,
      };
      setSelectedSessionForModal(updated);
      setAllSessions((prev) => prev.map((s: any) => (s.id === updated.id ? { ...s, ...updated } : s)));
      fetchAllSessions();
      syncSessionToGoogleCalendar(selectedSessionForModal.id);
      void (async () => {
        await fetch('/api/notify-session-no-show', {
          method: 'POST',
          headers: await authHeaders(),
          body: JSON.stringify({ sessionId: selectedSessionForModal.id }),
        });
      })().catch(() => {});
    }
    setSavingSession(false);
  };

  const handleSaveViewComment = async () => {
    if (!selectedSessionForModal) return;
    setViewCommentSaving(true);
    const effectiveShowToStudent = forceTrialCommentVisibility ? true : viewShowToStudent;

    const { data: { user: authUser } } = await supabase.auth.getUser();
    const { data: tutorProfile } = await supabase
      .from('profiles')
      .select('full_name, organization_id')
      .eq('id', authUser?.id)
      .single();

    const { error } = await supabase
      .from('sessions')
      .update({
        tutor_comment: viewCommentText.trim() || null,
        show_comment_to_student: effectiveShowToStudent,
      })
      .eq('id', selectedSessionForModal.id);

    if (!error) {
      const updated = {
        ...selectedSessionForModal,
        tutor_comment: viewCommentText.trim() || null,
        show_comment_to_student: effectiveShowToStudent,
      };
      setSelectedSessionForModal(updated);
      setAllSessions((prev) => prev.map((s: any) => (s.id === updated.id ? { ...s, ...updated } : s)));

      if (effectiveShowToStudent && viewCommentText.trim()) {
        const alreadySent = selectedSessionForModal.show_comment_to_student && selectedSessionForModal.tutor_comment === viewCommentText.trim();
        if (!alreadySent) {
          let studentEmail = selectedSessionForModal.student?.email;
          let payerEmail: string | null = null;
          if (selectedSessionForModal.student_id) {
            const { data: studentRow } = await supabase
              .from('students')
              .select('email, payer_email, full_name')
              .eq('id', selectedSessionForModal.student_id)
              .single();
            if (!studentEmail) studentEmail = studentRow?.email;
            payerEmail = (studentRow?.payer_email || null) as any;
          }
          if (studentEmail) {
            let to: string | string[] = studentEmail;
            try {
              const orgId = (tutorProfile as any)?.organization_id as string | null | undefined;
              const subjectId = (selectedSessionForModal as any)?.subject_id as string | null | undefined;
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
              // ignore parent decision errors
            }

            await sendEmail({
              type: 'session_comment_added',
              to,
              data: {
                studentName: updated.student?.full_name || '',
                tutorName: tutorProfile?.full_name || '',
                date: format(new Date(selectedSessionForModal.start_time), 'yyyy-MM-dd'),
                time: format(new Date(selectedSessionForModal.start_time), 'HH:mm'),
                comment: viewCommentText.trim(),
              },
            }).catch(() => {});
          }
        }
      }
    }

    setViewCommentSaving(false);
  };

  // Individual pricing CRUD operations
  const handleAddIndividualPrice = async () => {
    if (!selectedStudent || !newPriceSubject || !newPriceAmount || !newPriceDuration) {
      alert(t('stu.fillAll'));
      return;
    }

    setSavingIndividualPrice(true);
    if (!user) {
      setSavingIndividualPrice(false);
      return;
    }

    const { error } = await supabase.from('student_individual_pricing').insert([{
      student_id: selectedStudent.id,
      tutor_id: user.id,
      subject_id: newPriceSubject,
      price: newPriceAmount,
      duration_minutes: newPriceDuration,
      cancellation_hours: newPriceCancellationHours,
      cancellation_fee_percent: newPriceCancellationFee,
    }]);

    if (error) {
      if (error.code === '23505') {
        alert(t('stu.alreadyHasPrice'));
      } else {
        alert(t('stu.priceError') + error.message);
      }
    } else {
      setAddingNewPrice(false);
      setNewPriceSubject('');
      setNewPriceAmount('');
      setNewPriceDuration('');
      setNewPriceCancellationHours(24);
      setNewPriceCancellationFee(0);
      // Refresh individual pricing
      if (selectedStudent) {
        const { data: pricingData } = await supabase
          .from('student_individual_pricing')
          .select('*, subject:subjects(name, color)')
          .eq('student_id', selectedStudent.id)
          .order('created_at', { ascending: false });
        setStudentIndividualPricing(pricingData || []);
      }
    }
    setSavingIndividualPrice(false);
  };

  const handleDeleteIndividualPrice = async (priceId: string) => {
    if (!confirm(t('stu.deletePriceConfirm'))) return;
    setSavingIndividualPrice(true);
    const { error } = await supabase.from('student_individual_pricing').delete().eq('id', priceId);
    if (!error && selectedStudent) {
      const { data: pricingData } = await supabase
        .from('student_individual_pricing')
        .select('*, subject:subjects(name, color)')
        .eq('student_id', selectedStudent.id)
        .order('created_at', { ascending: false });
      setStudentIndividualPricing(pricingData || []);
    }
    setSavingIndividualPrice(false);
  };

  const showPaymentModelUi =
    !orgPolicy.hideMoney &&
    !checkingOrgStatus &&
    !orgFeaturesLoading &&
    isPerStudentPaymentOverrideEnabled(
      hasFeature('per_student_payment_override'),
      soloPaymentOverrideEnabled,
      !!profile?.organization_id,
    );
  const paymentActions = useMemo(() => {
    if (!selectedStudent) return { canSendInvoice: false, canSendPackage: false };
    return getEffectivePaymentActions(tutorPaymentFlags, selectedStudent.payment_model, showPaymentModelUi);
  }, [selectedStudent, tutorPaymentFlags, showPaymentModelUi]);

  const activeStudentPackages = useMemo(
    () =>
      selectedStudentPackages.filter(
        (p: any) => p.paid && p.active && Number(p.available_lessons) > 0,
      ),
    [selectedStudentPackages],
  );
  const pendingStudentPackages = useMemo(
    () => selectedStudentPackages.filter((p: any) => !p.paid && p.payment_status === 'pending'),
    [selectedStudentPackages],
  );

  const handleConfirmManualPayment = async (packageId: string) => {
    setConfirmingPackageId(packageId);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch('/api/confirm-manual-payment', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({ packageId }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error((json as any).error || t('stu.confirmFailed'));
      }
      setToastMessage({ message: t('stu.paymentConfirmed'), type: 'success' });
      if (selectedStudent) {
        const { data } = await supabase
          .from('lesson_packages')
          .select('*, subject:subjects(name, color)')
          .eq('student_id', selectedStudent.id)
          .or('active.eq.true,payment_status.eq.pending')
          .order('created_at', { ascending: false });
        setSelectedStudentPackages(data || []);
      }
    } catch (e: any) {
      setToastMessage({ message: e?.message || t('stu.confirmFailed'), type: 'error' });
    }
    setConfirmingPackageId(null);
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
      <div className="max-w-4xl mx-auto animate-fade-in">
        <Tabs defaultValue="mokiniai" className="w-full">
          {/* Header */}
          <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-start mb-6">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 mb-3">Mokiniai</h1>
              <TabsList className="bg-gray-100/80 p-1">
                <TabsTrigger value="mokiniai" className="text-sm px-4 sm:px-6">Mokiniai ({students.length})</TabsTrigger>
                <TabsTrigger value="pamokos" className="text-sm px-4 sm:px-6">Visos pamokos</TabsTrigger>
              </TabsList>
            </div>
            {!checkingOrgStatus && !orgPolicy.isOrgTutor && (
              <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogTrigger asChild>
                  <Button className="gap-2 rounded-xl w-full sm:w-auto">
                    <Plus className="w-4 h-4" />
                    {t('stu.addStudent')}
                  </Button>
                </DialogTrigger>
                <DialogContent className="w-[95vw] sm:max-w-[420px] max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>{t('stu.addNewStudent')}</DialogTitle>
                    <DialogDescription>
                      {t('stu.addStudentDesc')}
                    </DialogDescription>
                  </DialogHeader>
                  <form onSubmit={handleAddStudent}>
                    <div className="grid gap-4 py-4">
                      <div className="space-y-2">
                        <Label>{t('stu.fullName')}</Label>
                        <Input
                          value={newStudent.full_name}
                          onChange={(e) => setNewStudent({ ...newStudent, full_name: e.target.value })}
                          placeholder="Jonas Jonaitis"
                          className="rounded-xl"
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>{t('stu.emailLabel')}</Label>
                        <Input
                          type="email"
                          value={newStudent.email}
                          onChange={(e) => setNewStudent({ ...newStudent, email: e.target.value })}
                          placeholder="jonas@example.com"
                          className="rounded-xl"
                        />
                        <p className="text-xs text-gray-500 flex items-start gap-1.5">
                          <Mail className="w-3.5 h-3.5 flex-shrink-0 mt-0.5 text-blue-500" />
                          <span>
                            <span dangerouslySetInnerHTML={{ __html: t('stu.emailDesc') }} />
                          </span>
                        </p>
                      </div>
                      <div className="space-y-2">
                        <Label>Telefonas</Label>
                        <Input
                          value={newStudent.phone}
                          onChange={(e) => setNewStudent({ ...newStudent, phone: formatLithuanianPhone(e.target.value) })}
                          placeholder="+370 600 00000"
                          className="rounded-xl"
                        />
                      </div>

                      {/* Individual Pricing (Optional) */}
                      {!orgPolicy.hideMoney && (
                      <div className="border-t border-gray-200 pt-4 space-y-3">
                        <div className="flex items-center gap-2 mb-2">
                          <Sparkles className="w-4 h-4 text-amber-500" />
                          <Label className="text-sm font-semibold">Individuali kaina (neprivaloma)</Label>
                        </div>

                        <div className="space-y-2">
                          <Label className="text-xs text-gray-600">Dalykas</Label>
                          <Select value={selectedSubjectForInvite} onValueChange={setSelectedSubjectForInvite}>
                            <SelectTrigger className="rounded-xl">
                              <SelectValue placeholder={t('stu.selectSubject')} />
                            </SelectTrigger>
                            <SelectContent>
                              {subjects.map((subj) => (
                                <SelectItem key={subj.id} value={subj.id}>
                                  <div className="flex items-center gap-2">
                                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: subj.color }} />
                                    {subj.name}
                                  </div>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        {selectedSubjectForInvite && (
                          <>
                            <div className="grid grid-cols-2 gap-3">
                              <div className="space-y-2">
                                <Label className="text-xs text-gray-600">{t('lessonSet.priceLabel')}</Label>
                                <Input
                                  type="number"
                                  value={customPrice}
                                  onChange={(e) => setCustomPrice(e.target.value ? parseFloat(e.target.value) : '')}
                                  placeholder="25"
                                  className="rounded-xl"
                                  min="0"
                                  step="0.01"
                                />
                              </div>
                              <div className="space-y-2">
                                <Label className="text-xs text-gray-600">{t('stu.durationMin')}</Label>
                                <Input
                                  type="number"
                                  value={customDuration}
                                  onChange={(e) => setCustomDuration(e.target.value ? parseInt(e.target.value) : '')}
                                  placeholder="60"
                                  className="rounded-xl"
                                  min="1"
                                />
                              </div>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                              <div className="space-y-2">
                                <Label className="text-xs text-gray-600">{t('stu.cancellationH')}</Label>
                                <Select
                                  value={customCancellationHours.toString()}
                                  onValueChange={(v) => setCustomCancellationHours(parseInt(v))}
                                >
                                  <SelectTrigger className="rounded-xl">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {[2, 6, 12, 24, 48].map((h) => (
                                      <SelectItem key={h} value={h.toString()}>{h} val.</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                              <div className="space-y-2">
                                <Label className="text-xs text-gray-600">Bauda (%)</Label>
                                <Select
                                  value={customCancellationFee.toString()}
                                  onValueChange={(v) => setCustomCancellationFee(parseInt(v))}
                                >
                                  <SelectTrigger className="rounded-xl">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {[0, 25, 50, 75, 100].map((p) => (
                                      <SelectItem key={p} value={p.toString()}>{p}%</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                            </div>
                          </>
                        )}
                      </div>
                      )}

                      <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-3">
                        <p className="text-xs text-indigo-700">
                          {t('stu.autoEmailTip')}
                        </p>
                      </div>
                    </div>
                    <DialogFooter>
                      <Button variant="outline" type="button" onClick={() => setIsDialogOpen(false)} className="rounded-xl">
                        {t('stu.cancelBtn')}
                      </Button>
                      <Button type="submit" disabled={saving} className="rounded-xl gap-2">
                        <Plus className="w-4 h-4" />
                        {saving ? t('stu.saving') : t('stu.addAndSend')}
                      </Button>
                    </DialogFooter>
                  </form>
                </DialogContent>
              </Dialog>
            )}
          </div>

          <TabsContent value="mokiniai" className="m-0 focus-visible:outline-none">
            {loading ? (
              <div className="space-y-3">
                {[1, 2, 3].map(i => <div key={i} className="h-24 bg-white rounded-2xl border animate-pulse" />)}
              </div>
            ) : students.length === 0 ? (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
                <div className="text-center py-16 px-6">
                  <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4">
                    <User className="w-8 h-8 text-gray-300" />
                  </div>
                  <p className="text-gray-500 font-medium">{t('stu.noStudents')}</p>
                  <p className="text-gray-400 text-sm mt-1">{t('stu.addFirstTip')}</p>
                </div>
              </div>
            ) : (
              <div className="grid gap-3">
                {students.map((student, idx) => {
                  const bookingUrl = `${baseUrl}/book/${student.invite_code}`;
                  const isCopied = copiedId === student.id;
                  const initials = student.full_name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
                  const visibleEmail = contactVisibility
                    ? formatContactForTutorView(student.email, student.payer_email, contactVisibility.tutorSeesStudentEmail)
                    : ((orgPolicy.isOrgTutor || orgPolicy.loading) ? '—' : (student.email || '—'));
                  const visiblePhone = contactVisibility
                    ? formatContactForTutorView(student.phone, student.payer_phone, contactVisibility.tutorSeesStudentPhone)
                    : ((orgPolicy.isOrgTutor || orgPolicy.loading) ? '—' : (student.phone || '—'));
                  return (
                    <div
                      key={student.id}
                      onClick={(e) => {
                        if ((e.target as HTMLElement).closest('button') || (e.target as HTMLElement).closest('a')) return;
                        openStudentModal(student);
                      }}
                      className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 animate-fade-in cursor-pointer hover:shadow-md transition-shadow"
                      style={{ animationDelay: `${idx * 40}ms` }}
                    >
                      <div className="flex items-start gap-4">
                        {/* Avatar */}
                        <div className="w-11 h-11 rounded-full bg-gradient-to-br from-indigo-400 to-indigo-600 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                          {initials || '?'}
                        </div>

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <div className="flex items-center gap-2 flex-wrap">
                                <p className="font-semibold text-gray-900">{student.full_name}</p>
                                {student.grade && (
                                  <span className="inline-flex items-center text-xs bg-indigo-50 text-indigo-700 px-2.5 py-1 rounded-lg border border-indigo-200 font-semibold">
                                    {student.grade}
                                  </span>
                                )}
                                <Badge className={cn(
                                  "text-xs",
                                  student.linked_user_id
                                    ? "bg-green-100 text-green-700"
                                    : "bg-orange-100 text-orange-700"
                                )}>
                                  {student.linked_user_id ? t('stu.connected') : t('stu.notConnected')}
                                </Badge>
                                {!orgPolicy.isOrgTutor && student.has_package && (
                                  <span className="inline-flex items-center gap-1 text-xs bg-violet-50 text-violet-700 px-2.5 py-1 rounded-lg border border-violet-200 font-semibold">
                                    <Package className="w-3 h-3" />
                                    {t('stu.lessonCount', { remaining: String(student.remaining_lessons || 0), total: String(student.total_lessons || ((student.remaining_lessons || 0) + (student.used_lessons || 0))) })}
                                  </span>
                                )}
                                {!orgPolicy.isOrgTutor && (
                                  student.latest_invoice ? (
                                    dismissedInvoiceIds.includes(student.latest_invoice.id) ? null : (
                                      <span
                                        className={cn(
                                          'inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg border font-semibold',
                                          student.latest_invoice.paid
                                            ? 'bg-green-50 text-green-700 border-green-200'
                                            : 'bg-amber-50 text-amber-700 border-amber-200'
                                        )}
                                      >
                                        <FileText className="w-3.5 h-3.5" />
                                        {t('stu.invoiceLabel')}: {student.latest_invoice.paid ? t('stuSess.paid') : t('dash.unpaid')}
                                        <span className="ml-1 text-[11px] opacity-80 font-medium">
                                          {student.latest_invoice.sent_at
                                            ? format(new Date(student.latest_invoice.sent_at), 'dd.MM.yyyy', { locale: dateFnsLocale })
                                            : ''}
                                        </span>
                                        <button
                                          type="button"
                                          className={cn(
                                            "ml-2 inline-flex items-center gap-1 text-[11px] font-bold rounded-lg px-1.5 py-0.5 transition-colors",
                                            student.latest_invoice.paid
                                              ? "text-green-800 hover:text-green-900 bg-green-100 hover:bg-green-200"
                                              : "text-amber-800 hover:text-amber-900 bg-amber-100 hover:bg-amber-200"
                                          )}
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            dismissInvoiceBadge(student.latest_invoice!.id);
                                          }}
                                          title={t('stu.closeInvoice')}
                                        >
                                          <XCircle className="w-3 h-3" />
                                          {t('stu.close')}
                                        </button>
                                      </span>
                                    )
                                  ) : (
                                    <span className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg border border-gray-200 text-gray-500 font-semibold">
                                      <FileText className="w-3.5 h-3.5" />
                                      {t('stu.invoiceNotSent')}
                                    </span>
                                  )
                                )}
                              </div>
                              <div className="flex flex-wrap gap-3 mt-1">
                                <span className="text-xs text-gray-500">{visibleEmail}</span>
                                <span className="text-xs text-gray-500">{visiblePhone}</span>
                              </div>
                            </div>
                            {!orgPolicy.isOrgTutor && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeleteStudent(student.id);
                                }}
                                className="p-1.5 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors flex-shrink-0"
                                aria-label={t('stu.deleteStudent')}
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>

                          {/* Invite code section */}
                          {!orgPolicy.isOrgTutor && !orgPolicy.loading && student.invite_code && (
                            <div className="mt-3 p-3 bg-gray-50 rounded-xl border border-gray-100">
                              <div className="flex items-center justify-between gap-2 flex-wrap">
                                <div>
                                  <p className="text-xs text-gray-400 mb-1">Pakvietimo kodas</p>
                                  <div className="flex items-center gap-2">
                                    <code className="font-mono font-bold text-indigo-700 text-sm tracking-widest bg-indigo-50 px-2 py-0.5 rounded-lg">
                                      {student.invite_code}
                                    </code>
                                    <span className="text-xs text-gray-400 truncate max-w-[200px] hidden sm:block">
                                      /book/{student.invite_code}
                                    </span>
                                  </div>
                                </div>
                                <div className="flex items-center gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => copyInviteLink(student.invite_code, student.id)}
                                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${isCopied
                                      ? 'bg-green-50 border-green-200 text-green-700'
                                      : 'bg-white border-gray-200 text-gray-600 hover:border-indigo-300 hover:text-indigo-600'
                                      }`}
                                    title={t('stu.copyLink')}
                                  >
                                    {isCopied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                                    {isCopied ? 'Nukopijuota!' : 'Kopijuoti'}
                                  </button>
                                  {student.email && (
                                    <button
                                      type="button"
                                      onClick={() => sendInviteEmail(student)}
                                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
                                      title={t('stu.sendEmail')}
                                    >
                                      <Mail className="w-3.5 h-3.5" />
                                      {t('stu.send')}
                                    </button>
                                  )}
                                  <a
                                    href={bookingUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="flex items-center gap-1 p-1.5 rounded-lg text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
                                    title={t('stu.openBooking')}
                                  >
                                    <ExternalLink className="w-3.5 h-3.5" />
                                  </a>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </TabsContent>

          <TabsContent value="pamokos" className="m-0 focus-visible:outline-none">
            <div className="space-y-4">
              {/* Date Range Filter */}
              <DateRangeFilter
                startDate={filterStartDate}
                endDate={filterEndDate}
                onStartDateChange={setFilterStartDate}
                onEndDateChange={setFilterEndDate}
                onClear={() => {
                  setFilterStartDate(null);
                  setFilterEndDate(null);
                  setIsFilterActive(false);
                }}
                onSearch={() => setIsFilterActive(true)}
              />

              {/* Session Statistics */}
              {isFilterActive && (
                <>
                  {loadingAllSessions ? (
                    <div className="text-center py-4 text-gray-500">Kraunamos statistikos...</div>
                  ) : (
                    (() => {
                      const stats = calculateSessionStats(allSessions as Session[], filterStartDate, filterEndDate);
                      return (
                        <SessionStatCards
                          totalSuccessful={stats.totalSuccessful}
                          totalStudentNoShow={stats.totalStudentNoShow}
                          totalCancelled={stats.totalCancelled}
                          showCancellationDetails={true}
                          cancelledByTutor={stats.cancelledByTutor}
                          cancelledByStudent={stats.cancelledByStudent}
                        />
                      );
                    })()
                  )}

                  {/* Students List with Statistics */}
                  <div className="grid gap-3">
                    {(() => {
                      const studentsStats = getAllStudentsStats(allSessions as Session[], filterStartDate, filterEndDate);
                      return studentsStats.map((studentStat) => {
                        const student = students.find(s => s.id === studentStat.studentId);
                        if (!student) return null;

                        return (
                          <div
                            key={student.id}
                            onClick={() => {
                              setSelectedStudentForFilter(student);
                              setIsFilteredModalOpen(true);
                            }}
                            className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 cursor-pointer hover:shadow-md transition-all"
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-400 to-indigo-600 flex items-center justify-center text-white font-bold text-sm">
                                  {student.full_name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                                </div>
                                <div>
                                  <p className="font-semibold text-gray-900">{student.full_name}</p>
                                  <div className="flex gap-2 mt-1">
                                    <span className="inline-flex items-center gap-1 text-xs bg-green-50 text-green-700 px-2 py-0.5 rounded-lg border border-green-200">
                                      <CheckCircle className="w-3 h-3" />
                                      {studentStat.totalSuccessful} {t('stu.occurred')}
                                    </span>
                                    <span className="inline-flex items-center gap-1 text-xs bg-red-50 text-red-700 px-2 py-0.5 rounded-lg border border-red-200">
                                      <XCircle className="w-3 h-3" />
                                      {studentStat.totalCancelled} {t('stu.cancelledCount')}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      });
                    })()}
                  </div>
                </>
              )}

              {/* Original Sessions List (when filter not active) */}
              {!isFilterActive && (
                <>
                  {loadingAllSessions ? (
                    <div className="space-y-3">
                      {[1, 2, 3].map(i => <div key={i} className="h-20 bg-white rounded-2xl border animate-pulse" />)}
                    </div>
                  ) : allSessions.length === 0 ? (
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
                      <div className="text-center py-16 px-6">
                        <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4">
                          <CalendarDays className="w-8 h-8 text-gray-300" />
                        </div>
                        <p className="text-gray-500 font-medium">{t('stu.noSessions')}</p>
                      </div>
                    </div>
                  ) : (
                    <div className="grid gap-3">
                      {allSessions.map((session, idx) => {
                    const start = new Date(session.start_time);
                    const isUpcoming = isAfter(start, new Date()) && session.status === 'active';
                    return (
                      <div
                        key={session.id}
                        onClick={() => { setSelectedSessionForModal(session); setIsSessionModalOpen(true); }}
                        className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 cursor-pointer hover:shadow-md transition-all flex items-center gap-4 animate-fade-in"
                        style={{ animationDelay: `${idx * 20}ms` }}
                      >
                        <div className={cn("w-2 h-12 rounded-full flex-shrink-0",
                          session.payment_status === 'paid_by_student' ? "bg-green-500" :
                            isUpcoming ? "bg-blue-500" :
                              session.status === 'cancelled' ? "bg-red-400" : "bg-gray-300"
                        )} />
                        <div className="flex-1 min-w-0">
                          <div className="flex justify-between items-start mb-1">
                            <div className="flex items-center gap-2">
                              <p className="font-semibold text-gray-900 pr-2">{session.student?.full_name}</p>
                              <div className="scale-90 origin-left">
                                <StatusBadge status={session.status} paymentStatus={session.payment_status} paid={session.paid} hidePaymentStatus={orgPolicy.isOrgTutor} endTime={session.end_time} />
                              </div>
                            </div>
                            {!orgPolicy.hideMoney && session.price && (
                              <span className="font-bold text-gray-700">€{session.price}</span>
                            )}
                          </div>
                          <p className="text-sm text-gray-500 flex items-center gap-2">
                            <CalendarDays className="w-4 h-4" />
                            {format(start, "EEE d MMM yyyy, HH:mm", { locale: dateFnsLocale })}
                            {session.topic && <span className="ml-2 font-medium text-gray-700">· {session.topic}</span>}
                          </p>
                        </div>
                      </div>
                      )
                      })}
                    </div>
                  )}
                </>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* Student Details Modal */}
      <Dialog open={isStudentModalOpen} onOpenChange={setIsStudentModalOpen}>
        <DialogContent className="w-[95vw] sm:max-w-2xl lg:max-w-3xl xl:max-w-4xl max-h-[90vh] overflow-y-auto p-5 sm:p-6">
          <DialogHeader>
            <DialogTitle>Mokinio informacija</DialogTitle>
          </DialogHeader>
          {selectedStudent && (
            <div className="space-y-5">
              <div className="flex flex-col gap-4 md:flex-row md:justify-between md:items-start pt-1 border-b border-gray-100 pb-5">
                <div className="min-w-0 flex-1">
                  <h3 className="text-xl font-bold">{selectedStudent.full_name}</h3>
                  {selectedStudent.grade && (
                    <p className="text-indigo-600 text-sm font-semibold mt-1">📚 {selectedStudent.grade}</p>
                  )}
                    <p className="text-gray-500 text-sm mt-1">
                      {contactVisibility
                        ? formatContactForTutorView(selectedStudent.email, selectedStudent.payer_email, contactVisibility.tutorSeesStudentEmail)
                        : ((orgPolicy.isOrgTutor || orgPolicy.loading) ? '—' : selectedStudent.email)}
                    </p>
                    <p className="text-gray-500 text-sm">
                      {contactVisibility
                        ? formatContactForTutorView(selectedStudent.phone, selectedStudent.payer_phone, contactVisibility.tutorSeesStudentPhone)
                        : ((orgPolicy.isOrgTutor || orgPolicy.loading) ? '—' : (selectedStudent.phone || '—'))}
                    </p>
                    {shouldShowPayerContactSection(selectedStudent) && (
                      (contactVisibility ? (
                        contactVisibility.tutorSeesStudentEmail === 'both' ||
                        contactVisibility.tutorSeesStudentEmail === 'parent' ||
                        contactVisibility.tutorSeesStudentPhone === 'both' ||
                        contactVisibility.tutorSeesStudentPhone === 'parent'
                      ) : !(orgPolicy.isOrgTutor || orgPolicy.loading))
                    ) && (
                    <div className="mt-3 pt-3 border-t border-gray-100 text-sm text-gray-600 space-y-1">
                      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{t('stu.payerParent')}</p>
                      <p className="flex items-center gap-1.5">
                        <Mail className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                          {(!contactVisibility || contactVisibility.tutorSeesStudentEmail === 'both' || contactVisibility.tutorSeesStudentEmail === 'parent')
                            ? ((selectedStudent.payer_email || '').trim() || '—')
                            : '—'}
                      </p>
                      <p className="flex items-center gap-1.5">
                        <User className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                          {(!contactVisibility || contactVisibility.tutorSeesStudentPhone === 'both' || contactVisibility.tutorSeesStudentPhone === 'parent')
                            ? ((selectedStudent.payer_phone || '').trim() || '—')
                            : '—'}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {loadingSessions ? (
                <p className="text-sm text-gray-500 text-center py-8">Kraunama istorija...</p>
              ) : (
                <div className="space-y-5">
                  <div className={cn('grid gap-3 text-sm sm:grid-cols-2', orgPolicy.hideMoney ? 'grid-cols-1' : 'grid-cols-2')}>
                    <div className="bg-gray-50 p-4 rounded-xl border border-gray-100 text-center">
                      <p className="text-gray-500 mb-1 font-medium text-xs uppercase tracking-wider">{t('stu.completedSessions')}</p>
                      <p className="font-black text-2xl text-gray-900">{studentSessions.filter(s => new Date(s.end_time) < new Date() && s.status !== 'cancelled').length}</p>
                    </div>
                    {!orgPolicy.hideMoney && (
                    <div className="bg-amber-50 p-4 rounded-xl border border-amber-100 text-center">
                      <p className="text-amber-700 mb-1 font-medium text-xs uppercase tracking-wider">{t('stu.unpaidAmount')}</p>
                      <p className="font-black text-2xl text-amber-600">
                        €{studentSessions.filter(s => !s.paid && new Date(s.end_time) < new Date() && s.status !== 'cancelled').reduce((sum, s) => sum + (s.price || 0), 0).toFixed(2)}
                      </p>
                    </div>
                    )}
                  </div>

                  {/* Pending package offers (sent, not paid yet) */}
                  {!orgPolicy.isOrgTutor && pendingStudentPackages.length > 0 && (
                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <Package className="w-4 h-4 text-amber-700" />
                        <p className="text-sm font-bold text-amber-900">{t('stu.pendingPackages')}</p>
                      </div>
                      <p className="text-xs text-amber-800 mb-3">{t('stu.pendingPackagesHint')}</p>
                      <div className="space-y-2">
                        {pendingStudentPackages.map((pkg: any) => {
                          const n = Number(pkg.total_lessons) || 0;
                          const unit =
                            n === 1 ? t('package.lessonUnit1') : n < 10 ? t('package.lessonUnit2to9') : t('package.lessonUnit10plus');
                          return (
                          <div key={pkg.id} className="flex items-center justify-between text-xs gap-2 flex-wrap">
                            <span className="font-medium text-amber-900">
                              {pkg.subject?.name || pkg.subjects?.name || '—'} · {n} {unit}
                            </span>
                            <div className="flex items-center gap-2">
                              <span className="text-amber-700">
                                {format(new Date(pkg.created_at), 'd MMM yyyy HH:mm', { locale: dateFnsLocale })}
                              </span>
                              {pkg.payment_method === 'manual' && (
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  className="h-6 text-[11px] rounded-lg border-violet-300 text-violet-800 px-2"
                                  disabled={confirmingPackageId === pkg.id}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    void handleConfirmManualPayment(pkg.id);
                                  }}
                                >
                                  {confirmingPackageId === pkg.id ? <Loader2 className="w-3 h-3 animate-spin" /> : t('stu.confirmPayment')}
                                </Button>
                              )}
                            </div>
                          </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Lesson Packages (paid & active) */}
                  {!orgPolicy.isOrgTutor && activeStudentPackages.length > 0 && (
                    <div className="bg-violet-50 border border-violet-200 rounded-xl p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <Package className="w-4 h-4 text-violet-700" />
                        <p className="text-sm font-bold text-violet-800">
                          {t('stu.activePackages')} {activeStudentPackages.length > 1 && `(${activeStudentPackages.length})`}
                        </p>
                      </div>
                      {activeStudentPackages.length > 1 && (
                        <p className="text-sm text-violet-700 mb-3">
                          <strong>
                            {t('stu.totalRemaining', {
                              count: String(
                                activeStudentPackages.reduce((sum, p) => sum + Number(p.available_lessons || 0), 0),
                              ),
                            })}
                          </strong>
                        </p>
                      )}
                      <div
                        className={cn(
                          'space-y-2.5',
                          activeStudentPackages.length > 1 && 'pt-2 border-t border-violet-200',
                        )}
                      >
                        {activeStudentPackages.map((pkg: any, idx: number) => {
                          const subjectName =
                            pkg.subject?.name || pkg.subjects?.name || t('stu.subjectUnknown');
                          const avail = Number(pkg.available_lessons) || 0;
                          const tot = Number(pkg.total_lessons) || 0;
                          return (
                            <div
                              key={pkg.id}
                              className="flex items-center justify-between gap-3 text-sm"
                            >
                              <div className="min-w-0 flex items-baseline gap-2">
                                {activeStudentPackages.length > 1 && (
                                  <span className="text-violet-500 text-xs font-semibold tabular-nums shrink-0">
                                    #{idx + 1}
                                  </span>
                                )}
                                <span className="font-semibold text-violet-900 truncate">{subjectName}</span>
                              </div>
                              <span className="text-violet-800 font-semibold tabular-nums text-xs sm:text-sm shrink-0">
                                {t('stu.activePackageLessonsShort', {
                                  available: String(avail),
                                  total: String(tot),
                                })}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Invoice status — org-only (org korepetitoriui nerodome) */}
                  {!orgPolicy.isOrgTutor && (
                    selectedStudent.latest_invoice ? (
                      dismissedInvoiceIds.includes(selectedStudent.latest_invoice.id) ? null : (
                        <div className={cn(
                          'bg-indigo-50 border border-indigo-100 rounded-xl p-4 mt-3',
                          selectedStudent.latest_invoice.paid ? 'bg-green-50 border-green-100' : 'bg-amber-50 border-amber-100'
                        )}>
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-xs text-gray-600 mb-1 font-medium">{t('stu.invoiceLabel')}</p>
                              <p className="text-sm font-semibold text-gray-900">
                                {selectedStudent.latest_invoice.paid ? t('stu.sentPaid') : t('stu.sentUnpaid')}
                              </p>
                              <p className="text-xs text-gray-600 mt-1">
                                {t('stu.sentDate')} {format(new Date(selectedStudent.latest_invoice.sent_at), 'd MMM yyyy', { locale: dateFnsLocale })}
                              </p>
                              <p className="text-xs text-gray-600">
                                {t('stu.sentTo')} {selectedStudent.latest_invoice.payer_name || selectedStudent.latest_invoice.payer_email || '—'}
                              </p>
                              {!orgPolicy.hideMoney && (
                              <p className="text-xs text-gray-600">
                                {t('stu.invoiceAmount')} €{Number(selectedStudent.latest_invoice.total_amount || 0).toFixed(2)}
                              </p>
                              )}
                            </div>
                            <div className="flex-shrink-0 flex flex-col items-center gap-2">
                              <FileText className={cn(
                                'w-6 h-6',
                                selectedStudent.latest_invoice.paid ? 'text-green-700' : 'text-amber-700'
                              )} />
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className={cn(
                                  "h-7 px-2 text-xs font-semibold",
                                  selectedStudent.latest_invoice.paid
                                    ? "text-green-700 hover:text-green-800 hover:bg-green-100"
                                    : "text-amber-700 hover:text-amber-800 hover:bg-amber-100"
                                )}
                                onClick={() => dismissInvoiceBadge(selectedStudent.latest_invoice!.id)}
                              >
                                <XCircle className="w-3 h-3 mr-1" />
                                {t('stu.close')}
                              </Button>
                            </div>
                          </div>
                        </div>
                      )
                    ) : (
                      <div className="bg-gray-50 border border-gray-100 rounded-xl p-4 mt-3">
                        <p className="text-sm font-semibold text-gray-900">{t('stu.invoiceNotSent')}</p>
                        <p className="text-xs text-gray-600 mt-1">{t('stu.noInvoiceYet')}</p>
                      </div>
                    )
                  )}

                  {showPaymentModelUi && selectedStudent && (
                    <StudentPaymentModelSection
                      studentId={selectedStudent.id}
                      value={selectedStudent.payment_model ?? null}
                      perLessonTiming={(selectedStudent as any).per_lesson_payment_timing ?? null}
                      perLessonDeadlineHours={(selectedStudent as any).per_lesson_payment_deadline_hours ?? null}
                      inheritedLessonPayment={{
                        payment_timing: lessonPaymentInherited.payment_timing,
                        payment_deadline_hours: lessonPaymentInherited.payment_deadline_hours,
                      }}
                      minBookingHours={lessonPaymentInherited.min_booking_hours}
                      allowPerLesson
                      onSaved={(patch) => {
                        setSelectedStudent((s) => (s ? { ...s, ...patch } : null));
                        fetchStudents();
                      }}
                    />
                  )}

                  {/* Payment Actions */}
                  {!orgPolicy.hideMoney && (paymentActions.canSendPackage || paymentActions.canSendInvoice) && (
                    <div
                      className={cn(
                        'grid gap-2 mt-3',
                        paymentActions.canSendPackage && paymentActions.canSendInvoice ? 'grid-cols-2' : 'grid-cols-1',
                      )}
                    >
                      {paymentActions.canSendPackage && (
                        <Button
                          onClick={() => setIsSendPackageModalOpen(true)}
                          size="sm"
                          variant="outline"
                          className="rounded-lg gap-2 text-violet-600 border-violet-200 hover:bg-violet-50"
                        >
                          <Package className="w-4 h-4" />
                          {t('stu.sendPackage')}
                        </Button>
                      )}
                      {paymentActions.canSendInvoice && (
                        <Button
                          onClick={() => setIsSendInvoiceModalOpen(true)}
                          size="sm"
                          variant="outline"
                          className="rounded-lg gap-2 text-indigo-600 border-indigo-200 hover:bg-indigo-50"
                        >
                          <FileText className="w-4 h-4" />
                          {t('stu.sendInvoice')}
                        </Button>
                      )}
                    </div>
                  )}

                  <div className="grid gap-5 lg:grid-cols-2 lg:gap-6 lg:items-start">
                  <div>
                    <h4 className="font-semibold mb-3 text-gray-900">{t('stu.upcomingSessions')}</h4>
                    <div className="space-y-2">
                      {(() => {
                        const upcoming = [...studentSessions]
                          .filter(s => new Date(s.start_time) > new Date() && s.status === 'active')
                          .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());

                        return upcoming.length === 0 ? (
                        <p className="text-sm text-gray-500 bg-gray-50 p-4 rounded-xl text-center">{t('stu.noUpcoming')}</p>
                        ) : (
                          upcoming.slice(0, 3).map(s => (
                            <div key={s.id} className="text-sm p-3 rounded-xl bg-indigo-50 border border-indigo-100 flex justify-between items-center gap-3">
                              <span className="text-indigo-900 font-medium min-w-0">
                                {new Date(s.start_time).toLocaleDateString('lt-LT')} {new Date(s.start_time).toLocaleTimeString('lt-LT', { hour: '2-digit', minute: '2-digit' })}
                              </span>
                              <span className="font-bold text-indigo-700 shrink-0 text-right">{s.topic || t('stu.selfStudy')}</span>
                            </div>
                          ))
                        );
                      })()}
                    </div>
                  </div>

                  <div>
                    <h4 className="font-semibold mb-3 text-gray-900">{t('stu.recentCompleted')}</h4>
                    <div className="space-y-2">
                      {(() => {
                        const now = new Date();
                        const completed = [...studentSessions]
                          .filter(s => {
                            if (s.status === 'cancelled' || s.status === 'completed' || s.status === 'no_show') return true;
                            return s.status === 'active' && new Date(s.end_time) < now;
                          })
                          .sort((a, b) => new Date(b.start_time).getTime() - new Date(a.start_time).getTime());

                        return completed.length === 0 ? (
                          <p className="text-sm text-gray-500 bg-gray-50 p-4 rounded-xl text-center">{t('stu.noRecentCompleted')}</p>
                        ) : (
                          completed.slice(0, 3).map(s => {
                            const isCancelled = s.status === 'cancelled';
                            const isNoShow = s.status === 'no_show';
                            return (
                              <div key={s.id} className={cn(
                                'text-sm p-3 rounded-xl border flex justify-between items-center gap-3',
                                isCancelled ? 'bg-red-50 border-red-100' : isNoShow ? 'bg-rose-50 border-rose-100' : !s.paid ? 'bg-amber-50 border-amber-100' : 'bg-emerald-50 border-emerald-100'
                              )}>
                                <div className="flex flex-col gap-0.5 min-w-0">
                                  <span className="text-gray-900 font-medium">
                                    {new Date(s.start_time).toLocaleDateString('lt-LT')} {new Date(s.start_time).toLocaleTimeString('lt-LT', { hour: '2-digit', minute: '2-digit' })}
                                  </span>
                                  {isCancelled && <span className="text-xs text-red-600 font-medium">{t('status.cancelled')}</span>}
                                  {isNoShow && <span className="text-xs text-rose-600 font-medium">{t('common.noShow')}</span>}
                                </div>
                                <div className="text-right shrink-0">
                                  <span className="font-bold text-gray-700 block">{s.topic || t('stu.selfStudy')}</span>
                                  {!orgPolicy.hideMoney && s.price != null && (
                                    <span className={cn('block text-xs font-semibold', s.paid ? 'text-emerald-600' : 'text-amber-600')}>
                                      €{s.price.toFixed(2)}
                                    </span>
                                  )}
                                </div>
                              </div>
                            );
                          })
                        );
                      })()}
                    </div>
                  </div>
                  </div>

                  {/* Individual Pricing Section */}
                  {!orgPolicy.hideMoney && (
                  <div className="mt-6 pt-4 border-t border-gray-100">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="font-semibold text-gray-900 flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-amber-500" />
                        Individualios kainos
                      </h4>
                      {!addingNewPrice && (
                        <Button
                          onClick={() => setAddingNewPrice(true)}
                          size="sm"
                          variant="outline"
                          className="text-xs rounded-lg"
                        >
                          <Plus className="w-3 h-3 mr-1" />
                          {t('stu.addPrice')}
                        </Button>
                      )}
                    </div>

                    {loadingIndividualPricing ? (
                      <p className="text-sm text-gray-500 text-center py-4">Kraunama...</p>
                    ) : (
                      <>
                        {studentIndividualPricing.length === 0 && !addingNewPrice ? (
                          <p className="text-sm text-gray-500 bg-gray-50 p-4 rounded-xl text-center">
                            {t('stu.noIndividualPrices')}
                          </p>
                        ) : (
                          <div className="space-y-2">
                            {studentIndividualPricing.map((pricing) => (
                              <div
                                key={pricing.id}
                                className="bg-amber-50 border border-amber-100 rounded-xl p-3 flex items-center justify-between"
                              >
                                <div className="flex-1">
                                  <div className="flex items-center gap-2 mb-1">
                                    <div
                                      className="w-3 h-3 rounded-full flex-shrink-0"
                                      style={{ backgroundColor: pricing.subject?.color || '#6366f1' }}
                                    />
                                    <span className="font-semibold text-gray-900 text-sm">
                                      {pricing.subject?.name || 'Dalykas'}
                                    </span>
                                  </div>
                                  <div className="text-xs text-gray-600 space-y-0.5">
                                    <p>
                                      <Euro className="w-3 h-3 inline mr-1" />
                                      <strong>€{pricing.price}</strong> / {pricing.duration_minutes} min
                                    </p>
                                    <p>
                                      <Clock className="w-3 h-3 inline mr-1" />
                                      {t('stu.cancelBefore', { hours: String(pricing.cancellation_hours), percent: String(pricing.cancellation_fee_percent) })}
                                    </p>
                                  </div>
                                </div>
                                <Button
                                  onClick={() => handleDeleteIndividualPrice(pricing.id)}
                                  variant="ghost"
                                  size="sm"
                                  className="text-red-600 hover:text-red-700 hover:bg-red-50"
                                  disabled={savingIndividualPrice}
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </div>
                            ))}
                          </div>
                        )}

                        {addingNewPrice && (
                          <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3 mt-2">
                            <div>
                              <Label className="text-xs font-semibold text-gray-700">Dalykas *</Label>
                              <Select
                                value={newPriceSubject}
                                onValueChange={setNewPriceSubject}
                              >
                                <SelectTrigger className="mt-1 rounded-lg">
                                  <SelectValue placeholder={t('stu.selectSubject')} />
                                </SelectTrigger>
                                <SelectContent>
                                  {subjects
                                    .filter(s => !studentIndividualPricing.some(p => p.subject_id === s.id))
                                    .map(subject => (
                                      <SelectItem key={subject.id} value={subject.id}>
                                        <div className="flex items-center gap-2">
                                          <div
                                            className="w-3 h-3 rounded-full flex-shrink-0"
                                            style={{ backgroundColor: subject.color }}
                                          />
                                          <span>{subject.name}</span>
                                        </div>
                                      </SelectItem>
                                    ))}
                                </SelectContent>
                              </Select>
                            </div>

                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <Label className="text-xs font-semibold text-gray-700">{t('lessonSet.priceLabel')} *</Label>
                                <Input
                                  type="number"
                                  value={newPriceAmount}
                                  onChange={(e) => setNewPriceAmount(e.target.value ? Number(e.target.value) : '')}
                                  placeholder="25"
                                  className="mt-1 rounded-lg"
                                  min="0"
                                  step="0.01"
                                />
                              </div>
                              <div>
                                <Label className="text-xs font-semibold text-gray-700">{t('stu.durationMinLabel')}</Label>
                                <Input
                                  type="number"
                                  value={newPriceDuration}
                                  onChange={(e) => setNewPriceDuration(e.target.value ? Number(e.target.value) : '')}
                                  placeholder="60"
                                  className="mt-1 rounded-lg"
                                  min="1"
                                />
                              </div>
                            </div>

                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <Label className="text-xs font-semibold text-gray-700">{t('stu.cancellationLabel')}</Label>
                                <Select
                                  value={String(newPriceCancellationHours)}
                                  onValueChange={(v) => setNewPriceCancellationHours(Number(v))}
                                >
                                  <SelectTrigger className="mt-1 rounded-lg">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="2">2 valandos</SelectItem>
                                    <SelectItem value="6">6 valandos</SelectItem>
                                    <SelectItem value="12">{t('stu.hours12')}</SelectItem>
                                    <SelectItem value="24">24 valandos</SelectItem>
                                    <SelectItem value="48">48 valandos</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                              <div>
                                <Label className="text-xs font-semibold text-gray-700">Bauda (%)</Label>
                                <Select
                                  value={String(newPriceCancellationFee)}
                                  onValueChange={(v) => setNewPriceCancellationFee(Number(v))}
                                >
                                  <SelectTrigger className="mt-1 rounded-lg">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="0">0%</SelectItem>
                                    <SelectItem value="25">25%</SelectItem>
                                    <SelectItem value="50">50%</SelectItem>
                                    <SelectItem value="75">75%</SelectItem>
                                    <SelectItem value="100">100%</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                            </div>

                            <div className="flex gap-2 pt-2">
                              <Button
                                onClick={() => {
                                  setAddingNewPrice(false);
                                  setNewPriceSubject('');
                                  setNewPriceAmount('');
                                  setNewPriceDuration('');
                                  setNewPriceCancellationHours(24);
                                  setNewPriceCancellationFee(0);
                                }}
                                variant="outline"
                                size="sm"
                                className="flex-1 rounded-lg"
                                disabled={savingIndividualPrice}
                              >
                                {t('stu.cancelBtn')}
                              </Button>
                              <Button
                                onClick={handleAddIndividualPrice}
                                size="sm"
                                className="flex-1 rounded-lg"
                                disabled={savingIndividualPrice || !newPriceSubject || !newPriceAmount || !newPriceDuration}
                              >
                                {savingIndividualPrice ? t('stu.savingPrice') : t('stu.savePrice')}
                              </Button>
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                  )}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Filtered Sessions Modal (For "Visos pamokos" Tab with filter) */}
      <Dialog open={isFilteredModalOpen} onOpenChange={setIsFilteredModalOpen}>
        <DialogContent className="w-[95vw] sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('stu.sessionsForPeriod')}</DialogTitle>
          </DialogHeader>
          {selectedStudentForFilter && (
            <div className="space-y-4">
              <div className="flex justify-between items-start pt-2 border-b border-gray-100 pb-4">
                <div>
                  <h3 className="text-xl font-bold">{selectedStudentForFilter.full_name}</h3>
                  <p className="text-gray-500 text-sm mt-1">
                    {contactVisibility
                      ? formatContactForTutorView(
                        selectedStudentForFilter.email,
                        selectedStudentForFilter.payer_email,
                        contactVisibility.tutorSeesStudentEmail,
                      )
                      : ((orgPolicy.isOrgTutor || orgPolicy.loading) ? '—' : (selectedStudentForFilter.email || '—'))}
                  </p>
                  <p className="text-gray-500 text-sm">
                    {contactVisibility
                      ? formatContactForTutorView(
                        selectedStudentForFilter.phone,
                        selectedStudentForFilter.payer_phone,
                        contactVisibility.tutorSeesStudentPhone,
                      )
                      : ((orgPolicy.isOrgTutor || orgPolicy.loading) ? '—' : (selectedStudentForFilter.phone || '—'))}
                  </p>
                </div>
              </div>

              <SessionList
                sessions={getStudentSessions(
                  allSessions as Session[],
                  selectedStudentForFilter.id,
                  filterStartDate,
                  filterEndDate
                )}
                groupBy="status"
                showStudent={false}
                onSessionClick={(session) => {
                  const fullSession = allSessions.find((s: any) => s.id === session.id) || session;
                  setSelectedSessionForModal(fullSession);
                  setIsFilteredModalOpen(false);
                  setIsSessionModalOpen(true);
                }}
              />
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Session Details Modal (For "Pamokos" Tab) */}
      <Dialog
        open={isSessionModalOpen}
        onOpenChange={(open) => {
          setIsSessionModalOpen(open);
          if (!open) {
            setCancelConfirmId(null);
            setIsEditingTime(false);
            setEditNewStartTime('');
            setNoShowPickerOpen(false);
          }
        }}
      >
        <DialogContent className="w-[95vw] sm:max-w-[440px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2">
                <CalendarDays className="w-5 h-5 text-indigo-600" />
                Pamokos informacija
              </span>
              {selectedSessionForModal?.status === 'active' && (
                <button
                  type="button"
                  onClick={() => {
                    setIsEditingTime((prev) => !prev);
                    if (!isEditingTime && selectedSessionForModal?.start_time) {
                      setEditNewStartTime(selectedSessionForModal.start_time);
                    }
                  }}
                  className="inline-flex items-center gap-1 text-xs text-orange-600 hover:text-orange-700"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                  Redaguoti
                </button>
              )}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="bg-indigo-50 rounded-xl px-4 py-3 flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-indigo-600 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                {selectedSessionForModal?.student?.full_name?.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2) || '?'}
              </div>
              <div>
                <p className="font-semibold text-gray-900">{selectedSessionForModal?.student?.full_name}</p>
                {selectedSessionForModal?.topic && (
                  <p className="text-xs text-gray-500">{selectedSessionForModal.topic}</p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="bg-gray-50 rounded-xl p-3">
                <p className="text-xs text-gray-400 font-medium mb-1 flex items-center gap-1">
                  <Clock className="w-3 h-3" /> {t('dash.start')}
                </p>
                {isEditingTime ? (
                  <div className="mt-2 space-y-2">
                    <DateTimeSpinner value={editNewStartTime} onChange={setEditNewStartTime} />
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" className="h-7 px-2 text-xs flex-1 rounded-lg" onClick={() => setIsEditingTime(false)}>{t('stu.cancelEdit')}</Button>
                      <Button size="sm" className="h-7 px-2 text-xs flex-1 rounded-lg" onClick={handleReschedule} disabled={savingSession}>{savingSession ? '...' : t('dash.saveEdit')}</Button>
                    </div>
                  </div>
                ) : (
                  <p className="font-semibold text-gray-800">
                    {selectedSessionForModal?.start_time ? format(new Date(selectedSessionForModal.start_time), "yyyy-MM-dd HH:mm") : ''}
                  </p>
                )}
              </div>
              <div className="bg-gray-50 rounded-xl p-3">
                <p className="text-xs text-gray-400 font-medium mb-1 flex items-center gap-1">
                  <Clock className="w-3 h-3" /> {t('dash.end')}
                </p>
                <p className="font-semibold text-gray-800">
                  {isEditingTime && editNewStartTime ? (
                    (() => {
                      const newStart = new Date(editNewStartTime);
                      const oldStart = new Date(selectedSessionForModal!.start_time);
                      const oldEnd = new Date(selectedSessionForModal!.end_time);
                      const durMs = oldEnd.getTime() - oldStart.getTime();
                      return format(new Date(newStart.getTime() + durMs), "yyyy-MM-dd HH:mm");
                    })()
                  ) : (
                    selectedSessionForModal?.end_time ? format(new Date(selectedSessionForModal.end_time), "yyyy-MM-dd HH:mm") : ''
                  )}
                </p>
              </div>
            </div>

            <div className={cn('grid gap-3 text-sm', orgPolicy.hideMoney ? 'grid-cols-1' : 'grid-cols-3')}>
              {!orgPolicy.hideMoney && (
              <div className="bg-gray-50 rounded-xl p-3 text-center">
                <p className="text-xs text-gray-400 mb-1">{t('dash.priceLabel')}</p>
                <p className="font-bold text-gray-900">€{selectedSessionForModal?.price || '–'}</p>
              </div>
              )}
              <div className="bg-gray-50 rounded-xl p-3 text-center flex flex-col items-center justify-center">
                <p className="text-xs text-gray-400 mb-2">{t('dash.statusLabel')}</p>
                <StatusBadge
                  status={selectedSessionForModal?.status || ''}
                  paymentStatus={selectedSessionForModal?.payment_status}
                  paid={selectedSessionForModal?.paid}
                  isTrial={selectedSessionForModal?.subjects?.is_trial === true}
                  orgTutorCopy={orgPolicy.isOrgTutor}
                  hidePaymentStatus={orgPolicy.isOrgTutor}
                  endTime={selectedSessionForModal?.end_time}
                />
              </div>
              {!orgPolicy.hideMoney && (
              <div className="bg-gray-50 rounded-xl p-3 text-center">
                <p className="text-xs text-gray-400 mb-1">{t('dash.paidLabel')}</p>
                {selectedSessionForModal?.payment_status === 'paid_by_student' ? (
                  <span className="text-green-600 font-semibold text-xs bg-green-100 px-2 py-0.5 rounded">{t('dash.studentMarked')}</span>
                ) : (
                  <span className={selectedSessionForModal?.paid ? 'text-green-600 font-semibold text-xs' : 'text-red-500 font-semibold text-xs'}>
                    {selectedSessionForModal?.paid ? t('dash.paidYes') : t('dash.paidNo')}
                  </span>
                )}
              </div>
              )}
            </div>

            {selectedSessionForModal?.meeting_link && (
              <a
                href={normalizeUrl(selectedSessionForModal.meeting_link) || undefined}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-50 text-blue-600 text-sm hover:bg-blue-100 transition-colors"
              >
                {t('dash.joinVideoCall')}
              </a>
            )}

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
              <Button size="sm" onClick={handleSaveViewComment} disabled={viewCommentSaving} className="rounded-xl">
                {viewCommentSaving ? t('dash.savingComment') : t('dash.saveComment')}
              </Button>
            </div>

            {selectedSessionForModal?.id && (
              <div className="pt-1">
                <SessionFiles sessionId={selectedSessionForModal.id} role="tutor" />
              </div>
            )}
          </div>

          {selectedSessionForModal?.is_late_cancelled && (
            <div className="p-3 rounded-xl bg-red-50 border border-red-200 space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700 border border-red-200">
                  {t('dash.lateCancelBadge')}
                </span>
                {selectedSessionForModal.cancellation_penalty_amount != null && Number(selectedSessionForModal.cancellation_penalty_amount) > 0 && (
                  <span className="text-xs font-semibold text-red-600">
                    €{Number(selectedSessionForModal.cancellation_penalty_amount).toFixed(2)}
                  </span>
                )}
                {selectedSessionForModal.penalty_resolution && (
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                    selectedSessionForModal.penalty_resolution === 'paid' || selectedSessionForModal.penalty_resolution === 'credit_applied' ? 'bg-green-100 text-green-700' :
                    selectedSessionForModal.penalty_resolution === 'refunded' ? 'bg-blue-100 text-blue-700' :
                    selectedSessionForModal.penalty_resolution === 'invoiced' ? 'bg-amber-100 text-amber-700' :
                    'bg-gray-100 text-gray-600'
                  }`}>
                    {t(`dash.penaltyRes_${selectedSessionForModal.penalty_resolution}` as any)}
                  </span>
                )}
              </div>
            </div>
          )}

          {cancelConfirmId === selectedSessionForModal?.id && (
            <div className="space-y-2 pt-2 border-t border-gray-100">
              <label className="text-sm font-semibold text-gray-700">{t('dash.cancelReasonLabel')}</label>
              <textarea
                value={cancellationReason}
                onChange={(e) => setCancellationReason(e.target.value)}
                placeholder="{t('dash.cancelReasonPlaceholder')}"
                className="w-full p-3 rounded-xl border border-gray-200 text-sm resize-none focus:ring-2 focus:ring-red-200 focus:border-red-300 outline-none"
                rows={3}
                autoFocus
              />
              {cancellationReason.length > 0 && cancellationReason.trim().length < 5 && (
                <p className="text-xs text-red-500">Bent 5 simboliai ({cancellationReason.trim().length}/5)</p>
              )}
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => { setCancelConfirmId(null); setCancellationReason(''); }} className="rounded-xl flex-1">
                  {t('dash.cancelBtn')}
                </Button>
                <Button variant="destructive" size="sm" onClick={handleCancelSession} disabled={savingSession || cancellationReason.trim().length < 5} className="rounded-xl flex-1">
                  {savingSession ? t('dash.cancelling') : t('dash.confirmCancel')}
                </Button>
              </div>
            </div>
          )}

          <DialogFooter className="flex-col sm:flex-row gap-2 pt-2">
            <div className="flex gap-2 flex-1 flex-wrap">
              {selectedSessionForModal?.status === 'active' && (
                <>
                  <Button
                    variant={cancelConfirmId === selectedSessionForModal.id ? "default" : "destructive"}
                    onClick={() => {
                      if (cancelConfirmId !== selectedSessionForModal.id) {
                        handleCancelSession();
                      }
                    }}
                    disabled={savingSession}
                    size="sm"
                    className={cn(
                      "rounded-xl flex-1",
                      cancelConfirmId === selectedSessionForModal.id ? "bg-orange-500 hover:bg-orange-600 text-white" : ""
                    )}
                  >
                    <XCircle className="w-4 h-4 mr-1" />
                    {cancelConfirmId === selectedSessionForModal.id ? t('dash.cancellingSession') : t('dash.cancelBtn')}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={handleMarkCompleted}
                    disabled={savingSession}
                    size="sm"
                    className="rounded-xl flex-1 text-green-700 border-green-200 hover:bg-green-50"
                  >
                    <CheckCircle className="w-4 h-4 mr-1" />
                    {t('dash.completed')}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setNoShowPickerOpen(true)}
                    disabled={savingSession}
                    size="sm"
                    className="rounded-xl flex-1 text-rose-700 border-rose-200 hover:bg-rose-50"
                  >
                    <UserX className="w-4 h-4 mr-1" />
                    {t('common.noShow')}
                  </Button>
                </>
              )}
              {selectedSessionForModal &&
                (selectedSessionForModal.status === 'completed' || selectedSessionForModal.status === 'no_show') &&
                isAfter(new Date(selectedSessionForModal.end_time), new Date()) && (
                  <>
                    <Button
                      variant="outline"
                      onClick={() => void handleRevertLessonToPlanned()}
                      disabled={savingSession}
                      size="sm"
                      className="rounded-xl flex-1 text-indigo-700 border-indigo-200 hover:bg-indigo-50"
                    >
                      <RotateCcw className="w-4 h-4 mr-1" />
                      {t('dash.revertToPlannedLesson')}
                    </Button>
                    {selectedSessionForModal.status === 'completed' && (
                      <Button
                        variant="outline"
                        onClick={() => setNoShowPickerOpen(true)}
                        disabled={savingSession}
                        size="sm"
                        className="rounded-xl flex-1 text-rose-700 border-rose-200 hover:bg-rose-50"
                      >
                        <UserX className="w-4 h-4 mr-1" />
                        {t('common.noShow')}
                      </Button>
                    )}
                  </>
                )}
            </div>
            {orgPolicy.canToggleSessionPaid && (
            <div className="flex gap-2">
              {selectedSessionForModal?.payment_status === 'paid_by_student' && (
                <Button
                  onClick={handleRejectPayment}
                  disabled={savingSession}
                  size="sm"
                  variant="outline"
                  className="rounded-xl border-red-200 text-red-600 hover:bg-red-50"
                >
                  <XCircle className="w-4 h-4 mr-1" />
                  Negavau pavedimo
                </Button>
              )}
              <Button
                onClick={handleMarkPaid}
                disabled={savingSession}
                size="sm"
                variant="default"
                className={cn(
                  "rounded-xl flex-1 font-semibold shadow-sm transition-all",
                  selectedSessionForModal?.payment_status === 'paid_by_student'
                    ? "bg-green-600 hover:bg-green-700 text-white border-transparent ring-2 ring-green-200"
                    : selectedSessionForModal?.paid
                      ? "bg-amber-500 hover:bg-amber-600 text-white border-transparent ring-2 ring-amber-200"
                      : "bg-emerald-600 hover:bg-emerald-700 text-white border-transparent ring-2 ring-emerald-200"
                )}
              >
                {selectedSessionForModal?.payment_status === 'paid_by_student' ? (
                  <>
                    <CheckCircle className="w-5 h-5 mr-1.5" />
                    {t('stu.confirmPayment')}
                  </>
                ) : (
                  <>
                    <Wallet className="w-5 h-5 mr-1.5" />
                    {selectedSessionForModal?.paid ? t('dash.markUnpaid') : t('dash.markPaid')}
                  </>
                )}
              </Button>
            </div>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Send Package Modal */}
      {selectedStudent && (
        <SendPackageModal
          isOpen={isSendPackageModalOpen}
          onClose={() => setIsSendPackageModalOpen(false)}
          studentId={selectedStudent.id}
          studentName={selectedStudent.full_name}
          studentEmail={selectedStudent.email}
          onSuccess={() => {
            void fetchStudents();
            openStudentModal(selectedStudent);
          }}
        />
      )}

      {/* Send Invoice Modal */}
      {selectedStudent && (
        <SendInvoiceModal
          isOpen={isSendInvoiceModalOpen}
          onClose={() => setIsSendInvoiceModalOpen(false)}
          studentId={selectedStudent.id}
          studentName={selectedStudent.full_name}
          onSuccess={() => {
            void fetchStudents();
            openStudentModal(selectedStudent);
          }}
        />
      )}

      <MarkStudentNoShowDialog
        open={noShowPickerOpen && !!selectedSessionForModal}
        onOpenChange={(open) => {
          if (!open) setNoShowPickerOpen(false);
        }}
        sessionStart={selectedSessionForModal ? new Date(selectedSessionForModal.start_time) : new Date()}
        sessionEnd={selectedSessionForModal ? new Date(selectedSessionForModal.end_time) : new Date()}
        saving={savingSession}
        onConfirm={(w) => void confirmMarkStudentNoShow(w)}
      />
    </Layout >
  );
}
