-- Add credit_balance to get_student_profiles RPC
DROP FUNCTION IF EXISTS public.get_student_profiles(uuid, uuid);

CREATE OR REPLACE FUNCTION public.get_student_profiles(
  p_user_id uuid,
  p_student_id uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  full_name text,
  email text,
  phone text,
  age integer,
  grade text,
  tutor_id uuid,
  tutor_full_name text,
  tutor_email text,
  payment_payer text,
  payer_email text,
  invite_code text,
  tutor_cancellation_hours integer,
  tutor_cancellation_fee_percent numeric,
  tutor_min_booking_hours integer,
  tutor_break_between_lessons integer,
  payment_model text,
  payment_override_active boolean,
  credit_balance numeric
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    s.id,
    s.full_name,
    s.email,
    s.phone,
    s.age,
    s.grade,
    s.tutor_id,
    p.full_name AS tutor_full_name,
    p.email AS tutor_email,
    s.payment_payer,
    s.payer_email,
    s.invite_code,
    p.cancellation_hours AS tutor_cancellation_hours,
    p.cancellation_fee_percent AS tutor_cancellation_fee_percent,
    p.min_booking_hours AS tutor_min_booking_hours,
    p.break_between_lessons AS tutor_break_between_lessons,
    s.payment_model,
    COALESCE(
      CASE
        WHEN p.organization_id IS NOT NULL THEN (NULLIF(trim(o.features->>'per_student_payment_override'), ''))::boolean
        ELSE p.enable_per_student_payment_override
      END,
      false
    ) AS payment_override_active,
    COALESCE(s.credit_balance, 0) AS credit_balance
  FROM public.students s
  LEFT JOIN public.profiles p ON p.id = s.tutor_id
  LEFT JOIN public.organizations o ON o.id = p.organization_id
  WHERE s.linked_user_id = p_user_id
    AND (p_student_id IS NULL OR s.id = p_student_id)
  ORDER BY s.created_at DESC;
$$;

REVOKE ALL ON FUNCTION public.get_student_profiles(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_student_profiles(uuid, uuid) TO authenticated, service_role;
