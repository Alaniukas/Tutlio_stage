-- Staff consent stores a short-lived private JSON stash (address / personal code)
-- and a one-time PDF-failure alert marker in the same school-contracts bucket.
-- The bucket previously allowed only PDF/DOC/DOCX, so employee submit failed
-- before answers were saved and the form showed "Nepavyko išsaugoti atsakymų".
UPDATE storage.buckets
SET allowed_mime_types = ARRAY[
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
  'application/json'
]
WHERE id = 'school-contracts';
