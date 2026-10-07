-- 'public' jobs are listed in the shared gallery; 'private' jobs are only
-- listed for their owner. Both stay reachable by direct link.
ALTER TABLE jobs ADD COLUMN visibility TEXT NOT NULL DEFAULT 'public';

CREATE INDEX jobs_public_created ON jobs (visibility, created_at DESC, id);
