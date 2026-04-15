-- Ensure Supabase API roles can access newly introduced billing tables.
-- Fixes: "permission denied for table lesson_packages" in server API routes.

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

GRANT ALL PRIVILEGES ON TABLE public.lesson_packages TO service_role;
GRANT ALL PRIVILEGES ON TABLE public.billing_batches TO service_role;
GRANT ALL PRIVILEGES ON TABLE public.billing_batch_sessions TO service_role;

-- App users still rely on RLS policies, but need base table privileges.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.lesson_packages TO authenticated;
GRANT SELECT ON TABLE public.lesson_packages TO anon;
