-- Recording folders can belong either to a school class group or to an
-- individual recurring lesson subject. Subject scope is intentionally used
-- instead of a Drive-folder name so students cannot see another student's
-- private recordings when folders have similar titles.
ALTER TABLE public.school_recording_drive_folders
  ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS subject_id uuid REFERENCES public.subjects(id) ON DELETE CASCADE;

ALTER TABLE public.school_recording_drive_folders
  DROP CONSTRAINT IF EXISTS school_recording_drive_folders_pkey;

ALTER TABLE public.school_recording_drive_folders
  ALTER COLUMN group_id DROP NOT NULL,
  ALTER COLUMN id SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'school_recording_drive_folders_pkey'
      AND conrelid = 'public.school_recording_drive_folders'::regclass
  ) THEN
    ALTER TABLE public.school_recording_drive_folders
      ADD CONSTRAINT school_recording_drive_folders_pkey PRIMARY KEY (id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'school_recording_drive_folders_group_id_key'
      AND conrelid = 'public.school_recording_drive_folders'::regclass
  ) THEN
    ALTER TABLE public.school_recording_drive_folders
      ADD CONSTRAINT school_recording_drive_folders_group_id_key UNIQUE (group_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'school_recording_drive_folders_subject_id_key'
      AND conrelid = 'public.school_recording_drive_folders'::regclass
  ) THEN
    ALTER TABLE public.school_recording_drive_folders
      ADD CONSTRAINT school_recording_drive_folders_subject_id_key UNIQUE (subject_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'school_recording_drive_folders_one_target_check'
      AND conrelid = 'public.school_recording_drive_folders'::regclass
  ) THEN
    ALTER TABLE public.school_recording_drive_folders
      ADD CONSTRAINT school_recording_drive_folders_one_target_check
      CHECK (num_nonnulls(group_id, subject_id) = 1);
  END IF;
END $$;

COMMENT ON COLUMN public.school_recording_drive_folders.subject_id IS
  'Individual recurring lesson subject whose current tutor/students may access this folder.';
COMMENT ON TABLE public.school_recording_drive_folders IS
  'Server-side mapping between a private Drive folder and exactly one school class group or recurring individual lesson subject.';

-- A real Laisvi vaikai folder was accidentally attached to the Demo Mokykla
-- fixture. Move it to the intended live class group so the global folder-ID
-- uniqueness guard remains intact without blocking the school administrator.
DELETE FROM public.school_recording_drive_folders
WHERE organization_id = 'c3a00000-7e57-4000-8000-000000000001'
  AND drive_folder_id = '1k2MLvuly7YXWjUOgk2tGGsoL_ScqqNaS';

INSERT INTO public.school_recording_drive_folders (
  group_id,
  organization_id,
  drive_folder_id,
  drive_folder_name,
  updated_at
)
SELECT
  groups.id,
  groups.organization_id,
  '1k2MLvuly7YXWjUOgk2tGGsoL_ScqqNaS',
  'Inga Matematika 3 klasė (recurring)',
  now()
FROM public.school_class_groups groups
WHERE groups.organization_id = '2dd745fc-20e7-4bc1-a5cd-a89cfe22ec17'
  AND groups.name = 'Inga Dubovikienė Matematika 3 klasė'
ON CONFLICT (group_id) DO UPDATE SET
  organization_id = EXCLUDED.organization_id,
  drive_folder_id = EXCLUDED.drive_folder_id,
  drive_folder_name = EXCLUDED.drive_folder_name,
  updated_at = now();

-- These two folder names match one active individual subject exactly. Olga's
-- generic folder is deliberately not auto-assigned: her school has several
-- Russian individual subjects, so an administrator must choose the correct
-- student/subject target instead of broadening private access by guesswork.
INSERT INTO public.school_recording_drive_folders (
  subject_id,
  organization_id,
  drive_folder_id,
  drive_folder_name,
  updated_at
)
SELECT
  subjects.id,
  profiles.organization_id,
  folders.drive_folder_id,
  folders.drive_folder_name,
  now()
FROM (
  VALUES
    (
      'Alina Armonienė Lietuvių kalba individuali pamoka',
      '16ZPpy6FQKRhM0Ln3axYXGuVVDU9yDpHI',
      'Alina Armonienė Lietuvių kalba individuali pamoka (recurring)'
    ),
    (
      'Ieva Vedeckytė Solo muzika individuali pamoka',
      '1PSUKciB9Zo5AzVVbUKFGPHHiB-cW3gcr',
      'Ieva Vedeckytė Solo muzika individuali pamoka (recurring)'
    )
) AS folders(subject_name, drive_folder_id, drive_folder_name)
JOIN public.subjects subjects ON subjects.name = folders.subject_name
JOIN public.profiles profiles ON profiles.id = subjects.tutor_id
WHERE profiles.organization_id = '2dd745fc-20e7-4bc1-a5cd-a89cfe22ec17'
ON CONFLICT (subject_id) DO UPDATE SET
  organization_id = EXCLUDED.organization_id,
  drive_folder_id = EXCLUDED.drive_folder_id,
  drive_folder_name = EXCLUDED.drive_folder_name,
  updated_at = now();
