import { describe, expect, it } from 'vitest';
import {
  managedFamilyRoutesLessonCommsToPayer,
  moksloVaisiaiPayerInboxEmail,
  moksloVaisiaiRoutesLessonCommsToPayer,
} from '@/lib/moksloVaisiaiLessonComms';
import { MOKSLO_VAISIAI_ORG_ID, PRO_KLASE_ORG_ID } from '@/lib/marketMoney';

describe('Mokslo vaisiai lesson comms routing', () => {
  it('routes to payer inbox for MV students without a contact email, including username accounts', () => {
    expect(
      moksloVaisiaiRoutesLessonCommsToPayer({
        organizationId: MOKSLO_VAISIAI_ORG_ID,
        studentEmail: null,
        linkedUserId: null,
      }),
    ).toBe(true);
    expect(
      moksloVaisiaiRoutesLessonCommsToPayer({
        organizationId: MOKSLO_VAISIAI_ORG_ID,
        studentEmail: 'kid@example.com',
        linkedUserId: null,
      }),
    ).toBe(false);
    expect(
      moksloVaisiaiRoutesLessonCommsToPayer({
        organizationId: MOKSLO_VAISIAI_ORG_ID,
        studentEmail: null,
        linkedUserId: 'user-1',
      }),
    ).toBe(true);
  });

  it('does not apply to other organizations', () => {
    expect(
      moksloVaisiaiRoutesLessonCommsToPayer({
        organizationId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
        studentEmail: null,
        linkedUserId: null,
      }),
    ).toBe(false);
  });

  it('routes managed Pro Klasė username accounts to the payer inbox', () => {
    expect(managedFamilyRoutesLessonCommsToPayer({
      organizationId: PRO_KLASE_ORG_ID,
      studentEmail: null,
      linkedUserId: 'student-user',
    })).toBe(true);
    expect(managedFamilyRoutesLessonCommsToPayer({
      organizationId: PRO_KLASE_ORG_ID,
      studentEmail: 'child@example.com',
      linkedUserId: 'student-user',
    })).toBe(false);
  });

  it('reads payer inbox email', () => {
    expect(moksloVaisiaiPayerInboxEmail({ payer_email: ' parent@example.com ' })).toBe('parent@example.com');
    expect(moksloVaisiaiPayerInboxEmail({ payer_email: '' })).toBeNull();
  });
});
