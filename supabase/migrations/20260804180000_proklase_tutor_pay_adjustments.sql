-- Pro Klasė tutor pay adjustments (penalties/bonuses) and session metadata

CREATE TABLE IF NOT EXISTS tutor_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  tutor_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  session_id uuid REFERENCES sessions(id) ON DELETE SET NULL,
  type text NOT NULL CHECK (type IN (
    'penalty_tutor_no_show',
    'penalty_missing_report',
    'penalty_manual',
    'bonus_manual'
  )),
  amount_eur numeric(10, 2) NOT NULL,
  reason text,
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  notified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tutor_adjustments_org_tutor_idx
  ON tutor_adjustments (organization_id, tutor_id, created_at DESC);

CREATE INDEX IF NOT EXISTS tutor_adjustments_session_idx
  ON tutor_adjustments (session_id)
  WHERE session_id IS NOT NULL;

ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS cancellation_reason_code text,
  ADD COLUMN IF NOT EXISTS is_makeup boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS makeup_for_session_id uuid REFERENCES sessions(id) ON DELETE SET NULL;

COMMENT ON COLUMN sessions.cancellation_reason_code IS
  'Why cancelled: tutor_no_show, student_no_show, admin, etc.';
COMMENT ON COLUMN sessions.is_makeup IS
  'Compensation lesson — client not charged, tutor still paid.';
COMMENT ON COLUMN sessions.makeup_for_session_id IS
  'Original session this makeup replaces (e.g. tutor no-show).';

ALTER TABLE tutor_adjustments ENABLE ROW LEVEL SECURITY;

CREATE POLICY tutor_adjustments_org_admin_select ON tutor_adjustments
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM organization_admins oa
      WHERE oa.user_id = auth.uid()
        AND oa.organization_id = tutor_adjustments.organization_id
    )
  );

CREATE POLICY tutor_adjustments_tutor_select ON tutor_adjustments
  FOR SELECT TO authenticated
  USING (tutor_id = auth.uid());
