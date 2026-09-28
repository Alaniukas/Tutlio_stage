-- Publications describe Tutlio access; Google Drive objects are never deleted.
CREATE TABLE public.school_material_publications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  source text NOT NULL CHECK (source IN ('drive','session_file','session_note')),
  target_id text NOT NULL,
  file_id text NOT NULL,
  source_version text NOT NULL,
  label text NOT NULL,
  source_created_at timestamptz,
  first_published_at timestamptz NOT NULL DEFAULT now(),
  legacy_access boolean NOT NULL DEFAULT false,
  UNIQUE (organization_id,source,target_id,file_id,source_version)
);
CREATE INDEX school_material_publications_pending ON public.school_material_publications(first_published_at,id) WHERE NOT legacy_access;
CREATE INDEX school_material_publications_file ON public.school_material_publications(organization_id,source,target_id,file_id,first_published_at DESC);
CREATE TABLE public.school_material_baselines (
  organization_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  cutoff_at timestamptz NOT NULL DEFAULT now(),
  drive_offset integer NOT NULL DEFAULT 0 CHECK (drive_offset>=0),
  completed_at timestamptz,
  last_scan_at timestamptz,
  scan_offset integer NOT NULL DEFAULT 0 CHECK (scan_offset>=0)
);
CREATE TABLE public.school_material_digest_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  recipient_email text NOT NULL CHECK (recipient_email=lower(trim(recipient_email))),
  digest_date date NOT NULL,
  state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','sending','sent','skipped','review')),
  payload jsonb NOT NULL,
  provider_id text,
  attempted_at timestamptz,
  lease_at timestamptz,
  sent_at timestamptz,
  last_error text,
  UNIQUE (organization_id,recipient_email,digest_date)
);
CREATE TABLE public.school_material_digest_entries (
  publication_id uuid NOT NULL REFERENCES public.school_material_publications(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  delivery_id uuid REFERENCES public.school_material_digest_deliveries(id),
  state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','queued','sent','skipped')),
  PRIMARY KEY (publication_id,student_id)
);
CREATE INDEX school_material_digest_pending ON public.school_material_digest_entries(student_id,publication_id) WHERE state='pending';
ALTER TABLE public.school_material_publications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.school_material_baselines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.school_material_digest_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.school_material_digest_entries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.school_material_publications,public.school_material_baselines,public.school_material_digest_deliveries,public.school_material_digest_entries FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.school_material_publications,public.school_material_baselines,public.school_material_digest_deliveries,public.school_material_digest_entries TO service_role;

-- A teacher upload is published atomically with Storage metadata. Overwrites
-- receive a new version, so an old shared URL never grants a new revision.
CREATE FUNCTION public.school_capture_session_material() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_session uuid; v_org uuid; v_private boolean;
BEGIN
  IF NEW.bucket_id<>'session-files' THEN RETURN NEW; END IF;
  BEGIN v_session:=split_part(NEW.name,'/',1)::uuid;
  EXCEPTION WHEN invalid_text_representation THEN RETURN NEW; END;
  SELECT st.organization_id,coalesce(o.features->>'school_family_portal','false')='true'
  INTO v_org,v_private FROM public.sessions s JOIN public.students st ON st.id=s.student_id
    JOIN public.organizations o ON o.id=st.organization_id
  WHERE s.id=v_session AND o.entity_type='school';
  IF v_org IS NULL THEN RETURN NEW; END IF;
  INSERT INTO public.school_material_publications(organization_id,source,target_id,file_id,source_version,label,source_created_at,legacy_access)
  VALUES(v_org,'session_file',v_session::text,NEW.name,coalesce(NEW.updated_at,NEW.created_at)::text,split_part(NEW.name,'/',2),NEW.created_at,NOT v_private)
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.school_capture_session_material() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER school_session_material_publication AFTER INSERT OR UPDATE OF updated_at,name ON storage.objects FOR EACH ROW EXECUTE FUNCTION public.school_capture_session_material();

CREATE FUNCTION public.school_capture_session_note() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_org uuid;
BEGIN
  IF coalesce(NEW.tutor_comment,'')='' OR (NOT coalesce(NEW.show_comment_to_student,false) AND NOT coalesce(NEW.show_comment_to_parent,false))
    OR (TG_OP='UPDATE' AND NEW.tutor_comment IS NOT DISTINCT FROM OLD.tutor_comment
      AND NEW.show_comment_to_student IS NOT DISTINCT FROM OLD.show_comment_to_student AND NEW.show_comment_to_parent IS NOT DISTINCT FROM OLD.show_comment_to_parent)
  THEN RETURN NEW; END IF;
  SELECT st.organization_id INTO v_org FROM public.students st JOIN public.organizations o ON o.id=st.organization_id
  WHERE st.id=NEW.student_id AND o.entity_type='school' AND o.features->>'school_family_portal'='true';
  IF v_org IS NULL THEN RETURN NEW; END IF;
  INSERT INTO public.school_material_publications(organization_id,source,target_id,file_id,source_version,label,source_created_at,legacy_access)
  VALUES(v_org,'session_note',NEW.id::text,NEW.id::text||'/comment',md5(NEW.tutor_comment||coalesce(NEW.show_comment_to_student,false)::text||coalesce(NEW.show_comment_to_parent,false)::text),
    coalesce(nullif(NEW.topic,''),'Homework'),now(),false) ON CONFLICT DO NOTHING;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.school_capture_session_note() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER school_session_note_publication AFTER INSERT OR UPDATE OF tutor_comment,show_comment_to_student,show_comment_to_parent ON public.sessions
FOR EACH ROW EXECUTE FUNCTION public.school_capture_session_note();

-- Baseline existing lesson files before enabling private family access. This
-- function cannot classify files as public after the feature is enabled.
CREATE FUNCTION public.school_baseline_session_materials(p_organization_id uuid) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_count integer;
BEGIN
  IF EXISTS(SELECT 1 FROM public.organizations WHERE id=p_organization_id AND features->>'school_family_portal'='true') THEN RAISE EXCEPTION 'Disable family portal before baseline'; END IF;
  INSERT INTO public.school_material_baselines(organization_id) VALUES(p_organization_id) ON CONFLICT DO NOTHING;
  INSERT INTO public.school_material_publications(organization_id,source,target_id,file_id,source_version,label,source_created_at,first_published_at,legacy_access)
  SELECT p_organization_id,'session_file',s.id::text,obj.name,coalesce(obj.updated_at,obj.created_at)::text,
    split_part(obj.name,'/',2),obj.created_at,coalesce(obj.created_at,now()),coalesce(obj.updated_at,obj.created_at)<=b.cutoff_at
  FROM public.sessions s JOIN public.students st ON st.id=s.student_id
    JOIN storage.objects obj ON obj.bucket_id='session-files' AND split_part(obj.name,'/',1)=s.id::text
    JOIN public.school_material_baselines b ON b.organization_id=p_organization_id
  WHERE st.organization_id=p_organization_id AND s.start_time>=now()-interval '60 days'
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_count=ROW_COUNT; RETURN v_count;
END $$;
REVOKE ALL ON FUNCTION public.school_baseline_session_materials(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.school_baseline_session_materials(uuid) TO service_role;

-- The platform administrator can enable privacy only after account preparation
-- and the legacy material inventory have both completed.
CREATE FUNCTION public.school_family_portal_readiness(p_organization_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  WITH eligible AS (
    SELECT s.id,s.linked_user_id FROM public.students s
    WHERE s.organization_id=p_organization_id AND s.detached_at IS NULL
      AND coalesce(s.enrollment_status,'active')='active'
      AND EXISTS(SELECT 1 FROM public.school_contracts c WHERE c.organization_id=p_organization_id AND c.student_id=s.id
        AND c.kind='annual' AND c.signing_status='signed' AND c.archived_at IS NULL AND c.terminated_at IS NULL)
  ), pending AS (
    SELECT s.id FROM eligible s WHERE s.linked_user_id IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.school_family_guardians g
      JOIN public.school_contracts c ON c.id=g.annual_contract_id
      JOIN public.school_family_accounts child_account ON child_account.organization_id=p_organization_id
        AND child_account.user_id=s.linked_user_id AND child_account.role='student'
      JOIN public.school_family_accounts parent_account ON parent_account.organization_id=p_organization_id
        AND parent_account.user_id=g.guardian_user_id AND parent_account.role='parent'
      WHERE g.organization_id=p_organization_id AND g.student_id=s.id AND g.guardian_user_id<>s.linked_user_id
        AND c.organization_id=p_organization_id AND c.student_id=s.id AND c.kind='annual' AND c.signing_status='signed'
        AND c.archived_at IS NULL AND c.terminated_at IS NULL
        AND NOT EXISTS(SELECT 1 FROM public.students shared WHERE shared.organization_id=p_organization_id AND shared.linked_user_id=g.guardian_user_id)
        AND ((g.evidence_source='admin_verified' AND NOT EXISTS(SELECT 1 FROM public.school_contract_signatures sig
          WHERE sig.contract_id=c.id AND sig.role='parent_primary' AND sig.status='signed'))
          OR EXISTS(SELECT 1 FROM public.school_contract_signatures sig WHERE sig.id=g.signature_id
            AND sig.contract_id=c.id AND sig.role='parent_primary' AND sig.status='signed'
            AND lower(trim(sig.signer_email))=g.guardian_email
            AND lower(regexp_replace(trim(sig.signer_name),'\s+',' ','g'))=lower(regexp_replace(trim(g.guardian_name),'\s+',' ','g'))
            AND encode(sha256(convert_to(regexp_replace(trim(sig.signer_personal_code),'\s+','','g'),'UTF8')),'hex')=g.signature_personal_code_hash))
    )
  ) SELECT jsonb_build_object(
    'baselineReady',EXISTS(SELECT 1 FROM public.school_material_baselines WHERE organization_id=p_organization_id AND completed_at IS NOT NULL),
    'eligibleCount',(SELECT count(*) FROM eligible),'pendingCount',(SELECT count(*) FROM pending));
$$;
REVOKE ALL ON FUNCTION public.school_family_portal_readiness(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.school_family_portal_readiness(uuid) TO service_role;

-- Bounded fan-out, resumed by primary key rather than scanning every child.
CREATE FUNCTION public.school_pending_material_audience(p_limit integer DEFAULT 300)
RETURNS TABLE(publication_id uuid,student_id uuid) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT p.id,st.id FROM public.school_material_publications p
  JOIN public.organizations o ON o.id=p.organization_id AND o.features->>'school_family_portal'='true'
  JOIN public.students st ON st.organization_id=o.id AND st.detached_at IS NULL
    AND coalesce(st.enrollment_status,'active')='active'
  WHERE NOT p.legacy_access AND p.first_published_at>=now()-interval '30 days'
    AND (p.source<>'session_file' OR p.label NOT LIKE 'nd-%')
    AND (p.source<>'drive' OR p.source_created_at>=now()-interval '30 days')
    AND (
      (p.source IN ('session_file','session_note') AND EXISTS(SELECT 1 FROM public.sessions own_s JOIN public.sessions file_s ON file_s.id::text=p.target_id
        WHERE own_s.student_id=st.id AND (own_s.id=file_s.id OR (p.source='session_file' AND own_s.class_group_id=file_s.class_group_id AND own_s.start_time=file_s.start_time))
        AND (p.source<>'session_note' OR (CASE WHEN position('@' IN coalesce(st.email,''))>1 AND lower(trim(st.email)) NOT LIKE '%.invalid' THEN file_s.show_comment_to_student ELSE file_s.show_comment_to_parent END))
        AND (own_s.class_group_id IS NULL OR EXISTS(SELECT 1 FROM public.school_class_group_members m WHERE m.group_id=own_s.class_group_id AND m.student_id=st.id))))
      OR (p.source='drive' AND EXISTS(SELECT 1 FROM public.school_class_group_members m WHERE m.group_id::text=p.target_id AND m.student_id=st.id))
      OR (p.source='drive' AND EXISTS(SELECT 1 FROM public.recurring_individual_sessions r JOIN public.profiles t ON t.id=r.tutor_id
        WHERE 'subject:'||r.subject_id::text=p.target_id AND r.student_id=st.id AND r.active AND t.organization_id=o.id))
    ) AND NOT EXISTS(SELECT 1 FROM public.school_material_digest_entries e WHERE e.publication_id=p.id AND e.student_id=st.id)
  ORDER BY p.first_published_at,p.id,st.id LIMIT greatest(1,least(coalesce(p_limit,300),1000));
$$;
REVOKE ALL ON FUNCTION public.school_pending_material_audience(integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.school_pending_material_audience(integer) TO service_role;

-- Lease prevents parallel workers; provider idempotency covers the crash window.
CREATE FUNCTION public.school_claim_material_digest(p_delivery_id uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_id uuid;
BEGIN
  UPDATE public.school_material_digest_deliveries SET state='sending',lease_at=now(),attempted_at=coalesce(attempted_at,now())
  WHERE id=p_delivery_id AND (attempted_at IS NULL OR attempted_at>now()-interval '23 hours')
    AND (state='pending' OR (state='sending' AND lease_at<now()-interval '10 minutes'))
  RETURNING id INTO v_id;
  RETURN v_id IS NOT NULL;
END $$;
REVOKE ALL ON FUNCTION public.school_claim_material_digest(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.school_claim_material_digest(uuid) TO service_role;

CREATE FUNCTION public.school_reserve_material_digest(p_org uuid,p_email text,p_date date,p_payload jsonb,p_entries jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_id uuid; v_pending integer;
BEGIN
  IF jsonb_array_length(p_entries)>1000 THEN RAISE EXCEPTION 'digest_batch_too_large'; END IF;
  IF jsonb_array_length(p_entries)=0 THEN RETURN NULL; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_to_recordset(p_entries) AS x(publication_id uuid,student_id uuid)
    LEFT JOIN public.school_material_publications p ON p.id=x.publication_id AND p.organization_id=p_org
    LEFT JOIN public.students s ON s.id=x.student_id AND s.organization_id=p_org
    WHERE p.id IS NULL OR s.id IS NULL) THEN RAISE EXCEPTION 'digest_invalid_entries'; END IF;
  -- Lock the requested entries before reserving a delivery, including midnight
  -- races. An entry already claimed on another day cannot be sent again.
  PERFORM e.publication_id FROM public.school_material_digest_entries e
    JOIN jsonb_to_recordset(p_entries) AS x(publication_id uuid,student_id uuid)
      ON e.publication_id=x.publication_id AND e.student_id=x.student_id
    ORDER BY e.publication_id,e.student_id FOR UPDATE OF e;
  SELECT id INTO v_id FROM public.school_material_digest_deliveries
    WHERE organization_id=p_org AND recipient_email=p_email AND digest_date=p_date;
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;
  SELECT count(*) INTO v_pending FROM public.school_material_digest_entries e
    JOIN jsonb_to_recordset(p_entries) AS x(publication_id uuid,student_id uuid)
      ON e.publication_id=x.publication_id AND e.student_id=x.student_id
    WHERE e.state='pending' AND e.delivery_id IS NULL;
  IF v_pending<>jsonb_array_length(p_entries) THEN RETURN NULL; END IF;
  INSERT INTO public.school_material_digest_deliveries(organization_id,recipient_email,digest_date,payload)
  VALUES(p_org,p_email,p_date,p_payload) ON CONFLICT DO NOTHING RETURNING id INTO v_id;
  IF v_id IS NULL THEN
    SELECT id INTO v_id FROM public.school_material_digest_deliveries WHERE organization_id=p_org AND recipient_email=p_email AND digest_date=p_date;
    RETURN v_id;
  END IF;
  UPDATE public.school_material_digest_entries e SET delivery_id=v_id,state='queued'
  FROM jsonb_to_recordset(p_entries) AS x(publication_id uuid,student_id uuid)
  WHERE e.publication_id=x.publication_id AND e.student_id=x.student_id AND e.state='pending';
  RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.school_reserve_material_digest(uuid,text,date,jsonb,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.school_reserve_material_digest(uuid,text,date,jsonb,jsonb) TO service_role;

-- Family join mail is delivered once, 15 minutes before the lesson; tutor timing stays independent.
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
    )
  ORDER BY lesson_session.start_time, lesson_session.id
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 250), 1), 1000);
$$;

REVOKE ALL ON FUNCTION public.get_due_session_reminder_ids(integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_due_session_reminder_ids(integer)
  TO service_role;
