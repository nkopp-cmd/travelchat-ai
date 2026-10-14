-- Isolated fresh preview storage only. No external delivery or historical consent.
CREATE TABLE preview_push_subscriptions (
  endpointSha256 TEXT PRIMARY KEY CHECK (length(endpointSha256) = 64 AND endpointSha256 NOT GLOB '*[^0-9a-f]*'),
  ownerId TEXT NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL CHECK (length(endpoint) BETWEEN 1 AND 2048),
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL
);
CREATE INDEX preview_push_subscriptions_owner ON preview_push_subscriptions(ownerId);
