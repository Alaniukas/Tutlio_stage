-- NULL follows all group slots; an explicit subset limits this member's attendance.
ALTER TABLE public.school_class_group_members
  ADD COLUMN IF NOT EXISTS schedule_slots jsonb DEFAULT NULL
  CHECK (schedule_slots IS NULL OR jsonb_typeof(schedule_slots) = 'array');
