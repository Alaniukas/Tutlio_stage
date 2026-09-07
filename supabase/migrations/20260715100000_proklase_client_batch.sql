-- Pro Klasė client batch (Jul 15): seed reschedule flag, lock org tutor lesson
-- edit scopes, and stop forcing tutor UI locale on tutlio.com.

-- Students/parents cannot reschedule or cancel (matches disable_student_booking seed).
UPDATE public.organizations
SET features = COALESCE(features, '{}'::jsonb)
  || jsonb_build_object('disable_student_reschedule_cancel', true)
WHERE lower(trim(name)) = lower('Pro Klasė');

-- Org tutors must not see or edit internal policy blocks (cancellation, booking, break, reminders).
UPDATE public.organizations
SET
  org_tutors_can_edit_lesson_settings = false,
  org_tutor_lesson_edit = jsonb_build_object(
    'subjects_pricing', false,
    'subjects', false,
    'pricing', false,
    'cancellation', false,
    'registration', false,
    'break_between_lessons', false,
    'min_booking_hours', false,
    'reminders', false
  )
WHERE lower(trim(name)) = lower('Pro Klasė');

-- Let tutlio.com follow landing-page / localStorage choice instead of org-seeded LT.
UPDATE public.profiles p
SET preferred_locale = NULL
FROM public.organizations o
WHERE p.organization_id = o.id
  AND lower(trim(o.name)) = lower('Pro Klasė')
  AND p.preferred_locale = 'lt';
