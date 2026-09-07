import { supabase } from '@/lib/supabase';
import { isWithinJoinClickWindow } from '@/lib/attendance';

export interface JoinClickSession {
  id: string;
  tutor_id?: string | null;
  start_time: string;
  end_time?: string | null;
  status?: string | null;
}

/**
 * Attendance tracking for in-app "join lesson" buttons. Fire-and-forget:
 * call from onClick while the anchor href opens the meeting link as usual.
 * Records only the FIRST click per side, only within the join window
 * (30 min before start until lesson end). Parents count as the student side.
 */
export function recordJoinClick(
  session: JoinClickSession,
  side: 'tutor' | 'student',
): void {
  try {
    if (!session?.id || session.status === 'cancelled') return;
    if (!isWithinJoinClickWindow(new Date(), session.start_time, session.end_time)) return;

    const joinedAt = new Date().toISOString();
    let update;
    if (side === 'tutor' && session.tutor_id) {
      // Group lessons share one slot across several session rows — one tutor
      // click counts for every parallel row of that slot.
      update = supabase
        .from('sessions')
        .update({ tutor_joined_at: joinedAt })
        .eq('tutor_id', session.tutor_id)
        .eq('start_time', session.start_time)
        .neq('status', 'cancelled')
        .is('tutor_joined_at', null);
    } else if (side === 'tutor') {
      update = supabase
        .from('sessions')
        .update({ tutor_joined_at: joinedAt })
        .eq('id', session.id)
        .is('tutor_joined_at', null);
    } else {
      update = supabase
        .from('sessions')
        .update({ student_joined_at: joinedAt })
        .eq('id', session.id)
        .is('student_joined_at', null);
    }

    void update.then(({ error }) => {
      if (error) console.error('[joinTracking] failed to record join click:', error.message);
    });
  } catch (e) {
    console.error('[joinTracking] error:', e);
  }
}
