import { useState, useEffect, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CheckCircle2, Loader2, Sparkles } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { supabase } from '@/lib/supabase';
import { useTranslation } from '@/lib/i18n';
import { useOrgFeatures } from '@/hooks/useOrgFeatures';
import { authHeaders } from '@/lib/apiHelpers';
import { runOrgAdminCreateSession } from '@/pages/company/orgAdminSessionCreate';
import { ASSIGN_STUDENT_FREE_SLOT_DIALOG_CONTENT_CLASS } from '@/components/AssignStudentFreeSlotDialog';
import RecurrenceFields, { type RecurrenceFrequency } from '@/components/RecurrenceFields';

/** A free availability window picked from FindTutorModal, to be narrowed to a lesson slot. */
export interface FindLessonBookPick {
  tutorId: string;
  tutorName: string;
  subjectId: string;
  subjectName: string;
  /** Availability window start (ISO). */
  startIso: string;
  /** Availability window end (ISO). */
  endIso: string;
}

interface FindLessonBookDialogProps {
  /** When non-null the dialog is open and books for this window. */
  pick: FindLessonBookPick | null;
  /** The student the lesson is booked for (single-student card flow). */
  studentId: string;
  onClose: () => void;
  /** Called after a lesson is successfully created. */
  onBooked: (booking: { tutorId: string; startIso: string; endIso: string }) => void;
}

type SubjectRow = {
  id: string;
  name: string | null;
  price: number | null;
  duration_minutes: number | null;
  is_group: boolean | null;
  max_students: number | null;
  meeting_link?: string | null;
};

type TrialDefaults = { topic: string; durationMinutes: number; priceEur: number };

/**
 * Reusable "book a lesson" dialog used by the org-admin student card (req 4).
 * It narrows a free availability window into a concrete lesson slot and creates
 * the session through {@link runOrgAdminCreateSession} so the tutor is always
 * notified (and package credits / payment status are handled consistently).
 * Supports the same recurrence options as the org calendar, and the
 * first-ever-lesson trial recommendation (auto_trial_first_lesson).
 */
export default function FindLessonBookDialog({ pick, studentId, onClose, onBooked }: FindLessonBookDialogProps) {
  const { t } = useTranslation();
  const { loading: orgFeaturesLoading, hasFeature, organizationId } = useOrgFeatures();
  const [subject, setSubject] = useState<SubjectRow | null>(null);
  const [overridePrice, setOverridePrice] = useState<number | null>(null);
  const [selectedSlot, setSelectedSlot] = useState('');
  const [topic, setTopic] = useState('');
  const [meetingLink, setMeetingLink] = useState('');
  const [isPaid, setIsPaid] = useState(false);
  const [saving, setSaving] = useState(false);
  const [createdIntervals, setCreatedIntervals] = useState<Array<{ start: number; end: number }>>([]);
  const [successMessage, setSuccessMessage] = useState('');
  const [sessionCount, setSessionCount] = useState<number | null>(null);
  const [trialDefaults, setTrialDefaults] = useState<TrialDefaults>({ topic: '', durationMinutes: 60, priceEur: 0 });
  const [isTrial, setIsTrial] = useState(false);
  const [firstLessonIsTrial, setFirstLessonIsTrial] = useState(false);
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurringFrequency, setRecurringFrequency] = useState<RecurrenceFrequency>('weekly');
  const [recurringWeekdays, setRecurringWeekdays] = useState<number[]>([]);
  const [recurringEndDate, setRecurringEndDate] = useState('');

  useEffect(() => {
    if (!pick) {
      setSubject(null);
      setOverridePrice(null);
      setSessionCount(null);
      setIsTrial(false);
      return;
    }
    let cancelled = false;
    (async () => {
      const [{ data: subj }, { data: pricing }, { count }] = await Promise.all([
        supabase
          .from('subjects')
          .select('id, name, price, duration_minutes, is_group, max_students, meeting_link')
          .eq('id', pick.subjectId)
          .maybeSingle(),
        supabase
          .from('student_individual_pricing')
          .select('price')
          .eq('student_id', studentId)
          .eq('subject_id', pick.subjectId)
          .maybeSingle(),
        supabase
          .from('sessions')
          .select('id', { count: 'exact', head: true })
          .eq('student_id', studentId),
      ]);
      if (cancelled) return;
      setSubject((subj as SubjectRow) ?? null);
      setOverridePrice(pricing ? Number((pricing as { price: number }).price) : null);
      setSessionCount(typeof count === 'number' ? count : 0);
      setTopic(pick.subjectName);
      setMeetingLink(String((subj as { meeting_link?: string | null } | null)?.meeting_link || ''));
      setIsPaid(false);
      setSelectedSlot('');
      setCreatedIntervals([]);
      setSuccessMessage('');
      setIsTrial(false);
      setFirstLessonIsTrial(false);
      setIsRecurring(false);
      setRecurringFrequency('weekly');
      setRecurringWeekdays([]);
      setRecurringEndDate('');
    })();
    return () => {
      cancelled = true;
    };
  }, [pick, studentId]);

  // Org trial defaults (same source as the org calendar / create-trial-package).
  useEffect(() => {
    if (!organizationId) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('organizations')
        .select('features')
        .eq('id', organizationId)
        .maybeSingle();
      if (cancelled) return;
      const feat = (data as any)?.features;
      const featObj = feat && typeof feat === 'object' && !Array.isArray(feat) ? (feat as Record<string, unknown>) : {};
      setTrialDefaults({
        topic: typeof featObj.trial_lesson_topic === 'string' && featObj.trial_lesson_topic.trim()
          ? featObj.trial_lesson_topic.trim()
          : '',
        durationMinutes: typeof featObj.trial_lesson_duration_minutes === 'number' && Number.isFinite(featObj.trial_lesson_duration_minutes)
          ? Math.max(15, Math.round(featObj.trial_lesson_duration_minutes))
          : 60,
        priceEur: typeof featObj.trial_lesson_price_eur === 'number' && Number.isFinite(featObj.trial_lesson_price_eur)
          ? Math.max(0, featObj.trial_lesson_price_eur)
          : 0,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [organizationId]);

  // First-ever lesson: recommend a trial (pre-checked, admin can uncheck).
  useEffect(() => {
    if (!pick || orgFeaturesLoading) return;
    if (sessionCount === 0 && hasFeature('auto_trial_first_lesson') && createdIntervals.length === 0) {
      setIsTrial(true);
      setIsRecurring(false);
      setRecurringWeekdays([]);
      setRecurringEndDate('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pick, sessionCount, orgFeaturesLoading]);

  const subSlots = useMemo(() => {
    if (!pick) return [] as Array<{ label: string; startIso: string; endIso: string }>;
    const durationMin = isTrial ? trialDefaults.durationMinutes : (subject?.duration_minutes || 60);
    const windowStart = new Date(pick.startIso);
    const windowEnd = new Date(pick.endIso);
    if (Number.isNaN(windowStart.getTime()) || Number.isNaN(windowEnd.getTime())) return [];
    const slots: Array<{ label: string; startIso: string; endIso: string }> = [];
    const stepMs = 15 * 60 * 1000;
    const durMs = durationMin * 60 * 1000;
    for (
      let cursor = new Date(windowStart);
      cursor.getTime() + durMs <= windowEnd.getTime();
      cursor = new Date(cursor.getTime() + stepMs)
    ) {
      const slotStart = new Date(cursor);
      const slotEnd = new Date(cursor.getTime() + durMs);
      slots.push({
        label: `${format(slotStart, 'HH:mm')} – ${format(slotEnd, 'HH:mm')}`,
        startIso: slotStart.toISOString(),
        endIso: slotEnd.toISOString(),
      });
    }
    return slots.filter((slot) => {
      const start = new Date(slot.startIso).getTime();
      const end = new Date(slot.endIso).getTime();
      return createdIntervals.every((created) => end <= created.start || start >= created.end);
    });
  }, [pick, subject, createdIntervals, isTrial, trialDefaults.durationMinutes]);

  useEffect(() => {
    if (subSlots.length === 0) {
      setSelectedSlot('');
      return;
    }
    setSelectedSlot((prev) => (prev && subSlots.some((s) => s.startIso === prev) ? prev : subSlots[0].startIso));
  }, [subSlots]);

  const recurringWeekdaysMissing = isRecurring && recurringFrequency !== 'monthly' && recurringWeekdays.length === 0;

  const handleCreate = async () => {
    if (!pick || !subject) return;
    const slot = subSlots.find((s) => s.startIso === selectedSlot) || subSlots[0];
    if (!slot) {
      alert(t('findLesson.noSubSlots'));
      return;
    }
    setSaving(true);
    try {
      const price = isTrial
        ? trialDefaults.priceEur
        : (overridePrice ?? subject.price ?? 0);
      const result = await runOrgAdminCreateSession({
        supabase,
        createTutorId: pick.tutorId,
        createSubjectId: pick.subjectId,
        createStudentId: studentId,
        createStudentIds: [studentId],
        createStartTime: slot.startIso,
        createEndTime: slot.endIso,
        createTopic: topic || (isTrial ? trialDefaults.topic : '') || subject.name || '',
        createMeetingLink: meetingLink.trim(),
        createIsRecurring: isTrial ? false : isRecurring,
        createRecurringEndDate: isTrial ? '' : recurringEndDate,
        createRecurringFrequency: recurringFrequency,
        createRecurringWeekdays: recurringWeekdays,
        createIsPaid: isPaid,
        createPrice: price,
        createIsTrial: isTrial,
        createFirstLessonIsTrial: isRecurring && firstLessonIsTrial,
        createTutorComment: '',
        createShowCommentToStudent: false,
        subjects: [
          {
            id: subject.id,
            name: subject.name,
            price: subject.price,
            duration_minutes: subject.duration_minutes,
            is_group: subject.is_group,
            max_students: subject.max_students,
          },
        ],
        individualPricing: [],
        suppressSuccessAlert: true,
      });

      // Trial payment email on creation (one-time pay link for that lesson).
      if (
        (isTrial || (isRecurring && firstLessonIsTrial)) &&
        !isPaid &&
        price > 0 &&
        hasFeature('trial_creation_payment_email') &&
        result.createdSessionIds.length > 0
      ) {
        try {
          const resp = await fetch('/api/create-trial-package', {
            method: 'POST',
            headers: await authHeaders(),
            body: JSON.stringify({
              studentId,
              tutorId: pick.tutorId,
              sessionId: result.createdSessionIds[0],
              topic: topic || trialDefaults.topic || undefined,
              durationMinutes: isTrial ? trialDefaults.durationMinutes : trialDefaults.durationMinutes,
              priceEur: price,
            }),
          });
          if (!resp.ok) {
            const txt = await resp.text().catch(() => '');
            console.error('[FindLessonBookDialog] trial payment email failed:', resp.status, txt);
            alert(t('compSch.trialPaymentEmailFailed'));
          }
        } catch (trialErr) {
          console.error('[FindLessonBookDialog] trial payment email failed:', trialErr);
          alert(t('compSch.trialPaymentEmailFailed'));
        }
      }

      if (!isTrial && isRecurring) {
        // Recurring: the whole schedule was created — the sub-slot "book
        // another" loop only makes sense for one-off lessons.
        setSuccessMessage(t('findLesson.recurringCreatedKeepOpen'));
      } else {
        setCreatedIntervals((current) => [
          ...current,
          { start: new Date(slot.startIso).getTime(), end: new Date(slot.endIso).getTime() },
        ]);
        setSuccessMessage(t('findLesson.lessonCreatedKeepOpen'));
      }
      if (sessionCount != null) setSessionCount(sessionCount + 1);
      setIsTrial(false);
      onBooked({
        tutorId: pick.tutorId,
        startIso: slot.startIso,
        endIso: slot.endIso,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      alert(t('compSch.errorGeneric', { msg }));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={pick !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className={ASSIGN_STUDENT_FREE_SLOT_DIALOG_CONTENT_CLASS}>
        <DialogHeader>
          <DialogTitle>{t('findLesson.bookDialogTitle')}</DialogTitle>
          <DialogDescription asChild>
            <div className="text-left space-y-2 text-sm text-muted-foreground">
            {pick && (
              <>
                <p>
                  <span className="font-semibold text-gray-900">{pick.tutorName}</span>
                  {' · '}
                  <span>{pick.subjectName}</span>
                </p>
                <p className="text-sm text-gray-600 tabular-nums">
                  {t('findLesson.freeWindowSummary')}: {format(parseISO(pick.startIso), 'yyyy-MM-dd HH:mm')} –{' '}
                  {format(parseISO(pick.endIso), 'HH:mm')}
                </p>
                <p className="text-xs text-gray-500">{t('findLesson.bookDialogIntro')}</p>
              </>
            )}
            </div>
          </DialogDescription>
        </DialogHeader>
        {pick && (
          <div className="space-y-3">
            {successMessage && (
              <div className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{successMessage}</span>
              </div>
            )}
            {subSlots.length === 0 ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
                {createdIntervals.length > 0 ? t('findLesson.windowFullyBooked') : t('findLesson.noSubSlots')}
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label className="text-xs">{t('compSch.time')}</Label>
                <Select value={selectedSlot || ''} onValueChange={setSelectedSlot}>
                  <SelectTrigger className="rounded-xl h-9 text-sm">
                    <SelectValue placeholder={t('compSch.selectTimePlaceholder')} />
                  </SelectTrigger>
                  <SelectContent>
                    {subSlots.map((slot) => (
                      <SelectItem key={slot.startIso} value={slot.startIso}>
                        {slot.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* First-ever lesson: recommended as a trial (admin can uncheck). */}
            {(isTrial || (sessionCount === 0 && !orgFeaturesLoading && hasFeature('auto_trial_first_lesson'))) && !isRecurring && (
              <div className="border border-amber-200 rounded-xl p-3 bg-amber-50/60">
                <button
                  type="button"
                  onClick={() => {
                    const next = !isTrial;
                    setIsTrial(next);
                    if (next) {
                      setIsRecurring(false);
                      setFirstLessonIsTrial(false);
                      setRecurringWeekdays([]);
                      setRecurringEndDate('');
                    }
                  }}
                  className="flex items-center justify-between gap-3 w-full text-left"
                >
                  <div>
                    <p className="text-sm font-medium text-amber-950 flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                      {t('findLesson.trialToggle')}
                    </p>
                    <p className="text-xs text-amber-900/80">
                      {t('findLesson.trialToggleHint', {
                        duration: String(trialDefaults.durationMinutes),
                        price: trialDefaults.priceEur.toFixed(2),
                      })}
                    </p>
                  </div>
                  <div
                    className={`relative inline-flex h-6 w-11 items-center rounded-full flex-shrink-0 ${isTrial ? 'bg-amber-500' : 'bg-gray-300'}`}
                  >
                    <span
                      className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${isTrial ? 'translate-x-6' : 'translate-x-1'}`}
                    />
                  </div>
                </button>
              </div>
            )}

            <div className="space-y-1.5">
              <Label className="text-xs">{t('compSch.topicOptional')}</Label>
              <Input
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder={t('compSch.lessonTopicPlaceholder')}
                className="rounded-xl h-9 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{t('compSch.meetingLink')}</Label>
              <Input
                value={meetingLink}
                onChange={(e) => setMeetingLink(e.target.value)}
                placeholder="https://..."
                className="rounded-xl h-9 text-sm"
              />
              <p className="text-[11px] text-gray-500">{t('findLesson.meetingLinkHint')}</p>
            </div>

            {!isTrial && (
              <RecurrenceFields
                compact
                enabled={isRecurring}
                onEnabledChange={(enabled) => {
                  setIsRecurring(enabled);
                  if (!enabled) setFirstLessonIsTrial(false);
                }}
                frequency={recurringFrequency}
                onFrequencyChange={setRecurringFrequency}
                weekdays={recurringWeekdays}
                onWeekdaysChange={setRecurringWeekdays}
                endDate={recurringEndDate}
                onEndDateChange={setRecurringEndDate}
                startTime={selectedSlot ? format(new Date(selectedSlot), "yyyy-MM-dd'T'HH:mm") : undefined}
              />
            )}

            {isRecurring && !subject?.is_group && (
              <div className="border border-amber-200 rounded-xl p-3 bg-amber-50/60">
                <button
                  type="button"
                  onClick={() => setFirstLessonIsTrial((v) => !v)}
                  className="flex items-center justify-between gap-3 w-full text-left"
                >
                  <div>
                    <p className="text-sm font-medium text-amber-950">{t('compSch.firstLessonTrial')}</p>
                    <p className="text-xs text-amber-900/80">{t('compSch.firstLessonTrialDesc')}</p>
                  </div>
                  <div
                    className={`relative inline-flex h-6 w-11 items-center rounded-full flex-shrink-0 ${firstLessonIsTrial ? 'bg-amber-500' : 'bg-gray-300'}`}
                  >
                    <span
                      className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${firstLessonIsTrial ? 'translate-x-6' : 'translate-x-1'}`}
                    />
                  </div>
                </button>
              </div>
            )}

            <div className="border border-green-100 rounded-xl p-3 sm:p-4 bg-green-50/50 flex flex-col justify-center min-h-[4.5rem]">
              <button
                type="button"
                onClick={() => setIsPaid(!isPaid)}
                className="flex items-center justify-between gap-3 w-full text-left"
              >
                <div>
                  <p className="text-sm font-medium text-green-900">{t('compSch.alreadyPaid')}</p>
                  <p className="text-xs text-green-800/80 hidden sm:block">{t('compSch.ifStudentPaid')}</p>
                </div>
                <div
                  className={`relative inline-flex h-6 w-11 items-center rounded-full flex-shrink-0 ${isPaid ? 'bg-green-500' : 'bg-gray-300'}`}
                >
                  <span
                    className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${isPaid ? 'translate-x-6' : 'translate-x-1'}`}
                  />
                </div>
              </button>
            </div>
          </div>
        )}
        <DialogFooter className="!flex !flex-col w-full min-w-0 gap-2 sm:!flex-col sm:space-x-0">
          <Button variant="outline" className="h-auto min-h-10 w-full rounded-xl py-2" onClick={onClose}>
            {t('compSch.cancel')}
          </Button>
          <Button
            className="h-auto min-h-10 w-full rounded-xl bg-indigo-600 py-2 hover:bg-indigo-700"
            onClick={() => void handleCreate()}
            disabled={saving || subSlots.length === 0 || recurringWeekdaysMissing}
          >
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                {t('compSch.creating')}
              </>
            ) : isRecurring && !isTrial ? (
              t('cal.createRecurring')
            ) : (
              createdIntervals.length > 0 ? t('findLesson.createAnotherLesson') : t('compSch.createLesson')
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
