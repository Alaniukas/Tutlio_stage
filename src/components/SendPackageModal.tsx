import { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/lib/supabase';
import { authHeaders } from '@/lib/apiHelpers';
import { Checkbox } from '@/components/ui/checkbox';
import { CircleHelp, Loader2, Package } from 'lucide-react';
import { useTranslation } from '@/lib/i18n';
import { tutorUsesManualStudentPayments } from '@/lib/subscription';
import PackageItemsEditor, { type PackageEditorItem, type PackageEditorSubject } from '@/components/PackageItemsEditor';

interface SendPackageModalProps {
  isOpen: boolean;
  onClose: () => void;
  studentId: string;
  studentName: string;
  studentEmail: string;
  onSuccess?: () => void;
  tutorId?: string;
}

const STRIPE_FEE_PERCENT = 0.015;
const STRIPE_FEE_FIXED_EUR = 0.25;
const PLATFORM_FEE_PERCENT = 0.02;

function calcTotalWithFees(basePriceEur: number): number {
  const platformFee = basePriceEur * PLATFORM_FEE_PERCENT;
  return (basePriceEur + platformFee + STRIPE_FEE_FIXED_EUR) / (1 - STRIPE_FEE_PERCENT);
}

const formatEur = (value: number) =>
  new Intl.NumberFormat('lt-LT', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);

export default function SendPackageModal({
  isOpen,
  onClose,
  studentId,
  studentName,
  studentEmail,
  onSuccess,
  tutorId: propTutorId,
}: SendPackageModalProps) {
  const { t } = useTranslation();

  const [subjects, setSubjects] = useState<PackageEditorSubject[]>([]);
  const [individualPricing, setIndividualPricing] = useState<Record<string, number>>({});
  const [items, setItems] = useState<PackageEditorItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingSubjects, setLoadingSubjects] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isManual, setIsManual] = useState(false);
  const [canUseManual, setCanUseManual] = useState(false);
  const [isForceManualOnly, setIsForceManualOnly] = useState(false);
  const [expiresAt, setExpiresAt] = useState('');
  const [attachSalesInvoice, setAttachSalesInvoice] = useState(true);

  useEffect(() => {
    if (isOpen) {
      setAttachSalesInvoice(true);
      void fetchSubjects();
    }
  }, [isOpen]);

  // Seed one row when subjects load (so the form is usable immediately)
  useEffect(() => {
    if (subjects.length > 0 && items.length === 0) {
      const first = subjects[0]!;
      const price = individualPricing[first.id] ?? Number(first.price ?? 0);
      setItems([{ subjectId: first.id, totalLessons: 5, pricePerLesson: price }]);
    }
  }, [subjects, individualPricing]);

  const totals = useMemo(() => {
    const totalLessons = items.reduce((acc, it) => acc + (Number(it.totalLessons) || 0), 0);
    const basePriceEur = items.reduce(
      (acc, it) => acc + (Number(it.totalLessons) || 0) * (Number(it.pricePerLesson) || 0),
      0,
    );
    return {
      totalLessons,
      basePriceEur,
      totalWithFees: calcTotalWithFees(basePriceEur),
    };
  }, [items]);

  const fetchSubjects = async () => {
    setLoadingSubjects(true);
    setItems([]);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const effectiveTutorId = propTutorId || user.id;

    {
      const { data: profile } = await supabase
        .from('profiles')
        .select('organization_id, subscription_plan, manual_subscription_exempt, enable_manual_student_payments')
        .eq('id', effectiveTutorId)
        .single();
      const manualEnabled = tutorUsesManualStudentPayments(profile);
      setCanUseManual(manualEnabled);
      const forceManual = !profile?.organization_id && (
        profile?.subscription_plan === 'subscription_only' ||
        profile?.manual_subscription_exempt === true
      );
      setIsForceManualOnly(forceManual);
      if (forceManual) setIsManual(true);
      else if (!manualEnabled) setIsManual(false);
    }

    const [subjectsResult, pricingResult] = await Promise.all([
      supabase.from('subjects').select('id, name, price, color').eq('tutor_id', effectiveTutorId).order('name'),
      supabase.from('student_individual_pricing').select('subject_id, price').eq('student_id', studentId).eq('tutor_id', effectiveTutorId),
    ]);

    if (subjectsResult.error) {
      console.error('Error fetching subjects:', subjectsResult.error);
      setError(t('package.failedToLoad'));
    } else {
      setSubjects(subjectsResult.data || []);
      const pricingMap: Record<string, number> = {};
      (pricingResult.data || []).forEach((p: any) => { pricingMap[p.subject_id] = p.price; });
      setIndividualPricing(pricingMap);
    }
    setLoadingSubjects(false);
  };

  const validate = (): string | null => {
    if (items.length === 0) return t('package.atLeastOneSubject');
    const ids = new Set<string>();
    for (const it of items) {
      if (!it.subjectId) return t('package.atLeastOneSubject');
      if (ids.has(it.subjectId)) return t('package.duplicateSubject');
      ids.add(it.subjectId);
      if (!it.totalLessons || it.totalLessons <= 0) return t('package.fillAllFields');
    }
    if (totals.totalLessons > 100) return t('package.maxLessonsExceeded');
    return null;
  };

  const handleSendPackage = async () => {
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }
    setLoading(true);
    setError(null);

    const controller = new AbortController();
    const timeoutMs = 60000;
    let timeoutId: number | undefined;

    try {
      timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error(t('invoice.userNotAuthorized'));

      const endpoint = isManual ? '/api/create-manual-package' : '/api/create-package-checkout';
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: await authHeaders(),
        body: JSON.stringify({
          tutorId: propTutorId || user.id,
          studentId,
          items: items.map((it) => ({
            subjectId: it.subjectId,
            totalLessons: it.totalLessons,
            pricePerLesson: it.pricePerLesson,
          })),
          ...(expiresAt ? { expiresAt } : {}),
          attachSalesInvoice,
        }),
        signal: controller.signal,
      });

      const raw = await response.text();
      const result = raw ? (() => { try { return JSON.parse(raw); } catch { return null; } })() : null;

      if (!response.ok) {
        const msg =
          (result && typeof result === 'object' && 'error' in result && (result as any).error) ||
          (result && typeof result === 'object' && 'details' in result && (result as any).details) ||
          raw ||
          t('package.failedToCreate');
        throw new Error(String(msg));
      }

      if (timeoutId !== undefined) {
        window.clearTimeout(timeoutId);
        timeoutId = undefined;
      }
      setLoading(false);
      onSuccess?.();
      onClose();

      const msg = isManual
        ? t('package.createdManual')
        : t('package.sentSuccess', { name: studentName });
      queueMicrotask(() => alert(msg));
    } catch (err: any) {
      console.error('Error sending package:', err);
      if (err?.name === 'AbortError') {
        setError(t('package.requestTimeout'));
      } else {
        setError(err.message || t('invoice.errorOccurred'));
      }
    } finally {
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
      setLoading(false);
    }
  };

  const disableSend = loading || items.length === 0 || items.some((it) => !it.subjectId || it.totalLessons <= 0);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="w-[95vw] max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="w-5 h-5 text-violet-600" />
            {t('package.sendPackage')}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4">
            <p className="text-sm text-indigo-900"><strong>{t('package.studentLabel')}</strong> {studentName}</p>
            <p className="text-xs text-indigo-700 mt-1">{studentEmail}</p>
          </div>

          {loadingSubjects ? (
            <div className="text-center py-4"><Loader2 className="w-6 h-6 animate-spin mx-auto text-gray-400" /></div>
          ) : (
            <>
              <PackageItemsEditor
                subjects={subjects}
                individualPricing={individualPricing}
                items={items}
                onChange={setItems}
                disabled={loading}
              />

              {canUseManual && (
                <div>
                  <Label className="text-sm font-semibold text-gray-700">{t('package.paymentMethod')}</Label>
                  <div className="flex mt-1 rounded-lg border border-gray-200 overflow-hidden">
                    <button
                      type="button"
                      className={`flex-1 py-2 text-sm font-medium transition-colors ${!isManual ? 'bg-violet-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'} ${isForceManualOnly ? 'opacity-50 cursor-not-allowed' : ''}`}
                      onClick={() => setIsManual(false)}
                      disabled={isForceManualOnly}
                    >
                      Stripe
                    </button>
                    <button
                      type="button"
                      className={`flex-1 py-2 text-sm font-medium transition-colors ${isManual ? 'bg-violet-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                      onClick={() => setIsManual(true)}
                    >
                      {t('package.manualPaymentLabel')}
                    </button>
                  </div>
                  {isForceManualOnly && (
                    <p className="text-xs text-amber-700 mt-2">{t('pricing.subscriptionOnlyDesc')}</p>
                  )}
                </div>
              )}

              <div>
                <Label className="text-sm font-semibold text-gray-700">{t('package.validUntil')}</Label>
                <Input
                  type="date"
                  value={expiresAt}
                  onChange={(e) => setExpiresAt(e.target.value)}
                  min={new Date().toISOString().split('T')[0]}
                  className="mt-1 rounded-lg"
                />
                <p className="text-xs text-gray-500 mt-1">{t('package.validUntilHint')}</p>
              </div>

              {isManual ? (
                <div className="bg-violet-50 border border-violet-200 rounded-xl p-4">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm font-semibold text-violet-900">{t('package.totalToPay')}</span>
                    <span className="text-2xl font-bold text-violet-700 tracking-tight">{formatEur(totals.basePriceEur)}</span>
                  </div>
                  <p className="text-xs text-violet-600">
                    {t('package.totalAcrossSubjects')}: {totals.totalLessons}
                  </p>
                </div>
              ) : (
                <div className="bg-violet-50 border border-violet-200 rounded-xl p-4">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm font-semibold text-violet-900 flex items-center gap-1.5">
                      {t('package.totalToPay')}
                      <span className="relative inline-flex items-center group">
                        <CircleHelp className="w-3.5 h-3.5 text-violet-500 cursor-help" />
                        <span className="hidden group-hover:block pointer-events-none absolute left-1/2 top-full z-20 mt-2 w-64 -translate-x-1/2 rounded-lg border border-violet-200 bg-white p-2.5 text-xs font-medium text-gray-700 opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
                          {t('package.tooltipTutor', { amount: formatEur(totals.basePriceEur) })}<br />
                          {t('package.tooltipPlatform', { amount: formatEur(totals.basePriceEur * PLATFORM_FEE_PERCENT) })}<br />
                          {t('package.tooltipStripe', { amount: formatEur(totals.totalWithFees - totals.basePriceEur - (totals.basePriceEur * PLATFORM_FEE_PERCENT)) })}
                        </span>
                      </span>
                    </span>
                    <span className="text-2xl font-bold text-violet-700 tracking-tight">{formatEur(totals.totalWithFees)}</span>
                  </div>
                  <p className="text-xs text-violet-600">
                    {t('package.totalAcrossSubjects')}: {totals.totalLessons}{' '}
                    <span className="text-violet-500">{t('package.includingFeesNote')}</span>
                  </p>
                </div>
              )}

              <label className="flex items-start gap-3 cursor-pointer rounded-xl border border-violet-100 bg-white/80 px-3 py-2.5">
                <Checkbox
                  className="mt-0.5"
                  checked={attachSalesInvoice}
                  onChange={(e) => setAttachSalesInvoice(e.target.checked)}
                />
                <span className="text-sm text-gray-800">
                  <span className="font-medium">{t('invoices.includeSfInEmail')}</span>
                  <span className="block text-xs text-gray-500 mt-0.5">{t('invoices.includeSfInEmailHint')}</span>
                </span>
              </label>

              {error && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-3">
                  <p className="text-sm text-red-700">{error}</p>
                </div>
              )}

              <div className="flex gap-2">
                <Button variant="outline" onClick={onClose} disabled={loading} className="flex-1 rounded-lg">{t('common.cancel')}</Button>
                <Button onClick={handleSendPackage} disabled={disableSend} className="flex-1 rounded-lg bg-violet-600 hover:bg-violet-700">
                  {loading ? (<><Loader2 className="w-4 h-4 animate-spin mr-2" />{t('common.sending')}</>) : t('package.sendOffer')}
                </Button>
              </div>

              {isManual ? (
                <p className="text-xs text-amber-600 text-center bg-amber-50 border border-amber-200 rounded-lg py-2 px-3">{t('package.manualPayment')}</p>
              ) : (
                <p className="text-xs text-gray-500 text-center">{t('package.emailNote')}</p>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
