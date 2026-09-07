-- Org feature `auto_trial_first_lesson` (feedback item 10): when the org admin
-- creates a lesson for a student who has no lessons yet, the schedule dialog
-- defaults it to a trial lesson (org trial topic/duration/price, editable).
-- The flag itself is client-side; this migration only turns it on for
-- Pro Klasė, who requested the behavior.
UPDATE public.organizations
SET features = COALESCE(features, '{}'::jsonb)
  || jsonb_build_object('auto_trial_first_lesson', true)
WHERE lower(trim(name)) = lower('Pro Klasė');
