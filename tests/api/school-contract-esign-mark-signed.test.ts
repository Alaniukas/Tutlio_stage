import { describe, expect, it } from 'vitest';
import { pendingParentRole } from '../../api/_lib/schoolContractSigning';

const contract = (over: Record<string, unknown> = {}) => ({
  require_second_parent: false,
  student: { parent_secondary_email: '' },
  ...over,
});

describe('pendingParentRole (admin manual mark / e-sign)', () => {
  it('is parent_primary when no parent row exists yet', () => {
    expect(pendingParentRole(contract(), [])).toBe('parent_primary');
  });

  it('is parent_primary while the primary row is pending/in_progress', () => {
    expect(pendingParentRole(contract(), [{ role: 'parent_primary', status: 'pending' }])).toBe('parent_primary');
    expect(pendingParentRole(contract(), [{ role: 'parent_primary', status: 'in_progress' }])).toBe('parent_primary');
  });

  it('is null once the only required parent signed', () => {
    expect(pendingParentRole(contract(), [{ role: 'parent_primary', status: 'signed' }])).toBeNull();
  });

  it('requires the second parent only when enabled AND an email exists', () => {
    const rows = [{ role: 'parent_primary', status: 'signed' }];
    expect(
      pendingParentRole(
        contract({ require_second_parent: true, student: { parent_secondary_email: 'p2@example.com' } }),
        rows,
      ),
    ).toBe('parent_secondary');
    // Enabled but no email → advanceAfterRoleSigned finalizes after the primary.
    expect(
      pendingParentRole(contract({ require_second_parent: true, student: { parent_secondary_email: '  ' } }), rows),
    ).toBeNull();
    // Email present but flag off.
    expect(
      pendingParentRole(
        contract({ require_second_parent: false, student: { parent_secondary_email: 'p2@example.com' } }),
        rows,
      ),
    ).toBeNull();
  });

  it('is null when both parents signed', () => {
    expect(
      pendingParentRole(
        contract({ require_second_parent: true, student: { parent_secondary_email: 'p2@example.com' } }),
        [
          { role: 'parent_primary', status: 'signed' },
          { role: 'parent_secondary', status: 'signed' },
        ],
      ),
    ).toBeNull();
  });
});
