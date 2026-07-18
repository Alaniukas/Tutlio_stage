-- Org-admin-entered weekly availability windows for a student ("kada mokiniui
-- tinka pamokos"). Stored as JSONB on students so every duplicate row of one
-- student identity (multi-tutor model: one row per tutor pairing sharing
-- linked_user_id) is self-describing; the app keeps the value in sync across
-- the identity group on save.

ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS preferred_availability jsonb DEFAULT NULL;

COMMENT ON COLUMN public.students.preferred_availability IS
  'Weekly time windows that suit the student: [{"day_of_week":1,"start_time":"16:00","end_time":"20:00"},...] (day_of_week 0=Sunday..6=Saturday). Maintained by org admins in the student card; kept in sync across duplicate rows sharing linked_user_id. Used to prefill the free-time tutor search.';
