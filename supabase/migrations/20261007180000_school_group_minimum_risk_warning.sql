ALTER TABLE public.school_class_groups
  ADD COLUMN IF NOT EXISTS minimum_risk_warning_occurrence_at timestamptz;

COMMENT ON COLUMN public.school_class_groups.minimum_risk_warning_occurrence_at IS
  'Upcoming slot start for which staff were already emailed about the group still being below minimum_active_students.';
