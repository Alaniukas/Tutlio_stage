-- ─── Backfill: one lesson_package_items row per existing lesson_packages row ──
-- Every existing single-subject package becomes a one-item package. After this
-- backfill, every row in lesson_packages has at least one matching row in
-- lesson_package_items, so all booking-time lookups can go through items.

INSERT INTO public.lesson_package_items (
  package_id,
  subject_id,
  total_lessons,
  available_lessons,
  reserved_lessons,
  completed_lessons,
  price_per_lesson,
  total_price,
  position,
  created_at
)
SELECT
  lp.id,
  lp.subject_id,
  lp.total_lessons,
  lp.available_lessons,
  lp.reserved_lessons,
  lp.completed_lessons,
  COALESCE(lp.price_per_lesson, 0),
  COALESCE(lp.total_price, COALESCE(lp.price_per_lesson, 0) * lp.total_lessons),
  0,
  lp.created_at
FROM public.lesson_packages lp
WHERE lp.subject_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.lesson_package_items lpi WHERE lpi.package_id = lp.id
  );
