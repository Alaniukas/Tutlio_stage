-- Parent invites: URL token (UUID) + short manual code; metadata columns.
-- RPCs for invite preview (token + code+email).
-- RLS: sessions/waitlists/students/lesson_packages for linked parents.
-- Chat: parents can access conversations their child participates in.

-- ─── 1) parent_invites columns & token migration ────────────────────────────
ALTER TABLE public.parent_invites
  ADD COLUMN IF NOT EXISTS code text,
  ADD COLUMN IF NOT EXISTS invited_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source text;

ALTER TABLE public.parent_invites
  DROP CONSTRAINT IF EXISTS parent_invites_source_check;

ALTER TABLE public.parent_invites
  ADD CONSTRAINT parent_invites_source_check
  CHECK (source IS NULL OR source IN ('student_self', 'school_admin'));

-- Backfill: old `token` was a short code; move to `code`, new UUID for URL.
UPDATE public.parent_invites
SET code = UPPER(TRIM(token))
WHERE code IS NULL AND token IS NOT NULL;

UPDATE public.parent_invites
SET token = gen_random_uuid()::text
WHERE code IS NOT NULL;

ALTER TABLE public.parent_invites
  ALTER COLUMN code SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS parent_invites_code_unique
  ON public.parent_invites (UPPER(TRIM(code)));

-- ─── 2) Invite preview RPCs (SECURITY DEFINER) ─────────────────────────────
DROP FUNCTION IF EXISTS public.get_parent_invite_preview(text);

CREATE OR REPLACE FUNCTION public.get_parent_invite_preview(p_token text)
RETURNS TABLE (
  parent_email text,
  parent_name text,
  student_full_name text,
  used boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    pi.parent_email,
    pi.parent_name,
    s.full_name AS student_full_name,
    pi.used
  FROM public.parent_invites pi
  LEFT JOIN public.students s ON s.id = pi.student_id
  WHERE pi.token = trim(p_token)
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.get_parent_invite_preview_by_code(p_code text, p_email text)
RETURNS TABLE (
  token text,
  parent_email text,
  parent_name text,
  student_full_name text,
  used boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    pi.token,
    pi.parent_email,
    pi.parent_name,
    s.full_name AS student_full_name,
    pi.used
  FROM public.parent_invites pi
  LEFT JOIN public.students s ON s.id = pi.student_id
  WHERE UPPER(TRIM(pi.code)) = UPPER(TRIM(p_code))
    AND lower(trim(pi.parent_email)) = lower(trim(p_email))
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_parent_invite_preview(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_parent_invite_preview_by_code(text, text) TO anon, authenticated;

-- ─── 3) can_access_conversation: parent of student participant ─────────────
CREATE OR REPLACE FUNCTION public.can_access_conversation(p_conversation_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
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
    JOIN public.parent_students ps ON ps.student_id = s.id
    JOIN public.parent_profiles pp ON pp.id = ps.parent_id AND pp.user_id = auth.uid()
    WHERE cp.conversation_id = p_conversation_id
  );
$$;

-- ─── 4) Sessions: parent may SELECT / INSERT / UPDATE like linked student ───
DROP POLICY IF EXISTS "sessions_select" ON public.sessions;
CREATE POLICY "sessions_select" ON public.sessions FOR SELECT
  USING (
    auth.uid() = tutor_id OR
    student_id IN (SELECT id FROM public.students WHERE linked_user_id = auth.uid()) OR
    student_id IN (
      SELECT ps.student_id
      FROM public.parent_students ps
      JOIN public.parent_profiles pp ON pp.id = ps.parent_id AND pp.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "sessions_insert" ON public.sessions;
CREATE POLICY "sessions_insert" ON public.sessions FOR INSERT
  WITH CHECK (
    (
      auth.uid() = tutor_id OR
      student_id IN (SELECT id FROM public.students WHERE linked_user_id = auth.uid()) OR
      student_id IN (
        SELECT ps.student_id
        FROM public.parent_students ps
        JOIN public.parent_profiles pp ON pp.id = ps.parent_id AND pp.user_id = auth.uid()
      )
    )
    AND NOT public.write_blocked_by_org_suspension()
  );

DROP POLICY IF EXISTS "sessions_student_update" ON public.sessions;
CREATE POLICY "sessions_student_update" ON public.sessions FOR UPDATE
  USING (
    (
      student_id IN (SELECT id FROM public.students WHERE linked_user_id = auth.uid()) OR
      student_id IN (
        SELECT ps.student_id
        FROM public.parent_students ps
        JOIN public.parent_profiles pp ON pp.id = ps.parent_id AND pp.user_id = auth.uid()
      )
    )
    AND NOT public.write_blocked_by_org_suspension()
  )
  WITH CHECK (
    (
      student_id IN (SELECT id FROM public.students WHERE linked_user_id = auth.uid()) OR
      student_id IN (
        SELECT ps.student_id
        FROM public.parent_students ps
        JOIN public.parent_profiles pp ON pp.id = ps.parent_id AND pp.user_id = auth.uid()
      )
    )
    AND NOT public.write_blocked_by_org_suspension()
  );

-- ─── 5) Students: parent can read linked children ────────────────────────────
DROP POLICY IF EXISTS "students_parent_select" ON public.students;
CREATE POLICY "students_parent_select" ON public.students FOR SELECT
  USING (
    id IN (
      SELECT ps.student_id
      FROM public.parent_students ps
      JOIN public.parent_profiles pp ON pp.id = ps.parent_id AND pp.user_id = auth.uid()
    )
  );

-- ─── 6) Waitlists: parent same as student ───────────────────────────────────
DROP POLICY IF EXISTS "waitlists_select" ON public.waitlists;
CREATE POLICY "waitlists_select" ON public.waitlists FOR SELECT
  USING (
    auth.uid() = tutor_id
    OR student_id IN (SELECT id FROM public.students WHERE linked_user_id = auth.uid())
    OR student_id IN (
      SELECT ps.student_id
      FROM public.parent_students ps
      JOIN public.parent_profiles pp ON pp.id = ps.parent_id AND pp.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1
      FROM public.profiles p
      INNER JOIN public.organization_admins oa
        ON oa.organization_id = p.organization_id
       AND oa.user_id = auth.uid()
      WHERE p.id = waitlists.tutor_id
    )
  );

DROP POLICY IF EXISTS "waitlists_insert" ON public.waitlists;
CREATE POLICY "waitlists_insert" ON public.waitlists FOR INSERT
  WITH CHECK (
    (
      auth.uid() = tutor_id
      OR student_id IN (SELECT id FROM public.students WHERE linked_user_id = auth.uid())
      OR student_id IN (
        SELECT ps.student_id
        FROM public.parent_students ps
        JOIN public.parent_profiles pp ON pp.id = ps.parent_id AND pp.user_id = auth.uid()
      )
      OR EXISTS (
        SELECT 1
        FROM public.profiles p
        INNER JOIN public.organization_admins oa
          ON oa.organization_id = p.organization_id
         AND oa.user_id = auth.uid()
        WHERE p.id = tutor_id
      )
    )
    AND NOT public.write_blocked_by_org_suspension()
  );

DROP POLICY IF EXISTS "waitlists_update" ON public.waitlists;
CREATE POLICY "waitlists_update" ON public.waitlists FOR UPDATE
  USING (
    (
      auth.uid() = tutor_id
      OR student_id IN (SELECT id FROM public.students WHERE linked_user_id = auth.uid())
      OR student_id IN (
        SELECT ps.student_id
        FROM public.parent_students ps
        JOIN public.parent_profiles pp ON pp.id = ps.parent_id AND pp.user_id = auth.uid()
      )
      OR EXISTS (
        SELECT 1
        FROM public.profiles p
        INNER JOIN public.organization_admins oa
          ON oa.organization_id = p.organization_id
         AND oa.user_id = auth.uid()
        WHERE p.id = waitlists.tutor_id
      )
    )
    AND NOT public.write_blocked_by_org_suspension()
  )
  WITH CHECK (
    (
      auth.uid() = tutor_id
      OR student_id IN (SELECT id FROM public.students WHERE linked_user_id = auth.uid())
      OR student_id IN (
        SELECT ps.student_id
        FROM public.parent_students ps
        JOIN public.parent_profiles pp ON pp.id = ps.parent_id AND pp.user_id = auth.uid()
      )
      OR EXISTS (
        SELECT 1
        FROM public.profiles p
        INNER JOIN public.organization_admins oa
          ON oa.organization_id = p.organization_id
         AND oa.user_id = auth.uid()
        WHERE p.id = waitlists.tutor_id
      )
    )
    AND NOT public.write_blocked_by_org_suspension()
  );

DROP POLICY IF EXISTS "waitlists_delete" ON public.waitlists;
CREATE POLICY "waitlists_delete" ON public.waitlists FOR DELETE
  USING (
    auth.uid() = tutor_id
    OR student_id IN (SELECT id FROM public.students WHERE linked_user_id = auth.uid())
    OR student_id IN (
      SELECT ps.student_id
      FROM public.parent_students ps
      JOIN public.parent_profiles pp ON pp.id = ps.parent_id AND pp.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1
      FROM public.profiles p
      INNER JOIN public.organization_admins oa
        ON oa.organization_id = p.organization_id
       AND oa.user_id = auth.uid()
      WHERE p.id = waitlists.tutor_id
    )
  );

-- ─── 7) Lesson packages: parent read for child ─────────────────────────────
DROP POLICY IF EXISTS "lesson_packages_parent_select" ON public.lesson_packages;
CREATE POLICY "lesson_packages_parent_select" ON public.lesson_packages FOR SELECT
  USING (
    student_id IN (
      SELECT ps.student_id
      FROM public.parent_students ps
      JOIN public.parent_profiles pp ON pp.id = ps.parent_id AND pp.user_id = auth.uid()
    )
  );

-- ─── 8) Student individual pricing: parent read ────────────────────────────
DROP POLICY IF EXISTS "student_individual_pricing_parent_select" ON public.student_individual_pricing;
CREATE POLICY "student_individual_pricing_parent_select" ON public.student_individual_pricing FOR SELECT
  USING (
    student_id IN (
      SELECT ps.student_id
      FROM public.parent_students ps
      JOIN public.parent_profiles pp ON pp.id = ps.parent_id AND pp.user_id = auth.uid()
    )
  );

-- ─── 9) Booking block: same overdue rules when caller is parent ─────────────
CREATE OR REPLACE FUNCTION public.student_booking_blocked_overdue(p_student_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid;
  v_tutor uuid;
  v_restrict boolean;
  v_timing text;
  v_deadline_h int;
  v_now timestamptz := now();
  st_email text;
  st_payer_email text;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RETURN false;
  END IF;

  SELECT s.tutor_id,
         nullif(lower(trim(coalesce(s.email, ''))), ''),
         nullif(lower(trim(coalesce(s.payer_email, ''))), '')
  INTO v_tutor, st_email, st_payer_email
  FROM public.students s
  WHERE s.id = p_student_id;

  IF v_tutor IS NULL THEN
    RETURN false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.students s
    WHERE s.id = p_student_id AND s.linked_user_id = v_uid
  ) AND NOT EXISTS (
    SELECT 1
    FROM public.parent_students ps
    JOIN public.parent_profiles pp ON pp.id = ps.parent_id AND pp.user_id = v_uid
    WHERE ps.student_id = p_student_id
  ) THEN
    RETURN false;
  END IF;

  SELECT COALESCE(p.restrict_booking_on_overdue, false),
         COALESCE(p.payment_timing, 'before_lesson'),
         COALESCE(p.payment_deadline_hours, 24)
  INTO v_restrict, v_timing, v_deadline_h
  FROM public.profiles p
  WHERE p.id = v_tutor;

  IF NOT v_restrict THEN
    RETURN false;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.billing_batches bb
    WHERE bb.tutor_id = v_tutor
      AND bb.paid = false
      AND bb.payment_deadline_date < v_now
      AND (
        (st_email IS NOT NULL AND lower(trim(bb.payer_email)) = st_email)
        OR (st_payer_email IS NOT NULL AND lower(trim(bb.payer_email)) = st_payer_email)
      )
  ) THEN
    RETURN true;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.sessions s
    INNER JOIN public.students st ON st.id = s.student_id
    WHERE s.student_id = p_student_id
      AND s.status <> 'cancelled'
      AND COALESCE(s.paid, false) = false
      AND COALESCE(s.payment_status, '') NOT IN ('paid', 'confirmed', 'paid_by_student')
      AND s.lesson_package_id IS NULL
      AND s.payment_batch_id IS NULL
      AND (
        CASE
          WHEN (
            CASE
              WHEN position('per_lesson' in coalesce(st.payment_model, '')) > 0 AND st.per_lesson_payment_timing IS NOT NULL
              THEN st.per_lesson_payment_timing
              ELSE v_timing
            END
          ) = 'before_lesson' THEN
            v_now > s.start_time - (
              (
                CASE
                  WHEN position('per_lesson' in coalesce(st.payment_model, '')) > 0 AND st.per_lesson_payment_deadline_hours IS NOT NULL
                  THEN st.per_lesson_payment_deadline_hours
                  ELSE v_deadline_h
                END
              ) * interval '1 hour'
            )
          ELSE
            v_now > s.end_time + (
              (
                CASE
                  WHEN position('per_lesson' in coalesce(st.payment_model, '')) > 0 AND st.per_lesson_payment_deadline_hours IS NOT NULL
                  THEN st.per_lesson_payment_deadline_hours
                  ELSE v_deadline_h
                END
              ) * interval '1 hour'
            )
        END
      )
  ) THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$$;

REVOKE ALL ON FUNCTION public.student_booking_blocked_overdue(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.student_booking_blocked_overdue(uuid) TO authenticated;
