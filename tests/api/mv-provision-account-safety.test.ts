import { describe, expect, it, vi } from 'vitest';
import { ensureMvAuthUser } from '../../api/_lib/mvProvisionFamilyAccounts';

describe('Mokslo Vaisiai managed account provisioning', () => {
  it('does not reset or relabel an existing auth account during a retry', async () => {
    const createUser = vi.fn().mockResolvedValue({
      data: { user: null },
      error: { code: 'email_exists', message: 'User already registered' },
    });
    const updateUserById = vi.fn();
    const db = { auth: { admin: { createUser, updateUserById } } } as any;

    await expect(ensureMvAuthUser(db, {
      email: 'existing@example.test',
      password: 'NewTemporaryPassword1!',
      role: 'student',
      fullName: 'Existing Student',
      studentId: 'student-1',
    })).resolves.toEqual({
      error: 'Email already registered',
      code: 'email_already_registered',
    });
    expect(updateUserById).not.toHaveBeenCalled();
  });

  it('still returns a newly created account to the normal linking flow', async () => {
    const createUser = vi.fn().mockResolvedValue({
      data: { user: { id: 'new-user' } },
      error: null,
    });
    const db = { auth: { admin: { createUser } } } as any;

    await expect(ensureMvAuthUser(db, {
      email: 'new@example.test',
      password: 'TemporaryPassword1!',
      role: 'parent',
      fullName: 'New Parent',
    })).resolves.toEqual({ userId: 'new-user', created: true });
  });
});
