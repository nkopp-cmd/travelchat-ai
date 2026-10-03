-- Isolated candidate overlay. Imported subscriptions and source data remain immutable.
CREATE TABLE preview_subscription_state (
  ownerId TEXT PRIMARY KEY NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  stripeSubscriptionId TEXT UNIQUE NOT NULL,
  stripeCustomerId TEXT UNIQUE NOT NULL,
  tier TEXT NOT NULL CHECK(tier IN ('free','pro','premium')),
  status TEXT NOT NULL CHECK(status IN ('active','trialing','past_due','canceled','incomplete','incomplete_expired','paused')),
  currentPeriodEnd TEXT,
  cancelAtPeriodEnd INTEGER NOT NULL CHECK(cancelAtPeriodEnd IN (0,1)),
  trialEnd TEXT,
  deleted INTEGER NOT NULL CHECK(deleted IN (0,1)),
  lastCreated INTEGER NOT NULL CHECK(lastCreated>0),
  lastEventId TEXT NOT NULL REFERENCES preview_stripe_events(id)
);
CREATE TABLE preview_subscription_tombstones (
  stripeSubscriptionId TEXT PRIMARY KEY NOT NULL,
  ownerId TEXT NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  stripeCustomerId TEXT NOT NULL
);
CREATE VIEW preview_subscription_effective AS
  SELECT ownerId,tier,status,stripeCustomerId,stripeSubscriptionId,currentPeriodEnd,cancelAtPeriodEnd,trialEnd FROM preview_subscription_state
  UNION ALL
  SELECT ownerId,tier,status,stripeCustomerId,stripeSubscriptionId,currentPeriodEnd,cancelAtPeriodEnd,trialEnd
  FROM legacy_subscriptions l WHERE NOT EXISTS(SELECT 1 FROM preview_subscription_state n WHERE n.ownerId=l.ownerId);
CREATE TRIGGER preview_stripe_event_conflict BEFORE INSERT ON preview_stripe_events
WHEN EXISTS(SELECT 1 FROM preview_stripe_events e WHERE e.id=NEW.id AND
  (e.eventType<>NEW.eventType OR e.stripeCreated<>NEW.stripeCreated OR e.objectId<>NEW.objectId OR e.payloadSha256<>NEW.payloadSha256))
BEGIN SELECT RAISE(ABORT,'preview_billing_event_conflict'); END;
CREATE TRIGGER preview_subscription_binding BEFORE INSERT ON preview_subscription_state
WHEN EXISTS(SELECT 1 FROM preview_subscription_state s WHERE s.ownerId=NEW.ownerId AND
  (s.stripeCustomerId<>NEW.stripeCustomerId OR (s.stripeSubscriptionId<>NEW.stripeSubscriptionId AND s.deleted<>1)))
 OR EXISTS(SELECT 1 FROM legacy_subscriptions s WHERE
   (s.ownerId=NEW.ownerId AND ((s.stripeCustomerId IS NOT NULL AND s.stripeCustomerId<>NEW.stripeCustomerId)
     OR (s.stripeSubscriptionId IS NOT NULL AND s.stripeSubscriptionId<>NEW.stripeSubscriptionId AND s.status NOT IN ('canceled','incomplete_expired')
       AND NOT EXISTS(SELECT 1 FROM preview_subscription_state n WHERE n.ownerId=NEW.ownerId))))
   OR (s.ownerId<>NEW.ownerId AND (s.stripeCustomerId=NEW.stripeCustomerId OR s.stripeSubscriptionId=NEW.stripeSubscriptionId)))
 OR (NEW.deleted=0 AND EXISTS(SELECT 1 FROM preview_subscription_tombstones t WHERE t.stripeSubscriptionId=NEW.stripeSubscriptionId))
BEGIN SELECT RAISE(ABORT,'preview_billing_binding_conflict'); END;
CREATE TRIGGER preview_subscription_order BEFORE INSERT ON preview_subscription_state
WHEN EXISTS(SELECT 1 FROM preview_subscription_state s WHERE s.ownerId=NEW.ownerId AND s.lastCreated=NEW.lastCreated AND
  (s.stripeSubscriptionId<>NEW.stripeSubscriptionId OR s.stripeCustomerId<>NEW.stripeCustomerId OR s.tier<>NEW.tier OR s.status<>NEW.status
  OR s.currentPeriodEnd IS NOT NEW.currentPeriodEnd OR s.cancelAtPeriodEnd<>NEW.cancelAtPeriodEnd OR s.trialEnd IS NOT NEW.trialEnd OR s.deleted<>NEW.deleted))
BEGIN SELECT RAISE(ABORT,'preview_billing_order_conflict'); END;

CREATE TRIGGER preview_subscription_tombstone_binding BEFORE INSERT ON preview_subscription_tombstones
WHEN EXISTS(SELECT 1 FROM preview_subscription_state s WHERE
  (s.ownerId<>NEW.ownerId AND (s.stripeCustomerId=NEW.stripeCustomerId OR s.stripeSubscriptionId=NEW.stripeSubscriptionId))
  OR (s.ownerId=NEW.ownerId AND s.stripeCustomerId<>NEW.stripeCustomerId))
 OR EXISTS(SELECT 1 FROM legacy_subscriptions s WHERE
  (s.ownerId<>NEW.ownerId AND (s.stripeCustomerId=NEW.stripeCustomerId OR s.stripeSubscriptionId=NEW.stripeSubscriptionId))
  OR (s.ownerId=NEW.ownerId AND s.stripeCustomerId IS NOT NULL AND s.stripeCustomerId<>NEW.stripeCustomerId))
 OR EXISTS(SELECT 1 FROM preview_subscription_tombstones t WHERE t.stripeSubscriptionId=NEW.stripeSubscriptionId AND
  (t.ownerId<>NEW.ownerId OR t.stripeCustomerId<>NEW.stripeCustomerId))
BEGIN SELECT RAISE(ABORT,'preview_billing_tombstone_conflict'); END;
CREATE VIEW preview_usage_effective AS
 SELECT ownerId,usageType,periodType,periodStart,count FROM legacy_usage u
 WHERE NOT EXISTS(SELECT 1 FROM preview_story_usage s WHERE s.ownerId=u.ownerId AND s.periodStart=u.periodStart
   AND u.usageType='ai_images_generated' AND u.periodType='monthly')
 AND NOT EXISTS(SELECT 1 FROM preview_chat_usage c WHERE c.ownerId=u.ownerId AND c.periodStart=u.periodStart
   AND u.usageType='chat_messages' AND u.periodType='daily')
 UNION ALL SELECT ownerId,'ai_images_generated','monthly',periodStart,count FROM preview_story_usage
 UNION ALL SELECT ownerId,'chat_messages','daily',periodStart,count FROM preview_chat_usage;
