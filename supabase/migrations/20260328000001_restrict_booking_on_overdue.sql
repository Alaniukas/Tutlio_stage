-- Mokinių ribojimas: kol yra vėluojančių įsipareigojimų, negalima rezervuoti naujų pamokų.

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS restrict_booking_on_overdue boolean NOT NULL DEFAULT false;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS restrict_booking_on_overdue boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.organizations.restrict_booking_on_overdue IS
  'Jei įjungta, mokiniai su pradelstu apmokėjimu negali rezervuoti naujų pamokų, kol išspręs skolas.';
COMMENT ON COLUMN public.profiles.restrict_booking_on_overdue IS
  'Veikia kaip korepetitoriaus vėliava; organizacijos atnaujinimas sinchronizuoja visiems org korepetitoriams.';

-- Extend org → org_korep sync (same trigger name as finance migrations)
CREATE OR REPLACE FUNCTION public.sync_org_payment_flags_to_org_tutors()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND (
    NEW.enable_per_lesson IS DISTINCT FROM OLD.enable_per_lesson
    OR NEW.enable_monthly_billing IS DISTINCT FROM OLD.enable_monthly_billing
    OR NEW.enable_prepaid_packages IS DISTINCT FROM OLD.enable_prepaid_packages
    OR NEW.payment_timing IS DISTINCT FROM OLD.payment_timing
    OR NEW.payment_deadline_hours IS DISTINCT FROM OLD.payment_deadline_hours
    OR NEW.restrict_booking_on_overdue IS DISTINCT FROM OLD.restrict_booking_on_overdue
  ) THEN
    UPDATE public.profiles p
    SET
      enable_per_lesson = NEW.enable_per_lesson,
      enable_monthly_billing = NEW.enable_monthly_billing,
      enable_prepaid_packages = NEW.enable_prepaid_packages,
      payment_timing = COALESCE(NEW.payment_timing, 'before_lesson'),
      payment_deadline_hours = COALESCE(NEW.payment_deadline_hours, 24),
      restrict_booking_on_overdue = COALESCE(NEW.restrict_booking_on_overdue, false)
    WHERE p.organization_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

-- TRUE = mokinys užblokuotas (naujų rezervacijų negalima)
CREATE OR REPLACE FUNCTION public.student_booking_blocked_overdue(p_student_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid;
  v_tutor uuid;
  v_restrict boolean;
  v_timing text;
  v_deadline_h int;
  v_now timestamptz := now();
  st_email text;
  st_payer_email text;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RETURN false;
  END IF;

  SELECT s.tutor_id,
         nullif(lower(trim(coalesce(s.email, ''))), ''),
         nullif(lower(trim(coalesce(s.payer_email, ''))), '')
  INTO v_tutor, st_email, st_payer_email
  FROM public.students s
  WHERE s.id = p_student_id;

  IF v_tutor IS NULL THEN
    RETURN false;
  END IF;

  -- Tik prisijungusio mokinio paskyrai taikome ribą (korepetitoriaus įrašai neblokuojami)
  IF NOT EXISTS (
    SELECT 1 FROM public.students s
    WHERE s.id = p_student_id AND s.linked_user_id = v_uid
  ) THEN
    RETURN false;
  END IF;

  SELECT COALESCE(p.restrict_booking_on_overdue, false),
         COALESCE(p.payment_timing, 'before_lesson'),
         COALESCE(p.payment_deadline_hours, 24)
  INTO v_restrict, v_timing, v_deadline_h
  FROM public.profiles p
  WHERE p.id = v_tutor;

  IF NOT v_restrict THEN
    RETURN false;
  END IF;

  -- Neapmokėta mėnesinė sąskaita po termino
  IF EXISTS (
    SELECT 1 FROM public.billing_batches bb
    WHERE bb.tutor_id = v_tutor
      AND bb.paid = false
      AND bb.payment_deadline_date < v_now
      AND (
        (st_email IS NOT NULL AND lower(trim(bb.payer_email)) = st_email)
        OR (st_payer_email IS NOT NULL AND lower(trim(bb.payer_email)) = st_payer_email)
      )
  ) THEN
    RETURN true;
  END IF;

  -- Per pamoką: neapmokėta po pradelsto termino (ne paketas, ne sąskaitos partija)
  IF EXISTS (
    SELECT 1 FROM public.sessions s
    WHERE s.student_id = p_student_id
      AND s.status <> 'cancelled'
      AND COALESCE(s.paid, false) = false
      AND COALESCE(s.payment_status, '') NOT IN ('paid', 'confirmed', 'paid_by_student')
      AND s.lesson_package_id IS NULL
      AND s.payment_batch_id IS NULL
      AND (
        CASE WHEN v_timing = 'before_lesson' THEN
          v_now > (s.start_time - (v_deadline_h * interval '1 hour'))
        ELSE
          v_now > (s.end_time + (v_deadline_h * interval '1 hour'))
        END
      )
  ) THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$$;

DROP FUNCTION IF EXISTS public.student_must_pay_before_booking(uuid);

-- Blokuoti tik mokinio INSERT (korepetitorius gali kurti pamokas)
CREATE OR REPLACE FUNCTION public.enforce_student_booking_not_overdue()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.student_id IS NOT NULL AND public.student_booking_blocked_overdue(NEW.student_id) THEN
    RAISE EXCEPTION 'Reikia apmokėti pradelstus įsipareigojimus, kad galėtumėte rezervuoti naujas pamokas.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sessions_enforce_booking_not_overdue ON public.sessions;
CREATE TRIGGER trg_sessions_enforce_booking_not_overdue
  BEFORE INSERT ON public.sessions
  FOR EACH ROW
  EXECUTE PROCEDURE public.enforce_student_booking_not_overdue();

DROP TRIGGER IF EXISTS trg_waitlists_enforce_booking_not_overdue ON public.waitlists;
CREATE TRIGGER trg_waitlists_enforce_booking_not_overdue
  BEFORE INSERT ON public.waitlists
  FOR EACH ROW
  EXECUTE PROCEDURE public.enforce_student_booking_not_overdue();

REVOKE ALL ON FUNCTION public.student_booking_blocked_overdue(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.student_booking_blocked_overdue(uuid) TO authenticated;
