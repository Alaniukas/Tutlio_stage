-- Pending package cancellation must be one server-only transaction. This is
-- especially important for pooled Pro Klase packages, whose direct browser
-- writes are intentionally blocked by RLS/immutability triggers.
CREATE OR REPLACE FUNCTION public.cancel_pending_lesson_package(
  p_package_id uuid,
  p_org_id uuid,
  p_cancelled_by uuid
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_package public.lesson_packages;
  v_tutor_org uuid;
BEGIN
  SELECT * INTO v_package
  FROM public.lesson_packages
  WHERE id = p_package_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Package not found'; END IF;
  SELECT organization_id INTO v_tutor_org FROM public.profiles WHERE id = v_package.tutor_id;
  IF coalesce(v_package.pool_organization_id, v_tutor_org) IS DISTINCT FROM p_org_id THEN
    RAISE EXCEPTION 'Package belongs to another organization';
  END IF;
  IF v_package.payment_status = 'cancelled' THEN RETURN v_package.id; END IF;
  IF v_package.paid OR v_package.payment_status = 'paid' THEN
    RAISE EXCEPTION 'Package is already paid';
  END IF;
  IF v_package.payment_status <> 'pending' THEN
    RAISE EXCEPTION 'Package is not pending';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.sessions
    WHERE lesson_package_id = p_package_id AND paid
  ) THEN RAISE EXCEPTION 'Package has paid lessons'; END IF;

  UPDATE public.sessions
  SET status = 'cancelled', lesson_package_id = NULL,
      payment_status = 'pending', reservation_expires_at = NULL
  WHERE lesson_package_id = p_package_id AND payment_status = 'reserved';

  UPDATE public.sessions
  SET lesson_package_id = NULL, payment_status = 'pending'
  WHERE lesson_package_id = p_package_id;

  UPDATE public.lesson_packages
  SET active = false,
      payment_status = 'cancelled',
      cancelled_at = now(),
      cancelled_by = p_cancelled_by,
      stripe_checkout_session_id = NULL
  WHERE id = p_package_id;

  RETURN p_package_id;
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_pending_lesson_package(uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_pending_lesson_package(uuid, uuid, uuid)
  TO service_role;

-- One-time Pro Klase remediation requested by the organization: this package
-- was left pending after the old browser-side cancellation was blocked. The
-- package had no Checkout Session during the production audit, so cancelling
-- it here cannot leave a live Stripe payment page behind. Apply nowhere else:
-- the exact package, organization and payer email must all still match.
DO $$
DECLARE
  v_status text;
  v_paid boolean;
  v_checkout_session_id text;
  v_payer_email text;
BEGIN
  SELECT lp.payment_status, lp.paid, lp.stripe_checkout_session_id,
         lower(trim(coalesce(nullif(s.payer_email, ''), s.email, '')))
    INTO v_status, v_paid, v_checkout_session_id, v_payer_email
  FROM public.lesson_packages lp
  JOIN public.students s ON s.id = lp.student_id
  WHERE lp.id = '88966778-d9db-4fe7-ae53-1b3e8411b3cf'::uuid
    AND lp.pool_organization_id = '3422031d-6e21-424d-980b-35a9c6d7b8f1'::uuid;

  IF FOUND THEN
    IF v_payer_email IS DISTINCT FROM 'asta321654@gmail.com' THEN
      RAISE EXCEPTION 'Benas package remediation identity mismatch';
    END IF;
    IF v_status = 'cancelled' THEN
      NULL; -- idempotent if an administrator cancelled it before deployment
    ELSIF v_paid OR v_status <> 'pending' THEN
      RAISE EXCEPTION 'Benas package remediation refused: package is no longer pending';
    ELSIF v_checkout_session_id IS NOT NULL THEN
      RAISE EXCEPTION 'Benas package remediation refused: Checkout Session must be expired first';
    ELSE
      -- Supabase migrations run as the database owner without JWT claims. Set
      -- the transaction-local claim expected by protect_pooled_package(); the
      -- RPC itself remains revoked from anon/authenticated callers.
      PERFORM set_config('request.jwt.claim.role', 'service_role', true);
      PERFORM public.cancel_pending_lesson_package(
        '88966778-d9db-4fe7-ae53-1b3e8411b3cf'::uuid,
        '3422031d-6e21-424d-980b-35a9c6d7b8f1'::uuid,
        NULL::uuid
      );
    END IF;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.prevent_cancelled_package_reactivation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF OLD.payment_status = 'cancelled' AND (
    NEW.payment_status IS DISTINCT FROM 'cancelled'
    OR NEW.paid IS DISTINCT FROM false
    OR NEW.active IS DISTINCT FROM false
  ) THEN
    RAISE EXCEPTION 'Cancelled package cannot be reactivated';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_cancelled_package_reactivation ON public.lesson_packages;
CREATE TRIGGER prevent_cancelled_package_reactivation
BEFORE UPDATE ON public.lesson_packages
FOR EACH ROW EXECUTE FUNCTION public.prevent_cancelled_package_reactivation();
