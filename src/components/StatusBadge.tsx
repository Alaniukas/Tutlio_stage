import { cn } from '@/lib/utils';
import { CreditCard, CheckCircle, Clock, XCircle, UserX, AlertCircle } from 'lucide-react';
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
    /** When set, past `active` sessions are treated as occurred for display (until marked completed). */
    endTime?: string | Date | null;
}

export default function StatusBadge({
    status,
    paymentStatus,
    paid,
    isTrial,
    className,
    noShowDetail,
    orgTutorCopy,
    hidePaymentStatus,
    endTime,
}: StatusBadgeProps) {
    const { t } = useTranslation();

    const ended = lessonHasEnded(endTime);

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

    return (
        <span className={cn("inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-orange-100 text-orange-700 text-xs font-medium", className)}>
            <Clock className="w-3.5 h-3.5" />
            {orgTutorCopy ? t('status.reservedUnconfirmed') : t('status.awaitingPayment')}
        </span>
    );
}
