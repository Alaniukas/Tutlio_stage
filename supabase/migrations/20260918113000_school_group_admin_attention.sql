-- Teachers can request an administrator decision from the group editor. The
-- dashboard reads the live unresolved flag; an administrator save resolves it.

ALTER TABLE public.school_class_groups
  ADD COLUMN IF NOT EXISTS admin_action_required boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS admin_action_note text,
  ADD COLUMN IF NOT EXISTS admin_action_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS admin_action_requested_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS admin_action_resolved_at timestamptz,
  ADD COLUMN IF NOT EXISTS admin_action_resolved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_school_class_groups_admin_attention
  ON public.school_class_groups (organization_id, admin_action_requested_at DESC)
  WHERE admin_action_required = true;

COMMENT ON COLUMN public.school_class_groups.admin_action_required IS
  'Live teacher request for an organization administrator decision; cleared when an administrator saves the group.';
