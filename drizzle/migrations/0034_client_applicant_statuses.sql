ALTER TYPE public.application_status ADD VALUE IF NOT EXISTS 'unqualified';
ALTER TYPE public.application_status ADD VALUE IF NOT EXISTS 'other_location';
ALTER TYPE public.application_status ADD VALUE IF NOT EXISTS 'hiring_event';
ALTER TYPE public.application_status ADD VALUE IF NOT EXISTS 'do_not_hire';
COMMENT ON TYPE public.application_status IS 'offer is DEPRECATED: merged into interview (Interviewing).';