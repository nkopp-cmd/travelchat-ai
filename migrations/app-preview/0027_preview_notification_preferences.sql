CREATE TABLE preview_notification_preferences (
  ownerId TEXT PRIMARY KEY REFERENCES owners(id) ON DELETE CASCADE,
  pushEnabled INTEGER NOT NULL DEFAULT 1 CHECK (pushEnabled IN (0,1)),
  emailEnabled INTEGER NOT NULL DEFAULT 1 CHECK (emailEnabled IN (0,1)),
  achievements INTEGER NOT NULL DEFAULT 1 CHECK (achievements IN (0,1)),
  levelUps INTEGER NOT NULL DEFAULT 1 CHECK (levelUps IN (0,1)),
  newSpots INTEGER NOT NULL DEFAULT 1 CHECK (newSpots IN (0,1)),
  social INTEGER NOT NULL DEFAULT 1 CHECK (social IN (0,1)),
  challenges INTEGER NOT NULL DEFAULT 1 CHECK (challenges IN (0,1)),
  weeklyDigest INTEGER NOT NULL DEFAULT 1 CHECK (weeklyDigest IN (0,1)),
  system INTEGER NOT NULL DEFAULT 1 CHECK (system IN (0,1)),
  quietHoursStart TEXT,
  quietHoursEnd TEXT,
  timezone TEXT NOT NULL DEFAULT 'UTC'
);
