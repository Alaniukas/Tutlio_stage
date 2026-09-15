import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CheckCircle2, XCircle, User, Users, UserX, CalendarDays, Wallet } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import type { OrgSessionStatChip } from '@/lib/session-stats';

interface SessionStatCardsProps {
  totalSuccessful: number;
  totalStudentNoShow: number;
  totalCancelled: number;
  showCancellationDetails?: boolean;
  cancelledByTutor?: number;
  cancelledByStudent?: number;
  totalUpcoming?: number;
  totalUnpaidPast?: number;
  showUnpaidPast?: boolean;
  activeFilter?: OrgSessionStatChip | null;
  onFilterClick?: (chip: OrgSessionStatChip) => void;
}

export function SessionStatCards({
  totalSuccessful,
  totalStudentNoShow,
  totalCancelled,
  showCancellationDetails = false,
  cancelledByTutor = 0,
  cancelledByStudent = 0,
  totalUpcoming,
  totalUnpaidPast = 0,
  showUnpaidPast = false,
  activeFilter = null,
  onFilterClick,
}: SessionStatCardsProps) {
  const { t } = useTranslation();
  const showUpcoming = totalUpcoming != null;
  const interactive = typeof onFilterClick === 'function';

  return (
    <div
      className={cn(
        'grid gap-4',
        showUnpaidPast && showCancellationDetails
          ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6'
          : showUnpaidPast || showUpcoming
            ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'
            : showCancellationDetails
              ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-5'
              : 'grid-cols-1 sm:grid-cols-3',
      )}
    >
      {showUpcoming && (
        <StatCard
          title={t('companyDash.upcomingLessons')}
          value={totalUpcoming}
          hint={t('stats.inSelectedPeriod')}
          icon={<CalendarDays className="h-4 w-4 text-indigo-600" />}
          valueClass="text-indigo-600"
        />
      )}
      <StatCard
        title={t('stats.occurredLessons')}
        value={totalSuccessful}
        hint={interactive ? t('stats.clickToFilter') : t('stats.completedExcludingNoShow')}
        icon={<CheckCircle2 className="h-4 w-4 text-green-600" />}
        valueClass="text-green-600"
        selected={activeFilter === 'occurred'}
        onClick={interactive ? () => onFilterClick!('occurred') : undefined}
      />

      <StatCard
        title={t('stats.studentNoShow')}
        value={totalStudentNoShow}
        hint={interactive ? t('stats.clickToFilter') : t('stats.failedDueToNoShow')}
        icon={<UserX className="h-4 w-4 text-rose-600" />}
        valueClass="text-rose-600"
        selected={activeFilter === 'no_show'}
        onClick={interactive ? () => onFilterClick!('no_show') : undefined}
      />

      {showUnpaidPast && (
        <StatCard
          title={t('stats.unpaidPastLessons')}
          value={totalUnpaidPast}
          hint={t('stats.unpaidPastHint')}
          icon={<Wallet className="h-4 w-4 text-amber-600" />}
          valueClass="text-amber-700"
          selected={activeFilter === 'unpaid_past'}
          onClick={interactive ? () => onFilterClick!('unpaid_past') : undefined}
        />
      )}

      <StatCard
        title={t('stats.cancelledLessons')}
        value={totalCancelled}
        hint={interactive ? t('stats.clickToFilter') : t('stats.inSelectedPeriod')}
        icon={<XCircle className="h-4 w-4 text-red-600" />}
        valueClass="text-red-600"
        selected={activeFilter === 'cancelled'}
        onClick={interactive ? () => onFilterClick!('cancelled') : undefined}
      />

      {showCancellationDetails && (
        <>
          <StatCard
            title={t('stats.cancelledByTutor')}
            value={cancelledByTutor}
            hint={t('stats.outOfCancelled', { count: totalCancelled })}
            icon={<User className="h-4 w-4 text-orange-600" />}
            valueClass="text-orange-600"
            selected={activeFilter === 'cancelled_tutor'}
            onClick={interactive ? () => onFilterClick!('cancelled_tutor') : undefined}
          />

          <StatCard
            title={t('stats.cancelledByStudent')}
            value={cancelledByStudent}
            hint={t('stats.outOfCancelled', { count: totalCancelled })}
            icon={<Users className="h-4 w-4 text-blue-600" />}
            valueClass="text-blue-600"
            selected={activeFilter === 'cancelled_student'}
            onClick={interactive ? () => onFilterClick!('cancelled_student') : undefined}
          />
        </>
      )}
    </div>
  );
}

function StatCard({
  title,
  value,
  hint,
  icon,
  valueClass,
  selected = false,
  onClick,
}: {
  title: string;
  value: number;
  hint: string;
  icon: ReactNode;
  valueClass: string;
  selected?: boolean;
  onClick?: () => void;
}) {
  const body = (
    <>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        {icon}
      </CardHeader>
      <CardContent>
        <div className={cn('text-2xl font-bold', valueClass)}>{value}</div>
        <p className="text-xs text-muted-foreground mt-1">{hint}</p>
      </CardContent>
    </>
  );

  if (!onClick) {
    return <Card>{body}</Card>;
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        'w-full cursor-pointer rounded-xl text-left transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400',
        selected ? 'ring-2 ring-indigo-400 shadow-sm' : 'hover:shadow-sm',
      )}
    >
      <Card className={cn('h-full', selected && 'border-indigo-200 bg-indigo-50/40')}>{body}</Card>
    </button>
  );
}
