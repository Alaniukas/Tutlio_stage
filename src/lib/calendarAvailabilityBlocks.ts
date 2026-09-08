type AvailabilityBlock = {
  id: string;
  tutorId: string;
  start: Date;
  end: Date;
};

type BusySession = {
  tutor_id: string;
  start_time: Date;
  end_time: Date;
  status: string;
};

/** Keep availability rules intact; render only their unoccupied portions. */
export function subtractSessionsFromAvailability<T extends AvailabilityBlock>(
  blocks: T[],
  sessions: BusySession[],
): T[] {
  const byTutor = new Map<string, BusySession[]>();
  for (const session of sessions) {
    if (session.status === 'cancelled' || !(session.end_time > session.start_time)) continue;
    const busy = byTutor.get(session.tutor_id) ?? [];
    busy.push(session);
    byTutor.set(session.tutor_id, busy);
  }

  return blocks.flatMap(block => {
    let free = [{ start: block.start, end: block.end }];
    for (const session of byTutor.get(block.tutorId) ?? []) {
      free = free.flatMap(part => {
        if (session.start_time >= part.end || session.end_time <= part.start) return [part];
        const remaining: { start: Date; end: Date }[] = [];
        if (session.start_time > part.start) remaining.push({ start: part.start, end: session.start_time });
        if (session.end_time < part.end) remaining.push({ start: session.end_time, end: part.end });
        return remaining;
      });
    }
    return free.filter(part => part.end > part.start).map(part => ({
      ...block,
      ...part,
      id: `${block.id}-${part.start.getTime()}-${part.end.getTime()}`,
    }));
  });
}
