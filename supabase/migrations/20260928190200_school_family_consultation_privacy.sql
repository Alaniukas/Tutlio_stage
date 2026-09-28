-- Requires 20260928190000_school_family_account_workflow.sql (live guardian evidence).
ALTER TABLE public.school_consultations
  ADD COLUMN IF NOT EXISTS target_kind text NOT NULL DEFAULT 'child',
  ADD COLUMN IF NOT EXISTS family_student_ids uuid[] NOT NULL DEFAULT '{}';

ALTER TABLE public.school_consultations ADD CONSTRAINT school_consultations_target_kind_check
  CHECK (target_kind IN ('child', 'family'));
ALTER TABLE public.school_consultations ADD CONSTRAINT school_consultations_target_students_check
  CHECK ((target_kind = 'child' AND cardinality(family_student_ids) = 0)
    OR (target_kind = 'family' AND student_id = ANY(family_student_ids)));

CREATE OR REPLACE FUNCTION public.school_family_consultations_enabled(p_organization_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM public.organizations o WHERE o.id = p_organization_id
    AND o.entity_type = 'school' AND o.features @> '{"school_family_portal":true}'::jsonb)
$$;

CREATE OR REPLACE FUNCTION public.school_family_consultation_parent(p_consultation_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.school_consultations c
    WHERE c.id = p_consultation_id AND public.school_family_consultations_enabled(c.organization_id)
      AND ((c.target_kind = 'child' AND public.school_family_is_guardian(c.organization_id, c.student_id))
        OR (c.target_kind = 'family' AND EXISTS (
          SELECT 1 FROM unnest(c.family_student_ids) child_id
          WHERE public.school_family_is_guardian(c.organization_id, child_id))))
  )
$$;

CREATE OR REPLACE FUNCTION public.school_family_consultation_specialist(p_consultation_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.school_consultations c JOIN public.profiles p ON p.id = c.tutor_id
    WHERE c.id = p_consultation_id AND c.kind = 'help_team' AND c.tutor_id = auth.uid()
      AND p.organization_id = c.organization_id AND p.help_team_category = c.help_team_category
      AND public.school_family_consultations_enabled(c.organization_id)
      AND NOT EXISTS (SELECT 1 FROM public.students s
        WHERE s.organization_id = c.organization_id AND s.linked_user_id = auth.uid())
  )
$$;

CREATE OR REPLACE FUNCTION public.school_family_consultation_booking_visible(p_consultation_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.school_consultations c WHERE c.id = p_consultation_id
      AND (public.is_school_admin(c.organization_id)
        OR public.school_family_consultation_parent(c.id)
        OR (c.tutor_id = auth.uid() AND EXISTS (
          SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.organization_id = c.organization_id)))
  )
$$;

-- Permissive parent policy supports recorded guardians even without a legacy parent_students row.
CREATE POLICY school_family_consultations_guardian_select ON public.school_consultations
  FOR SELECT TO authenticated USING (public.school_family_consultation_parent(id));
CREATE POLICY school_family_consultations_read_guard ON public.school_consultations AS RESTRICTIVE
  FOR SELECT TO authenticated USING (NOT public.school_family_consultations_enabled(organization_id)
    OR public.school_family_consultation_booking_visible(id));
-- Opted-in reservations are mutated only by the validated server API. This prevents
-- parents/admins changing the specialist or family roster to acquire private-note access.
CREATE POLICY school_family_consultations_insert_guard ON public.school_consultations AS RESTRICTIVE
  FOR INSERT TO authenticated WITH CHECK (NOT public.school_family_consultations_enabled(organization_id));
CREATE POLICY school_family_consultations_update_guard ON public.school_consultations AS RESTRICTIVE
  FOR UPDATE TO authenticated USING (NOT public.school_family_consultations_enabled(organization_id))
  WITH CHECK (NOT public.school_family_consultations_enabled(organization_id));
CREATE POLICY school_family_consultations_delete_guard ON public.school_consultations AS RESTRICTIVE
  FOR DELETE TO authenticated USING (NOT public.school_family_consultations_enabled(organization_id));

CREATE POLICY school_family_consultation_requests_guardian_select ON public.school_consultation_requests
  FOR SELECT TO authenticated USING (public.school_family_is_guardian(organization_id, student_id));
CREATE POLICY school_family_consultation_requests_read_guard ON public.school_consultation_requests AS RESTRICTIVE
  FOR SELECT TO authenticated USING (NOT public.school_family_consultations_enabled(organization_id)
    OR public.is_school_admin(organization_id) OR public.school_family_is_guardian(organization_id, student_id));
CREATE POLICY school_family_consultation_requests_insert_guard ON public.school_consultation_requests AS RESTRICTIVE
  FOR INSERT TO authenticated WITH CHECK (NOT public.school_family_consultations_enabled(organization_id));
CREATE POLICY school_family_consultation_requests_update_guard ON public.school_consultation_requests AS RESTRICTIVE
  FOR UPDATE TO authenticated USING (NOT public.school_family_consultations_enabled(organization_id))
  WITH CHECK (NOT public.school_family_consultations_enabled(organization_id));
CREATE POLICY school_family_consultation_requests_delete_guard ON public.school_consultation_requests AS RESTRICTIVE
  FOR DELETE TO authenticated USING (NOT public.school_family_consultations_enabled(organization_id));

CREATE TABLE public.school_consultation_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  consultation_id uuid NOT NULL REFERENCES public.school_consultations(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  author_user_id uuid NOT NULL REFERENCES auth.users(id),
  body text NOT NULL CHECK (length(btrim(body)) BETWEEN 1 AND 10000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (consultation_id, author_user_id)
);
ALTER TABLE public.school_consultation_notes ENABLE ROW LEVEL SECURITY;
CREATE INDEX school_consultation_notes_consultation_idx ON public.school_consultation_notes(consultation_id, created_at);

CREATE POLICY school_consultation_notes_private_read ON public.school_consultation_notes
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.school_consultations c WHERE c.id = school_consultation_notes.consultation_id
      AND c.organization_id = school_consultation_notes.organization_id AND c.kind = 'help_team')
    AND (public.school_family_consultation_parent(consultation_id) OR public.school_family_consultation_specialist(consultation_id))
  );
CREATE POLICY school_consultation_notes_specialist_insert ON public.school_consultation_notes
  FOR INSERT TO authenticated WITH CHECK (
    author_user_id = auth.uid() AND public.school_family_consultation_specialist(consultation_id)
    AND EXISTS (SELECT 1 FROM public.school_consultations c WHERE c.id = school_consultation_notes.consultation_id
      AND c.organization_id = school_consultation_notes.organization_id AND c.kind = 'help_team')
  );
CREATE POLICY school_consultation_notes_specialist_update ON public.school_consultation_notes
  FOR UPDATE TO authenticated USING (author_user_id = auth.uid() AND public.school_family_consultation_specialist(consultation_id))
  WITH CHECK (author_user_id = auth.uid() AND public.school_family_consultation_specialist(consultation_id));

CREATE OR REPLACE FUNCTION public.school_consultation_note_scope_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND (NEW.consultation_id IS DISTINCT FROM OLD.consultation_id
    OR NEW.organization_id IS DISTINCT FROM OLD.organization_id OR NEW.author_user_id IS DISTINCT FROM OLD.author_user_id) THEN
    RAISE EXCEPTION 'Consultation note scope and author cannot change';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
CREATE TRIGGER school_consultation_note_scope_guard BEFORE UPDATE ON public.school_consultation_notes
  FOR EACH ROW EXECUTE FUNCTION public.school_consultation_note_scope_guard();

REVOKE ALL ON public.school_consultation_notes FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.school_consultation_notes TO authenticated;
GRANT ALL ON public.school_consultation_notes TO service_role;
REVOKE ALL ON FUNCTION public.school_family_consultations_enabled(uuid),
  public.school_family_consultation_parent(uuid), public.school_family_consultation_specialist(uuid),
  public.school_family_consultation_booking_visible(uuid), public.school_consultation_note_scope_guard()
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.school_family_consultations_enabled(uuid),
  public.school_family_consultation_parent(uuid), public.school_family_consultation_specialist(uuid),
  public.school_family_consultation_booking_visible(uuid) TO authenticated, service_role;
