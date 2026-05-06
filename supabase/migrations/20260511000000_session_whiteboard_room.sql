-- Add whiteboard_room_id to sessions for collaborative Excalidraw whiteboard
ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS whiteboard_room_id UUID DEFAULT gen_random_uuid();

-- Backfill existing sessions
UPDATE public.sessions
  SET whiteboard_room_id = gen_random_uuid()
  WHERE whiteboard_room_id IS NULL;

-- Index for fast lookups when opening whiteboard by room ID
CREATE INDEX IF NOT EXISTS idx_sessions_whiteboard_room
  ON public.sessions (whiteboard_room_id)
  WHERE whiteboard_room_id IS NOT NULL;

-- Create storage bucket for whiteboard scene data
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  VALUES (
    'whiteboard-data',
    'whiteboard-data',
    false,
    20971520,
    ARRAY['application/json']
  )
  ON CONFLICT (id) DO NOTHING;

-- Tutor can read/write whiteboard data for their sessions
DROP POLICY IF EXISTS "Tutor manages whiteboard data" ON storage.objects;
CREATE POLICY "Tutor manages whiteboard data" ON storage.objects
  FOR ALL
  USING (
    bucket_id = 'whiteboard-data'
    AND EXISTS (
      SELECT 1 FROM public.sessions s
      WHERE s.id::text = split_part(name, '/', 1)
        AND s.tutor_id = auth.uid()
    )
  )
  WITH CHECK (
    bucket_id = 'whiteboard-data'
    AND EXISTS (
      SELECT 1 FROM public.sessions s
      WHERE s.id::text = split_part(name, '/', 1)
        AND s.tutor_id = auth.uid()
    )
  );

-- Student can read/write whiteboard data for their sessions
DROP POLICY IF EXISTS "Student manages whiteboard data" ON storage.objects;
CREATE POLICY "Student manages whiteboard data" ON storage.objects
  FOR ALL
  USING (
    bucket_id = 'whiteboard-data'
    AND EXISTS (
      SELECT 1 FROM public.sessions s
      JOIN public.students st ON st.id = s.student_id
      WHERE s.id::text = split_part(name, '/', 1)
        AND st.linked_user_id = auth.uid()
    )
  )
  WITH CHECK (
    bucket_id = 'whiteboard-data'
    AND EXISTS (
      SELECT 1 FROM public.sessions s
      JOIN public.students st ON st.id = s.student_id
      WHERE s.id::text = split_part(name, '/', 1)
        AND st.linked_user_id = auth.uid()
    )
  );

-- Org admin can read whiteboard data for sessions of their org's tutors
DROP POLICY IF EXISTS "Org admin reads whiteboard data" ON storage.objects;
CREATE POLICY "Org admin reads whiteboard data" ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'whiteboard-data'
    AND EXISTS (
      SELECT 1 FROM public.sessions s
      JOIN public.profiles p ON p.id = s.tutor_id
      JOIN public.org_admins oa ON oa.organization_id = p.organization_id
      WHERE s.id::text = split_part(name, '/', 1)
        AND oa.user_id = auth.uid()
    )
  );
