-- Speed up org tutor dashboard “recent org-admin activity” widgets (sessions + availability by created_at)
CREATE INDEX IF NOT EXISTS idx_sessions_tutor_created_org_admin
  ON public.sessions (tutor_id, created_at DESC)
  WHERE created_by_role = 'org_admin';

CREATE INDEX IF NOT EXISTS idx_availability_tutor_created_org_admin
  ON public.availability (tutor_id, created_at DESC)
  WHERE created_by_role = 'org_admin';
