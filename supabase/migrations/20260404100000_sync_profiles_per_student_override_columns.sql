-- Keep backward compatibility between old and new per-student override column names.
-- Old:  enable_per_student_override
-- New:  enable_per_student_payment_override

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS enable_per_student_payment_override boolean NOT NULL DEFAULT false;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS enable_per_student_override boolean NOT NULL DEFAULT false;

-- Normalize existing rows so both columns hold the same value.
UPDATE public.profiles
SET
  enable_per_student_payment_override = (
    COALESCE(enable_per_student_payment_override, false)
    OR COALESCE(enable_per_student_override, false)
  ),
  enable_per_student_override = (
    COALESCE(enable_per_student_payment_override, false)
    OR COALESCE(enable_per_student_override, false)
  );

CREATE OR REPLACE FUNCTION public.sync_profiles_per_student_override_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Keep both columns in sync regardless of which one was updated by client code.
  IF NEW.enable_per_student_payment_override IS DISTINCT FROM OLD.enable_per_student_payment_override
     AND NEW.enable_per_student_override IS NOT DISTINCT FROM OLD.enable_per_student_override THEN
    NEW.enable_per_student_override := NEW.enable_per_student_payment_override;
  ELSIF NEW.enable_per_student_override IS DISTINCT FROM OLD.enable_per_student_override
     AND NEW.enable_per_student_payment_override IS NOT DISTINCT FROM OLD.enable_per_student_payment_override THEN
    NEW.enable_per_student_payment_override := NEW.enable_per_student_override;
  ELSIF NEW.enable_per_student_override IS DISTINCT FROM OLD.enable_per_student_override
     AND NEW.enable_per_student_payment_override IS DISTINCT FROM OLD.enable_per_student_payment_override THEN
    -- If both changed in one statement, prefer the canonical new column value.
    NEW.enable_per_student_override := NEW.enable_per_student_payment_override;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_profiles_per_student_override_columns ON public.profiles;

CREATE TRIGGER trg_sync_profiles_per_student_override_columns
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE PROCEDURE public.sync_profiles_per_student_override_columns();

GRANT SELECT, UPDATE ON TABLE public.profiles TO authenticated;
GRANT SELECT ON TABLE public.profiles TO anon;

NOTIFY pgrst, 'reload schema';
