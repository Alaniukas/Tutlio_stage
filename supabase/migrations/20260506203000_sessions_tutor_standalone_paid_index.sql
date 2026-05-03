-- Dashboard “recent lesson payments” (paid, not package batch, order by start_time desc, limit small)
CREATE INDEX IF NOT EXISTS idx_sessions_tutor_standalone_paid_recent
  ON public.sessions (tutor_id, start_time DESC NULLS LAST)
  WHERE paid IS TRUE
    AND status IS DISTINCT FROM 'cancelled'
    AND lesson_package_id IS NULL
    AND payment_batch_id IS NULL;
