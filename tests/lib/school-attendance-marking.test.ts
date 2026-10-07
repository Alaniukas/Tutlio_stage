import { describe, expect, it } from 'vitest';
import {
  formatSchoolAttendanceMarkingDate,
  resolveSchoolAttendanceMarking,
} from '../../src/lib/schoolAttendanceMarking';

const base = {
  tutor_id: 'teacher-1',
  status: 'completed',
  end_time: '2026-09-14T14:00:00Z',
  status_confirmed_at: '2026-09-14T14:05:00Z',
};

describe('resolveSchoolAttendanceMarking', () => {
  it('returns teacher when the tutor confirmed the outcome', () => {
    expect(resolveSchoolAttendanceMarking({
      ...base,
      status_confirmed_by: 'teacher-1',
    })).toEqual({ source: 'teacher', markedAt: base.status_confirmed_at });
  });

  it('returns admin when another user confirmed the outcome', () => {
    expect(resolveSchoolAttendanceMarking({
      ...base,
      status_confirmed_by: 'admin-1',
    })).toEqual({ source: 'admin', markedAt: base.status_confirmed_at });
  });

  it('returns system for legacy stamps without an actor', () => {
    expect(resolveSchoolAttendanceMarking({
      ...base,
      status_confirmed_by: null,
    })).toEqual({ source: 'system', markedAt: base.status_confirmed_at });
  });

  it('returns null while the lesson is still active or unconfirmed', () => {
    expect(resolveSchoolAttendanceMarking({
      ...base,
      status: 'active',
      status_confirmed_at: null,
      status_confirmed_by: null,
    })).toBeNull();
    expect(resolveSchoolAttendanceMarking({
      ...base,
      status: 'completed',
      status_confirmed_at: null,
      status_confirmed_by: null,
    })).toBeNull();
  });

  it('formats Vilnius timestamps for review rows', () => {
    const formatted = formatSchoolAttendanceMarkingDate('2026-09-14T14:05:00Z', 'lt');
    expect(formatted).toMatch(/2026/);
    expect(formatted.length).toBeGreaterThan(8);
  });
});
