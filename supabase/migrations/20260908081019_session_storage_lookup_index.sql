-- Existing Storage policies compare sessions.id::text to the folder prefix.
-- Match that expression without changing who can access any object.
CREATE INDEX IF NOT EXISTS sessions_storage_folder_lookup_idx
  ON public.sessions ((id::text)) INCLUDE (tutor_id, student_id);
