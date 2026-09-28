import type { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';

export async function bootstrapSchoolFamilyDatabase(db: PGlite) {
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth;
    CREATE TABLE auth.users(id uuid PRIMARY KEY);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('test.uid',true),'')::uuid $$;
    CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql AS $$ SELECT jsonb_build_object('email',current_setting('test.email',true)) $$;
    CREATE TABLE public.organizations(id uuid PRIMARY KEY,name text,entity_type text,features jsonb DEFAULT '{}'::jsonb);
    CREATE TABLE public.organization_admins(id uuid DEFAULT gen_random_uuid(),user_id uuid,organization_id uuid,status text DEFAULT 'active');
    CREATE TABLE public.students(id uuid PRIMARY KEY,organization_id uuid,linked_user_id uuid,parent_user_id uuid,tutor_id uuid,
      full_name text,email text,detached_at timestamptz,enrollment_status text DEFAULT 'active');
    CREATE TABLE public.parent_profiles(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid,full_name text,email text);
    CREATE TABLE public.parent_students(parent_id uuid,student_id uuid,PRIMARY KEY(parent_id,student_id));
    CREATE TABLE public.school_contracts(id uuid PRIMARY KEY,organization_id uuid,student_id uuid,kind text DEFAULT 'annual',
      signing_status text DEFAULT 'signed',archived_at timestamptz,terminated_at timestamptz,created_at timestamptz DEFAULT now());
    CREATE TABLE public.school_contract_signatures(id uuid PRIMARY KEY,contract_id uuid,role text,status text,signer_email text,
      signer_name text,signer_personal_code text);
    CREATE TABLE public.sessions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),student_id uuid,tutor_id uuid);
    CREATE FUNCTION public.tutor_can_access_student(p_student_id uuid) RETURNS boolean LANGUAGE sql SECURITY DEFINER
      SET search_path=public SET row_security=off AS $$ SELECT EXISTS(SELECT 1 FROM students WHERE id=p_student_id AND tutor_id=auth.uid()) $$;
    CREATE FUNCTION public.org_admin_can_access_student(p_student_id uuid) RETURNS boolean LANGUAGE sql SECURITY DEFINER
      SET search_path=public SET row_security=off AS $$ SELECT EXISTS(SELECT 1 FROM students s JOIN organization_admins a ON a.organization_id=s.organization_id WHERE s.id=p_student_id AND a.user_id=auth.uid()) $$;
    ALTER TABLE students ENABLE ROW LEVEL SECURITY; ALTER TABLE parent_students ENABLE ROW LEVEL SECURITY;
    ALTER TABLE sessions ENABLE ROW LEVEL SECURITY; ALTER TABLE school_contracts ENABLE ROW LEVEL SECURITY;
    CREATE POLICY legacy_students ON students FOR ALL TO authenticated USING(true) WITH CHECK(true);
    CREATE POLICY legacy_parent_links ON parent_students FOR ALL TO authenticated USING(true) WITH CHECK(true);
    CREATE POLICY legacy_sessions ON sessions FOR ALL TO authenticated USING(true) WITH CHECK(true);
    CREATE POLICY legacy_contracts ON school_contracts FOR ALL TO authenticated USING(true) WITH CHECK(true);
    GRANT USAGE ON SCHEMA auth,public TO authenticated,anon,service_role;
    GRANT SELECT,INSERT,UPDATE,DELETE ON students,parent_students,sessions,school_contracts,parent_profiles,organizations TO authenticated;
  `);
  await db.exec(readFileSync('supabase/migrations/20260928190000_school_family_account_workflow.sql', 'utf8'));
}
