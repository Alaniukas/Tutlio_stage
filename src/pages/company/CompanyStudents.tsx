import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { getCached, setCache, invalidateCache } from '@/lib/dataCache';
import { authHeaders } from '@/lib/apiHelpers';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DateInput } from '@/components/ui/date-input';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Plus, Trash2, User, Mail, Phone, GraduationCap, CheckCircle, XCircle, Sparkles, Package, Loader2, FileText, Search, Euro, Clock, MessageSquare, Archive, ArchiveRestore } from 'lucide-react';
import { sendEmail } from '@/lib/email';
import Toast from '@/components/Toast';
import { useTranslation } from '@/lib/i18n';
import { formatLithuanianPhone, validateLithuanianPhone } from '@/lib/utils';
import { SessionList } from '@/components/SessionList';
import {
  getStudentRecentPastSessions,
  type Session,
} from '@/lib/session-stats';
import { useOrgFeatures } from '@/hooks/useOrgFeatures';
import {
  getEffectivePaymentActions,
  mergeOrgTutorLessonPaymentDefaults,
  type TutorPaymentFlags,
  type LessonPaymentTiming,
} from '@/lib/studentPaymentModel';
import StudentPaymentModelSection from '@/components/StudentPaymentModelSection';
import SendInvoiceModal from '@/components/SendInvoiceModal';
import { pickStudentContactsForTutorEmail, shouldShowPayerContactSection } from '@/lib/orgContactVisibility';
import { getOrgVisibleTutors } from '@/lib/orgVisibleTutors';
import { useOrgEntityType } from '@/contexts/OrgEntityContext';

interface Student {
  id: string;
  tutor_id: string | null;
  full_name: string;
  email: string;
  phone: string;
  media_publicity_consent?: string | null;
  payer_name?: string | null;
  payer_email?: string | null;
  payer_phone?: string | null;
  payer_personal_code?: string | null;
  parent_secondary_name?: string | null;
  parent_secondary_email?: string | null;
  parent_secondary_phone?: string | null;
  parent_secondary_personal_code?: string | null;
  parent_secondary_address?: string | null;
  contact_parent?: 'primary' | 'secondary' | null;
  student_address?: string | null;
  student_city?: string | null;
  child_birth_date?: string | null;
  trial_offer_disabled?: boolean;
  invite_code: string;
  payment_model?: string | null;
  linked_user_id?: string | null;
  created_at: string;
  admin_comment?: string | null;
  admin_comment_visible_to_tutor?: boolean;
  personal_meeting_link?: string | null;
  detached_at?: string | null;
  tutor?: {
    full_name: string;
  };
}

interface Tutor {
  id: string;
  full_name: string;
}

interface SubjectOption {
  id: string;
  name: string;
  color: string;
}

function adminShowEmail(v: string | null | undefined) {
  const s = (v || '').trim();
  return s || '—';
}

function adminShowPhone(v: string | null | undefined) {
  const s = (v || '').trim();
  if (!s) return '—';
  return formatLithuanianPhone(s);
}

function mediaConsentBadge(consent: string | null | undefined) {
  const v = String(consent || '').trim().toLowerCase();
  if (v === 'agree') {
    return { labelKey: 'compStu.mediaConsentAgree', className: 'text-green-700 bg-green-50 border border-green-200' };
  }
  if (v === 'disagree') {
    return { labelKey: 'compStu.mediaConsentDisagree', className: 'text-rose-700 bg-rose-50 border border-rose-200' };
  }
  return { labelKey: 'compStu.mediaConsentUnknown', className: 'text-gray-700 bg-gray-50 border border-gray-200' };
}

function hasSchoolParentContacts(student: {
  payer_name?: string | null;
  payer_email?: string | null;
  payer_phone?: string | null;
}): boolean {
  return Boolean(
    (student.payer_name || '').trim() ||
    (student.payer_email || '').trim() ||
    (student.payer_phone || '').trim(),
  );
}

function calculateAgeFromDate(value: string | null | undefined): number | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - date.getFullYear();
  const monthDiff = today.getMonth() - date.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < date.getDate())) {
    age -= 1;
  }
  return age >= 0 ? age : null;
}

function joinStudentAddressLine(address?: string | null, city?: string | null): string {
  return [address, city].map((x) => String(x || '').trim()).filter(Boolean).join(', ');
}

export default function CompanyStudents() {
  /** Pagal DB `organizations.entity_type`, ne pagal URL — kitaip `/company/students` mokyklai slepiami tėvų laukai (sutartys). */
  const orgEntityType = useOrgEntityType();
  const isSchoolView = orgEntityType === 'school';
  const { t } = useTranslation();
  const { loading: orgFeaturesLoading, hasFeature } = useOrgFeatures();
  const orgUsesManualPackages = !orgFeaturesLoading && hasFeature('manual_payments');
  const stc = getCached<any>('company_students');
  const [students, setStudents] = useState<Student[]>(stc?.students ?? []);
  const [tutors, setTutors] = useState<Tutor[]>(stc?.tutors ?? []);
  const [loading, setLoading] = useState(!stc);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [baseUrl, setBaseUrl] = useState('');
  const [newStudent, setNewStudent] = useState({
    full_name: '',
    email: '',
    phone: '',
    payer_name: '',
    payer_email: '',
    payer_phone: '',
    payer_personal_code: '',
    parent_secondary_name: '',
    parent_secondary_email: '',
    parent_secondary_phone: '',
    parent_secondary_personal_code: '',
    parent_secondary_address: '',
    parent2_address_same_as_primary: false,
    contact_parent: 'primary' as 'primary' | 'secondary',
    student_address: '',
    student_city: '',
    child_birth_date: '',
    tutor_ids: [] as string[],
  });
  const [tutorSubjects, setTutorSubjects] = useState<SubjectOption[]>([]);
  const [selectedSubjectForInvite, setSelectedSubjectForInvite] = useState('');
  const [customPrice, setCustomPrice] = useState<number | ''>('');
  const [customDuration, setCustomDuration] = useState<number | ''>('');
  const [customCancellationHours, setCustomCancellationHours] = useState(24);
  const [customCancellationFee, setCustomCancellationFee] = useState(0);
  const [toastMessage, setToastMessage] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [sendingInviteNow, setSendingInviteNow] = useState(false);
  const [sendingParentInvites, setSendingParentInvites] = useState(false);

  // Past sessions for student modal (fetched by student_id when modal opens — reliable vs org-wide cache/timing)
  const [modalRecentSessions, setModalRecentSessions] = useState<Session[]>([]);
  const [loadingModalSessions, setLoadingModalSessions] = useState(false);

  // Student Detail Modal State
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [isStudentModalOpen, setIsStudentModalOpen] = useState(false);
  const [studentEditDraft, setStudentEditDraft] = useState({
    full_name: '',
    email: '',
    phone: '',
    payer_name: '',
    payer_email: '',
    payer_phone: '',
    payer_personal_code: '',
    parent_secondary_name: '',
    parent_secondary_email: '',
    parent_secondary_phone: '',
    parent_secondary_personal_code: '',
    parent_secondary_address: '',
    parent2_address_same_as_primary: false,
    contact_parent: 'primary' as 'primary' | 'secondary',
    student_address: '',
    student_city: '',
    child_birth_date: '',
  });
  const [studentEditOpen, setStudentEditOpen] = useState(false);
  const [studentEditSecondParentOpen, setStudentEditSecondParentOpen] = useState(false);
  const [savingStudentInfo, setSavingStudentInfo] = useState(false);

  // Trash bin state
  const [showTrashBin, setShowTrashBin] = useState(false);

  // Admin comment state
  const [editingComment, setEditingComment] = useState(false);
  const [commentDraft, setCommentDraft] = useState('');
  const [commentVisibleToTutor, setCommentVisibleToTutor] = useState(false);
  const [savingComment, setSavingComment] = useState(false);

  // Package state (student modal)
  const [studentPackages, setStudentPackages] = useState<any[]>([]);
  const [packageSubjects, setPackageSubjects] = useState<any[]>([]);
  const [loadingPackages, setLoadingPackages] = useState(false);
  const [sendPackageOpen, setSendPackageOpen] = useState(false);
  const [pkgSubjectId, setPkgSubjectId] = useState('');
  const [pkgLessons, setPkgLessons] = useState(5);
  const [pkgPrice, setPkgPrice] = useState(0);
  const [pkgExpiresAt, setPkgExpiresAt] = useState('');
  const [pkgSending, setPkgSending] = useState(false);
  const [pkgAttachSalesInvoice, setPkgAttachSalesInvoice] = useState(true);
  const [deactivatingPackageId, setDeactivatingPackageId] = useState<string | null>(null);
  const [isInvoiceModalOpen, setIsInvoiceModalOpen] = useState(false);
  const [studentSearch, setStudentSearch] = useState('');

  const [trialSending, setTrialSending] = useState(false);
  const [trialTutorId, setTrialTutorId] = useState<string | null>(null);
  const [selectedStudentGroup, setSelectedStudentGroup] = useState<Student[]>([]);
  const [selectedStudentSessionCount, setSelectedStudentSessionCount] = useState<number | null>(null);
  const [editTutorsOpen, setEditTutorsOpen] = useState(false);
  const [addingTutorId, setAddingTutorId] = useState('');
  const [addingTutorSearch, setAddingTutorSearch] = useState('');
  const [tutorsSaving, setTutorsSaving] = useState(false);
  const [multiTutorPickerOpen, setMultiTutorPickerOpen] = useState(false);
  const [multiTutorSearch, setMultiTutorSearch] = useState('');
  const [subjectSearch, setSubjectSearch] = useState('');
  const [trialDefaultsLoading, setTrialDefaultsLoading] = useState(false);
  const [trialDefaults, setTrialDefaults] = useState({ topic: t('compStu.trialTopic'), durationMinutes: 60, priceEur: 0 });
  const [trialModalOpen, setTrialModalOpen] = useState(false);
  const [trialForm, setTrialForm] = useState({ topic: t('compStu.trialTopic'), durationMinutes: 60, priceEur: 0 });

  // Individual pricing editor (student modal)
  const [loadingStudentIndividualPricing, setLoadingStudentIndividualPricing] = useState(false);
  const [studentIndividualPricing, setStudentIndividualPricing] = useState<any[]>([]);
  const [tutorPricingSubjects, setTutorPricingSubjects] = useState<any[]>([]);
  const [addingIndividualPrice, setAddingIndividualPrice] = useState(false);
  const [newPriceSubjectId, setNewPriceSubjectId] = useState('');
  const [newPriceAmount, setNewPriceAmount] = useState<number | ''>('');
  const [newPriceDurationMinutes, setNewPriceDurationMinutes] = useState<number | ''>('');
  const [newPriceCancellationHours, setNewPriceCancellationHours] = useState(24);
  const [newPriceCancellationFeePercent, setNewPriceCancellationFeePercent] = useState(0);
  const [savingStudentIndividualPricing, setSavingStudentIndividualPricing] = useState(false);

  const [tutorPaymentFlags, setTutorPaymentFlags] = useState<TutorPaymentFlags>({
    enable_per_lesson: true,
    enable_monthly_billing: false,
    enable_prepaid_packages: false,
  });

  // Org admin: source of truth is organizations.enable_* (sync to profiles may be delayed after login).
  useEffect(() => {
    if (!selectedStudent || !isStudentModalOpen) return;
    let cancelled = false;
    (async () => {
      if (orgId) {
        const { data } = await supabase
          .from('organizations')
          .select('enable_per_lesson, enable_monthly_billing, enable_prepaid_packages')
          .eq('id', orgId)
          .maybeSingle();
        if (cancelled || !data) return;
        setTutorPaymentFlags({
          enable_per_lesson: data.enable_per_lesson ?? true,
          enable_monthly_billing: !!data.enable_monthly_billing,
          enable_prepaid_packages: !!data.enable_prepaid_packages,
        });
        return;
      }
      if (!selectedStudent.tutor_id) return;
      const { data } = await supabase
        .from('profiles')
        .select('enable_per_lesson, enable_monthly_billing, enable_prepaid_packages')
        .eq('id', selectedStudent.tutor_id)
        .maybeSingle();
      if (cancelled || !data) return;
      setTutorPaymentFlags({
        enable_per_lesson: data.enable_per_lesson ?? true,
        enable_monthly_billing: !!data.enable_monthly_billing,
        enable_prepaid_packages: !!data.enable_prepaid_packages,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedStudent?.id, selectedStudent?.tutor_id, isStudentModalOpen, orgId]);

  // Load individual pricing editor data when a student modal opens
  useEffect(() => {
    if (!selectedStudent || !isStudentModalOpen) return;
    if (!selectedStudent.tutor_id) {
      setTutorPricingSubjects([]);
      setStudentIndividualPricing([]);
      setLoadingStudentIndividualPricing(false);
      return;
    }

    let cancelled = false;

    (async () => {
      setLoadingStudentIndividualPricing(true);
      try {
        const { data: subjectsRes } = await supabase
          .from('subjects')
          .select('id, name, price, duration_minutes, color, meeting_link')
          .eq('tutor_id', selectedStudent.tutor_id)
          .order('name');

        if (cancelled) return;
        setTutorPricingSubjects(subjectsRes || []);

        const { data: pricingRes } = await supabase
          .from('student_individual_pricing')
          .select('id, price, duration_minutes, cancellation_hours, cancellation_fee_percent, subject:subjects(id, name, color, duration_minutes)')
          .eq('student_id', selectedStudent.id)
          .eq('tutor_id', selectedStudent.tutor_id)
          .order('created_at', { ascending: false });

        if (cancelled) return;
        setStudentIndividualPricing(pricingRes || []);
      } finally {
        if (!cancelled) setLoadingStudentIndividualPricing(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedStudent?.id, selectedStudent?.tutor_id, isStudentModalOpen]);

  const showPaymentModelUi = isSchoolView || (!orgFeaturesLoading && hasFeature('per_student_payment_override'));

  const normalizedSearch = studentSearch.trim().toLowerCase();
  const groupedStudents = useMemo(() => {
    // Group by linked_user_id (multi-tutor). If student isn't linked yet, treat each row as a separate group.
    const groups = new Map<string, Student[]>();
    const order: string[] = [];
    for (const s of students) {
      const key = s.linked_user_id ? `u:${s.linked_user_id}` : `s:${s.id}`;
      if (!groups.has(key)) {
        groups.set(key, []);
        order.push(key);
      }
      groups.get(key)!.push(s);
    }
    return order.map((key) => {
      const rows = groups.get(key)!;
      // students already ordered by created_at desc; keep first row as "primary"
      return { key, primary: rows[0], rows };
    });
  }, [students]);

  const filteredGroups = useMemo(() => {
    let groups = groupedStudents.filter((g) =>
      showTrashBin ? g.primary.detached_at : !g.primary.detached_at
    );
    if (normalizedSearch) {
      groups = groups.filter((g) => g.primary.full_name.toLowerCase().includes(normalizedSearch));
    }
    return groups;
  }, [groupedStudents, normalizedSearch, showTrashBin]);

  const shouldShowParentContacts = (student: Student) =>
    isSchoolView ? hasSchoolParentContacts(student) : shouldShowPayerContactSection(student);

  const paymentActions = useMemo(() => {
    if (!selectedStudent) return { canSendInvoice: false, canSendPackage: false };
    return getEffectivePaymentActions(tutorPaymentFlags, selectedStudent.payment_model, showPaymentModelUi);
  }, [selectedStudent, tutorPaymentFlags, showPaymentModelUi]);

  useEffect(() => {
    void fetchData();
    setBaseUrl(window.location.origin);
  }, []);

  useEffect(() => {
    if (!orgId) return;
    let cancelled = false;
    (async () => {
      setTrialDefaultsLoading(true);
      const { data } = await supabase
        .from('organizations')
        .select('features')
        .eq('id', orgId)
        .maybeSingle();
      if (cancelled) return;
      const feat = (data as any)?.features;
      const featObj = feat && typeof feat === 'object' && !Array.isArray(feat) ? (feat as Record<string, unknown>) : {};
      const topic = typeof featObj.trial_lesson_topic === 'string' && featObj.trial_lesson_topic.trim()
        ? featObj.trial_lesson_topic.trim()
        : t('compStu.trialTopic');
      const durationMinutes =
        typeof featObj.trial_lesson_duration_minutes === 'number' && Number.isFinite(featObj.trial_lesson_duration_minutes)
          ? Math.max(15, Math.round(featObj.trial_lesson_duration_minutes))
          : 60;
      const priceEur =
        typeof featObj.trial_lesson_price_eur === 'number' && Number.isFinite(featObj.trial_lesson_price_eur)
          ? Math.max(0, featObj.trial_lesson_price_eur)
          : 0;
      setTrialDefaults({ topic, durationMinutes, priceEur });
      setTrialDefaultsLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [orgId]);

  useEffect(() => {
    if (!selectedStudent || !isStudentModalOpen) return;
    let cancelled = false;
    (async () => {
      setLoadingPackages(true);
      const [pkgRes, subjRes] = await Promise.all([
        supabase
          .from('lesson_packages')
          .select('*, subject:subjects(name, color)')
          .eq('student_id', selectedStudent.id)
          // Show both "active" and "pending" packages (org admin wants to see what is sent vs paid)
          .or('active.eq.true,payment_status.eq.pending')
          .order('created_at', { ascending: false }),
        supabase
          .from('subjects')
          .select('id, name, color, price, duration_minutes')
          .eq('tutor_id', selectedStudent.tutor_id)
          .order('name'),
      ]);
      if (!cancelled) {
        setStudentPackages(pkgRes.data || []);
        setPackageSubjects(subjRes.data || []);
        const first = subjRes.data?.[0];
        if (first) { setPkgSubjectId(first.id); setPkgPrice(first.price); }
        setLoadingPackages(false);
      }
    })();
    return () => { cancelled = true; };
  }, [selectedStudent, isStudentModalOpen]);

  useEffect(() => {
    if (!selectedStudent || !isStudentModalOpen) {
      setSelectedStudentSessionCount(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const { count } = await supabase
        .from('sessions')
        .select('id', { count: 'exact', head: true })
        .eq('student_id', selectedStudent.id);
      if (cancelled) return;
      setSelectedStudentSessionCount(typeof count === 'number' ? count : 0);
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedStudent?.id, isStudentModalOpen]);

  useEffect(() => {
    if (!selectedStudent) return;
    const primaryAddrLine = joinStudentAddressLine(selectedStudent.student_address, selectedStudent.student_city);
    const secAddr = (selectedStudent.parent_secondary_address || '').trim();
    setStudentEditDraft({
      full_name: selectedStudent.full_name || '',
      email: selectedStudent.email || '',
      phone: selectedStudent.phone || '',
      payer_name: selectedStudent.payer_name || '',
      payer_email: selectedStudent.payer_email || '',
      payer_phone: selectedStudent.payer_phone || '',
      payer_personal_code: selectedStudent.payer_personal_code || '',
      parent_secondary_name: selectedStudent.parent_secondary_name || '',
      parent_secondary_email: selectedStudent.parent_secondary_email || '',
      parent_secondary_phone: selectedStudent.parent_secondary_phone || '',
      parent_secondary_personal_code: selectedStudent.parent_secondary_personal_code || '',
      parent_secondary_address: selectedStudent.parent_secondary_address || '',
      parent2_address_same_as_primary: Boolean(primaryAddrLine && secAddr === primaryAddrLine),
      contact_parent: selectedStudent.contact_parent === 'secondary' ? 'secondary' : 'primary',
      student_address: selectedStudent.student_address || '',
      student_city: selectedStudent.student_city || '',
      child_birth_date: selectedStudent.child_birth_date || '',
    });
    setStudentEditOpen(false);
    setStudentEditSecondParentOpen(
      Boolean(
        (selectedStudent.parent_secondary_name || '').trim() ||
        (selectedStudent.parent_secondary_email || '').trim() ||
        (selectedStudent.parent_secondary_phone || '').trim() ||
        (selectedStudent.parent_secondary_personal_code || '').trim() ||
        (selectedStudent.parent_secondary_address || '').trim(),
      ),
    );
  }, [selectedStudent?.id]);

  useEffect(() => {
    if (!selectedStudent || !isStudentModalOpen) {
      setModalRecentSessions([]);
      setLoadingModalSessions(false);
      return;
    }
    const studentId = selectedStudent.id;
    let cancelled = false;
    (async () => {
      setLoadingModalSessions(true);
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
      const { data, error } = await supabase
        .from('sessions')
        .select('*, student:students(full_name), tutor:profiles!sessions_tutor_id_fkey(full_name), subject:subjects(name)')
        .eq('student_id', studentId)
        .gte('start_time', sixMonthsAgo.toISOString())
        .order('start_time', { ascending: false })
        .limit(200);
      if (cancelled) return;
      if (error) {
        console.error('Error fetching student sessions (org modal):', error);
        setModalRecentSessions([]);
      } else {
        setModalRecentSessions(
          getStudentRecentPastSessions((data || []) as Session[], studentId, 3)
        );
      }
      if (!cancelled) setLoadingModalSessions(false);
    })();
    return () => {
      cancelled = true;
      setLoadingModalSessions(false);
    };
  }, [selectedStudent?.id, isStudentModalOpen]);

  const fetchData = async () => {
    if (!getCached('company_students')) setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }

    // Get organization ID from organization_admins
    const { data: adminRow } = await supabase
      .from('organization_admins')
      .select('organization_id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!adminRow) {
      console.log('🔴 User is NOT an org admin!');
      setLoading(false);
      return;
    }
    setOrgId(adminRow.organization_id);

    const tutorsList = await getOrgVisibleTutors(
      supabase as any,
      adminRow.organization_id,
      'id, full_name, email',
    );

    setTutors(tutorsList);

    // Fetch ALL org students, regardless of where the tutor profile lives.
    const { data: fetchedStudents, error: studentsErr } = await supabase
      .from('students')
      .select('*, linked_user_id, tutor:profiles!students_tutor_id_fkey(full_name)')
      .eq('organization_id', adminRow.organization_id)
      .order('created_at', { ascending: false });
    if (studentsErr) {
      console.error('Error fetching students:', studentsErr);
      setStudents([]);
    } else {
      setStudents((fetchedStudents || []) as any);
    }

    setCache('company_students', { students: (fetchedStudents || []) as any, tutors: tutorsList });
    setLoading(false);
  };

  useEffect(() => {
    const tid = newStudent.tutor_ids[0] || '';
    if (!tid) {
      setTutorSubjects([]);
      setSelectedSubjectForInvite('');
      return;
    }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('subjects')
        .select('id, name, color')
        .eq('tutor_id', tid)
        .order('name');
      if (!cancelled) {
        setTutorSubjects(data || []);
        setSelectedSubjectForInvite('');
        setCustomPrice('');
        setCustomDuration('');
        setCustomCancellationHours(24);
        setCustomCancellationFee(0);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [newStudent.tutor_ids]);

  const handleSendPackage = async () => {
    if (!selectedStudent || !pkgSubjectId || pkgLessons <= 0) return;
    setPkgSending(true);
    try {
      const endpoint = orgUsesManualPackages ? '/api/create-manual-package' : '/api/create-package-checkout';
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: await authHeaders(),
        body: JSON.stringify({
          tutorId: selectedStudent.tutor_id,
          studentId: selectedStudent.id,
          subjectId: pkgSubjectId,
          totalLessons: pkgLessons,
          pricePerLesson: pkgPrice,
          ...(pkgExpiresAt ? { expiresAt: pkgExpiresAt } : {}),
          ...(!orgUsesManualPackages ? { attachSalesInvoice: pkgAttachSalesInvoice } : {}),
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error((result as any).error || (result as any).details || t('compStu.errorSendingPackage'));
      }
      const payUrl = typeof (result as any).paymentUrl === 'string' ? (result as any).paymentUrl.trim() : '';
      if (payUrl && /^https?:\/\//i.test(payUrl)) {
        window.open(payUrl, '_blank', 'noopener,noreferrer');
      }
      setToastMessage({ message: t('compStu.packageSent', { name: selectedStudent.full_name }), type: 'success' });
      setSendPackageOpen(false);
      setPkgExpiresAt('');
      const { data } = await supabase
        .from('lesson_packages')
        .select('*, subject:subjects(name, color)')
        .eq('student_id', selectedStudent.id)
        .or('active.eq.true,payment_status.eq.pending')
        .order('created_at', { ascending: false });
      setStudentPackages(data || []);
    } catch (err: any) {
      setToastMessage({ message: err.message, type: 'error' });
    }
    setPkgSending(false);
  };

  const handleDeactivatePackage = async (packageId: string) => {
    if (!selectedStudent) return;
    setDeactivatingPackageId(packageId);
    try {
      const { error } = await supabase
        .from('lesson_packages')
        .update({ active: false })
        .eq('id', packageId);
      if (error) throw error;
      const { data } = await supabase
        .from('lesson_packages')
        .select('*, subject:subjects(name, color)')
        .eq('student_id', selectedStudent.id)
        .or('active.eq.true,payment_status.eq.pending')
        .order('created_at', { ascending: false });
      setStudentPackages(data || []);
      setToastMessage({ message: t('compStu.packageHidden'), type: 'success' });
    } catch (e: any) {
      setToastMessage({ message: e?.message || t('compStu.hidePackageFailed'), type: 'error' });
    }
    setDeactivatingPackageId(null);
  };

  const generateInviteCode = () => Math.random().toString(36).substring(2, 8).toUpperCase();

  const reloadStudentIndividualPricing = async () => {
    if (!selectedStudent) return;

    setLoadingStudentIndividualPricing(true);
    try {
      const { data: subjectsRes } = await supabase
        .from('subjects')
        .select('id, name, price, duration_minutes, color, meeting_link')
        .eq('tutor_id', selectedStudent.tutor_id)
        .order('name');

      setTutorPricingSubjects(subjectsRes || []);

      const { data: pricingRes } = await supabase
        .from('student_individual_pricing')
        .select(
          'id, price, duration_minutes, cancellation_hours, cancellation_fee_percent, subject:subjects(id, name, color, duration_minutes)',
        )
        .eq('student_id', selectedStudent.id)
        .eq('tutor_id', selectedStudent.tutor_id)
        .order('created_at', { ascending: false });

      setStudentIndividualPricing(pricingRes || []);
    } catch (e) {
      console.error('[CompanyStudents] reloadStudentIndividualPricing failed:', e);
    } finally {
      setLoadingStudentIndividualPricing(false);
    }
  };

  const handleAddIndividualPrice = async () => {
    if (!selectedStudent) return;
    if (!newPriceSubjectId) return;
    if (newPriceAmount === '') return;

    const subject = tutorPricingSubjects.find((s) => s.id === newPriceSubjectId);
    const durationMinutesNum =
      typeof newPriceDurationMinutes === 'number'
        ? newPriceDurationMinutes
        : subject?.duration_minutes ?? 60;

    if (!durationMinutesNum || durationMinutesNum <= 0) {
      setToastMessage({ message: t('compStu.invalidDuration'), type: 'error' });
      return;
    }

    setSavingStudentIndividualPricing(true);
    try {
      const { error } = await supabase
        .from('student_individual_pricing')
        .upsert(
          {
            student_id: selectedStudent.id,
            tutor_id: selectedStudent.tutor_id,
            subject_id: newPriceSubjectId,
            price: Number(newPriceAmount),
            duration_minutes: Number(durationMinutesNum),
            cancellation_hours: Number(newPriceCancellationHours),
            cancellation_fee_percent: Number(newPriceCancellationFeePercent),
          },
          { onConflict: 'tutor_id,student_id,subject_id' },
        );

      if (error) throw error;

      setToastMessage({ message: t('compStu.individualPriceSaved'), type: 'success' });
      setAddingIndividualPrice(false);
      setNewPriceSubjectId('');
      setNewPriceAmount('');
      setNewPriceDurationMinutes('');
      setNewPriceCancellationHours(24);
      setNewPriceCancellationFeePercent(0);
      await reloadStudentIndividualPricing();
    } catch (e: any) {
      setToastMessage({ message: e?.message || t('compStu.individualPriceSaveFailed'), type: 'error' });
    } finally {
      setSavingStudentIndividualPricing(false);
    }
  };

  const handleDeleteIndividualPrice = async (priceId: string) => {
    if (!priceId) return;
    if (!confirm(t('compStu.confirmDeletePrice'))) return;

    setSavingStudentIndividualPricing(true);
    try {
      const { error } = await supabase.from('student_individual_pricing').delete().eq('id', priceId);
      if (error) throw error;
      setToastMessage({ message: t('compStu.individualPriceDeleted'), type: 'success' });
      await reloadStudentIndividualPricing();
    } catch (e: any) {
      setToastMessage({ message: e?.message || t('compStu.individualPriceDeleteFailed'), type: 'error' });
    } finally {
      setSavingStudentIndividualPricing(false);
    }
  };

  const handleAddStudent = async (e: React.FormEvent) => {
    e.preventDefault();

    if (isSchoolView && !newStudent.payer_name.trim()) {
      setToastMessage({ message: t('compStu.parentNameRequiredError'), type: 'error' });
      return;
    }
    if (isSchoolView && !newStudent.payer_email.trim()) {
      setToastMessage({ message: t('compStu.parentEmailRequiredError'), type: 'error' });
      return;
    }
    if (isSchoolView && !newStudent.payer_phone.trim()) {
      setToastMessage({ message: t('compStu.parentPhoneRequiredError'), type: 'error' });
      return;
    }
    const hasSecondParentAny =
      !!newStudent.parent_secondary_name.trim() ||
      !!newStudent.parent_secondary_email.trim() ||
      !!newStudent.parent_secondary_phone.trim();
    if (isSchoolView && hasSecondParentAny) {
      if (!newStudent.parent_secondary_name.trim() || !newStudent.parent_secondary_email.trim() || !newStudent.parent_secondary_phone.trim()) {
        setToastMessage({ message: 'Jei pildomas antras tėvas, reikia užpildyti vardą, el. paštą ir telefoną.', type: 'error' });
        return;
      }
      if (!validateLithuanianPhone(newStudent.parent_secondary_phone)) {
        setToastMessage({ message: t('compStu.phoneFormat'), type: 'error' });
        return;
      }
    }
    if (isSchoolView && newStudent.contact_parent === 'secondary' && !hasSecondParentAny) {
      setToastMessage({ message: 'Pasirinktas kontaktinis antras tėvas, bet jo duomenys neužpildyti.', type: 'error' });
      return;
    }
    if (newStudent.payer_phone?.trim() && !validateLithuanianPhone(newStudent.payer_phone)) {
      setToastMessage({ message: t('compStu.phoneFormat'), type: 'error' });
      return;
    }

    if (newStudent.phone?.trim() && !validateLithuanianPhone(newStudent.phone)) {
      setToastMessage({ message: t('compStu.phoneFormat'), type: 'error' });
      return;
    }

    let effectiveOrgId: string | null = orgId;
    if (isSchoolView) {
      const { data: authUserRes } = await supabase.auth.getUser();
      const uid = authUserRes?.user?.id;
      if (!uid) {
        setToastMessage({ message: t('compStu.orgResolveNeedLogin'), type: 'error' });
        return;
      }
      const { data: adminRows } = await supabase
        .from('organization_admins')
        .select('organization_id')
        .eq('user_id', uid);
      const ids = (adminRows || []).map((r) => r.organization_id).filter(Boolean) as string[];
      if (ids.length === 0) {
        setToastMessage({ message: t('compStu.orgResolveNoAdmin'), type: 'error' });
        return;
      }
      if (orgId && ids.includes(orgId)) {
        effectiveOrgId = orgId;
      } else {
        effectiveOrgId = ids[0];
      }
    }

    setSaving(true);
    const inserted: { id: string; tutor_id: string | null; invite_code: string }[] = [];
    const primaryParent = {
      name: newStudent.payer_name.trim(),
      email: newStudent.payer_email.trim(),
      phone: newStudent.payer_phone.trim(),
      personalCode: newStudent.payer_personal_code.trim(),
    };
    const secondaryParent = {
      name: newStudent.parent_secondary_name.trim(),
      email: newStudent.parent_secondary_email.trim(),
      phone: newStudent.parent_secondary_phone.trim(),
      personalCode: newStudent.parent_secondary_personal_code.trim(),
    };
    const primaryAddrLine = joinStudentAddressLine(newStudent.student_address, newStudent.student_city).trim();
    const resolvedParent2Address = newStudent.parent2_address_same_as_primary
      ? primaryAddrLine
      : newStudent.parent_secondary_address.trim();
    const contactParent = isSchoolView && newStudent.contact_parent === 'secondary' ? secondaryParent : primaryParent;
    const tutorIdsToInsert = newStudent.tutor_ids.length > 0 ? newStudent.tutor_ids : [null];
    for (const tutorId of tutorIdsToInsert) {
      const inviteCode = generateInviteCode();
      const { data: row, error } = await supabase
        .from('students')
        .insert({
          ...(tutorId ? { tutor_id: tutorId } : {}),
          full_name: newStudent.full_name,
          email: newStudent.email,
          phone: newStudent.phone?.trim() || null,
          payer_name: contactParent.name || null,
          payer_email: contactParent.email || null,
          payer_phone: contactParent.phone || null,
          payer_personal_code: contactParent.personalCode || null,
          parent_secondary_name: isSchoolView ? (secondaryParent.name || null) : null,
          parent_secondary_email: isSchoolView ? (secondaryParent.email || null) : null,
          parent_secondary_phone: isSchoolView ? (secondaryParent.phone || null) : null,
          parent_secondary_personal_code: isSchoolView ? (secondaryParent.personalCode || null) : null,
          parent_secondary_address: isSchoolView ? (resolvedParent2Address || null) : null,
          contact_parent: isSchoolView ? newStudent.contact_parent : 'primary',
          student_address: newStudent.student_address?.trim() || null,
          student_city: newStudent.student_city?.trim() || null,
          child_birth_date: newStudent.child_birth_date?.trim() || null,
          invite_code: inviteCode,
          ...(effectiveOrgId ? { organization_id: effectiveOrgId } : {}),
        })
        .select('id, tutor_id, invite_code')
        .single();
      if (error || !row) {
        console.error('Error adding student:', error);
        setToastMessage({ message: t('compStu.errorPrefix', { msg: error?.message || t('compStu.unknownError') }), type: 'error' });
        setSaving(false);
        return;
      }
      inserted.push(row as any);
    }

    // Optional: apply individual pricing to the first selected tutor only (as a helper)
    if (selectedSubjectForInvite && customPrice !== '' && customDuration !== '' && inserted[0]?.tutor_id) {
      const first = inserted[0];
      const firstTutorId = first.tutor_id;
      const { error: pricingError } = await supabase.from('student_individual_pricing').insert({
        student_id: first.id,
        tutor_id: firstTutorId,
        subject_id: selectedSubjectForInvite,
        price: Number(customPrice),
        duration_minutes: Number(customDuration),
        cancellation_hours: customCancellationHours,
        cancellation_fee_percent: customCancellationFee,
      });
      if (pricingError) {
        console.error('Individual pricing error:', pricingError);
        setToastMessage({
          message: t('compStu.pricingSaveFailed', { msg: pricingError.message }),
          type: 'error',
        });
      }
    }

    let emailOk = true;
    let schoolParentInvitesOk = true;
    let parentInviteFailureDetail = '';
    if (isSchoolView && inserted.length > 0) {
      try {
        const headers = await authHeaders();
        for (const row of inserted) {
          const invRes = await fetch('/api/parent-create-invites-for-student', {
            method: 'POST',
            headers,
            body: JSON.stringify({ studentId: row.id }),
          });
          const invJson = (await invRes.json().catch(() => ({}))) as {
            success?: boolean;
            error?: string;
            results?: Array<{ ok?: boolean; error?: string; email?: string }>;
          };
          if (!invRes.ok || invJson.success === false) {
            schoolParentInvitesOk = false;
            const fromResults = Array.isArray(invJson.results)
              ? invJson.results.find((r) => r && r.ok === false)?.error
              : undefined;
            const hint = invJson.error || fromResults || `HTTP ${invRes.status}`;
            if (!parentInviteFailureDetail) parentInviteFailureDetail = hint;
          }
        }
      } catch {
        schoolParentInvitesOk = false;
      }
    }

    const shouldSendInviteOnCreate = !isSchoolView;
    if (shouldSendInviteOnCreate && newStudent.email?.trim()) {
      for (const row of inserted) {
        const tutor = tutors.find((t) => t.id === row.tutor_id);
        const bookingUrl = `${baseUrl}/book/${row.invite_code}`;
        const ok = await sendEmail({
          type: 'invite_email',
          to: newStudent.email.trim(),
          data: {
            studentName: newStudent.full_name,
            tutorName: tutor?.full_name || t('compStu.tutorFallback'),
            inviteCode: row.invite_code,
            bookingUrl,
          },
        });
        if (!ok) emailOk = false;
      }
    }

    // Notify assigned tutors about new student
    if (orgId && inserted.length > 0) {
      const { data: orgRow } = await supabase.from('organizations').select('features').eq('id', orgId).single();
      const feat = orgRow?.features as Record<string, unknown> | null;
      if (feat?.notify_tutors_on_student_assign) {
        const contactPayload = pickStudentContactsForTutorEmail(newStudent, feat);
        for (const row of inserted) {
          if (!row.tutor_id) continue;
          const { data: tutorProfile } = await supabase.from('profiles').select('email, full_name').eq('id', row.tutor_id).single();
          if (tutorProfile?.email) {
            void sendEmail({
              type: 'tutor_student_assigned',
              to: tutorProfile.email,
              data: { tutorName: tutorProfile.full_name, studentName: newStudent.full_name, ...contactPayload },
            });
          }
        }
      }
    }

    const toastType: 'success' | 'error' =
      shouldSendInviteOnCreate && newStudent.email?.trim() && !emailOk
        ? 'error'
        : isSchoolView && !schoolParentInvitesOk
          ? 'error'
          : 'success';
    const toastMessage =
      shouldSendInviteOnCreate && newStudent.email?.trim() && !emailOk
        ? t('compStu.emailSendFailed')
        : isSchoolView && !schoolParentInvitesOk
          ? `${t('compStu.parentInviteEmailFailed')}${parentInviteFailureDetail ? ` (${parentInviteFailureDetail})` : ''}`
          : t('compStu.studentAdded');

    setToastMessage({
      message: toastMessage,
      type: toastType,
    });
    setIsDialogOpen(false);
    setNewStudent({
      full_name: '',
      email: '',
      phone: '',
      payer_name: '',
      payer_email: '',
      payer_phone: '',
      payer_personal_code: '',
      parent_secondary_name: '',
      parent_secondary_email: '',
      parent_secondary_phone: '',
      parent_secondary_personal_code: '',
      parent_secondary_address: '',
      parent2_address_same_as_primary: false,
      contact_parent: 'primary',
      student_address: '',
      student_city: '',
      child_birth_date: '',
      tutor_ids: [],
    });
    setSelectedSubjectForInvite('');
    setCustomPrice('');
    setCustomDuration('');
    setCustomCancellationHours(24);
    setCustomCancellationFee(0);
    invalidateCache('company_contracts');
    fetchData();
    setSaving(false);
  };

  const handleSaveComment = async () => {
    if (!selectedStudent) return;
    setSavingComment(true);
    const { error } = await supabase
      .from('students')
      .update({
        admin_comment: commentDraft.trim() || null,
        admin_comment_visible_to_tutor: commentVisibleToTutor,
      })
      .eq('id', selectedStudent.id);
    if (error) {
      setToastMessage({ message: t('compStu.commentSaveFailed'), type: 'error' });
    } else {
      setSelectedStudent((s) =>
        s ? { ...s, admin_comment: commentDraft.trim() || null, admin_comment_visible_to_tutor: commentVisibleToTutor } : null,
      );
      setToastMessage({ message: t('compStu.commentSaved'), type: 'success' });
      setEditingComment(false);
      fetchData();
    }
    setSavingComment(false);
  };

  const handleSaveStudentInfo = async () => {
    if (!selectedStudent) return;
    if (!studentEditDraft.full_name.trim()) {
      setToastMessage({ message: t('compStu.fullNameRequired'), type: 'error' });
      return;
    }
    if (studentEditDraft.phone?.trim() && !validateLithuanianPhone(studentEditDraft.phone)) {
      setToastMessage({ message: t('compStu.phoneFormat'), type: 'error' });
      return;
    }
    if (studentEditDraft.payer_phone?.trim() && !validateLithuanianPhone(studentEditDraft.payer_phone)) {
      setToastMessage({ message: t('compStu.phoneFormat'), type: 'error' });
      return;
    }
    const hasSecondParentAny =
      !!studentEditDraft.parent_secondary_name.trim() ||
      !!studentEditDraft.parent_secondary_email.trim() ||
      !!studentEditDraft.parent_secondary_phone.trim();
    if (isSchoolView && hasSecondParentAny) {
      if (!studentEditDraft.parent_secondary_name.trim() || !studentEditDraft.parent_secondary_email.trim() || !studentEditDraft.parent_secondary_phone.trim()) {
        setToastMessage({ message: 'Jei pildomas antras tėvas, reikia užpildyti vardą, el. paštą ir telefoną.', type: 'error' });
        return;
      }
      if (!validateLithuanianPhone(studentEditDraft.parent_secondary_phone)) {
        setToastMessage({ message: t('compStu.phoneFormat'), type: 'error' });
        return;
      }
    }
    if (isSchoolView && studentEditDraft.contact_parent === 'secondary' && !hasSecondParentAny) {
      setToastMessage({ message: 'Pasirinktas kontaktinis antras tėvas, bet jo duomenys neužpildyti.', type: 'error' });
      return;
    }

    const primaryParent = {
      name: studentEditDraft.payer_name.trim(),
      email: studentEditDraft.payer_email.trim(),
      phone: studentEditDraft.payer_phone.trim(),
      personalCode: studentEditDraft.payer_personal_code.trim(),
    };
    const secondaryParent = {
      name: studentEditDraft.parent_secondary_name.trim(),
      email: studentEditDraft.parent_secondary_email.trim(),
      phone: studentEditDraft.parent_secondary_phone.trim(),
      personalCode: studentEditDraft.parent_secondary_personal_code.trim(),
    };
    const contactParent = isSchoolView && studentEditDraft.contact_parent === 'secondary' ? secondaryParent : primaryParent;
    const primaryAddrLineEdit = joinStudentAddressLine(studentEditDraft.student_address, studentEditDraft.student_city).trim();
    const resolvedParent2AddressEdit = studentEditDraft.parent2_address_same_as_primary
      ? primaryAddrLineEdit
      : studentEditDraft.parent_secondary_address.trim();

    setSavingStudentInfo(true);
    const payload = {
      full_name: studentEditDraft.full_name.trim(),
      email: studentEditDraft.email.trim(),
      phone: studentEditDraft.phone.trim() || null,
      payer_name: contactParent.name || null,
      payer_email: contactParent.email || null,
      payer_phone: contactParent.phone || null,
      payer_personal_code: contactParent.personalCode || null,
      parent_secondary_name: isSchoolView ? (secondaryParent.name || null) : null,
      parent_secondary_email: isSchoolView ? (secondaryParent.email || null) : null,
      parent_secondary_phone: isSchoolView ? (secondaryParent.phone || null) : null,
      parent_secondary_personal_code: isSchoolView ? (secondaryParent.personalCode || null) : null,
      parent_secondary_address: isSchoolView ? (resolvedParent2AddressEdit || null) : null,
      contact_parent: isSchoolView ? studentEditDraft.contact_parent : 'primary',
      student_address: studentEditDraft.student_address.trim() || null,
      student_city: studentEditDraft.student_city.trim() || null,
      child_birth_date: studentEditDraft.child_birth_date || null,
    };

    const { error } = await supabase.from('students').update(payload).eq('id', selectedStudent.id);
    setSavingStudentInfo(false);
    if (error) {
      setToastMessage({ message: t('compStu.errorPrefix', { msg: error.message }), type: 'error' });
      return;
    }
    setSelectedStudent((s) => (s ? { ...s, ...payload } : s));
    setStudents((prev) => prev.map((s) => (s.id === selectedStudent.id ? { ...s, ...payload } : s)));
    setToastMessage({ message: t('compStu.commentSaved'), type: 'success' });
    invalidateCache('company_contracts');
    fetchData();
    if (isSchoolView) {
      void sendParentPortalInvites(selectedStudent.id, true);
    }
  };

  const handleDetachStudent = async (id: string) => {
    if (!confirm(t('compStu.confirmDetachStudent'))) return;
    const { error } = await supabase.from('students').update({ detached_at: new Date().toISOString() }).eq('id', id);
    if (!error) {
      setToastMessage({ message: t('compStu.studentDetached'), type: 'success' });
      fetchData();
    } else {
      setToastMessage({ message: t('compStu.errorPrefix', { msg: error.message }), type: 'error' });
    }
  };

  const handleRestoreStudent = async (id: string) => {
    const { error } = await supabase.from('students').update({ detached_at: null }).eq('id', id);
    if (!error) {
      setToastMessage({ message: t('compStu.studentRestored'), type: 'success' });
      fetchData();
    } else {
      setToastMessage({ message: t('compStu.errorPrefix', { msg: error.message }), type: 'error' });
    }
  };

  const handleDeleteStudent = async (id: string) => {
    if (!confirm(t('compStu.confirmDeleteStudent'))) return;

    const { error } = await supabase.from('students').delete().eq('id', id);
    if (!error) {
      setToastMessage({ message: t('compStu.studentDeleted'), type: 'success' });
      fetchData();
    } else {
      setToastMessage({ message: t('compStu.errorPrefix', { msg: error.message }), type: 'error' });
    }
  };

  const sendParentPortalInvites = async (studentId: string, showToast: boolean) => {
    setSendingParentInvites(true);
    try {
      const res = await fetch('/api/parent-create-invites-for-student', {
        method: 'POST',
        headers: await authHeaders(),
        body: JSON.stringify({ studentId }),
      });
      const json = await res.json().catch(() => ({}));
      if (showToast) {
        if (!res.ok) {
          setToastMessage({ message: (json as { error?: string }).error || t('compStu.errorPrefix', { msg: '' }), type: 'error' });
        } else {
          const n = (json as { sent?: number }).sent ?? 0;
          setToastMessage({
            message: n > 0 ? `Tėvų kvietimai išsiųsti: ${n}` : 'Nėra tėvų el. paštų arba kvietimai jau sukurti.',
            type: n > 0 ? 'success' : 'error',
          });
        }
      }
    } catch {
      if (showToast) setToastMessage({ message: t('common.error'), type: 'error' });
    } finally {
      setSendingParentInvites(false);
    }
  };

  const handleSendInviteNow = async () => {
    if (!selectedStudent) return;
    const recipient = (selectedStudent.email || '').trim() || (selectedStudent.payer_email || '').trim();
    if (!recipient) {
      setToastMessage({ message: t('compStu.noInviteRecipient'), type: 'error' });
      return;
    }
    if (!selectedStudent.invite_code) {
      setToastMessage({ message: t('compStu.inviteMissingCode'), type: 'error' });
      return;
    }
    setSendingInviteNow(true);
    const bookingUrl = `${baseUrl}/book/${selectedStudent.invite_code}`;
    const ok = await sendEmail({
      type: 'invite_email',
      to: recipient,
      data: {
        studentName: selectedStudent.full_name,
        tutorName: selectedStudent.tutor?.full_name || t('compStu.tutorFallback'),
        inviteCode: selectedStudent.invite_code,
        bookingUrl,
      },
    });
    setSendingInviteNow(false);
    setToastMessage({
      message: ok ? t('compStu.inviteSentNowSuccess') : t('compStu.inviteSentNowFailed'),
      type: ok ? 'success' : 'error',
    });
  };

  if (loading) {
    return (
      <>
        <div className="max-w-6xl mx-auto">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8">
            <p className="text-center text-gray-500">{t('compStu.loadingText')}</p>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      {toastMessage && (
        <Toast
          message={toastMessage.message}
          type={toastMessage.type}
          onClose={() => setToastMessage(null)}
        />
      )}
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between mb-6">
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <GraduationCap className="w-6 h-6 text-indigo-600" />
            {t('compStu.title')}
          </h1>

          <div className="flex flex-wrap gap-2 justify-end items-center w-full lg:w-auto">
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              <Input
                type="search"
                placeholder={t('compStu.searchPlaceholder')}
                value={studentSearch}
                onChange={(e) => setStudentSearch(e.target.value)}
                className="pl-9 rounded-xl border-gray-200"
                aria-label={t('compStu.searchAriaLabel')}
              />
            </div>
              <Button
                variant={showTrashBin ? 'default' : 'outline'}
                size="sm"
                className="rounded-xl gap-1.5"
                onClick={() => setShowTrashBin(v => !v)}
              >
                <Archive className="w-4 h-4" />
                {showTrashBin ? t('compStu.activeStudents') : t('compStu.trashBin')}
              </Button>
              <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogTrigger asChild>
                  <Button className="gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-700">
                    <Plus className="w-4 h-4" />
                    {t('compStu.addStudent')}
                  </Button>
                </DialogTrigger>
            <DialogContent className="w-[97vw] sm:max-w-3xl lg:max-w-4xl max-h-[min(92vh,820px)] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{t('compStu.addStudentTitle')}</DialogTitle>
                <DialogDescription>
                  {t('compStu.addStudentDesc')}
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleAddStudent}>
                <div className="grid gap-4 py-4">
                  <div className="space-y-2">
                    <Label>{t('compStu.tutorsRequired')}</Label>
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setMultiTutorPickerOpen((v) => !v)}
                        className="w-full flex items-center justify-between rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm hover:border-indigo-300 transition-colors"
                      >
                        <span className="truncate text-left">
                          {newStudent.tutor_ids.length === 0 && t('compStu.selectTutor')}
                          {newStudent.tutor_ids.length === 1 && (() => {
                            const found = tutors.find((tt) => tt.id === newStudent.tutor_ids[0]);
                            return found?.full_name || t('compStu.oneTutorSelected');
                          })()}
                          {newStudent.tutor_ids.length > 1 && t('compStu.tutorsSelected', { count: String(newStudent.tutor_ids.length) })}
                        </span>
                        <span className="text-xs text-gray-400">▼</span>
                      </button>
                      {multiTutorPickerOpen && (
                        <div className="absolute z-30 mt-1 w-full rounded-xl border border-gray-200 bg-white shadow-lg p-3 space-y-2 max-h-72 overflow-hidden">
                          <Input
                            placeholder={t('compStu.searchTutor')}
                            value={multiTutorSearch}
                            onChange={(e) => setMultiTutorSearch(e.target.value)}
                            className="h-8 text-xs rounded-lg"
                          />
                          <div className="mt-2 max-h-52 overflow-y-auto space-y-1">
                            {tutors
                              .filter((t) =>
                                t.full_name.toLowerCase().includes(multiTutorSearch.trim().toLowerCase())
                              )
                              .map((t) => {
                                const active = newStudent.tutor_ids.includes(t.id);
                                return (
                                  <label
                                    key={t.id}
                                    className="flex items-center gap-2 px-2 py-1 rounded-lg hover:bg-gray-50 cursor-pointer text-xs"
                                  >
                                    <input
                                      type="checkbox"
                                      checked={active}
                                      onChange={(e) => {
                                        const next = e.target.checked
                                          ? [...newStudent.tutor_ids, t.id]
                                          : newStudent.tutor_ids.filter((id) => id !== t.id);
                                        setNewStudent({ ...newStudent, tutor_ids: next });
                                      }}
                                      className="w-3.5 h-3.5"
                                    />
                                    <span className="truncate">{t.full_name}</span>
                                  </label>
                                );
                              })}
                            {tutors.filter((t) =>
                              t.full_name.toLowerCase().includes(multiTutorSearch.trim().toLowerCase())
                            ).length === 0 && (
                              <p className="text-[11px] text-gray-400 px-2 py-1">{t('compStu.noTutorsFound')}</p>
                            )}
                          </div>
                          <div className="flex justify-end pt-1">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-7 px-3 rounded-lg text-xs"
                              onClick={() => setMultiTutorPickerOpen(false)}
                            >
                              {t('compStu.closePicker')}
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                    <p className="text-[11px] text-gray-500">
                      {t('compStu.tutorPickerHint')}
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label>{t('compStu.fullNameRequired')}</Label>
                    <Input
                      value={newStudent.full_name}
                      onChange={(e) => setNewStudent({ ...newStudent, full_name: e.target.value })}
                      placeholder={t('compStu.namePlaceholder')}
                      className="rounded-xl"
                      required
                    />
                  </div>

                  <div className="grid sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>{t('compStu.emailLabel')}</Label>
                    <Input
                      type="email"
                      value={newStudent.email}
                      onChange={(e) => setNewStudent({ ...newStudent, email: e.target.value })}
                      placeholder="jonas@example.com"
                      className="rounded-xl"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>{t('compStu.phoneLabel')}</Label>
                    <Input
                      value={newStudent.phone}
                      onChange={(e) => setNewStudent({ ...newStudent, phone: formatLithuanianPhone(e.target.value) })}
                      placeholder="+370 600 00000"
                      className="rounded-xl"
                    />
                  </div>
                  </div>

                  {isSchoolView && (
                    <div className="grid sm:grid-cols-3 gap-4">
                      <div className="space-y-2">
                        <Label>Vaiko gimimo data</Label>
                        <DateInput
                          value={newStudent.child_birth_date}
                          onChange={(e) => setNewStudent({ ...newStudent, child_birth_date: e.target.value })}
                        />
                        {newStudent.child_birth_date && (
                          <p className="text-xs text-gray-500">
                            Amžius: {calculateAgeFromDate(newStudent.child_birth_date) ?? '—'} m.
                          </p>
                        )}
                      </div>
                      <div className="space-y-2">
                        <Label>Adresas</Label>
                        <Input
                          value={newStudent.student_address}
                          onChange={(e) => setNewStudent({ ...newStudent, student_address: e.target.value })}
                          placeholder="Gatvė, namo nr."
                          className="rounded-xl"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Miestas</Label>
                        <Input
                          value={newStudent.student_city}
                          onChange={(e) => setNewStudent({ ...newStudent, student_city: e.target.value })}
                          placeholder="Vilnius"
                          className="rounded-xl"
                        />
                      </div>
                    </div>
                  )}

                  {isSchoolView && (
                    <>
                      <div
                        className={`rounded-xl border p-3 space-y-3 cursor-pointer ${newStudent.contact_parent === 'primary' ? 'border-indigo-400 bg-indigo-50/40' : 'border-gray-200'}`}
                        onClick={() => setNewStudent({ ...newStudent, contact_parent: 'primary' })}
                      >
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">1 tėvas (privalomas)</p>
                        <div className="grid sm:grid-cols-3 gap-3">
                        <div className="space-y-2">
                        <Label>{t('compStu.parentFullNameRequired')}</Label>
                        <Input
                          value={newStudent.payer_name}
                          onChange={(e) => setNewStudent({ ...newStudent, payer_name: e.target.value })}
                          placeholder={t('compStu.parentNamePlaceholder')}
                          className="rounded-xl"
                          required
                        />
                      </div>

                      <div className="space-y-2">
                        <Label>{t('compStu.parentEmailRequired')}</Label>
                        <Input
                          type="email"
                          value={newStudent.payer_email}
                          onChange={(e) => setNewStudent({ ...newStudent, payer_email: e.target.value })}
                          placeholder="tevai@example.com"
                          className="rounded-xl"
                          required
                        />
                      </div>

                      <div className="space-y-2">
                          <Label>Asmens kodas</Label>
                          <Input
                            value={newStudent.payer_personal_code}
                            onChange={(e) => setNewStudent({ ...newStudent, payer_personal_code: e.target.value })}
                            placeholder="Asmens kodas"
                            className="rounded-xl"
                          />
                        </div>
                        <div className="space-y-2">
                        <Label>{t('compStu.parentPhoneRequired')}</Label>
                        <Input
                          value={newStudent.payer_phone}
                          onChange={(e) => setNewStudent({ ...newStudent, payer_phone: formatLithuanianPhone(e.target.value) })}
                          placeholder="+370 600 00000"
                          className="rounded-xl"
                          required
                        />
                      </div>
                        </div>
                      </div>
                      <div
                        className={`rounded-xl border p-3 space-y-3 cursor-pointer ${newStudent.contact_parent === 'secondary' ? 'border-indigo-400 bg-indigo-50/40' : 'border-gray-200'}`}
                        onClick={() => setNewStudent({ ...newStudent, contact_parent: 'secondary' })}
                      >
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">2 tėvas (pasirinktinai)</p>
                        <div className="grid sm:grid-cols-3 gap-3">
                          <Input
                            value={newStudent.parent_secondary_name}
                            onChange={(e) => setNewStudent({ ...newStudent, parent_secondary_name: e.target.value })}
                            placeholder="Vardas Pavardė"
                            className="rounded-xl"
                          />
                          <Input
                            type="email"
                            value={newStudent.parent_secondary_email}
                            onChange={(e) => setNewStudent({ ...newStudent, parent_secondary_email: e.target.value })}
                            placeholder="tevai2@example.com"
                            className="rounded-xl"
                          />
                          <Input
                            value={newStudent.parent_secondary_phone}
                            onChange={(e) => setNewStudent({ ...newStudent, parent_secondary_phone: formatLithuanianPhone(e.target.value) })}
                            placeholder="+370 600 00000"
                            className="rounded-xl"
                          />
                          <Input
                            value={newStudent.parent_secondary_personal_code}
                            onChange={(e) => setNewStudent({ ...newStudent, parent_secondary_personal_code: e.target.value })}
                            placeholder="Asmens kodas"
                            className="rounded-xl"
                          />
                          <label
                            className="sm:col-span-3 flex items-center gap-2 text-xs text-gray-600 cursor-pointer"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <input
                              type="checkbox"
                              checked={newStudent.parent2_address_same_as_primary}
                              onChange={(e) => {
                                const checked = e.target.checked;
                                setNewStudent((p) => ({ ...p, parent2_address_same_as_primary: checked }));
                              }}
                              className="rounded border-gray-300"
                            />
                            Antro tėvo adresas toks pats kaip gyvenamoji vieta (1 tėvo / mokinio adresas)
                          </label>
                          <div className="sm:col-span-3 space-y-1" onClick={(e) => e.stopPropagation()}>
                            <Label className="text-xs text-gray-500">Antro tėvo adresas</Label>
                            <Input
                              value={
                                newStudent.parent2_address_same_as_primary
                                  ? joinStudentAddressLine(newStudent.student_address, newStudent.student_city)
                                  : newStudent.parent_secondary_address
                              }
                              onChange={(e) =>
                                setNewStudent((p) => ({ ...p, parent_secondary_address: e.target.value, parent2_address_same_as_primary: false }))
                              }
                              disabled={newStudent.parent2_address_same_as_primary}
                              placeholder="Gatvė, miestas"
                              className="rounded-xl"
                            />
                          </div>
                        </div>
                      </div>
                      <p className="text-xs text-gray-500">Kontaktinis tėvas parenkamas paspaudus ant atitinkamo tėvo bloko.</p>
                    </>
                  )}

                  <div className="border-t border-gray-200 pt-4 space-y-3">
                    <div className="flex items-center gap-2 mb-1">
                      <Sparkles className="w-4 h-4 text-amber-500" />
                      <Label className="text-sm font-semibold">{t('compStu.individualPriceOptional')}</Label>
                    </div>
                    {!newStudent.tutor_ids[0] ? (
                      <p className="text-xs text-gray-600 bg-gray-50 border border-gray-100 rounded-lg px-3 py-2">
                        {t('compStu.selectTutorFirst')}
                      </p>
                    ) : tutorSubjects.length === 0 ? (
                      <p className="text-xs text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                        {t('compStu.noSubjectsYet')}
                      </p>
                    ) : (
                      <>
                        <div className="space-y-2">
                          <Label className="text-xs text-gray-600">{t('compStu.subjectLabel')}</Label>
                          <Select
                            value={selectedSubjectForInvite}
                            onValueChange={setSelectedSubjectForInvite}
                          >
                            <SelectTrigger className="rounded-xl">
                              <SelectValue placeholder={t('compStu.selectSubject')} />
                            </SelectTrigger>
                          <SelectContent className="max-h-72 overflow-y-auto">
                            <div className="sticky top-0 z-10 bg-white p-2 border-b border-gray-100">
                              <Input
                                value={subjectSearch}
                                onChange={(e) => setSubjectSearch(e.target.value)}
                                placeholder={t('common.search')}
                                className="h-9 rounded-xl"
                              />
                              {!subjectSearch && tutorSubjects.length > 5 && (
                                <p className="mt-1 text-[11px] text-gray-500">{t('common.searchToSeeMore')}</p>
                              )}
                            </div>
                            {(subjectSearch
                              ? tutorSubjects.filter((s) => (s.name || '').toLowerCase().includes(subjectSearch.trim().toLowerCase()))
                              : tutorSubjects.slice(0, 5)
                            ).map((subj) => (
                                <SelectItem key={subj.id} value={subj.id}>
                                  <div className="flex items-center gap-2">
                                    <span
                                      className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                                      style={{ backgroundColor: subj.color }}
                                    />
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
                                <Label className="text-xs text-gray-600">{t('compStu.priceEur')}</Label>
                                <Input
                                  type="number"
                                  value={customPrice}
                                  onChange={(e) =>
                                    setCustomPrice(e.target.value ? parseFloat(e.target.value) : '')
                                  }
                                  placeholder="25"
                                  className="rounded-xl"
                                  min="0"
                                  step="0.01"
                                />
                              </div>
                              <div className="space-y-2">
                                <Label className="text-xs text-gray-600">{t('compStu.durationMin')}</Label>
                                <Input
                                  type="number"
                                  value={customDuration}
                                  onChange={(e) =>
                                    setCustomDuration(e.target.value ? parseInt(e.target.value, 10) : '')
                                  }
                                  placeholder="60"
                                  className="rounded-xl"
                                  min="1"
                                />
                              </div>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                              <div className="space-y-2">
                                <Label className="text-xs text-gray-600">{t('compStu.cancellationH')}</Label>
                                <Select
                                  value={customCancellationHours.toString()}
                                  onValueChange={(v) => setCustomCancellationHours(parseInt(v, 10))}
                                >
                                  <SelectTrigger className="rounded-xl">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {[2, 6, 12, 24, 48].map((h) => (
                                      <SelectItem key={h} value={h.toString()}>
                                        {h} {t('compStu.hoursAbbrev')}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                              <div className="space-y-2">
                                <Label className="text-xs text-gray-600">{t('compStu.feePercent')}</Label>
                                <Select
                                  value={customCancellationFee.toString()}
                                  onValueChange={(v) => setCustomCancellationFee(parseInt(v, 10))}
                                >
                                  <SelectTrigger className="rounded-xl">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {[0, 25, 50, 75, 100].map((p) => (
                                      <SelectItem key={p} value={p.toString()}>
                                        {p}%
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                            </div>
                          </>
                        )}
                      </>
                    )}
                  </div>

                  <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-3">
                    <p className="text-xs text-indigo-700">
                      {t(isSchoolView ? 'compStu.inviteCodeHintSchool' : 'compStu.inviteCodeHint')}
                    </p>
                  </div>
                </div>
                <DialogFooter>
                  <Button
                    variant="outline"
                    type="button"
                    onClick={() => setIsDialogOpen(false)}
                    className="rounded-xl"
                  >
                    {t('compStu.cancelBtn')}
                  </Button>
                  <Button type="submit" disabled={saving} className="rounded-xl gap-2">
                    <Plus className="w-4 h-4" />
                    {saving ? t('compStu.savingBtn') : t('compStu.addBtn')}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
          </div>
        </div>

        {students.length === 0 && !loading ? (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
            <div className="text-center py-16 px-6">
              <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4">
                <User className="w-8 h-8 text-gray-300" />
              </div>
              <p className="text-gray-500 font-medium">{t('compStu.noStudents')}</p>
              <p className="text-gray-400 text-sm mt-1">{t('compStu.addFirstStudent')}</p>
            </div>
          </div>
        ) : filteredGroups.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
            <div className="text-center py-12 px-6">
              <p className="text-gray-500 font-medium">{t('compStu.noSearchResults')}</p>
              <p className="text-gray-400 text-sm mt-1">{t('compStu.changeSearchQuery')}</p>
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            {/* Mobile cards */}
            <div className="md:hidden divide-y divide-gray-100">
              {filteredGroups.map((g) => {
                const student = g.primary;
                const initials = student.full_name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);
                const hasTutor = g.rows.some((r) => r.tutor_id);
                const tutorNames = hasTutor
                  ? Array.from(new Set(g.rows.filter((r) => r.tutor?.full_name).map((r) => r.tutor!.full_name)))
                  : [];
                return (
                  <div
                    key={g.key}
                    role="button"
                    tabIndex={0}
                    className="w-full text-left p-4 hover:bg-gray-50 transition-colors cursor-pointer"
                    onClick={() => {
                      setSelectedStudent(student);
                      setSelectedStudentGroup(g.rows);
                      setTrialTutorId(student.tutor_id);
                      setIsStudentModalOpen(true);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setSelectedStudent(student);
                        setSelectedStudentGroup(g.rows);
                        setTrialTutorId(student.tutor_id);
                        setIsStudentModalOpen(true);
                      }
                    }}
                  >
                    <div className="flex items-start gap-3">
                      <div className="w-11 h-11 rounded-full bg-gradient-to-br from-indigo-400 to-indigo-600 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                        {initials || '?'}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className="font-semibold text-gray-900 truncate">{student.full_name}</p>
                          {student.linked_user_id ? (
                            <span className="text-[11px] text-green-700 bg-green-50 border border-green-200 rounded-md px-1.5 py-0.5 flex-shrink-0">
                              {t('compStu.connected')}
                            </span>
                          ) : (
                            <span className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-1.5 py-0.5 flex-shrink-0">
                              {t('compStu.notConnected')}
                            </span>
                          )}
                        </div>
                        {isSchoolView && (
                          <div className="mt-1">
                            {(() => {
                              const b = mediaConsentBadge(student.media_publicity_consent);
                              return (
                                <span className={`text-[11px] border rounded-md px-1.5 py-0.5 inline-block ${b.className}`}>
                                  {t(b.labelKey)}
                                </span>
                              );
                            })()}
                          </div>
                        )}
                        <p className="text-xs text-gray-500 mt-1 truncate">
                          {t('compStu.tutorInline')}{' '}
                          {tutorNames.length > 0 ? (
                            <span className="text-gray-700 font-medium">
                              {tutorNames.length <= 1 ? tutorNames[0] : `${tutorNames[0]} +${tutorNames.length - 1}`}
                            </span>
                          ) : (
                            <span className="text-amber-600 font-medium">{t('compStu.tutorNotAssigned')}</span>
                          )}
                        </p>
                        <div className="mt-2 space-y-1 text-xs text-gray-700">
                          <div className="flex items-center gap-1.5">
                            <Mail className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                            <span className="truncate">{adminShowEmail(student.email)}</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <Phone className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                            <span className="truncate">{adminShowPhone(student.phone)}</span>
                          </div>
                          {shouldShowParentContacts(student) && (
                            <div className="pt-2 mt-2 border-t border-gray-100 space-y-1">
                              <p className="text-[11px] text-gray-400 font-semibold uppercase tracking-wide">{t('compStu.payerLabel')}</p>
                              <div className="flex items-center gap-1.5">
                                <Mail className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                                <span className="truncate">{adminShowEmail(student.payer_email)}</span>
                              </div>
                            </div>
                          )}
                        </div>
                        <div className="mt-3 flex items-center justify-between gap-3">
                          <code className="font-mono font-bold text-indigo-700 text-xs tracking-widest bg-indigo-50 px-2 py-1 rounded">
                            {student.invite_code}
                          </code>
                          <button
                            type="button"
                            className={`p-2 rounded-lg transition-colors ${showTrashBin ? 'text-green-400 hover:text-green-600 hover:bg-green-50' : 'text-gray-400 hover:text-red-500 hover:bg-red-50'}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              showTrashBin ? void handleRestoreStudent(student.id) : void handleDetachStudent(student.id);
                            }}
                            aria-label={showTrashBin ? t('compStu.restoreBtn') : t('compStu.deleteStudentLabel')}
                            title={showTrashBin ? t('compStu.restoreBtn') : t('compStu.detachBtn')}
                          >
                            {showTrashBin ? <ArchiveRestore className="w-4 h-4" /> : <Archive className="w-4 h-4" />}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">{t('compStu.thStudent')}</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">{t('compStu.thTutor')}</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">{t('compStu.thContacts')}</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">{t('compStu.thCode')}</th>
                    <th className="px-6 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">{t('compStu.thActions')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredGroups.map((g) => {
                    const student = g.primary;
                    const initials = student.full_name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);
                    const hasTutorDt = g.rows.some((r) => r.tutor_id);
                    const tutorNames = hasTutorDt
                      ? Array.from(new Set(g.rows.filter((r) => r.tutor?.full_name).map((r) => r.tutor!.full_name)))
                      : [];
                    return (
                      <tr
                        key={g.key}
                        className="hover:bg-gray-50 transition-colors cursor-pointer"
                        onClick={(e) => {
                          if ((e.target as HTMLElement).closest('button')) return;
                          setSelectedStudent(student);
                          setSelectedStudentGroup(g.rows);
                          setTrialTutorId(student.tutor_id);
                          setIsStudentModalOpen(true);
                        }}
                      >
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-400 to-indigo-600 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                              {initials || '?'}
                            </div>
                            <div>
                              <p className="font-semibold text-gray-900">{student.full_name}</p>
                              <p className="text-xs mt-0.5">
                                {student.linked_user_id ? (
                                  <span className="text-green-700 bg-green-50 border border-green-200 rounded-md px-1.5 py-0.5">{t('compStu.connected')}</span>
                                ) : (
                                  <span className="text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-1.5 py-0.5">{t('compStu.notConnected')}</span>
                                )}
                              </p>
                              {isSchoolView && (
                                <p className="text-xs mt-1">
                                  {(() => {
                                    const b = mediaConsentBadge(student.media_publicity_consent);
                                    return (
                                      <span className={`text-[11px] border rounded-md px-1.5 py-0.5 inline-block ${b.className}`}>
                                        {t(b.labelKey)}
                                      </span>
                                    );
                                  })()}
                                </p>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          {tutorNames.length > 0 ? (
                            <>
                              <p className="text-sm text-gray-700">
                                {tutorNames.length <= 1 ? tutorNames[0] : `${tutorNames[0]} +${tutorNames.length - 1}`}
                              </p>
                              {tutorNames.length > 1 && (
                                <p className="text-[11px] text-gray-400 mt-0.5">{t('compStu.moreThanOneTutor')}</p>
                              )}
                            </>
                          ) : (
                            <span className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-md px-1.5 py-0.5">{t('compStu.tutorNotAssigned')}</span>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <div className="space-y-2 text-xs text-gray-700">
                            <div>
                              <span className="text-gray-400 font-semibold uppercase tracking-wide">{t('compStu.studentLabel')}</span>
                              <div className="flex items-center gap-1.5 mt-0.5">
                                <Mail className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                                <span>{adminShowEmail(student.email)}</span>
                              </div>
                              <div className="flex items-center gap-1.5">
                                <Phone className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                                <span>{adminShowPhone(student.phone)}</span>
                              </div>
                            </div>
                            {shouldShowParentContacts(student) && (
                              <div className="pt-1 border-t border-gray-100">
                                <span className="text-gray-400 font-semibold uppercase tracking-wide">{t('compStu.payerLabel')}</span>
                                <div className="flex items-center gap-1.5 mt-0.5">
                                  <Mail className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                                  <span>{adminShowEmail(student.payer_email)}</span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                  <Phone className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                                  <span>{adminShowPhone(student.payer_phone)}</span>
                                </div>
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <code className="font-mono font-bold text-indigo-700 text-sm tracking-widest bg-indigo-50 px-2 py-1 rounded">
                            {student.invite_code}
                          </code>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <button
                            onClick={() => showTrashBin ? handleRestoreStudent(student.id) : handleDetachStudent(student.id)}
                            className={`p-2 rounded-lg transition-colors ${showTrashBin ? 'text-green-400 hover:text-green-600 hover:bg-green-50' : 'text-gray-400 hover:text-red-500 hover:bg-red-50'}`}
                            title={showTrashBin ? t('compStu.restoreBtn') : t('compStu.detachBtn')}
                          >
                            {showTrashBin ? <ArchiveRestore className="w-4 h-4" /> : <Archive className="w-4 h-4" />}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Student Detail Modal */}
        <Dialog open={isStudentModalOpen} onOpenChange={(open) => { setIsStudentModalOpen(open); if (!open) { setSendPackageOpen(false); } }}>
          <DialogContent className="w-[95vw] sm:max-w-2xl lg:max-w-3xl xl:max-w-4xl max-h-[90vh] overflow-y-auto p-5 sm:p-6">
            <DialogHeader>
              <DialogTitle>{t('compStu.studentInfo')}</DialogTitle>
            </DialogHeader>
            {selectedStudent && (
              <div className="space-y-5">
                {selectedStudentGroup.length > 1 && (
                  <div className="p-3 rounded-xl border border-gray-100 bg-gray-50">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">{t('compStu.thTutor')}</p>
                    <Select
                      value={selectedStudent.tutor_id || selectedStudent.id}
                      onValueChange={(val) => {
                        const row = selectedStudentGroup.find((r) => (r.tutor_id || r.id) === val);
                        if (!row) return;
                        setSelectedStudent(row);
                        setTrialTutorId(row.tutor_id);
                      }}
                    >
                      <SelectTrigger className="rounded-xl bg-white">
                        <SelectValue placeholder={t('compStu.selectActiveTutor')} />
                      </SelectTrigger>
                      <SelectContent>
                        {selectedStudentGroup.map((r) => (
                          <SelectItem key={r.id} value={r.tutor_id || r.id}>
                            {r.tutor_id ? (r.tutor?.full_name || '—') : t('compStu.tutorNotAssigned')}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-[11px] text-gray-500 mt-2">
                      {t('compStu.multiTutorHint')}
                    </p>
                  </div>
                )}
                {/* Info */}
                <div className="flex justify-between items-start pb-4 border-b border-gray-100 gap-4">
                  <div className="space-y-1 flex-1">
                    <h3 className="text-xl font-bold text-gray-900">{selectedStudent.full_name}</h3>
                    <div className="text-gray-600 text-sm space-y-3">
                      <div>
                        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">{t('compStu.studentLabel')}</p>
                        <p>
                          {t('compStu.emailInline')} <span className="text-gray-900">{adminShowEmail(selectedStudent.email)}</span>
                        </p>
                        <p>
                          {t('compStu.phoneInline')} <span className="text-gray-900">{adminShowPhone(selectedStudent.phone)}</span>
                        </p>
                      </div>
                      {shouldShowParentContacts(selectedStudent) && (
                        <div className="pt-2 border-t border-gray-100">
                          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">{t('compStu.payerLabel')}</p>
                          <p>
                            {t('compStu.emailInline')} <span className="text-gray-900">{adminShowEmail(selectedStudent.payer_email)}</span>
                          </p>
                          <p>
                            {t('compStu.phoneInline')} <span className="text-gray-900">{adminShowPhone(selectedStudent.payer_phone)}</span>
                          </p>
                        </div>
                      )}
                    </div>
                    <p className="text-sm font-semibold">
                      {t('compStu.tutorInline')}{' '}
                      {selectedStudent.tutor_id ? (
                        <span className="text-indigo-600">{selectedStudent.tutor?.full_name || '—'}</span>
                      ) : (
                        <span className="text-amber-600">{t('compStu.tutorNotAssigned')}</span>
                      )}
                    </p>
                    <p className="text-gray-600 text-sm">
                      {t('compStu.codeInline')} <code className="font-mono font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded">{selectedStudent.invite_code}</code>
                    </p>
                    {isSchoolView && (
                      <div className="mt-3 rounded-xl border border-gray-200 bg-gray-50 p-3 space-y-3">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Redaguoti mokinio duomenis</p>
                          <Button type="button" variant="outline" size="sm" onClick={() => setStudentEditOpen((v) => !v)}>
                            {studentEditOpen ? 'Slėpti' : 'Atidaryti'}
                          </Button>
                        </div>

                        {studentEditOpen ? (
                          <>
                          <div className="grid sm:grid-cols-2 gap-2">
                            <Input value={studentEditDraft.full_name} onChange={(e) => setStudentEditDraft((p) => ({ ...p, full_name: e.target.value }))} placeholder={t('compStu.fullNameRequired')} className="rounded-xl bg-white" />
                            <Input type="email" value={studentEditDraft.email} onChange={(e) => setStudentEditDraft((p) => ({ ...p, email: e.target.value }))} placeholder={t('compStu.emailLabel')} className="rounded-xl bg-white" />
                            <Input value={studentEditDraft.phone} onChange={(e) => setStudentEditDraft((p) => ({ ...p, phone: formatLithuanianPhone(e.target.value) }))} placeholder={t('compStu.phoneLabel')} className="rounded-xl bg-white" />
                            <DateInput value={studentEditDraft.child_birth_date} onChange={(e) => setStudentEditDraft((p) => ({ ...p, child_birth_date: e.target.value }))} />
                            <Input value={studentEditDraft.student_address} onChange={(e) => setStudentEditDraft((p) => ({ ...p, student_address: e.target.value }))} placeholder="Adresas" className="rounded-xl bg-white" />
                            <Input value={studentEditDraft.student_city} onChange={(e) => setStudentEditDraft((p) => ({ ...p, student_city: e.target.value }))} placeholder="Miestas" className="rounded-xl bg-white" />
                            {studentEditDraft.child_birth_date && (
                              <p className="text-xs text-gray-500 sm:col-span-2">Amžius: {calculateAgeFromDate(studentEditDraft.child_birth_date) ?? '—'} m.</p>
                            )}
                          </div>
                          <div className="rounded-xl border border-gray-200 bg-white p-3 space-y-2">
                            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                              {isSchoolView ? 'Kontaktinis tėvas' : t('compStu.payerLabel')}
                            </p>
                            <div className="grid sm:grid-cols-2 gap-2">
                              <Input value={studentEditDraft.payer_name} onChange={(e) => setStudentEditDraft((p) => ({ ...p, payer_name: e.target.value }))} placeholder={t('compStu.parentFullNameRequired')} className="rounded-xl bg-white" />
                              <Input type="email" value={studentEditDraft.payer_email} onChange={(e) => setStudentEditDraft((p) => ({ ...p, payer_email: e.target.value }))} placeholder={t('compStu.parentEmailRequired')} className="rounded-xl bg-white" />
                              <Input value={studentEditDraft.payer_phone} onChange={(e) => setStudentEditDraft((p) => ({ ...p, payer_phone: formatLithuanianPhone(e.target.value) }))} placeholder={t('compStu.parentPhoneRequired')} className="rounded-xl bg-white" />
                              <Input
                                value={studentEditDraft.payer_personal_code}
                                onChange={(e) => setStudentEditDraft((p) => ({ ...p, payer_personal_code: e.target.value }))}
                                placeholder={isSchoolView ? 'Kontaktinio tėvo asmens kodas' : 'Mokėtojo asmens kodas'}
                                className="rounded-xl bg-white"
                              />
                            </div>
                          </div>
                          {isSchoolView && (
                            <>
                              <div className="rounded-xl border border-gray-200 bg-white p-3 space-y-2">
                                <div className="flex items-center justify-between gap-2">
                                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Antras tėvas (pasirinktinai)</p>
                                  <Button type="button" variant="outline" size="sm" onClick={() => setStudentEditSecondParentOpen((v) => !v)}>
                                    {studentEditSecondParentOpen ? 'Slėpti' : 'Rodyti'}
                                  </Button>
                                </div>
                                {studentEditSecondParentOpen && (
                                  <div className="grid sm:grid-cols-2 gap-2">
                                    <Input value={studentEditDraft.parent_secondary_name} onChange={(e) => setStudentEditDraft((p) => ({ ...p, parent_secondary_name: e.target.value }))} placeholder="2 tėvas: vardas pavardė" className="rounded-xl bg-white" />
                                    <Input type="email" value={studentEditDraft.parent_secondary_email} onChange={(e) => setStudentEditDraft((p) => ({ ...p, parent_secondary_email: e.target.value }))} placeholder="2 tėvas: el. paštas" className="rounded-xl bg-white" />
                                    <Input value={studentEditDraft.parent_secondary_phone} onChange={(e) => setStudentEditDraft((p) => ({ ...p, parent_secondary_phone: formatLithuanianPhone(e.target.value) }))} placeholder="2 tėvas: tel." className="rounded-xl bg-white" />
                                    <Input value={studentEditDraft.parent_secondary_personal_code} onChange={(e) => setStudentEditDraft((p) => ({ ...p, parent_secondary_personal_code: e.target.value }))} placeholder="2 tėvas: asmens kodas" className="rounded-xl bg-white" />
                                    <label className="sm:col-span-2 flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
                                      <input
                                        type="checkbox"
                                        checked={studentEditDraft.parent2_address_same_as_primary}
                                        onChange={(e) => setStudentEditDraft((p) => ({ ...p, parent2_address_same_as_primary: e.target.checked }))}
                                        className="rounded border-gray-300"
                                      />
                                      Antro tėvo adresas toks pats kaip gyvenamoji vieta (1 tėvo / mokinio adresas)
                                    </label>
                                    <div className="sm:col-span-2 space-y-1">
                                      <Label className="text-xs text-gray-500">Antro tėvo adresas</Label>
                                      <Input
                                        value={
                                          studentEditDraft.parent2_address_same_as_primary
                                            ? joinStudentAddressLine(studentEditDraft.student_address, studentEditDraft.student_city)
                                            : studentEditDraft.parent_secondary_address
                                        }
                                        onChange={(e) =>
                                          setStudentEditDraft((p) => ({
                                            ...p,
                                            parent_secondary_address: e.target.value,
                                            parent2_address_same_as_primary: false,
                                          }))
                                        }
                                        disabled={studentEditDraft.parent2_address_same_as_primary}
                                        placeholder="Gatvė, miestas"
                                        className="rounded-xl bg-white"
                                      />
                                    </div>
                                  </div>
                                )}
                              </div>
                              <div className="sm:col-span-2">
                                <Label className="text-xs text-gray-500">Kontaktinis tėvas sistemoje</Label>
                                <Select value={studentEditDraft.contact_parent} onValueChange={(v: 'primary' | 'secondary') => setStudentEditDraft((p) => ({ ...p, contact_parent: v }))}>
                                  <SelectTrigger className="rounded-xl bg-white mt-1"><SelectValue /></SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="primary">1 tėvas (kontaktinis)</SelectItem>
                                    <SelectItem value="secondary">2 tėvas (kontaktinis)</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                            </>
                          )}
                            <div className="flex justify-end">
                              <Button type="button" size="sm" onClick={() => void handleSaveStudentInfo()} disabled={savingStudentInfo}>
                                {savingStudentInfo ? t('common.loading') : 'Išsaugoti mokinio duomenis'}
                              </Button>
                            </div>
                          </>
                        ) : (
                          <p className="text-xs text-gray-500">Spausk „Atidaryti“, kad redaguotum duomenis.</p>
                        )}
                      </div>
                    )}
                    <div className="pt-1 flex items-center gap-2 flex-wrap">
                      {isSchoolView && (
                        <>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-7 px-2.5 text-[11px]"
                            disabled={sendingInviteNow}
                            onClick={() => void handleSendInviteNow()}
                          >
                            {sendingInviteNow ? t('compStu.sendingNow') : t('compStu.sendInviteNow')}
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-7 px-2.5 text-[11px]"
                            disabled={sendingParentInvites || !selectedStudent}
                            onClick={() => selectedStudent && void sendParentPortalInvites(selectedStudent.id, true)}
                          >
                            {sendingParentInvites ? t('common.loading') : t('parent.resendInvites')}
                          </Button>
                        </>
                      )}
                      {selectedStudent.linked_user_id ? (
                        <span className="inline-flex items-center gap-1 text-green-700 bg-green-50 border border-green-200 rounded-md px-2 py-1 text-xs">
                          <CheckCircle className="w-3.5 h-3.5" /> {t('compStu.connected')}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2 py-1 text-xs">
                          <XCircle className="w-3.5 h-3.5" /> {t('compStu.notConnected')}
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => setEditTutorsOpen((v) => !v)}
                        className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium transition-colors border-gray-200 text-gray-700 bg-white hover:bg-gray-50"
                      >
                        {t('compStu.editTutors')}
                      </button>
                    </div>
                  </div>
                </div>

                {editTutorsOpen && (
                  <div className="p-4 rounded-2xl border border-gray-100 bg-white space-y-3">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{t('compStu.tutorsSection')}</p>
                    <div className="space-y-2">
                      {selectedStudentGroup.map((row) => (
                        <div key={row.id} className="flex items-center justify-between gap-2 p-2 rounded-xl bg-gray-50 border border-gray-100">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-gray-900 truncate">{row.tutor_id ? (row.tutor?.full_name || '—') : t('compStu.tutorNotAssigned')}</p>
                            <p className="text-[11px] text-gray-500 truncate">{t('compStu.codePrefix', { code: row.invite_code })}</p>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <button
                              type="button"
                              className="text-xs px-2 py-1 rounded-lg border border-gray-200 bg-white hover:bg-gray-100"
                              onClick={() => {
                                setSelectedStudent(row);
                                setTrialTutorId(row.tutor_id);
                              }}
                            >
                              {t('compStu.selectBtn')}
                            </button>
                            <button
                              type="button"
                              className="text-xs px-2 py-1 rounded-lg border border-red-200 bg-red-50 text-red-700 hover:bg-red-100"
                              disabled={tutorsSaving}
                              onClick={async () => {
                                if (!confirm(t('compStu.confirmRemoveTutor'))) return;
                                setTutorsSaving(true);
                                const shouldDetachOnly = selectedStudentGroup.length <= 1;
                                const { error } = shouldDetachOnly
                                  ? await supabase
                                      .from('students')
                                      .update({ tutor_id: null })
                                      .eq('id', row.id)
                                  : await supabase
                                      .from('students')
                                      .delete()
                                      .eq('id', row.id);
                                if (error) {
                                  setToastMessage({ message: t('compStu.tutorRemoveFailed'), type: 'error' });
                                } else {
                                  setToastMessage({ message: t('compStu.tutorRemoved'), type: 'success' });
                                  const nextGroup = shouldDetachOnly
                                    ? selectedStudentGroup.map((r) =>
                                        r.id === row.id
                                          ? { ...r, tutor_id: null, tutor: null }
                                          : r
                                      )
                                    : selectedStudentGroup.filter((r) => r.id !== row.id);
                                  setSelectedStudentGroup(nextGroup);
                                  if (nextGroup.length === 0) {
                                    setSelectedStudent(null);
                                    setIsStudentModalOpen(false);
                                  } else if (selectedStudent?.id === row.id) {
                                    const fallback = nextGroup[0];
                                    setSelectedStudent(fallback);
                                    setTrialTutorId(fallback.tutor_id);
                                  }
                                  fetchData();
                                }
                                setTutorsSaving(false);
                              }}
                            >
                              {t('compStu.removeBtn')}
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="pt-2 border-t border-gray-100">
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">{t('compStu.addNewTutor')}</p>
                      <div className="flex gap-2 items-center">
                        <Select value={addingTutorId} onValueChange={setAddingTutorId}>
                          <SelectTrigger className="rounded-xl h-9">
                            <SelectValue placeholder={t('compStu.selectPlaceholder')} />
                          </SelectTrigger>
                          <SelectContent className="max-h-72 overflow-y-auto">
                            <div className="sticky top-0 z-10 bg-white p-2 border-b border-gray-100">
                              <Input
                                value={addingTutorSearch}
                                onChange={(e) => setAddingTutorSearch(e.target.value)}
                                placeholder={t('common.search')}
                                className="h-9 rounded-xl"
                              />
                              {!addingTutorSearch && tutors.length > 5 && (
                                <p className="mt-1 text-[11px] text-gray-500">{t('common.searchToSeeMore')}</p>
                              )}
                            </div>
                            {(addingTutorSearch
                              ? tutors.filter((tu) => (tu.full_name || '').toLowerCase().includes(addingTutorSearch.trim().toLowerCase()))
                              : tutors.slice(0, 5)
                            )
                              .filter((t) => !selectedStudentGroup.some((r) => r.tutor_id === t.id))
                              .map((t) => (
                                <SelectItem key={t.id} value={t.id}>
                                  {t.full_name}
                                </SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                        <Button
                          type="button"
                          className="rounded-xl h-9"
                          disabled={!addingTutorId || tutorsSaving}
                          onClick={async () => {
                            if (!selectedStudent) return;
                            setTutorsSaving(true);

                            const nullTutorRow = selectedStudentGroup.find((r) => !r.tutor_id);
                            let error: any = null;
                            let data: any = null;

                            if (nullTutorRow) {
                              const res = await supabase
                                .from('students')
                                .update({ tutor_id: addingTutorId })
                                .eq('id', nullTutorRow.id)
                                .select('*, linked_user_id, tutor:profiles!students_tutor_id_fkey(full_name)')
                                .single();
                              error = res.error;
                              data = res.data;
                            } else {
                              const inviteCode = generateInviteCode();
                              const res = await supabase
                                .from('students')
                                .insert({
                                  tutor_id: addingTutorId,
                                  full_name: selectedStudent.full_name,
                                  email: selectedStudent.email,
                                  phone: (selectedStudent.phone || '').trim() || null,
                                  payer_name: selectedStudent.payer_name || null,
                                  payer_email: selectedStudent.payer_email || null,
                                  payer_phone: selectedStudent.payer_phone || null,
                                  child_birth_date: selectedStudent.child_birth_date || null,
                                  linked_user_id: selectedStudent.linked_user_id || null,
                                  invite_code: inviteCode,
                                })
                                .select('*, linked_user_id, tutor:profiles!students_tutor_id_fkey(full_name)')
                                .single();
                              error = res.error;
                              data = res.data;
                            }

                            if (error || !data) {
                              setToastMessage({ message: t('compStu.tutorAddFailed'), type: 'error' });
                            } else {
                              setToastMessage({ message: t('compStu.tutorAdded'), type: 'success' });
                              const normalized = { ...(data as any), tutor: Array.isArray((data as any).tutor) ? (data as any).tutor[0] : (data as any).tutor };
                              if (nullTutorRow) {
                                setSelectedStudentGroup((prev) => prev.map((r) => r.id === nullTutorRow.id ? normalized : r));
                                setSelectedStudent(normalized);
                              } else {
                                setSelectedStudentGroup((prev) => [...prev, normalized]);
                              }
                              setAddingTutorId('');
                              fetchData();

                              // Notify tutor about assigned student if org setting is enabled
                              if (orgId && addingTutorId) {
                                const { data: orgRow } = await supabase.from('organizations').select('features').eq('id', orgId).single();
                                const feat = orgRow?.features as Record<string, unknown> | null;
                                if (feat?.notify_tutors_on_student_assign) {
                                  const contactPayload = pickStudentContactsForTutorEmail(selectedStudent, feat);
                                  const { data: tutorProfile } = await supabase.from('profiles').select('email, full_name').eq('id', addingTutorId).single();
                                  if (tutorProfile?.email) {
                                    void sendEmail({
                                      type: 'tutor_student_assigned',
                                      to: tutorProfile.email,
                                      data: { tutorName: tutorProfile.full_name, studentName: selectedStudent.full_name, ...contactPayload },
                                    });
                                  }
                                }
                              }
                            }
                            setTutorsSaving(false);
                          }}
                        >
                          {t('compStu.addBtn')}
                        </Button>
                      </div>
                      <p className="text-[11px] text-gray-500 mt-2">
                        {selectedStudentGroup.some((r) => !r.tutor_id)
                          ? t('compStu.addTutorHintFirstSlot')
                          : selectedStudent?.linked_user_id
                            ? t('compStu.addTutorHintExtraAccount')
                            : t('compStu.addTutorHintExtraPending')}
                      </p>
                    </div>
                  </div>
                )}

                {/* Admin comment */}
                {selectedStudent && (
                  <div className="mt-4 pt-4 border-t border-gray-100">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="font-semibold text-gray-900 flex items-center gap-2">
                        <MessageSquare className="w-4 h-4 text-blue-500" />
                        {t('compStu.adminComment')}
                      </h4>
                      {!editingComment && (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="text-xs rounded-lg"
                          onClick={() => {
                            setCommentDraft(selectedStudent.admin_comment || '');
                            setCommentVisibleToTutor(selectedStudent.admin_comment_visible_to_tutor ?? false);
                            setEditingComment(true);
                          }}
                        >
                          {selectedStudent.admin_comment ? t('compStu.editBtn') : t('compStu.addBtn')}
                        </Button>
                      )}
                    </div>
                    {editingComment ? (
                      <div className="space-y-2">
                        <textarea
                          value={commentDraft}
                          onChange={(e) => setCommentDraft(e.target.value)}
                          rows={3}
                          className="w-full rounded-xl border border-gray-200 p-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200 resize-none"
                          placeholder={t('compStu.commentPlaceholder')}
                        />
                        <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={commentVisibleToTutor}
                            onChange={(e) => setCommentVisibleToTutor(e.target.checked)}
                            className="rounded border-gray-300"
                          />
                          {t('compStu.commentVisibleToTutor')}
                        </label>
                        <div className="flex gap-2">
                          <Button type="button" variant="outline" className="flex-1 rounded-lg text-xs" disabled={savingComment} onClick={() => setEditingComment(false)}>
                            {t('compStu.cancelBtn')}
                          </Button>
                          <Button type="button" className="flex-1 rounded-lg text-xs" disabled={savingComment} onClick={() => void handleSaveComment()}>
                            {savingComment ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : t('compStu.saveBtn')}
                          </Button>
                        </div>
                      </div>
                    ) : selectedStudent.admin_comment ? (
                      <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 text-sm text-gray-800 whitespace-pre-wrap">
                        {selectedStudent.admin_comment}
                        <p className="text-[11px] text-gray-500 mt-1">
                          {selectedStudent.admin_comment_visible_to_tutor ? t('compStu.commentVisibleBoth') : t('compStu.commentVisibleAdmin')}
                        </p>
                      </div>
                    ) : (
                      <p className="text-sm text-gray-400 text-center py-2">{t('compStu.noComment')}</p>
                    )}
                  </div>
                )}

                {/* Student meeting link */}
                {selectedStudent && (
                  <div className="mt-4 pt-4 border-t border-gray-100">
                    <h4 className="font-semibold text-gray-900 text-sm mb-2">{t('compStu.personalMeetingLink')}</h4>
                    <div className="flex gap-2">
                      <input
                        type="url"
                        className="flex-1 rounded-xl border border-gray-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200"
                        placeholder="https://meet.google.com/..."
                        defaultValue={selectedStudent.personal_meeting_link || ''}
                        onBlur={async (e) => {
                          const val = e.target.value.trim() || null;
                          if (val === (selectedStudent.personal_meeting_link || null)) return;
                          await supabase.from('students').update({ personal_meeting_link: val }).eq('id', selectedStudent.id);
                          setSelectedStudent(s => s ? { ...s, personal_meeting_link: val } : null);
                        }}
                      />
                    </div>
                    <p className="text-[11px] text-gray-500 mt-1">{t('compStu.personalMeetingLinkDesc')}</p>
                  </div>
                )}

                {/* Individual pricing editor */}
                {selectedStudent && (
                  <div className="mt-4 pt-4 border-t border-gray-100">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="font-semibold text-gray-900 flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-amber-500" />
                        {t('compStu.individualPrices')}
                      </h4>
                      {!addingIndividualPrice && (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="text-xs rounded-lg"
                          onClick={() => {
                            setAddingIndividualPrice(true);
                            setNewPriceSubjectId('');
                            setNewPriceAmount('');
                            setNewPriceDurationMinutes('');
                            setNewPriceCancellationHours(24);
                            setNewPriceCancellationFeePercent(0);
                          }}
                        >
                          <Plus className="w-3 h-3 mr-1" />
                          {t('compStu.addBtn')}
                        </Button>
                      )}
                    </div>

                    {loadingStudentIndividualPricing ? (
                      <p className="text-sm text-gray-500 text-center py-2">{t('compStu.loadingText')}</p>
                    ) : (
                      <>
                        {studentIndividualPricing.length === 0 && !addingIndividualPrice ? (
                          <p className="text-sm text-gray-500 bg-gray-50 p-4 rounded-xl text-center">
                            {t('compStu.noIndividualPrices')}
                          </p>
                        ) : (
                          <>
                            {studentIndividualPricing.length > 0 && !addingIndividualPrice && (
                              <div className="space-y-2">
                                {studentIndividualPricing.map((pricing) => (
                                  <div
                                    key={pricing.id}
                                    className="bg-amber-50 border border-amber-100 rounded-xl p-3 flex items-center justify-between gap-3"
                                  >
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-2 mb-1">
                                        <div
                                          className="w-3 h-3 rounded-full flex-shrink-0"
                                          style={{ backgroundColor: pricing.subject?.color || '#6366f1' }}
                                        />
                                        <span className="font-semibold text-gray-900 text-sm truncate">
                                          {pricing.subject?.name || t('compStu.subjectFallback')}
                                        </span>
                                      </div>
                                      <div className="text-xs text-gray-600 space-y-0.5">
                                        <p>
                                          <Euro className="w-3 h-3 inline mr-1" />
                                          <strong>€{pricing.price}</strong> / {pricing.duration_minutes} min
                                        </p>
                                        <p>
                                          <Clock className="w-3 h-3 inline mr-1" />
                                          {t('compStu.cancellationInfo', { hours: String(pricing.cancellation_hours), percent: String(pricing.cancellation_fee_percent) })}
                                        </p>
                                      </div>
                                    </div>
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="sm"
                                      className="text-red-600 hover:text-red-700 hover:bg-red-50 shrink-0"
                                      disabled={savingStudentIndividualPricing}
                                      onClick={() => void handleDeleteIndividualPrice(pricing.id)}
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </Button>
                                  </div>
                                ))}
                              </div>
                            )}

                            {addingIndividualPrice && (
                              <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3 mt-2">
                                <div className="space-y-1.5">
                                  <Label className="text-xs font-semibold text-gray-700">{t('compStu.subjectRequired')}</Label>
                                  <Select
                                    value={newPriceSubjectId}
                                    onValueChange={(v) => {
                                      setNewPriceSubjectId(v);
                                      const subj = tutorPricingSubjects.find(s => s.id === v);
                                      if (subj) {
                                        setNewPriceAmount(typeof subj.price === 'number' ? subj.price : '');
                                        setNewPriceDurationMinutes(subj.duration_minutes ?? '');
                                      } else {
                                        setNewPriceAmount('');
                                        setNewPriceDurationMinutes('');
                                      }
                                    }}
                                  >
                                    <SelectTrigger className="rounded-xl">
                                      <SelectValue placeholder={t('compStu.selectSubjectPlaceholder')} />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {tutorPricingSubjects.map((s) => (
                                        <SelectItem key={s.id} value={s.id}>
                                          {s.name}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>

                                <div className="grid grid-cols-2 gap-3">
                                  <div className="space-y-1.5">
                                    <Label className="text-xs text-gray-600">{t('compStu.priceEurRequired')}</Label>
                                    <Input
                                      type="number"
                                      min={0}
                                      step={0.01}
                                      value={newPriceAmount}
                                      onChange={(e) => setNewPriceAmount(e.target.value ? parseFloat(e.target.value) : '')}
                                      className="rounded-xl"
                                    />
                                  </div>
                                  <div className="space-y-1.5">
                                    <Label className="text-xs text-gray-600">{t('compStu.durationMinRequired')}</Label>
                                    <Input
                                      type="number"
                                      min={1}
                                      value={newPriceDurationMinutes}
                                      onChange={(e) => setNewPriceDurationMinutes(e.target.value ? parseInt(e.target.value, 10) : '')}
                                      className="rounded-xl"
                                    />
                                  </div>
                                </div>

                                <div className="grid grid-cols-2 gap-3">
                                  <div className="space-y-1.5">
                                    <Label className="text-xs text-gray-600">{t('compStu.cancellationHRequired')}</Label>
                                    <Select
                                      value={String(newPriceCancellationHours)}
                                      onValueChange={(v) => setNewPriceCancellationHours(parseInt(v, 10))}
                                    >
                                      <SelectTrigger className="rounded-xl">
                                        <SelectValue />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {[2, 6, 12, 24, 48].map((h) => (
                                          <SelectItem key={h} value={String(h)}>
                                            {h} {t('compStu.hoursAbbrev')}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  </div>
                                  <div className="space-y-1.5">
                                    <Label className="text-xs text-gray-600">{t('compStu.feePercentRequired')}</Label>
                                    <Select
                                      value={String(newPriceCancellationFeePercent)}
                                      onValueChange={(v) => setNewPriceCancellationFeePercent(parseInt(v, 10))}
                                    >
                                      <SelectTrigger className="rounded-xl">
                                        <SelectValue />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {[0, 25, 50, 75, 100].map((p) => (
                                          <SelectItem key={p} value={String(p)}>
                                            {p}%
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  </div>
                                </div>

                                <div className="flex gap-2">
                                  <Button
                                    type="button"
                                    variant="outline"
                                    className="flex-1 rounded-lg"
                                    onClick={() => {
                                      setAddingIndividualPrice(false);
                                      setNewPriceSubjectId('');
                                      setNewPriceAmount('');
                                      setNewPriceDurationMinutes('');
                                      setNewPriceCancellationHours(24);
                                      setNewPriceCancellationFeePercent(0);
                                    }}
                                    disabled={savingStudentIndividualPricing}
                                  >
                                    {t('compStu.cancelBtn')}
                                  </Button>
                                  <Button
                                    type="button"
                                    className="flex-1 rounded-lg"
                                    disabled={
                                      savingStudentIndividualPricing ||
                                      !newPriceSubjectId ||
                                      newPriceAmount === '' ||
                                      typeof newPriceDurationMinutes !== 'number'
                                    }
                                    onClick={() => void handleAddIndividualPrice()}
                                  >
                                    {savingStudentIndividualPricing ? t('compStu.savingInProgress') : t('compStu.saveBtn')}
                                  </Button>
                                </div>
                              </div>
                            )}
                          </>
                        )}
                      </>
                    )}
                  </div>
                )}

                {showPaymentModelUi && (
                  <StudentPaymentModelSection
                    studentId={selectedStudent.id}
                    value={selectedStudent.payment_model ?? null}
                    perLessonTiming={(selectedStudent as any).per_lesson_payment_timing ?? null}
                    perLessonDeadlineHours={(selectedStudent as any).per_lesson_payment_deadline_hours ?? null}
                    inheritedLessonPayment={{ payment_timing: 'before_lesson', payment_deadline_hours: 24 }}
                    allowPerLesson
                    onSaved={(patch) => {
                      setSelectedStudent((s) => (s ? { ...s, ...patch } : null));
                      fetchData();
                    }}
                  />
                )}

                {paymentActions.canSendInvoice && (
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full gap-2 rounded-xl border-indigo-200 text-indigo-700 hover:bg-indigo-50"
                    onClick={() => setIsInvoiceModalOpen(true)}
                  >
                    <FileText className="w-4 h-4" />
                    {t('compStu.sendInvoice')}
                  </Button>
                )}

                {/* Trial lesson offer (only for brand new students with 0 sessions) */}
                {selectedStudent && (selectedStudentSessionCount ?? 0) === 0 && !selectedStudent.trial_offer_disabled && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <Button
                        type="button"
                        className="flex-1 gap-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white"
                        disabled={trialSending || trialDefaultsLoading}
                        onClick={() => {
                          setTrialForm(trialDefaults);
                          setTrialModalOpen(true);
                        }}
                      >
                        <Sparkles className="w-4 h-4" />
                        {t('compStu.offerTrial')}
                      </Button>
                      <button
                        type="button"
                        className="text-[11px] text-gray-500 hover:text-red-600 underline-offset-2 hover:underline"
                        onClick={async () => {
                          if (!selectedStudent) return;
                          setSelectedStudent((s) => (s ? { ...s, trial_offer_disabled: true } : null));
                          const { error } = await supabase
                            .from('students')
                            .update({ trial_offer_disabled: true })
                            .eq('id', selectedStudent.id);
                          if (error) {
                            setToastMessage({ message: t('compStu.trialHideFailed'), type: 'error' });
                            setSelectedStudent((s) => (s ? { ...s, trial_offer_disabled: false } : null));
                          } else {
                            setToastMessage({ message: t('compStu.trialHidden'), type: 'success' });
                            fetchData();
                          }
                        }}
                      >
                        {t('compStu.hideTrialOffer')}
                      </button>
                    </div>
                    <p className="text-[11px] text-gray-500">
                      {t('compStu.trialHint')}
                    </p>
                  </div>
                )}

                {/* Packages */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="font-semibold text-gray-900 flex items-center gap-2">
                      <Package className="w-4 h-4 text-violet-600" /> {t('compStu.lessonPackages')}
                    </h4>
                    {paymentActions.canSendPackage && (
                    <Button size="sm" variant="outline" className="gap-1.5 rounded-xl text-xs border-violet-200 text-violet-700 hover:bg-violet-50"
                      onClick={() => setSendPackageOpen((v) => {
                        if (!v) setPkgAttachSalesInvoice(true);
                        return !v;
                      })}>
                      <Package className="w-3.5 h-3.5" />
                      {sendPackageOpen ? t('compStu.cancelBtn') : t('compStu.sendPackage')}
                    </Button>
                    )}
                  </div>

                  {sendPackageOpen && (
                    <div className="mb-4 p-4 bg-violet-50 border border-violet-200 rounded-xl space-y-3">
                      <p className="text-xs font-semibold text-violet-800">{t('compStu.sendPackageTitle')}</p>
                      <div className="grid grid-cols-3 gap-2">
                        <div className="col-span-3 space-y-1">
                          <Label className="text-xs">{t('compStu.subjectLabel')}</Label>
                          <Select value={pkgSubjectId} onValueChange={(v) => {
                            setPkgSubjectId(v);
                            const s = packageSubjects.find(s => s.id === v);
                            if (s) setPkgPrice(s.price);
                          }}>
                            <SelectTrigger className="rounded-lg h-8 text-xs">
                              <SelectValue placeholder={t('compStu.selectPlaceholder')} />
                            </SelectTrigger>
                            <SelectContent>
                              {packageSubjects.map(s => (
                                <SelectItem key={s.id} value={s.id}>
                                  <div className="flex items-center gap-2 min-w-0">
                                    <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                                    <span className="truncate text-left">
                                      {t('compStu.packageSubjectOption', {
                                        name: s.name,
                                        tutor: selectedStudent.tutor?.full_name || '—',
                                        minutes: String(s.duration_minutes ?? 60),
                                        price: Number(s.price ?? 0).toFixed(2),
                                      })}
                                    </span>
                                  </div>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">{t('compStu.quantityLabel')}</Label>
                          <Input type="number" min={1} max={100} value={pkgLessons}
                            onChange={(e) => setPkgLessons(Math.max(1, parseInt(e.target.value) || 1))}
                            className="h-8 text-xs rounded-lg" />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">{t('compStu.pricePerLesson')}</Label>
                          <Input type="number" min={0} step={0.01} value={pkgPrice}
                            onChange={(e) => setPkgPrice(parseFloat(e.target.value) || 0)}
                            className="h-8 text-xs rounded-lg" />
                        </div>
                        <div className="space-y-1 col-span-3 sm:col-span-1">
                          <Label className="text-xs">{t('package.validUntil')}</Label>
                          <DateInput
                            value={pkgExpiresAt}
                            min={new Date().toISOString().split('T')[0]}
                            onChange={(e) => setPkgExpiresAt(e.target.value)}
                            className="h-8 text-xs rounded-lg"
                          />
                        </div>
                        <div className="flex items-end">
                          <Button size="sm" className="h-8 w-full text-xs rounded-lg bg-violet-600 hover:bg-violet-700"
                            onClick={handleSendPackage} disabled={pkgSending || !pkgSubjectId || orgFeaturesLoading}>
                            {pkgSending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : t('compStu.sendBtn')}
                          </Button>
                        </div>
                      </div>
                      {!orgUsesManualPackages && (
                      <label className="flex items-start gap-2 cursor-pointer text-xs text-violet-900">
                        <input
                          type="checkbox"
                          className="mt-0.5 w-3.5 h-3.5 rounded border-violet-300 text-violet-600"
                          checked={pkgAttachSalesInvoice}
                          onChange={(e) => setPkgAttachSalesInvoice(e.target.checked)}
                        />
                        <span>
                          <span className="font-medium">{t('invoices.includeSfInEmail')}</span>
                          <span className="block text-[11px] text-violet-600 font-normal mt-0.5">{t('invoices.includeSfInEmailHint')}</span>
                        </span>
                      </label>
                      )}
                      <p className="text-[11px] text-violet-500">{t('package.validUntilHint')}</p>
                      <p className="text-xs text-violet-600">
                        {orgUsesManualPackages ? t('compStu.manualPackageSendHint') : t('compStu.stripePaymentHint')}
                      </p>
                          {pkgSubjectId && pkgLessons > 0 && (
                        <p className="text-xs font-medium text-violet-800">
                          {(() => {
                            const s = packageSubjects.find((x) => x.id === pkgSubjectId);
                            return s
                              ? t('compStu.packageSubjectOption', {
                                  name: s.name,
                                  tutor: selectedStudent.tutor?.full_name || '—',
                                  minutes: String(s.duration_minutes ?? 60),
                                  price: Number(s.price ?? 0).toFixed(2),
                                })
                              : '—';
                          })()}
                          {' · '}
                          {pkgLessons}{' '}
                          {pkgLessons === 1
                            ? t('package.lessonUnit1')
                            : pkgLessons < 10
                              ? t('package.lessonUnit2to9')
                              : t('package.lessonUnit10plus')}{' '}
                          × {Number(pkgPrice).toFixed(2)} €
                          {!orgUsesManualPackages && (
                          <span className="text-violet-500 font-normal"> {t('package.includingFeesNote')}</span>
                          )}
                        </p>
                      )}
                    </div>
                  )}

                  {loadingPackages ? (
                    <div className="text-center py-3"><Loader2 className="w-5 h-5 animate-spin mx-auto text-gray-400" /></div>
                  ) : studentPackages.length === 0 ? (
                    <p className="text-sm text-gray-400 text-center py-3">{t('compStu.noPackages')}</p>
                  ) : (
                    <div className="space-y-2">
                      {studentPackages.map((pkg: any) => (
                        <div key={pkg.id} className="flex items-center justify-between gap-2 p-3 bg-gray-50 rounded-xl text-sm flex-wrap">
                          <div className="flex items-center gap-2 flex-wrap">
                            {pkg.subject?.color && <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: pkg.subject.color }} />}
                            <span className="font-medium text-gray-800">{pkg.subject?.name || '—'}</span>
                            <span className="text-gray-500">{t('compStu.lessonsCount', { count: String(pkg.total_lessons) })}</span>
                          </div>
                          <div className="flex items-center gap-2 flex-wrap justify-end">
                            <span className="text-xs text-gray-500">{t('compStu.remaining', { count: String(pkg.available_lessons) })}</span>
                            {pkg.expires_at && (
                              <span className={`text-xs px-2 py-0.5 rounded-full ${new Date(pkg.expires_at) < new Date() ? 'bg-red-50 text-red-700' : 'bg-gray-100 text-gray-600'}`}>
                                {new Date(pkg.expires_at) < new Date()
                                  ? t('package.expired')
                                  : t('package.expiresAt', { date: new Date(pkg.expires_at).toLocaleDateString() })}
                              </span>
                            )}
                            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${pkg.payment_status === 'paid' ? 'bg-green-50 text-green-700' : pkg.payment_status === 'expired' ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'}`}>
                              {pkg.payment_status === 'paid' ? t('compStu.paid') : pkg.payment_status === 'expired' ? t('package.expired') : t('compStu.pendingStatus')}
                            </span>
                            {Number(pkg.available_lessons || 0) === 0 && pkg.active !== false && (
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                className="h-7 px-2 text-xs rounded-lg text-gray-500 hover:text-red-600 hover:bg-red-50"
                                disabled={deactivatingPackageId === pkg.id}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  void handleDeactivatePackage(pkg.id);
                                }}
                                title={t('compStu.hidePackage')}
                              >
                                {deactivatingPackageId === pkg.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <XCircle className="w-3.5 h-3.5" />}
                              </Button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Sessions */}
                <div className="border-t border-gray-100 pt-4">
                  <h4 className="font-semibold mb-3 text-gray-900">{t('compStu.studentSessions')}</h4>
                  {loadingModalSessions ? (
                    <div className="flex items-center justify-center gap-2 py-8 text-muted-foreground text-sm">
                      <Loader2 className="h-5 w-5 animate-spin" />
                      <span>{t('compStu.loadingSessions')}</span>
                    </div>
                  ) : (
                    <SessionList
                      sessions={modalRecentSessions}
                      groupBy="none"
                      showStudent={false}
                      showTutor={true}
                    />
                  )}
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        <SendInvoiceModal
          isOpen={isInvoiceModalOpen}
          onClose={() => setIsInvoiceModalOpen(false)}
          studentId={selectedStudent?.id}
          studentName={selectedStudent?.full_name}
          billingTutorId={selectedStudent?.tutor_id}
          onSuccess={() => {
            setIsInvoiceModalOpen(false);
            fetchData();
          }}
        />

        <Dialog open={trialModalOpen} onOpenChange={setTrialModalOpen}>
          <DialogContent className="w-[95vw] sm:max-w-[520px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{t('compStu.trialLessonTitle')}</DialogTitle>
              <DialogDescription>
                {t('compStu.trialDefaultsDesc')}
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-2">
              <div className="space-y-1.5">
                <Label className="text-xs">{t('compStu.topicLabel')}</Label>
                <Input
                  value={trialForm.topic}
                  onChange={(e) => setTrialForm((p) => ({ ...p, topic: e.target.value }))}
                  className="rounded-xl"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">{t('compStu.trialDurationMin')}</Label>
                  <Input
                    type="number"
                    min={15}
                    step={5}
                    value={trialForm.durationMinutes}
                    onChange={(e) => setTrialForm((p) => ({ ...p, durationMinutes: Number(e.target.value) }))}
                    className="rounded-xl"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">{t('compStu.trialPriceEur')}</Label>
                  <Input
                    type="number"
                    min={0}
                    step={1}
                    value={trialForm.priceEur}
                    onChange={(e) => setTrialForm((p) => ({ ...p, priceEur: Number(e.target.value) }))}
                    className="rounded-xl"
                  />
                </div>
              </div>
              <div className="text-xs text-gray-500">
                {t('compStu.tutorInline')} <span className="font-semibold text-gray-800">{selectedStudent?.tutor?.full_name || '—'}</span>
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                type="button"
                className="rounded-xl"
                onClick={() => setTrialModalOpen(false)}
                disabled={trialSending}
              >
                {t('compStu.cancelBtn')}
              </Button>
              <Button
                type="button"
                className="rounded-xl gap-2 bg-amber-500 hover:bg-amber-600 text-white"
                disabled={trialSending || !selectedStudent}
                onClick={async () => {
                  if (!selectedStudent) return;
                  setTrialSending(true);
                  try {
                    const { data: { session } } = await supabase.auth.getSession();
                    const resp = await fetch('/api/create-trial-package', {
                      method: 'POST',
                      headers: {
                        'Content-Type': 'application/json',
                        ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
                      },
                      body: JSON.stringify({
                        studentId: selectedStudent.id,
                        tutorId: trialTutorId || selectedStudent.tutor_id,
                        topic: trialForm.topic,
                        durationMinutes: trialForm.durationMinutes,
                        priceEur: trialForm.priceEur,
                      }),
                    });
                    const json = await resp.json().catch(() => ({}));
                    if (!resp.ok) throw new Error((json as any).error || t('compStu.trialSendFailed'));
                    setToastMessage({ message: t('compStu.trialSent'), type: 'success' });
                    setTrialModalOpen(false);
                  } catch (e: any) {
                    setToastMessage({ message: e?.message || t('compStu.trialSendError'), type: 'error' });
                  }
                  setTrialSending(false);
                }}
              >
                {trialSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                {t('compStu.confirmAndSend')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </>
  );
}
