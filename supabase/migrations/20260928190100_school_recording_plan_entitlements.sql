-- Attendance remains independent of recording rights. Existing memberships keep
-- their previous selected-slot policy; no person's access is migrated or denied.
ALTER TABLE public.school_class_group_members
  ADD COLUMN IF NOT EXISTS recording_access text NOT NULL DEFAULT 'schedule';
ALTER TABLE public.school_class_group_members
  ADD COLUMN IF NOT EXISTS legacy_recording_scope jsonb DEFAULT NULL;
ALTER TABLE public.school_class_group_members
  DROP CONSTRAINT IF EXISTS school_class_group_members_recording_access_check;
ALTER TABLE public.school_class_group_members
  ADD CONSTRAINT school_class_group_members_recording_access_check
  CHECK (recording_access IN ('schedule', 'group', 'none'));
ALTER TABLE public.school_class_group_members
  DROP CONSTRAINT IF EXISTS school_class_group_members_legacy_recording_scope_check;
ALTER TABLE public.school_class_group_members
  ADD CONSTRAINT school_class_group_members_legacy_recording_scope_check CHECK (
    legacy_recording_scope IS NULL OR (
      jsonb_typeof(legacy_recording_scope) = 'object'
      AND legacy_recording_scope ? 'schedule_slots'
      AND (legacy_recording_scope->'schedule_slots' = 'null'::jsonb
        OR jsonb_typeof(legacy_recording_scope->'schedule_slots') = 'array')
    )
  );
COMMENT ON COLUMN public.school_class_group_members.recording_access IS
  'Child/group plan: schedule preserves legacy selected-slot visibility; group includes all group recordings; none excludes recordings. Explicit modes are used only by an opted-in school_family_portal school. Signed contract grants are checked live.';
COMMENT ON COLUMN public.school_class_group_members.legacy_recording_scope IS
  'Captured once when the first explicit plan is accepted. NULL means not captured; {"schedule_slots":null} preserves all former recordings and an array preserves former selected slots. New attendance cannot expand a competing legacy agreement grant.';

ALTER TABLE public.school_contracts
  DROP CONSTRAINT IF EXISTS school_contracts_recording_plan_check;
ALTER TABLE public.school_contracts
  ADD CONSTRAINT school_contracts_recording_plan_check CHECK (
    NOT (COALESCE(order_snapshot, '{}'::jsonb) ? 'recording_access')
    OR COALESCE(order_snapshot->>'recording_access' IN ('schedule', 'group', 'none'), false)
  );

CREATE INDEX IF NOT EXISTS idx_school_contracts_group_recording_grants
  ON public.school_contracts(organization_id, class_group_id, student_id)
  WHERE kind = 'extra_lessons' AND signing_status = 'signed';
