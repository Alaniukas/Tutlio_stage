-- Durable class-group teaching files. The browser receives upload tokens only
-- from the authorized API; listing and downloading use the authenticated proxy.
-- There are deliberately no anon/authenticated storage.objects policies for
-- this bucket. Existing policies are scoped to other bucket IDs.
CREATE TABLE IF NOT EXISTS public.school_group_material_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.school_class_groups(id) ON DELETE CASCADE,
  object_name text NOT NULL,
  file_name text NOT NULL,
  size_bytes bigint NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 10485760),
  uploaded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz,
  UNIQUE (group_id, object_name)
);

CREATE INDEX IF NOT EXISTS school_group_material_files_published_idx
  ON public.school_group_material_files (group_id, published_at DESC)
  WHERE published_at IS NOT NULL;

ALTER TABLE public.school_group_material_files ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.school_group_material_files FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.school_group_material_files TO service_role;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'school-group-materials',
  'school-group-materials',
  false,
  10485760,
  ARRAY[
    'application/pdf', 'image/png', 'image/jpeg',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain', 'application/octet-stream'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;
