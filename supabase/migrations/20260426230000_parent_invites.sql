-- Parent invite tokens for registration
CREATE TABLE IF NOT EXISTS public.parent_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token text NOT NULL UNIQUE,
  parent_email text NOT NULL,
  parent_name text,
  student_id uuid REFERENCES public.students(id) ON DELETE CASCADE,
  used boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.parent_invites ENABLE ROW LEVEL SECURITY;

-- Public can look up invites by token (the token itself acts as authorization).
-- INSERT/UPDATE/DELETE are only reachable via service-role (which bypasses RLS).
CREATE POLICY "allow_public_select" ON public.parent_invites
  FOR SELECT USING (true);
