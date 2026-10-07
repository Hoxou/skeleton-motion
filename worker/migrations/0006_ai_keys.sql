-- Visitors' own AI keys, encrypted (see worker/ai/vault.js). Only the
-- ciphertext is stored: no part of the key, not even its last characters.
CREATE TABLE ai_keys (
  owner_hash TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  model TEXT,
  base_url TEXT,
  ciphertext TEXT NOT NULL,
  iv TEXT NOT NULL,
  version INTEGER NOT NULL,
  created_at TEXT NOT NULL
);
