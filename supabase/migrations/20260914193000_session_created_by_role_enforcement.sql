-- Track and enforce who created a session (tutor vs student/parent self-booking vs org admin vs system).

COMMENT ON COLUMN public.sessions.created_by_role IS
  'Who created the session: tutor, org_admin, student (self-book), parent (self-book), or system (cron/materialize).';

CREATE OR REPLACE FUNCTION public.enforce_session_created_by_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
BEGIN
  -- Service role / cron: keep explicit value; default to system when unset.
  IF uid IS NULL THEN
    IF NEW.created_by_role IS NULL OR btrim(NEW.created_by_role) = '' THEN
      NEW.created_by_role := 'system';
    END IF;
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.students s
    WHERE s.id = NEW.student_id AND s.linked_user_id = uid
  ) THEN
    NEW.created_by_role := 'student';
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.parent_profiles pp
    JOIN public.parent_students ps ON ps.parent_id = pp.id
    WHERE pp.user_id = uid AND ps.student_id = NEW.student_id
  ) THEN
    NEW.created_by_role := 'parent';
    RETURN NEW;
  END IF;

  IF uid = NEW.tutor_id THEN
    NEW.created_by_role := 'tutor';
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.students s
    JOIN public.organization_admins oa ON oa.organization_id = s.organization_id
    WHERE s.id = NEW.student_id AND oa.user_id = uid
  ) THEN
    NEW.created_by_role := 'org_admin';
    RETURN NEW;
  END IF;

  IF NEW.created_by_role IS NULL OR btrim(NEW.created_by_role) = '' THEN
    NEW.created_by_role := 'tutor';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sessions_enforce_created_by_role ON public.sessions;
CREATE TRIGGER trg_sessions_enforce_created_by_role
  BEFORE INSERT ON public.sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_session_created_by_role();
