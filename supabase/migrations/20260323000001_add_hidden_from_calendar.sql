-- Add hidden_from_calendar column to sessions table
-- This field is used to hide cancelled sessions from calendar UI after 12h
-- but keep them in database for history/finance reporting

ALTER TABLE sessions
ADD COLUMN IF NOT EXISTS hidden_from_calendar BOOLEAN DEFAULT FALSE;

-- Update existing rows to have hidden_from_calendar = false (not null)
UPDATE sessions
SET hidden_from_calendar = FALSE
WHERE hidden_from_calendar IS NULL;

-- Add cancelled_at timestamp column to track when a session was cancelled
ALTER TABLE sessions
ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;

-- Add index for better query performance
CREATE INDEX IF NOT EXISTS idx_sessions_hidden_from_calendar
ON sessions(hidden_from_calendar)
WHERE hidden_from_calendar = false;

-- Add index for cancelled_at to support auto-hide after 12h
CREATE INDEX IF NOT EXISTS idx_sessions_cancelled_at
ON sessions(cancelled_at)
WHERE status = 'cancelled';
