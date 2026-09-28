import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { bootstrapSchoolFamilyDatabase } from '../fixtures/schoolFamilyDatabase';

const id = (number: number) => `00000000-0000-4000-8000-${String(number).padStart(12, '0')}`;
it('blocks client signup claims only after school cutover and leaves legacy/preparation and parent contacts unchanged', async () => {
  const db = new PGlite();
  try {
    await bootstrapSchoolFamilyDatabase(db);
    await db.exec(`ALTER TABLE auth.users ADD COLUMN email text, ADD COLUMN raw_user_meta_data jsonb DEFAULT '{}', ADD COLUMN raw_app_meta_data jsonb DEFAULT '{}';
      ALTER TABLE students ADD COLUMN phone text, ADD COLUMN age int, ADD COLUMN grade text, ADD COLUMN subject_id uuid,
        ADD COLUMN payment_payer text, ADD COLUMN payer_name text, ADD COLUMN payer_email text, ADD COLUMN payer_phone text,
        ADD COLUMN accepted_privacy_policy_at timestamptz, ADD COLUMN accepted_terms_at timestamptz;
      CREATE TABLE profiles(id uuid PRIMARY KEY,email text,full_name text,phone text);
      INSERT INTO organizations(id,entity_type,features) VALUES
        ('${id(1)}','school','{}'),('${id(2)}','school','{"school_family_accounts_setup":true}'),
        ('${id(3)}','school','{"school_family_portal":true}'),('${id(4)}','company','{"school_family_portal":true}');
      INSERT INTO students(id,organization_id,full_name,email,payer_email) VALUES
        ('${id(11)}','${id(1)}','Legacy child','shared-parent@example.test','shared-parent@example.test'),
        ('${id(12)}','${id(2)}','Preparation child','shared-parent@example.test','shared-parent@example.test'),
        ('${id(13)}','${id(3)}','Private child','shared-parent@example.test','shared-parent@example.test'),
        ('${id(14)}','${id(4)}','Company child','shared-parent@example.test','shared-parent@example.test');`);
    await db.exec(readFileSync('supabase/migrations/20260928190400_school_family_signup_claim_guard.sql', 'utf8'));
    await db.exec(`CREATE TRIGGER signup_fixture AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION handle_new_user();`);
    for (const number of [1,2,4]) {
      await db.exec(`INSERT INTO auth.users(id,email,raw_user_meta_data)
        VALUES('${id(100+number)}','child-${number}@example.test','{"role":"student","student_id":"${id(10+number)}"}');`);
      expect((await db.query<{ linked_user_id: string }>(`SELECT linked_user_id FROM students WHERE id='${id(10+number)}'`)).rows[0].linked_user_id).toBe(id(100+number));
    }
    await expect(db.exec(`INSERT INTO auth.users(id,email,raw_user_meta_data)
      VALUES('${id(103)}','attacker@example.test','{"role":"student","student_id":"${id(13)}"}');`)).rejects.toThrow('Student is unavailable for registration');
    expect((await db.query(`SELECT id FROM auth.users WHERE id='${id(103)}'`)).rows).toHaveLength(0);
    expect((await db.query(`SELECT linked_user_id,email,payer_email FROM students WHERE id='${id(13)}'`)).rows).toEqual([
      { linked_user_id: null, email: 'shared-parent@example.test', payer_email: 'shared-parent@example.test' },
    ]);
    // Auth admin provisioning has trusted app metadata, so its own scoped link happens afterwards.
    await db.exec(`INSERT INTO auth.users(id,email,raw_user_meta_data,raw_app_meta_data)
      VALUES('${id(113)}','st-abcd-2345@student-login.tutlio.invalid','{"role":"student","student_id":"${id(13)}"}',
        '{"provisioned_by_organization":"${id(3)}"}');
      INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES('${id(120)}','shared-parent@example.test','{"role":"parent","student_id":"${id(13)}"}');`);
    expect((await db.query(`SELECT linked_user_id,email,payer_email FROM students WHERE id='${id(13)}'`)).rows).toEqual([
      { linked_user_id: null, email: 'shared-parent@example.test', payer_email: 'shared-parent@example.test' },
    ]);
    expect((await db.query(`SELECT id FROM profiles WHERE id IN ('${id(113)}','${id(120)}')`)).rows).toHaveLength(0);
    // A verified server-created child has no raw client signup claim. This
    // remains safe even if Auth writes app metadata after its initial insert.
    for (const number of [1,2,3]) {
      const childId = id(20 + number); const userId = id(200 + number);
      await db.exec(`INSERT INTO students(id,organization_id,full_name,email,payer_email)
        VALUES('${childId}','${id(number)}','Explicit server child','real-child-${number}@example.test','shared-parent@example.test');
        INSERT INTO auth.users(id,email,raw_user_meta_data)
        VALUES('${userId}','real-child-${number}@example.test','{"role":"student"}');`);
      expect((await db.query(`SELECT linked_user_id,email FROM students WHERE id='${childId}'`)).rows).toEqual([
        { linked_user_id: null, email: `real-child-${number}@example.test` },
      ]);
      expect((await db.query(`SELECT id FROM profiles WHERE id='${userId}'`)).rows).toHaveLength(1);
      await db.exec(`UPDATE auth.users SET raw_app_meta_data='{"provisioned_by_organization":"${id(number)}","student_id":"${childId}"}'
        WHERE id='${userId}';
        UPDATE students SET linked_user_id='${userId}' WHERE id='${childId}' AND organization_id='${id(number)}' AND linked_user_id IS NULL;`);
      expect((await db.query(`SELECT linked_user_id FROM students WHERE id='${childId}'`)).rows).toEqual([{ linked_user_id: userId }]);
    }
    expect((await db.query(`SELECT payer_email FROM students`)).rows.every((row: any) => row.payer_email === 'shared-parent@example.test')).toBe(true);
  } finally { await db.close(); }
}, 30000);
