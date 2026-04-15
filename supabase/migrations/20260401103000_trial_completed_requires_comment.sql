-- Enforce tutor comment for completed trial lessons.

CREATE OR REPLACE FUNCTION public.enforce_trial_completed_comment()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_is_trial boolean;
BEGIN
  IF NEW.status <> 'completed' THEN
    RETURN NEW;
  END IF;

  SELECT s.is_trial INTO v_is_trial
  FROM public.subjects s
  WHERE s.id = NEW.subject_id;

  IF COALESCE(v_is_trial, false) = true AND COALESCE(btrim(NEW.tutor_comment), '') = '' THEN
    RAISE EXCEPTION 'Bandomajai pamokai su statusu completed privalomas komentaras.'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sessions_enforce_trial_completed_comment ON public.sessions;
CREATE TRIGGER trg_sessions_enforce_trial_completed_comment
  BEFORE INSERT OR UPDATE ON public.sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_trial_completed_comment();

