import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { extractStoragePath, openContractFileInNewTab } from '@/lib/contractStorage';
import { getCached, setCache, invalidateCache } from '@/lib/dataCache';
import { authHeaders } from '@/lib/apiHelpers';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DateInput } from '@/components/ui/date-input';
import { TimeInput } from '@/components/ui/time-input';
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
import { Plus, Trash2, User, Mail, Phone, GraduationCap, CheckCircle, XCircle, Sparkles, Package, Loader2, FileText, Search, Euro, Clock, MessageSquare, Archive, ArchiveRestore, Download, AlertCircle, Ban } from 'lucide-react';
import { sendEmail } from '@/lib/email';
import Toast from '@/components/Toast';
import { useTranslation } from '@/lib/i18n';
import {
  buildSchoolStudentExportRows,
  matchesMediaConsentFilter,
  type MediaConsentFilter,
} from '@/lib/schoolStudentsExport';
import { downloadSchoolStudentsXlsx } from '@/lib/schoolStudentsXlsxExport';
import { formatLocalizedPhone, getLocalizedPhonePlaceholder, validateLocalizedPhone, cn } from '@/lib/utils';
import { ORG_TUTOR_FILTER_SCROLL_CLASS, ORG_TUTOR_SELECT_SCROLL_CLASS } from '@/lib/orgUi';
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
import FindTutorModal from '@/components/FindTutorModal';
import FindLessonBookDialog, { type FindLessonBookPick } from '@/components/FindLessonBookDialog';
import StudentAvailabilityEditor from '@/components/company/StudentAvailabilityEditor';
import StudentScheduleSummary from '@/components/company/StudentScheduleSummary';
import {
  pickGroupPreferredAvailability,
  toFindTutorWindows,
  type StudentPreferredWindow,
} from '@/lib/studentAvailability';
import { orgCanonicalOrigin } from '@/lib/orgPublicOrigin';
import type { BusyInterval } from '@/lib/tutorMatching';
import PackageItemsEditor, { type PackageEditorItem, type PackageEditorSubject } from '@/components/PackageItemsEditor';
import { pickStudentContactsForTutorEmail } from '@/lib/orgContactVisibility';
import { getOrgVisibleTutors } from '@/lib/orgVisibleTutors';
import { findOrgTutorEmailConflict } from '@/lib/orgStudentTutorGuards';
import { useOrgEntityType } from '@/contexts/OrgEntityContext';
import { hasProKlaseIntakeFeatures } from '@/lib/orgIntakeMode';
import { useMarketMoney } from '@/hooks/useMarketMoney';
import {
  parseStudentGrade,
  resolveOrganizationLessonPrice,
  type OrganizationDynamicPricingRule,
} from '@/lib/organizationDynamicPricing';
import { formatLocalYmd, monthlyPackagePeriodFrom } from '@/lib/monthlyPackagePlan';

interface Student {
  id: string;
  tutor_id: string | null;
  full_name: string;
  email: string;
  phone: string;
  grade?: string | null;
  pricing_lessons_per_week?: number | null;
  pricing_lessons_per_week_is_manual?: boolean | null;
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
  preferred_availability?: unknown;
  tutor?: {
    full_name: string;
  };
}

interface Tutor {
  id: string;
  full_name: string;
  subject_names?: string[];
}

function formatTutorSubjectsLine(names: string[] | undefined, noSubjectsLabel: string): string {
  if (!names?.length) return noSubjectsLabel;
  if (names.length <= 4) return names.join(', ');
  return `${names.slice(0, 4).join(', ')} +${names.length - 4}`;
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

function adminShowPhone(v: string | null | undefined, locale: string) {
  const s = (v || '').trim();
  if (!s) return '—';
  return formatLocalizedPhone(s, locale);
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

type StudentContractInfo = {
  signing_status: 'draft' | 'sent' | 'signed';
  pdf_url?: string | null;
  signed_contract_url?: string | null;
};

function studentContractBadge(info: StudentContractInfo | undefined) {
  if (info?.signing_status === 'signed') {
    return { labelKey: 'compStu.contractSigned', className: 'text-green-700 bg-green-50 border border-green-200' };
  }
  if (info?.signing_status === 'sent') {
    return { labelKey: 'compStu.contractSent', className: 'text-blue-700 bg-blue-50 border border-blue-200' };
  }
  if (info) {
    return { labelKey: 'compStu.contractNotSigned', className: 'text-amber-700 bg-amber-50 border border-amber-200' };
  }
  return { labelKey: 'compStu.contractNone', className: 'text-gray-600 bg-gray-50 border border-gray-200' };
}

function studentContractDownloadUrl(info: StudentContractInfo | undefined): string {
  return String(info?.signed_contract_url || info?.pdf_url || '').trim();
}

function SchoolStudentContractStatus({
  student,
  contractInfo,
  onDownload,
  t,
}: {
  student: { id: string; media_publicity_consent?: string | null };
  contractInfo: StudentContractInfo | undefined;
  onDownload: (path: string) => void;
  t: (key: string) => string;
}) {
  const media = mediaConsentBadge(student.media_publicity_consent);
  const contract = studentContractBadge(contractInfo);
  const filePath = studentContractDownloadUrl(contractInfo);
  const isSigned = contractInfo?.signing_status === 'signed';

  return (
    <div className="mt-2 flex flex-col items-start gap-1.5">
      <div className="flex flex-wrap gap-1.5">
        <span className={`text-[11px] border rounded-md px-2 py-0.5 ${media.className}`}>{t(media.labelKey)}</span>
        <span className={`text-[11px] border rounded-md px-2 py-0.5 ${contract.className}`}>{t(contract.labelKey)}</span>
      </div>
      {filePath ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDownload(filePath);
          }}
          className="text-[11px] text-indigo-700 hover:text-indigo-900 inline-flex items-center gap-1 rounded-md border border-indigo-200 bg-indigo-50 px-2 py-1 font-medium"
        >
          <Download className="w-3 h-3" /> {t('compStu.contractDownload')}
        </button>
      ) : isSigned ? (
        <span className="text-[11px] text-gray-500">{t('compStu.contractFileMissing')}</span>
      ) : null}
    </div>
  );
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
  const { t, locale } = useTranslation();
  const { fmt } = useMarketMoney();
  const { loading: orgFeaturesLoading, hasFeature } = useOrgFeatures();
  const proKlaseIntake =
    !isSchoolView && !orgFeaturesLoading && hasProKlaseIntakeFeatures(hasFeature);
  const orgUsesManualPackages = !orgFeaturesLoading && hasFeature('manual_payments');
  /** Full contact editing: schools always; other orgs behind full_student_edit (email only until registered). */
  const canFullEditStudent = isSchoolView || (!orgFeaturesLoading && hasFeature('full_student_edit'));
  const stc = getCached<any>('company_students');
  const [students, setStudents] = useState<Student[]>(stc?.students ?? []);
  const [tutors, setTutors] = useState<Tutor[]>(stc?.tutors ?? []);
  const [contractsByStudent, setContractsByStudent] = useState<Record<string, StudentContractInfo>>(stc?.contractsByStudent ?? {});
  // Req 8 (trial_followup_alert): student IDs with a completed trial but no real package sent yet.
  const [trialNoPackageStudentIds, setTrialNoPackageStudentIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(!stc);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [addStudentFindTutorOpen, setAddStudentFindTutorOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [baseUrl, setBaseUrl] = useState('');
  /** Org preferred_locale — invite links use the org's canonical domain (.lt for Pro Klasė). */
  const [orgPreferredLocale, setOrgPreferredLocale] = useState<string | null>(null);
  const [newStudent, setNewStudent] = useState({
    full_name: '',
    email: '',
    phone: '',
    grade: '',
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
    // Flexible invitations (req 7): who to invite on create when enabled.
    invite_target: 'student' as 'student' | 'both',
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
  const [modalSessionsRefreshKey, setModalSessionsRefreshKey] = useState(0);
  const [savingAvailability, setSavingAvailability] = useState(false);

  // Book a lesson from the student card (req 4, gated by student_card_booking)
  const [findLessonOpen, setFindLessonOpen] = useState(false);
  const [findLessonPick, setFindLessonPick] = useState<FindLessonBookPick | null>(null);
  const [findLessonBookedIntervals, setFindLessonBookedIntervals] = useState<BusyInterval[]>([]);

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
  const [isEditingStudentName, setIsEditingStudentName] = useState(false);
  const [studentNameDraft, setStudentNameDraft] = useState('');
  const [savingStudentName, setSavingStudentName] = useState(false);

  // Trash bin state
  const [showTrashBin, setShowTrashBin] = useState(false);

  // Admin comment state
  const [editingComment, setEditingComment] = useState(false);
  const [commentDraft, setCommentDraft] = useState('');
  const [commentVisibleToTutor, setCommentVisibleToTutor] = useState(false);
  const [savingComment, setSavingComment] = useState(false);

  // Package state (student modal)
  const [studentPackages, setStudentPackages] = useState<any[]>([]);
  /** Active auto (post-trial) monthly package plans for the selected identity group. */
  const [studentAutoPlans, setStudentAutoPlans] = useState<any[]>([]);
  const [annullingPackageId, setAnnullingPackageId] = useState<string | null>(null);
  const [resendingPackageId, setResendingPackageId] = useState<string | null>(null);
  const [stoppingPlanId, setStoppingPlanId] = useState<string | null>(null);
  const [packageSubjects, setPackageSubjects] = useState<any[]>([]);
  const [loadingPackages, setLoadingPackages] = useState(false);
  const [sendPackageOpen, setSendPackageOpen] = useState(false);
  const [pkgItems, setPkgItems] = useState<PackageEditorItem[]>([]);
  const [pkgIndividualPricing, setPkgIndividualPricing] = useState<Record<string, number>>({});
  const [pkgExpiresAt, setPkgExpiresAt] = useState('');
  const [pkgSending, setPkgSending] = useState(false);
  const [pkgAttachSalesInvoice, setPkgAttachSalesInvoice] = useState(true);
  const [pkgGrade, setPkgGrade] = useState(1);
  const [pkgLessonsPerWeek, setPkgLessonsPerWeek] = useState(1);
  const [pkgDynamicPricingRules, setPkgDynamicPricingRules] = useState<OrganizationDynamicPricingRule[]>([]);
  // Optional pre-booked package times (req 3, gated by package_reservation_flow)
  const [pkgReserveSlots, setPkgReserveSlots] = useState<Array<{ subjectId: string; startIso: string; endIso: string }>>([]);
  const [pkgSlotSubjectId, setPkgSlotSubjectId] = useState('');
  const [pkgSlotDate, setPkgSlotDate] = useState('');
  const [pkgSlotTime, setPkgSlotTime] = useState('16:00');
  const [deactivatingPackageId, setDeactivatingPackageId] = useState<string | null>(null);
  const [isInvoiceModalOpen, setIsInvoiceModalOpen] = useState(false);
  const [studentSearch, setStudentSearch] = useState('');
  // School list filters: by grade and by latest-contract signing state.
  const [gradeFilter, setGradeFilter] = useState('all');
  const [contractFilter, setContractFilter] = useState<'all' | 'signed' | 'pending' | 'none'>('all');
  const [mediaConsentFilter, setMediaConsentFilter] = useState<MediaConsentFilter>('all');
  const [exportingStudents, setExportingStudents] = useState(false);

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

  const monthlyPackageMode = proKlaseIntake && hasFeature('monthly_packages');
  const monthlyPackagePeriod = useMemo(
    () => monthlyPackagePeriodFrom(formatLocalYmd(new Date()), pkgLessonsPerWeek),
    [pkgLessonsPerWeek],
  );

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

  const availableGrades = useMemo(() => {
    const set = new Set<string>();
    for (const s of students) {
      const grade = String(s.grade || '').trim();
      if (grade) set.add(grade);
    }
    return [...set].sort((a, b) => {
      const [na, nb] = [Number(a), Number(b)];
      if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
      return a.localeCompare(b, 'lt');
    });
  }, [students]);

  const filteredGroups = useMemo(() => {
    let groups = groupedStudents.filter((g) =>
      showTrashBin ? g.primary.detached_at : !g.primary.detached_at
    );
    if (normalizedSearch) {
      groups = groups.filter((g) => g.primary.full_name.toLowerCase().includes(normalizedSearch));
    }
    if (gradeFilter !== 'all') {
      groups = groups.filter((g) => g.rows.some((r) => String(r.grade || '').trim() === gradeFilter));
    }
    if (contractFilter !== 'all') {
      groups = groups.filter((g) => {
        const info = contractsByStudent[g.primary.id];
        if (contractFilter === 'signed') return info?.signing_status === 'signed';
        if (contractFilter === 'pending') return Boolean(info) && info!.signing_status !== 'signed';
        return !info; // 'none'
      });
    }
    if (mediaConsentFilter !== 'all') {
      groups = groups.filter((g) =>
        matchesMediaConsentFilter(g.primary.media_publicity_consent, mediaConsentFilter),
      );
    }
    return groups;
  }, [groupedStudents, normalizedSearch, showTrashBin, gradeFilter, contractFilter, mediaConsentFilter, contractsByStudent]);

  const exportStudentsXlsx = async () => {
    setExportingStudents(true);
    try {
      const rows = buildSchoolStudentExportRows(
        filteredGroups.map((g) => ({
          student: g.primary,
          contract: contractsByStudent[g.primary.id],
        })),
        t,
      );
      const date = new Date().toISOString().slice(0, 10);
      await downloadSchoolStudentsXlsx(rows, t, `mokiniai-${date}.xlsx`);
    } catch (e: any) {
      setToastMessage({ message: e?.message || t('school.studentExportFail'), type: 'error' });
    } finally {
      setExportingStudents(false);
    }
  };

  const shouldShowParentContacts = (student: Student) => hasSchoolParentContacts(student);

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
        .select('features, preferred_locale')
        .eq('id', orgId)
        .maybeSingle();
      if (cancelled) return;
      setOrgPreferredLocale(((data as any)?.preferred_locale as string | null) ?? null);
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
      const [pkgRes, subjRes, pricingRes, dynamicPricingRes] = await Promise.all([
        supabase
          .from('lesson_packages')
          .select('*, subject:subjects(name, color), lesson_package_items(subject_id, total_lessons, available_lessons, total_price, position, subjects!inner(name, color))')
          .eq('student_id', selectedStudent.id)
          // Show both "active" and "pending" packages (org admin wants to see what is sent vs paid)
          .or('active.eq.true,payment_status.eq.pending')
          .order('created_at', { ascending: false }),
        supabase
          .from('subjects')
          .select('id, name, color, price, duration_minutes')
          .eq('tutor_id', selectedStudent.tutor_id)
          .order('name'),
        supabase
          .from('student_individual_pricing')
          .select('subject_id, price')
          .eq('student_id', selectedStudent.id)
          .eq('tutor_id', selectedStudent.tutor_id),
        orgId
          ? supabase
            .from('organization_dynamic_pricing')
            .select('id, organization_id, grade_min, grade_max, lessons_per_week, price')
            .eq('organization_id', orgId)
          : Promise.resolve({ data: [] as OrganizationDynamicPricingRule[] }),
      ]);
      if (!cancelled) {
        setStudentPackages(pkgRes.data || []);
        setPackageSubjects(subjRes.data || []);
        const pricingMap: Record<string, number> = {};
        (pricingRes.data || []).forEach((p: any) => { pricingMap[p.subject_id] = Number(p.price); });
        setPkgIndividualPricing(pricingMap);
        const dynamicRules = (dynamicPricingRes.data || []).map((rule: any) => ({
          ...rule,
          grade_min: Number(rule.grade_min),
          grade_max: Number(rule.grade_max),
          lessons_per_week: Number(rule.lessons_per_week),
          price: Number(rule.price),
        }));
        setPkgDynamicPricingRules(dynamicRules);
        const initialGrade = parseStudentGrade(selectedStudent.grade) ?? 1;
        const initialFrequency = Math.max(1, Number(selectedStudent.pricing_lessons_per_week) || 1);
        setPkgGrade(initialGrade);
        setPkgLessonsPerWeek(initialFrequency);
        const first = subjRes.data?.[0];
        if (first) {
          const initialPrice = resolveOrganizationLessonPrice({
            rules: dynamicRules,
            student: { grade: String(initialGrade), pricing_lessons_per_week: initialFrequency },
            lessonsPerWeek: initialFrequency,
            individualPrice: pricingMap[first.id],
            fallbackPrice: Number(first.price ?? 0),
          });
          const period = monthlyPackagePeriodFrom(formatLocalYmd(new Date()), initialFrequency);
          setPkgItems([{
            subjectId: first.id,
            totalLessons: monthlyPackageMode ? period.totalLessons : 5,
            pricePerLesson: initialPrice,
          }]);
        } else {
          setPkgItems([]);
        }
        setLoadingPackages(false);
      }
    })();
    return () => { cancelled = true; };
  }, [selectedStudent, isStudentModalOpen, orgId, monthlyPackageMode]);

  // Auto (post-trial) monthly package plans across the identity group.
  useEffect(() => {
    if (!selectedStudent || !isStudentModalOpen) {
      setStudentAutoPlans([]);
      return;
    }
    const groupIds = selectedStudentGroup.length > 0
      ? selectedStudentGroup.map((row) => row.id)
      : [selectedStudent.id];
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('recurring_monthly_package_plans')
        .select('id, tutor_id, student_id, next_generation_date, payment_method, auto_from_schedule, active, tutor:profiles!recurring_monthly_package_plans_tutor_id_fkey(full_name)')
        .in('student_id', groupIds)
        .eq('active', true)
        .eq('auto_from_schedule', true);
      if (!cancelled) {
        setStudentAutoPlans(
          ((data || []) as any[]).map((plan) => ({
            ...plan,
            tutor: Array.isArray(plan.tutor) ? plan.tutor[0] ?? null : plan.tutor ?? null,
          })),
        );
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedStudent?.id, isStudentModalOpen, selectedStudentGroup.length, modalSessionsRefreshKey]);

  useEffect(() => {
    if (!monthlyPackageMode || !sendPackageOpen || pkgItems.length === 0) return;
    const current = pkgItems[0];
    const subject = packageSubjects.find((row: any) => row.id === current.subjectId);
    if (!subject) return;
    const price = resolveOrganizationLessonPrice({
      rules: pkgDynamicPricingRules,
      student: { grade: String(pkgGrade), pricing_lessons_per_week: pkgLessonsPerWeek },
      lessonsPerWeek: pkgLessonsPerWeek,
      individualPrice: pkgIndividualPricing[current.subjectId],
      fallbackPrice: Number(subject.price ?? 0),
    });
    setPkgItems((items) => {
      const item = items[0];
      if (!item) return items;
      if (item.totalLessons === monthlyPackagePeriod.totalLessons && item.pricePerLesson === price && items.length === 1) {
        return items;
      }
      return [{ ...item, totalLessons: monthlyPackagePeriod.totalLessons, pricePerLesson: price }];
    });
  }, [
    monthlyPackageMode,
    sendPackageOpen,
    pkgGrade,
    pkgLessonsPerWeek,
    pkgDynamicPricingRules,
    pkgIndividualPricing,
    packageSubjects,
    monthlyPackagePeriod.totalLessons,
    pkgItems[0]?.subjectId,
  ]);

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
    setIsEditingStudentName(false);
    setStudentNameDraft(selectedStudent.full_name || '');
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
  }, [selectedStudent?.id, isStudentModalOpen, modalSessionsRefreshKey]);

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

    const tutorIds = tutorsList.map((t) => t.id);
    let tutorsWithSubjects: Tutor[] = tutorsList;
    if (tutorIds.length > 0) {
      const { data: subjectRows } = await supabase
        .from('subjects')
        .select('tutor_id, name')
        .in('tutor_id', tutorIds)
        .order('name');
      const subjectsByTutor = new Map<string, string[]>();
      for (const row of subjectRows || []) {
        const tid = row.tutor_id as string;
        const name = String(row.name || '').trim();
        if (!tid || !name) continue;
        const list = subjectsByTutor.get(tid) || [];
        if (!list.includes(name)) list.push(name);
        subjectsByTutor.set(tid, list);
      }
      tutorsWithSubjects = tutorsList.map((tu) => ({
        ...tu,
        subject_names: subjectsByTutor.get(tu.id) || [],
      }));
    }

    setTutors(tutorsWithSubjects);
    let fetchedStudents: Student[] = [];
    let studentsErr: { message: string } | null = null;

    // Match preload + RLS: org students via tutor_id in org, not only students.organization_id
    // (legacy rows may have tutor_id set but organization_id NULL).
    if (tutorIds.length > 0) {
      const [byTutorRes, unassignedRes] = await Promise.all([
        supabase
          .from('students')
          .select('*, linked_user_id, tutor:profiles!students_tutor_id_fkey(full_name)')
          .in('tutor_id', tutorIds)
          .order('created_at', { ascending: false }),
        supabase
          .from('students')
          .select('*, linked_user_id, tutor:profiles!students_tutor_id_fkey(full_name)')
          .is('tutor_id', null)
          .eq('organization_id', adminRow.organization_id)
          .order('created_at', { ascending: false }),
      ]);
      studentsErr = byTutorRes.error || unassignedRes.error;
      const merged = [...(byTutorRes.data || []), ...(unassignedRes.data || [])] as Student[];
      const seen = new Set<string>();
      fetchedStudents = merged.filter((s) => {
        if (seen.has(s.id)) return false;
        seen.add(s.id);
        return true;
      });
      fetchedStudents.sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      );
    } else {
      const { data, error } = await supabase
        .from('students')
        .select('*, linked_user_id, tutor:profiles!students_tutor_id_fkey(full_name)')
        .is('tutor_id', null)
        .eq('organization_id', adminRow.organization_id)
        .order('created_at', { ascending: false });
      studentsErr = error;
      fetchedStudents = (data || []) as Student[];
    }

    if (studentsErr) {
      console.error('Error fetching students:', studentsErr);
      setStudents([]);
    } else {
      setStudents(fetchedStudents);
    }

    // School-only: latest contract per student for the status badge + download link (#5).
    let contractMap: Record<string, StudentContractInfo> = {};
    if (isSchoolView) {
      const { data: contractRows } = await supabase
        .from('school_contracts')
        .select('student_id, signing_status, pdf_url, signed_contract_url, created_at')
        .eq('organization_id', adminRow.organization_id)
        .is('archived_at', null)
        .order('created_at', { ascending: false });
      for (const row of contractRows || []) {
        const sid = String((row as any).student_id || '');
        if (!sid || contractMap[sid]) continue; // first row per student = latest (desc order)
        contractMap[sid] = {
          signing_status: (row as any).signing_status,
          pdf_url: (row as any).pdf_url,
          signed_contract_url: (row as any).signed_contract_url,
        };
      }
    }
    setContractsByStudent(contractMap);

    // Req 8 (trial_followup_alert, flag-gated): flag students whose trial lesson is
    // completed but no real (non-trial) package has been sent yet. Queried inline off
    // the org's features to avoid useOrgFeatures() load-timing races inside this effect.
    const trialNoPackageIds = new Set<string>();
    {
      const { data: orgRow } = await supabase
        .from('organizations')
        .select('features')
        .eq('id', adminRow.organization_id)
        .maybeSingle();
      const feats = orgRow?.features && typeof orgRow.features === 'object' && !Array.isArray(orgRow.features)
        ? (orgRow.features as Record<string, unknown>)
        : {};
      if (feats.trial_followup_alert === true && fetchedStudents.length > 0) {
        const studentIds = fetchedStudents.map((s) => s.id);
        const thirtyAgo = new Date();
        thirtyAgo.setDate(thirtyAgo.getDate() - 30);
        const [trialRes, pkgRes] = await Promise.all([
          supabase
            .from('sessions')
            .select('student_id, subjects!inner(is_trial)')
            .in('student_id', studentIds)
            .eq('status', 'completed')
            .eq('subjects.is_trial', true)
            .gte('start_time', thirtyAgo.toISOString()),
          supabase
            .from('lesson_packages')
            .select('student_id, subjects(is_trial)')
            .in('student_id', studentIds),
        ]);
        const withRealPackage = new Set<string>();
        for (const p of pkgRes.data || []) {
          const subj = Array.isArray((p as any).subjects) ? (p as any).subjects[0] : (p as any).subjects;
          if (subj?.is_trial !== true) withRealPackage.add((p as any).student_id);
        }
        for (const row of trialRes.data || []) {
          const sid = (row as any).student_id;
          if (sid && !withRealPackage.has(sid)) trialNoPackageIds.add(sid);
        }
      }
    }
    setTrialNoPackageStudentIds(trialNoPackageIds);

    setCache('company_students', { students: fetchedStudents, tutors: tutorsWithSubjects, contractsByStudent: contractMap });
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
    if (!selectedStudent || pkgItems.length === 0) return;
    // Local validation (same rules as SendPackageModal)
    const seen = new Set<string>();
    let totalLessonsSum = 0;
    for (const it of pkgItems) {
      if (!it.subjectId || it.totalLessons <= 0) {
        setToastMessage({ message: t('package.fillAllFields'), type: 'error' });
        return;
      }
      if (seen.has(it.subjectId)) {
        setToastMessage({ message: t('package.duplicateSubject'), type: 'error' });
        return;
      }
      seen.add(it.subjectId);
      totalLessonsSum += it.totalLessons;
    }
    if (totalLessonsSum > 100) {
      setToastMessage({ message: t('package.maxLessonsExceeded'), type: 'error' });
      return;
    }
    setPkgSending(true);
    try {
      const endpoint = orgUsesManualPackages ? '/api/create-manual-package' : '/api/create-package-checkout';
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: await authHeaders(),
        body: JSON.stringify({
          tutorId: selectedStudent.tutor_id,
          studentId: selectedStudent.id,
          items: pkgItems.map((it) => ({
            subjectId: it.subjectId,
            totalLessons: it.totalLessons,
            pricePerLesson: it.pricePerLesson,
          })),
          ...(monthlyPackageMode
            ? {
              expiresAt: monthlyPackagePeriod.periodEnd,
              monthlyPlan: {
                grade: pkgGrade,
                lessonsPerWeek: pkgLessonsPerWeek,
                periodStart: monthlyPackagePeriod.periodStart,
                periodEnd: monthlyPackagePeriod.periodEnd,
              },
            }
            : pkgExpiresAt ? { expiresAt: pkgExpiresAt } : {}),
          ...(!orgUsesManualPackages ? { attachSalesInvoice: pkgAttachSalesInvoice } : {}),
          ...(hasFeature('package_reservation_flow') && pkgReserveSlots.length > 0
            ? { slots: pkgReserveSlots }
            : {}),
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
      setPkgReserveSlots([]);
      setPkgSlotSubjectId('');
      setPkgSlotDate('');
      setPkgSlotTime('16:00');
      const { data } = await supabase
        .from('lesson_packages')
        .select('*, subject:subjects(name, color), lesson_package_items(subject_id, total_lessons, available_lessons, total_price, position, subjects!inner(name, color))')
        .eq('student_id', selectedStudent.id)
        .or('active.eq.true,payment_status.eq.pending')
        .order('created_at', { ascending: false });
      setStudentPackages(data || []);
    } catch (err: any) {
      setToastMessage({ message: err.message, type: 'error' });
    }
    setPkgSending(false);
  };

  const formatPkgSlot = (iso: string): string => {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  const addPkgReserveSlot = () => {
    if (!pkgSlotSubjectId || !pkgSlotDate || !pkgSlotTime) return;
    const subj = packageSubjects.find((ps: any) => ps.id === pkgSlotSubjectId);
    const durationMin = Number(subj?.duration_minutes) || 60;
    const start = new Date(`${pkgSlotDate}T${pkgSlotTime}:00`);
    if (Number.isNaN(start.getTime())) return;
    const end = new Date(start.getTime() + durationMin * 60000);
    setPkgReserveSlots((prev) => [
      ...prev,
      { subjectId: pkgSlotSubjectId, startIso: start.toISOString(), endIso: end.toISOString() },
    ]);
  };

  const reloadStudentPackages = async () => {
    if (!selectedStudent) return;
    const { data } = await supabase
      .from('lesson_packages')
      .select('*, subject:subjects(name, color), lesson_package_items(subject_id, total_lessons, available_lessons, total_price, position, subjects!inner(name, color))')
      .eq('student_id', selectedStudent.id)
      .or('active.eq.true,payment_status.eq.pending')
      .order('created_at', { ascending: false });
    setStudentPackages(data || []);
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
      await reloadStudentPackages();
      setToastMessage({ message: t('compStu.packageHidden'), type: 'success' });
    } catch (e: any) {
      setToastMessage({ message: e?.message || t('compStu.hidePackageFailed'), type: 'error' });
    }
    setDeactivatingPackageId(null);
  };

  /** Annul a pending package: old pay links stop working; unpaid linked lessons are released back to "pending". */
  const handleAnnulPackage = async (pkg: any) => {
    if (!selectedStudent) return;
    if (!window.confirm(t('compStu.pkgAnnulConfirm'))) return;
    setAnnullingPackageId(pkg.id);
    try {
      const { data: linkedSessions } = await supabase
        .from('sessions')
        .select('id, paid, payment_status, status')
        .eq('lesson_package_id', pkg.id);
      const linked = linkedSessions || [];
      if (linked.some((s: any) => s.paid === true)) {
        throw new Error(t('compStu.pkgAnnulHasPaidSessions'));
      }
      // Reservation holds die with the package; regular scheduled lessons are
      // just unlinked and become billable again.
      const reservedIds = linked.filter((s: any) => s.payment_status === 'reserved').map((s: any) => s.id);
      const otherIds = linked.filter((s: any) => s.payment_status !== 'reserved').map((s: any) => s.id);
      if (reservedIds.length > 0) {
        await supabase
          .from('sessions')
          .update({ status: 'cancelled', lesson_package_id: null, payment_status: 'pending' })
          .in('id', reservedIds);
      }
      if (otherIds.length > 0) {
        await supabase
          .from('sessions')
          .update({ lesson_package_id: null, payment_status: 'pending' })
          .in('id', otherIds);
      }
      const { error } = await supabase
        .from('lesson_packages')
        .update({
          active: false,
          payment_status: 'cancelled',
          cancelled_at: new Date().toISOString(),
        })
        .eq('id', pkg.id)
        .eq('paid', false);
      if (error) throw error;
      await reloadStudentPackages();
      setToastMessage({ message: t('compStu.pkgAnnulled'), type: 'success' });
    } catch (e: any) {
      setToastMessage({ message: t('compStu.errorPrefix', { msg: e?.message || String(e) }), type: 'error' });
    }
    setAnnullingPackageId(null);
  };

  /** Re-send the payment email for a pending package (stable pay link). */
  const handleResendPackageEmail = async (packageId: string) => {
    setResendingPackageId(packageId);
    try {
      const resp = await fetch('/api/resend-package-email', {
        method: 'POST',
        headers: await authHeaders(),
        body: JSON.stringify({ packageId }),
      });
      const result = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error((result as any).error || String(resp.status));
      setToastMessage({ message: t('compStu.pkgResent'), type: 'success' });
    } catch (e: any) {
      setToastMessage({ message: t('compStu.errorPrefix', { msg: e?.message || String(e) }), type: 'error' });
    }
    setResendingPackageId(null);
  };

  /** Stop the automatic monthly package plan (no further months are generated). */
  const handleStopAutoPlan = async (planId: string) => {
    if (!window.confirm(t('compStu.autoPlanStopConfirm'))) return;
    setStoppingPlanId(planId);
    try {
      const { error } = await supabase
        .from('recurring_monthly_package_plans')
        .update({ active: false, updated_at: new Date().toISOString() })
        .eq('id', planId);
      if (error) throw error;
      setStudentAutoPlans((prev) => prev.filter((plan) => plan.id !== planId));
      setToastMessage({ message: t('compStu.autoPlanStopped'), type: 'success' });
    } catch (e: any) {
      setToastMessage({ message: t('compStu.errorPrefix', { msg: e?.message || String(e) }), type: 'error' });
    }
    setStoppingPlanId(null);
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
    const hasSecondParentAny =
      !!newStudent.parent_secondary_name.trim() ||
      !!newStudent.parent_secondary_email.trim() ||
      !!newStudent.parent_secondary_phone.trim();
    if (isSchoolView && hasSecondParentAny) {
      if (!newStudent.parent_secondary_name.trim() || !newStudent.parent_secondary_email.trim() || !newStudent.parent_secondary_phone.trim()) {
        setToastMessage({
          message: `${t('compStu.parentFullNameRequired')} · ${t('compStu.parentEmailRequired')} · ${t('compStu.parentPhoneRequired')}`,
          type: 'error',
        });
        return;
      }
      if (!validateLocalizedPhone(newStudent.parent_secondary_phone, locale)) {
        setToastMessage({ message: t('compStu.phoneFormat'), type: 'error' });
        return;
      }
    }
    if (isSchoolView && newStudent.contact_parent === 'secondary' && !hasSecondParentAny) {
      setToastMessage({ message: t('compStu.parentNameRequiredError'), type: 'error' });
      return;
    }
    if (newStudent.payer_phone?.trim() && !validateLocalizedPhone(newStudent.payer_phone, locale)) {
      setToastMessage({ message: t('compStu.phoneFormat'), type: 'error' });
      return;
    }

    if (newStudent.phone?.trim() && !validateLocalizedPhone(newStudent.phone, locale)) {
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

    if (effectiveOrgId && newStudent.email?.trim()) {
      const orgTutors = await getOrgVisibleTutors(supabase, effectiveOrgId, 'id, email, full_name');
      const conflict = findOrgTutorEmailConflict(newStudent.email, orgTutors);
      if (conflict) {
        setToastMessage({
          message: t('compStu.emailMatchesOrgTutor', { name: conflict.tutorName }),
          type: 'error',
        });
        return;
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
          grade: newStudent.grade || null,
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

    const shouldSendInviteOnCreate = !isSchoolView;
    if (shouldSendInviteOnCreate && newStudent.email?.trim()) {
      const inviteBaseUrl = orgCanonicalOrigin(orgPreferredLocale) ?? baseUrl;
      for (const row of inserted) {
        const tutor = tutors.find((t) => t.id === row.tutor_id);
        const bookingUrl = `${inviteBaseUrl}/book/${row.invite_code}`;
        const ok = await sendEmail({
          type: 'invite_email',
          to: newStudent.email.trim(),
          locale: orgPreferredLocale || locale,
          data: {
            studentName: newStudent.full_name,
            tutorName: tutor?.full_name || t('compStu.tutorFallback'),
            inviteCode: row.invite_code,
            bookingUrl,
            ...(orgId ? { organizationId: orgId } : {}),
          },
        });
        if (!ok) emailOk = false;
      }
    }

    // When admin chose "student + parent", send parent portal invites.
    // Plain company: always; school: only with flexible_invitations (Pro Klasė-style).
    if (newStudent.invite_target === 'both' && (!isSchoolView || hasFeature('flexible_invitations'))) {
      for (const row of inserted) {
        await sendParentPortalInvites(row.id, false);
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
              locale,
              data: { tutorName: tutorProfile.full_name, studentName: newStudent.full_name, ...contactPayload, ...(orgId ? { organizationId: orgId } : {}) },
            });
          }
        }
      }
    }

    const toastType: 'success' | 'error' =
      shouldSendInviteOnCreate && newStudent.email?.trim() && !emailOk ? 'error' : 'success';
    const toastMessage =
      shouldSendInviteOnCreate && newStudent.email?.trim() && !emailOk
        ? t('compStu.emailSendFailed')
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
      grade: '',
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
      invite_target: 'student',
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
    if (studentEditDraft.phone?.trim() && !validateLocalizedPhone(studentEditDraft.phone, locale)) {
      setToastMessage({ message: t('compStu.phoneFormat'), type: 'error' });
      return;
    }
    if (studentEditDraft.payer_phone?.trim() && !validateLocalizedPhone(studentEditDraft.payer_phone, locale)) {
      setToastMessage({ message: t('compStu.phoneFormat'), type: 'error' });
      return;
    }
    const hasSecondParentAny =
      !!studentEditDraft.parent_secondary_name.trim() ||
      !!studentEditDraft.parent_secondary_email.trim() ||
      !!studentEditDraft.parent_secondary_phone.trim();
    if (isSchoolView && hasSecondParentAny) {
      if (!studentEditDraft.parent_secondary_name.trim() || !studentEditDraft.parent_secondary_email.trim() || !studentEditDraft.parent_secondary_phone.trim()) {
        setToastMessage({
          message: `${t('compStu.parentFullNameRequired')} · ${t('compStu.parentEmailRequired')} · ${t('compStu.parentPhoneRequired')}`,
          type: 'error',
        });
        return;
      }
      if (!validateLocalizedPhone(studentEditDraft.parent_secondary_phone, locale)) {
        setToastMessage({ message: t('compStu.phoneFormat'), type: 'error' });
        return;
      }
    }
    if (isSchoolView && studentEditDraft.contact_parent === 'secondary' && !hasSecondParentAny) {
      setToastMessage({ message: t('compStu.parentNameRequiredError'), type: 'error' });
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
    const nextEmail = studentEditDraft.email.trim();
    const previousEmail = String(selectedStudent.email || '').trim();
    const emailChanged = nextEmail.toLowerCase() !== previousEmail.toLowerCase();

    // Registered students: email changes go through the server first (syncs the
    // auth account + runs duplicate / org-tutor checks) before the row update.
    if (selectedStudent.linked_user_id && emailChanged) {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) {
        setSavingStudentInfo(false);
        setToastMessage({ message: t('compStu.errorPrefix', { msg: 'Neprisijungta' }), type: 'error' });
        return;
      }
      const emailResp = await fetch('/api/admin-update-student-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ studentId: selectedStudent.id, email: nextEmail }),
      });
      const emailJson = await emailResp.json().catch(() => ({}));
      if (!emailResp.ok) {
        setSavingStudentInfo(false);
        if (emailJson.error === 'email_matches_org_tutor') {
          setToastMessage({
            message: t('compStu.emailMatchesOrgTutor', { name: String(emailJson.tutorName || '') }),
            type: 'error',
          });
        } else if (emailJson.error === 'email_already_used') {
          setToastMessage({ message: t('onboard.emailAlreadyRegistered'), type: 'error' });
        } else {
          setToastMessage({
            message: t('compStu.errorPrefix', { msg: String(emailJson.error || emailJson.details || emailResp.status) }),
            type: 'error',
          });
        }
        return;
      }
    }
    const payload = {
      full_name: studentEditDraft.full_name.trim(),
      email: nextEmail,
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

    // Contact data describes the student identity — keep every duplicate row
    // of the group (one per tutor pairing) in sync.
    const groupIds = selectedStudentGroup.length > 0
      ? selectedStudentGroup.map((row) => row.id)
      : [selectedStudent.id];
    const { error } = await supabase.from('students').update(payload).in('id', groupIds);
    setSavingStudentInfo(false);
    if (error) {
      setToastMessage({ message: t('compStu.errorPrefix', { msg: error.message }), type: 'error' });
      return;
    }
    setSelectedStudent((s) => (s ? { ...s, ...payload } : s));
    setSelectedStudentGroup((prev) => prev.map((s) => ({ ...s, ...payload })));
    setStudents((prev) => prev.map((s) => (groupIds.includes(s.id) ? { ...s, ...payload } : s)));
    setToastMessage({ message: t('compStu.commentSaved'), type: 'success' });
    invalidateCache('company_contracts');
    fetchData();

    // Email changed while the student is still unregistered → offer to resend
    // the full invitation to the new address right away.
    if (emailChanged && nextEmail && !selectedStudent.linked_user_id) {
      if (window.confirm(t('compStu.resendInviteAfterEmailChange'))) {
        void sendInviteEmailFor({ ...selectedStudent, ...payload });
      }
    }
  };

  /** Availability windows live on every row of the identity group (kept in sync). */
  const handleSaveStudentAvailability = async (next: StudentPreferredWindow[]) => {
    if (!selectedStudent) return;
    setSavingAvailability(true);
    try {
      const ids = selectedStudentGroup.length > 0
        ? selectedStudentGroup.map((row) => row.id)
        : [selectedStudent.id];
      const { error } = await supabase
        .from('students')
        .update({ preferred_availability: next })
        .in('id', ids);
      if (error) throw new Error(error.message);
      setSelectedStudent((current) => (current ? { ...current, preferred_availability: next } : current));
      setSelectedStudentGroup((current) => current.map((row) => ({ ...row, preferred_availability: next })));
      setStudents((current) => current.map((row) => (ids.includes(row.id) ? { ...row, preferred_availability: next } : row)));
      invalidateCache('company_students');
      setToastMessage({ message: t('compStu.availabilitySaved'), type: 'success' });
    } catch (err: any) {
      console.error('[CompanyStudents] availability save failed:', err);
      setToastMessage({ message: t('compStu.errorPrefix', { msg: err?.message || String(err) }), type: 'error' });
    } finally {
      setSavingAvailability(false);
    }
  };

  const handleUpdateStudentGrade = async (grade: string) => {
    if (!selectedStudent) return;
    const ids = selectedStudentGroup.length > 0
      ? selectedStudentGroup.map((row) => row.id)
      : [selectedStudent.id];
    const nextGrade = grade === 'unset' ? null : grade;
    const { error } = await supabase
      .from('students')
      .update({ grade: nextGrade })
      .in('id', ids);
    if (error) {
      setToastMessage({ message: t('compStu.errorPrefix', { msg: error.message }), type: 'error' });
      return;
    }

    setSelectedStudent((current) => (current ? { ...current, grade: nextGrade } : current));
    setSelectedStudentGroup((current) => current.map((row) => ({ ...row, grade: nextGrade })));
    setStudents((current) => current.map((row) => (ids.includes(row.id) ? { ...row, grade: nextGrade } : row)));
    setToastMessage({ message: t('dynamicPricing.studentGradeSaved'), type: 'success' });
  };

  /**
   * Item 9 (dynamic pricing): contracted lessons-per-week the admin decides.
   * 'auto' recomputes from the recurring schedule; a number pins it manually.
   * The RPC also re-prices upcoming unpaid lessons to the matching tier.
   */
  const persistStudentPricingFrequency = async (
    studentIds: string[],
    lessonsPerWeek: number,
    options?: { silent?: boolean },
  ) => {
    let effective: number | null = lessonsPerWeek;
    for (const id of studentIds) {
      const { data, error } = await supabase.rpc('set_student_pricing_frequency', {
        p_student_id: id,
        p_lessons_per_week: lessonsPerWeek,
      });
      if (error) {
        if (!options?.silent) {
          setToastMessage({ message: t('compStu.errorPrefix', { msg: error.message }), type: 'error' });
        }
        return false;
      }
      if (selectedStudent && id === selectedStudent.id) effective = (data as number | null) ?? lessonsPerWeek;
    }
    const patch = { pricing_lessons_per_week: effective, pricing_lessons_per_week_is_manual: true };
    if (selectedStudent && studentIds.includes(selectedStudent.id)) {
      setSelectedStudent((current) => (current ? { ...current, ...patch } : current));
    }
    setSelectedStudentGroup((current) =>
      current.map((row) => (studentIds.includes(row.id) ? { ...row, ...patch } : row)),
    );
    setStudents((current) =>
      current.map((row) => (studentIds.includes(row.id) ? { ...row, ...patch } : row)),
    );
    if (!options?.silent) {
      setToastMessage({ message: t('dynamicPricing.frequencySaved'), type: 'success' });
    }
    return true;
  };

  const handleUpdateStudentFrequency = async (value: string) => {
    if (!selectedStudent) return;
    const ids = selectedStudentGroup.length > 0
      ? selectedStudentGroup.map((row) => row.id)
      : [selectedStudent.id];
    const manual = value !== 'auto';
    const freq = manual ? Number(value) : null;
    let effective: number | null = freq;
    for (const id of ids) {
      const { data, error } = await supabase.rpc('set_student_pricing_frequency', {
        p_student_id: id,
        p_lessons_per_week: freq,
      });
      if (error) {
        setToastMessage({ message: t('compStu.errorPrefix', { msg: error.message }), type: 'error' });
        return;
      }
      if (id === selectedStudent.id) effective = (data as number | null) ?? null;
    }
    const patch = { pricing_lessons_per_week: effective, pricing_lessons_per_week_is_manual: manual };
    setSelectedStudent((current) => (current ? { ...current, ...patch } : current));
    setSelectedStudentGroup((current) => current.map((row) => ({ ...row, ...patch })));
    setStudents((current) => current.map((row) => (ids.includes(row.id) ? { ...row, ...patch } : row)));
    setToastMessage({ message: t('dynamicPricing.frequencySaved'), type: 'success' });
  };

  const handlePkgLessonsPerWeekChange = (value: string) => {
    const next = Number(value);
    if (!Number.isFinite(next) || next < 1) return;
    setPkgLessonsPerWeek(next);
    if (!selectedStudent) return;
    void persistStudentPricingFrequency([selectedStudent.id], next, { silent: true });
  };

  const handleDetachStudent = async (id: string) => {
    if (!confirm(t('compStu.confirmDetachStudent'))) return;
    const { data: studentRow } = await supabase
      .from('students')
      .select('id, linked_user_id, organization_id')
      .eq('id', id)
      .maybeSingle();
    if (!studentRow) return;

    const now = new Date().toISOString();
    const patch = { detached_at: now, tutor_id: null as string | null };

    let error: { message: string } | null = null;
    if (studentRow.linked_user_id && studentRow.organization_id) {
      const { error: bulkErr } = await supabase
        .from('students')
        .update(patch)
        .eq('organization_id', studentRow.organization_id)
        .eq('linked_user_id', studentRow.linked_user_id);
      error = bulkErr;
    } else {
      const { error: singleErr } = await supabase.from('students').update(patch).eq('id', id);
      error = singleErr;
    }

    if (!error) {
      setToastMessage({ message: t('compStu.studentDetached'), type: 'success' });
      fetchData();
    } else {
      setToastMessage({ message: t('compStu.errorPrefix', { msg: error.message }), type: 'error' });
    }
  };

  const handleRestoreStudent = async (id: string) => {
    const { data: studentRow } = await supabase
      .from('students')
      .select('id, linked_user_id, organization_id')
      .eq('id', id)
      .maybeSingle();
    if (!studentRow) return;

    let error: { message: string } | null = null;
    if (studentRow.linked_user_id && studentRow.organization_id) {
      const { error: bulkErr } = await supabase
        .from('students')
        .update({ detached_at: null })
        .eq('organization_id', studentRow.organization_id)
        .eq('linked_user_id', studentRow.linked_user_id);
      error = bulkErr;
    } else {
      const { error: singleErr } = await supabase.from('students').update({ detached_at: null }).eq('id', id);
      error = singleErr;
    }

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

  const openContractFile = async (urlOrPath?: string | null) => {
    if (!urlOrPath?.trim()) {
      setToastMessage({ message: t('compStu.contractFileMissing'), type: 'error' });
      return;
    }
    if (isSchoolView) {
      try {
        const res = await fetch('/api/school-contract-file-url', {
          method: 'POST',
          headers: { ...(await authHeaders()), 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: extractStoragePath(urlOrPath) }),
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok && typeof data?.signedUrl === 'string') {
          window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
          return;
        }
        setToastMessage({
          message: data?.error || t('compStu.contractOpenFail'),
          type: 'error',
        });
        return;
      } catch {
        /* fallback below */
      }
    }
    const ok = await openContractFileInNewTab(urlOrPath);
    if (!ok) setToastMessage({ message: t('compStu.contractOpenFail'), type: 'error' });
  };

  const sendParentPortalInvites = async (studentId: string, showToast: boolean) => {
    setSendingParentInvites(true);
    try {
      const res = await fetch('/api/parent-create-invites-for-student', {
        method: 'POST',
        headers: await authHeaders(),
        body: JSON.stringify({ studentId, locale }),
      });
      const json = await res.json().catch(() => ({}));
      if (showToast) {
        if (!res.ok) {
          setToastMessage({ message: (json as { error?: string }).error || t('compStu.errorPrefix', { msg: '' }), type: 'error' });
        } else {
          const n = (json as { sent?: number }).sent ?? 0;
          setToastMessage({
            message: n > 0 ? t('studentSettings.inviteParentSuccess') : t('studentSettings.inviteParentNoEmail'),
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

  /** Takes the row explicitly so callers with freshly-saved data avoid stale state. */
  const sendInviteEmailFor = async (student: Student) => {
    const recipient = (student.email || '').trim() || (student.payer_email || '').trim();
    if (!recipient) {
      setToastMessage({ message: t('compStu.noInviteRecipient'), type: 'error' });
      return;
    }
    if (!student.invite_code) {
      setToastMessage({ message: t('compStu.inviteMissingCode'), type: 'error' });
      return;
    }
    setSendingInviteNow(true);
    const bookingUrl = `${orgCanonicalOrigin(orgPreferredLocale) ?? baseUrl}/book/${student.invite_code}`;
    const ok = await sendEmail({
      type: 'invite_email',
      to: recipient,
      locale: orgPreferredLocale || locale,
      data: {
        studentName: student.full_name,
        tutorName: student.tutor?.full_name || t('compStu.tutorFallback'),
        inviteCode: student.invite_code,
        bookingUrl,
        ...(orgId ? { organizationId: orgId } : {}),
      },
    });
    setSendingInviteNow(false);
    setToastMessage({
      message: ok ? t('compStu.inviteSentNowSuccess') : t('compStu.inviteSentNowFailed'),
      type: ok ? 'success' : 'error',
    });
  };

  const handleSendInviteNow = async () => {
    if (!selectedStudent) return;
    await sendInviteEmailFor(selectedStudent);
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
        <div className="mb-6 space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <GraduationCap className="w-6 h-6 text-indigo-600" />
              {t('compStu.title')}
              <span className="text-base font-medium text-gray-400">({filteredGroups.length})</span>
            </h1>
            <div className="flex items-center gap-2 flex-wrap shrink-0">
              <Button
                variant={showTrashBin ? 'default' : 'outline'}
                size="sm"
                className="rounded-xl gap-1.5"
                onClick={() => setShowTrashBin((v) => !v)}
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
                    <div className="flex items-center justify-between gap-3">
                      <Label>{t('compStu.tutorsRequired')}</Label>
                      {proKlaseIntake && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-8 rounded-lg border-indigo-200 text-xs text-indigo-700 hover:bg-indigo-50"
                        onClick={() => {
                          setMultiTutorPickerOpen(false);
                          setAddStudentFindTutorOpen(true);
                        }}
                      >
                        <Search className="mr-1.5 h-3.5 w-3.5" />
                        {t('compStu.findTutorByAvailability')}
                      </Button>
                      )}
                    </div>
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
                          <div className={cn('mt-2 space-y-1', ORG_TUTOR_FILTER_SCROLL_CLASS)}>
                            {tutors
                              .filter((tu) =>
                                tu.full_name.toLowerCase().includes(multiTutorSearch.trim().toLowerCase())
                              )
                              .map((tu) => {
                                const active = newStudent.tutor_ids.includes(tu.id);
                                return (
                                  <label
                                    key={tu.id}
                                    className="flex items-center gap-2 px-2 py-1 rounded-lg hover:bg-gray-50 cursor-pointer text-xs"
                                  >
                                    <input
                                      type="checkbox"
                                      checked={active}
                                      onChange={(e) => {
                                        const next = e.target.checked
                                          ? [...newStudent.tutor_ids, tu.id]
                                          : newStudent.tutor_ids.filter((id) => id !== tu.id);
                                        setNewStudent({ ...newStudent, tutor_ids: next });
                                      }}
                                      className="w-3.5 h-3.5"
                                    />
                                    <span className="min-w-0 flex-1">
                                      <span className="block truncate text-gray-900">{tu.full_name}</span>
                                      <span className="block truncate text-[11px] text-gray-500">
                                        {formatTutorSubjectsLine(tu.subject_names, t('compSch.tutorNoSubjects'))}
                                      </span>
                                    </span>
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
                      onChange={(e) => setNewStudent({ ...newStudent, phone: formatLocalizedPhone(e.target.value, locale) })}
                      placeholder={getLocalizedPhonePlaceholder(locale)}
                      className="rounded-xl"
                    />
                  </div>
                  {(isSchoolView || proKlaseIntake) && (
                  <div className="space-y-2 sm:col-span-2">
                    <Label>{t('studentSettings.grade')}</Label>
                    <Select
                      value={newStudent.grade || 'unset'}
                      onValueChange={(value) => setNewStudent({ ...newStudent, grade: value === 'unset' ? '' : value })}
                    >
                      <SelectTrigger className="rounded-xl">
                        <SelectValue placeholder={t('dynamicPricing.gradeUnset')} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="unset">{t('dynamicPricing.gradeUnset')}</SelectItem>
                        {Array.from({ length: 12 }, (_, index) => (
                          <SelectItem key={index + 1} value={`${index + 1} klasė`}>
                            {t('onboard.gradeN', { n: index + 1 })}
                          </SelectItem>
                        ))}
                        <SelectItem value="Studentas">{t('lessonSet.gradeUniversity')}</SelectItem>
                        <SelectItem value="Kita">{t('onboard.gradeOther')}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  )}
                  </div>

                  {!isSchoolView && (
                    <div className="rounded-xl border border-gray-200 p-3 space-y-3">
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                        {t('compStu.parentContactLabel')}
                      </p>
                      <div className="grid sm:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>{t('compStu.parentNameLabel')}</Label>
                          <Input
                            value={newStudent.payer_name}
                            onChange={(e) => setNewStudent({ ...newStudent, payer_name: e.target.value })}
                            placeholder={t('compStu.parentNamePlaceholder')}
                            className="rounded-xl"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>{t('compStu.parentEmailLabel')}</Label>
                          <Input
                            type="email"
                            value={newStudent.payer_email}
                            onChange={(e) => setNewStudent({ ...newStudent, payer_email: e.target.value })}
                            placeholder="tevas@example.com"
                            className="rounded-xl"
                          />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label>{t('compStu.inviteTargetLabel')}</Label>
                        <div className="flex gap-2 flex-wrap">
                          <Button
                            type="button"
                            size="sm"
                            variant={newStudent.invite_target === 'student' ? 'default' : 'outline'}
                            className="rounded-xl text-xs"
                            onClick={() => setNewStudent({ ...newStudent, invite_target: 'student' })}
                          >
                            {t('compStu.inviteStudentOnly')}
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant={newStudent.invite_target === 'both' ? 'default' : 'outline'}
                            className="rounded-xl text-xs"
                            onClick={() => setNewStudent({ ...newStudent, invite_target: 'both' })}
                          >
                            {t('compStu.inviteStudentAndParent')}
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}

                  {isSchoolView && (
                    <div className="grid sm:grid-cols-3 gap-4">
                      <div className="space-y-2">
                        <Label>{t('parent.childBirthDate')}</Label>
                        <DateInput
                          value={newStudent.child_birth_date}
                          onChange={(e) => setNewStudent({ ...newStudent, child_birth_date: e.target.value })}
                        />
                        {newStudent.child_birth_date && (
                          <p className="text-xs text-gray-500">
                            {t('studentSettings.age')}: {calculateAgeFromDate(newStudent.child_birth_date) ?? '—'}
                          </p>
                        )}
                      </div>
                      <div className="space-y-2">
                        <Label>{t('invoiceSettings.address')}</Label>
                        <Input
                          value={newStudent.student_address}
                          onChange={(e) => setNewStudent({ ...newStudent, student_address: e.target.value })}
                          placeholder={t('invoiceSettings.address')}
                          className="rounded-xl"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>{t('perlasFinance.city')}</Label>
                        <Input
                          value={newStudent.student_city}
                          onChange={(e) => setNewStudent({ ...newStudent, student_city: e.target.value })}
                          placeholder={t('perlasFinance.city')}
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
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">1 · {t('school.parentSection')} *</p>
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
                          placeholder="parent@example.com"
                          className="rounded-xl"
                          required
                        />
                      </div>

                      <div className="space-y-2">
                          <Label>{t('invoiceSettings.personalCode')}</Label>
                          <Input
                            value={newStudent.payer_personal_code}
                            onChange={(e) => setNewStudent({ ...newStudent, payer_personal_code: e.target.value })}
                            placeholder={t('invoiceSettings.personalCode')}
                            className="rounded-xl"
                          />
                        </div>
                        <div className="space-y-2">
                        <Label>{t('compStu.parentPhoneRequired')}</Label>
                        <Input
                          value={newStudent.payer_phone}
                          onChange={(e) => setNewStudent({ ...newStudent, payer_phone: formatLocalizedPhone(e.target.value, locale) })}
                          placeholder={getLocalizedPhonePlaceholder(locale)}
                          className="rounded-xl"
                        />
                      </div>
                        </div>
                      </div>
                      <div
                        className={`rounded-xl border p-3 space-y-3 cursor-pointer ${newStudent.contact_parent === 'secondary' ? 'border-indigo-400 bg-indigo-50/40' : 'border-gray-200'}`}
                        onClick={() => setNewStudent({ ...newStudent, contact_parent: 'secondary' })}
                      >
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">2 · {t('school.parentSection')} ({t('common.optional')})</p>
                        <div className="grid sm:grid-cols-3 gap-3">
                          <Input
                            value={newStudent.parent_secondary_name}
                            onChange={(e) => setNewStudent({ ...newStudent, parent_secondary_name: e.target.value })}
                            placeholder={t('compStu.parentNamePlaceholder')}
                            className="rounded-xl"
                          />
                          <Input
                            type="email"
                            value={newStudent.parent_secondary_email}
                            onChange={(e) => setNewStudent({ ...newStudent, parent_secondary_email: e.target.value })}
                            placeholder="parent2@example.com"
                            className="rounded-xl"
                          />
                          <Input
                            value={newStudent.parent_secondary_phone}
                            onChange={(e) => setNewStudent({ ...newStudent, parent_secondary_phone: formatLocalizedPhone(e.target.value, locale) })}
                            placeholder={getLocalizedPhonePlaceholder(locale)}
                            className="rounded-xl"
                          />
                          <Input
                            value={newStudent.parent_secondary_personal_code}
                            onChange={(e) => setNewStudent({ ...newStudent, parent_secondary_personal_code: e.target.value })}
                            placeholder={t('invoiceSettings.personalCode')}
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
                            2 · {t('invoiceSettings.address')} = 1 · {t('invoiceSettings.address')}
                          </label>
                          <div className="sm:col-span-3 space-y-1" onClick={(e) => e.stopPropagation()}>
                            <Label className="text-xs text-gray-500">2 · {t('invoiceSettings.address')}</Label>
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
                              placeholder={t('invoiceSettings.address')}
                              className="rounded-xl"
                            />
                          </div>
                        </div>
                      </div>
                      <p className="text-xs text-gray-500">{t('compStu.parentContactLabel')}</p>
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

          <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2">
            {isSchoolView && availableGrades.length > 0 && (
              <Select value={gradeFilter} onValueChange={setGradeFilter}>
                <SelectTrigger className="w-full sm:w-auto sm:min-w-[140px] rounded-xl border-gray-200 bg-white">
                  <SelectValue placeholder={t('compStu.filterGradeAll')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('compStu.filterGradeAll')}</SelectItem>
                  {availableGrades.map((gr) => (
                    <SelectItem key={gr} value={gr}>{gr}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {isSchoolView && (
              <Select value={contractFilter} onValueChange={(v) => setContractFilter(v as 'all' | 'signed' | 'pending' | 'none')}>
                <SelectTrigger className="w-full sm:w-auto sm:min-w-[170px] rounded-xl border-gray-200 bg-white">
                  <SelectValue placeholder={t('compStu.filterContractAll')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('compStu.filterContractAll')}</SelectItem>
                  <SelectItem value="signed">{t('compStu.filterContractSigned')}</SelectItem>
                  <SelectItem value="pending">{t('compStu.filterContractPending')}</SelectItem>
                  <SelectItem value="none">{t('compStu.filterContractNone')}</SelectItem>
                </SelectContent>
              </Select>
            )}
            {isSchoolView && (
              <Select value={mediaConsentFilter} onValueChange={(v) => setMediaConsentFilter(v as MediaConsentFilter)}>
                <SelectTrigger className="w-full sm:w-auto sm:min-w-[170px] rounded-xl border-gray-200 bg-white">
                  <SelectValue placeholder={t('compStu.filterConsentAll')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('compStu.filterConsentAll')}</SelectItem>
                  <SelectItem value="agree">{t('compStu.filterConsentAgreeShort')}</SelectItem>
                  <SelectItem value="disagree">{t('compStu.filterConsentDisagreeShort')}</SelectItem>
                  <SelectItem value="unknown">{t('compStu.filterConsentUnknownShort')}</SelectItem>
                </SelectContent>
              </Select>
            )}
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              <Input
                type="search"
                placeholder={t('compStu.searchPlaceholder')}
                value={studentSearch}
                onChange={(e) => setStudentSearch(e.target.value)}
                className="pl-9 rounded-xl border-gray-200 bg-white"
                aria-label={t('compStu.searchAriaLabel')}
              />
            </div>
            {isSchoolView && (
              <Button
                size="sm"
                variant="outline"
                className="rounded-xl shrink-0 w-full sm:w-auto"
                onClick={() => void exportStudentsXlsx()}
                disabled={exportingStudents || filteredGroups.length === 0}
              >
                <Download className="w-4 h-4 mr-1.5" />
                {exportingStudents ? t('school.exportingExcel') : t('school.exportExcel')}
              </Button>
            )}
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
              {filteredGroups.map((g, groupIdx) => {
                const student = g.primary;
                const initials = student.full_name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);
                const hasTutor = g.rows.some((r) => r.tutor_id);
                const needsPackage = g.rows.some((r) => trialNoPackageStudentIds.has(r.id));
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
                          <p className="font-semibold text-gray-900 truncate">
                            <span className="text-gray-400 font-normal tabular-nums">{groupIdx + 1}.</span> {student.full_name}
                          </p>
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
                        {needsPackage && (
                          <div className="mt-1">
                            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-red-700 bg-red-50 border border-red-200 rounded-md px-1.5 py-0.5">
                              <AlertCircle className="w-3 h-3" />
                              {t('compStu.noPackageSent')}
                            </span>
                          </div>
                        )}
                        {isSchoolView && (
                          <SchoolStudentContractStatus
                            student={student}
                            contractInfo={contractsByStudent[student.id]}
                            onDownload={(path) => void openContractFile(path)}
                            t={t}
                          />
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
                            <span className="truncate">{adminShowPhone(student.phone, locale)}</span>
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
                          <div className="flex items-center gap-1.5">
                            {(student.payer_email || student.parent_secondary_email) && (
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); void sendParentPortalInvites(student.id, true); }}
                                disabled={sendingParentInvites}
                                className="inline-flex items-center gap-1 rounded-lg border border-indigo-200 text-indigo-700 bg-white hover:bg-indigo-50 px-2 py-1.5 text-xs font-medium transition-colors disabled:opacity-50"
                                aria-label={t('compStu.inviteParent')}
                                title={t('compStu.inviteParent')}
                              >
                                <Mail className="w-3.5 h-3.5" />
                              </button>
                            )}
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
                  </div>
                );
              })}
            </div>

            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full table-fixed min-w-[920px]">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="w-[28%] px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">{t('compStu.thStudent')}</th>
                    <th className="w-[14%] px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">{t('compStu.thTutor')}</th>
                    <th className="w-[28%] px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">{t('compStu.thContacts')}</th>
                    <th className="w-[12%] px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">{t('compStu.thCode')}</th>
                    <th className="w-[18%] px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">{t('compStu.thActions')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredGroups.map((g, groupIdx) => {
                    const student = g.primary;
                    const initials = student.full_name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);
                    const hasTutorDt = g.rows.some((r) => r.tutor_id);
                    const needsPackage = g.rows.some((r) => trialNoPackageStudentIds.has(r.id));
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
                        <td className="px-4 py-4 align-top">
                          <div className="flex items-start gap-3 min-w-0">
                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-400 to-indigo-600 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                              {initials || '?'}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="font-semibold text-gray-900 truncate">
                                <span className="text-gray-400 font-normal tabular-nums">{groupIdx + 1}.</span> {student.full_name}
                              </p>
                              <div className="mt-1 flex flex-wrap items-center gap-1">
                                {student.linked_user_id ? (
                                  <span className="text-[11px] text-green-700 bg-green-50 border border-green-200 rounded-md px-2 py-0.5">{t('compStu.connected')}</span>
                                ) : (
                                  <span className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2 py-0.5">{t('compStu.notConnected')}</span>
                                )}
                                {needsPackage && (
                                  <span className="inline-flex items-center gap-1 text-[11px] font-medium text-red-700 bg-red-50 border border-red-200 rounded-md px-2 py-0.5">
                                    <AlertCircle className="w-3 h-3" />
                                    {t('compStu.noPackageSent')}
                                  </span>
                                )}
                              </div>
                              {isSchoolView && (
                                <SchoolStudentContractStatus
                                  student={student}
                                  contractInfo={contractsByStudent[student.id]}
                                  onDownload={(path) => void openContractFile(path)}
                                  t={t}
                                />
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-4 align-top">
                          {tutorNames.length > 0 ? (
                            <div className="text-left">
                              <p className="text-sm text-gray-700">
                                {tutorNames.length <= 1 ? tutorNames[0] : `${tutorNames[0]} +${tutorNames.length - 1}`}
                              </p>
                              {tutorNames.length > 1 && (
                                <p className="text-[11px] text-gray-400 mt-0.5">{t('compStu.moreThanOneTutor')}</p>
                              )}
                            </div>
                          ) : (
                            <span className="inline-flex text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2 py-0.5">{t('compStu.tutorNotAssigned')}</span>
                          )}
                        </td>
                        <td className="px-4 py-4 align-top">
                          <div className="space-y-2 text-xs text-gray-700">
                            <div>
                              <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide mb-1">{t('compStu.studentLabel')}</p>
                              <div className="flex items-center gap-1.5">
                                <Mail className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                                <span className="truncate">{adminShowEmail(student.email)}</span>
                              </div>
                              <div className="flex items-center gap-1.5 mt-0.5">
                                <Phone className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                                <span>{adminShowPhone(student.phone, locale)}</span>
                              </div>
                            </div>
                            {shouldShowParentContacts(student) && (
                              <div className="pt-2 border-t border-gray-100">
                                <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide mb-1">{t('compStu.payerLabel')}</p>
                                <div className="flex items-center gap-1.5">
                                  <Mail className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                                  <span className="truncate">{adminShowEmail(student.payer_email)}</span>
                                </div>
                                <div className="flex items-center gap-1.5 mt-0.5">
                                  <Phone className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                                  <span>{adminShowPhone(student.payer_phone, locale)}</span>
                                </div>
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-4 align-top">
                          <code className="inline-block font-mono font-bold text-indigo-700 text-sm tracking-widest bg-indigo-50 px-2 py-1 rounded">
                            {student.invite_code}
                          </code>
                        </td>
                        <td className="px-4 py-4 text-right align-top">
                          <div className="inline-flex items-center gap-1.5">
                            {(student.payer_email || student.parent_secondary_email) && (
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); void sendParentPortalInvites(student.id, true); }}
                                disabled={sendingParentInvites}
                                className="inline-flex items-center gap-1 rounded-lg border border-indigo-200 text-indigo-700 bg-white hover:bg-indigo-50 px-2 py-1.5 text-xs font-medium transition-colors disabled:opacity-50"
                                title={t('compStu.inviteParent')}
                              >
                                <Mail className="w-3.5 h-3.5" /> {t('compStu.inviteParent')}
                              </button>
                            )}
                            <button
                              onClick={() => showTrashBin ? handleRestoreStudent(student.id) : handleDetachStudent(student.id)}
                              className={`p-2 rounded-lg transition-colors ${showTrashBin ? 'text-green-400 hover:text-green-600 hover:bg-green-50' : 'text-gray-400 hover:text-red-500 hover:bg-red-50'}`}
                              title={showTrashBin ? t('compStu.restoreBtn') : t('compStu.detachBtn')}
                            >
                              {showTrashBin ? <ArchiveRestore className="w-4 h-4" /> : <Archive className="w-4 h-4" />}
                            </button>
                          </div>
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
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        {isEditingStudentName ? (
                          <div className="space-y-2">
                            <Input
                              value={studentNameDraft}
                              onChange={(e) => setStudentNameDraft(e.target.value)}
                              placeholder={t('compStu.fullNameRequired')}
                              className="rounded-xl bg-white"
                            />
                            <div className="flex gap-2">
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  setIsEditingStudentName(false);
                                  setStudentNameDraft(selectedStudent.full_name || '');
                                }}
                                disabled={savingStudentName}
                              >
                                {t('common.cancel')}
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                onClick={async () => {
                                  const nextName = studentNameDraft.trim();
                                  if (!nextName) {
                                    setToastMessage({ message: t('compStu.fullNameRequired'), type: 'error' });
                                    return;
                                  }
                                  setSavingStudentName(true);
                                  const { error } = await supabase
                                    .from('students')
                                    .update({ full_name: nextName })
                                    .eq('id', selectedStudent.id);
                                  if (error) {
                                    setToastMessage({ message: error.message || t('common.error'), type: 'error' });
                                    setSavingStudentName(false);
                                    return;
                                  }
                                  setSelectedStudent((s) => (s ? { ...s, full_name: nextName } : s));
                                  setStudents((prev) => prev.map((st) => (st.id === selectedStudent.id ? { ...st, full_name: nextName } : st)));
                                  setToastMessage({ message: t('compStu.commentSaved'), type: 'success' });
                                  setIsEditingStudentName(false);
                                  setSavingStudentName(false);
                                }}
                                disabled={savingStudentName || !studentNameDraft.trim()}
                                className="bg-emerald-600 hover:bg-emerald-700"
                              >
                                {savingStudentName ? t('common.saving') : t('common.save')}
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <h3 className="text-xl font-bold text-gray-900 break-words">{selectedStudent.full_name}</h3>
                        )}
                      </div>
                      {!isEditingStudentName && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setIsEditingStudentName(true)}
                          className="flex-shrink-0"
                        >
                          {t('common.edit')}
                        </Button>
                      )}
                    </div>
                    <div className="text-gray-600 text-sm space-y-3">
                      <div>
                        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">{t('compStu.studentLabel')}</p>
                        <p>
                          {t('compStu.emailInline')} <span className="text-gray-900">{adminShowEmail(selectedStudent.email)}</span>
                        </p>
                        <p>
                          {t('compStu.phoneInline')} <span className="text-gray-900">{adminShowPhone(selectedStudent.phone, locale)}</span>
                        </p>
                      </div>
                      {shouldShowParentContacts(selectedStudent) && (
                        <div className="pt-2 border-t border-gray-100">
                          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">{t('compStu.payerLabel')}</p>
                          {(selectedStudent.payer_name || '').trim() && (
                            <p>
                              {t('compStu.parentNameLabel')}: <span className="text-gray-900">{selectedStudent.payer_name}</span>
                            </p>
                          )}
                          <p>
                            {t('compStu.emailInline')} <span className="text-gray-900">{adminShowEmail(selectedStudent.payer_email)}</span>
                          </p>
                          <p>
                            {t('compStu.phoneInline')} <span className="text-gray-900">{adminShowPhone(selectedStudent.payer_phone, locale)}</span>
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
                    <div className="mt-3 max-w-xs space-y-1.5">
                      <Label className="text-xs text-gray-500">{t('studentSettings.grade')}</Label>
                      <Select
                        value={selectedStudent.grade || 'unset'}
                        onValueChange={(value) => void handleUpdateStudentGrade(value)}
                      >
                        <SelectTrigger className="h-9 rounded-xl bg-white">
                          <SelectValue placeholder={t('dynamicPricing.gradeUnset')} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="unset">{t('dynamicPricing.gradeUnset')}</SelectItem>
                          {Array.from({ length: 12 }, (_, index) => (
                            <SelectItem key={index + 1} value={`${index + 1} klasė`}>
                              {t('onboard.gradeN', { n: index + 1 })}
                            </SelectItem>
                          ))}
                          <SelectItem value="Studentas">{t('lessonSet.gradeUniversity')}</SelectItem>
                          <SelectItem value="Kita">{t('onboard.gradeOther')}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    )}
                    {proKlaseIntake && (
                    <div className="mt-3 max-w-xs space-y-1.5">
                      <Label className="text-xs text-gray-500">{t('studentSettings.grade')}</Label>
                      <Select
                        value={selectedStudent.grade || 'unset'}
                        onValueChange={(value) => void handleUpdateStudentGrade(value)}
                      >
                        <SelectTrigger className="h-9 rounded-xl bg-white">
                          <SelectValue placeholder={t('dynamicPricing.gradeUnset')} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="unset">{t('dynamicPricing.gradeUnset')}</SelectItem>
                          {Array.from({ length: 12 }, (_, index) => (
                            <SelectItem key={index + 1} value={`${index + 1} klasė`}>
                              {t('onboard.gradeN', { n: index + 1 })}
                            </SelectItem>
                          ))}
                          <SelectItem value="Studentas">{t('lessonSet.gradeUniversity')}</SelectItem>
                          <SelectItem value="Kita">{t('onboard.gradeOther')}</SelectItem>
                        </SelectContent>
                      </Select>
                      <Label className="text-xs text-gray-500">{t('dynamicPricing.frequencyLabel')}</Label>
                      <Select
                        value={
                          selectedStudent.pricing_lessons_per_week_is_manual && selectedStudent.pricing_lessons_per_week
                            ? String(selectedStudent.pricing_lessons_per_week)
                            : selectedStudent.pricing_lessons_per_week
                              ? String(selectedStudent.pricing_lessons_per_week)
                              : 'auto'
                        }
                        onValueChange={(value) => void handleUpdateStudentFrequency(value)}
                      >
                        <SelectTrigger className="h-9 rounded-xl bg-white">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="auto">{t('dynamicPricing.frequencyAuto')}</SelectItem>
                          {Array.from({ length: 7 }, (_, index) => (
                            <SelectItem key={index + 1} value={String(index + 1)}>
                              {t('dynamicPricing.frequencyOption', { n: index + 1 })}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-[11px] text-gray-500">
                        {selectedStudent.pricing_lessons_per_week
                          ? t('dynamicPricing.studentFrequency', { frequency: selectedStudent.pricing_lessons_per_week })
                          : t('dynamicPricing.studentFrequencyUnset')}
                      </p>
                      {!selectedStudent.grade && (
                        <p className="text-[11px] text-amber-700">{t('dynamicPricing.studentGradeRequired')}</p>
                      )}
                    </div>
                    )}
                    {isSchoolView && selectedStudent && (
                      <SchoolStudentContractStatus
                        student={selectedStudent}
                        contractInfo={contractsByStudent[selectedStudent.id]}
                        onDownload={(path) => void openContractFile(path)}
                        t={t}
                      />
                    )}
                    {canFullEditStudent && (
                      <div className="mt-3 rounded-xl border border-gray-200 bg-gray-50 p-3 space-y-3">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{t('common.edit')} · {t('compStu.studentLabel')}</p>
                          <Button type="button" variant="outline" size="sm" onClick={() => setStudentEditOpen((v) => !v)}>
                            {studentEditOpen ? t('common.hide') : t('common.show')}
                          </Button>
                        </div>

                        {studentEditOpen ? (
                          <>
                          <div className="grid sm:grid-cols-2 gap-2">
                            <Input value={studentEditDraft.full_name} onChange={(e) => setStudentEditDraft((p) => ({ ...p, full_name: e.target.value }))} placeholder={t('compStu.fullNameRequired')} className="rounded-xl bg-white" />
                            {/* Registered students' email edits go through /api/admin-update-student-email (auth + row sync). */}
                            <Input
                              type="email"
                              value={studentEditDraft.email}
                              onChange={(e) => setStudentEditDraft((p) => ({ ...p, email: e.target.value }))}
                              placeholder={t('compStu.emailLabel')}
                              className="rounded-xl bg-white"
                            />
                            <Input value={studentEditDraft.phone} onChange={(e) => setStudentEditDraft((p) => ({ ...p, phone: formatLocalizedPhone(e.target.value, locale) }))} placeholder={t('compStu.phoneLabel')} className="rounded-xl bg-white" />
                            <DateInput value={studentEditDraft.child_birth_date} onChange={(e) => setStudentEditDraft((p) => ({ ...p, child_birth_date: e.target.value }))} />
                            <Input value={studentEditDraft.student_address} onChange={(e) => setStudentEditDraft((p) => ({ ...p, student_address: e.target.value }))} placeholder={t('invoiceSettings.address')} className="rounded-xl bg-white" />
                            <Input value={studentEditDraft.student_city} onChange={(e) => setStudentEditDraft((p) => ({ ...p, student_city: e.target.value }))} placeholder={t('perlasFinance.city')} className="rounded-xl bg-white" />
                            {studentEditDraft.child_birth_date && (
                              <p className="text-xs text-gray-500 sm:col-span-2">{t('studentSettings.age')}: {calculateAgeFromDate(studentEditDraft.child_birth_date) ?? '—'}</p>
                            )}
                          </div>
                          <div className="rounded-xl border border-gray-200 bg-white p-3 space-y-2">
                            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                              {isSchoolView ? t('compStu.parentContactLabel') : t('compStu.payerLabel')}
                            </p>
                            <div className="grid sm:grid-cols-2 gap-2">
                              <Input value={studentEditDraft.payer_name} onChange={(e) => setStudentEditDraft((p) => ({ ...p, payer_name: e.target.value }))} placeholder={t('compStu.parentFullNameRequired')} className="rounded-xl bg-white" />
                              <Input type="email" value={studentEditDraft.payer_email} onChange={(e) => setStudentEditDraft((p) => ({ ...p, payer_email: e.target.value }))} placeholder={t('compStu.parentEmailRequired')} className="rounded-xl bg-white" />
                              <Input value={studentEditDraft.payer_phone} onChange={(e) => setStudentEditDraft((p) => ({ ...p, payer_phone: formatLocalizedPhone(e.target.value, locale) }))} placeholder={t('compStu.parentPhoneRequired')} className="rounded-xl bg-white" />
                              <Input
                                value={studentEditDraft.payer_personal_code}
                                onChange={(e) => setStudentEditDraft((p) => ({ ...p, payer_personal_code: e.target.value }))}
                                placeholder={t('invoiceSettings.personalCode')}
                                className="rounded-xl bg-white"
                              />
                            </div>
                          </div>
                          {isSchoolView && (
                            <>
                              <div className="rounded-xl border border-gray-200 bg-white p-3 space-y-2">
                                <div className="flex items-center justify-between gap-2">
                                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">2 · {t('school.parentSection')} ({t('common.optional')})</p>
                                  <Button type="button" variant="outline" size="sm" onClick={() => setStudentEditSecondParentOpen((v) => !v)}>
                                    {studentEditSecondParentOpen ? t('common.hide') : t('common.show')}
                                  </Button>
                                </div>
                                {studentEditSecondParentOpen && (
                                  <div className="grid sm:grid-cols-2 gap-2">
                                    <Input value={studentEditDraft.parent_secondary_name} onChange={(e) => setStudentEditDraft((p) => ({ ...p, parent_secondary_name: e.target.value }))} placeholder={t('compStu.parentNamePlaceholder')} className="rounded-xl bg-white" />
                                    <Input type="email" value={studentEditDraft.parent_secondary_email} onChange={(e) => setStudentEditDraft((p) => ({ ...p, parent_secondary_email: e.target.value }))} placeholder="parent2@example.com" className="rounded-xl bg-white" />
                                    <Input value={studentEditDraft.parent_secondary_phone} onChange={(e) => setStudentEditDraft((p) => ({ ...p, parent_secondary_phone: formatLocalizedPhone(e.target.value, locale) }))} placeholder={getLocalizedPhonePlaceholder(locale)} className="rounded-xl bg-white" />
                                    <Input value={studentEditDraft.parent_secondary_personal_code} onChange={(e) => setStudentEditDraft((p) => ({ ...p, parent_secondary_personal_code: e.target.value }))} placeholder={t('invoiceSettings.personalCode')} className="rounded-xl bg-white" />
                                    <label className="sm:col-span-2 flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
                                      <input
                                        type="checkbox"
                                        checked={studentEditDraft.parent2_address_same_as_primary}
                                        onChange={(e) => setStudentEditDraft((p) => ({ ...p, parent2_address_same_as_primary: e.target.checked }))}
                                        className="rounded border-gray-300"
                                      />
                                      2 · {t('invoiceSettings.address')} = 1 · {t('invoiceSettings.address')}
                                    </label>
                                    <div className="sm:col-span-2 space-y-1">
                                      <Label className="text-xs text-gray-500">2 · {t('invoiceSettings.address')}</Label>
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
                                        placeholder={t('invoiceSettings.address')}
                                        className="rounded-xl bg-white"
                                      />
                                    </div>
                                  </div>
                                )}
                              </div>
                              <div className="sm:col-span-2">
                                <Label className="text-xs text-gray-500">{t('compStu.parentContactLabel')}</Label>
                                <Select value={studentEditDraft.contact_parent} onValueChange={(v: 'primary' | 'secondary') => setStudentEditDraft((p) => ({ ...p, contact_parent: v }))}>
                                  <SelectTrigger className="rounded-xl bg-white mt-1"><SelectValue /></SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="primary">1</SelectItem>
                                    <SelectItem value="secondary">2</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                            </>
                          )}
                            <div className="flex justify-end">
                              <Button type="button" size="sm" onClick={() => void handleSaveStudentInfo()} disabled={savingStudentInfo}>
                                {savingStudentInfo ? t('common.loading') : t('school.saveChanges')}
                              </Button>
                            </div>
                          </>
                        ) : null}
                      </div>
                    )}
                    <div className="pt-1 flex items-center gap-2 flex-wrap">
                      {(() => {
                        const inviteRecipient =
                          (selectedStudent.email || '').trim() ||
                          (selectedStudent.payer_email || '').trim();
                        return (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-7 px-2.5 text-[11px] gap-1"
                            disabled={sendingInviteNow || !inviteRecipient}
                            title={!inviteRecipient ? t('compStu.noInviteRecipient') : undefined}
                            onClick={() => void handleSendInviteNow()}
                          >
                            <Mail className="w-3 h-3" />
                            {sendingInviteNow ? t('compStu.sendingNow') : t('compStu.sendInviteNow')}
                          </Button>
                        );
                      })()}
                      {(selectedStudent.payer_email || selectedStudent.parent_secondary_email) && (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-7 px-2.5 text-[11px]"
                          disabled={sendingParentInvites || !selectedStudent}
                          onClick={() => selectedStudent && void sendParentPortalInvites(selectedStudent.id, true)}
                        >
                          {sendingParentInvites ? t('common.loading') : t('compStu.inviteParent')}
                        </Button>
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

                  {/* Recurring schedule + move/cancel counters (near the edit button). */}
                  {selectedStudent && proKlaseIntake && hasFeature('student_schedule_overview') && (
                    <StudentScheduleSummary
                      studentRowIds={(selectedStudentGroup.length > 0 ? selectedStudentGroup : [selectedStudent]).map((row) => row.id)}
                      refreshKey={modalSessionsRefreshKey}
                    />
                  )}

                  {/* Weekly availability that suits the student (prefills tutor search). */}
                  {selectedStudent && !orgFeaturesLoading && hasFeature('student_availability_profile') && (
                    <StudentAvailabilityEditor
                      value={pickGroupPreferredAvailability(selectedStudentGroup.length > 0 ? selectedStudentGroup : [selectedStudent])}
                      saving={savingAvailability}
                      onSave={handleSaveStudentAvailability}
                    />
                  )}
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
                          <SelectContent className={ORG_TUTOR_SELECT_SCROLL_CLASS}>
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
                              .map((tu) => (
                                <SelectItem key={tu.id} value={tu.id}>
                                  <span className="flex flex-col items-start gap-0.5 min-w-0">
                                    <span>{tu.full_name}</span>
                                    <span className="text-[11px] text-gray-500 font-normal truncate max-w-full">
                                      {formatTutorSubjectsLine(tu.subject_names, t('compSch.tutorNoSubjects'))}
                                    </span>
                                  </span>
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
                                      locale,
                                      data: { tutorName: tutorProfile.full_name, studentName: selectedStudent.full_name, ...contactPayload, ...(orgId ? { organizationId: orgId } : {}) },
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
                                    className="bg-amber-50 border border-amber-100 border-l-4 rounded-xl p-3 flex items-center justify-between gap-3"
                                    style={{ borderLeftColor: pricing.subject?.color || '#6366f1' }}
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
                                          <strong>{fmt(pricing.price)}</strong> / {pricing.duration_minutes} min
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
                                          <div className="flex items-center gap-2">
                                            <span
                                              className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                                              style={{ backgroundColor: s.color || '#6366f1' }}
                                            />
                                            {s.name}
                                          </div>
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
                {selectedStudent && proKlaseIntake && (selectedStudentSessionCount ?? 0) === 0 && !selectedStudent.trial_offer_disabled &&
                  !hasFeature('hide_trial_offer_button') &&
                  (hasFeature('trial_reservation_flow') || hasFeature('auto_trial_first_lesson')) && (
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
                      {monthlyPackageMode ? (
                        <div className="space-y-3 rounded-xl border border-violet-200 bg-white/70 p-3">
                          <div className="space-y-1">
                            <Label className="text-[11px] text-violet-900">{t('package.itemSubject')}</Label>
                            <Select
                              value={pkgItems[0]?.subjectId || ''}
                              onValueChange={(subjectId) => {
                                const subject = packageSubjects.find((row: any) => row.id === subjectId);
                                const price = resolveOrganizationLessonPrice({
                                  rules: pkgDynamicPricingRules,
                                  student: { grade: String(pkgGrade), pricing_lessons_per_week: pkgLessonsPerWeek },
                                  lessonsPerWeek: pkgLessonsPerWeek,
                                  individualPrice: pkgIndividualPricing[subjectId],
                                  fallbackPrice: Number(subject?.price ?? 0),
                                });
                                setPkgItems([{
                                  subjectId,
                                  totalLessons: monthlyPackagePeriod.totalLessons,
                                  pricePerLesson: price,
                                }]);
                              }}
                            >
                              <SelectTrigger className="h-9 rounded-lg text-xs">
                                <SelectValue placeholder={t('package.selectSubject')} />
                              </SelectTrigger>
                              <SelectContent>
                                {packageSubjects.map((subject: any) => (
                                  <SelectItem key={subject.id} value={subject.id}>{subject.name}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1">
                              <Label className="text-[11px] text-violet-900">{t('package.studentGrade')}</Label>
                              <Select value={String(pkgGrade)} onValueChange={(value) => setPkgGrade(Number(value))}>
                                <SelectTrigger className="h-9 rounded-lg text-xs"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  {Array.from({ length: 12 }, (_, index) => index + 1).map((grade) => (
                                    <SelectItem key={grade} value={String(grade)}>{t('package.gradeValue', { grade })}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-1">
                              <Label className="text-[11px] text-violet-900">{t('package.weeklyFrequency')}</Label>
                              <Select value={String(pkgLessonsPerWeek)} onValueChange={handlePkgLessonsPerWeekChange}>
                                <SelectTrigger className="h-9 rounded-lg text-xs"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  {[1, 2, 3, 4, 5].map((count) => (
                                    <SelectItem key={count} value={String(count)}>{t('findLesson.lessonsPerWeek', { count })}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                          <div className="rounded-lg bg-violet-50 px-3 py-2 text-xs text-violet-800">
                            <p className="font-medium">
                              {t('package.monthlyCalculation', {
                                from: monthlyPackagePeriod.periodStart,
                                to: monthlyPackagePeriod.periodEnd,
                                lessons: monthlyPackagePeriod.totalLessons,
                              })}
                            </p>
                            <p className="mt-1 text-[11px] text-violet-600">
                              {t('package.monthlyAutoRenewHint', { date: monthlyPackagePeriod.nextGenerationDate })}
                            </p>
                          </div>
                        </div>
                      ) : (
                        <PackageItemsEditor
                          compact
                          disabled={pkgSending || orgFeaturesLoading}
                          subjects={packageSubjects as PackageEditorSubject[]}
                          individualPricing={pkgIndividualPricing}
                          items={pkgItems}
                          onChange={setPkgItems}
                        />
                      )}
                      {!orgFeaturesLoading && proKlaseIntake && hasFeature('package_reservation_flow') && (
                        <div className="space-y-2 border-t border-violet-200 pt-3">
                          <p className="text-xs font-semibold text-violet-800">{t('package.reserveTimesTitle')}</p>
                          <p className="text-[11px] text-violet-600">{t('package.reserveTimesHint')}</p>
                          {pkgReserveSlots.length > 0 && (
                            <ul className="space-y-1">
                              {pkgReserveSlots.map((s, idx) => {
                                const subjName = packageSubjects.find((ps: any) => ps.id === s.subjectId)?.name || '';
                                return (
                                  <li
                                    key={`${s.subjectId}-${s.startIso}-${idx}`}
                                    className="flex items-center justify-between gap-2 text-xs bg-white border border-violet-200 rounded-lg px-2 py-1"
                                  >
                                    <span className="truncate">{subjName} · {formatPkgSlot(s.startIso)}</span>
                                    <button
                                      type="button"
                                      onClick={() => setPkgReserveSlots((prev) => prev.filter((_, i) => i !== idx))}
                                      className="text-violet-500 hover:text-rose-600 shrink-0"
                                      aria-label={t('compStu.removeBtn')}
                                    >
                                      <XCircle className="w-3.5 h-3.5" />
                                    </button>
                                  </li>
                                );
                              })}
                            </ul>
                          )}
                          <div className="grid grid-cols-12 gap-2 items-end">
                            <div className="col-span-5 space-y-1">
                              <Label className="text-xs">{t('compSch.subject')}</Label>
                              <Select value={pkgSlotSubjectId} onValueChange={setPkgSlotSubjectId}>
                                <SelectTrigger className="h-8 text-xs rounded-lg">
                                  <SelectValue placeholder="…" />
                                </SelectTrigger>
                                <SelectContent>
                                  {pkgItems.map((it) => {
                                    const subj = packageSubjects.find((ps: any) => ps.id === it.subjectId);
                                    return subj ? (
                                      <SelectItem key={subj.id} value={subj.id}>
                                        {subj.name}
                                      </SelectItem>
                                    ) : null;
                                  })}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="col-span-3 space-y-1">
                              <Label className="text-xs">{t('compSch.date')}</Label>
                              <DateInput
                                value={pkgSlotDate}
                                min={new Date().toISOString().split('T')[0]}
                                onChange={(e) => setPkgSlotDate(e.target.value)}
                                className="h-8 text-xs rounded-lg"
                              />
                            </div>
                            <div className="col-span-2 space-y-1">
                              <Label className="text-xs">{t('compSch.time')}</Label>
                              <TimeInput
                                value={pkgSlotTime}
                                onChange={(v) => setPkgSlotTime(v)}
                                className="h-8 text-xs rounded-lg"
                              />
                            </div>
                            <div className="col-span-2">
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-8 w-full text-xs rounded-lg border-violet-300 text-violet-700 hover:bg-violet-100"
                                onClick={addPkgReserveSlot}
                                disabled={!pkgSlotSubjectId || !pkgSlotDate || !pkgSlotTime}
                              >
                                <Plus className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      )}
                      <div className="grid grid-cols-3 gap-2">
                        {!monthlyPackageMode && (
                        <>
                        <div className="space-y-1 col-span-2">
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
                            onClick={handleSendPackage} disabled={pkgSending || pkgItems.length === 0 || orgFeaturesLoading}>
                            {pkgSending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : t('compStu.sendBtn')}
                          </Button>
                        </div>
                        </>
                        )}
                        {monthlyPackageMode && (
                          <div className="col-span-3">
                            <Button size="sm" className="h-9 w-full rounded-lg bg-violet-600 text-xs hover:bg-violet-700"
                              onClick={handleSendPackage} disabled={pkgSending || pkgItems.length === 0 || orgFeaturesLoading}>
                              {pkgSending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : t('compStu.sendBtn')}
                            </Button>
                          </div>
                        )}
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
                      {!monthlyPackageMode && <p className="text-[11px] text-violet-500">{t('package.validUntilHint')}</p>}
                      <p className="text-xs text-violet-600">
                        {orgUsesManualPackages ? t('compStu.manualPackageSendHint') : t('compStu.stripePaymentHint')}
                      </p>
                      {pkgItems.length > 0 && pkgItems.some((it) => it.totalLessons > 0) && (
                        <p className="text-xs font-medium text-violet-800">
                          {t('package.totalAcrossSubjects')}: {pkgItems.reduce((acc, it) => acc + (Number(it.totalLessons) || 0), 0)}
                          {' · '}
                          {t('package.totalToPay')}: {fmt(pkgItems.reduce((acc, it) => acc + (Number(it.totalLessons) || 0) * (Number(it.pricePerLesson) || 0), 0))}
                          {!orgUsesManualPackages && (
                            <span className="text-violet-500 font-normal"> {t('package.includingFeesNote')}</span>
                          )}
                        </p>
                      )}
                    </div>
                  )}

                  {studentAutoPlans.length > 0 && (
                    <div className="space-y-1.5 mb-2">
                      {studentAutoPlans.map((plan: any) => (
                        <div key={plan.id} className="flex items-center justify-between gap-2 p-2.5 rounded-xl border border-indigo-100 bg-indigo-50/60 text-xs">
                          <div className="min-w-0">
                            <p className="font-semibold text-indigo-900">{t('compStu.autoPlanActive')}</p>
                            <p className="text-indigo-700/80 truncate">
                              {plan.tutor?.full_name ? `${plan.tutor.full_name} · ` : ''}
                              {t('compStu.autoPlanNextGen', { date: String(plan.next_generation_date || '—') })}
                            </p>
                          </div>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-7 px-2.5 text-[11px] rounded-lg border-indigo-200 text-indigo-700 hover:bg-indigo-100 shrink-0"
                            disabled={stoppingPlanId === plan.id}
                            onClick={() => void handleStopAutoPlan(plan.id)}
                          >
                            {stoppingPlanId === plan.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : t('compStu.autoPlanStop')}
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}

                  {loadingPackages ? (
                    <div className="text-center py-3"><Loader2 className="w-5 h-5 animate-spin mx-auto text-gray-400" /></div>
                  ) : studentPackages.length === 0 ? (
                    <p className="text-sm text-gray-400 text-center py-3">{t('compStu.noPackages')}</p>
                  ) : (
                    <div className="space-y-2">
                      {studentPackages.map((pkg: any) => {
                        const items = Array.isArray(pkg.lesson_package_items) ? pkg.lesson_package_items : [];
                        const isMulti = items.length > 1;
                        return (
                        <div key={pkg.id} className="flex flex-col gap-2 p-3 bg-gray-50 rounded-xl text-sm">
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <div className="flex items-center gap-2 flex-wrap">
                              {!isMulti && pkg.subject?.color && <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: pkg.subject.color }} />}
                              <span className="font-medium text-gray-800">
                                {isMulti
                                  ? items.map((it: any) => it.subjects?.name).filter(Boolean).join(', ')
                                  : (pkg.subject?.name || '—')}
                              </span>
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
                            {pkg.payment_status === 'pending' && !pkg.paid && (
                              <>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 px-2 text-xs rounded-lg text-gray-500 hover:text-indigo-700 hover:bg-indigo-50"
                                  disabled={resendingPackageId === pkg.id}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    void handleResendPackageEmail(pkg.id);
                                  }}
                                  title={t('compStu.pkgResend')}
                                >
                                  {resendingPackageId === pkg.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Mail className="w-3.5 h-3.5" />}
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 px-2 text-xs rounded-lg text-gray-500 hover:text-red-600 hover:bg-red-50"
                                  disabled={annullingPackageId === pkg.id}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    void handleAnnulPackage(pkg);
                                  }}
                                  title={t('compStu.pkgAnnul')}
                                >
                                  {annullingPackageId === pkg.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Ban className="w-3.5 h-3.5" />}
                                </Button>
                              </>
                            )}
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
                          {isMulti && (
                            <ul className="pl-2 space-y-0.5">
                              {items
                                .slice()
                                .sort((a: any, b: any) => Number(a.position || 0) - Number(b.position || 0))
                                .map((it: any) => (
                                  <li key={it.subject_id} className="flex items-center justify-between gap-3 text-xs text-gray-600">
                                    <span className="flex items-center gap-2 min-w-0">
                                      {it.subjects?.color && <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: it.subjects.color }} />}
                                      <span className="truncate">{it.subjects?.name || '—'}</span>
                                    </span>
                                    <span className="tabular-nums shrink-0">{Number(it.available_lessons || 0)}/{Number(it.total_lessons || 0)}</span>
                                  </li>
                                ))}
                            </ul>
                          )}
                        </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Book a lesson from the student card (req 4) */}
                {!orgFeaturesLoading && hasFeature('student_card_booking') && (
                  <div className="border-t border-gray-100 pt-4">
                    <h4 className="font-semibold mb-1 text-gray-900">{t('compStu.bookLessonTitle')}</h4>
                    <p className="text-xs text-gray-500 mb-3">{t('compStu.bookLessonDesc')}</p>
                    <Button
                      variant="outline"
                      className="rounded-xl border-indigo-200 text-indigo-700 hover:bg-indigo-50"
                      onClick={() => {
                        setFindLessonBookedIntervals([]);
                        setFindLessonOpen(true);
                      }}
                    >
                      <Search className="w-4 h-4 mr-2" />
                      {t('compStu.bookLessonFindTutor')}
                    </Button>
                  </div>
                )}

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

        {proKlaseIntake && (
        <FindTutorModal
          isOpen={addStudentFindTutorOpen}
          onClose={() => setAddStudentFindTutorOpen(false)}
          orgId={orgId}
          frequencyEnabled
          onPickTutor={(tutor) => {
            setNewStudent((current) => ({
              ...current,
              tutor_ids: current.tutor_ids.includes(tutor.id)
                ? current.tutor_ids
                : [...current.tutor_ids, tutor.id],
            }));
            setAddStudentFindTutorOpen(false);
          }}
        />
        )}

        {!orgFeaturesLoading && hasFeature('student_card_booking') && (
          <>
            <FindTutorModal
              isOpen={findLessonOpen}
              onClose={() => setFindLessonOpen(false)}
              orgId={orgId}
              primaryTutorId={selectedStudent?.tutor_id ?? null}
              frequencyEnabled={hasFeature('tutor_frequency_search')}
              hidePrices={hasFeature('hide_admin_lesson_prices')}
              initialPreferredWindows={toFindTutorWindows(
                pickGroupPreferredAvailability(
                  selectedStudentGroup.length > 0 ? selectedStudentGroup : (selectedStudent ? [selectedStudent] : []),
                ),
              )}
              busyIntervals={findLessonBookedIntervals}
              onPickSlot={(slot) => {
                setFindLessonPick({
                  tutorId: slot.tutorId,
                  tutorName: slot.tutorName,
                  subjectId: slot.subjectId,
                  subjectName: slot.subjectName,
                  startIso: slot.start.toISOString(),
                  endIso: slot.end.toISOString(),
                });
              }}
            />
            <FindLessonBookDialog
              pick={findLessonPick}
              studentId={selectedStudent?.id ?? ''}
              onClose={() => setFindLessonPick(null)}
              onBooked={(booking) => {
                setFindLessonBookedIntervals((current) => [
                  ...current,
                  {
                    tutor_id: booking.tutorId,
                    start: new Date(booking.startIso),
                    end: new Date(booking.endIso),
                  },
                ]);
                setModalSessionsRefreshKey((k) => k + 1);
                fetchData();
              }}
            />
          </>
        )}

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
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900">
                {t('compStu.trialWithoutDateHint')}
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
                {t('compStu.confirmAndSendWithoutDate')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </>
  );
}
