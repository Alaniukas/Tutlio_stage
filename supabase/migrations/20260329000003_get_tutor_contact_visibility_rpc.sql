-- Allow authenticated students to read org contact visibility for their tutor (for masking tutor email/phone in UI)
CREATE OR REPLACE FUNCTION public.get_tutor_contact_visibility_for_student(p_tutor_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT o.features
      FROM public.profiles p
      INNER JOIN public.organizations o ON o.id = p.organization_id
      WHERE p.id = p_tutor_id
        AND EXISTS (
          SELECT 1
          FROM public.students s
          WHERE s.tutor_id = p_tutor_id
            AND s.linked_user_id = auth.uid()
        )
      LIMIT 1
    ),
    '{}'::jsonb
  );
$$;

REVOKE ALL ON FUNCTION public.get_tutor_contact_visibility_for_student(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_tutor_contact_visibility_for_student(uuid) TO authenticated;
