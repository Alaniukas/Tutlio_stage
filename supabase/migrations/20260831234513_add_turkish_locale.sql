-- Allow Turkish UI preferences without removing any existing registered locale.
-- Local migration only; no currency, billing, RLS, or existing preference changes.
BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '30s';

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_preferred_locale_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_preferred_locale_check
  CHECK (preferred_locale IS NULL OR preferred_locale IN ('lt', 'en', 'pl', 'lv', 'ee', 'fr', 'es', 'de', 'se', 'dk', 'fi', 'no', 'nl', 'tr', 'zh-hk', 'it', 'pt', 'ro', 'cs', 'el', 'hu', 'bg', 'hr', 'sk', 'sl', 'hi', 'ko', 'ja', 'id', 'ar', 'pt-br', 'es-mx', 'fil', 'he', 'uk', 'th'));

ALTER TABLE public.organizations
  DROP CONSTRAINT IF EXISTS organizations_preferred_locale_check;
ALTER TABLE public.organizations
  ADD CONSTRAINT organizations_preferred_locale_check
  CHECK (preferred_locale IS NULL OR preferred_locale IN ('lt', 'en', 'pl', 'lv', 'ee', 'fr', 'es', 'de', 'se', 'dk', 'fi', 'no', 'nl', 'tr', 'zh-hk', 'it', 'pt', 'ro', 'cs', 'el', 'hu', 'bg', 'hr', 'sk', 'sl', 'hi', 'ko', 'ja', 'id', 'ar', 'pt-br', 'es-mx', 'fil', 'he', 'uk', 'th'));

COMMIT;
