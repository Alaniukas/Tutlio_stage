-- Mokinio priklausomybė įmonei (denormalizuota) – admin / ataskaitos pagal org_id
ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_students_organization_id ON public.students(organization_id)
  WHERE organization_id IS NOT NULL;

COMMENT ON COLUMN public.students.organization_id IS 'Įmonė, kuriai priklauso mokinys (iš korepetitoriaus org narystės); atnaujinama iš tutor ryšių.';

-- 1) Korepetitoriaus profiles.organization_id
UPDATE public.students s
SET organization_id = p.organization_id
FROM public.profiles p
WHERE p.id = s.tutor_id
  AND p.organization_id IS NOT NULL
  AND (s.organization_id IS NULL OR s.organization_id IS DISTINCT FROM p.organization_id);

-- 2) Org admin kaip tutor_id (profilis be organization_id)
UPDATE public.students s
SET organization_id = oa.organization_id
FROM public.organization_admins oa
WHERE oa.user_id = s.tutor_id
  AND s.organization_id IS NULL;

-- 3) Kvietimas (korepetitorius prisijungė per tutor_invites)
UPDATE public.students s
SET organization_id = ti.organization_id
FROM public.tutor_invites ti
WHERE ti.used_by_profile_id = s.tutor_id
  AND s.organization_id IS NULL;
