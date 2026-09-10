-- Contract frequency spans tutor pairings of the same child, not package credits.
-- No historical payments or packages are repriced by this migration.
CREATE OR REPLACE FUNCTION private.pricing_identity_student_ids(p_student_id uuid)
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT candidate.id
  FROM public.students anchor
  JOIN public.students candidate ON candidate.id = anchor.id OR (
    anchor.organization_id IN ('3422031d-6e21-424d-980b-35a9c6d7b8f1'::uuid, 'b0a00000-7e57-4000-8000-000000000001'::uuid)
    AND anchor.detached_at IS NULL
    AND candidate.organization_id = anchor.organization_id
    AND candidate.detached_at IS NULL
    AND lower(regexp_replace(trim(coalesce(candidate.full_name, '')), '\s+', ' ', 'g'))
      = lower(regexp_replace(trim(coalesce(anchor.full_name, '')), '\s+', ' ', 'g'))
    AND (
      (anchor.linked_user_id IS NOT NULL AND candidate.linked_user_id = anchor.linked_user_id)
      OR (anchor.linked_user_id IS NULL AND candidate.linked_user_id IS NULL
        AND nullif(lower(trim(anchor.email)), '') IS NOT NULL
        AND lower(trim(candidate.email)) = lower(trim(anchor.email)))
    )
  )
  WHERE anchor.id = p_student_id;
$$;
REVOKE ALL ON FUNCTION private.pricing_identity_student_ids(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.pricing_identity_frequency(p_student_id uuid)
RETURNS smallint LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT nullif(count(*), 0)::smallint
  FROM public.recurring_individual_sessions recurring
  WHERE recurring.active = true
    AND (recurring.end_date IS NULL OR recurring.end_date >= (now() AT TIME ZONE 'Europe/Vilnius')::date)
    AND recurring.student_id IN (SELECT private.pricing_identity_student_ids(p_student_id));
$$;
REVOKE ALL ON FUNCTION private.pricing_identity_frequency(uuid) FROM PUBLIC, anon, authenticated;

-- Manual values describe one shared contract, not additive tutor frequencies.
CREATE OR REPLACE FUNCTION private.pricing_identity_effective_frequency(p_student_id uuid)
RETURNS smallint LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE manual_count integer; manual_frequency smallint;
BEGIN
  SELECT count(DISTINCT pricing_lessons_per_week), max(pricing_lessons_per_week)
  INTO manual_count, manual_frequency FROM public.students
  WHERE id IN (SELECT private.pricing_identity_student_ids(p_student_id))
    AND pricing_lessons_per_week_is_manual;
  IF manual_count > 1 THEN RAISE EXCEPTION 'Conflicting manual pricing frequencies for the same student'; END IF;
  RETURN coalesce(manual_frequency, private.pricing_identity_frequency(p_student_id));
END;
$$;
REVOKE ALL ON FUNCTION private.pricing_identity_effective_frequency(uuid) FROM PUBLIC, anon, authenticated;

-- Tutor RLS hides other pairings. Expose only an authorized aggregate, not rows.
CREATE OR REPLACE FUNCTION public.get_student_pricing_frequency(p_student_id uuid)
RETURNS smallint LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.students student WHERE student.id = p_student_id
      AND (student.tutor_id = auth.uid() OR EXISTS (
        SELECT 1 FROM public.organization_admins admin
        WHERE admin.user_id = auth.uid() AND admin.organization_id = student.organization_id
      ))
  ) THEN RAISE EXCEPTION 'Not allowed'; END IF;
  RETURN private.pricing_identity_effective_frequency(p_student_id);
END;
$$;
REVOKE ALL ON FUNCTION public.get_student_pricing_frequency(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_student_pricing_frequency(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.refresh_student_pricing_lessons_per_week()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  affected uuid;
BEGIN
  FOR affected IN
    SELECT DISTINCT id FROM unnest(CASE
      WHEN TG_OP = 'DELETE' THEN ARRAY[OLD.student_id]
      WHEN TG_OP = 'INSERT' THEN ARRAY[NEW.student_id]
      ELSE ARRAY[OLD.student_id, NEW.student_id] END) AS ids(id)
  LOOP
    UPDATE public.students
    SET pricing_lessons_per_week = private.pricing_identity_effective_frequency(affected)
    WHERE id IN (SELECT private.pricing_identity_student_ids(affected))
      AND pricing_lessons_per_week_is_manual = false;
  END LOOP;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.refresh_student_pricing_lessons_per_week() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS recurring_sessions_refresh_pricing_frequency_update ON public.recurring_individual_sessions;
CREATE TRIGGER recurring_sessions_refresh_pricing_frequency_update
  AFTER UPDATE OF student_id, active, end_date ON public.recurring_individual_sessions
  FOR EACH ROW EXECUTE FUNCTION public.refresh_student_pricing_lessons_per_week();

-- Refresh stored automatic frequencies, leaving explicit manual contracts intact.
UPDATE public.students student
SET pricing_lessons_per_week = private.pricing_identity_effective_frequency(student.id)
WHERE NOT student.pricing_lessons_per_week_is_manual
  AND student.detached_at IS NULL
  AND student.organization_id IN ('3422031d-6e21-424d-980b-35a9c6d7b8f1'::uuid, 'b0a00000-7e57-4000-8000-000000000001'::uuid)
  AND EXISTS (SELECT 1 FROM public.organization_dynamic_pricing pricing
    WHERE pricing.organization_id = student.organization_id);

-- Preserve existing authorization and repricing rules when resetting to automatic.
CREATE OR REPLACE FUNCTION public.set_student_pricing_frequency(
  p_student_id uuid,
  p_lessons_per_week smallint
)
RETURNS smallint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_tutor uuid;
  v_org uuid;
  v_allowed boolean := false;
  v_org_admin boolean := false;
  v_targets uuid[];
  v_freq smallint;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_lessons_per_week IS NOT NULL AND p_lessons_per_week < 1 THEN
    RAISE EXCEPTION 'Lessons per week must be at least 1';
  END IF;

  SELECT student.tutor_id, COALESCE(student.organization_id, tutor.organization_id)
  INTO v_tutor, v_org
  FROM public.students student
  LEFT JOIN public.profiles tutor ON tutor.id = student.tutor_id
  WHERE student.id = p_student_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Student not found'; END IF;

  v_allowed := v_tutor IS NOT NULL AND v_tutor = v_caller;
  IF v_org IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.organization_admins admin
      WHERE admin.user_id = v_caller
        AND admin.organization_id = v_org
        AND (
          private.org_admin_user_has_permission(admin.user_id, 'finance.edit')
          OR private.org_admin_user_has_permission(admin.user_id, 'sessions.edit')
        )
    ) INTO v_org_admin;
  END IF;
  IF NOT (v_allowed OR v_org_admin) THEN RAISE EXCEPTION 'Not allowed'; END IF;
  IF v_org_admin THEN
    SELECT array_agg(id) INTO v_targets FROM private.pricing_identity_student_ids(p_student_id) AS ids(id);
  ELSE
    v_targets := ARRAY[p_student_id];
    -- A tutor may edit only their pairing, and cannot contradict another pairing's contract.
    IF p_lessons_per_week IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.students
      WHERE id IN (SELECT private.pricing_identity_student_ids(p_student_id))
        AND id <> p_student_id AND pricing_lessons_per_week_is_manual
        AND pricing_lessons_per_week IS DISTINCT FROM p_lessons_per_week
    ) THEN RAISE EXCEPTION 'Organization admin must change the shared pricing contract'; END IF;
  END IF;

  IF p_lessons_per_week IS NULL THEN
    UPDATE public.students
    SET pricing_lessons_per_week_is_manual = false
    WHERE id = ANY(v_targets);
    SELECT private.pricing_identity_effective_frequency(p_student_id) INTO v_freq;
    UPDATE public.students SET pricing_lessons_per_week = v_freq WHERE id = ANY(v_targets);
  ELSE
    v_freq := p_lessons_per_week;
    UPDATE public.students
    SET pricing_lessons_per_week = v_freq,
        pricing_lessons_per_week_is_manual = true
    WHERE id = ANY(v_targets);
  END IF;

  UPDATE public.sessions lesson_session
  SET price = tier.price
  FROM public.students student
  CROSS JOIN LATERAL (
    SELECT pricing.price
    FROM public.organization_dynamic_pricing pricing
    WHERE pricing.organization_id = COALESCE(student.organization_id, v_org)
      AND pricing.lessons_per_week = student.pricing_lessons_per_week
      AND (
        CASE
          WHEN substring(COALESCE(student.grade, '') FROM '([0-9]{1,2})') IS NULL THEN NULL
          ELSE substring(student.grade FROM '([0-9]{1,2})')::smallint
        END
      ) BETWEEN pricing.grade_min AND pricing.grade_max
    ORDER BY (pricing.grade_max - pricing.grade_min), pricing.grade_min
    LIMIT 1
  ) tier
  WHERE student.id = ANY(v_targets)
    AND lesson_session.student_id = student.id
    AND lesson_session.start_time > now()
    AND COALESCE(lesson_session.paid, false) = false
    AND (
      lesson_session.subject_id IS NULL
      OR NOT EXISTS (
        SELECT 1 FROM public.subjects subject
        WHERE subject.id = lesson_session.subject_id
          AND (COALESCE(subject.is_trial, false) OR COALESCE(subject.is_group, false))
      )
    )
    AND (
      lesson_session.subject_id IS NULL
      OR NOT EXISTS (
        SELECT 1 FROM public.student_individual_pricing individual
        WHERE individual.student_id = lesson_session.student_id
          AND individual.subject_id = lesson_session.subject_id
      )
    );

  RETURN v_freq;
END;
$$;

REVOKE ALL ON FUNCTION public.set_student_pricing_frequency(uuid, smallint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_student_pricing_frequency(uuid, smallint) TO authenticated, service_role;

-- Recompute at creation too: end dates can expire without a template UPDATE.
CREATE OR REPLACE FUNCTION public.apply_organization_dynamic_session_price()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  student_org_id uuid;
  student_grade smallint;
  student_frequency smallint;
  dynamic_price numeric(10, 2);
BEGIN
  IF NEW.student_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.subject_id IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.subjects sub
    WHERE sub.id = NEW.subject_id
      AND (COALESCE(sub.is_trial, false) OR COALESCE(sub.is_group, false))
  ) THEN
    RETURN NEW;
  END IF;

  IF NEW.subject_id IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.student_individual_pricing sip
    WHERE sip.student_id = NEW.student_id
      AND sip.subject_id = NEW.subject_id
  ) THEN
    RETURN NEW;
  END IF;

  SELECT
    s.organization_id,
    CASE
      WHEN substring(COALESCE(s.grade, '') FROM '([0-9]{1,2})') IS NULL THEN NULL
      ELSE substring(s.grade FROM '([0-9]{1,2})')::smallint
    END,
    CASE WHEN s.organization_id IN ('3422031d-6e21-424d-980b-35a9c6d7b8f1'::uuid, 'b0a00000-7e57-4000-8000-000000000001'::uuid) THEN private.pricing_identity_effective_frequency(s.id) ELSE s.pricing_lessons_per_week END
  INTO student_org_id, student_grade, student_frequency
  FROM public.students s
  WHERE s.id = NEW.student_id;

  IF student_org_id IS NULL OR student_grade IS NULL OR student_frequency IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT odp.price
  INTO dynamic_price
  FROM public.organization_dynamic_pricing odp
  WHERE odp.organization_id = student_org_id
    AND odp.lessons_per_week = student_frequency
    AND student_grade BETWEEN odp.grade_min AND odp.grade_max
  ORDER BY (odp.grade_max - odp.grade_min), odp.grade_min
  LIMIT 1;

  IF dynamic_price IS NOT NULL THEN
    NEW.price := dynamic_price;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_organization_dynamic_session_price() FROM PUBLIC;
