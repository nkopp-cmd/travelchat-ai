-- "Travelling now" (shared/plans/localley-helper-community.md phase 2): opt-in trips per city; a group is a city plus
-- an ISO week, computed from overlapping dates (no group table). D1-only like 0041/0042: not journaled.
CREATE TABLE community_trips (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  author_name TEXT NOT NULL,
  city TEXT NOT NULL,
  from_day TEXT NOT NULL CHECK (from_day GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  to_day TEXT NOT NULL CHECK (to_day GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' AND to_day >= from_day),
  note TEXT NOT NULL DEFAULT '' CHECK (length(note) <= 140),
  status TEXT NOT NULL DEFAULT 'visible' CHECK (status IN ('visible', 'hidden')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (user_id, city, from_day)
);
CREATE INDEX community_trips_city ON community_trips (city, status, to_day, from_day);
CREATE INDEX community_trips_user ON community_trips (user_id, to_day);

-- A viewer hides a person from their own lists (block). Never shown to the hidden person.
CREATE TABLE community_hidden_people (
  viewer_id TEXT NOT NULL,
  hidden_user_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (viewer_id, hidden_user_id)
);

CREATE TABLE community_trip_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  trip_id TEXT NOT NULL REFERENCES community_trips(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  reason TEXT NOT NULL CHECK (reason IN ('spam', 'abuse', 'unsafe', 'wrong', 'other')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  resolved_at TEXT,
  UNIQUE (user_id, trip_id)
);
