-- AI pre-filter for community content (shared/plans/localley-helper-community.md, Moderation item). A back-office job
-- on the agent host (scripts/community-moderation.mjs, codex exec on the subscription) reviews new rows and hides
-- what breaks the rules; admins see the verdict and reason. NULL ai_reviewed_at = not reviewed yet.
ALTER TABLE community_questions ADD COLUMN ai_reviewed_at TEXT;
ALTER TABLE community_questions ADD COLUMN ai_verdict TEXT CHECK (ai_verdict IS NULL OR ai_verdict IN ('allow', 'hide'));
ALTER TABLE community_questions ADD COLUMN ai_reason TEXT;
ALTER TABLE community_answers ADD COLUMN ai_reviewed_at TEXT;
ALTER TABLE community_answers ADD COLUMN ai_verdict TEXT CHECK (ai_verdict IS NULL OR ai_verdict IN ('allow', 'hide'));
ALTER TABLE community_answers ADD COLUMN ai_reason TEXT;
ALTER TABLE spot_tips ADD COLUMN ai_reviewed_at TEXT;
ALTER TABLE spot_tips ADD COLUMN ai_verdict TEXT CHECK (ai_verdict IS NULL OR ai_verdict IN ('allow', 'hide'));
ALTER TABLE spot_tips ADD COLUMN ai_reason TEXT;
ALTER TABLE community_trips ADD COLUMN ai_reviewed_at TEXT;
ALTER TABLE community_trips ADD COLUMN ai_verdict TEXT CHECK (ai_verdict IS NULL OR ai_verdict IN ('allow', 'hide'));
ALTER TABLE community_trips ADD COLUMN ai_reason TEXT;
CREATE INDEX community_questions_unreviewed ON community_questions (ai_reviewed_at) WHERE ai_reviewed_at IS NULL;
CREATE INDEX community_answers_unreviewed ON community_answers (ai_reviewed_at) WHERE ai_reviewed_at IS NULL;
CREATE INDEX spot_tips_unreviewed ON spot_tips (ai_reviewed_at) WHERE ai_reviewed_at IS NULL;
CREATE INDEX community_trips_unreviewed ON community_trips (ai_reviewed_at) WHERE ai_reviewed_at IS NULL;
