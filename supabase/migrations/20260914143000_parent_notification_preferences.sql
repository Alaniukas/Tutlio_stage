-- Optional parent-facing email and matching PWA push categories.
-- Required account, contract, invoice and payment receipt emails are not
-- controlled by this field.
ALTER TABLE public.parent_profiles
  ADD COLUMN IF NOT EXISTS email_notification_opt_out text[] NOT NULL DEFAULT '{}';

-- Preserve the existing lesson reminder preference when moving from the old
-- one-switch UI to the category checklist.
UPDATE public.parent_profiles
SET email_notification_opt_out = array_append(email_notification_opt_out, 'lesson_reminders')
WHERE disable_lesson_reminders IS TRUE
  AND NOT ('lesson_reminders' = ANY(email_notification_opt_out));

COMMENT ON COLUMN public.parent_profiles.email_notification_opt_out IS
  'Optional parent notification categories to skip: lesson_reminders, lesson_updates, attendance_updates, payment_reminders.';

-- Save the registered parent's category checklist and keep the older
-- email-keyed unsubscribe table in sync in one transaction.
CREATE OR REPLACE FUNCTION public.set_parent_notification_preferences(p_opt_out text[])
RETURNS text[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_allowed constant text[] := ARRAY[
    'lesson_reminders',
    'lesson_updates',
    'attendance_updates',
    'payment_reminders'
  ];
  v_clean text[];
  v_email text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM unnest(COALESCE(p_opt_out, '{}'::text[])) AS requested(key)
    WHERE NOT (requested.key = ANY(v_allowed))
  ) THEN
    RAISE EXCEPTION 'Unknown parent notification preference';
  END IF;

  SELECT ARRAY(
    SELECT allowed.key
    FROM unnest(v_allowed) WITH ORDINALITY AS allowed(key, position)
    WHERE allowed.key = ANY(COALESCE(p_opt_out, '{}'::text[]))
    ORDER BY allowed.position
  ) INTO v_clean;

  SELECT lower(trim(email))
  INTO v_email
  FROM public.parent_profiles
  WHERE user_id = auth.uid()
  FOR UPDATE;

  IF v_email IS NULL THEN
    RAISE EXCEPTION 'Parent profile not found';
  END IF;

  UPDATE public.parent_profiles
  SET email_notification_opt_out = v_clean,
      disable_lesson_reminders = ('lesson_reminders' = ANY(v_clean))
  WHERE user_id = auth.uid();

  IF 'lesson_reminders' = ANY(v_clean) THEN
    INSERT INTO public.email_reminder_opt_outs(email, opted_out_at, source)
    VALUES (v_email, now(), 'parent_settings')
    ON CONFLICT (email) DO UPDATE
      SET opted_out_at = EXCLUDED.opted_out_at,
          source = EXCLUDED.source;
  ELSE
    DELETE FROM public.email_reminder_opt_outs WHERE email = v_email;
  END IF;

  RETURN v_clean;
END;
$function$;

REVOKE ALL ON FUNCTION public.set_parent_notification_preferences(text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_parent_notification_preferences(text[]) TO authenticated;
