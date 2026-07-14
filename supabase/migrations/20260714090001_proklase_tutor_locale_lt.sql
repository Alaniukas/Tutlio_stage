-- Pro Klasė tutors work in Lithuanian: default the org and its existing tutors
-- to the 'lt' locale. Explicit per-user choices are preserved (NULL-only updates).
-- New org tutors inherit organizations.preferred_locale via /api/claim-tutor-invite.

UPDATE public.organizations
SET preferred_locale = 'lt'
WHERE (
    id = '3422031d-6e21-424d-980b-35a9c6d7b8f1'
    OR lower(trim(name)) = lower('Pro Klasė')
  )
  AND preferred_locale IS NULL;

UPDATE public.profiles p
SET preferred_locale = 'lt'
FROM public.organizations o
WHERE p.organization_id = o.id
  AND (
    o.id = '3422031d-6e21-424d-980b-35a9c6d7b8f1'
    OR lower(trim(o.name)) = lower('Pro Klasė')
  )
  AND p.preferred_locale IS NULL;
