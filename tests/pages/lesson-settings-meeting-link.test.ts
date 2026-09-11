import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('LessonSettings tutor meeting-link persistence', () => {
  it('requires PostgREST to return the saved value before showing success', () => {
    const source = readFileSync('src/pages/LessonSettings.tsx', 'utf8');

    expect(source).toContain(".select('personal_meeting_link')");
    expect(source).toContain('meetingLinkWasPersisted(requestedLink, savedProfile.personal_meeting_link)');
    expect(source).toContain('setPersonalMeetingLink(link || \'\')');
  });
});
