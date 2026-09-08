import { describe, expect, it, vi } from 'vitest';
import { normalizeLessonMeetingLink, resolveSessionMeetingLink } from '../../api/_lib/sessionMeetingLink';
describe('lesson meeting link', () => {
  it('uses the saved meeting without any extra database requests', async () => {
    const db = { from: vi.fn() } as any;
    expect(await resolveSessionMeetingLink(db, { meeting_link: 'https://meet.google.com/abc' })).toBe('https://meet.google.com/abc');
    expect(db.from).not.toHaveBeenCalled();
  });
  it('falls back to the subject then personal link using the session teacher', async () => {
    const filters: any[] = [];
    const db = { from: vi.fn((table: string) => {
      const q: any = { select: () => q, eq: (key: string, value: string) => { filters.push([key, value]); return q; },
        maybeSingle: async () => ({ data: table === 'subjects' ? { meeting_link: '' } : { personal_meeting_link: 'meet.google.com/abc' }, error: null }) };
      return q;
    }) } as any;
    expect(await resolveSessionMeetingLink(db, { tutor_id: 't1', subject_id: 's1' })).toBe('https://meet.google.com/abc');
    expect(filters).toContainEqual(['tutor_id','t1']);
  });
  it('rejects executable and malformed links', () => {
    expect(normalizeLessonMeetingLink('javascript:alert(1)')).toBeNull();
    expect(normalizeLessonMeetingLink('not a link')).toBeNull();
  });
});
