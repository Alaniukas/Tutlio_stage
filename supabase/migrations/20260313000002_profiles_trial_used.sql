-- One free trial per account: track whether this profile has ever used a trial
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS trial_used boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.profiles.trial_used IS 'True if this account has already used the 7-day free trial (one per account).';
