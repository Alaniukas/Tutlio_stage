-- Trial reservation hold (Pro Klase intake funnel, Phase 1, req 2)
--
-- A "soft hold" lets an org admin reserve trial lesson slot(s) before payment.
-- The hold is modelled WITHOUT touching the sessions.status CHECK constraint:
--   * status = 'active'            -> existing conflict/availability queries already block the slot
--   * payment_status = 'reserved'  -> distinguishes an unpaid hold from a confirmed lesson
--   * reservation_expires_at       -> when an unpaid hold auto-releases (cron)
--
-- On trial payment the session becomes payment_status='paid' and reservation_expires_at is cleared.
-- If unpaid past reservation_expires_at, the auto-release cron cancels the session and frees the slot.
ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS reservation_expires_at timestamptz DEFAULT NULL;

COMMENT ON COLUMN public.sessions.reservation_expires_at IS
  'When set with payment_status=''reserved'', the slot is a soft hold for an unpaid trial; auto-released after this time by /api/expire-trial-reservations.';

-- Lets the auto-release cron find expired holds efficiently.
CREATE INDEX IF NOT EXISTS idx_sessions_reservation_expiry
  ON public.sessions (reservation_expires_at)
  WHERE payment_status = 'reserved';
