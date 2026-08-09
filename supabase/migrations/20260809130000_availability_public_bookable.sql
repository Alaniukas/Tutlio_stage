-- Per free-time window: whether visitors may request this slot via the public
-- tutor page ("vizitinė kortelė"). Default false so existing windows stay private
-- until the tutor opts in.

ALTER TABLE public.availability
  ADD COLUMN IF NOT EXISTS public_bookable boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.availability.public_bookable IS
  'When true, derived free slots from this window appear on the published public tutor page for external enquiries.';

CREATE INDEX IF NOT EXISTS availability_tutor_public_bookable_idx
  ON public.availability (tutor_id)
  WHERE public_bookable;
