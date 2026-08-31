-- Mokslo vaisiai students can request account deletion (archive + 14 working days).
ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS deletion_requested_at timestamptz;

COMMENT ON COLUMN public.students.deletion_requested_at IS
  'When the linked student asked to delete the account. Admins contact them; no automatic purge.';
