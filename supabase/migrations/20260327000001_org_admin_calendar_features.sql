-- =====================================================
-- Org Admin Calendar Features
-- =====================================================
-- This migration adds RLS policies for org admins to manage
-- org tutor calendars (sessions and availability)
--
-- Feature flags:
-- - org_admin_calendar_view: View + create sessions
-- - org_admin_calendar_full_control: View + create/edit/delete sessions + availability
-- =====================================================

-- Helper function to check if organization has a feature enabled
CREATE OR REPLACE FUNCTION org_has_feature(org_id uuid, feature_id text)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    (features->>feature_id)::boolean,
    false
  )
  FROM organizations
  WHERE id = org_id;
$$;

-- Helper function to get current user's organization (if org admin)
CREATE OR REPLACE FUNCTION current_user_org_id()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT organization_id
  FROM organization_admins
  WHERE user_id = auth.uid()
  LIMIT 1;
$$;

-- =====================================================
-- SESSIONS POLICIES FOR ORG ADMIN
-- =====================================================

-- Policy 1: Org admin can INSERT sessions (basic feature)
-- Requires: org_admin_calendar_view OR org_admin_calendar_full_control
DROP POLICY IF EXISTS "Org admin can create org tutor sessions" ON sessions;
CREATE POLICY "Org admin can create org tutor sessions" ON sessions
  FOR INSERT
  WITH CHECK (
    tutor_id IN (
      SELECT p.id
      FROM profiles p
      INNER JOIN organization_admins oa ON oa.organization_id = p.organization_id
      WHERE oa.user_id = auth.uid()
        AND (
          org_has_feature(p.organization_id, 'org_admin_calendar_view')
          OR org_has_feature(p.organization_id, 'org_admin_calendar_full_control')
        )
    )
  );

-- Policy 2: Org admin can UPDATE sessions (premium feature)
-- Requires: org_admin_calendar_full_control
DROP POLICY IF EXISTS "Org admin can update org tutor sessions" ON sessions;
CREATE POLICY "Org admin can update org tutor sessions" ON sessions
  FOR UPDATE
  USING (
    tutor_id IN (
      SELECT p.id
      FROM profiles p
      INNER JOIN organization_admins oa ON oa.organization_id = p.organization_id
      WHERE oa.user_id = auth.uid()
        AND org_has_feature(p.organization_id, 'org_admin_calendar_full_control')
    )
  );

-- Policy 3: Org admin can DELETE sessions (premium feature)
-- Requires: org_admin_calendar_full_control
DROP POLICY IF EXISTS "Org admin can delete org tutor sessions" ON sessions;
CREATE POLICY "Org admin can delete org tutor sessions" ON sessions
  FOR DELETE
  USING (
    tutor_id IN (
      SELECT p.id
      FROM profiles p
      INNER JOIN organization_admins oa ON oa.organization_id = p.organization_id
      WHERE oa.user_id = auth.uid()
        AND org_has_feature(p.organization_id, 'org_admin_calendar_full_control')
    )
  );

-- =====================================================
-- AVAILABILITY POLICIES FOR ORG ADMIN
-- =====================================================

-- Policy 1: Org admin can view org tutor availability (already public, but explicit)
DROP POLICY IF EXISTS "Org admin can view org tutor availability" ON availability;
CREATE POLICY "Org admin can view org tutor availability" ON availability
  FOR SELECT
  USING (
    tutor_id IN (
      SELECT p.id
      FROM profiles p
      INNER JOIN organization_admins oa ON oa.organization_id = p.organization_id
      WHERE oa.user_id = auth.uid()
    )
    OR true  -- Keep public visibility
  );

-- Policy 2: Org admin can INSERT availability (premium feature)
-- Requires: org_admin_calendar_full_control
DROP POLICY IF EXISTS "Org admin can create org tutor availability" ON availability;
CREATE POLICY "Org admin can create org tutor availability" ON availability
  FOR INSERT
  WITH CHECK (
    tutor_id IN (
      SELECT p.id
      FROM profiles p
      INNER JOIN organization_admins oa ON oa.organization_id = p.organization_id
      WHERE oa.user_id = auth.uid()
        AND org_has_feature(p.organization_id, 'org_admin_calendar_full_control')
    )
  );

-- Policy 3: Org admin can UPDATE availability (premium feature)
-- Requires: org_admin_calendar_full_control
DROP POLICY IF EXISTS "Org admin can update org tutor availability" ON availability;
CREATE POLICY "Org admin can update org tutor availability" ON availability
  FOR UPDATE
  USING (
    tutor_id IN (
      SELECT p.id
      FROM profiles p
      INNER JOIN organization_admins oa ON oa.organization_id = p.organization_id
      WHERE oa.user_id = auth.uid()
        AND org_has_feature(p.organization_id, 'org_admin_calendar_full_control')
    )
  );

-- Policy 4: Org admin can DELETE availability (premium feature)
-- Requires: org_admin_calendar_full_control
DROP POLICY IF EXISTS "Org admin can delete org tutor availability" ON availability;
CREATE POLICY "Org admin can delete org tutor availability" ON availability
  FOR DELETE
  USING (
    tutor_id IN (
      SELECT p.id
      FROM profiles p
      INNER JOIN organization_admins oa ON oa.organization_id = p.organization_id
      WHERE oa.user_id = auth.uid()
        AND org_has_feature(p.organization_id, 'org_admin_calendar_full_control')
    )
  );

-- =====================================================
-- COMMENTS
-- =====================================================

COMMENT ON FUNCTION org_has_feature IS 'Check if organization has a specific feature flag enabled';
COMMENT ON FUNCTION current_user_org_id IS 'Get current authenticated user organization ID (if org admin)';
