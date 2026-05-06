-- Enable storage-backed whiteboard image assets.
-- Keep JSON scenes, but allow image blobs under <session_id>/files/<file_id>.

UPDATE storage.buckets
SET
  file_size_limit = 52428800,
  allowed_mime_types = ARRAY[
    'application/json',
    'image/png',
    'image/jpeg',
    'image/webp',
    'image/gif',
    'image/svg+xml'
  ]
WHERE id = 'whiteboard-data';
