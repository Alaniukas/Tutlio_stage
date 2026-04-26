-- Seed "Laisvi Vaikai" school: mark as school + insert 3 agreement templates.
-- Org, user, profile, and admin link were created via API; this migration
-- only handles fields and data that depend on the school-module schema.

-- Mark the org as a school (entity_type added by 20260420000001)
UPDATE public.organizations
SET entity_type = 'school'
WHERE id = '2dd745fc-20e7-4bc1-a5cd-a89cfe22ec17';

-- Insert 3 agreement templates (table + pdf_url from earlier migrations)
INSERT INTO public.school_contract_templates
  (organization_id, name, body, pdf_url)
VALUES
  (
    '2dd745fc-20e7-4bc1-a5cd-a89cfe22ec17',
    'Metinė sutartis – Pradinis ugdymas',
    '',
    'https://cuhciqwmqfuajeeqjjbm.supabase.co/storage/v1/object/public/school-contracts/2dd745fc-20e7-4bc1-a5cd-a89cfe22ec17/sutartis-pradinis-2026.docx'
  ),
  (
    '2dd745fc-20e7-4bc1-a5cd-a89cfe22ec17',
    'Metinė sutartis – Priešmokyklinis ugdymas',
    '',
    'https://cuhciqwmqfuajeeqjjbm.supabase.co/storage/v1/object/public/school-contracts/2dd745fc-20e7-4bc1-a5cd-a89cfe22ec17/sutartis-priesmokyklinis-2026.docx'
  ),
  (
    '2dd745fc-20e7-4bc1-a5cd-a89cfe22ec17',
    'Metinė sutartis – Pagrindinis ugdymas',
    '',
    'https://cuhciqwmqfuajeeqjjbm.supabase.co/storage/v1/object/public/school-contracts/2dd745fc-20e7-4bc1-a5cd-a89cfe22ec17/sutartis-pagrindinis-2026.docx'
  )
ON CONFLICT DO NOTHING;
