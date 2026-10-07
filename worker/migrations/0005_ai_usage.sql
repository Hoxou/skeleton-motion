-- Generations made on the shared (hosted) AI key, per anonymous owner.
CREATE TABLE ai_usage (
  owner_hash TEXT PRIMARY KEY,
  hosted_uses INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);

-- Hosted AI attempts per UTC day, across everyone, to stay inside the
-- shared key's free-tier limits.
CREATE TABLE ai_daily (
  day TEXT PRIMARY KEY,
  attempts INTEGER NOT NULL DEFAULT 0
);
