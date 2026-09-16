-- Keep booking-debt enforcement aligned with the payment UI, checkout APIs,
-- and reminder jobs. An empty student payment_model inherits the current
-- organization/solo-tutor billing flags; it is not automatically per-lesson.

CREATE OR REPLACE FUNCTION public.student_booking_blocked_overdue(p_student_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid;
  v_tutor uuid;
  v_organization uuid;
  v_payment_model text;
  v_restrict boolean;
  v_enable_per_lesson boolean;
  v_enable_monthly_billing boolean;
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
         s.payment_model,
         nullif(lower(trim(coalesce(s.email, ''))), ''),
         nullif(lower(trim(coalesce(s.payer_email, ''))), '')
  INTO v_tutor, v_payment_model, st_email, st_payer_email
  FROM public.students s
  WHERE s.id = p_student_id;

  IF v_tutor IS NULL THEN
    RETURN false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.students s
    WHERE s.id = p_student_id AND s.linked_user_id = v_uid
  ) AND NOT EXISTS (
    SELECT 1
    FROM public.parent_students ps
    JOIN public.parent_profiles pp ON pp.id = ps.parent_id AND pp.user_id = v_uid
    WHERE ps.student_id = p_student_id
  ) THEN
    RETURN false;
  END IF;

  SELECT p.organization_id
  INTO v_organization
  FROM public.profiles p
  WHERE p.id = v_tutor;

  IF v_organization IS NOT NULL THEN
    SELECT COALESCE(o.restrict_booking_on_overdue, false),
           COALESCE(o.enable_per_lesson, false),
           COALESCE(o.enable_monthly_billing, false),
           COALESCE(o.payment_timing, 'before_lesson'),
           COALESCE(o.payment_deadline_hours, 24)
    INTO v_restrict, v_enable_per_lesson, v_enable_monthly_billing, v_timing, v_deadline_h
    FROM public.organizations o
    WHERE o.id = v_organization;
  ELSE
    SELECT COALESCE(p.restrict_booking_on_overdue, false),
           COALESCE(p.enable_per_lesson, false),
           COALESCE(p.enable_monthly_billing, false),
           COALESCE(p.payment_timing, 'before_lesson'),
           COALESCE(p.payment_deadline_hours, 24)
    INTO v_restrict, v_enable_per_lesson, v_enable_monthly_billing, v_timing, v_deadline_h
    FROM public.profiles p
    WHERE p.id = v_tutor;
  END IF;

  IF NOT COALESCE(v_restrict, false) THEN
    RETURN false;
  END IF;

  -- Overdue monthly invoices continue to block the payer independently of
  -- whether individual lessons use per-lesson checkout.
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

  -- Explicit student models win. Empty models inherit the current owner:
  -- monthly billing takes precedence over the legacy per-lesson default.
  IF NOT (
    position('per_lesson' in coalesce(v_payment_model, '')) > 0
    OR (
      coalesce(nullif(trim(v_payment_model), ''), '') = ''
      AND v_enable_per_lesson
      AND NOT v_enable_monthly_billing
    )
  ) THEN
    RETURN false;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.sessions s
    INNER JOIN public.students st ON st.id = s.student_id
    WHERE s.student_id = p_student_id
      AND s.status <> 'cancelled'
      AND COALESCE(s.paid, false) = false
      AND COALESCE(s.payment_status, '') NOT IN ('paid', 'paid_by_student')
      AND s.lesson_package_id IS NULL
      AND s.payment_batch_id IS NULL
      AND (
        CASE
          WHEN (
            CASE
              WHEN position('per_lesson' in coalesce(st.payment_model, '')) > 0
                   AND st.per_lesson_payment_timing IS NOT NULL
              THEN st.per_lesson_payment_timing
              ELSE v_timing
            END
          ) = 'before_lesson' THEN
            v_now > s.start_time - (
              (
                CASE
                  WHEN position('per_lesson' in coalesce(st.payment_model, '')) > 0
                       AND st.per_lesson_payment_deadline_hours IS NOT NULL
                  THEN st.per_lesson_payment_deadline_hours
                  ELSE v_deadline_h
                END
              ) * interval '1 hour'
            )
          ELSE
            v_now > s.end_time + (
              (
                CASE
                  WHEN position('per_lesson' in coalesce(st.payment_model, '')) > 0
                       AND st.per_lesson_payment_deadline_hours IS NOT NULL
                  THEN st.per_lesson_payment_deadline_hours
                  ELSE v_deadline_h
                END
              ) * interval '1 hour'
            )
        END
      )
  ) THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$$;

REVOKE ALL ON FUNCTION public.student_booking_blocked_overdue(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.student_booking_blocked_overdue(uuid) TO authenticated;
