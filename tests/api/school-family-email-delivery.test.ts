import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { schoolFamilyMemoryDatabase } from '../fixtures/schoolFamilyMemoryDatabase';
import { activateSchoolFamilyInvitation, loadSchoolFamilyInvitation, runSchoolFamilyAccountWorkflow } from '../../api/_lib/schoolFamilyAccounts';
import { loadSchoolFamilyGuardianAccess, schoolFamilyGuardianIdentity, schoolFamilyPersonalCodeHash } from '../../api/_lib/schoolFamilyGuardianAccess';

const { send } = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock('resend', () => ({ Resend: class { emails = { send }; } }));
const org = { id: '2dd745fc-20e7-4bc1-a5cd-a89cfe22ec17', entity_type: 'school', name: 'QA School',
  preferred_locale: 'lt', features: { school_family_portal: true } };
const parentEmail = 'parent@retired.example';
const inbox = 'family@example.test';
beforeEach(() => {
  vi.stubEnv('EMAIL_DELIVERY_REDIRECTS', JSON.stringify({ [parentEmail]: inbox }));
  vi.stubEnv('RESEND_API_KEY', 'test-key');
  vi.stubEnv('TUTLIO_DEV_SUPPRESS_EMAIL', '0');
  vi.stubEnv('JOIN_LINK_SECRET', 'test-only');
  send.mockResolvedValue({ data: { id: 'email-accepted' }, error: null });
});
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });

it('delivers both family invitations to one inbox while preserving separate logins, guardian evidence and activation', async () => {
  const parent = { id: 'parent-id', email: parentEmail, password: 'ParentPasswordUnchanged!',
    user_metadata: { role: 'parent' }, email_confirmed_at: '2026-09-01', last_sign_in_at: null };
  const child = { id: 'child-id', email: inbox, password: 'ChildPasswordUnchanged!',
    user_metadata: { role: 'student' }, email_confirmed_at: '2026-09-01', last_sign_in_at: '2026-10-01' };
  const guardian = { organization_id: org.id, student_id: 'child-row', annual_contract_id: 'annual',
    guardian_user_id: parent.id, guardian_name: 'Parent One', guardian_email: parentEmail,
    identity_hash: schoolFamilyGuardianIdentity(org.id, 'Parent One', 'test-identity'), evidence_source: 'signed_primary',
    signature_id: 'signature', signature_personal_code_hash: schoolFamilyPersonalCodeHash('test-identity'), verified_by: null };
  const memory = schoolFamilyMemoryDatabase({ organizations: [org],
    students: [{ id: 'child-row', organization_id: org.id, full_name: 'QA Child', email: inbox, payer_email: inbox,
      linked_user_id: child.id, parent_user_id: parent.id, enrollment_status: 'active', detached_at: null }],
    school_contracts: [{ id: 'annual', organization_id: org.id, student_id: 'child-row', kind: 'annual',
      signing_status: 'signed', archived_at: null, terminated_at: null }],
    school_contract_signatures: [{ id: 'signature', contract_id: 'annual', role: 'parent_primary', status: 'signed',
      signer_name: 'Parent One', signer_email: parentEmail, signer_personal_code: 'test-identity' }],
    school_family_guardians: [guardian],
    parent_profiles: [{ id: 'parent-profile', user_id: parent.id, full_name: 'Parent One', email: parentEmail }],
  }, [parent, child]);

  await runSchoolFamilyAccountWorkflow(memory.db, org, 'admin-id', 'child-row', 'resend', 'https://tutlio.lt');
  expect(send).toHaveBeenCalledTimes(2);
  expect(send.mock.calls.map(([payload]) => payload.to)).toEqual([inbox, inbox]);
  expect(send.mock.calls[0][0].html).toContain(parentEmail); // Parent login is still accurate.
  expect(memory.users.get(parent.id)).toEqual(parent);
  expect(memory.users.get(child.id)).toEqual(child);
  expect(memory.tables.school_family_guardians[0]).toEqual(guardian);
  expect(memory.tables.school_contract_signatures[0].signer_email).toBe(parentEmail);
  expect(memory.updateUserById).not.toHaveBeenCalled();
  expect(memory.createUser).not.toHaveBeenCalled();
  expect(memory.deleteUser).not.toHaveBeenCalled();
  expect(await loadSchoolFamilyGuardianAccess(memory.db, parent.id, org.id)).toEqual({ distinctParent: true, studentIds: ['child-row'] });

  const invitationLink = /href="([^"]*\/account-activate\?t=[^"]+)"/.exec(send.mock.calls[0][0].html)!;
  const token = new URL(invitationLink[1]).searchParams.get('t')!;
  expect((await loadSchoolFamilyInvitation(memory.db, token, 'https://tutlio.lt')).preview)
    .toMatchObject({ role: 'parent', email: parentEmail, requiresPasswordSetup: true });
  await activateSchoolFamilyInvitation(memory.db, token, 'ParentChoosesThisPassword!', 'https://tutlio.lt');
  expect(memory.updateUserById).toHaveBeenCalledExactlyOnceWith(parent.id, expect.objectContaining({ password: 'ParentChoosesThisPassword!' }));
  expect(memory.users.get(child.id)).toEqual(child);
  expect(memory.tables.students[0]).toMatchObject({ parent_user_id: parent.id, linked_user_id: child.id });
});
