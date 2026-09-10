-- Unify parent access checks: parent_students link OR students.parent_user_id = auth.uid().
-- Fixes gaps where parents could READ via one path but not WRITE, or missed legacy parent_user_id rows.

-- ─── 1) Core helper ───────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.parent_can_access_student(p_student_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.parent_students ps
    JOIN public.parent_profiles pp ON pp.id = ps.parent_id
    WHERE ps.student_id = p_student_id
      AND pp.user_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1
    FROM public.students s
    WHERE s.id = p_student_id
      AND s.parent_user_id = auth.uid()
  );
$$;

REVOKE ALL ON FUNCTION public.parent_can_access_student(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.parent_can_access_student(uuid) TO authenticated, service_role;

-- ─── 2) students (SELECT already uses helper; add parent UPDATE parity with linked student) ─
DROP POLICY IF EXISTS "students_parent_select" ON public.students;
CREATE POLICY "students_parent_select" ON public.students
  FOR SELECT
  USING (public.parent_can_access_student(id));

DROP POLICY IF EXISTS "students_parent_update" ON public.students;
CREATE POLICY "students_parent_update" ON public.students
  FOR UPDATE
  USING (
    public.parent_can_access_student(id)
    AND NOT public.write_blocked_by_org_suspension()
  )
  WITH CHECK (public.parent_can_access_student(id));

-- ─── 3) sessions ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "sessions_select" ON public.sessions;
CREATE POLICY "sessions_select" ON public.sessions
  FOR SELECT
  USING (
    auth.uid() = tutor_id
    OR student_id IN (SELECT id FROM public.students WHERE linked_user_id = auth.uid())
    OR public.parent_can_access_student(student_id)
  );

DROP POLICY IF EXISTS "sessions_insert" ON public.sessions;
CREATE POLICY "sessions_insert" ON public.sessions
  FOR INSERT
  WITH CHECK (
    (
      auth.uid() = tutor_id
      OR student_id IN (SELECT id FROM public.students WHERE linked_user_id = auth.uid())
      OR public.parent_can_access_student(student_id)
    )
    AND NOT public.student_self_booking_disabled(student_id)
    AND NOT public.write_blocked_by_org_suspension()
  );

DROP POLICY IF EXISTS "sessions_student_update" ON public.sessions;
CREATE POLICY "sessions_student_update" ON public.sessions
  FOR UPDATE
  USING (
    (
      student_id IN (SELECT id FROM public.students WHERE linked_user_id = auth.uid())
      OR public.parent_can_access_student(student_id)
    )
    AND NOT public.write_blocked_by_org_suspension()
  )
  WITH CHECK (
    (
      student_id IN (SELECT id FROM public.students WHERE linked_user_id = auth.uid())
      OR public.parent_can_access_student(student_id)
    )
    AND NOT public.write_blocked_by_org_suspension()
  );

-- ─── 4) waitlists ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "waitlists_select" ON public.waitlists;
CREATE POLICY "waitlists_select" ON public.waitlists
  FOR SELECT
  USING (
    auth.uid() = tutor_id
    OR student_id IN (SELECT id FROM public.students WHERE linked_user_id = auth.uid())
    OR public.parent_can_access_student(student_id)
    OR EXISTS (
      SELECT 1
      FROM public.profiles p
      JOIN public.organization_admins oa ON oa.organization_id = p.organization_id AND oa.user_id = auth.uid()
      WHERE p.id = waitlists.tutor_id
    )
  );

DROP POLICY IF EXISTS "waitlists_insert" ON public.waitlists;
CREATE POLICY "waitlists_insert" ON public.waitlists
  FOR INSERT
  WITH CHECK (
    (
      auth.uid() = tutor_id
      OR student_id IN (SELECT id FROM public.students WHERE linked_user_id = auth.uid())
      OR public.parent_can_access_student(student_id)
      OR EXISTS (
        SELECT 1
        FROM public.profiles p
        JOIN public.organization_admins oa ON oa.organization_id = p.organization_id AND oa.user_id = auth.uid()
        WHERE p.id = waitlists.tutor_id
      )
    )
    AND NOT public.write_blocked_by_org_suspension()
  );

DROP POLICY IF EXISTS "waitlists_update" ON public.waitlists;
CREATE POLICY "waitlists_update" ON public.waitlists
  FOR UPDATE
  USING (
    (
      auth.uid() = tutor_id
      OR student_id IN (SELECT id FROM public.students WHERE linked_user_id = auth.uid())
      OR public.parent_can_access_student(student_id)
      OR EXISTS (
        SELECT 1
        FROM public.profiles p
        JOIN public.organization_admins oa ON oa.organization_id = p.organization_id AND oa.user_id = auth.uid()
        WHERE p.id = waitlists.tutor_id
      )
    )
    AND NOT public.write_blocked_by_org_suspension()
  )
  WITH CHECK (
    (
      auth.uid() = tutor_id
      OR student_id IN (SELECT id FROM public.students WHERE linked_user_id = auth.uid())
      OR public.parent_can_access_student(student_id)
      OR EXISTS (
        SELECT 1
        FROM public.profiles p
        JOIN public.organization_admins oa ON oa.organization_id = p.organization_id AND oa.user_id = auth.uid()
        WHERE p.id = waitlists.tutor_id
      )
    )
    AND NOT public.write_blocked_by_org_suspension()
  );

DROP POLICY IF EXISTS "waitlists_delete" ON public.waitlists;
CREATE POLICY "waitlists_delete" ON public.waitlists
  FOR DELETE
  USING (
    auth.uid() = tutor_id
    OR student_id IN (SELECT id FROM public.students WHERE linked_user_id = auth.uid())
    OR public.parent_can_access_student(student_id)
    OR EXISTS (
      SELECT 1
      FROM public.profiles p
      JOIN public.organization_admins oa ON oa.organization_id = p.organization_id AND oa.user_id = auth.uid()
      WHERE p.id = waitlists.tutor_id
    )
  );

-- ─── 5) availability + subjects (parent booking calendar) ─────────────────────
DROP POLICY IF EXISTS "availability_select_parent_child" ON public.availability;
CREATE POLICY "availability_select_parent_child" ON public.availability
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.students st
      WHERE st.tutor_id = availability.tutor_id
        AND public.parent_can_access_student(st.id)
    )
  );

DROP POLICY IF EXISTS "subjects_select_parent_child" ON public.subjects;
CREATE POLICY "subjects_select_parent_child" ON public.subjects
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.students st
      WHERE st.tutor_id = subjects.tutor_id
        AND public.parent_can_access_student(st.id)
    )
  );

-- ─── 6) finance read paths ────────────────────────────────────────────────────
DROP POLICY IF EXISTS "lesson_packages_parent_select" ON public.lesson_packages;
CREATE POLICY "lesson_packages_parent_select" ON public.lesson_packages
  FOR SELECT
  USING (public.parent_can_access_student(student_id));

DROP POLICY IF EXISTS "lesson_package_items_parent_select" ON public.lesson_package_items;
CREATE POLICY "lesson_package_items_parent_select" ON public.lesson_package_items
  FOR SELECT
  USING (
    package_id IN (
      SELECT lp.id
      FROM public.lesson_packages lp
      WHERE public.parent_can_access_student(lp.student_id)
    )
  );

DROP POLICY IF EXISTS "student_individual_pricing_parent_select" ON public.student_individual_pricing;
CREATE POLICY "student_individual_pricing_parent_select" ON public.student_individual_pricing
  FOR SELECT
  USING (public.parent_can_access_student(student_id));

CREATE OR REPLACE FUNCTION public.parent_can_view_sales_invoice(p_invoice_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT
    EXISTS (
      SELECT 1
      FROM public.invoice_line_items ili
      CROSS JOIN LATERAL unnest(COALESCE(ili.session_ids, ARRAY[]::uuid[])) AS sid(session_id)
      INNER JOIN public.sessions sess ON sess.id = sid.session_id
      WHERE ili.invoice_id = p_invoice_id
        AND public.parent_can_access_student(sess.student_id)
    )
    OR EXISTS (
      SELECT 1
      FROM public.lesson_packages lp
      WHERE lp.manual_sales_invoice_id = p_invoice_id
        AND public.parent_can_access_student(lp.student_id)
    );
$$;

REVOKE ALL ON FUNCTION public.parent_can_view_sales_invoice(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.parent_can_view_sales_invoice(uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS "invoices_parent_select" ON public.invoices;
CREATE POLICY "invoices_parent_select" ON public.invoices
  FOR SELECT
  USING (public.parent_can_view_sales_invoice(id));

DROP POLICY IF EXISTS "invoice_line_items_parent_select" ON public.invoice_line_items;
CREATE POLICY "invoice_line_items_parent_select" ON public.invoice_line_items
  FOR SELECT
  USING (public.parent_can_view_sales_invoice(invoice_line_items.invoice_id));

DROP POLICY IF EXISTS "Parents read invoice PDFs" ON storage.objects;
CREATE POLICY "Parents read invoice PDFs" ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'invoices'
    AND EXISTS (
      SELECT 1
      FROM public.invoices inv
      WHERE inv.pdf_storage_path IS NOT NULL
        AND inv.pdf_storage_path = storage.objects.name
        AND public.parent_can_view_sales_invoice(inv.id)
    )
  );

-- ─── 7) school org read paths (ParentDashboard installments) ──────────────────
DROP POLICY IF EXISTS "school_contracts_parent_select" ON public.school_contracts;
CREATE POLICY "school_contracts_parent_select" ON public.school_contracts
  FOR SELECT
  USING (public.parent_can_access_student(student_id));

DROP POLICY IF EXISTS "school_installments_parent_select" ON public.school_payment_installments;
CREATE POLICY "school_installments_parent_select" ON public.school_payment_installments
  FOR SELECT
  USING (
    contract_id IN (
      SELECT sc.id
      FROM public.school_contracts sc
      WHERE public.parent_can_access_student(sc.student_id)
    )
  );

DROP POLICY IF EXISTS "org_parent_can_read_child_org" ON public.organizations;
CREATE POLICY "org_parent_can_read_child_org" ON public.organizations
  FOR SELECT
  USING (
    id IN (
      SELECT COALESCE(s.organization_id, p.organization_id)
      FROM public.students s
      LEFT JOIN public.profiles p ON p.id = s.tutor_id
      WHERE public.parent_can_access_student(s.id)
        AND COALESCE(s.organization_id, p.organization_id) IS NOT NULL
    )
  );

-- ─── 8) profiles + chat helpers ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.can_read_profile_as_parent(p_profile_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.students s
    WHERE s.tutor_id = p_profile_id
      AND public.parent_can_access_student(s.id)
  );
$$;

REVOKE ALL ON FUNCTION public.can_read_profile_as_parent(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_read_profile_as_parent(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.can_access_conversation(p_conversation_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.chat_participants
    WHERE conversation_id = p_conversation_id AND user_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM public.organization_admins oa
    JOIN public.profiles p ON p.organization_id = oa.organization_id
    JOIN public.chat_participants cp ON cp.user_id = p.id
    WHERE oa.user_id = auth.uid()
      AND cp.conversation_id = p_conversation_id
  )
  OR EXISTS (
    SELECT 1 FROM public.organization_admins oa
    JOIN public.profiles tutor_p ON tutor_p.organization_id = oa.organization_id
    JOIN public.students s ON s.tutor_id = tutor_p.id
    JOIN public.chat_participants cp ON cp.user_id = s.linked_user_id
    WHERE oa.user_id = auth.uid()
      AND cp.conversation_id = p_conversation_id
  )
  OR EXISTS (
    SELECT 1
    FROM public.chat_participants cp
    JOIN public.students s ON s.linked_user_id = cp.user_id
    WHERE cp.conversation_id = p_conversation_id
      AND public.parent_can_access_student(s.id)
  );
$$;

REVOKE ALL ON FUNCTION public.can_access_conversation(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_access_conversation(uuid) TO authenticated, service_role;

-- ─── 9) session column guard + reschedule RPC ─────────────────────────────────
CREATE OR REPLACE FUNCTION public.sessions_student_column_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_is_student_actor boolean;
BEGIN
  IF v_uid IS NULL THEN
    RETURN NEW;
  END IF;

  IF current_setting('app.allow_student_session_write', true) = '1' THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS (
           SELECT 1 FROM public.students s
           WHERE s.id = NEW.student_id AND s.linked_user_id = v_uid
         )
      OR public.parent_can_access_student(NEW.student_id)
    INTO v_is_student_actor;

  IF NOT v_is_student_actor THEN
    RETURN NEW;
  END IF;

  IF (to_jsonb(NEW) - 'student_joined_at' - 'available_spots')
     IS DISTINCT FROM
     (to_jsonb(OLD) - 'student_joined_at' - 'available_spots') THEN
    RAISE EXCEPTION 'students_may_only_update_join_tracking_and_spots'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.student_reschedule_session(
  p_session_id uuid,
  p_new_start_time timestamptz,
  p_new_end_time timestamptz
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session_student_id uuid;
  v_current_start timestamptz;
  v_original_start timestamptz;
  v_lesson_package_id uuid;
  v_org_id uuid;
  v_anchor timestamptz;
BEGIN
  IF public.write_blocked_by_org_suspension() THEN
    RETURN json_build_object('success', false, 'error', 'organization_suspended');
  END IF;

  SELECT se.student_id, se.start_time, se.original_start_time, se.lesson_package_id, p.organization_id
    INTO v_session_student_id, v_current_start, v_original_start, v_lesson_package_id, v_org_id
  FROM sessions se
  LEFT JOIN profiles p ON p.id = se.tutor_id
  WHERE se.id = p_session_id;

  IF v_session_student_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Session not found');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.students s
    WHERE s.id = v_session_student_id AND s.linked_user_id = auth.uid()
  )
  AND NOT public.parent_can_access_student(v_session_student_id) THEN
    RETURN json_build_object('success', false, 'error', 'Not authorized to reschedule this session');
  END IF;

  IF v_org_id IS NOT NULL
     AND public.org_has_feature(v_org_id, 'disable_student_reschedule_cancel') THEN
    RETURN json_build_object('success', false, 'error', 'student_actions_disabled');
  END IF;

  IF v_lesson_package_id IS NOT NULL
     AND v_org_id IS NOT NULL
     AND public.org_has_feature(v_org_id, 'monthly_packages') THEN
    v_anchor := COALESCE(v_original_start, v_current_start);
    IF date_trunc('month', p_new_start_time) <> date_trunc('month', v_anchor) THEN
      RETURN json_build_object('success', false, 'error', 'different_month');
    END IF;
  END IF;

  PERFORM set_config('app.allow_student_session_write', '1', true);

  UPDATE sessions
  SET
    start_time = p_new_start_time,
    end_time = p_new_end_time,
    original_start_time = COALESCE(original_start_time, start_time),
    rescheduled_at = now(),
    reminder_student_sent = false,
    reminder_tutor_sent = false,
    reminder_payer_sent = false
  WHERE id = p_session_id;

  RETURN json_build_object('success', true);
END;
$$;

REVOKE ALL ON FUNCTION public.student_reschedule_session(uuid, timestamptz, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.student_reschedule_session(uuid, timestamptz, timestamptz) TO authenticated, service_role;

-- ─── 10) get_student_profiles RPC (parent path via unified helper) ────────────
DROP FUNCTION IF EXISTS public.get_student_profiles(uuid, uuid);

CREATE OR REPLACE FUNCTION public.get_student_profiles(
  p_user_id uuid,
  p_student_id uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  full_name text,
  email text,
  phone text,
  age integer,
  grade text,
  tutor_id uuid,
  tutor_full_name text,
  tutor_email text,
  payment_payer text,
  payer_name text,
  payer_email text,
  invite_code text,
  tutor_cancellation_hours integer,
  tutor_cancellation_fee_percent numeric,
  tutor_min_booking_hours integer,
  tutor_break_between_lessons integer,
  payment_model text,
  payment_override_active boolean,
  credit_balance numeric,
  organization_id uuid,
  organization_entity_type text,
  tutor_organization_entity_type text,
  tutor_organization_slug text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    s.id,
    s.full_name,
    s.email,
    s.phone,
    s.age,
    s.grade,
    s.tutor_id,
    p.full_name AS tutor_full_name,
    p.email AS tutor_email,
    s.payment_payer,
    s.payer_name,
    s.payer_email,
    s.invite_code,
    p.cancellation_hours AS tutor_cancellation_hours,
    p.cancellation_fee_percent AS tutor_cancellation_fee_percent,
    p.min_booking_hours AS tutor_min_booking_hours,
    p.break_between_lessons AS tutor_break_between_lessons,
    s.payment_model,
    COALESCE(
      CASE
        WHEN p.organization_id IS NOT NULL THEN (NULLIF(trim(o_tutor_org.features->>'per_student_payment_override'), ''))::boolean
        ELSE p.enable_per_student_payment_override
      END,
      false
    ) AS payment_override_active,
    COALESCE(s.credit_balance, 0) AS credit_balance,
    s.organization_id,
    so.entity_type::text AS organization_entity_type,
    o_tutor_org.entity_type::text AS tutor_organization_entity_type,
    o_tutor_org.slug::text AS tutor_organization_slug
  FROM public.students s
  LEFT JOIN public.profiles p ON p.id = s.tutor_id
  LEFT JOIN public.organizations o_tutor_org ON o_tutor_org.id = p.organization_id
  LEFT JOIN public.organizations so ON so.id = s.organization_id
  WHERE auth.uid() = p_user_id
    AND (
      s.linked_user_id = auth.uid()
      OR public.parent_can_access_student(s.id)
    )
    AND (p_student_id IS NULL OR s.id = p_student_id)
  ORDER BY s.created_at DESC;
$$;

REVOKE ALL ON FUNCTION public.get_student_profiles(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_student_profiles(uuid, uuid) TO authenticated, service_role;
