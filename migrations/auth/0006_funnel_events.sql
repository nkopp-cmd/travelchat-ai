-- Planner/checkout funnel (shared/plans/localley-spot-cards-mobile.md): daily step counts per
-- coarse source. No user, session, IP, URL or itinerary data. Shares spot_card_events_budget.
CREATE TABLE IF NOT EXISTS funnel_events_daily (
  day TEXT NOT NULL CHECK (length(day) = 10),
  step TEXT NOT NULL CHECK (step IN ('planner_start', 'trip_generated', 'preview_view', 'checkout_start', 'checkout_paid')),
  source TEXT NOT NULL CHECK (source IN ('home', 'spots', 'pricing', 'preview', 'other', 'direct', 'stripe')),
  count INTEGER NOT NULL CHECK (count >= 1),
  PRIMARY KEY (day, step, source)
) WITHOUT ROWID;
