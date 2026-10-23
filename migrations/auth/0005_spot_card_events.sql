-- Spot-card analytics (Nils 2026-10-23: one new D1 table). Daily aggregate counts only:
-- public catalog spot id + event name, no user, session, IP, query or location data.
CREATE TABLE IF NOT EXISTS spot_card_events_daily (
  day TEXT NOT NULL CHECK (length(day) = 10),
  event TEXT NOT NULL CHECK (event IN ('card_view', 'save', 'add_to_trip', 'open_detail', 'directions')),
  spotId TEXT NOT NULL CHECK (length(spotId) BETWEEN 1 AND 128),
  count INTEGER NOT NULL CHECK (count >= 1),
  PRIMARY KEY (day, event, spotId)
) WITHOUT ROWID;
-- Hard daily ceiling on stored increments, so bots cannot drive unbounded D1 writes.
CREATE TABLE IF NOT EXISTS spot_card_events_budget (
  day TEXT PRIMARY KEY CHECK (length(day) = 10),
  total INTEGER NOT NULL CHECK (total BETWEEN 1 AND 50000)
);
