import { describe, expect, it } from 'vitest';
import {
  dedupeSessionsById,
  linkedStudentProfileIds,
  pickActiveStudentProfile,
} from '../../src/lib/studentLinkedProfiles';

describe('studentLinkedProfiles', () => {
  it('collects all linked profile ids for multi-tutor org students', () => {
    expect(
      linkedStudentProfileIds([
        { id: 'student-a', tutor_id: 'tutor-1' },
        { id: 'student-b', tutor_id: 'tutor-2' },
      ]),
    ).toEqual(['student-a', 'student-b']);
  });

  it('prefers the active profile when several rows exist', () => {
    const rows = [
      { id: 'student-a', tutor_id: 'tutor-1', full_name: 'Test Test' },
      { id: 'student-b', tutor_id: 'tutor-2', full_name: 'Test Test' },
    ];
    expect(pickActiveStudentProfile(rows, 'student-b')?.id).toBe('student-b');
    expect(pickActiveStudentProfile(rows, null)?.id).toBe('student-a');
  });

  it('dedupes session rows by id', () => {
    expect(
      dedupeSessionsById([
        { id: 'sess-1', start_time: '2026-09-13T08:00:00Z' },
        { id: 'sess-1', start_time: '2026-09-13T08:00:00Z' },
        { id: 'sess-2', start_time: '2026-09-13T09:00:00Z' },
      ]),
    ).toHaveLength(2);
  });
});
