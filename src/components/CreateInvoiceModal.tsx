import { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DateInput } from '@/components/ui/date-input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/lib/supabase';
import { authHeaders } from '@/lib/apiHelpers';
import { useTranslation } from '@/lib/i18n';
import { Loader2, FileText, Calendar, Receipt, CalendarDays, FileStack, Building2, User } from 'lucide-react';
import { endOfDay, format, subDays } from 'date-fns';
import { cn } from '@/lib/utils';
import { fetchPaidSalesInvoiceCandidates } from '@/lib/manualSalesInvoicePreview';
import { fetchOrgTutorInvoicesDeduped } from '@/lib/fetchOrgTutorInvoicesDeduped';
import { orgTutorSessionPayEur } from '@/lib/orgTutorLessonPay';
import { isProKlaseOrg } from '@/lib/marketMoney';
import { proKlaseSessionPayEur } from '@/lib/proKlaseTutorPay';
import { useOrgFeatures } from '@/hooks/useOrgFeatures';
import { isInvoiceProfileComplete, ORG_INVOICE_PROFILE_INCOMPLETE } from '@/lib/invoiceProfileReady';
import { schoolTutorPayOccurrences } from '@/lib/schoolTutorLessonPay';
import { resolveSchoolTutorGroupPayRate } from '@/lib/schoolTutorDefaultPay';
import { fetchSchoolTutorAttendancePayRows } from '@/lib/schoolTutorAttendancePay';
import { orgRequiresTutorStatusConfirmation } from '@/lib/sessionStatusConfirmation';
import { fetchAllRows } from '@/lib/fetchAllRows';
import { schoolDate } from '@/lib/schoolTime';

function invoiceApiErrorMessage(
  json: { code?: string; error?: string } | null | undefined,
  t: (key: string) => string,
): string {
  if (json?.code === ORG_INVOICE_PROFILE_INCOMPLETE) return t('invoices.orgProfileIncompleteError');
  return json?.error || t('common.error');
}

type GroupingType = 'per_payment' | 'per_week' | 'single';

const COMPANY_SELLER_ENTITIES = new Set(['mb', 'uab', 'ii']);

interface SellerInfo {
  business_name?: string;
  company_code?: string;
  vat_code?: string;
  address?: string;
  contact_email?: string;
  contact_phone?: string;
  entity_type?: string;
  activity_number?: string;
  personal_code?: string;
  invoice_series?: string;
  /** Tik peržiūrai: mokinio sąskaitose pardavėjo vardą imame iš Tutlio profilio (neiš įmonės lauko „Pavadinimas“). */
  _previewSellerFullName?: string | null;
}

interface CreateInvoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  studentId?: string;
  studentName?: string;
  billingTutorId?: string;
  isOrgTutor?: boolean;
  onSuccess?: () => void;
  orgTutors?: { id: string; full_name: string }[];
}

export default function CreateInvoiceModal({
  isOpen,
  onClose,
  studentId,
  studentName,
  billingTutorId,
  isOrgTutor,
  onSuccess,
  orgTutors,
}: CreateInvoiceModalProps) {
  const { t } = useTranslation();
  const { hasFeature, entityType, organizationId: schoolOrganizationId, loading: orgFeaturesLoading, error: orgFeaturesError } = useOrgFeatures();
  const schoolPayMode = isOrgTutor && entityType === 'school';
  const pvmEducationInvoice = hasFeature('pvm_education_invoice');
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');
  const [groupingType, setGroupingType] = useState<GroupingType>('single');
  const [sessions, setSessions] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewMode, setPreviewMode] = useState(false);
  const [hasInvoiceProfile, setHasInvoiceProfile] = useState<boolean | null>(null);
  const [sellerInfo, setSellerInfo] = useState<SellerInfo | null>(null);
  const [orgBuyerInfo, setOrgBuyerInfo] = useState<{ name: string; email?: string } | null>(null);

  useEffect(() => {
    if (isOpen) {
      const today = new Date();
      const thirtyDaysAgo = subDays(today, 30);
      setPeriodStart(format(thirtyDaysAgo, 'yyyy-MM-dd'));
      setPeriodEnd(format(today, 'yyyy-MM-dd'));
      setPreviewMode(false);
      setSessions([]);
      setError(null);
      setSellerInfo(null);
      setOrgBuyerInfo(null);
      checkInvoiceProfile();
      if (isOrgTutor) fetchOrgBuyerInfo();
    }
  }, [isOpen, isOrgTutor, billingTutorId]);

  const fetchOrgBuyerInfo = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: profile } = await supabase
        .from('profiles')
        .select('organization_id')
        .eq('id', user.id)
        .maybeSingle();
      if (!profile?.organization_id) return;
      const { data: org } = await supabase
        .from('organizations')
        .select('name, contact_email')
        .eq('id', profile.organization_id)
        .maybeSingle();
      if (org) setOrgBuyerInfo({ name: org.name, email: (org as any).contact_email || undefined });
    } catch {
      // ignore
    }
  };

  const checkInvoiceProfile = async () => {
    try {
      const headers = await authHeaders();
      let profileData: SellerInfo | null | undefined;

      if (isOrgTutor && billingTutorId) {
        const tutorRes = await fetch(
          `/api/invoice-settings?scope=tutor&tutorId=${encodeURIComponent(billingTutorId)}`,
          { headers },
        );
        const tutorJson = await tutorRes.json();
        profileData = tutorJson.data as SellerInfo | null | undefined;
      } else {
        if (!isOrgTutor) {
          const orgRes = await fetch('/api/invoice-settings?scope=organization', { headers });
          const orgJson = await orgRes.json();
          profileData = orgJson.data as SellerInfo | null | undefined;
        } else {
          const userRes = await fetch('/api/invoice-settings?scope=user', { headers });
          const userJson = await userRes.json();
          profileData = userJson.data as SellerInfo | null | undefined;
        }
      }

      setHasInvoiceProfile(isInvoiceProfileComplete(profileData));

      let previewName: string | null | undefined;
      const needsTutorName =
        profileData &&
        (!profileData.entity_type || !COMPANY_SELLER_ENTITIES.has(profileData.entity_type));

      if (needsTutorName) {
        try {
          const nameUserId = billingTutorId ?? (await supabase.auth.getUser()).data.user?.id;
          if (nameUserId) {
            const { data: pf } = await supabase.from('profiles').select('full_name').eq('id', nameUserId).maybeSingle();
            previewName = (pf?.full_name || '').trim() || null;
          }
        } catch {
          previewName = null;
        }
      }

      if (profileData) {
        setSellerInfo({
          ...profileData,
          _previewSellerFullName: previewName,
        });
      }
    } catch {
      setHasInvoiceProfile(false);
    }
  };

  const handlePreview = async () => {
    if (!periodStart || !periodEnd) {
      setError(t('invoiceCreate.fillDates'));
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error(t('invoice.userNotAuthorized'));

      const tutorScopeId = billingTutorId ?? user.id;
      const tutorIdsForQuery =
        orgTutors && orgTutors.length > 0 ? orgTutors.map(tu => tu.id) : [tutorScopeId];

      if (tutorIdsForQuery.length === 0) {
        setError(t('invoiceCreate.noOrgTutors'));
        setSessions([]);
        setPreviewMode(false);
        return;
      }

      if (isOrgTutor) {
        if (orgFeaturesLoading || orgFeaturesError || !entityType) throw new Error(t('common.error'));
        // Org tutor → invoice to organization: show occurred lessons (not student/payer sales invoices).
        const tutorId = tutorScopeId;
        if (!tutorId) throw new Error(t('invoiceCreate.noSessions'));

        const issuingForAnotherTutor = !!billingTutorId && billingTutorId !== user.id;
        if (!issuingForAnotherTutor) {
          const periodInvoiceKey = `periodStart=${encodeURIComponent(periodStart)}&periodEnd=${encodeURIComponent(periodEnd)}`;
          const periodInvoiceRes = await fetchOrgTutorInvoicesDeduped(periodInvoiceKey);
          if (periodInvoiceRes.ok) {
            const periodInvoiceJson = periodInvoiceRes.data;
            const periodInvoices = (periodInvoiceJson.periodInvoices || []) as Array<{ invoice_number?: string; total_amount?: number }>;
            if (periodInvoices.length > 0) {
              const totalIssued = periodInvoices.reduce((sum, inv) => sum + Number(inv.total_amount || 0), 0);
              const nums = periodInvoices.map((inv) => inv.invoice_number).filter(Boolean).join(', ');
              setError(t('invoiceCreate.periodAlreadyIssuedDetailed', { start: periodStart, end: periodEnd, nums: nums || t('invoiceCreate.noNumber'), amount: totalIssued.toFixed(2) }));
              setSessions([]);
              setPreviewMode(false);
              return;
            }
          }
        }
        const precheckResp = await fetch('/api/generate-invoice', {
          method: 'POST',
          headers: await authHeaders(),
          body: JSON.stringify({
            tutorId,
            periodStart,
            periodEnd,
            groupingType: 'single',
            isOrgTutor: true,
            precheckOnly: true,
          }),
        });
        const precheckJson = await precheckResp.json().catch(() => ({}));
        if ((!precheckResp.ok && !(schoolPayMode && precheckJson?.code === 'SCHOOL_TUTOR_PAY_UNRESOLVED')) || precheckJson?.reason === 'duplicate') {
          setError(
            (precheckJson.error as string) ||
              t('invoiceCreate.periodAlreadyIssued', { start: periodStart, end: periodEnd }),
          );
          setSessions([]);
          setPreviewMode(false);
          return;
        }

        const startIso = schoolPayMode ? schoolDate(periodStart).toISOString() : periodStart + 'T00:00:00';
        const endIso = schoolPayMode ? endOfDay(schoolDate(periodEnd)).toISOString() : periodEnd + 'T23:59:59';
        if (schoolPayMode && !schoolOrganizationId) throw new Error(t('common.error'));
        const sessionQuery = () => {
          const studentJoin = schoolPayMode ? 'students!inner(full_name, organization_id)' : 'students(full_name, email)';
          const query = supabase
            .from('sessions')
            .select(`id, tutor_id, student_id, class_group_id, start_time, end_time, status, subject_id, price, tutor_pay_eur_snapshot, is_complimentary, no_show_reason, status_confirmed_at, ${studentJoin}, subjects(name, is_trial, is_group), class_group:school_class_groups!sessions_class_group_id_fkey(name, calendar_name)`)
            .eq('tutor_id', tutorId)
            .gte('start_time', startIso)
            .lte('start_time', endIso)
            .lte('end_time', new Date().toISOString());
          return schoolPayMode ? query.eq('students.organization_id', schoolOrganizationId) : query.in('status', ['completed', 'no_show']);
        };
        const [{ data: prof, error: profErr }, { data: orgRow }, { data: sessRows, error: sessErr }, attendanceRows] = await Promise.all([
          supabase.from('profiles').select('organization_id, company_commission_percent, company_individual_commission_percent, company_commission_by_subject').eq('id', tutorId).maybeSingle(),
          supabase.from('organizations').select('default_company_commission_percent').eq('id', schoolOrganizationId || '').maybeSingle(),
          schoolPayMode
            ? fetchAllRows<any>((from, to) => sessionQuery().order('start_time').order('id').range(from, to))
              .then(data => ({ data, error: null }))
            : sessionQuery(),
          schoolPayMode ? fetchSchoolTutorAttendancePayRows({ tutorId, periodStart, periodEnd })
            .catch(() => { throw new Error(t('common.error')); }) : Promise.resolve([]),
        ]);

        if (sessErr) throw sessErr;
        if (schoolPayMode && (profErr || !prof)) throw profErr || new Error(t('common.error'));
        const orgId = (prof as any)?.organization_id as string | undefined;
        const tutorPayRate = resolveSchoolTutorGroupPayRate({
          tutorRate: (prof as { company_commission_percent?: number | null } | null)?.company_commission_percent,
          orgDefaultRate: (orgRow as { default_company_commission_percent?: number | null } | null)?.default_company_commission_percent,
          organizationId: orgId,
        }) ?? 0;
        const proKlasePay = isProKlaseOrg(orgId);
        const rows = schoolPayMode
          ? schoolTutorPayOccurrences([...(sessRows || []), ...attendanceRows] as any[], tutorPayRate, new Date(), {
            requireConfirmation: orgRequiresTutorStatusConfirmation(orgId, {
              tutor_lesson_status_confirmation: hasFeature('tutor_lesson_status_confirmation'),
            }),
            individualRate: (prof as { company_individual_commission_percent?: number | null } | null)
              ?.company_individual_commission_percent,
          }).map((occurrence) => ({
            ...occurrence.row,
            price: occurrence.payEur,
            _schoolMeeting: true,
            _schoolSessionIds: occurrence.sessionIds,
            _schoolAttendanceIds: occurrence.attendanceIds,
            _schoolPayIssue: occurrence.payIssue,
          }))
          : (sessRows || [])
          .filter((s: any) => !proKlasePay || Boolean(s.status_confirmed_at))
          .map((s: any) => ({
          ...s,
          price: proKlasePay
            ? proKlaseSessionPayEur(
                {
                  status: String(s.status || ''),
                  price: s.price,
                  is_complimentary: s.is_complimentary,
                  subjects: s.subjects,
                  status_confirmed_at: s.status_confirmed_at,
                },
                tutorPayRate,
              )
            : orgTutorSessionPayEur({
                organizationId: orgId,
                defaultRate: tutorPayRate,
                bySubject: (prof as any)?.company_commission_by_subject,
                subjectId: s.subject_id,
                sessionPrice: s.price,
                tutorPaySnapshot: s.tutor_pay_eur_snapshot,
              }),
        }));
        if (!rows.length) {
          setError(t('invoiceCreate.noSessions'));
          setSessions([]);
          setPreviewMode(false);
        } else {
          setSessions(rows as any[]);
          const unresolved = rows.filter((row: any) => row._schoolPayIssue).length;
          if (unresolved > 0) setError(t('orgFinance.schoolUnresolvedPay', { count: unresolved }));
          setPreviewMode(true);
        }
      } else if (pvmEducationInvoice) {
        const { data: sessRows, error: sessErr } = await supabase
          .from('sessions')
          .select('id, tutor_id, student_id, start_time, end_time, status, price, is_complimentary, students(full_name, email, payer_name, payer_email, grade), subjects(name)')
          .in('tutor_id', tutorIdsForQuery)
          .neq('status', 'cancelled')
          .gte('start_time', periodStart + 'T00:00:00')
          .lte('start_time', periodEnd + 'T23:59:59')
          .lte('end_time', new Date().toISOString());
        if (sessErr) throw sessErr;
        const delivered = (sessRows || []).filter((s: any) => s.is_complimentary !== true);
        const sessionIds = delivered.map((s: any) => s.id).filter(Boolean);
        let already = new Set<string>();
        if (sessionIds.length > 0) {
          const { data: adminRow } = await supabase
            .from('organization_admins')
            .select('organization_id')
            .eq('user_id', user.id)
            .maybeSingle();
          if (adminRow?.organization_id) {
            const { data: existingInv } = await supabase
              .from('invoices')
              .select('id')
              .eq('organization_id', adminRow.organization_id)
              .neq('status', 'cancelled');
            const invIds = (existingInv || []).map((r: { id: string }) => r.id);
            if (invIds.length > 0) {
              const { data: lis } = await supabase
                .from('invoice_line_items')
                .select('session_ids')
                .in('invoice_id', invIds);
              for (const li of lis || []) {
                const ids = Array.isArray((li as any).session_ids) ? (li as any).session_ids : [];
                for (const sid of ids) already.add(String(sid));
              }
            }
          }
        }
        const rows = delivered.filter((s: any) => !already.has(s.id));
        if (!rows.length) {
          setError(t('invoiceCreate.noSessions'));
          setSessions([]);
          setPreviewMode(false);
        } else {
          setSessions(rows as any[]);
          setPreviewMode(true);
        }
      } else {
        const { rows, error: prevErr } = await fetchPaidSalesInvoiceCandidates(supabase, {
          tutorIds: tutorIdsForQuery,
          periodStart,
          periodEnd,
          studentId,
          mode: 'stripe',
        });
        if (prevErr) throw prevErr;
        if (!rows.length) {
          setError(t('invoiceCreate.noPaidStripePeriod'));
          setSessions([]);
          setPreviewMode(false);
        } else {
          setSessions(rows as any[]);
          setPreviewMode(true);
        }
      }
    } catch (err: any) {
      setError(err.message || t('common.error'));
    } finally {
      setLoading(false);
    }
  };

  const handleGenerate = async () => {
    if (sessions.length === 0) return;
    if (schoolUnresolvedCount > 0) {
      setError(t('orgFinance.schoolUnresolvedPay', { count: schoolUnresolvedCount }));
      return;
    }
    if (!isOrgTutor && hasInvoiceProfile === false) {
      setError(t('invoices.orgProfileIncompleteError'));
      return;
    }

    setGenerating(true);
    setError(null);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error(t('invoice.userNotAuthorized'));

      const effectiveGrouping = isOrgTutor ? 'single' : groupingType;
      let totalCount = 0;
      const unrecoveredPdfIds: string[] = [];

      const groupedByTutor = sessions.reduce(
        (acc: Record<string, { sessionIds: string[]; attendanceIds: string[]; packageIds: string[] }>, row: any) => {
          const tid = row.tutor_id;
          if (!tid) return acc;
          if (!acc[tid]) acc[tid] = { sessionIds: [], attendanceIds: [], packageIds: [] };
          if (row.invoice_row_kind === 'package') acc[tid].packageIds.push(row.id);
          else {
            acc[tid].sessionIds.push(...(row._schoolSessionIds || [row.id]));
            acc[tid].attendanceIds.push(...(row._schoolAttendanceIds || []));
          }
          return acc;
        },
        {}
      );
      const tutorKeys = Object.keys(groupedByTutor);
      if (tutorKeys.length === 0) throw new Error(t('invoiceCreate.noSessions'));

      const groupingForApi = effectiveGrouping;

      if (pvmEducationInvoice && !isOrgTutor) {
        const sessionIds = sessions
          .filter((row: any) => row.invoice_row_kind !== 'package')
          .map((row: any) => row.id)
          .filter(Boolean);
        const packageIds = sessions
          .filter((row: any) => row.invoice_row_kind === 'package')
          .map((row: any) => row.package_id || row.id)
          .filter(Boolean);
        const tutorId = sessions[0]?.tutor_id || user.id;
        const res = await fetch('/api/generate-invoice', {
          method: 'POST',
          headers: await authHeaders(),
          body: JSON.stringify({
            periodStart,
            periodEnd,
            groupingType: 'single',
            studentId: studentId || undefined,
            tutorId,
            isOrgTutor: false,
            onlyPaid: false,
            sessionIds: sessionIds.length > 0 ? sessionIds : undefined,
            packageIds: packageIds.length > 0 ? packageIds : undefined,
          }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(invoiceApiErrorMessage(json, t));
        totalCount += json.count || 0;
      } else {
      for (const tid of tutorKeys) {
        const { sessionIds, attendanceIds, packageIds } = groupedByTutor[tid];
        if (sessionIds.length === 0 && attendanceIds.length === 0 && packageIds.length === 0) continue;

        const res = await fetch('/api/generate-invoice', {
          method: 'POST',
          headers: await authHeaders(),
          body: JSON.stringify({
            periodStart,
            periodEnd,
            groupingType: groupingForApi,
            studentId: studentId || undefined,
            tutorId: tid,
            isOrgTutor: isOrgTutor || false,
            onlyPaid: true,
            sessionIds: sessionIds.length > 0 ? sessionIds : undefined,
            attendanceIds: attendanceIds.length > 0 ? attendanceIds : undefined,
            packageIds: packageIds.length > 0 ? packageIds : undefined,
          }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(invoiceApiErrorMessage(json, t));
        totalCount += json.count || 0;
        for (const invoiceId of (json.pdfGenerationFailedIds || []) as string[]) {
          try {
            const pdfResponse = await fetch(`/api/invoice-pdf?id=${encodeURIComponent(invoiceId)}`, {
              headers: await authHeaders(),
            });
            if (!pdfResponse.ok) unrecoveredPdfIds.push(invoiceId);
          } catch {
            unrecoveredPdfIds.push(invoiceId);
          }
        }
      }
      }
      if (totalCount === 0) throw new Error(t('invoiceCreate.noSessions'));

      onSuccess?.();
      onClose();
      alert(unrecoveredPdfIds.length > 0
        ? `Sąskaita sukurta, bet nepavyko paruošti PDF (${unrecoveredPdfIds.join(', ')}). Atidarykite ją sąskaitų sąraše prieš siųsdami; naujos sąskaitos nekūrkite.`
        : t('invoiceCreate.success', { count: String(totalCount || 1) }));
    } catch (err: any) {
      setError(err.message || t('common.error'));
    } finally {
      setGenerating(false);
    }
  };

  const totalAmount = sessions.reduce((sum, s) => sum + (s.price || 0), 0);
  const schoolUnresolvedCount = sessions.filter(row => row._schoolPayIssue).length;
  const schoolKnownCount = sessions.filter(row => row._schoolMeeting && row.price !== null).length;

  const buyerInfo = useMemo(() => {
    if (isOrgTutor && orgBuyerInfo) return orgBuyerInfo;
    if (sessions.length === 0) return null;
    const first = sessions[0];
    const student = first.students as any;
    if (!student) return null;
    return {
      name: student.payer_name || student.full_name || '-',
      email: student.payer_email || student.email || '-',
    };
  }, [sessions, isOrgTutor, orgBuyerInfo]);

  const groupingOptions: { type: GroupingType; icon: typeof Receipt; label: string; desc: string }[] = [
    {
      type: 'per_payment',
      icon: Receipt,
      label: t('invoiceCreate.perPayment'),
      desc: t('invoiceCreate.perPaymentDesc'),
    },
    {
      type: 'per_week',
      icon: CalendarDays,
      label: t('invoiceCreate.perWeek'),
      desc: t('invoiceCreate.perWeekDesc'),
    },
    {
      type: 'single',
      icon: FileStack,
      label: t('invoiceCreate.single'),
      desc: t('invoiceCreate.singleDesc'),
    },
  ];

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto sm:max-w-2xl w-[95vw] sm:w-full">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-indigo-600" />
            {isOrgTutor
              ? billingTutorId && orgTutors?.find((tu) => tu.id === billingTutorId)
                ? t('invoiceCreate.titleOrgTutorFor', {
                    name: orgTutors.find((tu) => tu.id === billingTutorId)!.full_name,
                  })
                : t('invoiceCreate.titleOrgTutor')
              : studentName
                ? t('invoiceCreate.titleForStudent', { name: studentName })
                : t('invoiceCreate.title')}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {hasInvoiceProfile === false && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
              <p className="text-sm text-amber-900 font-medium">
                {isOrgTutor ? t('invoiceCreate.noProfile') : t('invoices.orgProfileIncomplete')}
              </p>
              <p className="text-xs text-amber-700 mt-1">
                {isOrgTutor ? t('invoiceCreate.noProfileHint') : t('invoices.orgProfileIncompleteError')}
              </p>
            </div>
          )}

          {!previewMode ? (
            <>
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                <p className="text-sm text-blue-900">
                  {isOrgTutor
                    ? billingTutorId
                      ? t('invoiceCreate.orgAdminTutorInfo')
                      : t('invoiceCreate.orgTutorInfo')
                    : orgTutors && orgTutors.length > 0
                      ? t('invoiceCreate.orgAdminInfo')
                      : t('invoiceCreate.selectPeriodInfo')}
                </p>
                {schoolPayMode && <p className="text-xs text-blue-800 mt-2">{t('orgFinance.schoolPayPriceIndependence')}</p>}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-sm font-semibold text-gray-700 flex items-center gap-1">
                    <Calendar className="w-4 h-4" />
                    {t('invoice.fromDate')}
                  </Label>
                  <DateInput
                    value={periodStart}
                    onChange={(e) => setPeriodStart(e.target.value)}
                    className="mt-1 rounded-lg"
                  />
                </div>
                <div>
                  <Label className="text-sm font-semibold text-gray-700 flex items-center gap-1">
                    <Calendar className="w-4 h-4" />
                    {t('invoice.toDate')}
                  </Label>
                  <DateInput
                    value={periodEnd}
                    onChange={(e) => setPeriodEnd(e.target.value)}
                    className="mt-1 rounded-lg"
                  />
                </div>
              </div>

              {!isOrgTutor && (
                <div>
                  <Label className="text-sm font-semibold text-gray-700 mb-2 block">
                    {t('invoiceCreate.groupingType')}
                  </Label>
                  <div className="space-y-2">
                    {groupingOptions.map((opt) => {
                      const Icon = opt.icon;
                      return (
                        <button
                          key={opt.type}
                          type="button"
                          onClick={() => setGroupingType(opt.type)}
                          className={cn(
                            'w-full flex items-start gap-3 p-3 rounded-xl border-2 text-left transition-all',
                            groupingType === opt.type
                              ? 'border-indigo-500 bg-indigo-50'
                              : 'border-gray-200 hover:border-indigo-200'
                          )}
                        >
                          <Icon className="w-5 h-5 text-indigo-600 flex-shrink-0 mt-0.5" />
                          <div>
                            <p className="text-sm font-semibold text-gray-900">{opt.label}</p>
                            <p className="text-xs text-gray-600">{opt.desc}</p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {error && (
                <div role="alert" className="bg-red-50 border border-red-200 rounded-xl p-3">
                  <p className="text-sm text-red-700">{error}</p>
                </div>
              )}
              {isOrgTutor && orgFeaturesError && <p role="alert" className="text-sm text-red-700">{t('common.error')}</p>}

              <div className="flex gap-2">
                <Button variant="outline" onClick={onClose} disabled={loading} className="flex-1 rounded-lg">
                  {t('common.cancel')}
                </Button>
                <Button
                  onClick={handlePreview}
                  disabled={loading || !periodStart || !periodEnd || hasInvoiceProfile === false || (isOrgTutor && (orgFeaturesLoading || orgFeaturesError))}
                  className="flex-1 rounded-lg bg-indigo-600 hover:bg-indigo-700"
                >
                  {loading ? (
                    <><Loader2 className="w-4 h-4 animate-spin mr-2" />{t('common.searching')}</>
                  ) : (
                    t('invoiceCreate.preview')
                  )}
                </Button>
              </div>
            </>
          ) : (
            <>
              <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-sm font-semibold text-indigo-900">
                      {format(new Date(periodStart), 'yyyy-MM-dd')} – {format(new Date(periodEnd), 'yyyy-MM-dd')}
                    </p>
                    <p className="text-xs text-indigo-700 mt-1">
                      {t('invoiceCreate.sessionsCount', { count: sessions.length })} |{' '}
                      {schoolUnresolvedCount > 0 ? t('orgFinance.schoolKnownPayTotal') : t('common.total')}: {schoolUnresolvedCount > 0 && schoolKnownCount === 0 ? t('orgFinance.schoolPayPending') : `€${totalAmount.toFixed(2)}`}
                    </p>
                    {!isOrgTutor && (
                      <p className="text-xs text-indigo-600 mt-1">
                        {t('invoiceCreate.groupingLabel')}: {t(`invoiceCreate.${groupingType}`)}
                      </p>
                    )}
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => setPreviewMode(false)} className="text-xs">
                    {'\u2190'} {t('common.back')}
                  </Button>
                </div>
              </div>

              {(sellerInfo || buyerInfo) && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {sellerInfo && (
                    <div className="bg-gray-50 border border-gray-200 rounded-xl p-3">
                      <p className="text-xs font-semibold text-gray-500 flex items-center gap-1 mb-1">
                        <Building2 className="w-3.5 h-3.5" />
                        {t('invoiceCreate.seller')}
                      </p>
                      {(() => {
                        const isCompany =
                          !!sellerInfo.entity_type && COMPANY_SELLER_ENTITIES.has(sellerInfo.entity_type);
                        const tutorNameLine = sellerInfo._previewSellerFullName?.trim() || '';
                        const bizLine = sellerInfo.business_name?.trim() || '';
                        const primary = isCompany
                          ? bizLine || tutorNameLine || sellerInfo.company_code?.trim() || '-'
                          : tutorNameLine ||
                            bizLine ||
                            sellerInfo.activity_number?.trim() ||
                            '-';

                        return (
                          <>
                            <p className="text-sm font-medium text-gray-900">{primary}</p>
                            {sellerInfo.entity_type && (
                              <p className="text-xs text-gray-500 mb-1">
                                {t(`invoiceSettings.entityType_${sellerInfo.entity_type}`)}
                              </p>
                            )}
                            {isCompany ? (
                              <>
                                {sellerInfo.company_code?.trim() && (
                                  <p className="text-xs text-gray-600">{sellerInfo.company_code}</p>
                                )}
                                {sellerInfo.vat_code?.trim() && (
                                  <p className="text-xs text-gray-600">{sellerInfo.vat_code}</p>
                                )}
                                {sellerInfo.address?.trim() && (
                                  <p className="text-xs text-gray-600">{sellerInfo.address}</p>
                                )}
                              </>
                            ) : (
                              <>
                                {sellerInfo.activity_number?.trim() &&
                                  sellerInfo.activity_number.trim() !== primary.trim() && (
                                    <p className="text-xs text-gray-600">
                                      {t('invoiceSettings.activityNumber')}: {sellerInfo.activity_number}
                                    </p>
                                  )}
                                {sellerInfo.personal_code?.trim() && (
                                  <p className="text-xs text-gray-600">
                                    {t('invoiceSettings.personalCode')}: {sellerInfo.personal_code}
                                  </p>
                                )}
                                {sellerInfo.contact_email?.trim() && (
                                  <p className="text-xs text-gray-600">{sellerInfo.contact_email}</p>
                                )}
                                {sellerInfo.contact_phone?.trim() && (
                                  <p className="text-xs text-gray-600">{sellerInfo.contact_phone}</p>
                                )}
                              </>
                            )}
                          </>
                        );
                      })()}
                    </div>
                  )}
                  {buyerInfo && (
                    <div className="bg-gray-50 border border-gray-200 rounded-xl p-3">
                      <p className="text-xs font-semibold text-gray-500 flex items-center gap-1 mb-1">
                        <User className="w-3.5 h-3.5" />
                        {t('invoiceCreate.buyer')}
                      </p>
                      <p className="text-sm font-medium text-gray-900">{buyerInfo.name}</p>
                      <p className="text-xs text-gray-600">{buyerInfo.email}</p>
                    </div>
                  )}
                </div>
              )}

              <div className="space-y-2 max-h-[300px] overflow-y-auto">
                {sessions.map((session) => {
                  const student = session.students as any;
                  const subject = session.subjects as any;
                  const sessionDate = new Date(session.start_time);
                  const isPkg = session.invoice_row_kind === 'package';
                  const tutorLabel =
                    orgTutors && orgTutors.length > 1
                      ? orgTutors.find(tu => tu.id === session.tutor_id)?.full_name
                      : null;
                  const lineTitle = isPkg
                    ? `${t('invoice.packageRowLabel')}${subject?.name ? ` · ${subject.name}` : ''}${session.total_lessons != null ? ` (${session.total_lessons})` : ''}`
                    : subject?.name || '-';
                  return (
                    <div key={session.id} className="flex justify-between items-center p-3 bg-white border border-gray-200 rounded-lg text-sm">
                      <div className="min-w-0">
                        {tutorLabel && (
                          <p className="text-xs text-indigo-600 font-medium truncate">{tutorLabel}</p>
                        )}
                        <span className="font-medium text-gray-900">{session._schoolMeeting && (session.class_group_id || subject?.is_group)
                          ? session.class_group?.calendar_name || session.class_group?.name || t('cal.groupLesson')
                          : student?.full_name || '-'}</span>
                        <span className="text-gray-500 ml-2">{lineTitle}</span>
                        <span className="text-gray-400 ml-2 text-xs">
                          {format(sessionDate, 'yyyy-MM-dd')}
                          {!isPkg ? ` ${format(sessionDate, 'HH:mm')}` : ''}
                        </span>
                      </div>
                      <span className="font-semibold text-indigo-600 shrink-0 ml-2">
                        {session._schoolPayIssue ? t('orgFinance.schoolPayPending') : `€${Number(session.price || 0).toFixed(2)}`}
                      </span>
                    </div>
                  );
                })}
              </div>

              {error && (
                <div role="alert" className="bg-red-50 border border-red-200 rounded-xl p-3">
                  <p className="text-sm text-red-700">{error}</p>
                  {schoolUnresolvedCount > 0 && <p className="text-xs text-red-700 mt-1">{t('orgFinance.schoolRateSettingsHint')}</p>}
                </div>
              )}

              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setPreviewMode(false)} disabled={generating} className="flex-1 rounded-lg">
                  {t('common.back')}
                </Button>
                <Button
                  onClick={handleGenerate}
                  disabled={generating || schoolUnresolvedCount > 0}
                  className="flex-1 rounded-lg bg-indigo-600 hover:bg-indigo-700"
                >
                  {generating ? (
                    <><Loader2 className="w-4 h-4 animate-spin mr-2" />{t('invoiceCreate.generating')}</>
                  ) : (
                    t('invoiceCreate.generate')
                  )}
                </Button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
