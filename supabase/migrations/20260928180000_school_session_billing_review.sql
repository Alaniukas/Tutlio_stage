-- Invoice exclusions are separate from attendance and preserve an immutable decision history.
CREATE TABLE IF NOT EXISTS public.school_session_billing_decisions (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  session_id uuid REFERENCES public.sessions(id) ON DELETE SET NULL,
  session_reference_id uuid NOT NULL,
  session_start_time timestamptz NOT NULL,
  excluded boolean NOT NULL,
  reason text NOT NULL CHECK (char_length(btrim(reason)) BETWEEN 3 AND 1000),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS school_session_billing_decisions_latest_idx
  ON public.school_session_billing_decisions (organization_id, student_id, session_reference_id, id DESC);

ALTER TABLE public.school_session_billing_decisions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS school_session_billing_decisions_admin_read ON public.school_session_billing_decisions;
CREATE POLICY school_session_billing_decisions_admin_read
  ON public.school_session_billing_decisions FOR SELECT
  USING (public.is_school_admin(organization_id));

REVOKE ALL ON public.school_session_billing_decisions FROM authenticated, anon;
GRANT SELECT ON public.school_session_billing_decisions TO authenticated;
REVOKE UPDATE, DELETE, TRUNCATE ON public.school_session_billing_decisions FROM service_role;
GRANT SELECT, INSERT ON public.school_session_billing_decisions TO service_role;
REVOKE ALL ON SEQUENCE public.school_session_billing_decisions_id_seq FROM authenticated, anon;
GRANT USAGE, SELECT ON SEQUENCE public.school_session_billing_decisions_id_seq TO service_role;

COMMENT ON TABLE public.school_session_billing_decisions IS
  'Append-only audited exclusions/restorations. Attendance and issued invoice history remain unchanged. Writes use the scoped finance API.';
