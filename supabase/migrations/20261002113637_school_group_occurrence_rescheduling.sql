-- A manually moved occurrence is part of the schedule, even after its original
-- date leaves the rolling materialization window. One record covers the roster.
CREATE TABLE public.school_class_group_occurrence_overrides (
  group_id uuid NOT NULL REFERENCES public.school_class_groups(id) ON DELETE CASCADE,
  original_start_time timestamptz NOT NULL,
  start_time timestamptz NOT NULL,
  end_time timestamptz NOT NULL CHECK (end_time > start_time),
  meeting_link text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (group_id, original_start_time)
);
CREATE INDEX school_group_override_current_time ON public.school_class_group_occurrence_overrides(group_id,start_time);
ALTER TABLE public.school_class_group_occurrence_overrides ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.school_class_group_occurrence_overrides FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.school_class_group_occurrence_overrides TO service_role;

-- Both teacher and administrator calendars update sessions directly. Capture
-- the exception in that same transaction, rather than in a second UI request.
-- Service-role schedule reconciliation has no auth.uid() and cannot create one.
CREATE FUNCTION public.school_track_group_occurrence_move() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_org uuid;
  v_original timestamptz;
  v_time_changed boolean := NEW.start_time IS DISTINCT FROM OLD.start_time OR NEW.end_time IS DISTINCT FROM OLD.end_time;
BEGIN
  IF OLD.class_group_id IS NULL OR v_actor IS NULL THEN RETURN NEW; END IF;
  SELECT original_start_time INTO v_original FROM public.school_class_group_occurrence_overrides
    WHERE group_id=OLD.class_group_id AND (start_time=OLD.start_time
      OR (original_start_time=OLD.original_start_time AND start_time=NEW.start_time))
    ORDER BY updated_at DESC LIMIT 1;
  IF NOT v_time_changed AND (v_original IS NULL OR NEW.meeting_link IS NOT DISTINCT FROM OLD.meeting_link) THEN RETURN NEW; END IF;
  SELECT organization_id INTO v_org FROM public.school_class_groups WHERE id=OLD.class_group_id;
  IF v_org IS NULL OR NEW.class_group_id IS DISTINCT FROM OLD.class_group_id OR NOT (
    (coalesce(OLD.tutor_id=v_actor,false) AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id=v_actor AND p.organization_id=v_org))
    OR EXISTS (SELECT 1 FROM public.organization_admins a WHERE a.user_id=v_actor AND a.organization_id=v_org
      AND a.status='active' AND a.accepted_at IS NOT NULL
      AND (a.permissions @> '{"sessions.edit":true}'::jsonb OR private.org_admin_role_grants_permission(a.role,'sessions.edit')))
  ) THEN RAISE EXCEPTION 'school_group_reschedule_forbidden' USING ERRCODE='42501'; END IF;
  IF v_time_changed AND (OLD.status_confirmed_at IS NOT NULL OR NEW.status_confirmed_at IS NOT NULL) THEN
    RAISE EXCEPTION 'school_group_occurrence_already_confirmed' USING ERRCODE='23514';
  END IF;
  IF NEW.end_time <= NEW.start_time THEN RAISE EXCEPTION 'school_group_invalid_session_time' USING ERRCODE='23514'; END IF;
  -- Cancelled children stay cancelled; other siblings still establish the move.
  IF OLD.status='cancelled' THEN RETURN NEW; END IF;
  v_original := coalesce(v_original,OLD.start_time);
  IF v_time_changed THEN
    NEW.original_start_time := v_original;
    NEW.rescheduled_at := now();
    NEW.reminder_student_sent := false;
    NEW.reminder_payer_sent := false;
    NEW.reminder_tutor_sent := false;
    NEW.student_joined_at := NULL;
    NEW.tutor_joined_at := NULL;
    NEW.status_reminder_last_sent_at := NULL;
    -- An automatic, unconfirmed no-show/completion is not an attendance decision.
    NEW.status := 'active';
    NEW.no_show_reason := NULL;
    NEW.no_show_when := NULL;
  END IF;
  INSERT INTO public.school_class_group_occurrence_overrides(group_id,original_start_time,start_time,end_time,meeting_link)
    VALUES(OLD.class_group_id,v_original,NEW.start_time,NEW.end_time,NEW.meeting_link)
    ON CONFLICT(group_id,original_start_time) DO UPDATE SET
      start_time=excluded.start_time,end_time=excluded.end_time,meeting_link=excluded.meeting_link,updated_at=now();
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.school_track_group_occurrence_move() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER school_group_occurrence_move BEFORE UPDATE OF start_time,end_time,meeting_link ON public.sessions
  FOR EACH ROW EXECUTE FUNCTION public.school_track_group_occurrence_move();

-- A worker that read the old schedule before a simultaneous move must not
-- recreate its original time. The next run reloads the persisted exception.
CREATE FUNCTION public.school_guard_generated_group_occurrence() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF NEW.class_group_id IS NOT NULL AND NEW.created_by_role='system' AND EXISTS (
    SELECT 1 FROM public.school_class_group_occurrence_overrides moved
    WHERE moved.group_id=NEW.class_group_id AND moved.original_start_time=NEW.start_time AND moved.start_time<>NEW.start_time
      AND (NEW.original_start_time IS NULL OR NEW.original_start_time=moved.original_start_time)
  ) THEN RAISE EXCEPTION 'school_group_occurrence_moved' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.school_guard_generated_group_occurrence() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER school_guard_generated_group_occurrence BEFORE INSERT ON public.sessions
  FOR EACH ROW EXECUTE FUNCTION public.school_guard_generated_group_occurrence();
