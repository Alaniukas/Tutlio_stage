-- Fix get_or_create_conversation: org_admin <-> parent should work whenever the
-- parent's child belongs to the admin's organization, even if the student is
-- not yet assigned to a tutor in that organization (or has no tutor at all).
--
-- Previous version required `JOIN profiles tutor_p ON tutor_p.id = s.tutor_id`,
-- which silently rejected admin <-> parent conversations for students without
-- a tutor in the same org. The fix uses students.organization_id directly.

CREATE OR REPLACE FUNCTION public.get_or_create_conversation(p_other_user_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_my_id uuid := auth.uid();
  v_conv_id uuid;
  v_valid boolean := false;
BEGIN
  IF v_my_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF v_my_id = p_other_user_id THEN
    RAISE EXCEPTION 'Cannot create conversation with yourself';
  END IF;

  SELECT cp1.conversation_id INTO v_conv_id
  FROM chat_participants cp1
  JOIN chat_participants cp2 ON cp2.conversation_id = cp1.conversation_id
  WHERE cp1.user_id = v_my_id AND cp2.user_id = p_other_user_id
  LIMIT 1;

  IF v_conv_id IS NOT NULL THEN
    RETURN v_conv_id;
  END IF;

  -- tutor -> student
  IF EXISTS (
    SELECT 1 FROM students
    WHERE tutor_id = v_my_id AND linked_user_id = p_other_user_id
  ) THEN
    v_valid := true;
  END IF;

  -- student -> tutor
  IF NOT v_valid AND EXISTS (
    SELECT 1 FROM students
    WHERE linked_user_id = v_my_id AND tutor_id = p_other_user_id
  ) THEN
    v_valid := true;
  END IF;

  -- org_admin -> org tutor
  IF NOT v_valid AND EXISTS (
    SELECT 1 FROM organization_admins oa
    JOIN profiles p ON p.organization_id = oa.organization_id
    WHERE oa.user_id = v_my_id AND p.id = p_other_user_id
  ) THEN
    v_valid := true;
  END IF;

  -- org tutor -> org_admin
  IF NOT v_valid AND EXISTS (
    SELECT 1 FROM profiles p
    JOIN organization_admins oa ON oa.organization_id = p.organization_id
    WHERE p.id = v_my_id AND oa.user_id = p_other_user_id
  ) THEN
    v_valid := true;
  END IF;

  -- org_admin -> student in org (via student.organization_id, not tutor's org)
  IF NOT v_valid AND EXISTS (
    SELECT 1 FROM organization_admins oa
    JOIN students s ON s.organization_id = oa.organization_id
    WHERE oa.user_id = v_my_id AND s.linked_user_id = p_other_user_id
  ) THEN
    v_valid := true;
  END IF;

  -- student in org -> org_admin
  IF NOT v_valid AND EXISTS (
    SELECT 1 FROM students s
    JOIN organization_admins oa ON oa.organization_id = s.organization_id
    WHERE s.linked_user_id = v_my_id AND oa.user_id = p_other_user_id
  ) THEN
    v_valid := true;
  END IF;

  -- parent -> child's tutor
  IF NOT v_valid AND EXISTS (
    SELECT 1
    FROM parent_profiles pp
    JOIN parent_students ps ON ps.parent_id = pp.id
    JOIN students s ON s.id = ps.student_id
    WHERE pp.user_id = v_my_id
      AND s.tutor_id = p_other_user_id
  ) THEN
    v_valid := true;
  END IF;

  -- tutor -> parent
  IF NOT v_valid AND EXISTS (
    SELECT 1
    FROM parent_profiles pp
    JOIN parent_students ps ON ps.parent_id = pp.id
    JOIN students s ON s.id = ps.student_id
    WHERE pp.user_id = p_other_user_id
      AND s.tutor_id = v_my_id
  ) THEN
    v_valid := true;
  END IF;

  -- parent -> org_admin (via student's organization)
  IF NOT v_valid AND EXISTS (
    SELECT 1
    FROM parent_profiles pp
    JOIN parent_students ps ON ps.parent_id = pp.id
    JOIN students s ON s.id = ps.student_id
    JOIN organization_admins oa ON oa.organization_id = s.organization_id
    WHERE pp.user_id = v_my_id
      AND oa.user_id = p_other_user_id
  ) THEN
    v_valid := true;
  END IF;

  -- org_admin -> parent (via student's organization, no tutor join required)
  IF NOT v_valid AND EXISTS (
    SELECT 1
    FROM parent_profiles pp
    JOIN parent_students ps ON ps.parent_id = pp.id
    JOIN students s ON s.id = ps.student_id
    JOIN organization_admins oa ON oa.organization_id = s.organization_id
    WHERE pp.user_id = p_other_user_id
      AND oa.user_id = v_my_id
  ) THEN
    v_valid := true;
  END IF;

  -- parent -> their own child (via parent_students -> students.linked_user_id)
  IF NOT v_valid AND EXISTS (
    SELECT 1
    FROM parent_profiles pp
    JOIN parent_students ps ON ps.parent_id = pp.id
    JOIN students s ON s.id = ps.student_id
    WHERE pp.user_id = v_my_id
      AND s.linked_user_id = p_other_user_id
  ) THEN
    v_valid := true;
  END IF;

  -- child (linked student user) -> their parent
  IF NOT v_valid AND EXISTS (
    SELECT 1
    FROM parent_profiles pp
    JOIN parent_students ps ON ps.parent_id = pp.id
    JOIN students s ON s.id = ps.student_id
    WHERE pp.user_id = p_other_user_id
      AND s.linked_user_id = v_my_id
  ) THEN
    v_valid := true;
  END IF;

  IF NOT v_valid THEN
    RAISE EXCEPTION 'No valid relationship exists between these users';
  END IF;

  INSERT INTO chat_conversations DEFAULT VALUES
  RETURNING id INTO v_conv_id;

  INSERT INTO chat_participants (conversation_id, user_id)
  VALUES (v_conv_id, v_my_id), (v_conv_id, p_other_user_id);

  RETURN v_conv_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_or_create_conversation(uuid) TO authenticated;
