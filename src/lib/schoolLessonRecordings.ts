/**
 * Match a Google Drive Meet recording to a Tutlio session, then decide
 * which class groups may view it.
 */
export type RecordingIngestMeta = {
  drive_file_id: string;
  name: string;
  created_at: string;
  duration_minutes?: number | null;
  meet_conference_id?: string | null;
};

export type RecordingMatchSession = {
  id: string;
  start_time: string;
  end_time?: string | null;
  meeting_link?: string | null;
  class_group_id?: string | null;
};

const MATCH_WINDOW_MS = 20 * 60 * 1000;

export function matchRecordingToSession(
  rec: RecordingIngestMeta,
  sessions: RecordingMatchSession[],
): RecordingMatchSession | null {
  const recMs = Date.parse(rec.created_at);
  if (!Number.isFinite(recMs) || sessions.length === 0) return null;

  if (rec.meet_conference_id) {
    const byMeet = sessions.find((s) => (s.meeting_link || '').includes(rec.meet_conference_id!));
    if (byMeet) return byMeet;
  }

  let best: { session: RecordingMatchSession; dist: number } | null = null;
  for (const session of sessions) {
    const start = Date.parse(session.start_time);
    if (!Number.isFinite(start)) continue;
    const dist = Math.abs(recMs - start);
    if (dist > MATCH_WINDOW_MS) continue;
    if (!best || dist < best.dist) best = { session, dist };
  }
  return best?.session || null;
}

export function groupsCanViewRecording(
  assignedGroupIds: string[],
  viewerGroupIds: string[],
): boolean {
  if (!assignedGroupIds.length) return false;
  return viewerGroupIds.some((id) => assignedGroupIds.includes(id));
}
