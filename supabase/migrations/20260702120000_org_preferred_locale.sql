-- Add preferred_locale to organizations so emails and links use the org's language.
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS preferred_locale text
    DEFAULT NULL
    CHECK (preferred_locale IS NULL OR preferred_locale IN ('lt', 'en', 'pl', 'lv', 'ee', 'fr', 'es', 'de', 'se', 'dk', 'fi', 'no'));

COMMENT ON COLUMN public.organizations.preferred_locale IS
  'Default locale for emails, account-creation links, and UI sent on behalf of this organization.';
