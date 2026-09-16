-- Keep completed-lesson compensation stable when a tutor profile rate changes.
ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS tutor_pay_eur_snapshot numeric(10,2);

COMMENT ON COLUMN public.sessions.tutor_pay_eur_snapshot IS
  'Tutor compensation captured when an org lesson becomes completed/no_show. NULL means the historical rate is not known yet.';

CREATE TABLE IF NOT EXISTS public.org_tutor_pay_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  changed_by uuid,
  old_base_pay_eur numeric(10,2),
  new_base_pay_eur numeric(10,2),
  old_subject_pay jsonb NOT NULL DEFAULT '{}'::jsonb,
  new_subject_pay jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.org_tutor_pay_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.org_tutor_pay_audit FROM anon, authenticated;
GRANT ALL ON TABLE public.org_tutor_pay_audit TO service_role;

CREATE INDEX IF NOT EXISTS org_tutor_pay_audit_profile_created_idx
  ON public.org_tutor_pay_audit(profile_id, created_at DESC);

CREATE OR REPLACE FUNCTION private.audit_org_tutor_pay_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
BEGIN
  IF NEW.company_commission_percent IS DISTINCT FROM OLD.company_commission_percent
     OR NEW.company_commission_by_subject IS DISTINCT FROM OLD.company_commission_by_subject THEN
    INSERT INTO public.org_tutor_pay_audit (
      profile_id,
      organization_id,
      changed_by,
      old_base_pay_eur,
      new_base_pay_eur,
      old_subject_pay,
      new_subject_pay
    ) VALUES (
      NEW.id,
      NEW.organization_id,
      auth.uid(),
      OLD.company_commission_percent,
      NEW.company_commission_percent,
      coalesce(OLD.company_commission_by_subject, '{}'::jsonb),
      coalesce(NEW.company_commission_by_subject, '{}'::jsonb)
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_audit_org_tutor_pay ON public.profiles;
CREATE TRIGGER profiles_audit_org_tutor_pay
AFTER UPDATE OF company_commission_percent, company_commission_by_subject
ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION private.audit_org_tutor_pay_change();

CREATE OR REPLACE FUNCTION private.resolve_org_tutor_session_pay(
  p_tutor_id uuid,
  p_subject_id uuid
) RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  v_base_pay numeric;
  v_subject_pay jsonb;
  v_org_id uuid;
  v_override_text text;
BEGIN
  SELECT
    p.company_commission_percent,
    p.company_commission_by_subject,
    p.organization_id
  INTO v_base_pay, v_subject_pay, v_org_id
  FROM public.profiles p
  WHERE p.id = p_tutor_id;

  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  -- Mano korepetitorius supports a different fixed tutor rate per subject.
  IF v_org_id = '2c4e4c2a-4e12-44ca-b327-d605bbb0d50b'::uuid
     AND p_subject_id IS NOT NULL THEN
    v_override_text := v_subject_pay ->> p_subject_id::text;
    IF v_override_text IS NOT NULL
       AND v_override_text ~ '^[0-9]+([.][0-9]+)?$'
       AND v_override_text::numeric > 0 THEN
      RETURN round(v_override_text::numeric, 2);
    END IF;
  END IF;

  RETURN greatest(round(coalesce(v_base_pay, 0), 2), 0);
END;
$$;

CREATE OR REPLACE FUNCTION private.capture_org_tutor_session_pay()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  v_pay numeric;
BEGIN
  IF NEW.status IN ('completed', 'no_show')
     AND (
       TG_OP = 'INSERT'
       OR NEW.tutor_pay_eur_snapshot IS NULL
       OR OLD.status NOT IN ('completed', 'no_show')
       OR NEW.tutor_id IS DISTINCT FROM OLD.tutor_id
       OR NEW.subject_id IS DISTINCT FROM OLD.subject_id
     ) THEN
    v_pay := private.resolve_org_tutor_session_pay(NEW.tutor_id, NEW.subject_id);

    -- Legacy zeroes may be accidental and are not enough evidence to freeze a
    -- historical lesson at €0. Leave them recoverable until a real rate is set.
    IF v_pay > 0 THEN
      NEW.tutor_pay_eur_snapshot := v_pay;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sessions_capture_org_tutor_pay ON public.sessions;
CREATE TRIGGER sessions_capture_org_tutor_pay
BEFORE INSERT OR UPDATE OF status, tutor_id, subject_id, tutor_pay_eur_snapshot
ON public.sessions
FOR EACH ROW
EXECUTE FUNCTION private.capture_org_tutor_session_pay();

CREATE OR REPLACE FUNCTION private.backfill_org_tutor_pay_after_profile_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
BEGIN
  IF NEW.company_commission_percent IS DISTINCT FROM OLD.company_commission_percent
     OR NEW.company_commission_by_subject IS DISTINCT FROM OLD.company_commission_by_subject THEN
    UPDATE public.sessions s
    SET tutor_pay_eur_snapshot = private.resolve_org_tutor_session_pay(s.tutor_id, s.subject_id)
    WHERE s.tutor_id = NEW.id
      AND s.status IN ('completed', 'no_show')
      AND s.tutor_pay_eur_snapshot IS NULL
      AND private.resolve_org_tutor_session_pay(s.tutor_id, s.subject_id) > 0;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_backfill_org_tutor_pay ON public.profiles;
CREATE TRIGGER profiles_backfill_org_tutor_pay
AFTER UPDATE OF company_commission_percent, company_commission_by_subject
ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION private.backfill_org_tutor_pay_after_profile_change();

-- Safe automatic backfill: freeze only currently configured positive rates.
-- Ambiguous legacy zeroes remain NULL so an administrator can restore the
-- correct rate and let the profile trigger populate those lessons afterwards.
UPDATE public.sessions s
SET tutor_pay_eur_snapshot = private.resolve_org_tutor_session_pay(s.tutor_id, s.subject_id)
WHERE s.status IN ('completed', 'no_show')
  AND s.tutor_pay_eur_snapshot IS NULL
  AND private.resolve_org_tutor_session_pay(s.tutor_id, s.subject_id) > 0;
