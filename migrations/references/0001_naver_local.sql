-- Visitor-triggered reference cache only. No user, spot, auth or Supabase changes.
CREATE TABLE naver_local_cache (
  query TEXT PRIMARY KEY,
  token TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending','ok','error')),
  payload TEXT
);
CREATE INDEX naver_local_expiry ON naver_local_cache(expires_at);
CREATE TABLE naver_daily_budget (
  day TEXT PRIMARY KEY,
  calls INTEGER NOT NULL CHECK (calls BETWEEN 0 AND 2000)
);
