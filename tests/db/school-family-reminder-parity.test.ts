// @vitest-environment node
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { schoolMaterialRecipient } from '../../api/_lib/schoolMaterialPublications';
import { schoolFamilyPersonalCodeHash } from '../../api/_lib/schoolFamilyGuardianAccess';
const uid = (index: number) => `00000000-0000-4000-8000-${String(index).padStart(12,'0')}`;

async function database() {
  const db = new PGlite();
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE SCHEMA storage;
    CREATE TABLE organizations(id uuid PRIMARY KEY,entity_type text,features jsonb);
    CREATE TABLE profiles(id uuid PRIMARY KEY,organization_id uuid,email text,reminder_student_hours numeric,reminder_tutor_hours numeric);
    CREATE TABLE students(id uuid PRIMARY KEY,organization_id uuid,full_name text,email text,payer_email text,parent_secondary_email text,payment_payer text,linked_user_id uuid,detached_at timestamptz,enrollment_status text);
    CREATE TABLE parent_profiles(id uuid PRIMARY KEY,email text,disable_lesson_reminders boolean);
    CREATE TABLE parent_students(student_id uuid,parent_id uuid);
    CREATE TABLE school_contracts(id uuid PRIMARY KEY,organization_id uuid,student_id uuid,kind text,signing_status text,archived_at timestamptz,terminated_at timestamptz);
    CREATE TABLE school_family_guardians(organization_id uuid,student_id uuid,guardian_user_id uuid,annual_contract_id uuid,guardian_email text,evidence_source text,signature_id uuid,guardian_name text,signature_personal_code_hash text);
    CREATE TABLE school_family_accounts(organization_id uuid,user_id uuid,role text);
    CREATE TABLE school_contract_signatures(id uuid PRIMARY KEY,contract_id uuid,role text,status text,signer_email text,signer_name text,signer_personal_code text);
    CREATE TABLE sessions(id uuid PRIMARY KEY,student_id uuid,tutor_id uuid,class_group_id uuid,start_time timestamptz,status text,tutor_comment text,show_comment_to_student boolean,show_comment_to_parent boolean,topic text,reminder_student_sent boolean,reminder_tutor_sent boolean,reminder_payer_sent boolean);
    CREATE TABLE school_class_group_members(group_id uuid,student_id uuid);
    CREATE TABLE recurring_individual_sessions(subject_id uuid,tutor_id uuid,student_id uuid,active boolean);
    CREATE TABLE storage.objects(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),bucket_id text,name text,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now());`);
  await db.exec(readFileSync('supabase/migrations/20260928190300_school_material_publications_digest.sql','utf8'));
  return db;
}

/** Actual recipient code reads the same PostgreSQL rows selected by the cron RPC. */
function postgresClient(db: PGlite): any {
  return { from(table: string) {
    if(!/^[a-z_]+$/.test(table)) throw new Error('Unexpected table');
    const filters: string[]=[]; const values: any[]=[]; let limit: number|undefined; let offset=0;
    const param=(value:any)=>{values.push(value);return `$${values.length}`;};
    const field=(value:string)=>{if(!/^[a-z_]+$/.test(value)) throw new Error('Unexpected column');return `"${value}"`;};
    const run=async(single=false)=>{
      try {const result=await db.query(`SELECT * FROM public.${table}${filters.length?' WHERE '+filters.join(' AND '):''}${limit!==undefined?' LIMIT '+limit:''}${offset?' OFFSET '+offset:''}`,values);
        return {data:single?result.rows[0]||null:result.rows,error:null};} catch(error){return {data:null,error};}
    };
    const query:any={select:()=>query,eq:(name:string,value:any)=>{filters.push(`${field(name)}=${param(value)}`);return query;},
      is:(name:string,value:any)=>{filters.push(value===null?`${field(name)} IS NULL`:`${field(name)}=${param(value)}`);return query;},
      in:(name:string,items:any[])=>{filters.push(items.length?`${field(name)} IN (${items.map(param).join(',')})`:'false');return query;},
      limit:(value:number)=>{limit=value;return query;},range:(start:number,end:number)=>{offset=start;limit=end-start+1;return query;},order:()=>query,
      maybeSingle:()=>run(true),then:(resolve:any,reject:any)=>run().then(resolve,reject)};
    return query;
  }};
}

async function seed(db: PGlite, index: number, options: {features?:Record<string,unknown>;email?:string|null;hours?:number;minutes?:number;guardian?:boolean}={}) {
  const org=uid(index),child=uid(100+index),tutor=uid(200+index),parent=uid(300+index),annual=uid(400+index),session=uid(500+index);
  await db.query('INSERT INTO organizations VALUES($1,\'school\',$2::jsonb)',[org,JSON.stringify(options.features??{school_family_portal:true})]);
  await db.query('INSERT INTO profiles VALUES($1,$2,\'teacher@example.test\',$3,0)',[tutor,org,options.hours??0]);
  await db.query(`INSERT INTO students(id,organization_id,full_name,email,payer_email,parent_secondary_email,payment_payer,linked_user_id,enrollment_status)
    VALUES($1,$2,'Child',$3,'mutable-payer@example.test','secondary@example.test','parent',$4,'active')`,[child,org,options.email===undefined?'st-abcd-2345@student-login.tutlio.invalid':options.email,uid(600+index)]);
  await db.query(`INSERT INTO sessions(id,student_id,tutor_id,start_time,status,reminder_student_sent,reminder_tutor_sent,reminder_payer_sent)
    VALUES($1,$2,$3,now()+$4::double precision*interval '1 minute','active',false,true,false)`,[session,child,tutor,options.minutes??15]);
  if(options.guardian!==false) {
    await db.query(`INSERT INTO school_contracts VALUES($1,$2,$3,'annual','signed',NULL,NULL)`,[annual,org,child]);
    await db.query(`INSERT INTO school_family_guardians VALUES($1,$2,$3,$4,'verified-primary@example.test','admin_verified',NULL,'Primary Parent',NULL)`,[org,child,parent,annual]);
  }
  return {org,child,tutor,parent,annual,session};
}
const due=async(db:PGlite)=>(await db.query<{id:string}>('SELECT id::text FROM get_due_session_reminder_ids()')).rows.map(row=>row.id);
const recipient=async(db:PGlite,child:string)=>schoolMaterialRecipient(postgresClient(db),(await db.query('SELECT * FROM students WHERE id=$1',[child])).rows[0] as any);

it('selects one real child join email at 15 minutes even when legacy reminder hours are disabled',async()=>{
  const db=await database();try{
    const one=await seed(db,1,{email:'child@example.test',hours:0,minutes:16});
    expect(await due(db)).toEqual([]);
    await db.query(`UPDATE sessions SET start_time=now()+interval '15 minutes' WHERE id=$1`,[one.session]);
    expect(await due(db)).toEqual([one.session]);
    expect(await recipient(db,one.child)).toEqual({email:'child@example.test',kind:'student',name:'Child',userId:uid(601)});
    await db.query('UPDATE sessions SET reminder_student_sent=true WHERE id=$1',[one.session]);
    expect(await due(db)).toEqual([]);
  }finally{await db.close();}
},30000);

it('routes an internal alias only to the verified primary guardian and never to mutable or secondary contacts',async()=>{
  const db=await database();try{
    const one=await seed(db,1,{hours:0});
    expect(await due(db)).toEqual([one.session]);
    expect(await recipient(db,one.child)).toEqual({email:'verified-primary@example.test',kind:'payer',name:'Primary Parent',userId:one.parent});
    await db.query('UPDATE sessions SET reminder_payer_sent=true WHERE id=$1',[one.session]);
    expect(await due(db)).toEqual([]);
  }finally{await db.close();}
},30000);

it('does not select an alias without a bound live guardian, after annual termination, or with a shared identity',async()=>{
  const db=await database();try{
    await seed(db,1,{guardian:false});const two=await seed(db,2);const three=await seed(db,3);
    await db.query('UPDATE school_contracts SET terminated_at=now() WHERE id=$1',[two.annual]);
    await db.query('UPDATE students SET linked_user_id=$1 WHERE id=$2',[three.parent,three.child]);
    expect(await due(db)).toEqual([]);
    expect(await recipient(db,two.child)).toBeNull();expect(await recipient(db,three.child)).toBeNull();
  }finally{await db.close();}
},30000);

it('preserves the prior hours window when the family feature is disabled or setup-only',async()=>{
  const db=await database();try{
    const one=await seed(db,1,{features:{school_family_portal:false},email:'legacy-child@example.test',hours:2,minutes:30});
    const two=await seed(db,2,{features:{school_family_accounts_setup:true},email:'setup-child@example.test',hours:2,minutes:30});
    await seed(db,3,{features:{school_family_portal:false},email:'disabled-child@example.test',hours:0});
    expect((await due(db)).sort()).toEqual([one.session,two.session].sort());
  }finally{await db.close();}
},30000);

it('does not select a primary guardian whose current signed identity proof has changed',async()=>{
  const db=await database();try{
    const one=await seed(db,1);const signature=uid(701);
    await db.query(`INSERT INTO school_contract_signatures VALUES($1,$2,'parent_primary','signed','verified-primary@example.test','Primary Parent','QA-CODE')`,[signature,one.annual]);
    await db.query(`UPDATE school_family_guardians SET evidence_source='signed_primary',signature_id=$1,signature_personal_code_hash=$2 WHERE student_id=$3`,[signature,schoolFamilyPersonalCodeHash('QA-CODE'),one.child]);
    expect(await due(db)).toEqual([one.session]);expect(await recipient(db,one.child)).not.toBeNull();
    await db.query("UPDATE school_contract_signatures SET signer_email='different-person@example.test' WHERE id=$1",[signature]);
    expect(await recipient(db,one.child)).toBeNull();
    expect(await due(db)).toEqual([]);
    await db.query("UPDATE school_contract_signatures SET signer_email='verified-primary@example.test',signer_personal_code='DIFFERENT-PERSON' WHERE id=$1",[signature]);
    expect(await recipient(db,one.child)).toBeNull();expect(await due(db)).toEqual([]);
    await db.query("UPDATE school_contract_signatures SET signer_personal_code='QA-CODE',signer_name='Other Parent' WHERE id=$1",[signature]);
    expect(await recipient(db,one.child)).toBeNull();expect(await due(db)).toEqual([]);
    await db.query("UPDATE school_contract_signatures SET signer_name='Primary Parent' WHERE id=$1",[signature]);
    await db.query("UPDATE school_family_guardians SET evidence_source='admin_verified',signature_id=NULL,signature_personal_code_hash=NULL WHERE student_id=$1",[one.child]);
    expect(await recipient(db,one.child)).toBeNull();expect(await due(db)).toEqual([]);
  }finally{await db.close();}
},30000);
