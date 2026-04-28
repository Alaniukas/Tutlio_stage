-- ============================================================
-- PROD ACCESS + SECURITY AUDIT (read-only checks)
-- ============================================================
-- How to use:
-- 1) Run the whole script in Supabase SQL Editor (prod).
-- 2) Review each result set. Any returned row in "security_findings"
--    should be treated as an action item.
-- 3) "runtime_access_checks" gives PASS/WARN/FAIL smoke tests for
--    org_admin, tutor, student, and parent users.
--
-- Notes:
-- - This script does not mutate business data.
-- - It only uses temp tables and SELECT/metadata inspection.
-- - Runtime checks use role simulation with request.jwt.claims.
-- ============================================================

DROP TABLE IF EXISTS pg_temp.security_findings;
CREATE TEMP TABLE security_findings (
  severity text,
  category text,
  object_name text,
  details text
) ON COMMIT PRESERVE ROWS;

INSERT INTO security_findings (severity, category, object_name, details)
SELECT
  'high' AS severity,
  'rls_disabled' AS category,
  t.table_schema || '.' || t.table_name AS object_name,
  'RLS is disabled on a critical table' AS details
FROM information_schema.tables t
JOIN pg_class c ON c.relname = t.table_name
JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = t.table_schema
WHERE t.table_schema = 'public'
  AND t.table_name IN (
    'profiles',
    'organization_admins',
    'students',
    'sessions',
    'tutor_invites',
    'parent_profiles',
    'parent_students',
    'parent_invites',
    'student_payment_methods',
    'lesson_packages',
    'billing_batches',
    'billing_batch_sessions',
    'school_contracts',
    'school_payment_installments'
  )
  AND c.relrowsecurity = false;

INSERT INTO security_findings (severity, category, object_name, details)
SELECT
  'high' AS severity,
  'rls_no_policies' AS category,
  n.nspname || '.' || c.relname AS object_name,
  'RLS enabled but zero policies defined' AS details
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
LEFT JOIN pg_policies p
  ON p.schemaname = n.nspname
 AND p.tablename = c.relname
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND c.relrowsecurity = true
GROUP BY n.nspname, c.relname
HAVING COUNT(p.policyname) = 0;

INSERT INTO security_findings (severity, category, object_name, details)
SELECT
  CASE
    WHEN p.tablename IN ('subjects', 'availability') THEN 'info'
    ELSE 'medium'
  END AS severity,
  'open_select_policy' AS category,
  p.schemaname || '.' || p.tablename || ' -> ' || p.policyname AS object_name,
  'SELECT policy predicate is TRUE; verify this is intentional' AS details
FROM pg_policies p
WHERE p.schemaname = 'public'
  AND p.cmd = 'SELECT'
  AND trim(coalesce(p.qual, '')) IN ('true', '(true)');

INSERT INTO security_findings (severity, category, object_name, details)
SELECT
  'high' AS severity,
  'anon_write_grant' AS category,
  table_schema || '.' || table_name AS object_name,
  'anon has write privilege: ' || privilege_type AS details
FROM information_schema.role_table_grants
WHERE grantee = 'anon'
  AND table_schema = 'public'
  AND privilege_type IN ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER');

INSERT INTO security_findings (severity, category, object_name, details)
SELECT
  'medium' AS severity,
  'definer_no_search_path' AS category,
  n.nspname || '.' || p.proname AS object_name,
  'SECURITY DEFINER function does not set search_path' AS details
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.prosecdef = true
  AND NOT EXISTS (
    SELECT 1
    FROM unnest(coalesce(p.proconfig, ARRAY[]::text[])) cfg
    WHERE cfg ILIKE 'search_path=%'
  );

SELECT
  severity,
  category,
  object_name,
  details
FROM security_findings
ORDER BY
  CASE severity WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'info' THEN 3 ELSE 9 END,
  category,
  object_name;

DROP TABLE IF EXISTS pg_temp.runtime_access_checks;
CREATE TEMP TABLE runtime_access_checks (
  actor_role text,
  actor_user_id uuid,
  check_name text,
  status text,
  details text
) ON COMMIT PRESERVE ROWS;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE runtime_access_checks TO authenticated;

DROP TABLE IF EXISTS pg_temp.sample_org_admin_users;
CREATE TEMP TABLE sample_org_admin_users AS
SELECT DISTINCT oa.user_id
FROM public.organization_admins oa
WHERE oa.user_id IS NOT NULL
LIMIT 50;

DROP TABLE IF EXISTS pg_temp.sample_tutor_users;
CREATE TEMP TABLE sample_tutor_users AS
SELECT DISTINCT p.id AS user_id
FROM public.profiles p
WHERE p.id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.organization_admins oa WHERE oa.user_id = p.id)
LIMIT 50;

DROP TABLE IF EXISTS pg_temp.sample_student_users;
CREATE TEMP TABLE sample_student_users AS
SELECT DISTINCT s.linked_user_id AS user_id
FROM public.students s
WHERE s.linked_user_id IS NOT NULL
LIMIT 50;

DROP TABLE IF EXISTS pg_temp.sample_parent_users;
CREATE TEMP TABLE sample_parent_users AS
SELECT DISTINCT pp.user_id
FROM public.parent_profiles pp
WHERE pp.user_id IS NOT NULL
LIMIT 50;

GRANT SELECT ON TABLE sample_org_admin_users TO authenticated;
GRANT SELECT ON TABLE sample_tutor_users TO authenticated;
GRANT SELECT ON TABLE sample_student_users TO authenticated;
GRANT SELECT ON TABLE sample_parent_users TO authenticated;

DO $$
DECLARE
  v_uid uuid;
  v_rows int;
BEGIN
  BEGIN
    EXECUTE 'SET LOCAL ROLE authenticated';
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO runtime_access_checks VALUES (
      'system',
      NULL,
      'set_local_role_authenticated',
      'FAIL',
      'Cannot SET LOCAL ROLE authenticated: ' || SQLERRM
    );
    RETURN;
  END;

  FOR v_uid IN SELECT s.user_id FROM sample_org_admin_users s LOOP
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_uid::text, 'role', 'authenticated')::text, true);
    BEGIN
      SELECT COUNT(*) INTO v_rows FROM public.organization_admins oa WHERE oa.user_id = v_uid;
      INSERT INTO runtime_access_checks VALUES (
        'org_admin', v_uid, 'can_read_own_org_admin_row',
        CASE WHEN v_rows > 0 THEN 'PASS' ELSE 'FAIL' END,
        CASE WHEN v_rows > 0 THEN 'row visible' ELSE 'own row not visible' END
      );
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO runtime_access_checks VALUES ('org_admin', v_uid, 'can_read_own_org_admin_row', 'FAIL', SQLERRM);
    END;
    BEGIN
      PERFORM 1 FROM public.profiles LIMIT 1;
      INSERT INTO runtime_access_checks VALUES ('org_admin', v_uid, 'profiles_select_smoke', 'PASS', 'query ok');
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO runtime_access_checks VALUES ('org_admin', v_uid, 'profiles_select_smoke', 'FAIL', SQLERRM);
    END;
  END LOOP;
  IF NOT EXISTS (SELECT 1 FROM sample_org_admin_users) THEN
    INSERT INTO runtime_access_checks VALUES ('org_admin', NULL, 'sample_presence', 'WARN', 'no org_admin users found');
  END IF;

  FOR v_uid IN SELECT s.user_id FROM sample_tutor_users s LOOP
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_uid::text, 'role', 'authenticated')::text, true);
    BEGIN
      SELECT COUNT(*) INTO v_rows FROM public.profiles p WHERE p.id = v_uid;
      INSERT INTO runtime_access_checks VALUES (
        'tutor', v_uid, 'can_read_own_profile',
        CASE WHEN v_rows > 0 THEN 'PASS' ELSE 'FAIL' END,
        CASE WHEN v_rows > 0 THEN 'profile visible' ELSE 'own profile not visible' END
      );
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO runtime_access_checks VALUES ('tutor', v_uid, 'can_read_own_profile', 'FAIL', SQLERRM);
    END;
    BEGIN
      PERFORM 1 FROM public.students s WHERE s.tutor_id = v_uid LIMIT 1;
      INSERT INTO runtime_access_checks VALUES ('tutor', v_uid, 'students_select_smoke', 'PASS', 'query ok');
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO runtime_access_checks VALUES ('tutor', v_uid, 'students_select_smoke', 'FAIL', SQLERRM);
    END;
  END LOOP;
  IF NOT EXISTS (SELECT 1 FROM sample_tutor_users) THEN
    INSERT INTO runtime_access_checks VALUES ('tutor', NULL, 'sample_presence', 'WARN', 'no tutor-like profiles found');
  END IF;

  FOR v_uid IN SELECT s.user_id FROM sample_student_users s LOOP
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_uid::text, 'role', 'authenticated')::text, true);
    BEGIN
      SELECT COUNT(*) INTO v_rows FROM public.students s WHERE s.linked_user_id = v_uid;
      INSERT INTO runtime_access_checks VALUES (
        'student', v_uid, 'can_read_own_student_row',
        CASE WHEN v_rows > 0 THEN 'PASS' ELSE 'FAIL' END,
        CASE WHEN v_rows > 0 THEN 'student row visible' ELSE 'own student row not visible' END
      );
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO runtime_access_checks VALUES ('student', v_uid, 'can_read_own_student_row', 'FAIL', SQLERRM);
    END;
    BEGIN
      PERFORM 1
      FROM public.profiles p
      JOIN public.students s ON s.tutor_id = p.id
      WHERE s.linked_user_id = v_uid
      LIMIT 1;
      INSERT INTO runtime_access_checks VALUES ('student', v_uid, 'can_read_tutor_profile_smoke', 'PASS', 'query ok');
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO runtime_access_checks VALUES ('student', v_uid, 'can_read_tutor_profile_smoke', 'FAIL', SQLERRM);
    END;
  END LOOP;
  IF NOT EXISTS (SELECT 1 FROM sample_student_users) THEN
    INSERT INTO runtime_access_checks VALUES ('student', NULL, 'sample_presence', 'WARN', 'no linked students found');
  END IF;

  FOR v_uid IN SELECT s.user_id FROM sample_parent_users s LOOP
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_uid::text, 'role', 'authenticated')::text, true);
    BEGIN
      SELECT COUNT(*) INTO v_rows FROM public.parent_profiles pp WHERE pp.user_id = v_uid;
      INSERT INTO runtime_access_checks VALUES (
        'parent', v_uid, 'can_read_own_parent_profile',
        CASE WHEN v_rows > 0 THEN 'PASS' ELSE 'FAIL' END,
        CASE WHEN v_rows > 0 THEN 'parent profile visible' ELSE 'own parent profile not visible' END
      );
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO runtime_access_checks VALUES ('parent', v_uid, 'can_read_own_parent_profile', 'FAIL', SQLERRM);
    END;
    BEGIN
      PERFORM 1
      FROM public.profiles p
      JOIN public.students s ON s.tutor_id = p.id
      JOIN public.parent_students ps ON ps.student_id = s.id
      JOIN public.parent_profiles pp ON pp.id = ps.parent_id
      WHERE pp.user_id = v_uid
      LIMIT 1;
      INSERT INTO runtime_access_checks VALUES ('parent', v_uid, 'can_read_child_tutor_profile_smoke', 'PASS', 'query ok');
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO runtime_access_checks VALUES ('parent', v_uid, 'can_read_child_tutor_profile_smoke', 'FAIL', SQLERRM);
    END;
  END LOOP;

  IF NOT EXISTS (SELECT 1 FROM sample_parent_users) THEN
    INSERT INTO runtime_access_checks VALUES (
      'parent',
      NULL,
      'sample_presence',
      'PASS',
      'no parent users found (expected if parent flow is not used in this tenant)'
    );
  END IF;
END $$;

RESET ROLE;
RESET ALL;

SELECT
  actor_role,
  actor_user_id,
  check_name,
  status,
  details
FROM runtime_access_checks
ORDER BY
  actor_role,
  CASE status WHEN 'FAIL' THEN 1 WHEN 'WARN' THEN 2 WHEN 'PASS' THEN 3 ELSE 9 END,
  actor_user_id NULLS LAST,
  check_name;

SELECT
  actor_role,
  status,
  COUNT(*) AS checks
FROM runtime_access_checks
GROUP BY actor_role, status
ORDER BY actor_role, status;
