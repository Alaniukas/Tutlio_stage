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
import { format, subDays } from 'date-fns';
import { cn } from '@/lib/utils';
import { fetchPaidSalesInvoiceCandidates } from '@/lib/manualSalesInvoicePreview';

type GroupingType = 'per_payment' | 'per_week' | 'single';

interface SellerInfo {
  business_name?: string;
  company_code?: string;
  vat_code?: string;
  address?: string;
  contact_email?: string;
  entity_type?: string;
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
  }, [isOpen]);

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
      const [userRes, orgRes] = await Promise.all([
        fetch('/api/invoice-settings?scope=user', { headers }),
        !isOrgTutor ? fetch('/api/invoice-settings?scope=organization', { headers }) : Promise.resolve(null),
      ]);
      const userJson = await userRes.json();
      const orgJson = orgRes ? await orgRes.json() : null;
      const profileData = orgJson?.data || userJson.data;
      setHasInvoiceProfile(!!profileData);
      if (profileData) setSellerInfo(profileData);
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
        // Org tutor → invoice to organization: show occurred lessons (not student/payer sales invoices).
        const tutorId = tutorIdsForQuery[0];
        if (!tutorId) throw new Error(t('invoiceCreate.noSessions'));

        const [{ data: prof }, { data: sessRows, error: sessErr }] = await Promise.all([
          supabase.from('profiles').select('company_commission_percent').eq('id', tutorId).maybeSingle(),
          supabase
            .from('sessions')
            .select('id, tutor_id, start_time, end_time, status, subject_id, students(full_name, email), subjects(name)')
            .eq('tutor_id', tutorId)
            .neq('status', 'cancelled')
            .neq('status', 'no_show')
            .gte('start_time', periodStart + 'T00:00:00')
            .lte('start_time', periodEnd + 'T23:59:59')
            .lte('end_time', new Date().toISOString()),
        ]);

        if (sessErr) throw sessErr;
        const rate = Number((prof as any)?.company_commission_percent) || 0;
        const rows = (sessRows || []).map((s: any) => ({ ...s, price: rate }));
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

    setGenerating(true);
    setError(null);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error(t('invoice.userNotAuthorized'));

      const effectiveGrouping = isOrgTutor ? 'single' : groupingType;
      let totalCount = 0;

      const groupedByTutor = sessions.reduce(
        (acc: Record<string, { sessionIds: string[]; packageIds: string[] }>, row: any) => {
          const tid = row.tutor_id;
          if (!tid) return acc;
          if (!acc[tid]) acc[tid] = { sessionIds: [], packageIds: [] };
          if (row.invoice_row_kind === 'package') acc[tid].packageIds.push(row.id);
          else acc[tid].sessionIds.push(row.id);
          return acc;
        },
        {}
      );
      const tutorKeys = Object.keys(groupedByTutor);
      if (tutorKeys.length === 0) throw new Error(t('invoiceCreate.noSessions'));

      const groupingForApi = effectiveGrouping;

      for (const tid of tutorKeys) {
        const { sessionIds, packageIds } = groupedByTutor[tid];
        if (sessionIds.length === 0 && packageIds.length === 0) continue;

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
            packageIds: packageIds.length > 0 ? packageIds : undefined,
          }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || t('common.error'));
        totalCount += json.count || 0;
      }
      if (totalCount === 0) throw new Error(t('invoiceCreate.noSessions'));

      onSuccess?.();
      onClose();
      alert(t('invoiceCreate.success', { count: String(totalCount || 1) }));
    } catch (err: any) {
      setError(err.message || t('common.error'));
    } finally {
      setGenerating(false);
    }
  };

  const totalAmount = sessions.reduce((sum, s) => sum + (s.price || 0), 0);

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
              ? t('invoiceCreate.titleOrgTutor')
              : studentName
                ? t('invoiceCreate.titleForStudent', { name: studentName })
                : t('invoiceCreate.title')}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {hasInvoiceProfile === false && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
              <p className="text-sm text-amber-900 font-medium">{t('invoiceCreate.noProfile')}</p>
              <p className="text-xs text-amber-700 mt-1">{t('invoiceCreate.noProfileHint')}</p>
            </div>
          )}

          {!previewMode ? (
            <>
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                <p className="text-sm text-blue-900">
                  {isOrgTutor
                    ? t('invoiceCreate.orgTutorInfo')
                      : orgTutors && orgTutors.length > 0
                        ? t('invoiceCreate.orgAdminInfo')
                        : t('invoiceCreate.selectPeriodInfo')}
                </p>
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
                <div className="bg-red-50 border border-red-200 rounded-xl p-3">
                  <p className="text-sm text-red-700">{error}</p>
                </div>
              )}

              <div className="flex gap-2">
                <Button variant="outline" onClick={onClose} disabled={loading} className="flex-1 rounded-lg">
                  {t('common.cancel')}
                </Button>
                <Button
                  onClick={handlePreview}
                  disabled={loading || !periodStart || !periodEnd || hasInvoiceProfile === false}
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
                      {t('common.total')}: {'\u20AC'}{totalAmount.toFixed(2)}
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
                      <p className="text-sm font-medium text-gray-900">{sellerInfo.business_name || '-'}</p>
                      {sellerInfo.company_code && <p className="text-xs text-gray-600">{sellerInfo.company_code}</p>}
                      {sellerInfo.vat_code && <p className="text-xs text-gray-600">{sellerInfo.vat_code}</p>}
                      {sellerInfo.address && <p className="text-xs text-gray-600">{sellerInfo.address}</p>}
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
                        <span className="font-medium text-gray-900">{student?.full_name || '-'}</span>
                        <span className="text-gray-500 ml-2">{lineTitle}</span>
                        <span className="text-gray-400 ml-2 text-xs">
                          {format(sessionDate, 'yyyy-MM-dd')}
                          {!isPkg ? ` ${format(sessionDate, 'HH:mm')}` : ''}
                        </span>
                      </div>
                      <span className="font-semibold text-indigo-600 shrink-0 ml-2">
                        {'\u20AC'}{Number(session.price || 0).toFixed(2)}
                      </span>
                    </div>
                  );
                })}
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-3">
                  <p className="text-sm text-red-700">{error}</p>
                </div>
              )}

              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setPreviewMode(false)} disabled={generating} className="flex-1 rounded-lg">
                  {t('common.back')}
                </Button>
                <Button
                  onClick={handleGenerate}
                  disabled={generating}
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
