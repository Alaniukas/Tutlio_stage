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
GRANT EXECUTE ON FUNCTION public.parent_can_access_student(uuid) TO authenticated, service_role;;
