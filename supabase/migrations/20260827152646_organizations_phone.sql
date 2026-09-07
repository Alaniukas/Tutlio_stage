-- Extra-lessons PDF/email select organizations.phone (PostgREST 42703 without this column).
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS phone text;
