-- Apply with the frontend removal caller. Removing an assignment stops future
-- individual lessons; it never infers a replacement tutor from the other cards.
-- Keep the privileged transaction private and expose an invoker-only RPC.
CREATE SCHEMA IF NOT EXISTS private;

CREATE OR REPLACE FUNCTION private.remove_org_student_tutor_pairing(
  p_student_id uuid,
  p_expected_tutor_id uuid,
  p_remaining_student_ids uuid[] DEFAULT '{}'
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
DECLARE
  source_student public.students%ROWTYPE;
  admin_row public.organization_admins%ROWTYPE;
  remaining_id uuid;
  future_ids uuid[];
  cancelled_count integer;
BEGIN
  IF (SELECT auth.uid()) IS NULL OR NOT COALESCE(private.has_active_auth_session(), false) THEN
    RAISE EXCEPTION 'Insufficient organization permission' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO source_student FROM public.students WHERE id = p_student_id;
  IF source_student.id IS NULL OR source_student.organization_id IS NULL
    OR source_student.detached_at IS NOT NULL
    OR source_student.tutor_id IS DISTINCT FROM p_expected_tutor_id
  THEN
    RAISE EXCEPTION 'tutor_pairing_changed';
  END IF;

  SELECT * INTO admin_row FROM public.organization_admins
  WHERE user_id = (SELECT auth.uid()) AND organization_id = source_student.organization_id
    AND status = 'active' AND accepted_at IS NOT NULL
  FOR SHARE;
  IF admin_row.user_id IS NULL OR COALESCE(public.write_blocked_by_org_suspension(), true)
    OR NOT (COALESCE(admin_row.role = 'owner', false) OR (
      COALESCE(admin_row.permissions->>'students.edit', 'false') = 'true'
      AND COALESCE(admin_row.permissions->>'sessions.edit', 'false') = 'true'))
  THEN
    RAISE EXCEPTION 'Insufficient organization permission' USING ERRCODE = '42501';
  END IF;

  -- Authorize before locking, then recheck after the stable-order locks.
  -- Foreign organization rows supplied by a caller are never locked here.
  PERFORM id FROM public.students
  WHERE id = ANY(array_append(COALESCE(p_remaining_student_ids, '{}'), p_student_id))
    AND organization_id = source_student.organization_id ORDER BY id FOR UPDATE;
  SELECT * INTO source_student FROM public.students WHERE id = p_student_id;
  IF source_student.id IS NULL OR source_student.organization_id IS DISTINCT FROM admin_row.organization_id
    OR source_student.detached_at IS NOT NULL
    OR source_student.tutor_id IS DISTINCT FROM p_expected_tutor_id
  THEN RAISE EXCEPTION 'tutor_pairing_changed'; END IF;

  -- Validate every remaining card as the same child and preserve both guardian
  -- link representations. A failed validation rolls back all earlier copies.
  FOREACH remaining_id IN ARRAY COALESCE(p_remaining_student_ids, '{}') LOOP
    IF remaining_id IS NULL OR remaining_id = p_student_id THEN
      RAISE EXCEPTION 'tutor_pairing_changed';
    END IF;
    PERFORM public.copy_student_parent_links_for_tutor_pairing(p_student_id, remaining_id);
  END LOOP;

  PERFORM id FROM public.recurring_individual_sessions
  WHERE student_id = p_student_id AND active ORDER BY id FOR UPDATE;
  -- Previously interrupted transfers must be repaired explicitly; never stop
  -- lessons belonging to a different live assignment based on stale UI state.
  IF EXISTS (
    SELECT 1 FROM public.recurring_individual_sessions r
    WHERE r.student_id = p_student_id AND r.active AND (
      r.tutor_id IS DISTINCT FROM p_expected_tutor_id OR EXISTS (
        SELECT 1 FROM public.sessions s WHERE s.recurring_session_id = r.id
          AND s.status = 'active' AND s.start_time >= now()
          AND (s.student_id IS DISTINCT FROM p_student_id OR s.tutor_id IS DISTINCT FROM p_expected_tutor_id)
      ))
  ) OR EXISTS (
    SELECT 1 FROM public.sessions s WHERE s.student_id = p_student_id
      AND s.class_group_id IS NULL AND s.status = 'active' AND s.start_time >= now()
      AND s.tutor_id IS DISTINCT FROM p_expected_tutor_id
  ) THEN
    RAISE EXCEPTION 'tutor_pairing_changed';
  END IF;

  PERFORM id FROM public.sessions WHERE student_id = p_student_id
    AND tutor_id = p_expected_tutor_id AND class_group_id IS NULL
    AND status = 'active' AND start_time >= now() ORDER BY id FOR UPDATE;
  SELECT array_agg(id) INTO future_ids FROM public.sessions
  WHERE student_id = p_student_id AND tutor_id = p_expected_tutor_id
    AND class_group_id IS NULL AND status = 'active' AND start_time >= now();

  -- Removal is not a refund/credit workflow. Billing-linked lessons must first
  -- be resolved through their normal cancellation flow.
  IF EXISTS (SELECT 1 FROM public.sessions WHERE id = ANY(future_ids)
      AND (paid OR lesson_package_id IS NOT NULL))
    OR EXISTS (SELECT 1 FROM public.invoice_line_items WHERE session_ids && future_ids)
    OR EXISTS (SELECT 1 FROM public.invoices WHERE source_session_id = ANY(future_ids))
    OR EXISTS (
      SELECT 1 FROM public.lesson_packages package
      WHERE package.student_id = ANY(array_append(COALESCE(p_remaining_student_ids, '{}'), p_student_id))
        AND NOT COALESCE(package.paid, false) AND package.cancelled_at IS NULL
        AND (package.available_lessons > 0 OR package.reserved_lessons > 0)
        AND (
          package.tutor_id = p_expected_tutor_id
          OR EXISTS (SELECT 1 FROM public.lesson_package_items item
            JOIN public.subjects subject ON subject.id = item.subject_id
            WHERE item.package_id = package.id AND subject.tutor_id = p_expected_tutor_id
              AND (item.available_lessons > 0 OR item.reserved_lessons > 0))
        )
    )
  THEN
    RAISE EXCEPTION 'tutor_pairing_billing_review_required';
  END IF;

  UPDATE public.sessions SET status = 'cancelled', cancelled_at = now(),
    cancelled_by = 'tutor', hidden_from_calendar = true,
    cancellation_penalty_amount = 0, penalty_resolution = NULL, is_late_cancelled = false
  WHERE id = ANY(future_ids);
  GET DIAGNOSTICS cancelled_count = ROW_COUNT;

  UPDATE public.recurring_individual_sessions SET active = false
  WHERE student_id = p_student_id AND tutor_id = p_expected_tutor_id AND active;

  -- Retain the child, family, billing records and past lessons. Hard deletion
  -- could cascade through more than just the lesson/package tables.
  UPDATE public.students SET tutor_id = NULL WHERE id = p_student_id;
  RETURN jsonb_build_object('mode', 'detached', 'cancelledSessions', cancelled_count);
END;
$$;

REVOKE ALL ON FUNCTION private.remove_org_student_tutor_pairing(uuid, uuid, uuid[]) FROM PUBLIC, anon, authenticated, service_role;
GRANT USAGE ON SCHEMA private TO authenticated;
GRANT EXECUTE ON FUNCTION private.remove_org_student_tutor_pairing(uuid, uuid, uuid[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.remove_org_student_tutor_pairing(
  p_student_id uuid,
  p_expected_tutor_id uuid,
  p_remaining_student_ids uuid[] DEFAULT '{}'
)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  SELECT private.remove_org_student_tutor_pairing(p_student_id, p_expected_tutor_id, p_remaining_student_ids);
$$;
REVOKE ALL ON FUNCTION public.remove_org_student_tutor_pairing(uuid, uuid, uuid[]) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.remove_org_student_tutor_pairing(uuid, uuid, uuid[]) TO authenticated;

-- A materializer that loaded the template before removal must not insert a
-- new future lesson after the transaction has disabled it. FOR SHARE orders
-- insertion against the template update, including concurrent cron requests.
CREATE OR REPLACE FUNCTION private.skip_inactive_individual_recurrence()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' SET row_security = off AS $$
DECLARE template_active boolean;
BEGIN
  IF NEW.recurring_session_id IS NOT NULL AND NEW.status = 'active' AND NEW.start_time >= now() THEN
    SELECT active INTO template_active FROM public.recurring_individual_sessions
    WHERE id = NEW.recurring_session_id FOR SHARE;
    IF template_active = false THEN RETURN NULL; END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.skip_inactive_individual_recurrence() FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER sessions_skip_inactive_individual_recurrence BEFORE INSERT ON public.sessions
FOR EACH ROW EXECUTE FUNCTION private.skip_inactive_individual_recurrence();
