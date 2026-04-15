import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DateInput } from '@/components/ui/date-input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/lib/supabase';
import { authHeaders } from '@/lib/apiHelpers';
import { Loader2, FileText, Calendar, ChevronDown } from 'lucide-react';
import { format, subDays } from 'date-fns';
import { useTranslation } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { fetchPaidManualSalesInvoiceCandidates } from '@/lib/manualSalesInvoicePreview';

interface SendInvoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  studentId?: string;
  studentName?: string;
  billingTutorId?: string;
  manualPaymentsEnabled?: boolean;
  onSuccess?: () => void;
}

export default function SendInvoiceModal({
  isOpen,
  onClose,
  studentId,
  studentName,
  billingTutorId,
  manualPaymentsEnabled = false,
  onSuccess,
}: SendInvoiceModalProps) {
  const { t } = useTranslation();
  const [periodStartDate, setPeriodStartDate] = useState('');
  const [periodEndDate, setPeriodEndDate] = useState('');
  const [paymentDeadlineDays, setPaymentDeadlineDays] = useState(7);
  const [unpaidSessions, setUnpaidSessions] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewMode, setPreviewMode] = useState(false);
  /** When many lessons per payer, list starts collapsed; key = payer email */
  const [payerLessonListOpen, setPayerLessonListOpen] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (isOpen) {
      const today = new Date();
      const thirtyDaysAgo = subDays(today, 30);
      setPeriodStartDate(format(thirtyDaysAgo, 'yyyy-MM-dd'));
      setPeriodEndDate(format(today, 'yyyy-MM-dd'));
      setPayerLessonListOpen({});
    }
  }, [isOpen]);

  const handlePreview = async () => {
    if (!periodStartDate || !periodEndDate) {
      setError(t('invoice.fillDates'));
      return;
    }

    const start = new Date(periodStartDate);
    const end = new Date(periodEndDate);
    const daysDiff = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));

    if (daysDiff < 0) {
      setError(t('invoice.endDateAfterStart'));
      return;
    }

    if (daysDiff > 45) {
      setError(t('invoice.maxPeriod'));
      return;
    }

    setLoadingSessions(true);
    setError(null);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error(t('invoice.userNotAuthorized'));

      const tutorScopeId = billingTutorId ?? user.id;

      // Clean up orphaned billing batches (created but Stripe checkout never completed)
      if (!manualPaymentsEnabled) {
        const { data: orphanedBatches } = await supabase
          .from('billing_batches')
          .select('id')
          .eq('tutor_id', tutorScopeId)
          .eq('paid', false)
          .is('stripe_checkout_session_id', null);

        if (orphanedBatches && orphanedBatches.length > 0) {
          const orphanedIds = orphanedBatches.map(b => b.id);
          await supabase.from('sessions').update({ payment_batch_id: null }).in('payment_batch_id', orphanedIds);
          await supabase.from('billing_batch_sessions').delete().in('billing_batch_id', orphanedIds);
          await supabase.from('billing_batches').delete().in('id', orphanedIds);
        }
      }

      if (manualPaymentsEnabled) {
        const { rows, error: manualErr } = await fetchPaidManualSalesInvoiceCandidates(supabase, {
          tutorIds: [tutorScopeId],
          periodStart: periodStartDate,
          periodEnd: periodEndDate,
          studentId,
        });
        if (manualErr) throw manualErr;
        if (!rows.length) {
          setError(t('invoice.noPaidForPeriod'));
          setUnpaidSessions([]);
          setPreviewMode(false);
          setPayerLessonListOpen({});
        } else {
          setUnpaidSessions(rows as any[]);
          setPayerLessonListOpen({});
          setPreviewMode(true);
        }
      } else {
        let query = supabase
          .from('sessions')
          .select('*, students!inner(full_name, email, payer_email, payer_name), subjects(name)')
          .eq('tutor_id', tutorScopeId)
          .neq('status', 'cancelled')
          .is('lesson_package_id', null)
          .gte('start_time', periodStartDate + 'T00:00:00')
          .lte('start_time', periodEndDate + 'T23:59:59')
          .lte('start_time', new Date().toISOString())
          .eq('paid', false)
          .is('payment_batch_id', null)
          .order('start_time', { ascending: false });

        if (studentId) {
          query = query.eq('student_id', studentId);
        }

        const { data, error: fetchError } = await query;

        if (fetchError) throw fetchError;

        if (!data || data.length === 0) {
          setError(t('invoice.noUnpaidSessions'));
          setUnpaidSessions([]);
          setPreviewMode(false);
          setPayerLessonListOpen({});
        } else {
          setUnpaidSessions(data);
          setPayerLessonListOpen({});
          setPreviewMode(true);
        }
      }
    } catch (err: any) {
      console.error('Error fetching sessions:', err);
      setError(err.message || t('invoice.errorOccurred'));
    } finally {
      setLoadingSessions(false);
    }
  };

  const handleSendInvoice = async () => {
    if (unpaidSessions.length === 0) {
      setError(t('invoice.noSessionsToSend'));
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error(t('invoice.userNotAuthorized'));

      const tutorScopeId = billingTutorId ?? user.id;

      let result: any;

      if (manualPaymentsEnabled) {
        const groupedByTutor = unpaidSessions.reduce(
          (acc: Record<string, { sessionIds: string[]; packageIds: string[] }>, row: any) => {
            const tid = row.tutor_id || tutorScopeId;
            if (!acc[tid]) acc[tid] = { sessionIds: [], packageIds: [] };
            if (row.invoice_row_kind === 'package') acc[tid].packageIds.push(row.id);
            else acc[tid].sessionIds.push(row.id);
            return acc;
          },
          {}
        );
        let lastJson: any = null;
        let sent = 0;
        for (const tid of Object.keys(groupedByTutor)) {
          const { sessionIds, packageIds } = groupedByTutor[tid];
          if (sessionIds.length === 0 && packageIds.length === 0) continue;
          const response = await fetch('/api/generate-invoice', {
            method: 'POST',
            headers: await authHeaders(),
            body: JSON.stringify({
              periodStart: periodStartDate,
              periodEnd: periodEndDate,
              groupingType: 'single',
              tutorId: tid,
              onlyPaid: true,
              sessionIds: sessionIds.length > 0 ? sessionIds : undefined,
              packageIds: packageIds.length > 0 ? packageIds : undefined,
            }),
          });
          try {
            lastJson = await response.json();
          } catch {
            throw new Error(t('invoice.failedToCreateInvoice'));
          }
          if (!response.ok) throw new Error(lastJson?.error || t('invoice.failedToCreateInvoice'));
          sent += 1;
        }
        if (sent === 0) throw new Error(t('invoice.noSessionsToSend'));
        result = { totalBatches: sent, ...(lastJson || {}) };
      } else {
        const sessionIds = unpaidSessions.map(s => s.id);
        const response = await fetch('/api/create-monthly-invoice', {
          method: 'POST',
          headers: await authHeaders(),
          body: JSON.stringify({
            tutorId: tutorScopeId,
            periodStartDate,
            periodEndDate,
            paymentDeadlineDays,
            sessionIds,
          }),
        });
        try { result = await response.json(); } catch { throw new Error(t('invoice.failedToCreateInvoice')); }
        if (!response.ok) throw new Error(result?.error || t('invoice.failedToCreateInvoice'));
      }


      if (onSuccess) onSuccess();
      onClose();

      const batchCount = result.totalBatches || 1;
      const invoiceWord = batchCount === 1 ? t('invoice.invoiceSingular') : t('invoice.invoicePlural');
      const lessonWord = unpaidSessions.length === 1 ? t('invoice.lessonSingular') : t('invoice.lessonPlural');
      alert(t('invoice.invoicesSent', { batchCount, invoiceWord, sessionCount: unpaidSessions.length, lessonWord }));

      setPreviewMode(false);
      setUnpaidSessions([]);
    } catch (err: any) {
      console.error('Error sending invoice:', err);
      setError(err.message || t('invoice.errorOccurred'));
    } finally {
      setLoading(false);
    }
  };

  const totalAmount = unpaidSessions.reduce((sum, s) => sum + (s.price || 0), 0);

  const sessionsByPayer = unpaidSessions.reduce((acc, session) => {
    const student = session.students as any;
    const payerEmail = student.payer_email || student.email || 'unknown';
    if (!acc[payerEmail]) {
      acc[payerEmail] = {
        payer: student.payer_name || student.full_name,
        sessions: [],
      };
    }
    acc[payerEmail].sessions.push(session);
    return acc;
  }, {} as Record<string, { payer: string; sessions: any[] }>);

  const payerCount = Object.keys(sessionsByPayer).length;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto sm:max-w-2xl w-[95vw] sm:w-full">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-indigo-600" />
            {studentName ? t('invoice.sendInvoice', { name: studentName }) : t('invoice.sendMonthlyInvoices', { name: '' })}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {!previewMode ? (
            <>
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                <p className="text-sm text-amber-900">
                  {manualPaymentsEnabled ? t('invoice.selectPeriodInfoManual') : t('invoice.selectPeriodInfo')}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-sm font-semibold text-gray-700 flex items-center gap-1">
                    <Calendar className="w-4 h-4" />
                    {t('invoice.fromDate')}
                  </Label>
                  <DateInput value={periodStartDate} onChange={(e) => setPeriodStartDate(e.target.value)} className="mt-1 rounded-lg" />
                </div>
                <div>
                  <Label className="text-sm font-semibold text-gray-700 flex items-center gap-1">
                    <Calendar className="w-4 h-4" />
                    {t('invoice.toDate')}
                  </Label>
                  <DateInput value={periodEndDate} onChange={(e) => setPeriodEndDate(e.target.value)} className="mt-1 rounded-lg" />
                </div>
              </div>

              <div>
                <Label className="text-sm font-semibold text-gray-700">{t('invoice.payWithinDays')}</Label>
                <Input type="number" value={paymentDeadlineDays} onChange={(e) => setPaymentDeadlineDays(Math.max(1, Math.min(90, parseInt(e.target.value) || 7)))} min={1} max={90} className="mt-1 rounded-lg" />
                <p className="text-xs text-gray-500 mt-1">{t('invoice.payWithinHint')}</p>
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-3">
                  <p className="text-sm text-red-700">{error}</p>
                </div>
              )}

              <div className="flex gap-2">
                <Button variant="outline" onClick={onClose} disabled={loadingSessions} className="flex-1 rounded-lg">{t('common.cancel')}</Button>
                <Button onClick={handlePreview} disabled={loadingSessions || !periodStartDate || !periodEndDate} className="flex-1 rounded-lg bg-indigo-600 hover:bg-indigo-700">
                  {loadingSessions ? (<><Loader2 className="w-4 h-4 animate-spin mr-2" />{t('common.searching')}</>) : t('invoice.previewLessons')}
                </Button>
              </div>
            </>
          ) : (
            <>
              <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <p className="text-sm font-semibold text-indigo-900">
                      {t('invoice.periodLabel', { start: format(new Date(periodStartDate), 'yyyy-MM-dd'), end: format(new Date(periodEndDate), 'yyyy-MM-dd') })}
                    </p>
                    <p className="text-xs text-indigo-700 mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span>{t('invoice.payers', { count: payerCount })}</span>
                      <span className="text-indigo-400" aria-hidden>
                        ·
                      </span>
                      <span>
                        {manualPaymentsEnabled
                          ? t('invoice.manualPreviewItems', {
                              count: String(unpaidSessions.length),
                              lessons: String(unpaidSessions.filter((s: any) => s.invoice_row_kind !== 'package').length),
                              packages: String(unpaidSessions.filter((s: any) => s.invoice_row_kind === 'package').length),
                            })
                          : t('invoice.lessonsCount', { count: unpaidSessions.length })}
                      </span>
                      <span className="text-indigo-400" aria-hidden>
                        ·
                      </span>
                      <span>
                        {t('common.total')}: €{totalAmount.toFixed(2)}
                      </span>
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setPreviewMode(false);
                      setPayerLessonListOpen({});
                    }}
                    className="text-xs"
                  >
                    ← {t('common.back')}
                  </Button>
                </div>
              </div>

              <div className="space-y-3 max-h-[400px] overflow-y-auto">
                {Object.entries(sessionsByPayer).map(([payerEmail, value]) => {
                  const typedValue = value as { payer: string; sessions: any[] };
                  const payer = typedValue.payer;
                  const sessions = typedValue.sessions;
                  const payerTotal = sessions.reduce((sum, s) => sum + (s.price || 0), 0);
                  const manyLessons = sessions.length > 3;
                  const listOpen = payerLessonListOpen[payerEmail] === true;
                  const showLessonRows = !manyLessons || listOpen;
                  return (
                    <div key={payerEmail} className="bg-white border border-gray-200 rounded-xl p-4">
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <p className="font-semibold text-gray-900">{payer}</p>
                          <p className="text-xs text-gray-500">{payerEmail}</p>
                        </div>
                        <p className="text-lg font-bold text-indigo-600">€{payerTotal.toFixed(2)}</p>
                      </div>
                      <div className="mt-2 space-y-2">
                        <p className="text-xs font-medium text-gray-700">{t('invoice.payerLessonsCount', { count: sessions.length })}</p>
                        {manyLessons && (
                          <button
                            type="button"
                            onClick={() =>
                              setPayerLessonListOpen((prev) => ({
                                ...prev,
                                [payerEmail]: !prev[payerEmail],
                              }))
                            }
                            className="flex w-full items-center justify-between gap-2 rounded-lg border border-gray-200 bg-gray-50/80 px-3 py-2 text-left text-sm font-medium text-indigo-700 transition-colors hover:bg-indigo-50/80"
                          >
                            <span>{listOpen ? t('invoice.hideLessonList') : t('invoice.showAllLessons', { count: sessions.length })}</span>
                            <ChevronDown className={cn('h-4 w-4 shrink-0 text-indigo-600 transition-transform', listOpen && 'rotate-180')} />
                          </button>
                        )}
                        {showLessonRows && (
                          <div className="space-y-1 border-t border-gray-100 pt-2">
                            {sessions.map((session) => {
                              const subject = session.subjects as any;
                              const sessionDate = new Date(session.start_time);
                              const isPkg = session.invoice_row_kind === 'package';
                              const lineLabel = isPkg
                                ? `${t('invoice.packageRowLabel')}${subject?.name ? ` · ${subject.name}` : ''}${session.total_lessons != null ? ` (${session.total_lessons})` : ''}`
                                : subject?.name || t('common.lesson');
                              return (
                                <div key={session.id} className="flex justify-between text-xs text-gray-600">
                                  <span className="min-w-0 pr-2">
                                    {format(sessionDate, 'yyyy-MM-dd')}
                                    {!isPkg ? ` ${format(sessionDate, 'HH:mm')}` : ''} — {lineLabel}
                                  </span>
                                  <span className="shrink-0 font-semibold tabular-nums">€{Number(session.price ?? 0).toFixed(2)}</span>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
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
                <Button
                  variant="outline"
                  onClick={() => {
                    setPreviewMode(false);
                    setPayerLessonListOpen({});
                  }}
                  disabled={loading}
                  className="flex-1 rounded-lg"
                >
                  {t('common.back')}
                </Button>
                <Button onClick={handleSendInvoice} disabled={loading} className="flex-1 rounded-lg bg-indigo-600 hover:bg-indigo-700">
                  {loading ? (<><Loader2 className="w-4 h-4 animate-spin mr-2" />{t('common.sending')}</>) : t('invoice.sendInvoiceCount', { count: payerCount, word: payerCount === 1 ? t('invoice.invoiceSingular') : t('invoice.invoicePlural') })}
                </Button>
              </div>

              <p className="text-xs text-gray-500 text-center">
                {manualPaymentsEnabled ? t('invoice.manualSfFooterNote') : t('invoice.emailNote', { days: paymentDeadlineDays })}
              </p>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
