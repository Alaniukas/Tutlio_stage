import { describe, expect, it } from 'vitest';
import {
  mvNeedsAnyAccountProvisioning,
  mvNeedsParentAccount,
  mvNeedsStudentAccount,
} from '@/lib/mvStudentAccountStatus';

describe('mvStudentAccountStatus', () => {
  it('detects missing parent and student accounts', () => {
    expect(
      mvNeedsParentAccount({ payer_email: 'p@example.com', parent_user_id: null }),
    ).toBe(true);
    expect(
      mvNeedsStudentAccount({ email: 's@example.com', linked_user_id: null }),
    ).toBe(true);
    expect(
      mvNeedsAnyAccountProvisioning({
        payer_email: 'p@example.com',
        email: 's@example.com',
        parent_user_id: null,
        linked_user_id: null,
      }),
    ).toBe(true);
  });

  it('returns false when accounts are linked', () => {
    expect(
      mvNeedsAnyAccountProvisioning({
        payer_email: 'p@example.com',
        email: 's@example.com',
        parent_user_id: 'uid-parent',
        linked_user_id: 'uid-student',
      }),
    ).toBe(false);
  });
});
