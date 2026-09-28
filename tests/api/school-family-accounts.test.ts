import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  activateSchoolFamilyInvitation, loadSchoolFamilyInvitation, runSchoolFamilyAccountWorkflow,
  schoolFamilyAccountsPreview, signedSchoolFamilyEvidence, splitSchoolFamilySharedIdentity,
  verifySchoolFamilyGuardian,
} from '../../api/_lib/schoolFamilyAccounts';
import { loadSchoolFamilyGuardianAccess, schoolFamilyGuardianIdentity, schoolFamilyPersonalCodeHash } from '../../api/_lib/schoolFamilyGuardianAccess';
import { schoolFamilyMemoryDatabase } from '../fixtures/schoolFamilyMemoryDatabase';

const org: any = { id: 'school-one', name: 'School One', entity_type: 'school', preferred_locale: 'lt', features: { school_family_portal: true } };
const student = (id: string, email: string | null = null, parentId: string | null = null, childId: string | null = null) => ({
  id, organization_id: org.id, full_name: `Child ${id}`, email, linked_user_id: childId, parent_user_id: parentId,
  payer_name: 'Parent One', payer_email: 'parent@example.test', enrollment_status: 'active', detached_at: null,
});
const contract = (id: string) => ({ id: `annual-${id}`, student_id: id, organization_id: org.id, contract_number: `Annual ${id}`,
  kind: 'annual', signing_status: 'signed', archived_at: null, terminated_at: null, created_at: '2026-09-01T00:00:00Z' });
const evidence = (id: string, userId: string | null = null) => ({ organization_id: org.id, student_id: id,
  annual_contract_id: `annual-${id}`, guardian_user_id: userId, guardian_name: 'Parent One', guardian_email: 'parent@example.test',
  identity_hash: schoolFamilyGuardianIdentity(org.id, 'Parent One', 'guardian-identity'), evidence_source: 'admin_verified', signature_id: null, verified_by: 'admin-one' });
const parent = { id: 'parent-user', email: 'parent@example.test', password: 'ExistingPasswordUnchanged!', user_metadata: { role: 'parent' },
  created_at: '2026-08-01T00:00:00Z', email_confirmed_at: '2026-08-01T00:00:00Z', last_sign_in_at: null };
const child = { id: 'child-user', email: 'st-abcd-2345@student-login.tutlio.invalid', user_metadata: { role: 'student' }, app_metadata: { student_login_name: 'st-abcd-2345' },
  created_at: '2026-08-01T00:00:00Z', email_confirmed_at: '2026-08-01T00:00:00Z', last_sign_in_at: null };
function existingFamily() {
  return schoolFamilyMemoryDatabase({ organizations: [org], students: [student('one', null, parent.id, child.id)], school_contracts: [contract('one')],
    school_family_guardians: [evidence('one', parent.id)], parent_profiles: [{ id: 'parent-profile', user_id: parent.id, full_name: 'Parent One', email: parent.email }] }, [parent, child]);
}
beforeEach(() => { vi.stubEnv('TUTLIO_DEV_SUPPRESS_EMAIL', '1'); vi.stubEnv('JOIN_LINK_SECRET', 'test-only'); });
afterEach(() => vi.unstubAllEnvs());

describe('school family account workflow', () => {
  it('accepts only the exact new child Auth link when an earlier signup trigger has already attached it', async () => {
    const memory = schoolFamilyMemoryDatabase({ organizations: [org], students: [student('one', 'child@example.test')],
      school_contracts: [contract('one')], school_family_guardians: [evidence('one')] });
    const create = memory.createUser.getMockImplementation()!;
    memory.createUser.mockImplementation(async (input) => {
      const result = await create(input);
      if (input.user_metadata?.role === 'student' && result.data.user) memory.tables.students[0].linked_user_id = result.data.user.id;
      return result;
    });
    await runSchoolFamilyAccountWorkflow(memory.db, org, 'admin-one', 'one', 'provision', 'https://tutlio.lt');
    const row = memory.tables.students[0];
    expect(row.linked_user_id).not.toBe(row.parent_user_id);
    expect(memory.users.get(row.linked_user_id)?.app_metadata.student_id).toBe('one');
    expect(memory.users.get(row.linked_user_id)?.user_metadata.student_id).toBeUndefined();
    expect(memory.deleteUser).not.toHaveBeenCalled();
    expect(memory.updateUserById).not.toHaveBeenCalled();
  });

  it.each([
    ['linked_user_id', 'racing-child-user'], ['parent_user_id', 'racing-parent-user'],
    ['organization_id', 'another-school'], ['detached_at', '2026-09-28T10:00:00Z'],
  ])('rejects a changed %s during Auth creation and deletes only its own new child account', async (field, value) => {
    const memory = schoolFamilyMemoryDatabase({ organizations: [org], students: [student('one', 'child@example.test')],
      school_contracts: [contract('one')], school_family_guardians: [evidence('one')] });
    memory.users.set('racing-child-user', { id: 'racing-child-user', email: 'other@example.test', user_metadata: { role: 'student' } });
    const create = memory.createUser.getMockImplementation()!;
    let createdChildId = '';
    memory.createUser.mockImplementation(async (input) => {
      const result = await create(input);
      if (input.user_metadata?.role === 'student' && result.data.user) {
        createdChildId = result.data.user.id;
        memory.tables.students[0][field] = value;
      }
      return result;
    });
    await expect(runSchoolFamilyAccountWorkflow(memory.db, org, 'admin-one', 'one', 'provision', 'https://tutlio.lt'))
      .rejects.toThrow('related_account_conflict');
    expect(memory.tables.students[0][field]).toBe(value);
    expect(memory.deleteUser).toHaveBeenCalledExactlyOnceWith(createdChildId);
    expect(memory.users.has('racing-child-user')).toBe(true);
    expect(memory.updateUserById).not.toHaveBeenCalled();
  });

  it('reuses a pending real-email child proven by server app metadata without resetting its password', async () => {
    const pending = { ...child, id: 'pending-child', email: 'child@example.test', password: 'PendingPasswordUnchanged!',
      user_metadata: { role: 'student' }, app_metadata: { student_id: 'one', provisioned_by_organization: org.id } };
    const memory = schoolFamilyMemoryDatabase({ organizations: [org], students: [student('one', pending.email, parent.id)],
      school_contracts: [contract('one')], school_family_guardians: [evidence('one', parent.id)],
      parent_profiles: [{ id: 'parent-profile', user_id: parent.id, full_name: 'Parent One', email: parent.email }] }, [parent, pending]);
    await runSchoolFamilyAccountWorkflow(memory.db, org, 'admin-one', 'one', 'provision', 'https://tutlio.lt');
    expect(memory.tables.students[0].linked_user_id).toBe(pending.id);
    expect(memory.users.get(pending.id)?.password).toBe(pending.password);
    expect(memory.users.get(parent.id)?.password).toBe(parent.password);
    expect(memory.updateUserById).not.toHaveBeenCalled();
    expect(memory.deleteUser).not.toHaveBeenCalled();
  });

  it('creates a real-email child with its own trusted Auth identity and reuses the verified sibling parent', async () => {
    const realEmail = 'child@example.test';
    const memory = schoolFamilyMemoryDatabase({ organizations: [org], students: [student('one', realEmail), student('two')],
      school_contracts: [contract('one'), contract('two')], school_family_guardians: [evidence('one'), evidence('two')] });
    await runSchoolFamilyAccountWorkflow(memory.db, org, 'admin-one', 'one', 'provision', 'https://tutlio.lt');
    const parentId = memory.tables.students[0].parent_user_id;
    const parentPassword = memory.users.get(parentId)?.password;
    const result = await runSchoolFamilyAccountWorkflow(memory.db, org, 'admin-one', 'two', 'provision', 'https://tutlio.lt');
    const created = memory.tables.students[0];
    expect(created.parent_user_id).toBe(parentId);
    expect(created.email).toBe(realEmail);
    expect(created.linked_user_id).not.toBe(parentId);
    expect(memory.users.get(created.linked_user_id)).toMatchObject({ email: realEmail,
      user_metadata: { role: 'student' }, app_metadata: { student_id: 'one', provisioned_by_organization: org.id } });
    expect(memory.users.get(created.linked_user_id)?.user_metadata.student_id).toBeUndefined();
    expect(memory.tables.students[1].parent_user_id).toBe(parentId);
    expect(memory.tables.students[1].linked_user_id).not.toBe(created.linked_user_id);
    const invitation = memory.tables.school_family_invitations.find((entry) => entry.user_id === created.linked_user_id);
    const resent = await runSchoolFamilyAccountWorkflow(memory.db, org, 'admin-one', 'one', 'resend', 'https://tutlio.lt');
    const childInvite = resent.invitations.find((invite) => invite.role === 'student') as any;
    expect(invitation).toBeTruthy();
    expect(result.invitations.find((invite) => invite.role === 'student')).toMatchObject({ suppressed: true });
    expect(childInvite).toMatchObject({ suppressed: true });
    const preview = await loadSchoolFamilyInvitation(memory.db, new URL(childInvite.invitationUrl).searchParams.get('t')!, 'https://tutlio.lt');
    expect(preview.preview.email).toBe(realEmail);
    expect(memory.users.get(parentId)?.password).toBe(parentPassword);
    expect(memory.updateUserById).not.toHaveBeenCalled();
    expect(memory.db.auth.admin.listUsers).not.toHaveBeenCalled();
    expect(memory.createUser).toHaveBeenCalledTimes(3);
  });

  it('creates distinct no-email child accounts, links verified siblings to one parent and never invents a contact address', async () => {
    const memory = schoolFamilyMemoryDatabase({ organizations: [org], students: [student('one'), student('two', parent.email)],
      school_contracts: [contract('one'), contract('two')], school_family_guardians: [evidence('one'), evidence('two')] });
    const first = await runSchoolFamilyAccountWorkflow(memory.db, org, 'admin-one', 'one', 'provision', 'https://tutlio.lt');
    expect(first.invitations.every((invite) => 'suppressed' in invite && invite.suppressed)).toBe(true);
    const firstRow = memory.tables.students[0];
    expect(firstRow.parent_user_id).toBeTruthy(); expect(firstRow.linked_user_id).not.toBe(firstRow.parent_user_id); expect(firstRow.email).toBeNull();
    expect(memory.users.get(firstRow.linked_user_id)?.email).toMatch(/^st-.*@student-login\.tutlio\.invalid$/);
    const parentPassword = memory.users.get(firstRow.parent_user_id)?.password;
    await runSchoolFamilyAccountWorkflow(memory.db, org, 'admin-one', 'two', 'provision', 'https://tutlio.lt');
    expect(memory.tables.students[1].parent_user_id).toBe(firstRow.parent_user_id);
    expect(memory.tables.students[1].linked_user_id).not.toBe(firstRow.linked_user_id);
    expect(memory.tables.students[1].email).toBe(parent.email); // Existing real contact is preserved, including a parent's address.
    expect(memory.users.get(firstRow.parent_user_id)?.password).toBe(parentPassword);
    expect(memory.createUser).toHaveBeenCalledTimes(3);
    expect(memory.updateUserById).not.toHaveBeenCalled();
  });

  it('resends a pending invitation without resetting passwords, invalidates its prior token and requires explicit password choice', async () => {
    const memory = existingFamily();
    const first = await runSchoolFamilyAccountWorkflow(memory.db, org, 'admin-one', 'one', 'resend', 'https://tutlio.lt');
    const firstUrl = first.invitations.find((invite) => invite.role === 'student')! as any;
    const firstToken = new URL(firstUrl.invitationUrl).searchParams.get('t')!;
    expect((await loadSchoolFamilyInvitation(memory.db, firstToken, 'https://tutlio.lt')).preview.requiresPasswordSetup).toBe(true);
    const second = await runSchoolFamilyAccountWorkflow(memory.db, org, 'admin-one', 'one', 'resend', 'https://tutlio.lt');
    const secondToken = new URL((second.invitations.find((invite) => invite.role === 'student')! as any).invitationUrl).searchParams.get('t')!;
    expect(secondToken).not.toBe(firstToken);
    expect(memory.updateUserById).not.toHaveBeenCalled();
    await expect(loadSchoolFamilyInvitation(memory.db, firstToken, 'https://tutlio.lt')).rejects.toThrow('expired');
    await expect(activateSchoolFamilyInvitation(memory.db, secondToken, 'short', 'https://tutlio.lt')).rejects.toThrow('password_too_short');
    expect(memory.updateUserById).not.toHaveBeenCalled();
    await activateSchoolFamilyInvitation(memory.db, secondToken, 'ExplicitNewPassword!', 'https://tutlio.lt');
    expect(memory.updateUserById).toHaveBeenCalledTimes(1);
    expect(memory.updateUserById.mock.calls[0][0]).toBe(child.id);
    await activateSchoolFamilyInvitation(memory.db, secondToken, 'AnotherPasswordIgnored!', 'https://tutlio.lt');
    expect(memory.updateUserById).toHaveBeenCalledTimes(1);
    expect(memory.users.get(parent.id)?.password).toBe(parent.password);
  });

  it('sends existing activated/logged-in users straight to login and never creates a reset token', async () => {
    const memory = existingFamily(); memory.users.get(parent.id)!.last_sign_in_at = '2026-09-02T00:00:00Z'; memory.users.get(child.id)!.user_metadata.mv_account_activated_at = '2026-09-02T00:00:00Z';
    const result = await runSchoolFamilyAccountWorkflow(memory.db, org, 'admin-one', 'one', 'resend', 'https://tutlio.lt');
    expect(result.invitations.every((invite) => 'invitationUrl' in invite && invite.invitationUrl.includes('/login?'))).toBe(true);
    expect(memory.tables.school_family_invitations || []).toHaveLength(0); expect(memory.updateUserById).not.toHaveBeenCalled();
  });

  it('fails closed after live annual termination, a changed account or a shared identity, including an already issued invitation', async () => {
    const memory = existingFamily();
    const result = await runSchoolFamilyAccountWorkflow(memory.db, org, 'admin-one', 'one', 'resend', 'https://tutlio.lt');
    const token = new URL((result.invitations[0] as any).invitationUrl).searchParams.get('t')!;
    memory.tables.school_contracts[0].terminated_at = new Date().toISOString();
    await expect(activateSchoolFamilyInvitation(memory.db, token, 'PasswordNeverApplied!', 'https://tutlio.lt')).rejects.toThrow('guardian_verification_required');
    memory.tables.school_contracts[0].terminated_at = null;
    memory.tables.students[0].linked_user_id = parent.id;
    await expect(runSchoolFamilyAccountWorkflow(memory.db, org, 'admin-one', 'one', 'provision', 'https://tutlio.lt')).rejects.toThrow('shared_identity_review');
    await expect(activateSchoolFamilyInvitation(memory.db, token, 'PasswordNeverApplied!', 'https://tutlio.lt')).rejects.toThrow('shared_identity_review');
    expect(memory.updateUserById).not.toHaveBeenCalled();
  });

  it('splits only the explicitly reviewed shared child and preserves the parent password, contacts and child id', async () => {
    const memory = existingFamily(); memory.tables.students[0].linked_user_id = parent.id;
    memory.tables.students[0].email = parent.email; memory.tables.school_family_guardians[0].guardian_user_id = null;
    await expect(splitSchoolFamilySharedIdentity(memory.db, org, 'admin-one', 'one', false, 'https://tutlio.lt')).rejects.toThrow('guardian_verification_invalid');
    await splitSchoolFamilySharedIdentity(memory.db, org, 'admin-one', 'one', true, 'https://tutlio.lt');
    const updated = memory.tables.students[0]; expect(updated.id).toBe('one'); expect(updated.parent_user_id).toBe(parent.id);
    expect(updated.linked_user_id).not.toBe(parent.id); expect(updated.email).toBe(parent.email);
    expect(memory.users.get(parent.id)?.password).toBe(parent.password); expect(memory.updateUserById).not.toHaveBeenCalled();
    expect(memory.tables.school_family_identity_reviews).toHaveLength(1);
    expect(memory.tables.school_family_guardians[0].guardian_user_id).toBe(parent.id);
  });

  it('paginates active children and distinguishes created, invited, activated and login state', async () => {
    const active = Array.from({ length: 28 }, (_, index) => student(String(index).padStart(3, '0')));
    const memory = schoolFamilyMemoryDatabase({ organizations: [org], students: [...active, { ...student('inactive'), enrollment_status: 'left' }, { ...student('foreign'), organization_id: 'another-school' }], school_contracts: [], school_family_guardians: [] });
    const page = await schoolFamilyAccountsPreview(memory.db, org);
    expect(page.rows).toHaveLength(25); expect(page.nextCursor).toBe('024');
    expect(page.rows.map((row) => row.studentId)).toEqual(active.slice(0, 25).map((row) => row.id));
    expect(page.rows.every((row) => row.blockedReasons.includes('annual_contract_required'))).toBe(true);
    expect((await schoolFamilyAccountsPreview(memory.db, org, page.nextCursor!)).rows).toHaveLength(3);
    const existing = existingFamily(); existing.tables.school_family_accounts = [{ user_id: parent.id, role: 'parent', organization_id: org.id, invited_at: '2026-09-01T00:00:00Z', activated_at: null, first_login_at: null }];
    const state = (await schoolFamilyAccountsPreview(existing.db, org)).rows[0].parent;
    expect(state.createdAt).toBeTruthy(); expect(state.invitedAt).toBeTruthy(); expect(state.activatedAt).toBeNull(); expect(state.hasLoggedIn).toBe(false);
  });

  it('rejects foreign-school and inactive students before provisioning any Auth account', async () => {
    const memory = existingFamily();
    await expect(runSchoolFamilyAccountWorkflow(memory.db, { ...org, id: 'another-school' }, 'admin-one', 'one', 'provision', 'https://tutlio.lt')).rejects.toThrow('student_not_active');
    memory.tables.students[0].enrollment_status = 'left';
    await expect(runSchoolFamilyAccountWorkflow(memory.db, org, 'admin-one', 'one', 'provision', 'https://tutlio.lt')).rejects.toThrow('student_not_active');
    expect(memory.createUser).not.toHaveBeenCalled();
  });

  it('prepares distinct accounts and allows activation before the private portal cutover', async () => {
    const setupOrg = { ...org, features: { school_family_accounts_setup: true, school_family_portal: false } };
    const memory = schoolFamilyMemoryDatabase({ organizations: [setupOrg], students: [student('one')],
      school_contracts: [contract('one')], school_family_guardians: [evidence('one')] });
    const result = await runSchoolFamilyAccountWorkflow(memory.db, setupOrg, 'admin-one', 'one', 'provision', 'https://tutlio.lt');
    const token = new URL((result.invitations.find((invite) => invite.role === 'student') as any).invitationUrl).searchParams.get('t')!;
    expect((await loadSchoolFamilyInvitation(memory.db, token, 'https://tutlio.lt')).preview.requiresPasswordSetup).toBe(true);
    const row = memory.tables.students[0];
    expect((await loadSchoolFamilyGuardianAccess(memory.db, row.parent_user_id, org.id)).studentIds).toEqual(['one']);
    await activateSchoolFamilyInvitation(memory.db, token, 'StudentOwnPassword!', 'https://tutlio.lt');
    expect(memory.updateUserById).toHaveBeenCalledTimes(1);
    expect(memory.tables.organizations[0].features).toEqual(setupOrg.features);
  });

  it('deduplicates a shared parent invitation within a bounded sibling batch', async () => {
    const memory = schoolFamilyMemoryDatabase({ organizations: [org], students: [student('one'), student('two')],
      school_contracts: [contract('one'), contract('two')], school_family_guardians: [evidence('one'), evidence('two')] });
    const sent = new Set<string>();
    const first = await runSchoolFamilyAccountWorkflow(memory.db, org, 'admin-one', 'one', 'provision', 'https://tutlio.lt', sent);
    const firstParentToken = new URL((first.invitations.find((invite) => invite.role === 'parent') as any).invitationUrl).searchParams.get('t')!;
    const second = await runSchoolFamilyAccountWorkflow(memory.db, org, 'admin-one', 'two', 'provision', 'https://tutlio.lt', sent);
    expect(second.invitations).toHaveLength(1);
    expect(second.invitations[0].role).toBe('student');
    expect(memory.tables.school_family_invitations).toHaveLength(3);
    expect((await loadSchoolFamilyInvitation(memory.db, firstParentToken, 'https://tutlio.lt')).preview.role).toBe('parent');
  });

  it('rechecks the primary signer name and personal code and refuses a conflicting manual override', async () => {
    const memory = existingFamily();
    const signature = { id: 'primary-signature', contract_id: 'annual-one', role: 'parent_primary', status: 'signed',
      signer_name: 'Parent One', signer_email: parent.email, signer_personal_code: 'guardian-identity' };
    memory.tables.school_contract_signatures = [signature];
    Object.assign(memory.tables.school_family_guardians[0], { evidence_source: 'signed_primary', signature_id: signature.id,
      signature_personal_code_hash: schoolFamilyPersonalCodeHash(signature.signer_personal_code), verified_by: null });
    expect((await loadSchoolFamilyGuardianAccess(memory.db, parent.id, org.id)).studentIds).toEqual(['one']);
    await expect(verifySchoolFamilyGuardian(memory.db, org.id, 'admin-one', {
      studentId: 'one', contractId: 'annual-one', guardianName: 'Parent One', guardianEmail: parent.email,
      personalCode: 'another-person', confirmed: true,
    })).rejects.toThrow('guardian_conflict_review');
    memory.tables.school_contract_signatures[0].signer_personal_code = 'another-person';
    expect((await loadSchoolFamilyGuardianAccess(memory.db, parent.id, org.id)).studentIds).toEqual([]);
    memory.tables.school_contract_signatures[0].signer_personal_code = 'guardian-identity';
    memory.tables.school_contract_signatures[0].signer_name = 'Other Person';
    expect((await loadSchoolFamilyGuardianAccess(memory.db, parent.id, org.id)).studentIds).toEqual([]);
  });
});

it('takes guardian proof from primary signed annual data, never current payer or a secondary signature', () => {
  const c = contract('one');
  expect(signedSchoolFamilyEvidence(org.id, 'one', [c], []).reason).toBe('guardian_verification_required');
  const signature: any = { id: 'sig', contract_id: c.id, signer_name: 'Parent One', signer_email: 'Parent@example.test', signer_personal_code: 'guardian-identity' };
  expect(signedSchoolFamilyEvidence(org.id, 'one', [c], [signature]).evidence?.guardian_email).toBe('parent@example.test');
  const second = { ...contract('one'), id: 'annual-other' };
  expect(signedSchoolFamilyEvidence(org.id, 'one', [c, second], [signature, { ...signature, id: 'other-signature', contract_id: second.id, signer_personal_code: 'another-person' }]).reason).toBe('guardian_conflict_review');
});

it('the shared guardian helper rejects any child identity and rechecks live contracts and school scope', async () => {
  const memory = existingFamily();
  expect(await loadSchoolFamilyGuardianAccess(memory.db, parent.id, org.id)).toEqual({ distinctParent: true, studentIds: ['one'] });
  expect(await loadSchoolFamilyGuardianAccess(memory.db, child.id, org.id)).toEqual({ distinctParent: false, studentIds: [] });
  memory.tables.school_contracts[0].terminated_at = '2026-09-28T00:00:00Z';
  expect((await loadSchoolFamilyGuardianAccess(memory.db, parent.id, org.id)).studentIds).toHaveLength(0);
  expect((await loadSchoolFamilyGuardianAccess(memory.db, parent.id, 'other-school')).studentIds).toHaveLength(0);
});
