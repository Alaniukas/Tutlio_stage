-- Calendar deletion must survive recurring materialization. The service-only
-- transaction also prevents repeated package refunds after cancellation/retries.
CREATE TABLE IF NOT EXISTS public.session_recurrence_exclusions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recurring_session_id uuid REFERENCES public.recurring_individual_sessions(id) ON DELETE CASCADE,
  class_group_id uuid REFERENCES public.school_class_groups(id) ON DELETE CASCADE,
  student_id uuid REFERENCES public.students(id) ON DELETE CASCADE,
  scope text NOT NULL CHECK (scope IN ('single', 'future', 'all')),
  start_time timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT session_recurrence_exclusions_one_series CHECK (num_nonnulls(recurring_session_id, class_group_id) = 1),
  CONSTRAINT session_recurrence_exclusions_start CHECK ((scope = 'all' AND start_time IS NULL) OR (scope <> 'all' AND start_time IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS session_recurrence_exclusions_individual
  ON public.session_recurrence_exclusions (recurring_session_id) WHERE recurring_session_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS session_recurrence_exclusions_group
  ON public.session_recurrence_exclusions (class_group_id) WHERE class_group_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS session_recurrence_exclusions_unique
  ON public.session_recurrence_exclusions (
    COALESCE(recurring_session_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(class_group_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(student_id, '00000000-0000-0000-0000-000000000000'::uuid),
    scope, COALESCE(start_time, '-infinity'::timestamptz)
  );
ALTER TABLE public.session_recurrence_exclusions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.session_recurrence_exclusions FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.session_recurrence_exclusions TO service_role;

-- A cron that loaded its template before deletion must not recreate an excluded
-- occurrence. Manual bookings without recurrence ids remain possible in the slot.
CREATE OR REPLACE FUNCTION public.skip_deleted_recurring_occurrence()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- Serialize with scoped deletion. The check below runs after an in-flight
  -- deletion commits, even when this cron loaded its template earlier.
  IF NEW.recurring_session_id IS NOT NULL THEN
    PERFORM id FROM public.recurring_individual_sessions WHERE id = NEW.recurring_session_id FOR SHARE;
  END IF;
  IF NEW.class_group_id IS NOT NULL THEN
    PERFORM id FROM public.school_class_groups WHERE id = NEW.class_group_id FOR SHARE;
  END IF;
  IF NEW.status = 'active' AND EXISTS (
    SELECT 1 FROM public.session_recurrence_exclusions exclusion
    WHERE ((exclusion.recurring_session_id IS NOT NULL AND exclusion.recurring_session_id = NEW.recurring_session_id)
      OR (exclusion.class_group_id IS NOT NULL AND exclusion.class_group_id = NEW.class_group_id))
      AND (exclusion.student_id IS NULL OR exclusion.student_id = NEW.student_id)
      AND (exclusion.scope = 'all'
        OR (exclusion.scope = 'future' AND NEW.start_time >= exclusion.start_time)
        OR (exclusion.scope = 'single' AND NEW.start_time = exclusion.start_time))
  ) THEN
    -- Reject the entire insert batch. A materializer must never reserve package
    -- credits for rows silently skipped by a BEFORE trigger.
    RAISE EXCEPTION 'This recurring lesson was deleted';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.skip_deleted_recurring_occurrence() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS sessions_skip_deleted_recurring_occurrence ON public.sessions;
CREATE TRIGGER sessions_skip_deleted_recurring_occurrence BEFORE INSERT ON public.sessions
  FOR EACH ROW EXECUTE FUNCTION public.skip_deleted_recurring_occurrence();

CREATE OR REPLACE FUNCTION public.delete_sessions_with_recurrence(
  p_session_ids uuid[],
  p_exclusions jsonb DEFAULT '[]'::jsonb,
  p_deactivate_recurring_ids uuid[] DEFAULT '{}'::uuid[],
  p_family_only boolean DEFAULT false,
  p_protect_history boolean DEFAULT true,
  p_allowed_tutor_ids uuid[] DEFAULT '{}'::uuid[],
  p_family_student_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  selected_rows jsonb;
  selected_count integer;
  package_refund record;
  item_refund record;
  group_slot record;
  original_session_ids uuid[] := p_session_ids;
BEGIN
  IF cardinality(p_session_ids) IS NULL OR cardinality(p_session_ids) = 0 THEN
    RAISE EXCEPTION 'No sessions selected';
  END IF;
  -- Wait for materializer inserts that started before this request, then stop
  -- further inserts until the exclusions below are committed.
  PERFORM id FROM public.recurring_individual_sessions WHERE id = ANY(p_deactivate_recurring_ids)
    OR id IN (SELECT (value->>'recurring_session_id')::uuid FROM jsonb_array_elements(p_exclusions))
    ORDER BY id FOR UPDATE;
  PERFORM id FROM public.school_class_groups
    WHERE id IN (SELECT (value->>'class_group_id')::uuid FROM jsonb_array_elements(p_exclusions))
    ORDER BY id FOR UPDATE;
  IF NOT p_family_only AND (
    EXISTS (SELECT 1 FROM public.recurring_individual_sessions WHERE id IN (
      SELECT (value->>'recurring_session_id')::uuid FROM jsonb_array_elements(p_exclusions)) AND NOT (tutor_id = ANY(p_allowed_tutor_ids)))
    OR EXISTS (SELECT 1 FROM public.school_class_groups WHERE id IN (
      SELECT (value->>'class_group_id')::uuid FROM jsonb_array_elements(p_exclusions)) AND NOT (tutor_id = ANY(p_allowed_tutor_ids)))
  ) THEN RAISE EXCEPTION 'The recurring teacher changed; refresh the calendar'; END IF;
  -- Serializes retries/concurrent deletes before any financial counter changes.
  PERFORM id FROM public.sessions WHERE id = ANY(p_session_ids) ORDER BY id FOR UPDATE;
  SELECT count(*), jsonb_agg(to_jsonb(session)) INTO selected_count, selected_rows
    FROM public.sessions session WHERE id = ANY(p_session_ids);
  IF selected_count <> cardinality(p_session_ids) THEN
    RAISE EXCEPTION 'Sessions changed; refresh the calendar';
  END IF;
  IF p_family_only AND (p_family_student_id IS NULL OR EXISTS (
    SELECT 1 FROM public.sessions WHERE id = ANY(p_session_ids) AND student_id IS DISTINCT FROM p_family_student_id
  )) THEN RAISE EXCEPTION 'The lesson student changed; refresh the calendar'; END IF;
  IF NOT p_family_only AND EXISTS (
    SELECT 1 FROM public.sessions WHERE id = ANY(p_session_ids) AND NOT (tutor_id = ANY(p_allowed_tutor_ids))
  ) THEN RAISE EXCEPTION 'The lesson teacher changed; refresh the calendar'; END IF;
  -- Include rows generated between the API's paginated read and the series lock.
  -- Only the already authorized teachers (or this family's exact exclusions)
  -- are eligible; completed/joined history remains protected for bulk requests.
  SELECT array_agg(DISTINCT session.id) INTO p_session_ids FROM public.sessions session
  WHERE (session.id = ANY(p_session_ids) OR (
    ((p_family_only AND session.student_id = p_family_student_id) OR (NOT p_family_only AND session.tutor_id = ANY(p_allowed_tutor_ids)))
    AND (NOT p_family_only OR (session.status = 'cancelled' AND COALESCE(session.penalty_resolution, '') NOT IN ('pending', 'invoiced')))
    AND (NOT p_protect_history OR session.status = 'cancelled' OR (
      session.status = 'active' AND session.start_time > now() AND session.student_joined_at IS NULL AND session.tutor_joined_at IS NULL))
    AND EXISTS (
      SELECT 1 FROM jsonb_to_recordset(p_exclusions) AS exclusion(recurring_session_id uuid, class_group_id uuid, student_id uuid, scope text, start_time timestamptz)
      WHERE ((exclusion.recurring_session_id IS NOT NULL AND exclusion.recurring_session_id = session.recurring_session_id)
        OR (exclusion.class_group_id IS NOT NULL AND exclusion.class_group_id = session.class_group_id))
        AND (exclusion.student_id IS NULL OR exclusion.student_id = session.student_id)
        AND (exclusion.scope = 'all' OR (exclusion.scope = 'future' AND session.start_time >= exclusion.start_time)
          OR (exclusion.scope = 'single' AND session.start_time = exclusion.start_time))
    )
  )) AND NOT (session.status = 'cancelled' AND COALESCE(session.penalty_resolution, '') = 'pending' AND session.cancellation_penalty_amount IS NULL)
  AND NOT EXISTS (
    -- Pooled counters are derived by AFTER DELETE from the remaining rows.
    -- Consumed evidence must stay, otherwise deleting it refunds the penalty or
    -- attended lesson even though this function does not explicitly refund it.
    SELECT 1 FROM public.lesson_packages package WHERE package.id = session.lesson_package_id
      AND package.pool_organization_id IS NOT NULL
      AND (session.status IN ('completed', 'no_show') OR (session.status = 'cancelled' AND session.is_late_cancelled))
  );
  IF cardinality(p_session_ids) IS NULL OR cardinality(p_session_ids) = 0 THEN
    IF EXISTS (SELECT 1 FROM public.sessions WHERE id = ANY(original_session_ids)
      AND status = 'cancelled' AND penalty_resolution = 'pending' AND cancellation_penalty_amount IS NULL)
    THEN RAISE EXCEPTION 'Cancellation is still being processed'; END IF;
    RAISE EXCEPTION 'This lesson is retained as payment history';
  END IF;
  PERFORM id FROM public.sessions WHERE id = ANY(p_session_ids) ORDER BY id FOR UPDATE;
  -- The newly expanded rows also need their current ownership checked after
  -- acquiring the row locks; a concurrent reassignment cannot broaden authority.
  IF p_family_only AND EXISTS (SELECT 1 FROM public.sessions WHERE id = ANY(p_session_ids)
    AND student_id IS DISTINCT FROM p_family_student_id)
  THEN RAISE EXCEPTION 'The lesson student changed; refresh the calendar'; END IF;
  IF NOT p_family_only AND EXISTS (SELECT 1 FROM public.sessions WHERE id = ANY(p_session_ids)
    AND NOT (tutor_id = ANY(p_allowed_tutor_ids)))
  THEN RAISE EXCEPTION 'The lesson teacher changed; refresh the calendar'; END IF;
  IF EXISTS (SELECT 1 FROM public.sessions WHERE id = ANY(p_session_ids)
    AND status = 'cancelled' AND penalty_resolution = 'pending' AND cancellation_penalty_amount IS NULL)
  THEN RAISE EXCEPTION 'Cancellation is still being processed'; END IF;
  SELECT jsonb_agg(to_jsonb(session)) INTO selected_rows FROM public.sessions session WHERE id = ANY(p_session_ids);
  IF p_family_only AND EXISTS (
    SELECT 1 FROM public.sessions WHERE id = ANY(p_session_ids)
      AND (status <> 'cancelled' OR penalty_resolution IN ('pending', 'invoiced'))
  ) THEN RAISE EXCEPTION 'Only settled cancelled lessons may be removed by a family'; END IF;
  IF p_protect_history AND EXISTS (
    SELECT 1 FROM public.sessions WHERE id = ANY(p_session_ids)
      AND NOT (status = 'cancelled' OR (status = 'active' AND start_time > now() AND student_joined_at IS NULL AND tutor_joined_at IS NULL))
  ) THEN RAISE EXCEPTION 'Attended lesson history cannot be removed with a recurring schedule'; END IF;

  INSERT INTO public.session_recurrence_exclusions (recurring_session_id, class_group_id, student_id, scope, start_time)
    SELECT recurring_session_id, class_group_id, student_id, scope, start_time
    FROM jsonb_to_recordset(p_exclusions) AS exclusion(recurring_session_id uuid, class_group_id uuid, student_id uuid, scope text, start_time timestamptz)
    ON CONFLICT DO NOTHING;
  UPDATE public.recurring_individual_sessions SET active = false WHERE id = ANY(p_deactivate_recurring_ids);

  -- Cancelled rows already returned their credits through the cancellation flow.
  -- Completed/no-show single-row admin cleanup must not undo consumed credits.
  FOR item_refund IN
    SELECT lesson_package_id AS package_id, subject_id, count(*) AS amount
    FROM public.sessions WHERE id = ANY(p_session_ids) AND status = 'active' AND lesson_package_id IS NOT NULL AND subject_id IS NOT NULL
    GROUP BY lesson_package_id, subject_id ORDER BY lesson_package_id, subject_id
  LOOP
    UPDATE public.lesson_package_items
      SET available_lessons = available_lessons + LEAST(reserved_lessons, item_refund.amount),
          reserved_lessons = GREATEST(0, reserved_lessons - item_refund.amount)
      WHERE package_id = item_refund.package_id AND subject_id = item_refund.subject_id;
  END LOOP;
  FOR package_refund IN
    SELECT lesson_package_id AS package_id, count(*) AS amount
    FROM public.sessions WHERE id = ANY(p_session_ids) AND status = 'active' AND lesson_package_id IS NOT NULL
    GROUP BY lesson_package_id ORDER BY lesson_package_id
  LOOP
    UPDATE public.lesson_packages
      SET available_lessons = available_lessons + LEAST(reserved_lessons, package_refund.amount),
          reserved_lessons = GREATEST(0, reserved_lessons - package_refund.amount)
      WHERE id = package_refund.package_id;
  END LOOP;
  DELETE FROM public.sessions WHERE id = ANY(p_session_ids);

  -- Keep the remaining participants' group-booking capacity accurate.
  FOR group_slot IN
    SELECT DISTINCT tutor_id, subject_id, start_time
    FROM jsonb_to_recordset(selected_rows) AS deleted(tutor_id uuid, subject_id uuid, start_time timestamptz)
    WHERE subject_id IS NOT NULL
  LOOP
    UPDATE public.sessions session SET available_spots = GREATEST(0, COALESCE(subject.max_students, 0) - (
      SELECT count(*) FROM public.sessions remaining WHERE remaining.tutor_id = group_slot.tutor_id
        AND remaining.subject_id = group_slot.subject_id AND remaining.start_time = group_slot.start_time AND remaining.status = 'active'
    ))
    FROM public.subjects subject
    WHERE subject.id = group_slot.subject_id AND subject.is_group = true
      AND session.tutor_id = group_slot.tutor_id AND session.subject_id = group_slot.subject_id
      AND session.start_time = group_slot.start_time AND session.status = 'active';
  END LOOP;
  RETURN selected_rows;
END;
$$;
REVOKE ALL ON FUNCTION public.delete_sessions_with_recurrence(uuid[], jsonb, uuid[], boolean, boolean, uuid[], uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_sessions_with_recurrence(uuid[], jsonb, uuid[], boolean, boolean, uuid[], uuid) TO service_role;
