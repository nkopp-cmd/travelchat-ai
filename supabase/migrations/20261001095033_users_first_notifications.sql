-- Nils authorized notification storage repair on 2026-10-01.
-- Application data stays in Supabase. No D1 cutover and no existing-row rewrite.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
CREATE TABLE public.notifications (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 clerk_user_id text NOT NULL REFERENCES public.users(clerk_id) ON DELETE CASCADE,
 type text NOT NULL CHECK (type IN ('achievement','level_up','new_spot','itinerary_shared','itinerary_liked','review_helpful','friend_request','friend_accepted','challenge_start','challenge_ending','weekly_digest','system')),
 title text NOT NULL, message text NOT NULL, data jsonb NOT NULL DEFAULT '{}',
 read boolean NOT NULL DEFAULT false, read_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX notifications_owner_created ON public.notifications(clerk_user_id, created_at DESC);
CREATE INDEX notifications_owner_unread ON public.notifications(clerk_user_id) WHERE NOT read;
CREATE TABLE public.push_subscriptions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 clerk_user_id text NOT NULL REFERENCES public.users(clerk_id) ON DELETE CASCADE,
 endpoint text NOT NULL,
 p256dh text NOT NULL, auth text NOT NULL, user_agent text,
 created_at timestamptz NOT NULL DEFAULT now(), last_used_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE (clerk_user_id, endpoint)
);
CREATE TABLE public.notification_preferences (
 clerk_user_id text PRIMARY KEY REFERENCES public.users(clerk_id) ON DELETE CASCADE,
 push_enabled boolean NOT NULL DEFAULT true, email_enabled boolean NOT NULL DEFAULT true,
 achievements boolean NOT NULL DEFAULT true, level_ups boolean NOT NULL DEFAULT true,
 new_spots boolean NOT NULL DEFAULT true, social boolean NOT NULL DEFAULT true,
 challenges boolean NOT NULL DEFAULT true, weekly_digest boolean NOT NULL DEFAULT true,
 system boolean NOT NULL DEFAULT true,
 quiet_hours_start time, quiet_hours_end time, timezone text NOT NULL DEFAULT 'UTC',
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.notifications, public.push_subscriptions, public.notification_preferences FROM PUBLIC, anon, authenticated;
GRANT SELECT, DELETE ON public.notifications TO authenticated;
GRANT UPDATE (read, read_at) ON public.notifications TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.push_subscriptions, public.notification_preferences TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications, public.push_subscriptions, public.notification_preferences TO service_role;
CREATE POLICY notifications_select ON public.notifications FOR SELECT TO authenticated USING (clerk_user_id = (SELECT auth.jwt()->>'sub'));
CREATE POLICY notifications_update ON public.notifications FOR UPDATE TO authenticated USING (clerk_user_id = (SELECT auth.jwt()->>'sub')) WITH CHECK (clerk_user_id = (SELECT auth.jwt()->>'sub'));
CREATE POLICY notifications_delete ON public.notifications FOR DELETE TO authenticated USING (clerk_user_id = (SELECT auth.jwt()->>'sub'));
CREATE POLICY push_subscriptions_owner ON public.push_subscriptions FOR ALL TO authenticated USING (clerk_user_id = (SELECT auth.jwt()->>'sub')) WITH CHECK (clerk_user_id = (SELECT auth.jwt()->>'sub'));
CREATE POLICY notification_preferences_owner ON public.notification_preferences FOR ALL TO authenticated USING (clerk_user_id = (SELECT auth.jwt()->>'sub')) WITH CHECK (clerk_user_id = (SELECT auth.jwt()->>'sub'));
-- Lazy first-read defaults avoid changing every existing user's preferences.
NOTIFY pgrst, 'reload schema';
COMMIT;
