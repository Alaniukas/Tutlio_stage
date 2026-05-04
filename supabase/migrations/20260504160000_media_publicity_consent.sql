-- Parent consent for child's image/video usage in school contracts.

ALTER TABLE public.school_contracts
  ADD COLUMN IF NOT EXISTS media_publicity_consent text;

ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS media_publicity_consent text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'school_contracts_media_publicity_consent_check'
  ) THEN
    ALTER TABLE public.school_contracts
      ADD CONSTRAINT school_contracts_media_publicity_consent_check
      CHECK (media_publicity_consent IS NULL OR media_publicity_consent IN ('agree', 'disagree'));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'students_media_publicity_consent_check'
  ) THEN
    ALTER TABLE public.students
      ADD CONSTRAINT students_media_publicity_consent_check
      CHECK (media_publicity_consent IS NULL OR media_publicity_consent IN ('agree', 'disagree'));
  END IF;
END$$;

