-- Org finance settings: payment timing/deadline at organization level
-- and automatic sync to org tutors' profile-level payment settings.

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS payment_timing text
  CHECK (payment_timing IN ('before_lesson', 'after_lesson'))
  DEFAULT 'before_lesson',
  ADD COLUMN IF NOT EXISTS payment_deadline_hours integer DEFAULT 24;

-- Recreate sync trigger function to also propagate payment timing settings.
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
  ) THEN
    UPDATE public.profiles p
    SET
      enable_per_lesson = NEW.enable_per_lesson,
      enable_monthly_billing = NEW.enable_monthly_billing,
      enable_prepaid_packages = NEW.enable_prepaid_packages,
      payment_timing = COALESCE(NEW.payment_timing, 'before_lesson'),
      payment_deadline_hours = COALESCE(NEW.payment_deadline_hours, 24)
    WHERE p.organization_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;
