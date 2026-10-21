-- Isolated fresh preview storage only. Signed-in affiliate click log; no historical rows, no partner calls.
CREATE TABLE preview_affiliate_clicks (
  id TEXT PRIMARY KEY CHECK (length(id) = 36),
  ownerId TEXT NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  partner TEXT NOT NULL CHECK (partner IN ('viator', 'booking', 'getyourguide', 'klook')),
  trackingId TEXT NOT NULL CHECK (length(trackingId) BETWEEN 1 AND 120),
  eventType TEXT NOT NULL CHECK (eventType IN ('click', 'view', 'conversion')),
  activityName TEXT CHECK (activityName IS NULL OR length(activityName) BETWEEN 1 AND 200),
  affiliateUrl TEXT CHECK (affiliateUrl IS NULL OR length(affiliateUrl) BETWEEN 1 AND 2048),
  userAgent TEXT CHECK (userAgent IS NULL OR length(userAgent) <= 300),
  ipHash TEXT NOT NULL CHECK (length(ipHash) <= 16),
  createdAtMs INTEGER NOT NULL CHECK (createdAtMs >= 0)
);
CREATE INDEX preview_affiliate_clicks_owner ON preview_affiliate_clicks(ownerId, createdAtMs);
