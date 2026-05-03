-- =============================================================================
-- Tutlio: el. paštų sąrašai produktų / release laiškams
-- Paleiskite Supabase Dashboard → SQL Editor.
--
-- SVARBU: Jei čia keli SELECT viename lange, Editor dažnai rodo TIK PASKUTINIO
-- rezultatą. Todėl žemiau – VIENA užklausa (UNION ALL) su stulpeliu `segment`,
-- kad matytumėte visus kontaktus vienu paleidimu.
-- =============================================================================

SELECT segment, email, detail_1, detail_2
FROM (
  -- 1) Mokiniai + mokėtojai
  SELECT DISTINCT
    'payers_students'::text AS segment,
    lower(trim(x.e)) AS email,
    x.src::text AS detail_1,
    NULL::text AS detail_2
  FROM (
    SELECT s.email::text AS e, 'student_card'::text AS src
    FROM public.students s
    WHERE s.email IS NOT NULL AND length(trim(s.email)) > 0

    UNION ALL

    SELECT s.payer_email::text, 'payer'
    FROM public.students s
    WHERE s.payer_email IS NOT NULL AND length(trim(s.payer_email)) > 0

    UNION ALL

    SELECT s.parent_secondary_email::text, 'payer_secondary'
    FROM public.students s
    WHERE s.parent_secondary_email IS NOT NULL AND length(trim(s.parent_secondary_email)) > 0

    UNION ALL

    SELECT pp.email::text, 'parent_account'
    FROM public.parent_profiles pp
    INNER JOIN public.parent_students ps ON ps.parent_id = pp.id

    UNION ALL

    SELECT au.email::text, 'student_linked_auth'
    FROM public.students s
    INNER JOIN auth.users au ON au.id = s.linked_user_id
    WHERE au.email IS NOT NULL AND length(trim(au.email::text)) > 0
  ) x(e, src)
  WHERE x.e IS NOT NULL AND x.e LIKE '%@%'

  UNION ALL

  -- 2) Individualūs korepetitoriai
  SELECT DISTINCT
    'individual_tutors'::text,
    lower(trim(p.email::text)),
    coalesce(nullif(trim(p.full_name::text), ''), '(be vardo)')::text,
    'individual_tutor'::text
  FROM public.profiles p
  INNER JOIN public.students s ON s.tutor_id = p.id
  WHERE p.organization_id IS NULL
    AND p.email IS NOT NULL
    AND length(trim(p.email::text)) > 0
    AND p.email::text LIKE '%@%'

  UNION ALL

  -- 3) Org administratoriai (iš lentelės)
  SELECT DISTINCT
    'org_admins'::text,
    lower(trim(p.email::text)),
    coalesce(nullif(trim(p.full_name::text), ''), '(be vardo)')::text,
    coalesce(o.name::text, '')
  FROM public.organization_admins oa
  INNER JOIN public.profiles p ON p.id = oa.user_id
  LEFT JOIN public.organizations o ON o.id = oa.organization_id
  WHERE p.email IS NOT NULL
    AND length(trim(p.email::text)) > 0
    AND p.email::text LIKE '%@%'
) u
ORDER BY segment, email;

-- -----------------------------------------------------------------------------
-- Org admin masinis laiškas (send-release-letters.ts): tik
--   info@mokslovaisiai.lt, info@mokumoko.lt
-- Papildomas neįtraukimas tėvams/korep.: info@sutelktosmintys.lt (+ env RELEASE_LETTER_BLOCKLIST).
-- Tas pats adresas keliose auditorijose (--audience=all): vienas laiškas (pirmenybė: tėvai → korep. → org).
-- -----------------------------------------------------------------------------
