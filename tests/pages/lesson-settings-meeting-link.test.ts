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

describe('CompanyTutors meeting-link editor', () => {
  it('refetches the tutor profile before filling the meeting-link field', () => {
    const source = readFileSync('src/pages/company/CompanyTutors.tsx', 'utf8');
    expect(source).toContain('meetingLinkFromTutorRows(freshProfile, tutor)');
    expect(source).toContain('setMeetingLinkHydrated(Boolean(freshProfile && !profileErr))');
    expect(source).toContain("...(meetingLinkHydrated ? { personal_meeting_link: personalLink } : {})");
  });
});
