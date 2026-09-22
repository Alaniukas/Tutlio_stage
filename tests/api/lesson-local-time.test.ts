import { describe, expect, it } from 'vitest';
import { lessonEmailDateTime } from '../../api/_lib/lessonLocalTime';

describe('lessonEmailDateTime', () => {
  it('prints Vilnius time, not the UTC instant, for a paid-lesson email', () => {
    // Saulė / Rimantas: stored 16:00 Europe/Vilnius, which is 13:00 UTC in September.
    const start = new Date('2026-09-29T13:00:00.000Z');
    expect(lessonEmailDateTime(start)).toEqual({
      date: '2026-09-29',
      time: '16:00',
    });
  });
});
