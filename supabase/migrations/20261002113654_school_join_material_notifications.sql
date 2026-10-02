-- Keep this policy independent of account provisioning and private family ACLs.
-- Other schools can opt in through the feature registry with their own branding.
-- Reminder timing and recipients remain governed by the existing reminder settings.
UPDATE public.organizations
SET features=coalesce(features,'{}'::jsonb)||'{"school_join_and_material_notifications":true}'::jsonb
WHERE entity_type='school' AND id IN ('2dd745fc-20e7-4bc1-a5cd-a89cfe22ec17','c3a00000-7e57-4000-8000-000000000001');

ALTER TABLE public.school_material_baselines ADD COLUMN notifications_started_at timestamptz;
ALTER TABLE public.school_material_baselines ADD COLUMN legacy_inventory_started_at timestamptz;
-- Existing baselines retain their original privacy cutover. A notification-only
-- baseline will obtain its own legacy inventory cutoff if accounts are prepared later.
UPDATE public.school_material_baselines SET legacy_inventory_started_at=cutoff_at;
CREATE INDEX school_material_publications_digest_date ON public.school_material_publications(first_published_at,id);

CREATE FUNCTION public.school_start_material_notifications() RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_count integer;
BEGIN
  INSERT INTO public.school_material_baselines AS baseline(organization_id,notifications_started_at)
    SELECT id,now() FROM public.organizations
    WHERE entity_type='school' AND features->>'school_join_and_material_notifications'='true'
    ON CONFLICT(organization_id) DO UPDATE SET notifications_started_at=excluded.notifications_started_at
      WHERE baseline.notifications_started_at IS NULL;
  GET DIAGNOSTICS v_count=ROW_COUNT;
  RETURN v_count;
END $$;
REVOKE ALL ON FUNCTION public.school_start_material_notifications() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.school_start_material_notifications() TO service_role;
SELECT public.school_start_material_notifications();

CREATE OR REPLACE FUNCTION public.school_baseline_session_materials(p_organization_id uuid) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_count integer;
BEGIN
  IF EXISTS(SELECT 1 FROM public.organizations WHERE id=p_organization_id AND features->>'school_family_portal'='true') THEN RAISE EXCEPTION 'Disable family portal before baseline'; END IF;
  INSERT INTO public.school_material_baselines AS baseline(organization_id,legacy_inventory_started_at)
    VALUES(p_organization_id,now()) ON CONFLICT(organization_id) DO UPDATE SET
      cutoff_at=now(),legacy_inventory_started_at=now() WHERE baseline.legacy_inventory_started_at IS NULL;
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

CREATE OR REPLACE FUNCTION public.school_capture_session_note() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_org uuid; v_private boolean;
BEGIN
  IF coalesce(NEW.tutor_comment,'')='' OR (NOT coalesce(NEW.show_comment_to_student,false) AND NOT coalesce(NEW.show_comment_to_parent,false))
    OR (TG_OP='UPDATE' AND NEW.tutor_comment IS NOT DISTINCT FROM OLD.tutor_comment
      AND NEW.show_comment_to_student IS NOT DISTINCT FROM OLD.show_comment_to_student AND NEW.show_comment_to_parent IS NOT DISTINCT FROM OLD.show_comment_to_parent)
  THEN RETURN NEW; END IF;
  SELECT st.organization_id,coalesce(o.features->>'school_family_portal','false')='true' INTO v_org,v_private
  FROM public.students st JOIN public.organizations o ON o.id=st.organization_id
  WHERE st.id=NEW.student_id AND o.entity_type='school'
    AND (o.features->>'school_family_portal'='true' OR o.features->>'school_join_and_material_notifications'='true');
  IF v_org IS NULL THEN RETURN NEW; END IF;
  INSERT INTO public.school_material_publications(organization_id,source,target_id,file_id,source_version,label,source_created_at,legacy_access)
  VALUES(v_org,'session_note',NEW.id::text,NEW.id::text||'/comment',md5(NEW.tutor_comment||coalesce(NEW.show_comment_to_student,false)::text||coalesce(NEW.show_comment_to_parent,false)::text),
    coalesce(nullif(NEW.topic,''),'Homework'),now(),NOT v_private) ON CONFLICT DO NOTHING;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.school_capture_session_note() FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.school_pending_material_audience(p_limit integer DEFAULT 300)
RETURNS TABLE(publication_id uuid,student_id uuid) LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT p.id,st.id FROM public.school_material_publications p
  JOIN public.organizations o ON o.id=p.organization_id AND o.entity_type='school'
  LEFT JOIN public.school_material_baselines baseline ON baseline.organization_id=o.id
  JOIN public.students st ON st.organization_id=o.id AND st.detached_at IS NULL
    AND coalesce(st.enrollment_status,'active')='active'
  WHERE p.first_published_at>=now()-interval '30 days' AND (
    (o.features->>'school_family_portal'='true' AND NOT p.legacy_access)
    OR (o.features->>'school_family_portal' IS DISTINCT FROM 'true' AND o.features->>'school_join_and_material_notifications'='true'
      AND p.first_published_at>=baseline.notifications_started_at
      AND (p.source<>'drive' OR p.source_created_at>=baseline.notifications_started_at))
  )
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
