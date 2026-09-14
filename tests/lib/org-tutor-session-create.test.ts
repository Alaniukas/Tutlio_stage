import { describe, expect, it } from 'vitest';
import {
  orgTutorAvailabilityOnly,
  orgTutorCanCreateSessions,
} from '@/lib/orgTutorSessionCreate';

describe('orgTutorSessionCreate', () => {
  it('detects availability-only org feature', () => {
    expect(orgTutorAvailabilityOnly({ org_tutor_availability_only: true })).toBe(true);
    expect(orgTutorAvailabilityOnly({})).toBe(false);
  });

  it('blocks session creation when availability-only', () => {
    expect(orgTutorCanCreateSessions({ org_tutor_availability_only: true })).toBe(false);
    expect(orgTutorCanCreateSessions(null)).toBe(true);
  });
});
