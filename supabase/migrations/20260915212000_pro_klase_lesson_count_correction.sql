-- Pro Klasė: the payment for this administrative duplicate was moved to its
-- replacement booking. Keep every financial field intact, but count only the
-- real lesson. The immutable ids and timestamp make this correction safe to
-- replay and prevent it from affecting another tenant's similarly named row.
UPDATE public.sessions
SET exclude_from_lesson_count = true
WHERE id = '300bd8d0-f6ee-462e-9abf-933f4a086aab'
  AND tutor_id = '1f369cd1-b8b9-4097-ae43-00d45611a44a'
  AND start_time = timestamptz '2026-09-12 13:00:00+03'
  AND exclude_from_lesson_count IS DISTINCT FROM true;
