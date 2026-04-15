-- Org korepetitoriai (profiles.organization_id IS NOT NULL), kurie nėra organization_admins,
-- nebegali trinti students eilučių. Solo korepetitoriai ir org adminai – gali kaip anksčiau.

DROP POLICY IF EXISTS students_delete ON public.students;

CREATE POLICY students_delete ON public.students
FOR DELETE
USING (
  (auth.uid() = tutor_id)
  AND (NOT public.write_blocked_by_org_suspension())
  AND (
    (SELECT p.organization_id FROM public.profiles p WHERE p.id = auth.uid()) IS NULL
    OR EXISTS (
      SELECT 1 FROM public.organization_admins oa WHERE oa.user_id = auth.uid()
    )
  )
);