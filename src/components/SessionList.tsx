import { format } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Clock, User, Users, AlertCircle } from 'lucide-react';
import { useTranslation } from '@/lib/i18n';
import type { Session } from '@/lib/session-stats';

interface SessionListProps {
  sessions: Session[];
  groupBy?: 'status' | 'none';
  showStudent?: boolean;
  showTutor?: boolean;
  onSessionClick?: (session: Session) => void;
}

export function SessionList({
  sessions,
  groupBy = 'status',
  showStudent = false,
  showTutor = false,
  onSessionClick,
}: SessionListProps) {
  const { t, dateFnsLocale } = useTranslation();

  if (sessions.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <AlertCircle className="h-12 w-12 mx-auto mb-2 opacity-50" />
        <p>{t('sessions.noSessionsInPeriod')}</p>
      </div>
    );
  }

  const renderSession = (session: Session) => {
    const startTime = new Date(session.start_time);
    const endTime = new Date(session.end_time);
    const now = new Date();
    const isCancelled = session.status === 'cancelled';
    const isNoShow = session.status === 'no_show';
    const isPast = endTime.getTime() < now.getTime();
    const isCompleted = !isCancelled && !isNoShow && isPast;

    return (
      <Card
        key={session.id}
        className={`mb-3 ${onSessionClick ? 'cursor-pointer hover:shadow-md transition-shadow' : ''}`}
        onClick={onSessionClick ? () => onSessionClick(session) : undefined}
      >
        <CardContent className="p-4">
          <div className="flex items-start justify-between">
            <div className="flex-1 space-y-2">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">
                  {format(startTime, 'd MMMM yyyy, HH:mm', { locale: dateFnsLocale })}
                </span>
                <span className="text-muted-foreground">-</span>
                <span className="text-muted-foreground">
                  {format(endTime, 'HH:mm')}
                </span>
              </div>

              {showStudent && session.student?.full_name && (
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">{session.student.full_name}</span>
                </div>
              )}

              {showTutor && session.tutor?.full_name && (
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">{session.tutor.full_name}</span>
                </div>
              )}

              {session.topic && (
                <p className="text-sm text-muted-foreground">{session.topic}</p>
              )}

              {isCancelled && (
                <div className="flex items-center gap-2 text-sm">
                  {session.cancelled_by === 'tutor' && (
                    <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200">
                      {t('sessions.cancelledByTutor')}
                    </Badge>
                  )}
                  {session.cancelled_by === 'student' && (
                    <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                      {t('sessions.cancelledByStudent')}
                    </Badge>
                  )}
                  {!session.cancelled_by && (
                    <Badge variant="outline" className="bg-gray-50 text-gray-700 border-gray-200">
                      {t('sessions.cancelledUnknown')}
                    </Badge>
                  )}
                </div>
              )}

              {isCancelled && session.cancellation_reason && (
                <p className="text-sm text-muted-foreground italic">
                  {t('sessions.cancellationReason', { reason: session.cancellation_reason })}
                </p>
              )}
            </div>

            <div>
              {isCompleted && (
                <Badge className="bg-green-600">{t('status.occurred')}</Badge>
              )}
              {isCancelled && (
                <Badge variant="destructive">{t('status.cancelled')}</Badge>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  if (groupBy === 'status') {
    const now = new Date();
    const occurredSessions = sessions.filter(
      (s) =>
        s.status !== 'cancelled' &&
        new Date(s.end_time).getTime() < now.getTime()
    );
    const cancelledSessions = sessions.filter((s) => s.status === 'cancelled');

    return (
      <div className="space-y-6">
        {occurredSessions.length > 0 && (
          <div>
            <h4 className="font-semibold mb-3 text-green-700">
              {t('sessions.occurredSessions', { count: occurredSessions.length })}
            </h4>
            {occurredSessions.map(renderSession)}
          </div>
        )}

        {cancelledSessions.length > 0 && (
          <div>
            <h4 className="font-semibold mb-3 text-red-700">
              {t('sessions.cancelledSessions', { count: cancelledSessions.length })}
            </h4>
            {cancelledSessions.map(renderSession)}
          </div>
        )}
      </div>
    );
  }

  return <div className="space-y-3">{sessions.map(renderSession)}</div>;
}
