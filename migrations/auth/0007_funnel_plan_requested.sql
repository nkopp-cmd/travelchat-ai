-- Push BH3 (APPROVED 2026-11-27, APPROVALS.md): add the browser funnel step 'plan_requested' (the planner's
-- Generate click). The step list is a CHECK constraint, so SQLite needs a table rebuild: copy every row into a
-- table with the widened CHECK, then swap names. The old table stays as funnel_events_daily_old for rollback.
-- The new CHECK is a superset of the old one, so the code that is live before this release keeps working.
CREATE TABLE funnel_events_daily_new (
  day TEXT NOT NULL CHECK (length(day) = 10),
  step TEXT NOT NULL CHECK (step IN ('planner_start', 'plan_requested', 'trip_generated', 'preview_view', 'checkout_start', 'checkout_paid')),
  source TEXT NOT NULL CHECK (source IN ('home', 'spots', 'pricing', 'preview', 'other', 'direct', 'stripe')),
  count INTEGER NOT NULL CHECK (count >= 1),
  PRIMARY KEY (day, step, source)
) WITHOUT ROWID;

INSERT INTO funnel_events_daily_new (day, step, source, count)
  SELECT day, step, source, count FROM funnel_events_daily;

ALTER TABLE funnel_events_daily RENAME TO funnel_events_daily_old;
ALTER TABLE funnel_events_daily_new RENAME TO funnel_events_daily;
