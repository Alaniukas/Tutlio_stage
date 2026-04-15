-- ─── Performance Optimization Indexes ─────────────────────────────────────────
-- Adding composite indexes to speed up common queries across the platform
-- Created: 2026-03-19

-- Sessions: Composite index for tutor + date range queries (Dashboard, Calendar)
-- This speeds up queries that filter by tutor_id and sort/filter by start_time
CREATE INDEX IF NOT EXISTS idx_sessions_tutor_start_time
ON sessions(tutor_id, start_time DESC)
WHERE status != 'cancelled';

-- Sessions: Composite index for tutor + status queries
CREATE INDEX IF NOT EXISTS idx_sessions_tutor_status
ON sessions(tutor_id, status, start_time DESC);

-- Sessions: Index for student queries with date filtering
CREATE INDEX IF NOT EXISTS idx_sessions_student_start_time
ON sessions(student_id, start_time DESC);

-- Availability: Composite index for tutor slot lookup
-- This speeds up queries when generating available time slots
CREATE INDEX IF NOT EXISTS idx_availability_tutor_recurring_dow
ON availability(tutor_id, is_recurring, day_of_week, end_date)
WHERE is_recurring = true;

CREATE INDEX IF NOT EXISTS idx_availability_tutor_specific_date
ON availability(tutor_id, specific_date)
WHERE is_recurring = false AND specific_date IS NOT NULL;

-- Student Individual Pricing: Composite index for batch lookups
CREATE INDEX IF NOT EXISTS idx_student_pricing_tutor_student
ON student_individual_pricing(tutor_id, student_id);

-- Billing Batches: Index for unpaid invoices lookup
CREATE INDEX IF NOT EXISTS idx_billing_batches_status
ON billing_batches(tutor_id, paid, created_at DESC)
WHERE paid = false;

-- Lesson Packages: Index for active packages lookup
-- (already exists: idx_lesson_packages_active, but adding comment for completeness)

-- Sessions: Index for payment status filtering (Dashboard stats)
CREATE INDEX IF NOT EXISTS idx_sessions_payment_status
ON sessions(tutor_id, payment_status, paid)
WHERE status = 'completed';

-- Comment on optimization strategy
COMMENT ON INDEX idx_sessions_tutor_start_time IS
'Composite index for fast tutor session queries with date range filtering';

COMMENT ON INDEX idx_availability_tutor_recurring_dow IS
'Optimizes recurring availability slot calculations by day of week';

COMMENT ON INDEX idx_student_pricing_tutor_student IS
'Enables batch fetching of all custom pricing for a student';
