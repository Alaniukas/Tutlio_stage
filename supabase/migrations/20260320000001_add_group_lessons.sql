-- Add group lesson support to subjects table
ALTER TABLE subjects
ADD COLUMN is_group BOOLEAN DEFAULT FALSE,
ADD COLUMN max_students INTEGER;

-- Add available_spots to sessions table for tracking group lesson capacity
ALTER TABLE sessions
ADD COLUMN available_spots INTEGER;

-- Add comment
COMMENT ON COLUMN subjects.is_group IS 'Whether this subject is for group lessons';
COMMENT ON COLUMN subjects.max_students IS 'Maximum number of students allowed in group lessons for this subject';
COMMENT ON COLUMN sessions.available_spots IS 'Remaining available spots for group lessons (null for individual lessons)';

-- Create index for efficient group lesson queries
CREATE INDEX IF NOT EXISTS idx_sessions_available_spots ON sessions(available_spots) WHERE available_spots IS NOT NULL;
