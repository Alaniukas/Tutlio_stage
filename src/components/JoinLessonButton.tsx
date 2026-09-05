import { useEffect, useState, type MouseEvent, type ReactNode } from 'react';
import { format, isSameDay } from 'date-fns';
import { JOIN_CLICK_WINDOW_BEFORE_MS, isWithinJoinClickWindow } from '@/lib/attendance';
import { recordJoinClick, type JoinClickSession } from '@/lib/joinTracking';
import { useTranslation } from '@/lib/i18n';
import { cn, normalizeUrl } from '@/lib/utils';

const TICK_MS = 30_000;

/** Re-renders every 30 s so the button flips to active exactly when the join window opens. */
export function useJoinClock(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), TICK_MS);
    return () => window.clearInterval(id);
  }, []);
  return now;
}

export function joinWindowOpensAt(startTime: string): Date | null {
  const ms = Date.parse(startTime);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms - JOIN_CLICK_WINDOW_BEFORE_MS);
}

/** Short label for when the link becomes clickable: "18:30" today, otherwise "09-11 18:30". */
export function joinOpensAtLabel(startTime: string, now: Date): string {
  const opensAt = joinWindowOpensAt(startTime);
  if (!opensAt) return '';
  return format(opensAt, isSameDay(opensAt, now) ? 'HH:mm' : 'MM-dd HH:mm');
}

export type JoinLessonButtonSession = JoinClickSession & { meeting_link?: string | null };

/**
 * "Join lesson" link for students / parents. The Meet link is identical for
 * every lesson of a group, so a click on the wrong day used to look like an
 * early join. The button is live only inside the attendance window (30 min
 * before start until the end); outside it stays visible but inert and says
 * when it opens, so no one "attends" Thursday's lesson on Monday.
 */
export default function JoinLessonButton({
  session,
  side = 'student',
  className,
  inactiveClassName,
  hintClassName,
  showHint = true,
  stopPropagation = false,
  children,
}: {
  session: JoinLessonButtonSession;
  side?: 'student' | 'tutor';
  className?: string;
  /** Extra classes while the window is closed (defaults to a muted look). */
  inactiveClassName?: string;
  hintClassName?: string;
  /** Render the "opens at" line under the inactive button. Icon-only buttons use the title instead. */
  showHint?: boolean;
  stopPropagation?: boolean;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const now = useJoinClock();
  const href = normalizeUrl(session.meeting_link || '') || undefined;
  if (!href || session.status === 'cancelled') return null;

  const active = isWithinJoinClickWindow(now, session.start_time, session.end_time);
  const hint = t('lesson.joinOpensAt', { time: joinOpensAtLabel(session.start_time, now) });

  if (active) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        onClick={(e: MouseEvent) => {
          if (stopPropagation) e.stopPropagation();
          recordJoinClick(session, side);
        }}
        className={className}
      >
        {children}
      </a>
    );
  }

  const ended = Date.parse(session.end_time || '') < now.getTime();
  return (
    <span className={cn(showHint ? 'flex flex-col items-stretch gap-1' : 'contents')}>
      <span
        role="link"
        aria-disabled="true"
        title={ended ? undefined : hint}
        onClick={(e: MouseEvent) => {
          e.preventDefault();
          if (stopPropagation) e.stopPropagation();
        }}
        className={cn(className, inactiveClassName ?? 'opacity-50 cursor-not-allowed grayscale-[35%]')}
      >
        {children}
      </span>
      {showHint && !ended && (
        <span className={cn('text-[11px] text-center text-gray-500', hintClassName)}>{hint}</span>
      )}
    </span>
  );
}
