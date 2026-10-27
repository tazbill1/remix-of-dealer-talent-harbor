-- Offers table now holds any document sent for signature, not just offer letters.
alter table public.offers add column if not exists template_id text;
alter table public.offers add column if not exists template_name text;
alter table public.offers add column if not exists is_offer_letter boolean not null default true;
-- Optional: move the applicant to Hired when the offer letter is signed (off by default).
alter table public.messaging_settings add column if not exists hire_on_offer_signed boolean not null default false;