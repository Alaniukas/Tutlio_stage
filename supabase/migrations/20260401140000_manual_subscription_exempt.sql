-- Rankinė išimtis: prieiga be Stripe app prenumeratos (sąskaitos už platformą už išorę).
-- Tik serveris (service_role) gali nustatyti šį lauką — žr. trigerį.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS manual_subscription_exempt boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.profiles.manual_subscription_exempt IS 'Jei true — leidžiama naudoti platformą be Stripe prenumeratos (rankinė sutartis / sąskaitos).';

CREATE OR REPLACE FUNCTION public.profiles_guard_manual_subscription_exempt()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  jwt_role text;
BEGIN
  jwt_role := nullif(trim(both FROM coalesce(
    current_setting('request.jwt.claim.role', true),
    ''
  )), '');

  IF TG_OP = 'INSERT' THEN
    IF NEW.manual_subscription_exempt IS TRUE AND jwt_role IS DISTINCT FROM 'service_role' THEN
      RAISE EXCEPTION 'manual_subscription_exempt can only be set server-side'
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.manual_subscription_exempt IS DISTINCT FROM OLD.manual_subscription_exempt THEN
    IF jwt_role IS DISTINCT FROM 'service_role' THEN
      RAISE EXCEPTION 'manual_subscription_exempt can only be changed server-side'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_guard_manual_subscription_exempt ON public.profiles;
CREATE TRIGGER trg_profiles_guard_manual_subscription_exempt
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.profiles_guard_manual_subscription_exempt();
