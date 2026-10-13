CREATE TABLE runtime_purpose (id INTEGER PRIMARY KEY CHECK (id = 1), purpose TEXT NOT NULL CHECK (purpose IN ('unset', 'localley-preview')));
INSERT INTO runtime_purpose (id, purpose) VALUES (1, 'unset');

CREATE TABLE preview_mail_jobs (id TEXT PRIMARY KEY CHECK (length(id) <= 64), urlHash TEXT NOT NULL UNIQUE CHECK (length(urlHash) = 64), purpose TEXT NOT NULL CHECK (purpose IN ('verify', 'reset')), userId TEXT NOT NULL CHECK (length(userId) BETWEEN 1 AND 128), day TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d', 'now')), state TEXT NOT NULL CHECK (state IN ('reserved', 'sending', 'accepted', 'failed', 'unknown')), messageId TEXT CHECK (length(messageId) <= 512));
CREATE INDEX preview_mail_day ON preview_mail_jobs(day);
