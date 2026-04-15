-- Ensure authenticated users have base table privileges.
-- RLS policies still decide which rows are actually accessible.

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

-- Core tutor/org tables queried by frontend pages
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.sessions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.students TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.availability TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.subjects TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.student_individual_pricing TO authenticated;

-- Supporting tables used in role/org flows
GRANT SELECT ON TABLE public.organization_admins TO authenticated;
GRANT SELECT ON TABLE public.organizations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.tutor_invites TO authenticated;
