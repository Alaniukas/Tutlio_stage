import { describe, expect, it } from 'vitest';
import {
  moksloVaisiaiPayerInboxEmail,
  moksloVaisiaiRoutesLessonCommsToPayer,
} from '@/lib/moksloVaisiaiLessonComms';
import { MOKSLO_VAISIAI_ORG_ID } from '@/lib/marketMoney';

describe('Mokslo vaisiai lesson comms routing', () => {
  it('routes to payer inbox only for MV students without portal email', () => {
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
    ).toBe(false);
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

  it('reads payer inbox email', () => {
    expect(moksloVaisiaiPayerInboxEmail({ payer_email: ' parent@example.com ' })).toBe('parent@example.com');
    expect(moksloVaisiaiPayerInboxEmail({ payer_email: '' })).toBeNull();
  });
});
