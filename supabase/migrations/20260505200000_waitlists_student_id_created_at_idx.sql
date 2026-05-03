-- List waitlist rows per student (parent/student portals) ORDER BY created_at — avoid seq scans.
CREATE INDEX IF NOT EXISTS idx_waitlists_student_created_at
  ON public.waitlists (student_id, created_at ASC);
