-- Phase 8c: trial reminder emails.
-- Remembers which reminder each restaurant has already been sent, so the daily job
-- never emails the same owner twice for the same step.
alter table public.restaurants add column if not exists trial_reminder_3d_at timestamptz;
alter table public.restaurants add column if not exists trial_reminder_1d_at timestamptz;
alter table public.restaurants add column if not exists trial_ended_email_at timestamptz;

-- The daily job looks only at restaurants whose trial ends soon or ended in the last few days.
create index if not exists restaurants_trial_ends_idx on public.restaurants (trial_ends_at) where trial_ends_at is not null;
