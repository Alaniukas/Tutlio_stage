-- Whitelabel branding columns for organizations.
-- Allows orgs to display their own logo, colors, and a unique login slug.

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS slug text UNIQUE,
  ADD COLUMN IF NOT EXISTS logo_url text,
  ADD COLUMN IF NOT EXISTS brand_color text DEFAULT '#6366f1',
  ADD COLUMN IF NOT EXISTS brand_color_secondary text DEFAULT '#8b5cf6';

COMMENT ON COLUMN public.organizations.slug IS 'Unique URL slug for whitelabel login (e.g. tutlio.lt/login?org=proklase)';
COMMENT ON COLUMN public.organizations.logo_url IS 'Public URL to org logo (Supabase Storage or external)';
COMMENT ON COLUMN public.organizations.brand_color IS 'Primary brand color hex (gradient start) for whitelabel UI and emails';
COMMENT ON COLUMN public.organizations.brand_color_secondary IS 'Secondary brand color hex (gradient end) for whitelabel UI';

CREATE INDEX IF NOT EXISTS idx_organizations_slug ON public.organizations (slug) WHERE slug IS NOT NULL;
