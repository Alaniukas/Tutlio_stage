import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PRO_KLASE_ORG_ID } from '../../src/lib/marketMoney';
import { schoolFamilyMemoryDatabase } from '../fixtures/schoolFamilyMemoryDatabase';

const send = vi.hoisted(() => vi.fn(async () => ({ ok:true })));
vi.mock('../../api/_lib/sendMvFamilyAccountsEmail.js', () => ({ sendMvAccountActivationEmail:send }));
import { provisionMvFamilyAccounts } from '../../api/_lib/mvProvisionFamilyAccounts';

const org = { id:PRO_KLASE_ORG_ID,name:'Pro Klasė',features:{},preferred_locale:'lt' };
const account = { id:'family-user',email:'family@example.test',password:'ExistingPassword!',
  user_metadata:{ role:'parent',full_name:'Parent' },app_metadata:{ provisioned_by_organization:org.id } };
const parent = { id:'parent-profile',user_id:account.id,full_name:'Parent',email:account.email };
const child = { id:'child',organization_id:org.id,tutor_id:'tutor',full_name:'Child',email:account.email,
  payer_name:'Parent',payer_email:account.email,linked_user_id:null as string | null,parent_user_id:null as string | null,detached_at:null };
const input = { studentId:child.id,appOrigin:'https://tutlio.lt',suppressParentActivationEmail:true };
beforeEach(() => { vi.clearAllMocks(); vi.stubEnv('JOIN_LINK_SECRET','test-only'); });

describe('managed shared parent/student identities', () => {
  it('repairs an existing shared identity without a password reset or another account (Jonas regression)', async () => {
    const memory = schoolFamilyMemoryDatabase({ organizations:[org],students:[{ ...child,linked_user_id:account.id }],parent_profiles:[parent] },[account]);
    const result = await provisionMvFamilyAccounts(memory.db,{ ...input,scope:'student' });
    expect(result).toMatchObject({ ok:true,parent:{ userId:account.id,reused:true },student:{ userId:account.id,reused:true } });
    expect(memory.tables.students[0]).toMatchObject({ linked_user_id:account.id,parent_user_id:account.id });
    expect(memory.tables.parent_students).toEqual([expect.objectContaining({ parent_id:parent.id,student_id:child.id })]);
    expect(memory.createUser).not.toHaveBeenCalled(); expect(memory.updateUserById).not.toHaveBeenCalled();
    expect(memory.users.get(account.id)?.password).toBe('ExistingPassword!'); expect(send).not.toHaveBeenCalled();
  });

  it('repairs a missing portal link even when both account pointers already exist', async () => {
    const memory = schoolFamilyMemoryDatabase({ organizations:[org],students:[{ ...child,linked_user_id:account.id,parent_user_id:account.id }],parent_profiles:[parent] },[account]);
    expect(await provisionMvFamilyAccounts(memory.db,{ ...input,scope:'auto' })).toMatchObject({ ok:true });
    expect(memory.tables.parent_students).toHaveLength(1);
    expect(memory.createUser).not.toHaveBeenCalled();
  });

  it('uses the existing parent identity when creating the missing shared student login', async () => {
    const memory = schoolFamilyMemoryDatabase({ organizations:[org],students:[{ ...child,parent_user_id:account.id }],parent_profiles:[parent] },[account]);
    expect(await provisionMvFamilyAccounts(memory.db,{ ...input,scope:'student' })).toMatchObject({ ok:true,student:{ userId:account.id,reused:true } });
    expect(memory.tables.students[0].linked_user_id).toBe(account.id);
    expect(memory.createUser).not.toHaveBeenCalled(); expect(memory.updateUserById).not.toHaveBeenCalled();
  });

  it('creates one shared account for a new parent/student pair across two tutor assignments', async () => {
    const second = { ...child,id:'other-tutor-card',tutor_id:'second-tutor' };
    const memory = schoolFamilyMemoryDatabase({ organizations:[org],students:[child,second] });
    const result = await provisionMvFamilyAccounts(memory.db,{ ...input,studentIds:[child.id,second.id],scope:'both' });
    expect(result).toMatchObject({ ok:true,parent:{ created:true } });
    expect(memory.createUser).toHaveBeenCalledOnce();
    const userId = [...memory.users.keys()][0];
    expect(memory.tables.students.every((row) => row.linked_user_id===userId && row.parent_user_id===userId)).toBe(true);
    expect(memory.tables.parent_students).toHaveLength(2);
    expect(memory.users.get(userId)?.user_metadata.full_name).toBe('Parent');
  });

  it('does not discover a parent identity solely from the payer email', async () => {
    const studentAccount = { ...account,id:'different-student',user_metadata:{ role:'student',full_name:'Child' } };
    const memory = schoolFamilyMemoryDatabase({ organizations:[org],students:[{ ...child,linked_user_id:studentAccount.id }],parent_profiles:[parent] },[account,studentAccount]);
    expect(await provisionMvFamilyAccounts(memory.db,{ ...input,scope:'student' })).toMatchObject({ ok:false,code:'nothing_to_provision' });
    expect(memory.tables.students[0].parent_user_id).toBeNull();
    expect(memory.tables.parent_students || []).toEqual([]);
    expect(memory.createUser).not.toHaveBeenCalled();
  });

  it('reports a failed atomic link without deleting or changing the existing Auth account', async () => {
    const memory = schoolFamilyMemoryDatabase({ organizations:[org],students:[{ ...child,linked_user_id:account.id }],parent_profiles:[parent] },[account]);
    const rpc = memory.db.rpc.getMockImplementation();
    memory.db.rpc.mockImplementation((name:string,args:any) => name==='link_managed_parent_students'
      ? Promise.resolve({ error:{ message:'Family write failed' } }) : rpc(name,args));
    expect(await provisionMvFamilyAccounts(memory.db,{ ...input,scope:'student' })).toMatchObject({ ok:false,code:'link_parent_failed' });
    expect(memory.deleteUser).not.toHaveBeenCalled(); expect(memory.updateUserById).not.toHaveBeenCalled(); expect(send).not.toHaveBeenCalled();
  });
});
