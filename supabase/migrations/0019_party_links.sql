-- Phase 8d: view-only party links (QA report SEC-10).
-- The ticket token is the guest's key: it can leave the line and order. To let the rest of the
-- party follow along, each entry also gets a separate view token that can only watch the ticket
-- and play trivia.
alter table public.entries add column if not exists view_token text;
alter table public.entries alter column view_token set default replace(gen_random_uuid()::text, '-', '');
update public.entries set view_token = replace(gen_random_uuid()::text, '-', '')
 where view_token is null and status in ('waiting', 'notified');
create unique index if not exists entries_view_token_key on public.entries (view_token) where view_token is not null;
