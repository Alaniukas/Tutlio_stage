-- A recording in a shared group folder must be assigned to a weekly group
-- slot before a student attending only some slots can see it. The assignment
-- is explicit: Drive upload timestamps do not prove which lesson was recorded.
CREATE TABLE IF NOT EXISTS public.school_recording_file_slots (
  group_id uuid NOT NULL REFERENCES public.school_class_groups(id) ON DELETE CASCADE,
  drive_file_id text NOT NULL,
  weekday smallint NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  start_time time NOT NULL,
  assigned_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (group_id, drive_file_id)
);

CREATE INDEX IF NOT EXISTS school_recording_file_slots_group_slot_idx
  ON public.school_recording_file_slots (group_id, weekday, start_time);

ALTER TABLE public.school_recording_file_slots ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.school_recording_file_slots FROM anon, authenticated;
