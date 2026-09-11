import { describe, expect, it } from 'vitest';
import {
  enrichSessionMeetingLink,
  meetingLinkWasPersisted,
  normalizeMeetingLinkValue,
  resolveLessonMeetingLink,
  resolveSessionMeetingLink,
} from '../../src/lib/meetingLink';

describe('meeting-link persistence', () => {
  it('normalizes whitespace and empty database values', () => {
    expect(normalizeMeetingLinkValue('  https://meet.example/room  ')).toBe('https://meet.example/room');
    expect(normalizeMeetingLinkValue('   ')).toBeNull();
    expect(meetingLinkWasPersisted('', null)).toBe(true);
  });

  it('rejects a stale value returned after an update', () => {
    expect(meetingLinkWasPersisted('https://meet.example/new', 'https://meet.example/old')).toBe(false);
  });
});

describe('resolveSessionMeetingLink', () => {
  it('keeps explicit session link', () => {
    expect(
      resolveSessionMeetingLink({
        sessionLink: 'https://session.example',
        tutorPersonalLink: 'https://tutor.example',
        studentPersonalLink: 'https://student.example',
        subjectLink: 'https://subject.example',
      }),
    ).toBe('https://session.example');
  });

  it('falls back student → tutor → subject when session link empty', () => {
    expect(
      resolveSessionMeetingLink({
        sessionLink: null,
        tutorPersonalLink: 'https://tutor.example',
        subjectLink: 'https://subject.example',
      }),
    ).toBe('https://tutor.example');
    expect(resolveLessonMeetingLink({
      subjectLink: 'https://subject.example',
      tutorPersonalLink: null,
      studentPersonalLink: 'https://student.example',
    })).toBe('https://student.example');
  });
});

describe('enrichSessionMeetingLink', () => {
  it('fills meeting_link from tutor profile when session row is empty', () => {
    const studentsById = new Map([['s1', { personal_meeting_link: null }]]);
    const enriched = enrichSessionMeetingLink(
      { id: 'x', meeting_link: null, student_id: 's1', subject_id: 'sub1' },
      {
        tutorPersonalLink: 'https://meet.google.com/abc',
        studentsById,
        subjectsById: new Map([['sub1', { meeting_link: null }]]),
      },
    );
    expect(enriched.meeting_link).toBe('https://meet.google.com/abc');
  });
});
