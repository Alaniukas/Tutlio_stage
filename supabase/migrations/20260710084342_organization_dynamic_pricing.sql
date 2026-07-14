-- Organization-scoped lesson pricing by student grade and contracted weekly frequency.
-- The reference prices are seeded only for Pro Klasė; every other organization starts empty.

CREATE TABLE IF NOT EXISTS public.organization_dynamic_pricing (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  grade_min smallint NOT NULL CHECK (grade_min BETWEEN 1 AND 12),
  grade_max smallint NOT NULL CHECK (grade_max BETWEEN 1 AND 12 AND grade_max >= grade_min),
  lessons_per_week smallint NOT NULL CHECK (lessons_per_week >= 1),
  price numeric(10, 2) NOT NULL CHECK (price >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, grade_min, grade_max, lessons_per_week)
);

CREATE INDEX IF NOT EXISTS idx_org_dynamic_pricing_lookup
  ON public.organization_dynamic_pricing (organization_id, lessons_per_week, grade_min, grade_max);

CREATE INDEX IF NOT EXISTS idx_recurring_individual_sessions_student_active
  ON public.recurring_individual_sessions (student_id, active);

CREATE INDEX IF NOT EXISTS idx_student_individual_pricing_student_subject
  ON public.student_individual_pricing (student_id, subject_id);

ALTER TABLE public.organization_dynamic_pricing ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.organization_dynamic_pricing TO authenticated;
GRANT ALL ON TABLE public.organization_dynamic_pricing TO service_role;

DROP POLICY IF EXISTS "Org members can view dynamic pricing" ON public.organization_dynamic_pricing;
CREATE POLICY "Org members can view dynamic pricing"
  ON public.organization_dynamic_pricing
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.organization_admins oa
      WHERE oa.organization_id = organization_dynamic_pricing.organization_id
        AND oa.user_id = (SELECT auth.uid())
    )
    OR EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.organization_id = organization_dynamic_pricing.organization_id
        AND p.id = (SELECT auth.uid())
    )
    OR EXISTS (
      SELECT 1
      FROM public.students s
      WHERE s.organization_id = organization_dynamic_pricing.organization_id
        AND s.linked_user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Org admins can insert dynamic pricing" ON public.organization_dynamic_pricing;
CREATE POLICY "Org admins can insert dynamic pricing"
  ON public.organization_dynamic_pricing
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.organization_admins oa
      WHERE oa.organization_id = organization_dynamic_pricing.organization_id
        AND oa.user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Org admins can update dynamic pricing" ON public.organization_dynamic_pricing;
CREATE POLICY "Org admins can update dynamic pricing"
  ON public.organization_dynamic_pricing
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.organization_admins oa
      WHERE oa.organization_id = organization_dynamic_pricing.organization_id
        AND oa.user_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.organization_admins oa
      WHERE oa.organization_id = organization_dynamic_pricing.organization_id
        AND oa.user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Org admins can delete dynamic pricing" ON public.organization_dynamic_pricing;
CREATE POLICY "Org admins can delete dynamic pricing"
  ON public.organization_dynamic_pricing
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.organization_admins oa
      WHERE oa.organization_id = organization_dynamic_pricing.organization_id
        AND oa.user_id = (SELECT auth.uid())
    )
  );

ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS pricing_lessons_per_week smallint;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'students_pricing_lessons_per_week_check'
      AND conrelid = 'public.students'::regclass
  ) THEN
    ALTER TABLE public.students
      ADD CONSTRAINT students_pricing_lessons_per_week_check
      CHECK (pricing_lessons_per_week IS NULL OR pricing_lessons_per_week >= 1);
  END IF;
END;
$$;

COMMENT ON COLUMN public.students.pricing_lessons_per_week IS
  'Contracted recurring lessons per week used for organization dynamic pricing. One-off extra lessons never change it.';

-- Keep the contracted frequency in sync with recurring templates only. Creating a one-off
-- session does not touch recurring_individual_sessions, so extra lessons cannot change the tier.
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
  WHERE id = affected_student_id;

  IF TG_OP = 'UPDATE' AND OLD.student_id IS DISTINCT FROM NEW.student_id THEN
    SELECT count(*)::integer
    INTO recurring_count
    FROM public.recurring_individual_sessions ris
    WHERE ris.student_id = OLD.student_id
      AND ris.active = true;

    UPDATE public.students
    SET pricing_lessons_per_week = NULLIF(recurring_count, 0)
    WHERE id = OLD.student_id;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.refresh_student_pricing_lessons_per_week() FROM PUBLIC;

DROP TRIGGER IF EXISTS recurring_sessions_refresh_pricing_frequency_insert
  ON public.recurring_individual_sessions;
DROP TRIGGER IF EXISTS recurring_sessions_refresh_pricing_frequency_update
  ON public.recurring_individual_sessions;
DROP TRIGGER IF EXISTS recurring_sessions_refresh_pricing_frequency_delete
  ON public.recurring_individual_sessions;
CREATE TRIGGER recurring_sessions_refresh_pricing_frequency_insert
  AFTER INSERT
  ON public.recurring_individual_sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.refresh_student_pricing_lessons_per_week();
CREATE TRIGGER recurring_sessions_refresh_pricing_frequency_update
  AFTER UPDATE OF student_id, active
  ON public.recurring_individual_sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.refresh_student_pricing_lessons_per_week();
CREATE TRIGGER recurring_sessions_refresh_pricing_frequency_delete
  AFTER DELETE
  ON public.recurring_individual_sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.refresh_student_pricing_lessons_per_week();

-- Enforce the organization rule at session creation regardless of whether the lesson was
-- created by an organization admin, tutor, or student booking flow. Explicit individual
-- student/subject pricing and trial/group lesson prices retain priority.
CREATE OR REPLACE FUNCTION public.apply_organization_dynamic_session_price()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
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
    s.pricing_lessons_per_week
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

DROP TRIGGER IF EXISTS sessions_apply_organization_dynamic_price ON public.sessions;
CREATE TRIGGER sessions_apply_organization_dynamic_price
  BEFORE INSERT ON public.sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.apply_organization_dynamic_session_price();

-- Prices supplied by Pro Klasė. The name predicate deliberately keeps this data out of every
-- other organization while avoiding a hard-coded generated organization UUID.
INSERT INTO public.organization_dynamic_pricing
  (organization_id, grade_min, grade_max, lessons_per_week, price)
SELECT
  o.id,
  seed.grade_min,
  seed.grade_max,
  seed.lessons_per_week,
  seed.price
FROM public.organizations o
CROSS JOIN (
  VALUES
    (1::smallint, 8::smallint, 3::smallint, 22::numeric),
    (9::smallint, 10::smallint, 3::smallint, 24::numeric),
    (11::smallint, 12::smallint, 3::smallint, 26::numeric),
    (1::smallint, 8::smallint, 2::smallint, 25::numeric),
    (9::smallint, 10::smallint, 2::smallint, 27::numeric),
    (11::smallint, 12::smallint, 2::smallint, 29::numeric),
    (1::smallint, 8::smallint, 1::smallint, 27::numeric),
    (9::smallint, 10::smallint, 1::smallint, 29::numeric),
    (11::smallint, 12::smallint, 1::smallint, 31::numeric)
) AS seed(grade_min, grade_max, lessons_per_week, price)
WHERE lower(trim(o.name)) = lower('Pro Klasė')
ON CONFLICT (organization_id, grade_min, grade_max, lessons_per_week)
DO UPDATE SET price = EXCLUDED.price, updated_at = now();

-- Initialize the stored contracted frequency for existing students only in organizations
-- that actually have dynamic pricing configured.
UPDATE public.students s
SET pricing_lessons_per_week = recurring.frequency
FROM (
  SELECT ris.student_id, count(*)::smallint AS frequency
  FROM public.recurring_individual_sessions ris
  WHERE ris.active = true
  GROUP BY ris.student_id
) recurring
WHERE s.id = recurring.student_id
  AND EXISTS (
    SELECT 1
    FROM public.organization_dynamic_pricing odp
    WHERE odp.organization_id = s.organization_id
  );

COMMENT ON TABLE public.organization_dynamic_pricing IS
  'Organization-specific per-lesson prices resolved by student grade range and contracted recurring lessons per week.';
