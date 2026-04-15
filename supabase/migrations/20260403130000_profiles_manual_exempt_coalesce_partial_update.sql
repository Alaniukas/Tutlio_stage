-- Dalinis profiles PATCH (tik finansų laukai) kartais palieka manual_subscription_exempt
-- kaip NULL triggerio NEW vaizde — tada IS DISTINCT FROM OLD klaidingai suveikia ir blokuoja UPDATE.
-- Sulygiuojame su OLD prieš tikrinant.

CREATE OR REPLACE FUNCTION public.profiles_guard_manual_subscription_exempt()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  jwt_role text;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    NEW.manual_subscription_exempt := COALESCE(NEW.manual_subscription_exempt, OLD.manual_subscription_exempt);
  END IF;

  jwt_role := NULL;

  BEGIN
    jwt_role := NULLIF(
      trim(both FROM (current_setting('request.jwt.claims', true)::json->>'role')),
      ''
    );
  EXCEPTION WHEN OTHERS THEN
    jwt_role := NULL;
  END;

  IF jwt_role IS NULL THEN
    BEGIN
      jwt_role := NULLIF(
        trim(both FROM coalesce(current_setting('request.jwt.claim.role', true), '')),
        ''
      );
    EXCEPTION WHEN OTHERS THEN
      jwt_role := NULL;
    END;
  END IF;

  IF jwt_role IS NULL THEN
    BEGIN
      jwt_role := NULLIF(trim(both FROM (auth.jwt()->>'role')), '');
    EXCEPTION WHEN OTHERS THEN
      jwt_role := NULL;
    END;
  END IF;

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
