-- A Drive folder is a server-side integration secret, not group metadata.
-- Keep it in a separate table so students/parents cannot discover folder IDs
-- through the existing school_class_groups SELECT policies.
CREATE TABLE IF NOT EXISTS public.school_recording_drive_folders (
  group_id uuid PRIMARY KEY REFERENCES public.school_class_groups(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  drive_folder_id text NOT NULL CHECK (length(trim(drive_folder_id)) > 5),
  drive_folder_name text,
  configured_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- A folder can belong to exactly one Tutlio group across all tenants. This
  -- prevents an accidentally reused/leaked folder ID from crossing schools.
  UNIQUE (drive_folder_id)
);

CREATE INDEX IF NOT EXISTS idx_school_recording_drive_folders_org
  ON public.school_recording_drive_folders(organization_id);

ALTER TABLE public.school_recording_drive_folders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS school_recording_drive_folders_admin_all
  ON public.school_recording_drive_folders;
CREATE POLICY school_recording_drive_folders_admin_all
  ON public.school_recording_drive_folders
  FOR ALL
  USING (public.is_school_admin(organization_id))
  WITH CHECK (public.is_school_admin(organization_id));

GRANT SELECT, INSERT, UPDATE, DELETE
  ON public.school_recording_drive_folders TO authenticated;

COMMENT ON TABLE public.school_recording_drive_folders IS
  'Server-side mapping between a school class group and its private Google Drive recordings folder.';
