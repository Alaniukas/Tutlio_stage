-- Server-only transaction: group fields, times and membership succeed together.
CREATE OR REPLACE FUNCTION public.save_school_class_group(
  p_group_id uuid, p_organization_id uuid, p_actor_id uuid,
  p_fields jsonb, p_slots jsonb, p_members jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_group public.school_class_groups;
  v_tutor uuid := (p_fields->>'tutor_id')::uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_tutor AND organization_id = p_organization_id) THEN
    RAISE EXCEPTION 'Teacher is not in this organization' USING ERRCODE = '22023';
  END IF;
  IF p_fields->>'subject_id' IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.subjects WHERE id = (p_fields->>'subject_id')::uuid AND tutor_id = v_tutor
  ) THEN RAISE EXCEPTION 'Subject does not belong to this teacher' USING ERRCODE = '22023'; END IF;
  IF p_members IS NOT NULL AND EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_members) m
    WHERE NOT EXISTS (SELECT 1 FROM public.students s WHERE s.id = (m->>'student_id')::uuid AND s.organization_id = p_organization_id)
  ) THEN RAISE EXCEPTION 'Student is not in this organization' USING ERRCODE = '22023'; END IF;

  IF p_group_id IS NULL THEN
    INSERT INTO public.school_class_groups(organization_id, created_by, tutor_id, subject_id, name, calendar_name,
      school_year_start, school_year_end, platform, duration_minutes, meeting_link)
    VALUES (p_organization_id, p_actor_id, v_tutor, (p_fields->>'subject_id')::uuid, p_fields->>'name', p_fields->>'calendar_name',
      (p_fields->>'school_year_start')::date, (p_fields->>'school_year_end')::date, p_fields->>'platform',
      (p_fields->>'duration_minutes')::integer, p_fields->>'meeting_link') RETURNING * INTO v_group;
  ELSE
    SELECT * INTO v_group FROM public.school_class_groups WHERE id = p_group_id AND organization_id = p_organization_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Group not found' USING ERRCODE = 'P0002'; END IF;
    UPDATE public.school_class_groups SET tutor_id = v_tutor, subject_id = (p_fields->>'subject_id')::uuid,
      name = p_fields->>'name', calendar_name = p_fields->>'calendar_name', school_year_start = (p_fields->>'school_year_start')::date,
      school_year_end = (p_fields->>'school_year_end')::date, platform = p_fields->>'platform',
      duration_minutes = (p_fields->>'duration_minutes')::integer, meeting_link = p_fields->>'meeting_link', updated_at = now()
    WHERE id = v_group.id RETURNING * INTO v_group;
  END IF;

  IF p_slots IS NOT NULL THEN
    IF jsonb_typeof(p_slots) <> 'array' OR jsonb_array_length(p_slots) = 0 THEN
      RAISE EXCEPTION 'At least one group time is required' USING ERRCODE = '22023';
    END IF;
    DELETE FROM public.school_class_group_slots WHERE group_id = v_group.id;
    INSERT INTO public.school_class_group_slots(group_id, weekday, start_time, end_time)
      SELECT v_group.id, (s->>'weekday')::smallint, (s->>'start_time')::time, (s->>'end_time')::time
      FROM jsonb_array_elements(p_slots) s;
  END IF;
  IF p_members IS NOT NULL THEN
    DELETE FROM public.school_class_group_members WHERE group_id = v_group.id
      AND student_id NOT IN (SELECT (m->>'student_id')::uuid FROM jsonb_array_elements(p_members) m);
    INSERT INTO public.school_class_group_members(group_id, student_id, schedule_slots)
      SELECT v_group.id, (m->>'student_id')::uuid, nullif(m->'schedule_slots', 'null'::jsonb)
      FROM jsonb_array_elements(p_members) m
      ON CONFLICT (group_id, student_id) DO UPDATE SET schedule_slots = excluded.schedule_slots;
  END IF;
  -- Also validate preserved subsets when a teacher edits the shared timetable.
  IF EXISTS (SELECT 1 FROM public.school_class_group_members m WHERE m.group_id = v_group.id AND m.schedule_slots IS NOT NULL
    AND (jsonb_array_length(m.schedule_slots) = 0 OR EXISTS (
      SELECT 1 FROM jsonb_array_elements(m.schedule_slots) chosen WHERE NOT EXISTS (
        SELECT 1 FROM public.school_class_group_slots s WHERE s.group_id = v_group.id
          AND s.weekday = (chosen->>'weekday')::smallint AND s.start_time = (chosen->>'start_time')::time
      )
    ))) THEN RAISE EXCEPTION 'Member schedule must be a nonempty subset of group times' USING ERRCODE = '22023'; END IF;
  RETURN to_jsonb(v_group);
END $$;
REVOKE ALL ON FUNCTION public.save_school_class_group(uuid, uuid, uuid, jsonb, jsonb, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_school_class_group(uuid, uuid, uuid, jsonb, jsonb, jsonb) TO service_role;
