import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CheckCircle2, XCircle, User, Users, UserX } from 'lucide-react';
import { useTranslation } from '@/lib/i18n';
import { cn } from '@/lib/utils';

interface SessionStatCardsProps {
  totalSuccessful: number;
  totalStudentNoShow: number;
  totalCancelled: number;
  showCancellationDetails?: boolean;
  cancelledByTutor?: number;
  cancelledByStudent?: number;
}

export function SessionStatCards({
  totalSuccessful,
  totalStudentNoShow,
  totalCancelled,
  showCancellationDetails = false,
  cancelledByTutor = 0,
  cancelledByStudent = 0,
}: SessionStatCardsProps) {
  const { t } = useTranslation();

  return (
    <div
      className={cn(
        'grid gap-4',
        showCancellationDetails ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-5' : 'grid-cols-1 sm:grid-cols-3'
      )}
    >
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">
            {t('stats.occurredLessons')}
          </CardTitle>
          <CheckCircle2 className="h-4 w-4 text-green-600" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-green-600">
            {totalSuccessful}
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {t('stats.completedExcludingNoShow')}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">
            {t('stats.studentNoShow')}
          </CardTitle>
          <UserX className="h-4 w-4 text-rose-600" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-rose-600">
            {totalStudentNoShow}
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {t('stats.failedDueToNoShow')}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">
            {t('stats.cancelledLessons')}
          </CardTitle>
          <XCircle className="h-4 w-4 text-red-600" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-red-600">
            {totalCancelled}
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {t('stats.inSelectedPeriod')}
          </p>
        </CardContent>
      </Card>

      {showCancellationDetails && (
        <>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                {t('stats.cancelledByTutor')}
              </CardTitle>
              <User className="h-4 w-4 text-orange-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-orange-600">
                {cancelledByTutor}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {t('stats.outOfCancelled', { total: totalCancelled })}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                {t('stats.cancelledByStudent')}
              </CardTitle>
              <Users className="h-4 w-4 text-blue-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-600">
                {cancelledByStudent}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {t('stats.outOfCancelled', { total: totalCancelled })}
              </p>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
