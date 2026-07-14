import { cn } from '@/lib/utils';
import { CreditCard, CheckCircle, Clock, XCircle, UserX, AlertCircle, RefreshCw } from 'lucide-react';
import { useTranslation } from '@/lib/i18n';

function lessonHasEnded(endTime?: string | Date | null): boolean {
    if (endTime == null || endTime === '') return false;
    const ms = typeof endTime === 'string' ? new Date(endTime).getTime() : endTime.getTime();
    return Number.isFinite(ms) && ms < Date.now();
}

interface StatusBadgeProps {
    status: string;
    paymentStatus?: string;
    paid?: boolean;
    isTrial?: boolean;
    className?: string;
    noShowDetail?: string | null;
    orgTutorCopy?: boolean;
    hidePaymentStatus?: boolean;
    /** Unpaid active lessons show "Rezervuota" (e.g. monthly billing — no per-lesson payment). */
    treatUnpaidAsReserved?: boolean;
    /** When set, past `active` sessions are treated as occurred for display (until marked completed). */
    endTime?: string | Date | null;
    /** Lesson was rescheduled (req 6, monthly_packages) — shows a secondary "moved" chip. */
    moved?: boolean;
    /**
     * Org feature tutor_lesson_status_confirmation: past `active` lessons are NOT
     * auto-completed — show "status needed" instead of deriving "completed".
     */
    pendingConfirmation?: boolean;
}

export default function StatusBadge(props: StatusBadgeProps) {
    const { t } = useTranslation();
    if (!props.moved) return <StatusBadgeBase {...props} />;
    return (
        <span className="inline-flex items-center gap-1 flex-wrap">
            <StatusBadgeBase {...props} />
            <span
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-amber-100 text-amber-800 text-[10px] font-medium"
                title={t('status.movedHint')}
            >
                <RefreshCw className="w-3 h-3" />
                {t('status.moved')}
            </span>
        </span>
    );
}

function StatusBadgeBase({
    status,
    paymentStatus,
    paid,
    isTrial,
    className,
    noShowDetail,
    orgTutorCopy,
    hidePaymentStatus,
    treatUnpaidAsReserved,
    endTime,
    pendingConfirmation,
}: StatusBadgeProps) {
    const { t } = useTranslation();

    const ended = lessonHasEnded(endTime);

    if (pendingConfirmation && status === 'active' && ended) {
        return (
            <span className={cn("inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-amber-100 text-amber-800 text-xs font-medium", className)}>
                <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                {t('status.needsStatusConfirmation')}
            </span>
        );
    }

    if (status === 'cancelled') {
        return (
            <span className={cn("inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-red-100 text-red-700 text-xs font-medium", className)}>
                <XCircle className="w-3.5 h-3.5" />
                {t('status.cancelled')}
            </span>
        );
    }

    if (status === 'no_show') {
        return (
            <span className={cn("inline-flex flex-col items-start gap-0.5 px-2 py-0.5 rounded-md bg-rose-100 text-rose-800 text-xs font-medium", className)}>
                <span className="inline-flex items-center gap-1.5">
                    <UserX className="w-3.5 h-3.5 flex-shrink-0" />
                    {t('status.noShow')}
                </span>
                {noShowDetail ? (
                    <span className="text-[10px] font-normal text-rose-700/90 pl-5 leading-tight">{noShowDetail}</span>
                ) : null}
            </span>
        );
    }

    if (hidePaymentStatus) {
        if (status === 'completed' || (status === 'active' && ended)) {
            return (
                <span className={cn("inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-700 text-xs font-medium", className)}>
                    <CheckCircle className="w-3.5 h-3.5" />
                    {t('status.completed')}
                </span>
            );
        }
        return (
            <span className={cn("inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-indigo-100 text-indigo-700 text-xs font-medium", className)}>
                <Clock className="w-3.5 h-3.5" />
                {t('status.reserved')}
            </span>
        );
    }

    if (status === 'completed' && paid) {
        return (
            <span className={cn("inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-700 text-xs font-medium", className)}>
                <CheckCircle className="w-3.5 h-3.5" />
                {t('status.completed')}
            </span>
        );
    }

    const showOccurredUnpaid =
        !paid &&
        paymentStatus !== 'paid_by_student' &&
        (status === 'completed' || (status === 'active' && ended));

    if (showOccurredUnpaid) {
        return (
            <span className={cn("inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-amber-100 text-amber-800 text-xs font-medium", className)}>
                <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                {t('status.completedUnpaid')}
            </span>
        );
    }

    // Trial reservation soft-hold: slot is held until the trial is paid. Once
    // paid, payment_status flips to 'paid' and this no longer applies.
    if (paymentStatus === 'reserved' && !paid) {
        return (
            <span className={cn("inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-violet-100 text-violet-700 text-xs font-medium", className)}>
                <Clock className="w-3.5 h-3.5" />
                {t('status.reservedAwaitingPayment')}
            </span>
        );
    }

    if (orgTutorCopy && isTrial) {
        return (
            <span className={cn("inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-amber-100 text-amber-800 text-xs font-medium", className)}>
                <Clock className="w-3.5 h-3.5" />
                {t('status.trialLesson')}
            </span>
        );
    }

    if (paid) {
        return (
            <span className={cn("inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-700 text-xs font-medium", className)}>
                <CheckCircle className="w-3.5 h-3.5" />
                {orgTutorCopy ? t('status.reservedConfirmed') : t('status.reservedPaid')}
            </span>
        );
    }

    if (paymentStatus === 'paid_by_student') {
        return (
            <span className={cn("inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-amber-100 text-amber-700 text-xs font-medium", className)}>
                <CreditCard className="w-3.5 h-3.5" />
                {t('status.awaitingConfirmation')}
            </span>
        );
    }

    const reservedWithoutPerLessonPayment =
        !paid &&
        status === 'active' &&
        !ended &&
        (treatUnpaidAsReserved || paymentStatus === 'confirmed');

    if (reservedWithoutPerLessonPayment) {
        return (
            <span className={cn("inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-indigo-100 text-indigo-700 text-xs font-medium", className)}>
                <Clock className="w-3.5 h-3.5" />
                {t('status.reserved')}
            </span>
        );
    }

    return (
        <span className={cn("inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-orange-100 text-orange-700 text-xs font-medium", className)}>
            <Clock className="w-3.5 h-3.5" />
            {orgTutorCopy ? t('status.reservedUnconfirmed') : t('status.awaitingPayment')}
        </span>
    );
}
