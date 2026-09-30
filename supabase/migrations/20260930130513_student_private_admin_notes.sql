-- Private administration notes must not live on students: tutor/student/parent
-- clients can select that row, regardless of a frontend visibility checkbox.
BEGIN;

CREATE TABLE public.student_admin_notes (
  student_id uuid PRIMARY KEY REFERENCES public.students(id) ON DELETE CASCADE,
  admin_comment text,
  last_contacted_at date,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.student_admin_notes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.student_admin_notes FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.student_admin_notes TO authenticated;
GRANT ALL ON TABLE public.student_admin_notes TO service_role;

-- Invoker security keeps the existing student/profile RLS in force. Checking
-- an actual active seat is essential: the legacy permission gate deliberately
-- returns true for non-admins to preserve their own portal policies.
CREATE OR REPLACE FUNCTION private.can_access_student_admin_notes(
  p_student_id uuid,
  p_write boolean DEFAULT false
)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT (SELECT auth.uid()) IS NOT NULL
    AND private.org_admin_permission_gate(
      CASE WHEN p_write THEN ARRAY['students.edit']::text[]
           ELSE ARRAY['students.view', 'students.edit']::text[] END
    )
    AND EXISTS (
      SELECT 1
      FROM public.students student
      LEFT JOIN public.profiles tutor ON tutor.id = student.tutor_id
      JOIN public.organization_admins admin
        ON admin.organization_id = COALESCE(student.organization_id, tutor.organization_id)
      WHERE student.id = p_student_id
        AND admin.user_id = (SELECT auth.uid())
        AND admin.status = 'active'
        AND (
          admin.role = 'owner'
          OR admin.permissions @> '{"students.edit":true}'::jsonb
          OR (NOT p_write AND admin.permissions @> '{"students.view":true}'::jsonb)
        )
    );
$$;
REVOKE ALL ON FUNCTION private.can_access_student_admin_notes(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.can_access_student_admin_notes(uuid, boolean) TO authenticated;

CREATE POLICY student_admin_notes_select ON public.student_admin_notes
  FOR SELECT TO authenticated
  USING (private.can_access_student_admin_notes(student_id, false));
CREATE POLICY student_admin_notes_insert ON public.student_admin_notes
  FOR INSERT TO authenticated
  WITH CHECK (private.can_access_student_admin_notes(student_id, true)
    AND NOT public.write_blocked_by_org_suspension());
CREATE POLICY student_admin_notes_update ON public.student_admin_notes
  FOR UPDATE TO authenticated
  USING (private.can_access_student_admin_notes(student_id, true)
    AND NOT public.write_blocked_by_org_suspension())
  WITH CHECK (private.can_access_student_admin_notes(student_id, true)
    AND NOT public.write_blocked_by_org_suspension());
CREATE POLICY student_admin_notes_delete ON public.student_admin_notes
  FOR DELETE TO authenticated
  USING (private.can_access_student_admin_notes(student_id, true)
    AND NOT public.write_blocked_by_org_suspension());

-- Preserve every legacy private comment, including older org students whose
-- organization_id is only represented by their tutor's organization.
INSERT INTO public.student_admin_notes (student_id, admin_comment)
SELECT student.id, student.admin_comment
FROM public.students student
LEFT JOIN public.profiles tutor ON tutor.id = student.tutor_id
WHERE COALESCE(student.organization_id, tutor.organization_id) IS NOT NULL
  AND NOT student.admin_comment_visible_to_tutor
  AND NULLIF(btrim(student.admin_comment, E' \n\r\t'), '') IS NOT NULL;

UPDATE public.students student
SET admin_comment = NULL
WHERE NOT student.admin_comment_visible_to_tutor
  AND EXISTS (SELECT 1 FROM public.student_admin_notes note WHERE note.student_id = student.id);

-- These compatibility columns now represent the separate tutor-visible
-- comment. Reject old clients trying to store a private comment on students.
CREATE OR REPLACE FUNCTION private.guard_student_tutor_comment()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF NULLIF(btrim(NEW.admin_comment, E' \n\r\t'), '') IS NOT NULL
     AND NOT NEW.admin_comment_visible_to_tutor THEN
    RAISE EXCEPTION 'Private administration comments must be stored in student_admin_notes'
      USING ERRCODE = '23514';
  END IF;

  IF (TG_OP = 'INSERT' AND NULLIF(btrim(NEW.admin_comment, E' \n\r\t'), '') IS NOT NULL)
     OR (TG_OP = 'UPDATE' AND (
       NEW.admin_comment IS DISTINCT FROM OLD.admin_comment
       OR NEW.admin_comment_visible_to_tutor IS DISTINCT FROM OLD.admin_comment_visible_to_tutor
     )) THEN
    IF (SELECT auth.uid()) IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.organization_admins admin
      WHERE admin.user_id = (SELECT auth.uid())
        AND admin.status = 'active'
        AND admin.organization_id = COALESCE(NEW.organization_id, (
          SELECT tutor.organization_id FROM public.profiles tutor WHERE tutor.id = NEW.tutor_id
        ))
        AND (admin.role = 'owner' OR admin.permissions @> '{"students.edit":true}'::jsonb)
        AND private.org_admin_permission_gate(ARRAY['students.edit']::text[])
    ) THEN
      RAISE EXCEPTION 'Only organization administrators may change tutor comments'
        USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.guard_student_tutor_comment() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER students_guard_tutor_comment
  BEFORE INSERT OR UPDATE OF admin_comment, admin_comment_visible_to_tutor ON public.students
  FOR EACH ROW EXECUTE FUNCTION private.guard_student_tutor_comment();

-- One transaction updates all tutor pairings of the selected child. Any
-- missing/inaccessible row aborts before either public or private notes change.
CREATE OR REPLACE FUNCTION public.save_student_notes(
  p_student_ids uuid[],
  p_admin_comment text,
  p_last_contacted_at date,
  p_tutor_comment text
)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  v_student_ids uuid[];
  v_locked_count integer;
BEGIN
  IF (SELECT auth.uid()) IS NULL OR p_student_ids IS NULL
     OR cardinality(p_student_ids) = 0 OR cardinality(p_student_ids) > 500
     OR array_position(p_student_ids, NULL) IS NOT NULL THEN
    RAISE EXCEPTION 'A valid student selection is required' USING ERRCODE = '22023';
  END IF;
  SELECT array_agg(DISTINCT student_id ORDER BY student_id) INTO v_student_ids
  FROM unnest(p_student_ids) AS requested(student_id);

  IF public.write_blocked_by_org_suspension() OR EXISTS (
    SELECT 1 FROM unnest(v_student_ids) AS requested(student_id)
    WHERE NOT private.can_access_student_admin_notes(requested.student_id, true)
  ) THEN
    RAISE EXCEPTION 'Insufficient student administration permission' USING ERRCODE = '42501';
  END IF;

  PERFORM student.id FROM public.students student
  WHERE student.id = ANY(v_student_ids)
  ORDER BY student.id FOR UPDATE;
  GET DIAGNOSTICS v_locked_count = ROW_COUNT;
  IF v_locked_count <> cardinality(v_student_ids) THEN
    RAISE EXCEPTION 'Some selected students are unavailable' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.student_admin_notes (student_id, admin_comment, last_contacted_at, updated_at)
  SELECT student_id, NULLIF(btrim(p_admin_comment, E' \n\r\t'), ''), p_last_contacted_at, now()
  FROM unnest(v_student_ids) AS requested(student_id)
  ON CONFLICT (student_id) DO UPDATE SET
    admin_comment = EXCLUDED.admin_comment,
    last_contacted_at = EXCLUDED.last_contacted_at,
    updated_at = EXCLUDED.updated_at;

  UPDATE public.students
  SET admin_comment = NULLIF(btrim(p_tutor_comment, E' \n\r\t'), ''),
      admin_comment_visible_to_tutor = true
  WHERE id = ANY(v_student_ids);
  GET DIAGNOSTICS v_locked_count = ROW_COUNT;
  IF v_locked_count <> cardinality(v_student_ids) THEN
    RAISE EXCEPTION 'Some selected students cannot be updated' USING ERRCODE = '42501';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.save_student_notes(uuid[], text, date, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_student_notes(uuid[], text, date, text) TO authenticated;

COMMENT ON TABLE public.student_admin_notes IS
  'Administration-only student notes and last contact date; never readable by tutor, student or parent roles.';
COMMENT ON COLUMN public.students.admin_comment IS
  'Tutor-visible administration comment. Private notes are in student_admin_notes.';

COMMIT;
