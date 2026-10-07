-- Keep legacy join-email delivery available only during an explicit account-onboarding window.
-- Private materials and guardian authorization are unchanged.
CREATE OR REPLACE FUNCTION public.get_due_session_reminder_ids(p_limit integer DEFAULT 250)
RETURNS TABLE(id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
  SELECT lesson_session.id
  FROM public.sessions lesson_session
  JOIN public.profiles tutor ON tutor.id = lesson_session.tutor_id
  JOIN public.students student ON student.id = lesson_session.student_id
  LEFT JOIN public.organizations organization ON organization.id = COALESCE(student.organization_id, tutor.organization_id)
  LEFT JOIN LATERAL (
    SELECT CASE
      WHEN organization.features->>'school_family_email_transition_until'
        ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$'
        AND pg_catalog.pg_input_is_valid(organization.features->>'school_family_email_transition_until', 'timestamptz')
      THEN (organization.features->>'school_family_email_transition_until')::timestamptz
      ELSE NULL
    END AS until
  ) family_transition ON true
  WHERE lesson_session.status = 'active'
    AND lesson_session.start_time > now()
    AND lesson_session.start_time < now() + interval '72 hours'
    AND (
      (
        lesson_session.reminder_student_sent IS NOT TRUE
        AND organization.features->>'school_family_portal' IS DISTINCT FROM 'true'
        AND COALESCE(tutor.reminder_student_hours, 2) > 0
        AND lesson_session.start_time <= now() + COALESCE(tutor.reminder_student_hours, 2) * interval '1 hour'
        AND NULLIF(btrim(student.email), '') IS NOT NULL
      )
      OR (
        lesson_session.reminder_tutor_sent IS NOT TRUE
        AND COALESCE(tutor.reminder_tutor_hours, 2) > 0
        AND lesson_session.start_time <= now() + COALESCE(tutor.reminder_tutor_hours, 2) * interval '1 hour'
        AND NULLIF(btrim(tutor.email), '') IS NOT NULL
      )
      OR (
        lesson_session.reminder_payer_sent IS NOT TRUE
        AND organization.features->>'school_family_portal' IS DISTINCT FROM 'true'
        AND COALESCE(tutor.reminder_student_hours, 2) > 0
        AND lesson_session.start_time <= now() + COALESCE(tutor.reminder_student_hours, 2) * interval '1 hour'
        AND (
          (
            (student.payment_payer = 'parent' OR NULLIF(btrim(student.email), '') IS NULL)
            AND NULLIF(btrim(student.payer_email), '') IS NOT NULL
            AND (organization.entity_type IS DISTINCT FROM 'school' OR NULLIF(btrim(student.email), '') IS NULL)
          )
          OR (
            organization.entity_type = 'school'
            AND NULLIF(btrim(student.email), '') IS NULL
            AND NULLIF(btrim(student.parent_secondary_email), '') IS NOT NULL
          )
          OR (
            organization.entity_type = 'school'
            AND COALESCE(organization.features, '{}'::jsonb) @> '{"school_compact_notifications": true}'::jsonb
            AND NULLIF(btrim(student.email), '') IS NULL
            AND NULLIF(btrim(student.payer_email), '') IS NULL
            AND NULLIF(btrim(student.parent_secondary_email), '') IS NULL
            AND EXISTS (
              SELECT 1
              FROM public.parent_students parent_link
              JOIN public.parent_profiles parent
                ON parent.id = parent_link.parent_id
              WHERE parent_link.student_id = student.id
                AND parent.disable_lesson_reminders = false
                AND NULLIF(btrim(parent.email), '') IS NOT NULL
            )
          )
          OR (
            COALESCE(organization.features, '{}'::jsonb) @> '{"flexible_invitations": true}'::jsonb
            AND (
              NULLIF(btrim(student.payer_email), '') IS NOT NULL
              OR NULLIF(btrim(student.parent_secondary_email), '') IS NOT NULL
              OR EXISTS (
                SELECT 1
                FROM public.parent_students parent_link
                JOIN public.parent_profiles parent
                  ON parent.id = parent_link.parent_id
                WHERE parent_link.student_id = student.id
                  AND parent.disable_lesson_reminders IS NOT TRUE
                  AND NULLIF(btrim(parent.email), '') IS NOT NULL
              )
            )
          )
        )
      )
      OR (
        organization.entity_type='school' AND organization.features->>'school_family_portal'='true'
        AND lesson_session.start_time<=now()+interval '15 minutes'
        AND (
          (lesson_session.reminder_student_sent IS NOT TRUE AND position('@' IN coalesce(student.email,''))>1 AND lower(trim(student.email)) NOT LIKE '%.invalid')
          OR (lesson_session.reminder_payer_sent IS NOT TRUE AND NOT (position('@' IN coalesce(student.email,''))>1 AND lower(trim(coalesce(student.email,''))) NOT LIKE '%.invalid')
            AND EXISTS (SELECT 1 FROM public.school_family_guardians g JOIN public.school_contracts c ON c.id=g.annual_contract_id
              WHERE g.organization_id=organization.id AND g.student_id=student.id AND g.guardian_user_id IS NOT NULL
                AND c.organization_id=organization.id AND c.student_id=student.id AND c.kind='annual' AND c.signing_status='signed'
                AND c.archived_at IS NULL AND c.terminated_at IS NULL
                AND NOT EXISTS(SELECT 1 FROM public.students shared WHERE shared.organization_id=organization.id AND shared.linked_user_id=g.guardian_user_id)
                AND ((g.evidence_source='admin_verified' AND NOT EXISTS (
                  SELECT 1 FROM public.school_contract_signatures signed_primary WHERE signed_primary.contract_id=c.id
                    AND signed_primary.role='parent_primary' AND signed_primary.status='signed'
                )) OR (g.evidence_source='signed_primary' AND EXISTS (
                  SELECT 1 FROM public.school_contract_signatures sig WHERE sig.id=g.signature_id
                    AND sig.contract_id=c.id AND sig.role='parent_primary' AND sig.status='signed'
                    AND lower(trim(sig.signer_email))=g.guardian_email
                    AND lower(regexp_replace(trim(sig.signer_name),'\s+',' ','g'))=lower(regexp_replace(trim(g.guardian_name),'\s+',' ','g'))
                    AND encode(sha256(convert_to(regexp_replace(trim(sig.signer_personal_code),'\s+','','g'),'UTF8')),'hex')=g.signature_personal_code_hash
                )))))
        )
      )
      OR (
        organization.entity_type = 'school'
        AND organization.features->>'school_family_portal' = 'true'
        AND lesson_session.start_time <= family_transition.until
        AND lesson_session.reminder_payer_sent IS NOT TRUE
        AND COALESCE(tutor.reminder_student_hours, 2) > 0
        AND lesson_session.start_time <= now() + COALESCE(tutor.reminder_student_hours, 2) * interval '1 hour'
        AND NOT (position('@' IN coalesce(student.email, '')) > 1
          AND lower(trim(coalesce(student.email, ''))) NOT LIKE '%.invalid')
        -- Existing parent accounts stay on the verified family route, including revoked bindings.
        AND NOT EXISTS (
          SELECT 1 FROM public.school_family_guardians guardian
          WHERE guardian.organization_id = organization.id AND guardian.student_id = student.id
            AND guardian.guardian_user_id IS NOT NULL
        )
        AND (
          (position('@' IN coalesce(student.payer_email, '')) > 1
            AND lower(trim(coalesce(student.payer_email, ''))) NOT LIKE '%.invalid')
          OR (position('@' IN coalesce(student.parent_secondary_email, '')) > 1
            AND lower(trim(coalesce(student.parent_secondary_email, ''))) NOT LIKE '%.invalid')
          OR EXISTS (
            SELECT 1 FROM public.parent_students parent_link
            JOIN public.parent_profiles parent ON parent.id = parent_link.parent_id
            WHERE parent_link.student_id = student.id AND parent.disable_lesson_reminders = false
              AND position('@' IN coalesce(parent.email, '')) > 1
              AND lower(trim(coalesce(parent.email, ''))) NOT LIKE '%.invalid'
          )
        )
      )
    )
  ORDER BY lesson_session.start_time, lesson_session.id
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 250), 1), 1000);
$$;

REVOKE ALL ON FUNCTION public.get_due_session_reminder_ids(integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_due_session_reminder_ids(integer)
  TO service_role;

-- Laisvi vaikai onboarding ends on October 21 at 23:59:59.999 Europe/Vilnius.
-- The runtime policy is organization-specific; an existing administrator-set cutoff wins.
UPDATE public.organizations
SET features = coalesce(features, '{}'::jsonb) || jsonb_build_object(
  'school_family_email_transition_until', '2026-10-21T20:59:59.999Z'
)
WHERE id = '2dd745fc-20e7-4bc1-a5cd-a89cfe22ec17'
  AND entity_type = 'school' AND features->>'school_family_portal' = 'true'
  AND NOT (coalesce(features, '{}'::jsonb) ? 'school_family_email_transition_until');
