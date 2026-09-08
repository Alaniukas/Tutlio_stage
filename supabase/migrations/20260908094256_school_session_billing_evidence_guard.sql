-- Confirmation is server-authenticated evidence. Browser Join clicks remain
-- supported only for the assigned teacher during the actual join window.
CREATE OR REPLACE FUNCTION public.guard_session_billing_evidence()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF current_user IN ('postgres', 'service_role', 'supabase_admin') THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.status_confirmed_at IS NOT NULL OR NEW.status_confirmed_by IS NOT NULL
       OR NEW.tutor_joined_at IS NOT NULL THEN
      RAISE EXCEPTION 'Session evidence must be recorded through an authorized action' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;
  IF (NEW.status_confirmed_at IS DISTINCT FROM OLD.status_confirmed_at
      OR NEW.status_confirmed_by IS DISTINCT FROM OLD.status_confirmed_by)
     AND (NEW.status_confirmed_at IS NOT NULL OR NEW.status_confirmed_by IS NOT NULL) THEN
    RAISE EXCEPTION 'Session confirmation requires the confirmation API' USING ERRCODE = '42501';
  END IF;
  IF NEW.tutor_joined_at IS DISTINCT FROM OLD.tutor_joined_at THEN
    IF OLD.tutor_joined_at IS NOT NULL OR NEW.tutor_joined_at IS NULL
       OR auth.uid() IS DISTINCT FROM OLD.tutor_id
       OR NEW.tutor_id IS DISTINCT FROM OLD.tutor_id
       OR NEW.start_time IS DISTINCT FROM OLD.start_time
       OR NEW.end_time IS DISTINCT FROM OLD.end_time
       OR NEW.status IS DISTINCT FROM OLD.status
       OR OLD.status = 'cancelled' OR OLD.start_time IS NULL
       OR clock_timestamp() < OLD.start_time - interval '30 minutes'
       OR clock_timestamp() > coalesce(OLD.end_time, OLD.start_time + interval '2 hours') THEN
      RAISE EXCEPTION 'Teacher join evidence requires an assigned teacher inside the join window' USING ERRCODE = '42501';
    END IF;
    NEW.tutor_joined_at := clock_timestamp();
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_session_billing_evidence() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS guard_session_billing_evidence ON public.sessions;
CREATE TRIGGER guard_session_billing_evidence BEFORE INSERT OR UPDATE ON public.sessions
FOR EACH ROW EXECUTE FUNCTION public.guard_session_billing_evidence();
