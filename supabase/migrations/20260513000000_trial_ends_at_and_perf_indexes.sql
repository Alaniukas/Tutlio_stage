-- Add missing trial_ends_at column (referenced by UserContext.tsx fallback chain)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS trial_ends_at timestamptz DEFAULT NULL;

-- Performance indexes for admin-organizations stats queries
CREATE INDEX IF NOT EXISTS idx_sessions_tutor_status ON public.sessions (tutor_id, status);
CREATE INDEX IF NOT EXISTS idx_sessions_tutor_paid ON public.sessions (tutor_id, paid) WHERE status <> 'cancelled';
CREATE INDEX IF NOT EXISTS idx_students_tutor_id ON public.students (tutor_id);
CREATE INDEX IF NOT EXISTS idx_students_org_id ON public.students (organization_id);
CREATE INDEX IF NOT EXISTS idx_profiles_org_id ON public.profiles (organization_id);

-- Indexes for cron jobs (auto-complete-sessions, send-reminders, etc.)
CREATE INDEX IF NOT EXISTS idx_sessions_status_end_time ON public.sessions (status, end_time) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_sessions_status_start_time ON public.sessions (status, start_time) WHERE status = 'active';
