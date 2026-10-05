-- Calendar / org-admin reschedules update sessions.start_time directly, while
-- student_reschedule_session and school group moves already clear reminder
-- flags. Without this, a reminder stamped for the old slot suppresses the new
-- time (see Pro Klasė reschedule via Calendar with stale reminder_*_sent).
CREATE OR REPLACE FUNCTION public.reset_session_reminder_flags_on_reschedule()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.start_time IS DISTINCT FROM OLD.start_time
     OR NEW.end_time IS DISTINCT FROM OLD.end_time THEN
    NEW.reminder_student_sent := false;
    NEW.reminder_payer_sent := false;
    NEW.reminder_tutor_sent := false;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.reset_session_reminder_flags_on_reschedule() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS sessions_reset_reminders_on_reschedule ON public.sessions;
CREATE TRIGGER sessions_reset_reminders_on_reschedule
  BEFORE UPDATE OF start_time, end_time ON public.sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.reset_session_reminder_flags_on_reschedule();
