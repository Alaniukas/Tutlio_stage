import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { loadStudentSessionMeetingLinks } from '@/lib/studentSessionMeetingLinks';

function clientFor(rows: Record<string, Array<Record<string, unknown>>>, deniedTable?: string) {
  const from = vi.fn((table: string) => ({
    select: () => ({
      in: async (_column: string, ids: string[]) => table === deniedTable
        ? { data: null, error: { code: '42501', message: 'permission denied' } }
        : { data: (rows[table] ?? []).filter((row) => ids.includes(String(row.id))), error: null },
    }),
  }));
  return { client: { from } as unknown as SupabaseClient, from };
}

describe('portal session meeting links', () => {
  it('resolves each lesson using its actual student and tutor while retaining explicit links', async () => {
    const { client } = clientFor({
      students: [{ id: 'student-a', personal_meeting_link: 'https://meet.example/student-a' }],
      profiles: [
        { id: 'tutor-a', personal_meeting_link: 'https://meet.example/tutor-a' },
        { id: 'tutor-b', personal_meeting_link: 'https://meet.example/tutor-b' },
      ],
      subjects: [{ id: 'subject', meeting_link: 'https://meet.example/subject' }],
    });
    const sessions = [
      { id: 'override', student_id: 'student-a', tutor_id: 'tutor-a', meeting_link: 'https://meet.example/session' },
      { id: 'student-link', student_id: 'student-a', tutor_id: 'tutor-a', meeting_link: null },
      { id: 'second-tutor', student_id: 'student-b', tutor_id: 'tutor-b', meeting_link: null },
      { id: 'subject-link', student_id: 'student-b', tutor_id: null, subject_id: 'subject', meeting_link: null },
      { id: 'pending', student_id: 'student-b', tutor_id: null, meeting_link: null },
    ];

    const resolved = await loadStudentSessionMeetingLinks(client, sessions);
    expect(resolved.map((row) => row.meeting_link)).toEqual([
      'https://meet.example/session',
      'https://meet.example/student-a',
      'https://meet.example/tutor-b',
      'https://meet.example/subject',
      null,
    ]);
    expect(sessions[2].meeting_link).toBeNull();
  });

  it('reuses loaded tutor and subject rows without refetching them', async () => {
    const { client, from } = clientFor({});
    const resolved = await loadStudentSessionMeetingLinks(client, [
      { tutor_id: 'tutor', subject_id: 'subject', meeting_link: null },
    ], {
      tutorsById: new Map([['tutor', { personal_meeting_link: 'https://meet.example/tutor' }]]),
      subjectsById: new Map([['subject', { meeting_link: 'https://meet.example/subject' }]]),
    });
    expect(resolved[0].meeting_link).toBe('https://meet.example/tutor');
    expect(from).not.toHaveBeenCalled();
  });

  it('preserves lessons and explicit links when an authenticated fallback read fails', async () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const { client } = clientFor({}, 'profiles');
      const sessions = [
        { id: 'saved', tutor_id: 'tutor', meeting_link: 'https://meet.example/saved' },
        { id: 'missing', tutor_id: 'tutor', meeting_link: null },
      ];
      expect(await loadStudentSessionMeetingLinks(client, sessions)).toEqual(sessions);
      expect(warning).toHaveBeenCalled();
    } finally {
      warning.mockRestore();
    }
  });
});
