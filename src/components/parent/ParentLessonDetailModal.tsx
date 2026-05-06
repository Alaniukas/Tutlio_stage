import {
  CalendarDays,
  ChevronRight,
  Clock,
  CreditCard,
  Info,
  Loader2,
  Mail,
  Phone,
  Play,
  ShieldAlert,
  Users,
} from 'lucide-react';
import { useState } from 'react';
import { authHeaders } from '@/lib/apiHelpers';
import { format, isAfter } from 'date-fns';
import type { NavigateFunction } from 'react-router-dom';
import type { Locale } from 'date-fns';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import StatusBadge from '@/components/StatusBadge';
import WhiteboardButton from '@/components/WhiteboardButton';
import { normalizeUrl } from '@/lib/utils';
/** Tutor contact + payment / cancellation rules (from profiles). */
export type ParentTutorContactPolicy = {
  tutorId: string;
  tutorName: string | null;
  tutorEmail: string | null;
  tutorPhone: string | null;
  cancellationHours: number;
  cancellationFeePercent: number;
  paymentTiming: 'before_lesson' | 'after_lesson';
  paymentDeadlineHours: number;
};

/** Session row shape for the shared parent lesson modal. */
export type ParentLessonModalSession = {
  id: string;
  start_time: string;
  end_time: string;
  status: string;
  topic: string | null;
  subjectName?: string | null;
  paid: boolean;
  payment_status?: string;
  price: number | null;
  meeting_link: string | null;
  whiteboard_room_id?: string | null;
  tutor_comment?: string | null;
  show_comment_to_student?: boolean;
  isGroupSubject?: boolean;
};

export function ParentLessonDetailModal({
  open,
  onOpenChange,
  session,
  childName,
  childId,
  tutorPolicy,
  now,
  navigate,
  t,
  dateFnsLocale,
  stripePayerEmail,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  session: ParentLessonModalSession | null;
  childName: string;
  childId: string;
  tutorPolicy: ParentTutorContactPolicy | null;
  now: Date;
  navigate: NavigateFunction;
  t: (key: string, params?: Record<string, string | number>) => string;
  dateFnsLocale: Locale | undefined;
  /** Prefer parent login email so Stripe Checkout matches payer; fallback is student payer_email server-side */
  stripePayerEmail?: string | null;
}) {
  const headline =
    session?.subjectName ||
    session?.topic ||
    (session ? t('common.lesson') : '');

  const [stripeLoading, setStripeLoading] = useState(false);

  const payWithStripe = async () => {
    if (!session) return;
    setStripeLoading(true);
    try {
      const body: { sessionId: string; payerEmail?: string } = { sessionId: session.id };
      const trimmed = stripePayerEmail?.trim();
      if (trimmed) body.payerEmail = trimmed;
      const res = await fetch('/api/stripe-checkout', {
        method: 'POST',
        headers: await authHeaders(),
        body: JSON.stringify(body),
      });
      const json = (await res.json().catch(() => ({}))) as {
        url?: string;
        error?: string;
        creditFullyCovered?: boolean;
      };
      if (json.creditFullyCovered) {
        onOpenChange(false);
        window.location.reload();
        return;
      }
      if (json.url) {
        window.location.href = json.url;
        return;
      }
      alert(typeof json.error === 'string' ? json.error : t('stuSched.paymentCreateFailed'));
    } catch {
      alert(t('stuSched.stripeError'));
    }
    setStripeLoading(false);
  };

  const lessonsPath = `/parent/lessons?studentId=${encodeURIComponent(childId)}`;
  const calendarReturn = `/parent/calendar?studentId=${encodeURIComponent(childId)}`;

  const reschedule = () => {
    if (!session) return;
    onOpenChange(false);
    navigate(lessonsPath, {
      state: {
        sessionId: session.id,
        flow: 'reschedule',
        returnTo: calendarReturn,
      },
    });
  };

  const cancel = () => {
    if (!session) return;
    onOpenChange(false);
    navigate(lessonsPath, {
      state: {
        sessionId: session.id,
        flow: 'cancel',
        returnTo: calendarReturn,
      },
    });
  };

  const viewCalendar = () => {
    onOpenChange(false);
    navigate(`/parent/calendar?studentId=${childId}`);
  };

  return (
    <Dialog open={open && !!session} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] sm:max-w-xl max-h-[90vh] overflow-y-auto">
        {!session ? null : (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <CalendarDays className="w-5 h-5 text-indigo-600" />
                {t('studentDash.sessionInfo')}
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-4 py-3">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-xl font-black text-gray-900 leading-tight">
                {headline}
              </p>
              {session.isGroupSubject && (
                <span className="bg-violet-100 text-violet-700 px-2.5 py-1 rounded-full text-xs font-bold flex items-center gap-1">
                  <Users className="w-3.5 h-3.5" />
                  {t('studentDash.groupLesson')}
                </span>
              )}
            </div>
            {childName && (
              <p className="text-xs text-gray-500 mt-1 font-semibold">
                {t('parent.forChild', { name: childName })}
              </p>
            )}
            <div className="flex items-center gap-2 mt-2 text-gray-600 font-medium">
              <Clock className="w-4 h-4" />
              <span>
                {format(new Date(session.start_time), 'EEEE, MMMM d', {
                  locale: dateFnsLocale,
                })}
                {' · '}
                {format(new Date(session.start_time), 'HH:mm')}
                {' – '}
                {format(new Date(session.end_time), 'HH:mm')}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            <div className="bg-gray-50 rounded-xl p-4 text-center border border-gray-100">
              <p className="text-xs text-gray-400 mb-1 font-semibold uppercase tracking-wider">
                {t('studentDash.priceLabel')}
              </p>
              <p className="font-bold text-gray-900">
                {session.price != null ? `€${session.price}` : '–'}
              </p>
            </div>
            <div className="bg-gray-50 rounded-xl p-4 text-center border border-gray-100 flex flex-col items-center justify-center">
              <p className="text-xs text-gray-400 mb-2 font-semibold uppercase tracking-wider">
                {t('studentDash.statusLabel')}
              </p>
              <StatusBadge
                status={session.status}
                paymentStatus={session.payment_status}
                paid={session.paid}
                endTime={session.end_time}
              />
            </div>
          </div>

          {session.show_comment_to_student && session.tutor_comment && (
            <div className="p-3 rounded-xl bg-indigo-50 border border-indigo-100">
              <p className="text-xs font-semibold text-indigo-600 uppercase tracking-wider mb-1">
                {t('studentDash.tutorComment')}
              </p>
              <div className="text-sm text-indigo-900 whitespace-pre-wrap">
                {session.tutor_comment}
              </div>
            </div>
          )}

          {session.meeting_link && session.status !== 'cancelled' && (
            <a
              href={normalizeUrl(session.meeting_link) || undefined}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-center gap-2 w-full py-3 rounded-xl bg-indigo-50 text-indigo-600 font-bold hover:bg-indigo-100 transition-colors border border-indigo-100"
            >
              <Play className="w-4 h-4" />
              {t('studentDash.joinMeeting')}
            </a>
          )}

          <WhiteboardButton roomId={(session as any)?.whiteboard_room_id} />

          {tutorPolicy && session.status === 'active' && (
            <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 space-y-1.5">
              <div className="flex items-start gap-2">
                <ShieldAlert className="w-4 h-4 mt-0.5 flex-shrink-0 text-amber-600" />
                <div>
                  <p className="font-bold uppercase tracking-wider text-amber-700 text-[11px] mb-0.5">
                    {t('stuSched.cancelRules')}
                  </p>
                  <p>
                    <span
                      dangerouslySetInnerHTML={{
                        __html: t('stuSched.cancelFreeNote', {
                          hours: String(tutorPolicy.cancellationHours),
                        }),
                      }}
                    />
                    {tutorPolicy.cancellationFeePercent > 0 ? (
                      <span
                        dangerouslySetInnerHTML={{
                          __html: t('stuSched.cancelFeeNote', {
                            percent: String(tutorPolicy.cancellationFeePercent),
                          }),
                        }}
                      />
                    ) : (
                      <span> {t('stuSched.noPenalty')}</span>
                    )}
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-2 pt-1 border-t border-amber-200/70">
                <Info className="w-4 h-4 mt-0.5 flex-shrink-0 text-amber-600" />
                <div>
                  <p className="font-bold uppercase tracking-wider text-amber-700 text-[11px] mb-0.5">
                    {t('stuSched.payment')}
                  </p>
                  <p>
                    {tutorPolicy.paymentTiming === 'after_lesson'
                      ? t('parent.paymentAfterLesson')
                      : t('parent.paymentBeforeLesson')}
                    {' · '}
                    {tutorPolicy.paymentTiming === 'after_lesson'
                      ? t('parent.paymentDeadlineAfter', {
                          hours: String(tutorPolicy.paymentDeadlineHours),
                        })
                      : t('parent.paymentDeadlineBefore', {
                          hours: String(tutorPolicy.paymentDeadlineHours),
                        })}
                  </p>
                </div>
              </div>
            </div>
          )}

          {session.status === 'active' &&
            !session.paid &&
            isAfter(new Date(session.end_time), now) && (
              <button
                type="button"
                disabled={stripeLoading}
                onClick={() => void payWithStripe()}
                className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 text-white font-bold hover:from-violet-700 hover:to-indigo-700 transition-all shadow-md disabled:opacity-60"
              >
                {stripeLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <CreditCard className="w-4 h-4" />
                )}
                {t('studentDash.pay')}
                {session.price != null ? ` · €${session.price}` : ''}
              </button>
            )}

          {tutorPolicy && (
            <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
              <p className="text-xs text-gray-400 mb-1 font-semibold uppercase tracking-wider">
                {t('studentDash.tutorLabel')}
              </p>
              <p className="font-semibold text-gray-900 text-sm">
                {tutorPolicy.tutorName ?? '—'}
              </p>
              {tutorPolicy.tutorEmail && (
                <a
                  href={`mailto:${tutorPolicy.tutorEmail}`}
                  className="text-xs text-indigo-600 hover:underline flex items-center gap-1 mt-0.5"
                >
                  <Mail className="w-3 h-3" />
                  {tutorPolicy.tutorEmail}
                </a>
              )}
              {tutorPolicy.tutorPhone && (
                <p className="text-xs text-gray-700 mt-1 flex items-center gap-1">
                  <Phone className="w-3 h-3" />
                  {tutorPolicy.tutorPhone}
                </p>
              )}
            </div>
          )}

          {session.status === 'active' &&
            isAfter(new Date(session.start_time), now) &&
            childId && (
              <div className="flex flex-col sm:flex-row gap-2 pt-1">
                <Button
                  variant="outline"
                  onClick={reschedule}
                  className="flex-1 rounded-xl border-indigo-200 text-indigo-700 hover:bg-indigo-50 hover:border-indigo-300"
                >
                  {t('studentDash.reschedule')}
                </Button>
                <Button
                  variant="outline"
                  onClick={cancel}
                  className="flex-1 rounded-xl border-red-200 text-red-600 hover:bg-red-50"
                >
                  {t('studentDash.cancelLesson')}
                </Button>
              </div>
            )}

          {childId && (
            <Button
              variant="ghost"
              type="button"
              onClick={viewCalendar}
              className="w-full rounded-xl text-gray-600 hover:text-gray-900"
            >
              {t('parent.viewAll')}
              <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          )}
        </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
