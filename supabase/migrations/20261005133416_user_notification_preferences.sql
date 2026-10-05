-- Personal optional alerts for every portal. Defaults preserve current delivery.
CREATE TABLE public.user_notification_preferences (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category text NOT NULL CHECK (category IN (
    'lesson_reminders', 'lesson_updates', 'lesson_feedback', 'school_materials',
    'attendance_updates', 'payment_reminders', 'payment_updates', 'messages',
    'waitlist', 'availability_changes', 'lesson_status_reminders',
    'student_assignments', 'contract_updates', 'product_updates'
  )),
  enabled boolean NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, category)
);
ALTER TABLE public.user_notification_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY user_notification_preferences_select ON public.user_notification_preferences
  FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));
REVOKE ALL ON public.user_notification_preferences FROM anon, authenticated;
GRANT SELECT ON public.user_notification_preferences TO authenticated;
GRANT ALL ON public.user_notification_preferences TO service_role;

-- Carry existing opt-outs into the shared categories, including the former
-- parent group covering lesson changes, feedback and material digests.
INSERT INTO public.user_notification_preferences(user_id, category, enabled)
SELECT p.id, mapping.category, false FROM public.profiles p
CROSS JOIN (VALUES
  ('lesson_reminder_tutor', 'lesson_reminders'),
  ('org_tutor_availability_notice', 'availability_changes'),
  ('payment_deadline_warning', 'payment_updates')
) AS mapping(legacy_key, category)
WHERE mapping.legacy_key = ANY(COALESCE(p.email_notification_opt_out, '{}'::text[]))
ON CONFLICT DO NOTHING;
INSERT INTO public.user_notification_preferences(user_id, category, enabled)
SELECT p.user_id, mapping.category, false FROM public.parent_profiles p
CROSS JOIN (VALUES
  ('lesson_reminders', 'lesson_reminders'), ('lesson_updates', 'lesson_updates'),
  ('lesson_updates', 'lesson_feedback'), ('lesson_updates', 'school_materials'),
  ('attendance_updates', 'attendance_updates'), ('payment_reminders', 'payment_reminders')
) AS mapping(legacy_key, category)
WHERE p.user_id IS NOT NULL AND (mapping.legacy_key = ANY(COALESCE(p.email_notification_opt_out, '{}'::text[]))
  OR (mapping.category = 'lesson_reminders' AND p.disable_lesson_reminders IS TRUE))
ON CONFLICT DO NOTHING;

-- This narrowly scoped setter is required to keep the server-only unsubscribe
-- table and older reminder fields in the same transaction. No user ID is accepted.
CREATE OR REPLACE FUNCTION public.set_user_notification_preference(p_category text, p_enabled boolean)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_legacy_key text;
  v_parent_opt_out text[];
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF p_enabled IS NULL OR p_category IS NULL OR p_category NOT IN (
    'lesson_reminders', 'lesson_updates', 'lesson_feedback', 'school_materials',
    'attendance_updates', 'payment_reminders', 'payment_updates', 'messages',
    'waitlist', 'availability_changes', 'lesson_status_reminders',
    'student_assignments', 'contract_updates', 'product_updates'
  ) THEN RAISE EXCEPTION 'Unknown notification preference'; END IF;

  INSERT INTO public.user_notification_preferences(user_id, category, enabled)
  VALUES (v_uid, p_category, p_enabled)
  ON CONFLICT (user_id, category) DO UPDATE
    SET enabled = EXCLUDED.enabled, updated_at = now();

  v_legacy_key := CASE p_category
    WHEN 'lesson_reminders' THEN 'lesson_reminder_tutor'
    WHEN 'availability_changes' THEN 'org_tutor_availability_notice'
    WHEN 'payment_updates' THEN 'payment_deadline_warning'
    ELSE NULL END;
  IF v_legacy_key IS NOT NULL THEN
    UPDATE public.profiles
    SET email_notification_opt_out = array_remove(COALESCE(email_notification_opt_out, '{}'::text[]), v_legacy_key)
      || CASE WHEN p_enabled THEN '{}'::text[] ELSE ARRAY[v_legacy_key] END
    WHERE id = v_uid;
  END IF;

  IF p_category = 'lesson_reminders' THEN
    SELECT email_notification_opt_out INTO v_parent_opt_out
    FROM public.parent_profiles WHERE user_id = v_uid FOR UPDATE;
    IF FOUND THEN
      PERFORM public.set_parent_notification_preferences(
        array_remove(COALESCE(v_parent_opt_out, '{}'::text[]), 'lesson_reminders')
        || CASE WHEN p_enabled THEN '{}'::text[] ELSE ARRAY['lesson_reminders'] END
      );
    END IF;
  END IF;
  RETURN p_enabled;
END;
$$;
REVOKE ALL ON FUNCTION public.set_user_notification_preference(text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_user_notification_preference(text, boolean) TO authenticated;
COMMENT ON TABLE public.user_notification_preferences IS
  'Personal optional email and push categories. Missing rows mean existing defaults/legacy settings; mandatory documents are excluded.';
