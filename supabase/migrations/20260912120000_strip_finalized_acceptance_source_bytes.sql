-- Drop frozen extra-lessons DOCX/PDF bytes after the final PDF is in Storage.
-- Safe: processAcceptanceJob never reconverts once finalized_at is set; confirmation
-- and invite retries download the PDF from school-contracts. Keep source.kind.
update public.school_acceptance_jobs
set payload = jsonb_set(payload, '{source}', (payload->'source') - 'base64', true)
where finalized_at is not null
  and payload ? 'source'
  and (payload->'source') ? 'base64';
