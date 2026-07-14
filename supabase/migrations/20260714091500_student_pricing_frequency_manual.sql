-- Dynamic pricing fix (org feedback item 9): lessons created one at a time
-- never establish a contracted lessons-per-week, so no tier can be selected
-- and billing follows per-lesson prices. Give the org admin (or the student's
-- tutor) an explicit, manually-set frequency that the recurring-schedule
-- trigger will not overwrite, and re-price upcoming lessons when it changes.

ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS pricing_lessons_per_week_is_manual boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.students.pricing_lessons_per_week_is_manual IS
  'True when pricing_lessons_per_week was set manually by the admin/tutor; the recurring-schedule trigger then leaves it untouched.';

-- Same as 20260710084342, plus: skip students whose frequency is manual.
CREATE OR REPLACE FUNCTION public.refresh_student_pricing_lessons_per_week()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  affected_student_id uuid;
  recurring_count integer;
BEGIN
  affected_student_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.student_id ELSE NEW.student_id END;

  SELECT count(*)::integer
  INTO recurring_count
  FROM public.recurring_individual_sessions ris
  WHERE ris.student_id = affected_student_id
    AND ris.active = true;

  UPDATE public.students
  SET pricing_lessons_per_week = NULLIF(recurring_count, 0)
  WHERE id = affected_student_id
    AND pricing_lessons_per_week_is_manual = false;

  IF TG_OP = 'UPDATE' AND OLD.student_id IS DISTINCT FROM NEW.student_id THEN
    SELECT count(*)::integer
    INTO recurring_count
    FROM public.recurring_individual_sessions ris
    WHERE ris.student_id = OLD.student_id
      AND ris.active = true;

    UPDATE public.students
    SET pricing_lessons_per_week = NULLIF(recurring_count, 0)
    WHERE id = OLD.student_id
      AND pricing_lessons_per_week_is_manual = false;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

-- Admin-facing setter. p_lessons_per_week NULL switches back to automatic
-- (recomputed from active recurring templates). Any change re-prices the
-- student's upcoming unpaid lessons to the matching tier, using the same
-- eligibility rules as apply_organization_dynamic_session_price (skips
-- trial/group subjects and explicit per-student subject pricing).
CREATE OR REPLACE FUNCTION public.set_student_pricing_frequency(
  p_student_id uuid,
  p_lessons_per_week smallint
)
RETURNS smallint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_tutor uuid;
  v_org uuid;
  v_allowed boolean := false;
  v_freq smallint;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF p_lessons_per_week IS NOT NULL AND p_lessons_per_week < 1 THEN
    RAISE EXCEPTION 'Lessons per week must be at least 1';
  END IF;

  SELECT s.tutor_id, COALESCE(s.organization_id, p.organization_id)
  INTO v_tutor, v_org
  FROM public.students s
  LEFT JOIN public.profiles p ON p.id = s.tutor_id
  WHERE s.id = p_student_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Student not found';
  END IF;

  v_allowed := (v_tutor IS NOT NULL AND v_tutor = v_caller);
  IF NOT v_allowed AND v_org IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.organization_admins oa
      WHERE oa.user_id = v_caller
        AND oa.organization_id = v_org
    ) INTO v_allowed;
  END IF;
  IF NOT v_allowed THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;

  IF p_lessons_per_week IS NULL THEN
    SELECT NULLIF(count(*), 0)::smallint
    INTO v_freq
    FROM public.recurring_individual_sessions ris
    WHERE ris.student_id = p_student_id
      AND ris.active = true;

    UPDATE public.students
    SET pricing_lessons_per_week = v_freq,
        pricing_lessons_per_week_is_manual = false
    WHERE id = p_student_id;
  ELSE
    v_freq := p_lessons_per_week;

    UPDATE public.students
    SET pricing_lessons_per_week = v_freq,
        pricing_lessons_per_week_is_manual = true
    WHERE id = p_student_id;
  END IF;

  UPDATE public.sessions se
  SET price = tier.price
  FROM public.students s
  CROSS JOIN LATERAL (
    SELECT odp.price
    FROM public.organization_dynamic_pricing odp
    WHERE odp.organization_id = COALESCE(s.organization_id, v_org)
      AND odp.lessons_per_week = s.pricing_lessons_per_week
      AND (
        CASE
          WHEN substring(COALESCE(s.grade, '') FROM '([0-9]{1,2})') IS NULL THEN NULL
          ELSE substring(s.grade FROM '([0-9]{1,2})')::smallint
        END
      ) BETWEEN odp.grade_min AND odp.grade_max
    ORDER BY (odp.grade_max - odp.grade_min), odp.grade_min
    LIMIT 1
  ) tier
  WHERE s.id = p_student_id
    AND se.student_id = s.id
    AND se.start_time > now()
    AND COALESCE(se.paid, false) = false
    AND (
      se.subject_id IS NULL
      OR NOT EXISTS (
        SELECT 1
        FROM public.subjects sub
        WHERE sub.id = se.subject_id
          AND (COALESCE(sub.is_trial, false) OR COALESCE(sub.is_group, false))
      )
    )
    AND (
      se.subject_id IS NULL
      OR NOT EXISTS (
        SELECT 1
        FROM public.student_individual_pricing sip
        WHERE sip.student_id = se.student_id
          AND sip.subject_id = se.subject_id
      )
    );

  RETURN v_freq;
END;
$$;

REVOKE ALL ON FUNCTION public.set_student_pricing_frequency(uuid, smallint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_student_pricing_frequency(uuid, smallint) TO authenticated;
