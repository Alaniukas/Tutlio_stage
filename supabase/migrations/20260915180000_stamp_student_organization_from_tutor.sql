-- Org tutors historically inserted students with tutor_id only. Admin lists
-- still show those rows, but pooled monthly packages lookup by organization_id
-- and return "Student not found". Copy the tutor's org onto live rows and keep
-- doing so for new pairings without overwriting an explicit organization_id.

CREATE OR REPLACE FUNCTION public.stamp_student_organization_from_tutor()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.organization_id IS NULL AND NEW.tutor_id IS NOT NULL THEN
    SELECT organization_id INTO NEW.organization_id
    FROM public.profiles
    WHERE id = NEW.tutor_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS stamp_student_organization_from_tutor ON public.students;
CREATE TRIGGER stamp_student_organization_from_tutor
BEFORE INSERT OR UPDATE OF tutor_id, organization_id ON public.students
FOR EACH ROW
WHEN (NEW.organization_id IS NULL AND NEW.tutor_id IS NOT NULL)
EXECUTE FUNCTION public.stamp_student_organization_from_tutor();

UPDATE public.students AS student
SET organization_id = tutor.organization_id
FROM public.profiles AS tutor
WHERE student.tutor_id = tutor.id
  AND student.organization_id IS NULL
  AND tutor.organization_id IS NOT NULL
  AND student.detached_at IS NULL;
