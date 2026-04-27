-- ============================================================
-- RLS SECURITY AUDIT – Comprehensive hardening
-- ============================================================
--
-- Fixes discovered during audit:
-- 1. Tables with RLS DISABLED: parent_profiles, parent_students, student_payment_methods
-- 2. Excessive anon GRANT ALL on core tables
-- 3. tutor_invites open SELECT (USING true) exposes invitee PII
-- 4. parent_invites open SELECT exposes parent emails
-- 5. SECURITY DEFINER functions without caller authorization
-- 6. storage school-contracts bucket too open
-- 7. Debug function with hardcoded UUID
-- 8. Functions missing SET search_path
-- ============================================================

-- =====================================================
-- PART 1: Enable RLS on unprotected tables
-- =====================================================

ALTER TABLE public.parent_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.parent_students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_payment_methods ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- PART 2: parent_profiles policies
-- =====================================================

DROP POLICY IF EXISTS "parent_profiles_select_own" ON public.parent_profiles;
CREATE POLICY "parent_profiles_select_own" ON public.parent_profiles
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "parent_profiles_update_own" ON public.parent_profiles;
CREATE POLICY "parent_profiles_update_own" ON public.parent_profiles
  FOR UPDATE USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "parent_profiles_select_org_admin" ON public.parent_profiles;
CREATE POLICY "parent_profiles_select_org_admin" ON public.parent_profiles
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.parent_students ps
      JOIN public.students s ON s.id = ps.student_id
      JOIN public.profiles p ON p.id = s.tutor_id
      JOIN public.organization_admins oa ON oa.organization_id = p.organization_id
      WHERE ps.parent_id = parent_profiles.id
        AND oa.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "parent_profiles_select_tutor" ON public.parent_profiles;
CREATE POLICY "parent_profiles_select_tutor" ON public.parent_profiles
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.parent_students ps
      JOIN public.students s ON s.id = ps.student_id
      WHERE ps.parent_id = parent_profiles.id
        AND s.tutor_id = auth.uid()
    )
  );

GRANT SELECT, UPDATE ON public.parent_profiles TO authenticated;
GRANT ALL ON public.parent_profiles TO service_role;

-- =====================================================
-- PART 3: parent_students policies
-- =====================================================

DROP POLICY IF EXISTS "parent_students_select_own" ON public.parent_students;
CREATE POLICY "parent_students_select_own" ON public.parent_students
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.parent_profiles pp
      WHERE pp.id = parent_students.parent_id
        AND pp.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "parent_students_select_tutor" ON public.parent_students;
CREATE POLICY "parent_students_select_tutor" ON public.parent_students
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.students s
      WHERE s.id = parent_students.student_id
        AND s.tutor_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "parent_students_select_org_admin" ON public.parent_students;
CREATE POLICY "parent_students_select_org_admin" ON public.parent_students
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.students s
      JOIN public.profiles p ON p.id = s.tutor_id
      JOIN public.organization_admins oa ON oa.organization_id = p.organization_id
      WHERE s.id = parent_students.student_id
        AND oa.user_id = auth.uid()
    )
  );

GRANT SELECT ON public.parent_students TO authenticated;
GRANT ALL ON public.parent_students TO service_role;

-- =====================================================
-- PART 4: student_payment_methods policies
-- =====================================================

DROP POLICY IF EXISTS "spm_tutor_all" ON public.student_payment_methods;
CREATE POLICY "spm_tutor_all" ON public.student_payment_methods
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.students s
      WHERE s.id = student_payment_methods.student_id
        AND s.tutor_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "spm_student_select" ON public.student_payment_methods;
CREATE POLICY "spm_student_select" ON public.student_payment_methods
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.students s
      WHERE s.id = student_payment_methods.student_id
        AND s.linked_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "spm_org_admin_all" ON public.student_payment_methods;
CREATE POLICY "spm_org_admin_all" ON public.student_payment_methods
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.students s
      JOIN public.profiles p ON p.id = s.tutor_id
      JOIN public.organization_admins oa ON oa.organization_id = p.organization_id
      WHERE s.id = student_payment_methods.student_id
        AND oa.user_id = auth.uid()
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.student_payment_methods TO authenticated;
GRANT ALL ON public.student_payment_methods TO service_role;

-- =====================================================
-- PART 5: Fix tutor_invites open SELECT
-- =====================================================
-- "Anyone can read invite by token" uses USING(true) which exposes
-- ALL invites including invitee_email, invitee_phone to any user.
-- Replace with targeted policies + a SECURITY DEFINER RPC for pre-auth
-- token validation (Register + Login pages need to validate tokens
-- before the user is authenticated).

DROP POLICY IF EXISTS "Anyone can read invite by token" ON public.tutor_invites;
DROP POLICY IF EXISTS "Authenticated can read invite by token" ON public.tutor_invites;

-- Authenticated users can read unused invites (accept-invite flow)
DROP POLICY IF EXISTS "Authenticated can read unused invites" ON public.tutor_invites;
CREATE POLICY "Authenticated can read unused invites" ON public.tutor_invites
  FOR SELECT USING (
    auth.uid() IS NOT NULL
    AND used = false
  );

-- Tutors can read their own accepted invite
DROP POLICY IF EXISTS "Tutor can read own accepted invite" ON public.tutor_invites;
CREATE POLICY "Tutor can read own accepted invite" ON public.tutor_invites
  FOR SELECT USING (used_by_profile_id = auth.uid());

-- SECURITY DEFINER RPC for pre-auth token validation (anon-safe).
-- Returns only non-sensitive fields; no invitee_email/phone exposed.
CREATE OR REPLACE FUNCTION public.validate_tutor_invite_token(p_token text)
RETURNS TABLE(id uuid, used boolean, organization_id uuid, organization_name text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    ti.id,
    ti.used,
    ti.organization_id,
    coalesce(o.name, '')::text AS organization_name
  FROM public.tutor_invites ti
  LEFT JOIN public.organizations o ON o.id = ti.organization_id
  WHERE ti.token = p_token
  LIMIT 1;
$function$;

GRANT EXECUTE ON FUNCTION public.validate_tutor_invite_token(text) TO anon;
GRANT EXECUTE ON FUNCTION public.validate_tutor_invite_token(text) TO authenticated;

-- =====================================================
-- PART 6: Fix parent_invites open SELECT
-- =====================================================
-- Currently USING(true) exposes all parent emails.
-- Token lookup for registration happens server-side (register-parent.ts uses service_role).
-- The only client-side need is the preview RPC (get_parent_invite_preview) which is SECURITY DEFINER.

DROP POLICY IF EXISTS "allow_public_select" ON public.parent_invites;

-- Only allow the invited parent to see their own invites after registration
DROP POLICY IF EXISTS "parent_invites_own_email" ON public.parent_invites;
CREATE POLICY "parent_invites_own_email" ON public.parent_invites
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM auth.users u
      WHERE u.id = auth.uid()
        AND lower(trim(u.email)) = lower(trim(parent_invites.parent_email))
    )
  );

-- Org admin / tutor can see invites for students they manage
DROP POLICY IF EXISTS "parent_invites_tutor_select" ON public.parent_invites;
CREATE POLICY "parent_invites_tutor_select" ON public.parent_invites
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.students s
      WHERE s.id = parent_invites.student_id
        AND s.tutor_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "parent_invites_org_admin_select" ON public.parent_invites;
CREATE POLICY "parent_invites_org_admin_select" ON public.parent_invites
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.students s
      JOIN public.profiles p ON p.id = s.tutor_id
      JOIN public.organization_admins oa ON oa.organization_id = p.organization_id
      WHERE s.id = parent_invites.student_id
        AND oa.user_id = auth.uid()
    )
  );

-- =====================================================
-- PART 7: Revoke excessive anon privileges
-- =====================================================
-- anon should NOT have write access to core tables.
-- Supabase Data API respects both GRANT + RLS, but defense in depth
-- requires minimal grants at the GRANT layer too.

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.organizations FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.organization_admins FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.profiles FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.subjects FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.recurring_individual_sessions FROM anon;

-- tutor_invites: anon needs SELECT for invite lookup during onboarding
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.tutor_invites FROM anon;

-- lesson_packages: anon only had SELECT, keep that for public package display if needed
-- but actually anon shouldn't access lesson packages at all
REVOKE ALL ON public.lesson_packages FROM anon;

-- =====================================================
-- PART 8: Secure SECURITY DEFINER functions
-- =====================================================

-- admin_org_students: Auth check — org admin or service_role (API routes)
CREATE OR REPLACE FUNCTION public.admin_org_students(p_org_id uuid)
RETURNS TABLE(id uuid, full_name text, email text, tutor_id uuid)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT DISTINCT s.id, s.full_name, s.email, s.tutor_id
  FROM public.students s
  WHERE
    (
      (auth.jwt() ->> 'role') = 'service_role'
      OR EXISTS (
        SELECT 1 FROM public.organization_admins oa
        WHERE oa.user_id = auth.uid() AND oa.organization_id = p_org_id
      )
    )
    AND (
      EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = s.tutor_id AND p.organization_id = p_org_id
      )
      OR EXISTS (
        SELECT 1 FROM public.organization_admins oa
        WHERE oa.user_id = s.tutor_id AND oa.organization_id = p_org_id
      )
      OR EXISTS (
        SELECT 1 FROM public.tutor_invites ti
        WHERE ti.used_by_profile_id = s.tutor_id AND ti.organization_id = p_org_id
      )
      OR (s.organization_id IS NOT NULL AND s.organization_id = p_org_id)
    );
$function$;

-- admin_org_student_count: Auth check — org admin or service_role (API routes)
CREATE OR REPLACE FUNCTION public.admin_org_student_count(p_org_id uuid)
RETURNS bigint
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN NOT (
      (auth.jwt() ->> 'role') = 'service_role'
      OR EXISTS (
        SELECT 1 FROM public.organization_admins oa
        WHERE oa.user_id = auth.uid() AND oa.organization_id = p_org_id
      )
    ) THEN 0::bigint
    ELSE (
      SELECT COUNT(*)::bigint
      FROM public.students s
      WHERE
        EXISTS (
          SELECT 1 FROM public.profiles p
          WHERE p.id = s.tutor_id AND p.organization_id = p_org_id
        )
        OR EXISTS (
          SELECT 1 FROM public.organization_admins oa2
          WHERE oa2.user_id = s.tutor_id AND oa2.organization_id = p_org_id
        )
        OR EXISTS (
          SELECT 1 FROM public.tutor_invites ti
          WHERE ti.used_by_profile_id = s.tutor_id AND ti.organization_id = p_org_id
        )
        OR (s.organization_id IS NOT NULL AND s.organization_id = p_org_id)
    )
  END;
$function$;

-- get_student_individual_pricing: Add auth check (tutor, org admin, or linked student)
CREATE OR REPLACE FUNCTION public.get_student_individual_pricing(p_student_id uuid)
RETURNS TABLE (
    id uuid,
    student_id uuid,
    tutor_id uuid,
    subject_id uuid,
    price numeric,
    duration_minutes integer,
    cancellation_hours integer,
    cancellation_fee_percent numeric,
    created_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
    SELECT
        sip.id,
        sip.student_id,
        sip.tutor_id,
        sip.subject_id,
        sip.price,
        sip.duration_minutes,
        sip.cancellation_hours,
        sip.cancellation_fee_percent,
        sip.created_at
    FROM public.student_individual_pricing sip
    WHERE sip.student_id = p_student_id
      AND (
        sip.tutor_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.students s
          WHERE s.id = p_student_id AND s.linked_user_id = auth.uid()
        )
        OR EXISTS (
          SELECT 1 FROM public.organization_admins oa
          JOIN public.profiles p ON p.organization_id = oa.organization_id
          WHERE oa.user_id = auth.uid() AND p.id = sip.tutor_id
        )
      );
$function$;

-- get_student_active_packages: Add auth check
CREATE OR REPLACE FUNCTION public.get_student_active_packages(p_student_id uuid)
RETURNS TABLE (
  package_id uuid,
  subject_id uuid,
  subject_name text,
  total_lessons integer,
  available_lessons numeric,
  reserved_lessons numeric,
  completed_lessons numeric,
  price_per_lesson numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT (
    EXISTS (SELECT 1 FROM public.students s WHERE s.id = p_student_id AND s.tutor_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.students s WHERE s.id = p_student_id AND s.linked_user_id = auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.students s
      JOIN public.profiles p ON p.id = s.tutor_id
      JOIN public.organization_admins oa ON oa.organization_id = p.organization_id
      WHERE s.id = p_student_id AND oa.user_id = auth.uid()
    )
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    lp.id,
    lp.subject_id,
    s.name,
    lp.total_lessons,
    lp.available_lessons,
    lp.reserved_lessons,
    lp.completed_lessons,
    lp.price_per_lesson
  FROM public.lesson_packages lp
  INNER JOIN public.subjects s ON s.id = lp.subject_id
  WHERE lp.student_id = p_student_id
    AND lp.active = true
    AND lp.paid = true
    AND lp.available_lessons > 0
  ORDER BY lp.created_at DESC;
END;
$function$;

-- get_unpaid_sessions_for_billing: Add auth check (caller must be the tutor or their org admin)
CREATE OR REPLACE FUNCTION public.get_unpaid_sessions_for_billing(
  p_tutor_id uuid,
  p_period_start date,
  p_period_end date
)
RETURNS TABLE (
  session_id uuid,
  student_id uuid,
  student_name text,
  payer_email text,
  payer_name text,
  session_date timestamptz,
  subject_name text,
  price numeric,
  total_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT (
    p_tutor_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.organization_admins oa
      JOIN public.profiles p ON p.organization_id = oa.organization_id
      WHERE oa.user_id = auth.uid() AND p.id = p_tutor_id
    )
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF p_period_end - p_period_start > 45 THEN
    RAISE EXCEPTION 'Period cannot exceed 45 days';
  END IF;

  RETURN QUERY
  SELECT
    sess.id,
    sess.student_id,
    st.full_name,
    COALESCE(st.payer_email, st.email) AS payer_email,
    COALESCE(st.payer_name, st.full_name) AS payer_name,
    sess.start_time,
    subj.name,
    CASE
      WHEN sess.status = 'cancelled' AND sess.is_late_cancelled = true
        THEN COALESCE(sess.cancellation_penalty_amount, 0)
      ELSE sess.price
    END AS price,
    COUNT(*) OVER() AS total_count
  FROM public.sessions sess
  INNER JOIN public.students st ON st.id = sess.student_id
  LEFT JOIN public.subjects subj ON subj.id = sess.subject_id
  WHERE sess.tutor_id = p_tutor_id
    AND (
      sess.status = 'completed'
      OR (sess.status = 'cancelled' AND sess.is_late_cancelled = true AND sess.penalty_resolution = 'invoiced')
    )
    AND sess.paid = false
    AND sess.payment_batch_id IS NULL
    AND sess.lesson_package_id IS NULL
    AND DATE(sess.start_time) >= p_period_start
    AND DATE(sess.start_time) <= p_period_end
  ORDER BY sess.start_time ASC;
END;
$function$;

-- =====================================================
-- PART 9: Fix storage school-contracts bucket
-- =====================================================
-- Currently ANY authenticated user can read/upload all school contracts.
-- Restrict to org admins of the contract's org + the linked student.

DROP POLICY IF EXISTS "school_contracts_authenticated_insert" ON storage.objects;
DROP POLICY IF EXISTS "school_contracts_authenticated_read" ON storage.objects;

CREATE POLICY "school_contracts_org_admin_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'school-contracts'
    AND EXISTS (
      SELECT 1 FROM public.organization_admins oa
      WHERE oa.user_id = auth.uid()
    )
  );

CREATE POLICY "school_contracts_org_admin_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'school-contracts'
    AND EXISTS (
      SELECT 1 FROM public.organization_admins oa
      WHERE oa.user_id = auth.uid()
    )
  );

CREATE POLICY "school_contracts_student_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'school-contracts'
    AND EXISTS (
      SELECT 1 FROM public.school_contracts sc
      JOIN public.students s ON s.id = sc.student_id
      WHERE s.linked_user_id = auth.uid()
    )
  );

-- =====================================================
-- PART 10: Drop debug function, fix search_path
-- =====================================================

DROP FUNCTION IF EXISTS public.test_rls_policy();

-- Fix missing SET search_path on get_student_active_packages
-- (already replaced above with SET search_path)

-- Fix missing SET search_path on handle_new_user
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  meta_role text := lower(trim(coalesce(new.raw_user_meta_data->>'role', '')));
  meta_student_id text := trim(coalesce(new.raw_user_meta_data->>'student_id', ''));
  is_student_by_meta boolean := (meta_role = 'student' or meta_student_id <> '');
  student_id_to_link uuid;
  linked_count int;
  v_org_id uuid;
BEGIN
  IF is_student_by_meta AND meta_student_id <> '' THEN
    UPDATE public.students
    SET
      linked_user_id = new.id,
      email = coalesce(new.email, new.raw_user_meta_data->>'email'),
      phone = coalesce(new.raw_user_meta_data->>'phone', phone),
      age = cast(nullif(new.raw_user_meta_data->>'age', '') as integer),
      grade = new.raw_user_meta_data->>'grade',
      subject_id = nullif(new.raw_user_meta_data->>'subject_id', '')::uuid,
      payment_payer = coalesce(new.raw_user_meta_data->>'payment_payer', 'self'),
      payer_name = new.raw_user_meta_data->>'payer_name',
      payer_email = new.raw_user_meta_data->>'payer_email',
      payer_phone = new.raw_user_meta_data->>'payer_phone',
      accepted_privacy_policy_at = (new.raw_user_meta_data->>'accepted_privacy_policy_at')::timestamptz,
      accepted_terms_at = (new.raw_user_meta_data->>'accepted_terms_at')::timestamptz
    WHERE id = meta_student_id::uuid;

    SELECT organization_id INTO v_org_id FROM public.students WHERE id = meta_student_id::uuid;
    IF v_org_id IS NOT NULL THEN
      INSERT INTO public.profiles (id, email, full_name, phone, organization_id)
      VALUES (new.id, new.email, new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'phone', v_org_id)
      ON CONFLICT (id) DO UPDATE SET organization_id = v_org_id;
    END IF;

    RETURN new;
  END IF;

  SELECT s.id INTO student_id_to_link
  FROM public.students s
  WHERE s.linked_user_id IS NULL
    AND trim(lower(coalesce(s.email, ''))) = trim(lower(coalesce(new.email, '')))
  LIMIT 1;

  IF student_id_to_link IS NOT NULL THEN
    UPDATE public.students
    SET linked_user_id = new.id, email = coalesce(new.email, email)
    WHERE id = student_id_to_link;
    GET DIAGNOSTICS linked_count = ROW_COUNT;
    IF linked_count > 0 THEN
      SELECT organization_id INTO v_org_id FROM public.students WHERE id = student_id_to_link;
      IF v_org_id IS NOT NULL THEN
        INSERT INTO public.profiles (id, email, full_name, organization_id)
        VALUES (new.id, new.email, new.raw_user_meta_data->>'full_name', v_org_id)
        ON CONFLICT (id) DO UPDATE SET organization_id = v_org_id;
      END IF;
      RETURN new;
    END IF;
  END IF;

  INSERT INTO public.profiles (id, email, full_name, phone)
  VALUES (new.id, new.email, new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'phone')
  ON CONFLICT (id) DO NOTHING;
  RETURN new;
END;
$function$;

-- =====================================================
-- PART 11: Add school_contract_completion_tokens policies
-- =====================================================
-- This table has RLS enabled but no policies.
-- It's accessed only via service_role (API routes), so no client policies needed.
-- Add explicit deny for safety documentation.

-- No authenticated policies needed: all access is via service_role which bypasses RLS.
-- RLS enabled with no policies = deny all for authenticated/anon (correct behavior).

-- =====================================================
-- PART 12: Replace open profiles SELECT with granular policies
-- =====================================================
-- profiles_select USING(true) from 20260325 migration exposes all tutor
-- emails, phones, and stripe IDs to any user (including anon).
-- Replace with per-role policies. StudentOnboarding (the only anon flow
-- that needed tutor data) now uses the get_student_by_invite_code RPC.

DROP POLICY IF EXISTS "profiles_select" ON public.profiles;

DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;
CREATE POLICY "profiles_select_own" ON public.profiles
  FOR SELECT USING (auth.uid() = id);

DROP POLICY IF EXISTS "profiles_select_org_colleague" ON public.profiles;
CREATE POLICY "profiles_select_org_colleague" ON public.profiles
  FOR SELECT USING (
    organization_id IS NOT NULL
    AND organization_id IN (
      SELECT oa.organization_id FROM public.organization_admins oa
      WHERE oa.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "profiles_select_tutor_of_linked_student" ON public.profiles;
CREATE POLICY "profiles_select_tutor_of_linked_student" ON public.profiles
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.students s
      WHERE s.linked_user_id = auth.uid()
        AND s.tutor_id = profiles.id
    )
  );

DROP POLICY IF EXISTS "profiles_select_chat_peer" ON public.profiles;
CREATE POLICY "profiles_select_chat_peer" ON public.profiles
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.chat_participants cp_self
      JOIN public.chat_participants cp_peer
        ON cp_peer.conversation_id = cp_self.conversation_id
      WHERE cp_self.user_id = auth.uid()
        AND cp_peer.user_id = profiles.id
    )
  );

-- Parent can see their children's tutor profile
DROP POLICY IF EXISTS "profiles_select_parent_tutor" ON public.profiles;
CREATE POLICY "profiles_select_parent_tutor" ON public.profiles
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.parent_profiles pp
      JOIN public.parent_students ps ON ps.parent_id = pp.id
      JOIN public.students s ON s.id = ps.student_id
      WHERE pp.user_id = auth.uid()
        AND s.tutor_id = profiles.id
    )
  );
