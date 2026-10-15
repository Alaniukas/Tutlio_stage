-- Tutor assignments are separate students rows for the same child. Keep the
-- existing family relationships when creating, reusing or claiming a pairing.
-- Browser roles cannot write parent_students directly, so expose only this
-- narrow, authorized copy operation instead of broadening the table's RLS.
-- Apply before releasing the frontend pairing/reassignment callers.
CREATE OR REPLACE FUNCTION public.copy_student_parent_links_for_tutor_pairing(
  p_source_student_id uuid,
  p_target_student_id uuid
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  source_student public.students%ROWTYPE;
  target_student public.students%ROWTYPE;
  source_ids uuid[];
  parent_user_ids uuid[];
  child_name text;
BEGIN
  SELECT * INTO source_student FROM public.students WHERE id = p_source_student_id;
  SELECT * INTO target_student FROM public.students WHERE id = p_target_student_id;

  -- Scheduling-only seats can maintain an already proven child account;
  -- copying between other assignments requires student-editing permission.
  IF source_student.id IS NULL OR target_student.id IS NULL
    OR source_student.organization_id IS NULL
    OR target_student.organization_id IS DISTINCT FROM source_student.organization_id
    OR NOT EXISTS (
      SELECT 1 FROM public.organization_admins admin
      WHERE admin.user_id = (SELECT auth.uid())
        AND admin.organization_id = source_student.organization_id
        AND admin.status = 'active' AND admin.accepted_at IS NOT NULL
        AND (admin.role = 'owner' OR COALESCE(admin.permissions->>'students.edit', 'false') = 'true'
          OR (COALESCE(admin.permissions->>'sessions.edit', 'false') = 'true'
            AND (source_student.id = target_student.id OR (source_student.linked_user_id IS NOT NULL
              AND source_student.linked_user_id = target_student.linked_user_id))))
    )
    OR public.write_blocked_by_org_suspension()
  THEN
    RAISE EXCEPTION 'Insufficient organization permission' USING ERRCODE = '42501';
  END IF;

  -- Lock in a stable order; a concurrent tutor assignment must not overwrite
  -- another parent's link between validation and the copy.
  PERFORM id FROM public.students
  WHERE id IN (p_source_student_id, p_target_student_id) ORDER BY id FOR UPDATE;
  SELECT * INTO source_student FROM public.students WHERE id = p_source_student_id;
  SELECT * INTO target_student FROM public.students WHERE id = p_target_student_id;
  IF source_student.id IS NULL OR target_student.id IS NULL
    OR target_student.organization_id IS DISTINCT FROM source_student.organization_id
    OR NOT EXISTS (
      SELECT 1 FROM public.organization_admins admin
      WHERE admin.user_id = (SELECT auth.uid())
        AND admin.organization_id = source_student.organization_id
        AND admin.status = 'active' AND admin.accepted_at IS NOT NULL
        AND (admin.role = 'owner' OR COALESCE(admin.permissions->>'students.edit', 'false') = 'true'
          OR (COALESCE(admin.permissions->>'sessions.edit', 'false') = 'true'
            AND (source_student.id = target_student.id OR (source_student.linked_user_id IS NOT NULL
              AND source_student.linked_user_id = target_student.linked_user_id))))
    )
  THEN
    RAISE EXCEPTION 'Student assignment changed; try again' USING ERRCODE = '42501';
  END IF;

  child_name := lower(regexp_replace(trim(source_student.full_name), '\s+', ' ', 'g'));
  IF COALESCE(child_name, '') = ''
    OR lower(regexp_replace(trim(target_student.full_name), '\s+', ' ', 'g')) IS DISTINCT FROM child_name
    OR source_student.detached_at IS NOT NULL OR target_student.detached_at IS NOT NULL
    OR (source_student.linked_user_id IS NOT NULL AND target_student.linked_user_id IS NOT NULL
      AND source_student.linked_user_id <> target_student.linked_user_id)
    OR (NULLIF(trim(source_student.email), '') IS NOT NULL AND NULLIF(trim(target_student.email), '') IS NOT NULL
      AND lower(trim(source_student.email)) <> lower(trim(target_student.email))
      AND NOT (source_student.linked_user_id IS NOT NULL
        AND source_student.linked_user_id IS NOT DISTINCT FROM target_student.linked_user_id))
  THEN
    RAISE EXCEPTION 'Student assignments do not represent the same child';
  END IF;

  -- The caller explicitly selects the source. Other donors need the same
  -- actual child account, organization AND name. A payer/placeholder email
  -- alone must never discover or combine family relationships.
  SELECT array_agg(student.id) INTO source_ids
  FROM public.students student
  WHERE student.id = source_student.id OR (
    source_student.linked_user_id IS NOT NULL
    AND student.linked_user_id = source_student.linked_user_id
    AND student.organization_id = source_student.organization_id
    AND lower(regexp_replace(trim(student.full_name), '\s+', ' ', 'g')) = child_name
    AND student.detached_at IS NULL
    AND COALESCE(student.enrollment_status, 'active') NOT IN ('left', 'graduated')
  );

  SELECT array_agg(DISTINCT student.parent_user_id) FILTER (WHERE student.parent_user_id IS NOT NULL)
  INTO parent_user_ids
  FROM public.students student
  WHERE student.id = ANY(source_ids) OR student.id = target_student.id;
  IF cardinality(parent_user_ids) > 1 THEN
    RAISE EXCEPTION 'Student assignments have conflicting parent accounts';
  END IF;

  IF parent_user_ids[1] IS NOT NULL AND target_student.parent_user_id IS NULL THEN
    UPDATE public.students SET parent_user_id = parent_user_ids[1] WHERE id = target_student.id;
  END IF;

  INSERT INTO public.parent_students (parent_id, student_id)
  SELECT link.parent_id, target_student.id
  FROM public.parent_students link WHERE link.student_id = ANY(source_ids)
  UNION
  SELECT parent.id, target_student.id FROM public.parent_profiles parent
  WHERE parent.user_id = parent_user_ids[1]
  ON CONFLICT (parent_id, student_id) DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION public.copy_student_parent_links_for_tutor_pairing(uuid, uuid) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.copy_student_parent_links_for_tutor_pairing(uuid, uuid) TO authenticated;
COMMENT ON FUNCTION public.copy_student_parent_links_for_tutor_pairing(uuid, uuid) IS
  'Organization admins preserve existing parent links across the same child tutor assignments. students.edit is required; sessions.edit also permits the same row or same actual child account. No account creation or email delivery.';
