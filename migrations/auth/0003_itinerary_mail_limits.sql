-- Fixed UTC windows for explicit itinerary copies. No recipient or message data.
CREATE TABLE IF NOT EXISTS itinerary_mail_limits (
  userId TEXT PRIMARY KEY REFERENCES user(id) ON DELETE CASCADE,
  hourStart INTEGER NOT NULL,
  hourCount INTEGER NOT NULL CHECK (hourCount BETWEEN 1 AND 5),
  dayStart INTEGER NOT NULL,
  dayCount INTEGER NOT NULL CHECK (dayCount BETWEEN 1 AND 20)
);
-- Protect the auth sender's shared quota even if multiple accounts request copies.
CREATE TABLE IF NOT EXISTS itinerary_mail_global_limit (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  hourStart INTEGER NOT NULL,
  hourCount INTEGER NOT NULL CHECK (hourCount BETWEEN 1 AND 10),
  dayStart INTEGER NOT NULL,
  dayCount INTEGER NOT NULL CHECK (dayCount BETWEEN 1 AND 40)
);
