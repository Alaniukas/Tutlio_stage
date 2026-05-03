-- Speed up student-facing `lesson_packages` filters (header badge, schedule, dashboard):
--   WHERE student_id = ? AND paid AND active AND available_lessons > 0
CREATE INDEX IF NOT EXISTS idx_lesson_packages_student_active_paid_avail
  ON public.lesson_packages (student_id, created_at DESC)
  WHERE paid = true AND active = true AND available_lessons > 0;
