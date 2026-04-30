-- Make school-contracts bucket PRIVATE so files are only accessible via signed URLs.
-- Previously the bucket was public, meaning anyone with a file URL could read contracts.
UPDATE storage.buckets SET public = false WHERE id = 'school-contracts';
