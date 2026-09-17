import { describe, expect, it } from 'vitest';
import {
  isMergedGroupSubjectSession,
  mergeGroupSubjectSessions,
} from '@/lib/groupSubjectSessions';

const start = new Date('2026-09-21T14:00:00.000Z');
const end = new Date('2026-09-21T14:45:00.000Z');

function row(id: string, student: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    tutor_id: 'teacher-1',
    student_id: student,
    subject_id: 'math-group',
    class_group_id: null,
    start_time: start,
    end_time: end,
    status: 'active',
    topic: 'Matematika',
    student: { full_name: student },
    ...overrides,
  };
}

describe('legacy group-subject calendar occurrences', () => {
  it('shows parallel student rows as one group lesson while retaining both attendance rows', () => {
    const merged = mergeGroupSubjectSessions(
      [row('s1', 'Austėja'), row('s2', 'Matas')],
      [{ id: 'math-group', is_group: true, max_students: 2 }],
      { groupLesson: 'Grupinis užsiėmimas', seats: 'vietos' },
    );

    expect(merged).toHaveLength(1);
    expect(isMergedGroupSubjectSession(merged[0])).toBe(true);
    expect(merged[0].student?.full_name).toBe('Matematika: Austėja, Matas');
    expect((merged[0] as { _groupSessions: Array<{ id: string }> })._groupSessions.map((item) => item.id))
      .toEqual(['s1', 's2']);
  });

  it('never merges different teachers or a real class-group occurrence', () => {
    const merged = mergeGroupSubjectSessions(
      [
        row('s1', 'Austėja'),
        row('s2', 'Matas', { tutor_id: 'teacher-2' }),
        row('s3', 'Ieva', { class_group_id: 'class-1', _isClassGroup: true }),
      ],
      [{ id: 'math-group', is_group: true, max_students: 2 }],
      { groupLesson: 'Grupinis užsiėmimas', seats: 'vietos' },
    );

    expect(merged).toHaveLength(3);
    expect(merged.filter(isMergedGroupSubjectSession)).toHaveLength(2);
    expect(merged.find((item) => item.id === 's3')).toBeTruthy();
  });
});
