import { describe, expect, it } from 'vitest';
import {
  canSendAnotherReminderEmail,
  payerGroupOccurrenceKey,
  sortSessionsForReminderDelivery,
} from '../../api/_lib/sessionReminderQueue';

describe('session reminder queue', () => {
  it('groups class-group rows by tutor, group and start instant', () => {
    const start = '2026-09-24T07:00:00.000Z';
    const keyA = payerGroupOccurrenceKey({
      id: 'a',
      tutor_id: 'tutor-1',
      class_group_id: 'group-1',
      start_time: start,
    });
    const keyB = payerGroupOccurrenceKey({
      id: 'b',
      tutor_id: 'tutor-1',
      class_group_id: 'group-1',
      start_time: start,
    });
    expect(keyA).toBe(keyB);
    expect(payerGroupOccurrenceKey({ id: 'c', start_time: start })).toBeNull();
  });

  it('keeps the same group slot adjacent when sorting', () => {
    const start = '2026-09-24T07:00:00.000Z';
    const ordered = sortSessionsForReminderDelivery([
      { id: 'z-last', start_time: start, class_group_id: 'group-1', tutor_id: 'tutor-1' },
      { id: 'a-first', start_time: start, class_group_id: 'group-1', tutor_id: 'tutor-1' },
      { id: 'solo', start_time: '2026-09-25T07:00:00.000Z' },
    ]);
    expect(ordered.map((row) => row.id)).toEqual(['a-first', 'z-last', 'solo']);
  });

  it('allows a burst to finish an in-progress school group occurrence', () => {
    const occurrence = 'payer-group:tutor:group:2026-09-24T07:00:00.000Z';
    expect(canSendAnotherReminderEmail(999, 1000, 120, occurrence, occurrence)).toBe(true);
    expect(canSendAnotherReminderEmail(1000, 1000, 120, occurrence, occurrence)).toBe(true);
    expect(canSendAnotherReminderEmail(1119, 1000, 120, occurrence, occurrence)).toBe(true);
    expect(canSendAnotherReminderEmail(1120, 1000, 120, occurrence, occurrence)).toBe(false);
    expect(canSendAnotherReminderEmail(1000, 1000, 120, occurrence, 'other')).toBe(false);
  });
});
