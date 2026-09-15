import { describe, expect, it } from 'vitest';
import {
  proKlaseSessionEligibleForMissingCommentPenalty,
  proKlaseSessionEligibleForMissingCommentReminder,
  proKlaseSessionMissingComment,
} from '../../api/_lib/proKlaseLessonCommentPenalty';

const now = Date.parse('2026-09-15T12:00:00.000Z');

describe('proKlaseLessonCommentPenalty', () => {
  it('ignores completed lessons without tutor confirmation', () => {
    expect(proKlaseSessionMissingComment({
      status: 'completed',
      end_time: '2026-09-10T16:00:00.000Z',
      tutor_comment: null,
      status_confirmed_at: null,
    })).toBe(false);
  });

  it('flags confirmed completed lessons without a comment', () => {
    expect(proKlaseSessionMissingComment({
      status: 'completed',
      end_time: '2026-09-10T16:00:00.000Z',
      tutor_comment: null,
      status_confirmed_at: '2026-09-10T17:00:00.000Z',
    })).toBe(true);
  });

  it('does not penalize future or recently ended lessons', () => {
    const futureTrial = {
      status: 'completed',
      end_time: '2026-09-16T14:45:00.000Z',
      tutor_comment: null,
      status_confirmed_at: '2026-09-16T15:00:00.000Z',
    };
    expect(proKlaseSessionEligibleForMissingCommentPenalty(futureTrial, now)).toBe(false);
    expect(proKlaseSessionEligibleForMissingCommentReminder(futureTrial, now)).toBe(false);
  });

  it('does not treat unconfirmed completed lessons as missing-comment targets', () => {
    const unconfirmedPast = {
      status: 'completed',
      end_time: '2026-09-10T16:00:00.000Z',
      tutor_comment: null,
      status_confirmed_at: null,
    };
    expect(proKlaseSessionEligibleForMissingCommentPenalty(unconfirmedPast, now)).toBe(false);
    expect(proKlaseSessionEligibleForMissingCommentReminder(unconfirmedPast, now)).toBe(false);
  });

  it('ignores lessons that already have a tutor comment', () => {
    expect(proKlaseSessionMissingComment({
      status: 'completed',
      end_time: '2026-09-10T16:00:00.000Z',
      tutor_comment: 'Viskas gerai',
      status_confirmed_at: '2026-09-10T17:00:00.000Z',
    })).toBe(false);
  });

  it('penalizes only after 48h from a confirmed ended lesson', () => {
    const oldConfirmed = {
      status: 'completed',
      end_time: '2026-09-12T16:00:00.000Z',
      tutor_comment: null,
      status_confirmed_at: '2026-09-12T17:00:00.000Z',
    };
    expect(proKlaseSessionEligibleForMissingCommentPenalty(oldConfirmed, now)).toBe(true);
    expect(proKlaseSessionEligibleForMissingCommentReminder(oldConfirmed, now)).toBe(false);
  });
});
