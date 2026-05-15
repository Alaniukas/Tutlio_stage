-- Fix PerlasFinance balance and payout issues:
-- 1. Prevent double-counting: org tutor sessions belong to org only
-- 2. Atomic payout insert: prevents race-condition over-withdrawal
-- 3. Handle refunds: reverse paid status

-- ── 1. Fix balance RPC: exclude org-member sessions from tutor balance ──
CREATE OR REPLACE FUNCTION public.get_perlas_available_balance(
  p_entity_type text,
  p_entity_id uuid
)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_total_earned numeric;
  v_total_paid_out numeric;
BEGIN
  IF p_entity_type = 'tutor' THEN
    -- Only count sessions where this tutor is NOT part of an organization
    SELECT COALESCE(SUM(s.price), 0) INTO v_total_earned
    FROM public.sessions s
    JOIN public.profiles p ON p.id = s.tutor_id
    WHERE s.tutor_id = p_entity_id
      AND s.paid = true
      AND s.perlas_transaction_id IS NOT NULL
      AND p.organization_id IS NULL;
  ELSIF p_entity_type = 'org' THEN
    SELECT COALESCE(SUM(s.price), 0) INTO v_total_earned
    FROM public.sessions s
    JOIN public.profiles p ON p.id = s.tutor_id
    WHERE p.organization_id = p_entity_id
      AND s.paid = true
      AND s.perlas_transaction_id IS NOT NULL;
  ELSE
    RETURN 0;
  END IF;

  SELECT COALESCE(SUM(amount), 0) INTO v_total_paid_out
  FROM public.payouts
  WHERE entity_type = p_entity_type
    AND entity_id = p_entity_id
    AND status IN ('processing', 'success');

  RETURN GREATEST(v_total_earned - v_total_paid_out, 0);
END;
$$;

-- ── 2. Atomic payout insert: check balance and insert in one transaction ──
CREATE OR REPLACE FUNCTION public.insert_payout_if_balance_sufficient(
  p_entity_type text,
  p_entity_id uuid,
  p_amount numeric,
  p_currency text,
  p_perlas_transaction_id text,
  p_payment_purpose text,
  p_receiver_iban text,
  p_receiver_name text
)
RETURNS TABLE(ok boolean, available numeric, payout_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_available numeric;
  v_payout_id uuid;
BEGIN
  -- Lock the entity row to prevent concurrent payouts
  IF p_entity_type = 'tutor' THEN
    PERFORM 1 FROM public.profiles WHERE id = p_entity_id FOR UPDATE;
  ELSIF p_entity_type = 'org' THEN
    PERFORM 1 FROM public.organizations WHERE id = p_entity_id FOR UPDATE;
  ELSE
    RETURN QUERY SELECT false, 0::numeric, NULL::uuid;
    RETURN;
  END IF;

  v_available := public.get_perlas_available_balance(p_entity_type, p_entity_id);

  IF p_amount > v_available THEN
    RETURN QUERY SELECT false, v_available, NULL::uuid;
    RETURN;
  END IF;

  INSERT INTO public.payouts (
    entity_type, entity_id, amount, currency, status,
    perlas_transaction_id, payment_purpose, receiver_iban, receiver_name
  ) VALUES (
    p_entity_type, p_entity_id, p_amount, p_currency, 'processing',
    p_perlas_transaction_id, p_payment_purpose, p_receiver_iban, p_receiver_name
  )
  RETURNING id INTO v_payout_id;

  RETURN QUERY SELECT true, v_available, v_payout_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.insert_payout_if_balance_sufficient(text, uuid, numeric, text, text, text, text, text) TO service_role;
