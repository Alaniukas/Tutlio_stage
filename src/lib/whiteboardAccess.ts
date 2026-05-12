/** After lesson end, whiteboard stays open this long while session status is `completed`. */
export const WHITEBOARD_GRACE_MS_AFTER_LESSON_END = 2 * 60 * 60 * 1000;

function sessionEndToMs(endTime: string | Date | number | null | undefined): number | null {
  if (endTime == null) return null;
  if (typeof endTime === 'number' && Number.isFinite(endTime)) return endTime;
  if (endTime instanceof Date) {
    const ms = endTime.getTime();
    return Number.isFinite(ms) ? ms : null;
  }
  if (typeof endTime === 'string') {
    const ms = new Date(endTime).getTime();
    return Number.isFinite(ms) ? ms : null;
  }
  return null;
}

/**
 * Whiteboard is available until `end_time` + 2h once the session is marked completed; then UI hides the button and /whiteboard blocks access.
 */
export function isWhiteboardOpenForSession(
  status: string | null | undefined,
  endTime: string | Date | number | null | undefined,
): boolean {
  if (status !== 'completed') return true;
  const endMs = sessionEndToMs(endTime);
  if (endMs == null) return false;
  return Date.now() < endMs + WHITEBOARD_GRACE_MS_AFTER_LESSON_END;
}
