-- SECURITY DEFINER identity lookups must bind the requested UUID to the JWT
-- caller. Server-side email/provisioning calls retain service-role access.
CREATE OR REPLACE FUNCTION public.get_student_by_user_id(p_user_id uuid)
RETURNS TABLE(id uuid, full_name text, email text, phone text, tutor_id uuid, linked_user_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' SET row_security = off
AS $$
  SELECT s.id,s.full_name,s.email,s.phone,s.tutor_id,s.linked_user_id
  FROM public.students s
  WHERE s.linked_user_id = p_user_id
    AND ((SELECT auth.jwt()->>'role') = 'service_role' OR p_user_id = (SELECT auth.uid()))
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.get_student_full_info(p_user_id uuid)
RETURNS TABLE(id uuid, full_name text, email text, phone text, age integer, grade text, tutor_id uuid,
  tutor_full_name text, tutor_email text, payment_payer text, invite_code text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' SET row_security = off
AS $$
  SELECT s.id,s.full_name,s.email,s.phone,s.age,s.grade,s.tutor_id,p.full_name,p.email,s.payment_payer,s.invite_code
  FROM public.students s LEFT JOIN public.profiles p ON p.id = s.tutor_id
  WHERE s.linked_user_id = p_user_id
    AND ((SELECT auth.jwt()->>'role') = 'service_role' OR p_user_id = (SELECT auth.uid()))
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.get_parent_profile_by_user_id(p_user_id uuid)
RETURNS TABLE(id uuid, full_name text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' SET row_security = off
AS $$
  SELECT pp.id,pp.full_name FROM public.parent_profiles pp
  WHERE pp.user_id = p_user_id
    AND ((SELECT auth.jwt()->>'role') = 'service_role' OR p_user_id = (SELECT auth.uid()))
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.get_parent_profile_id_by_user_id(p_user_id uuid)
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' SET row_security = off
AS $$
  SELECT pp.id FROM public.parent_profiles pp
  WHERE pp.user_id = p_user_id
    AND ((SELECT auth.jwt()->>'role') = 'service_role' OR p_user_id = (SELECT auth.uid()))
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.get_registered_parents_for_linked_student(p_student_id uuid, p_linked_user_id uuid)
RETURNS TABLE(full_name text, email text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' SET row_security = off
AS $$
  SELECT pp.full_name::text,pp.email::text
  FROM public.parent_students ps
  JOIN public.parent_profiles pp ON pp.id = ps.parent_id
  JOIN public.students s ON s.id = ps.student_id
  WHERE ps.student_id = p_student_id AND pp.user_id IS NOT NULL AND s.linked_user_id = p_linked_user_id
    AND ((SELECT auth.jwt()->>'role') = 'service_role' OR p_linked_user_id = (SELECT auth.uid()));
$$;

-- The browser already reads perlas_ledger directly. Use its existing ownership
-- and finance-permission RLS for the aggregate too, including service callers.
CREATE OR REPLACE FUNCTION public.get_perlas_balance_breakdown(p_entity_type text, p_entity_id uuid)
RETURNS TABLE(pending_volume numeric, pending_net numeric, reserved_volume numeric, reserved_net numeric,
  total_paid_out_volume numeric, total_paid_out_net numeric)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = ''
AS $$
  SELECT
    COALESCE(SUM(CASE WHEN ledger.status='pending' THEN ledger.volume END),0),
    COALESCE(SUM(CASE WHEN ledger.status='pending' THEN ledger.net_amount END),0),
    COALESCE(SUM(CASE WHEN ledger.status='reserved' THEN ledger.volume END),0),
    COALESCE(SUM(CASE WHEN ledger.status='reserved' THEN ledger.net_amount END),0),
    COALESCE(SUM(CASE WHEN ledger.status='paid_out' THEN ledger.volume END),0),
    COALESCE(SUM(CASE WHEN ledger.status='paid_out' THEN ledger.net_amount END),0)
  FROM public.perlas_ledger ledger
  WHERE ledger.entity_type=p_entity_type AND ledger.entity_id=p_entity_id;
$$;

REVOKE ALL ON FUNCTION public.get_student_by_user_id(uuid), public.get_student_full_info(uuid),
  public.get_parent_profile_by_user_id(uuid), public.get_parent_profile_id_by_user_id(uuid),
  public.get_registered_parents_for_linked_student(uuid,uuid), public.get_perlas_balance_breakdown(text,uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_student_by_user_id(uuid), public.get_student_full_info(uuid),
  public.get_parent_profile_by_user_id(uuid), public.get_parent_profile_id_by_user_id(uuid),
  public.get_registered_parents_for_linked_student(uuid,uuid), public.get_perlas_balance_breakdown(text,uuid)
  TO authenticated, service_role;

-- These helpers have only server or SECURITY DEFINER database callers. Some
-- older deployments still contain the superseded payout RPC, so handle its
-- presence explicitly rather than recreating it on newer installations.
DO $$
DECLARE
  signature text;
  routine regprocedure;
BEGIN
  FOREACH signature IN ARRAY ARRAY[
    'public.admin_stats_locale_distribution()',
    'public.admin_stats_signup_trends(timestamptz)',
    'public.admin_stats_top_pages(timestamptz)',
    'public.admin_stats_traffic_sources(timestamptz)',
    'public.admin_stats_unique_sessions(timestamptz)',
    'public.allocate_invoice_number(uuid)',
    'public.next_b2c_invoice_number()',
    'public.next_platform_invoice_number()',
    'public.get_perlas_available_balance(text,uuid)',
    'public.insert_payout_if_balance_sufficient(text,uuid,numeric,text,text,text,text,text)',
    'public.release_cancelled_session_as_availability(uuid,timestamptz,timestamptz,uuid)'
  ] LOOP
    routine := to_regprocedure(signature);
    IF routine IS NOT NULL THEN
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated',routine);
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',routine);
    END IF;
  END LOOP;
END;
$$;
