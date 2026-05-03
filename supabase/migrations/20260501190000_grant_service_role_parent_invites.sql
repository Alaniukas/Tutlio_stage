-- Ensure API routes using SUPABASE_SERVICE_ROLE_KEY can write parent_invites.
-- RLS is enabled; service_role bypasses RLS, but still needs GRANT at DB layer.

GRANT ALL PRIVILEGES ON TABLE public.parent_invites TO service_role;

