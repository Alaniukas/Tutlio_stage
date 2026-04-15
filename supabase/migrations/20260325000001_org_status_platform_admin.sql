-- Org status (active/suspended), per-org feature flags (JSON), platform admin audit,
-- and RLS helper to block all writes when org is suspended (tutors, org admins, students under org tutors).

-- ─── 1. columns ─────────────────────────────────────────────────────────────
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'suspended'));

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS features jsonb NOT NULL DEFAULT '{}'::jsonb;

-- ─── 2. audit table (service_role only from API) ─────────────────────────────
CREATE TABLE IF NOT EXISTS public.platform_admin_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  action text NOT NULL,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb
);

ALTER TABLE public.platform_admin_audit ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.platform_admin_audit IS 'Super-admin actions (x-admin-secret API); no client access.';

-- ─── 3. write blocked helper (SECURITY DEFINER for stable org lookup) ───────
CREATE OR REPLACE FUNCTION public.write_blocked_by_org_suspension()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    JOIN public.organizations o ON o.id = p.organization_id
    WHERE p.id = auth.uid() AND o.status = 'suspended'
  )
  OR EXISTS (
    SELECT 1 FROM public.students s
    JOIN public.profiles p ON p.id = s.tutor_id
    JOIN public.organizations o ON o.id = p.organization_id
    WHERE s.linked_user_id = auth.uid() AND o.status = 'suspended'
  );
$$;

REVOKE ALL ON FUNCTION public.write_blocked_by_org_suspension() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.write_blocked_by_org_suspension() TO authenticated;

-- ─── 4. student_reschedule_session: respect suspension ─────────────────────
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
  v_student_id uuid;
  v_session_student_id uuid;
BEGIN
  IF public.write_blocked_by_org_suspension() THEN
    RETURN json_build_object('success', false, 'error', 'organization_suspended');
  END IF;

  SELECT id INTO v_student_id
  FROM students
  WHERE linked_user_id = auth.uid()
  LIMIT 1;

  IF v_student_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Student not found');
  END IF;

  SELECT student_id INTO v_session_student_id
  FROM sessions
  WHERE id = p_session_id;

  IF v_session_student_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Session not found');
  END IF;

  IF v_session_student_id != v_student_id THEN
    RETURN json_build_object('success', false, 'error', 'Not authorized to reschedule this session');
  END IF;

  UPDATE sessions
  SET
    start_time = p_new_start_time,
    end_time = p_new_end_time,
    reminder_student_sent = false,
    reminder_tutor_sent = false,
    reminder_payer_sent = false
  WHERE id = p_session_id;

  RETURN json_build_object('success', true);
END;
$$;

-- ─── 5. profiles RLS ─────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "profiles_select" ON public.profiles;
DROP POLICY IF EXISTS "profiles_insert" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update" ON public.profiles;
DROP POLICY IF EXISTS "Public profiles are viewable by everyone." ON public.profiles;
DROP POLICY IF EXISTS "Users can insert their own profile." ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile." ON public.profiles;
DROP POLICY IF EXISTS "Org admins can update their org's tutors" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
DROP POLICY IF EXISTS "profiles_org_admin_update_tutors" ON public.profiles;

CREATE POLICY "profiles_select" ON public.profiles FOR SELECT USING (true);

CREATE POLICY "profiles_insert" ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = id AND NOT public.write_blocked_by_org_suspension());

CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE
  USING (auth.uid() = id AND NOT public.write_blocked_by_org_suspension())
  WITH CHECK (auth.uid() = id AND NOT public.write_blocked_by_org_suspension());

CREATE POLICY "profiles_org_admin_update_tutors" ON public.profiles FOR UPDATE
  USING (
    organization_id IN (
      SELECT organization_id FROM public.organization_admins WHERE user_id = auth.uid()
    )
    AND NOT public.write_blocked_by_org_suspension()
  )
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM public.organization_admins WHERE user_id = auth.uid()
    )
    AND NOT public.write_blocked_by_org_suspension()
  );

-- ─── 6. students RLS ─────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "students_select" ON public.students;
DROP POLICY IF EXISTS "students_insert" ON public.students;
DROP POLICY IF EXISTS "students_update" ON public.students;
DROP POLICY IF EXISTS "students_delete" ON public.students;
DROP POLICY IF EXISTS "students_public_invite" ON public.students;
DROP POLICY IF EXISTS "students_self_update" ON public.students;
DROP POLICY IF EXISTS "students_self_select" ON public.students;
DROP POLICY IF EXISTS "Org admin can view org students" ON public.students;
DROP POLICY IF EXISTS "Org admin can insert org students" ON public.students;
DROP POLICY IF EXISTS "Org admin can update org students" ON public.students;
DROP POLICY IF EXISTS "Org admin can delete org students" ON public.students;

CREATE POLICY "students_select" ON public.students FOR SELECT
  USING (auth.uid() = tutor_id);

CREATE POLICY "students_insert" ON public.students FOR INSERT
  WITH CHECK (auth.uid() = tutor_id AND NOT public.write_blocked_by_org_suspension());

CREATE POLICY "students_update" ON public.students FOR UPDATE
  USING (auth.uid() = tutor_id AND NOT public.write_blocked_by_org_suspension())
  WITH CHECK (auth.uid() = tutor_id AND NOT public.write_blocked_by_org_suspension());

CREATE POLICY "students_delete" ON public.students FOR DELETE
  USING (auth.uid() = tutor_id AND NOT public.write_blocked_by_org_suspension());

CREATE POLICY "students_public_invite" ON public.students FOR SELECT
  USING (invite_code IS NOT NULL);

CREATE POLICY "students_self_select" ON public.students FOR SELECT
  USING (auth.uid() = linked_user_id);

CREATE POLICY "students_self_update" ON public.students FOR UPDATE
  USING (
    (auth.uid() = linked_user_id OR linked_user_id IS NULL)
    AND NOT public.write_blocked_by_org_suspension()
  )
  WITH CHECK (auth.uid() = linked_user_id);

CREATE POLICY "Org admin can view org students" ON public.students FOR SELECT
  USING (
    tutor_id IN (
      SELECT id FROM public.profiles
      WHERE organization_id IN (
        SELECT organization_id FROM public.organization_admins WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "Org admin can insert org students" ON public.students FOR INSERT
  WITH CHECK (
    tutor_id IN (
      SELECT id FROM public.profiles
      WHERE organization_id IN (
        SELECT organization_id FROM public.organization_admins WHERE user_id = auth.uid()
      )
    )
    AND NOT public.write_blocked_by_org_suspension()
  );

CREATE POLICY "Org admin can update org students" ON public.students FOR UPDATE
  USING (
    tutor_id IN (
      SELECT id FROM public.profiles
      WHERE organization_id IN (
        SELECT organization_id FROM public.organization_admins WHERE user_id = auth.uid()
      )
    )
    AND NOT public.write_blocked_by_org_suspension()
  )
  WITH CHECK (
    tutor_id IN (
      SELECT id FROM public.profiles
      WHERE organization_id IN (
        SELECT organization_id FROM public.organization_admins WHERE user_id = auth.uid()
      )
    )
    AND NOT public.write_blocked_by_org_suspension()
  );

CREATE POLICY "Org admin can delete org students" ON public.students FOR DELETE
  USING (
    tutor_id IN (
      SELECT id FROM public.profiles
      WHERE organization_id IN (
        SELECT organization_id FROM public.organization_admins WHERE user_id = auth.uid()
      )
    )
    AND NOT public.write_blocked_by_org_suspension()
  );

-- ─── 7. sessions RLS ─────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "sessions_select" ON public.sessions;
DROP POLICY IF EXISTS "sessions_insert" ON public.sessions;
DROP POLICY IF EXISTS "sessions_update" ON public.sessions;
DROP POLICY IF EXISTS "sessions_delete" ON public.sessions;
DROP POLICY IF EXISTS "sessions_student_update" ON public.sessions;
DROP POLICY IF EXISTS "Org admins can view org sessions" ON public.sessions;

CREATE POLICY "sessions_select" ON public.sessions FOR SELECT
  USING (
    auth.uid() = tutor_id OR
    student_id IN (SELECT id FROM public.students WHERE linked_user_id = auth.uid())
  );

CREATE POLICY "sessions_insert" ON public.sessions FOR INSERT
  WITH CHECK (
    (
      auth.uid() = tutor_id OR
      student_id IN (SELECT id FROM public.students WHERE linked_user_id = auth.uid())
    )
    AND NOT public.write_blocked_by_org_suspension()
  );

CREATE POLICY "sessions_update" ON public.sessions FOR UPDATE
  USING (auth.uid() = tutor_id AND NOT public.write_blocked_by_org_suspension())
  WITH CHECK (auth.uid() = tutor_id AND NOT public.write_blocked_by_org_suspension());

CREATE POLICY "sessions_delete" ON public.sessions FOR DELETE
  USING (auth.uid() = tutor_id AND NOT public.write_blocked_by_org_suspension());

CREATE POLICY "sessions_student_update" ON public.sessions FOR UPDATE
  USING (
    student_id IN (SELECT id FROM public.students WHERE linked_user_id = auth.uid())
    AND NOT public.write_blocked_by_org_suspension()
  )
  WITH CHECK (
    student_id IN (SELECT id FROM public.students WHERE linked_user_id = auth.uid())
    AND NOT public.write_blocked_by_org_suspension()
  );

CREATE POLICY "Org admins can view org sessions" ON public.sessions FOR SELECT
  USING (
    tutor_id IN (
      SELECT id FROM public.profiles
      WHERE organization_id IN (
        SELECT organization_id FROM public.organization_admins WHERE user_id = auth.uid()
      )
    )
  );

-- ─── 8. waitlists RLS (split ALL vs read) ────────────────────────────────────
DROP POLICY IF EXISTS "waitlists_all" ON public.waitlists;
DROP POLICY IF EXISTS "waitlists_select" ON public.waitlists;
DROP POLICY IF EXISTS "waitlists_insert" ON public.waitlists;
DROP POLICY IF EXISTS "waitlists_update" ON public.waitlists;
DROP POLICY IF EXISTS "waitlists_delete" ON public.waitlists;

CREATE POLICY "waitlists_select" ON public.waitlists FOR SELECT
  USING (
    auth.uid() = tutor_id OR
    student_id IN (SELECT id FROM public.students WHERE linked_user_id = auth.uid())
  );

CREATE POLICY "waitlists_insert" ON public.waitlists FOR INSERT
  WITH CHECK (
    (
      auth.uid() = tutor_id OR
      student_id IN (SELECT id FROM public.students WHERE linked_user_id = auth.uid())
    )
    AND NOT public.write_blocked_by_org_suspension()
  );

CREATE POLICY "waitlists_update" ON public.waitlists FOR UPDATE
  USING (
    (
      auth.uid() = tutor_id OR
      student_id IN (SELECT id FROM public.students WHERE linked_user_id = auth.uid())
    )
    AND NOT public.write_blocked_by_org_suspension()
  )
  WITH CHECK (
    (
      auth.uid() = tutor_id OR
      student_id IN (SELECT id FROM public.students WHERE linked_user_id = auth.uid())
    )
    AND NOT public.write_blocked_by_org_suspension()
  );

CREATE POLICY "waitlists_delete" ON public.waitlists FOR DELETE
  USING (
    (
      auth.uid() = tutor_id OR
      student_id IN (SELECT id FROM public.students WHERE linked_user_id = auth.uid())
    )
    AND NOT public.write_blocked_by_org_suspension()
  );

-- ─── 9. availability RLS ───────────────────────────────────────────────────────
DROP POLICY IF EXISTS "availability_manage" ON public.availability;
DROP POLICY IF EXISTS "availability_public" ON public.availability;
DROP POLICY IF EXISTS "availability_select_tutor" ON public.availability;
DROP POLICY IF EXISTS "availability_mutate_tutor" ON public.availability;
DROP POLICY IF EXISTS "availability_update_tutor" ON public.availability;
DROP POLICY IF EXISTS "availability_delete_tutor" ON public.availability;

CREATE POLICY "availability_select_tutor" ON public.availability FOR SELECT
  USING (auth.uid() = tutor_id);

CREATE POLICY "availability_mutate_tutor" ON public.availability FOR INSERT
  WITH CHECK (auth.uid() = tutor_id AND NOT public.write_blocked_by_org_suspension());

CREATE POLICY "availability_update_tutor" ON public.availability FOR UPDATE
  USING (auth.uid() = tutor_id AND NOT public.write_blocked_by_org_suspension())
  WITH CHECK (auth.uid() = tutor_id AND NOT public.write_blocked_by_org_suspension());

CREATE POLICY "availability_delete_tutor" ON public.availability FOR DELETE
  USING (auth.uid() = tutor_id AND NOT public.write_blocked_by_org_suspension());

CREATE POLICY "availability_public" ON public.availability FOR SELECT
  USING (true);

-- ─── 10. subjects RLS ────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "subjects_select" ON public.subjects;
DROP POLICY IF EXISTS "subjects_insert" ON public.subjects;
DROP POLICY IF EXISTS "subjects_update" ON public.subjects;
DROP POLICY IF EXISTS "subjects_delete" ON public.subjects;
DROP POLICY IF EXISTS "subjects_public_read" ON public.subjects;
DROP POLICY IF EXISTS "Tutor subject insert" ON public.subjects;
DROP POLICY IF EXISTS "Tutor subjects CRUD" ON public.subjects;
DROP POLICY IF EXISTS "Org admins see org subjects" ON public.subjects;
DROP POLICY IF EXISTS "subjects_tutor_select" ON public.subjects;
DROP POLICY IF EXISTS "subjects_tutor_insert" ON public.subjects;
DROP POLICY IF EXISTS "subjects_tutor_update" ON public.subjects;
DROP POLICY IF EXISTS "subjects_tutor_delete" ON public.subjects;

CREATE POLICY "subjects_public_read" ON public.subjects FOR SELECT
  USING (true);

CREATE POLICY "subjects_tutor_select" ON public.subjects FOR SELECT
  USING (auth.uid() = tutor_id);

CREATE POLICY "subjects_tutor_insert" ON public.subjects FOR INSERT
  WITH CHECK (auth.uid() = tutor_id AND NOT public.write_blocked_by_org_suspension());

CREATE POLICY "subjects_tutor_update" ON public.subjects FOR UPDATE
  USING (auth.uid() = tutor_id AND NOT public.write_blocked_by_org_suspension())
  WITH CHECK (auth.uid() = tutor_id AND NOT public.write_blocked_by_org_suspension());

CREATE POLICY "subjects_tutor_delete" ON public.subjects FOR DELETE
  USING (auth.uid() = tutor_id AND NOT public.write_blocked_by_org_suspension());

CREATE POLICY "Org admins see org subjects" ON public.subjects FOR SELECT
  USING (
    tutor_id IN (
      SELECT id FROM public.profiles
      WHERE organization_id IN (
        SELECT organization_id FROM public.organization_admins WHERE user_id = auth.uid()
      )
    )
  );

-- ─── 11. organizations (org admin update) ─────────────────────────────────────
DROP POLICY IF EXISTS "Org admin can update own org" ON public.organizations;

CREATE POLICY "Org admin can update own org" ON public.organizations FOR UPDATE
  USING (
    id IN (
      SELECT organization_id FROM public.organization_admins WHERE user_id = auth.uid()
    )
    AND NOT public.write_blocked_by_org_suspension()
  )
  WITH CHECK (
    id IN (
      SELECT organization_id FROM public.organization_admins WHERE user_id = auth.uid()
    )
    AND NOT public.write_blocked_by_org_suspension()
  );

-- ─── 12. tutor_invites (org admin may read when suspended; writes blocked) ─────
DROP POLICY IF EXISTS "Org admin manages invites" ON public.tutor_invites;
DROP POLICY IF EXISTS "Org admin reads invites" ON public.tutor_invites;
DROP POLICY IF EXISTS "Org admin inserts invites" ON public.tutor_invites;
DROP POLICY IF EXISTS "Org admin updates invites" ON public.tutor_invites;
DROP POLICY IF EXISTS "Org admin deletes invites" ON public.tutor_invites;

CREATE POLICY "Org admin reads invites" ON public.tutor_invites FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM public.organization_admins WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Org admin inserts invites" ON public.tutor_invites FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM public.organization_admins WHERE user_id = auth.uid()
    )
    AND NOT public.write_blocked_by_org_suspension()
  );

CREATE POLICY "Org admin updates invites" ON public.tutor_invites FOR UPDATE
  USING (
    organization_id IN (
      SELECT organization_id FROM public.organization_admins WHERE user_id = auth.uid()
    )
    AND NOT public.write_blocked_by_org_suspension()
  )
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM public.organization_admins WHERE user_id = auth.uid()
    )
    AND NOT public.write_blocked_by_org_suspension()
  );

CREATE POLICY "Org admin deletes invites" ON public.tutor_invites FOR DELETE
  USING (
    organization_id IN (
      SELECT organization_id FROM public.organization_admins WHERE user_id = auth.uid()
    )
    AND NOT public.write_blocked_by_org_suspension()
  );

DROP POLICY IF EXISTS "Tutor can mark own invite used" ON public.tutor_invites;

CREATE POLICY "Tutor can mark own invite used" ON public.tutor_invites FOR UPDATE
  USING (
    NOT used
    AND NOT public.write_blocked_by_org_suspension()
  )
  WITH CHECK (
    used = true
    AND used_by_profile_id = auth.uid()
    AND NOT public.write_blocked_by_org_suspension()
  );

-- ─── 13. recurring_individual_sessions ────────────────────────────────────────
DROP POLICY IF EXISTS "Tutor manages own recurring sessions" ON public.recurring_individual_sessions;
DROP POLICY IF EXISTS "Org admin sees org tutors recurring sessions" ON public.recurring_individual_sessions;
DROP POLICY IF EXISTS "Tutor recurring insert" ON public.recurring_individual_sessions;
DROP POLICY IF EXISTS "Tutor recurring update" ON public.recurring_individual_sessions;
DROP POLICY IF EXISTS "Tutor recurring delete" ON public.recurring_individual_sessions;

CREATE POLICY "Tutor manages own recurring sessions" ON public.recurring_individual_sessions FOR SELECT
  USING (tutor_id = auth.uid());

CREATE POLICY "Tutor recurring insert" ON public.recurring_individual_sessions FOR INSERT
  WITH CHECK (tutor_id = auth.uid() AND NOT public.write_blocked_by_org_suspension());

CREATE POLICY "Tutor recurring update" ON public.recurring_individual_sessions FOR UPDATE
  USING (tutor_id = auth.uid() AND NOT public.write_blocked_by_org_suspension())
  WITH CHECK (tutor_id = auth.uid() AND NOT public.write_blocked_by_org_suspension());

CREATE POLICY "Tutor recurring delete" ON public.recurring_individual_sessions FOR DELETE
  USING (tutor_id = auth.uid() AND NOT public.write_blocked_by_org_suspension());

CREATE POLICY "Org admin sees org tutors recurring sessions" ON public.recurring_individual_sessions FOR SELECT
  USING (
    tutor_id IN (
      SELECT id FROM public.profiles
      WHERE organization_id IN (
        SELECT organization_id FROM public.organization_admins WHERE user_id = auth.uid()
      )
    )
  );

-- ─── 14. student_individual_pricing ───────────────────────────────────────────
DROP POLICY IF EXISTS "Tutors can insert own student pricing" ON public.student_individual_pricing;
DROP POLICY IF EXISTS "Tutors can update own student pricing" ON public.student_individual_pricing;
DROP POLICY IF EXISTS "Tutors can delete own student pricing" ON public.student_individual_pricing;

CREATE POLICY "Tutors can insert own student pricing" ON public.student_individual_pricing FOR INSERT
  WITH CHECK (tutor_id = auth.uid() AND NOT public.write_blocked_by_org_suspension());

CREATE POLICY "Tutors can update own student pricing" ON public.student_individual_pricing FOR UPDATE
  USING (tutor_id = auth.uid() AND NOT public.write_blocked_by_org_suspension())
  WITH CHECK (tutor_id = auth.uid() AND NOT public.write_blocked_by_org_suspension());

CREATE POLICY "Tutors can delete own student pricing" ON public.student_individual_pricing FOR DELETE
  USING (tutor_id = auth.uid() AND NOT public.write_blocked_by_org_suspension());

-- ─── 15. lesson_packages & billing ────────────────────────────────────────────
DROP POLICY IF EXISTS "lesson_packages_tutor_all" ON public.lesson_packages;
DROP POLICY IF EXISTS "lesson_packages_student_select" ON public.lesson_packages;
DROP POLICY IF EXISTS "lesson_packages_org_admin_all" ON public.lesson_packages;
DROP POLICY IF EXISTS "lesson_packages_tutor_select" ON public.lesson_packages;
DROP POLICY IF EXISTS "lesson_packages_tutor_insert" ON public.lesson_packages;
DROP POLICY IF EXISTS "lesson_packages_tutor_update" ON public.lesson_packages;
DROP POLICY IF EXISTS "lesson_packages_tutor_delete" ON public.lesson_packages;
DROP POLICY IF EXISTS "lesson_packages_org_admin_select" ON public.lesson_packages;
DROP POLICY IF EXISTS "lesson_packages_org_admin_insert" ON public.lesson_packages;
DROP POLICY IF EXISTS "lesson_packages_org_admin_update" ON public.lesson_packages;
DROP POLICY IF EXISTS "lesson_packages_org_admin_delete" ON public.lesson_packages;

CREATE POLICY "lesson_packages_tutor_select" ON public.lesson_packages FOR SELECT
  USING (auth.uid() = tutor_id);

CREATE POLICY "lesson_packages_student_select" ON public.lesson_packages FOR SELECT
  USING (
    student_id IN (SELECT id FROM public.students WHERE linked_user_id = auth.uid())
  );

CREATE POLICY "lesson_packages_tutor_insert" ON public.lesson_packages FOR INSERT
  WITH CHECK (auth.uid() = tutor_id AND NOT public.write_blocked_by_org_suspension());

CREATE POLICY "lesson_packages_tutor_update" ON public.lesson_packages FOR UPDATE
  USING (auth.uid() = tutor_id AND NOT public.write_blocked_by_org_suspension())
  WITH CHECK (auth.uid() = tutor_id AND NOT public.write_blocked_by_org_suspension());

CREATE POLICY "lesson_packages_tutor_delete" ON public.lesson_packages FOR DELETE
  USING (auth.uid() = tutor_id AND NOT public.write_blocked_by_org_suspension());

CREATE POLICY "lesson_packages_org_admin_select" ON public.lesson_packages FOR SELECT
  USING (
    tutor_id IN (
      SELECT p.id FROM public.profiles p
      INNER JOIN public.organization_admins oa ON oa.organization_id = p.organization_id
      WHERE oa.user_id = auth.uid()
    )
  );

CREATE POLICY "lesson_packages_org_admin_insert" ON public.lesson_packages FOR INSERT
  WITH CHECK (
    tutor_id IN (
      SELECT p.id FROM public.profiles p
      INNER JOIN public.organization_admins oa ON oa.organization_id = p.organization_id
      WHERE oa.user_id = auth.uid()
    )
    AND NOT public.write_blocked_by_org_suspension()
  );

CREATE POLICY "lesson_packages_org_admin_update" ON public.lesson_packages FOR UPDATE
  USING (
    tutor_id IN (
      SELECT p.id FROM public.profiles p
      INNER JOIN public.organization_admins oa ON oa.organization_id = p.organization_id
      WHERE oa.user_id = auth.uid()
    )
    AND NOT public.write_blocked_by_org_suspension()
  )
  WITH CHECK (
    tutor_id IN (
      SELECT p.id FROM public.profiles p
      INNER JOIN public.organization_admins oa ON oa.organization_id = p.organization_id
      WHERE oa.user_id = auth.uid()
    )
    AND NOT public.write_blocked_by_org_suspension()
  );

CREATE POLICY "lesson_packages_org_admin_delete" ON public.lesson_packages FOR DELETE
  USING (
    tutor_id IN (
      SELECT p.id FROM public.profiles p
      INNER JOIN public.organization_admins oa ON oa.organization_id = p.organization_id
      WHERE oa.user_id = auth.uid()
    )
    AND NOT public.write_blocked_by_org_suspension()
  );

DROP POLICY IF EXISTS "billing_batches_tutor_all" ON public.billing_batches;
DROP POLICY IF EXISTS "billing_batches_org_admin_all" ON public.billing_batches;
DROP POLICY IF EXISTS "billing_batches_tutor_select" ON public.billing_batches;
DROP POLICY IF EXISTS "billing_batches_tutor_insert" ON public.billing_batches;
DROP POLICY IF EXISTS "billing_batches_tutor_update" ON public.billing_batches;
DROP POLICY IF EXISTS "billing_batches_tutor_delete" ON public.billing_batches;
DROP POLICY IF EXISTS "billing_batches_org_admin_select" ON public.billing_batches;
DROP POLICY IF EXISTS "billing_batches_org_admin_insert" ON public.billing_batches;
DROP POLICY IF EXISTS "billing_batches_org_admin_update" ON public.billing_batches;
DROP POLICY IF EXISTS "billing_batches_org_admin_delete" ON public.billing_batches;

CREATE POLICY "billing_batches_tutor_select" ON public.billing_batches FOR SELECT
  USING (auth.uid() = tutor_id);

CREATE POLICY "billing_batches_tutor_insert" ON public.billing_batches FOR INSERT
  WITH CHECK (auth.uid() = tutor_id AND NOT public.write_blocked_by_org_suspension());

CREATE POLICY "billing_batches_tutor_update" ON public.billing_batches FOR UPDATE
  USING (auth.uid() = tutor_id AND NOT public.write_blocked_by_org_suspension())
  WITH CHECK (auth.uid() = tutor_id AND NOT public.write_blocked_by_org_suspension());

CREATE POLICY "billing_batches_tutor_delete" ON public.billing_batches FOR DELETE
  USING (auth.uid() = tutor_id AND NOT public.write_blocked_by_org_suspension());

CREATE POLICY "billing_batches_org_admin_select" ON public.billing_batches FOR SELECT
  USING (
    tutor_id IN (
      SELECT p.id FROM public.profiles p
      INNER JOIN public.organization_admins oa ON oa.organization_id = p.organization_id
      WHERE oa.user_id = auth.uid()
    )
  );

CREATE POLICY "billing_batches_org_admin_insert" ON public.billing_batches FOR INSERT
  WITH CHECK (
    tutor_id IN (
      SELECT p.id FROM public.profiles p
      INNER JOIN public.organization_admins oa ON oa.organization_id = p.organization_id
      WHERE oa.user_id = auth.uid()
    )
    AND NOT public.write_blocked_by_org_suspension()
  );

CREATE POLICY "billing_batches_org_admin_update" ON public.billing_batches FOR UPDATE
  USING (
    tutor_id IN (
      SELECT p.id FROM public.profiles p
      INNER JOIN public.organization_admins oa ON oa.organization_id = p.organization_id
      WHERE oa.user_id = auth.uid()
    )
    AND NOT public.write_blocked_by_org_suspension()
  )
  WITH CHECK (
    tutor_id IN (
      SELECT p.id FROM public.profiles p
      INNER JOIN public.organization_admins oa ON oa.organization_id = p.organization_id
      WHERE oa.user_id = auth.uid()
    )
    AND NOT public.write_blocked_by_org_suspension()
  );

CREATE POLICY "billing_batches_org_admin_delete" ON public.billing_batches FOR DELETE
  USING (
    tutor_id IN (
      SELECT p.id FROM public.profiles p
      INNER JOIN public.organization_admins oa ON oa.organization_id = p.organization_id
      WHERE oa.user_id = auth.uid()
    )
    AND NOT public.write_blocked_by_org_suspension()
  );

DROP POLICY IF EXISTS "billing_batch_sessions_via_batch" ON public.billing_batch_sessions;
DROP POLICY IF EXISTS "billing_batch_sessions_org_admin" ON public.billing_batch_sessions;
DROP POLICY IF EXISTS "billing_batch_sessions_via_batch_select" ON public.billing_batch_sessions;
DROP POLICY IF EXISTS "billing_batch_sessions_tutor_mutate" ON public.billing_batch_sessions;
DROP POLICY IF EXISTS "billing_batch_sessions_tutor_update" ON public.billing_batch_sessions;
DROP POLICY IF EXISTS "billing_batch_sessions_tutor_delete" ON public.billing_batch_sessions;
DROP POLICY IF EXISTS "billing_batch_sessions_org_admin_select" ON public.billing_batch_sessions;
DROP POLICY IF EXISTS "billing_batch_sessions_org_admin_insert" ON public.billing_batch_sessions;
DROP POLICY IF EXISTS "billing_batch_sessions_org_admin_update" ON public.billing_batch_sessions;
DROP POLICY IF EXISTS "billing_batch_sessions_org_admin_delete" ON public.billing_batch_sessions;

CREATE POLICY "billing_batch_sessions_via_batch_select" ON public.billing_batch_sessions FOR SELECT
  USING (
    billing_batch_id IN (
      SELECT id FROM public.billing_batches
      WHERE auth.uid() = tutor_id
    )
  );

CREATE POLICY "billing_batch_sessions_tutor_mutate" ON public.billing_batch_sessions FOR INSERT
  WITH CHECK (
    billing_batch_id IN (SELECT id FROM public.billing_batches WHERE auth.uid() = tutor_id)
    AND NOT public.write_blocked_by_org_suspension()
  );

CREATE POLICY "billing_batch_sessions_tutor_update" ON public.billing_batch_sessions FOR UPDATE
  USING (
    billing_batch_id IN (SELECT id FROM public.billing_batches WHERE auth.uid() = tutor_id)
    AND NOT public.write_blocked_by_org_suspension()
  )
  WITH CHECK (
    billing_batch_id IN (SELECT id FROM public.billing_batches WHERE auth.uid() = tutor_id)
    AND NOT public.write_blocked_by_org_suspension()
  );

CREATE POLICY "billing_batch_sessions_tutor_delete" ON public.billing_batch_sessions FOR DELETE
  USING (
    billing_batch_id IN (SELECT id FROM public.billing_batches WHERE auth.uid() = tutor_id)
    AND NOT public.write_blocked_by_org_suspension()
  );

CREATE POLICY "billing_batch_sessions_org_admin_select" ON public.billing_batch_sessions FOR SELECT
  USING (
    billing_batch_id IN (
      SELECT bb.id FROM public.billing_batches bb
      INNER JOIN public.profiles p ON p.id = bb.tutor_id
      INNER JOIN public.organization_admins oa ON oa.organization_id = p.organization_id
      WHERE oa.user_id = auth.uid()
    )
  );

CREATE POLICY "billing_batch_sessions_org_admin_insert" ON public.billing_batch_sessions FOR INSERT
  WITH CHECK (
    billing_batch_id IN (
      SELECT bb.id FROM public.billing_batches bb
      INNER JOIN public.profiles p ON p.id = bb.tutor_id
      INNER JOIN public.organization_admins oa ON oa.organization_id = p.organization_id
      WHERE oa.user_id = auth.uid()
    )
    AND NOT public.write_blocked_by_org_suspension()
  );

CREATE POLICY "billing_batch_sessions_org_admin_update" ON public.billing_batch_sessions FOR UPDATE
  USING (
    billing_batch_id IN (
      SELECT bb.id FROM public.billing_batches bb
      INNER JOIN public.profiles p ON p.id = bb.tutor_id
      INNER JOIN public.organization_admins oa ON oa.organization_id = p.organization_id
      WHERE oa.user_id = auth.uid()
    )
    AND NOT public.write_blocked_by_org_suspension()
  )
  WITH CHECK (
    billing_batch_id IN (
      SELECT bb.id FROM public.billing_batches bb
      INNER JOIN public.profiles p ON p.id = bb.tutor_id
      INNER JOIN public.organization_admins oa ON oa.organization_id = p.organization_id
      WHERE oa.user_id = auth.uid()
    )
    AND NOT public.write_blocked_by_org_suspension()
  );

CREATE POLICY "billing_batch_sessions_org_admin_delete" ON public.billing_batch_sessions FOR DELETE
  USING (
    billing_batch_id IN (
      SELECT bb.id FROM public.billing_batches bb
      INNER JOIN public.profiles p ON p.id = bb.tutor_id
      INNER JOIN public.organization_admins oa ON oa.organization_id = p.organization_id
      WHERE oa.user_id = auth.uid()
    )
    AND NOT public.write_blocked_by_org_suspension()
  );

-- ─── 16. storage session-files ───────────────────────────────────
DROP POLICY IF EXISTS "Tutor manages session files" ON storage.objects;
DROP POLICY IF EXISTS "Tutor manages session files insert" ON storage.objects;
DROP POLICY IF EXISTS "Tutor manages session files update" ON storage.objects;
DROP POLICY IF EXISTS "Tutor manages session files delete" ON storage.objects;

CREATE POLICY "Tutor manages session files" ON storage.objects FOR SELECT
  USING (
    bucket_id = 'session-files'
    AND EXISTS (
      SELECT 1 FROM public.sessions s
      WHERE s.id::text = split_part(name, '/', 1)
        AND s.tutor_id = auth.uid()
    )
  );

CREATE POLICY "Tutor manages session files insert" ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'session-files'
    AND EXISTS (
      SELECT 1 FROM public.sessions s
      WHERE s.id::text = split_part(name, '/', 1)
        AND s.tutor_id = auth.uid()
    )
    AND NOT public.write_blocked_by_org_suspension()
  );

CREATE POLICY "Tutor manages session files update" ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'session-files'
    AND EXISTS (
      SELECT 1 FROM public.sessions s
      WHERE s.id::text = split_part(name, '/', 1)
        AND s.tutor_id = auth.uid()
    )
    AND NOT public.write_blocked_by_org_suspension()
  )
  WITH CHECK (
    bucket_id = 'session-files'
    AND EXISTS (
      SELECT 1 FROM public.sessions s
      WHERE s.id::text = split_part(name, '/', 1)
        AND s.tutor_id = auth.uid()
    )
    AND NOT public.write_blocked_by_org_suspension()
  );

CREATE POLICY "Tutor manages session files delete" ON storage.objects FOR DELETE
  USING (
    bucket_id = 'session-files'
    AND EXISTS (
      SELECT 1 FROM public.sessions s
      WHERE s.id::text = split_part(name, '/', 1)
        AND s.tutor_id = auth.uid()
    )
    AND NOT public.write_blocked_by_org_suspension()
  );
