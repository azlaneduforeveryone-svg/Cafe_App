-- Table & Bell: indexes for foreign keys flagged by the Supabase Performance Advisor.
-- Run after 0015. Safe to run twice. Small tables today, but these keep floor, kitchen,
-- trivia and staff pages fast as restaurants grow, and make deletes cheap.

create index if not exists billing_events_restaurant_idx   on public.billing_events (restaurant_id);
create index if not exists billing_events_subscription_idx on public.billing_events (subscription_id);
create index if not exists bills_table_idx                 on public.bills (table_id);
create index if not exists invoices_subscription_idx       on public.invoices (subscription_id);
create index if not exists kitchen_devices_created_by_idx  on public.kitchen_devices (created_by);
create index if not exists loyalty_events_reward_idx       on public.loyalty_events (reward_id);
create index if not exists menu_items_category_idx         on public.menu_items (category_id);
create index if not exists menu_items_upsell_idx           on public.menu_items (upsell_item_id);
create index if not exists orders_table_idx                on public.orders (table_id);
create index if not exists restaurant_tables_assigned_idx  on public.restaurant_tables (assigned_staff_id);
create index if not exists restaurants_onboarded_by_idx    on public.restaurants (onboarded_by);
create index if not exists service_alerts_table_idx        on public.service_alerts (table_id);
create index if not exists staff_invited_by_idx            on public.staff (invited_by);
create index if not exists staff_activity_staff_idx        on public.staff_activity (staff_id);
create index if not exists staff_invites_created_by_idx    on public.staff_invites (created_by);
create index if not exists staff_notifications_order_idx   on public.staff_notifications (order_id);
create index if not exists trivia_answers_player_idx       on public.trivia_answers (player_id);
create index if not exists trivia_games_table_idx          on public.trivia_games (table_id);
create index if not exists trivia_players_restaurant_idx   on public.trivia_players (restaurant_id);
