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
import { Loader2 } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { supabase } from '@/lib/supabase';
import { useTranslation } from '@/lib/i18n';
import { runOrgAdminCreateSession } from '@/pages/company/orgAdminSessionCreate';

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
  onBooked: () => void;
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

/**
 * Reusable "book a lesson" dialog used by the org-admin student card (req 4).
 * It narrows a free availability window into a concrete lesson slot and creates
 * the session through {@link runOrgAdminCreateSession} so the tutor is always
 * notified (and package credits / payment status are handled consistently).
 */
export default function FindLessonBookDialog({ pick, studentId, onClose, onBooked }: FindLessonBookDialogProps) {
  const { t } = useTranslation();
  const [subject, setSubject] = useState<SubjectRow | null>(null);
  const [overridePrice, setOverridePrice] = useState<number | null>(null);
  const [selectedSlot, setSelectedSlot] = useState('');
  const [topic, setTopic] = useState('');
  const [meetingLink, setMeetingLink] = useState('');
  const [isPaid, setIsPaid] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!pick) {
      setSubject(null);
      setOverridePrice(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const [{ data: subj }, { data: pricing }] = await Promise.all([
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
      ]);
      if (cancelled) return;
      setSubject((subj as SubjectRow) ?? null);
      setOverridePrice(pricing ? Number((pricing as { price: number }).price) : null);
      setTopic(pick.subjectName);
      setMeetingLink(String((subj as { meeting_link?: string | null } | null)?.meeting_link || ''));
      setIsPaid(false);
      setSelectedSlot('');
    })();
    return () => {
      cancelled = true;
    };
  }, [pick, studentId]);

  const subSlots = useMemo(() => {
    if (!pick) return [] as Array<{ label: string; startIso: string; endIso: string }>;
    const durationMin = subject?.duration_minutes || 60;
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
    return slots;
  }, [pick, subject]);

  useEffect(() => {
    if (subSlots.length === 0) {
      setSelectedSlot('');
      return;
    }
    setSelectedSlot((prev) => (prev && subSlots.some((s) => s.startIso === prev) ? prev : subSlots[0].startIso));
  }, [subSlots]);

  const handleCreate = async () => {
    if (!pick || !subject) return;
    const slot = subSlots.find((s) => s.startIso === selectedSlot) || subSlots[0];
    if (!slot) {
      alert(t('findLesson.noSubSlots'));
      return;
    }
    setSaving(true);
    try {
      const price = overridePrice ?? subject.price ?? 0;
      await runOrgAdminCreateSession({
        supabase,
        createTutorId: pick.tutorId,
        createSubjectId: pick.subjectId,
        createStudentId: studentId,
        createStudentIds: [studentId],
        createStartTime: slot.startIso,
        createEndTime: slot.endIso,
        createTopic: topic || subject.name || '',
        createMeetingLink: meetingLink.trim(),
        createIsRecurring: false,
        createRecurringEndDate: '',
        createIsPaid: isPaid,
        createPrice: price,
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
      });
      onBooked();
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
      <DialogContent className="w-[95vw] sm:max-w-[440px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('findLesson.bookDialogTitle')}</DialogTitle>
          <DialogDescription className="text-left space-y-2">
            {pick && (
              <>
                <span className="block">
                  <span className="font-semibold text-gray-900">{pick.tutorName}</span>
                  {' · '}
                  <span>{pick.subjectName}</span>
                </span>
                <span className="block text-sm text-gray-600 tabular-nums">
                  {t('findLesson.freeWindowSummary')}: {format(parseISO(pick.startIso), 'yyyy-MM-dd HH:mm')} –{' '}
                  {format(parseISO(pick.endIso), 'HH:mm')}
                </span>
                <span className="block text-xs text-gray-500">{t('findLesson.bookDialogIntro')}</span>
              </>
            )}
          </DialogDescription>
        </DialogHeader>
        {pick && (
          <div className="space-y-3">
            {subSlots.length === 0 ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
                {t('findLesson.noSubSlots')}
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
        <DialogFooter className="gap-2">
          <Button variant="outline" className="rounded-xl" onClick={onClose}>
            {t('compSch.cancel')}
          </Button>
          <Button
            className="rounded-xl bg-indigo-600 hover:bg-indigo-700"
            onClick={() => void handleCreate()}
            disabled={saving || subSlots.length === 0}
          >
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                {t('compSch.creating')}
              </>
            ) : (
              t('compSch.createLesson')
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
