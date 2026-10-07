-- Engine release ("v12") that rendered the job, so ratings, failures, and
-- re-renders can be traced to the engine that produced them. NULL on jobs
-- made before versioned deploys.
ALTER TABLE jobs ADD COLUMN engine_version TEXT;
