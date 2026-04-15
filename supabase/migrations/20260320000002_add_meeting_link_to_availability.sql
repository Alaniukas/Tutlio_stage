-- Add meeting_link to availability table so tutors can set default meeting link for availability slots
ALTER TABLE availability
ADD COLUMN meeting_link TEXT;

COMMENT ON COLUMN availability.meeting_link IS 'Default meeting link for this availability slot';
