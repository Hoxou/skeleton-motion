CREATE TABLE jobs (
  id TEXT PRIMARY KEY,
  owner_hash TEXT NOT NULL,
  source TEXT NOT NULL,
  name TEXT NOT NULL,
  collection TEXT NOT NULL,
  hero_light TEXT NOT NULL,
  hero_dark TEXT,
  asset_count INTEGER NOT NULL DEFAULT 0,
  file_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE INDEX jobs_owner_created ON jobs (owner_hash, created_at DESC);
