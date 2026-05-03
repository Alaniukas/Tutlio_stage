import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/lib/supabase';
import { authHeaders } from '@/lib/apiHelpers';
import { Checkbox } from '@/components/ui/checkbox';
import { CircleHelp, Loader2, Package } from 'lucide-react';
import { useTranslation } from '@/lib/i18n';
import { soloTutorUsesManualStudentPayments } from '@/lib/subscription';

interface SendPackageModalProps {
  isOpen: boolean;
  onClose: () => void;
  studentId: string;
  studentName: string;
  studentEmail: string;
  onSuccess?: () => void;
  tutorId?: string;
}

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
  const STRIPE_FEE_PERCENT = 0.015;
  const STRIPE_FEE_FIXED_EUR = 0.25;
  const PLATFORM_FEE_PERCENT = 0.02;

  const formatEur = (value: number) =>
    new Intl.NumberFormat('lt-LT', {
      style: 'currency',
      currency: 'EUR',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);

  const calcTotalWithFees = (baseLessonPrice: number, lessonCount: number) => {
    const baseTotal = baseLessonPrice * lessonCount;
    const platformFee = baseTotal * PLATFORM_FEE_PERCENT;
    return (baseTotal + platformFee + STRIPE_FEE_FIXED_EUR) / (1 - STRIPE_FEE_PERCENT);
  };

  const [subjects, setSubjects] = useState<any[]>([]);
  const [individualPricing, setIndividualPricing] = useState<Record<string, number>>({});
  const [selectedSubjectId, setSelectedSubjectId] = useState('');
  const [totalLessons, setTotalLessons] = useState<number>(5);
  const [pricePerLesson, setPricePerLesson] = useState<number>(0);
  const [baseTotalPrice, setBaseTotalPrice] = useState<number>(0);
  const [totalPriceWithFees, setTotalPriceWithFees] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [loadingSubjects, setLoadingSubjects] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isManual, setIsManual] = useState(false);
  const [isIndividualTutor, setIsIndividualTutor] = useState(false);
  const [isManualOnlyPlan, setIsManualOnlyPlan] = useState(false);
  const [expiresAt, setExpiresAt] = useState('');
  /** Stripe: attach S.F. PDF to payment email (default on) */
  const [attachSalesInvoice, setAttachSalesInvoice] = useState(true);

  useEffect(() => {
    if (isOpen) {
      setAttachSalesInvoice(true);
      void fetchSubjects();
    }
  }, [isOpen]);

  useEffect(() => {
    if (subjects.length > 0 && !selectedSubjectId) {
      const firstSubject = subjects[0];
      setSelectedSubjectId(firstSubject.id);
      setPricePerLesson(firstSubject.price);
    }
  }, [subjects]);

  useEffect(() => {
    if (selectedSubjectId) {
      const subject = subjects.find(s => s.id === selectedSubjectId);
      if (subject) {
        const customPrice = individualPricing[selectedSubjectId];
        setPricePerLesson(customPrice !== undefined ? customPrice : subject.price);
      }
    }
  }, [selectedSubjectId, subjects, individualPricing]);

  useEffect(() => {
    const baseTotal = pricePerLesson * totalLessons;
    setBaseTotalPrice(baseTotal);
    setTotalPriceWithFees(calcTotalWithFees(pricePerLesson, totalLessons));
  }, [pricePerLesson, totalLessons]);

  const fetchSubjects = async () => {
    setLoadingSubjects(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const effectiveTutorId = propTutorId || user.id;

    {
      const { data: profile } = await supabase
        .from('profiles')
        .select('organization_id, subscription_plan, manual_subscription_exempt, enable_manual_student_payments')
        .eq('id', effectiveTutorId)
        .single();
      const individual = !profile?.organization_id;
      setIsIndividualTutor(individual);
      const manualOnly = soloTutorUsesManualStudentPayments(profile);
      setIsManualOnlyPlan(manualOnly);
      if (!individual) setIsManual(false);
      if (manualOnly) setIsManual(true);
    }

    const [subjectsResult, pricingResult] = await Promise.all([
      supabase.from('subjects').select('id, name, price, color').eq('tutor_id', effectiveTutorId).order('name'),
      supabase.from('student_individual_pricing').select('subject_id, price').eq('student_id', studentId).eq('tutor_id', effectiveTutorId)
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

  /** Lithuanian/English plural unit only (no leading number) — avoids "5 5 pamokos". */
  const getLessonUnitWord = (count: number) => {
    if (count === 1) return t('package.lessonUnit1');
    if (count < 10) return t('package.lessonUnit2to9');
    return t('package.lessonUnit10plus');
  };

  const handleSendPackage = async () => {
    if (!selectedSubjectId || totalLessons <= 0) {
      setError(t('package.fillAllFields'));
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
          subjectId: selectedSubjectId,
          totalLessons,
          pricePerLesson,
          ...(expiresAt ? { expiresAt } : {}),
          ...(!isManual ? { attachSalesInvoice } : {}),
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

  const selectedSubject = subjects.find((s) => s.id === selectedSubjectId);
  const summarySubject = selectedSubject?.name?.trim() || '';

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="w-[95vw] max-w-md max-h-[90vh] overflow-y-auto">
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
              <div>
                <Label className="text-sm font-semibold text-gray-700">{t('package.subject')}</Label>
                <Select value={selectedSubjectId} onValueChange={setSelectedSubjectId}>
                  <SelectTrigger className="mt-1 rounded-lg"><SelectValue placeholder={t('package.selectSubject')} /></SelectTrigger>
                  <SelectContent>
                    {subjects.map(subject => (
                      <SelectItem key={subject.id} value={subject.id}>
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: subject.color }} />
                          <span>{subject.name}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-sm font-semibold text-gray-700">{t('package.lessonCount')}</Label>
                <Input type="number" value={totalLessons} onChange={(e) => setTotalLessons(Math.max(1, parseInt(e.target.value) || 1))} min={1} max={100} className="mt-1 rounded-lg" />
                <p className="text-xs text-gray-500 mt-1">{t('package.lessonCountHint')}</p>
              </div>

              <div>
                <Label className="text-sm font-semibold text-gray-700">{t('package.pricePerLesson')}</Label>
                <Input type="number" value={pricePerLesson} onChange={(e) => setPricePerLesson(Math.max(0, parseFloat(e.target.value) || 0))} min={0} step={0.01} className="mt-1 rounded-lg" />
                <p className="text-xs text-gray-500 mt-1">
                  {selectedSubjectId && subjects.find(s => s.id === selectedSubjectId) && (
                    <>{t('package.defaultPrice', { price: subjects.find(s => s.id === selectedSubjectId)?.price })}</>
                  )}
                </p>
              </div>

              {isIndividualTutor && (
                <div>
                  <Label className="text-sm font-semibold text-gray-700">{t('package.paymentMethod')}</Label>
                  <div className="flex mt-1 rounded-lg border border-gray-200 overflow-hidden">
                    <button
                      type="button"
                      className={`flex-1 py-2 text-sm font-medium transition-colors ${!isManual ? 'bg-violet-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'} ${isManualOnlyPlan ? 'opacity-50 cursor-not-allowed' : ''}`}
                      onClick={() => setIsManual(false)}
                      disabled={isManualOnlyPlan}
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
                  {isManualOnlyPlan && (
                    <p className="text-xs text-amber-700 mt-2">
                      {t('pricing.subscriptionOnlyDesc')}
                    </p>
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
                    <span className="text-2xl font-bold text-violet-700 tracking-tight">{formatEur(baseTotalPrice)}</span>
                  </div>
                  <p className="text-xs text-violet-600">
                    {summarySubject ? (
                      <span className="font-medium text-violet-800">{summarySubject}: </span>
                    ) : null}
                    {totalLessons} {getLessonUnitWord(totalLessons)} × {formatEur(pricePerLesson)}
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
                          {t('package.tooltipTutor', { amount: formatEur(baseTotalPrice) })}<br />
                          {t('package.tooltipPlatform', { amount: formatEur(baseTotalPrice * PLATFORM_FEE_PERCENT) })}<br />
                          {t('package.tooltipStripe', { amount: formatEur(totalPriceWithFees - baseTotalPrice - (baseTotalPrice * PLATFORM_FEE_PERCENT)) })}
                        </span>
                      </span>
                    </span>
                    <span className="text-2xl font-bold text-violet-700 tracking-tight">{formatEur(totalPriceWithFees)}</span>
                  </div>
                  <p className="text-xs text-violet-600">
                    {summarySubject ? (
                      <span className="font-medium text-violet-800">{summarySubject}: </span>
                    ) : null}
                    {totalLessons} {getLessonUnitWord(totalLessons)} × {formatEur(pricePerLesson)}{' '}
                    <span className="text-violet-500">{t('package.includingFeesNote')}</span>
                  </p>
                </div>
              )}

              {!isManual && (
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
              )}

              {error && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-3">
                  <p className="text-sm text-red-700">{error}</p>
                </div>
              )}

              <div className="flex gap-2">
                <Button variant="outline" onClick={onClose} disabled={loading} className="flex-1 rounded-lg">{t('common.cancel')}</Button>
                <Button onClick={handleSendPackage} disabled={loading || !selectedSubjectId || totalLessons <= 0} className="flex-1 rounded-lg bg-violet-600 hover:bg-violet-700">
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
