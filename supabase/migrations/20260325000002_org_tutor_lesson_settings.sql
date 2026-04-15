-- Org-level: may org tutors edit lesson/subject pricing (Pamokų nustatymai).
-- Optional sync: when org changes payment model flags, push to all tutors in that org.

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS org_tutors_can_edit_lesson_settings boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.organizations.org_tutors_can_edit_lesson_settings IS
  'If true, org tutors may edit subjects/prices in Pamokų nustatymai; if false, only org admin / lesson defaults apply.';

-- Keep org tutors'' profiles.enable_* in sync with organization (for per-lesson / packages / monthly UI)
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
  ) THEN
    UPDATE public.profiles p
    SET
      enable_per_lesson = NEW.enable_per_lesson,
      enable_monthly_billing = NEW.enable_monthly_billing,
      enable_prepaid_packages = NEW.enable_prepaid_packages
    WHERE p.organization_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_org_payment_flags ON public.organizations;
CREATE TRIGGER trg_sync_org_payment_flags
  AFTER UPDATE ON public.organizations
  FOR EACH ROW
  EXECUTE PROCEDURE public.sync_org_payment_flags_to_org_tutors();
