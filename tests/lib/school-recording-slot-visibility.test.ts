import { describe, expect, it } from 'vitest';
import { recordingVisibleToMemberSchedules } from '../../src/lib/schoolRecordingSlotVisibility';

describe('recording visibility for a student attending selected group times', () => {
  const tuesday = { weekday: 2, start_time: '11:00' };
  const thursday = { weekday: 4, start_time: '11:00' };

  it('keeps all group recordings available to a full-time member', () => {
    expect(recordingVisibleToMemberSchedules([null], null)).toBe(true);
    expect(recordingVisibleToMemberSchedules([null], tuesday)).toBe(true);
  });

  it('requires an explicit matching tag for a part-time member', () => {
    expect(recordingVisibleToMemberSchedules([[thursday]], null)).toBe(false);
    expect(recordingVisibleToMemberSchedules([[thursday]], tuesday)).toBe(false);
    expect(recordingVisibleToMemberSchedules([[thursday]], thursday)).toBe(true);
  });

  it('permits a parent to see recordings for either linked child', () => {
    expect(recordingVisibleToMemberSchedules([[tuesday], [thursday]], thursday)).toBe(true);
    expect(recordingVisibleToMemberSchedules([], thursday)).toBe(false);
  });
});
