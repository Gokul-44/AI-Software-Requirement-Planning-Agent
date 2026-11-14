-- Up Migration
-- 002: the cycle a run waits on while its status is 'needs_resolution' (CycleInfo: task_ids and edges).
-- Additive only: one nullable column, no data is touched.
ALTER TABLE runs ADD COLUMN IF NOT EXISTS cycle jsonb;

-- Down Migration
-- Run by hand only (npm run migrate:down). Never run it against the production branch.
ALTER TABLE runs DROP COLUMN IF EXISTS cycle;
