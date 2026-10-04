-- Only this adapter can prove state handling completed. Do not backfill old metadata.
CREATE TABLE preview_subscription_event_receipts (
  eventId TEXT PRIMARY KEY NOT NULL REFERENCES preview_stripe_events(id) ON DELETE CASCADE
);
