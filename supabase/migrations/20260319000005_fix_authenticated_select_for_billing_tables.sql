-- Allow authenticated (frontend) tutors to SELECT billing tables.
-- Without base table privileges, PostgREST returns 403 even if RLS policies exist.

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

GRANT SELECT ON TABLE public.billing_batches TO authenticated;
GRANT SELECT ON TABLE public.billing_batch_sessions TO authenticated;

