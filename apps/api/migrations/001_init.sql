-- Up Migration
-- 001: design document C2 DDL, plus runs.plan (assembled plan snapshot). Additive only.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE projects (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  idea_text   text NOT NULL CHECK (char_length(idea_text) BETWEEN 10 AND 2000),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE runs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  parent_run_id   uuid REFERENCES runs(id) ON DELETE SET NULL,     -- re-run lineage
  status          text NOT NULL DEFAULT 'queued'
                  CHECK (status IN ('queued','running','needs_resolution','succeeded','failed')),
  current_stage   smallint NOT NULL DEFAULT 0 CHECK (current_stage BETWEEN 0 AND 8),
  config          jsonb NOT NULL,          -- team_size, velocity, sprint_length_days, focus_hours, points_to_hours, pack_mode
  llm_provider    text NOT NULL,
  llm_model       text NOT NULL,
  prompt_versions jsonb NOT NULL DEFAULT '{}'::jsonb,
  summary         text,
  assumptions     text[] NOT NULL DEFAULT '{}',
  is_golden       boolean NOT NULL DEFAULT false,
  input_tokens    integer NOT NULL DEFAULT 0,
  output_tokens   integer NOT NULL DEFAULT 0,
  est_cost_usd    numeric(10,4) NOT NULL DEFAULT 0,
  error           jsonb,
  plan            jsonb,                   -- assembled plan.json snapshot (added to C2)
  created_at      timestamptz NOT NULL DEFAULT now(),
  finished_at     timestamptz
);
CREATE INDEX runs_project_idx ON runs (project_id, created_at DESC);
CREATE INDEX runs_created_idx ON runs (created_at);               -- daily spend-cap query

CREATE TABLE stage_executions (
  run_id        uuid NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  stage         smallint NOT NULL CHECK (stage BETWEEN 1 AND 8),
  status        text NOT NULL CHECK (status IN ('pending','running','succeeded','cached','failed')),
  cache_key     char(64),
  attempts      smallint NOT NULL DEFAULT 0,
  input_tokens  integer NOT NULL DEFAULT 0,
  output_tokens integer NOT NULL DEFAULT 0,
  cost_usd      numeric(10,4) NOT NULL DEFAULT 0,
  latency_ms    integer,
  error         jsonb,
  started_at    timestamptz,
  finished_at   timestamptz,
  PRIMARY KEY (run_id, stage)
);

CREATE TABLE stage_cache (
  cache_key      char(64) PRIMARY KEY,         -- sha256(stage|prompt_version|provider|model|settings|canonical input)
  stage          smallint NOT NULL,
  prompt_version text NOT NULL,
  llm_model      text NOT NULL,
  output         jsonb NOT NULL,               -- validated LLM output (pre-stamping) or computed result
  input_tokens   integer NOT NULL DEFAULT 0,
  output_tokens  integer NOT NULL DEFAULT 0,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE requirements (
  run_id    uuid NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  code      text NOT NULL CHECK (code ~ '^R-[0-9]{3}$'),
  type      text NOT NULL CHECK (type IN ('functional','non_functional')),
  category  text CHECK (category IN ('performance','security','usability','reliability',
                                     'scalability','compliance','maintainability','other')),
  text      text NOT NULL,
  priority  text NOT NULL CHECK (priority IN ('must','should','could')),
  PRIMARY KEY (run_id, code)
);

CREATE TABLE epics (
  run_id      uuid NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  code        text NOT NULL CHECK (code ~ '^E-[0-9]{3}$'),
  title       text NOT NULL,
  description text NOT NULL DEFAULT '',
  PRIMARY KEY (run_id, code)
);

CREATE TABLE stories (
  run_id              uuid NOT NULL,
  code                text NOT NULL CHECK (code ~ '^S-[0-9]{3}$'),
  epic_code           text NOT NULL,
  as_a                text NOT NULL,
  i_want              text NOT NULL,
  so_that             text NOT NULL,
  acceptance_criteria text[] NOT NULL CHECK (cardinality(acceptance_criteria) >= 1),
  priority            text NOT NULL CHECK (priority IN ('must','should','could')),
  PRIMARY KEY (run_id, code),
  FOREIGN KEY (run_id, epic_code) REFERENCES epics(run_id, code) ON DELETE CASCADE
);

-- FIX (Issue 1): many-to-many traceability Story <-> Requirement
CREATE TABLE story_requirements (
  run_id           uuid NOT NULL,
  story_code       text NOT NULL,
  requirement_code text NOT NULL,
  PRIMARY KEY (run_id, story_code, requirement_code),
  FOREIGN KEY (run_id, story_code)       REFERENCES stories(run_id, code)      ON DELETE CASCADE,
  FOREIGN KEY (run_id, requirement_code) REFERENCES requirements(run_id, code) ON DELETE CASCADE
);
CREATE INDEX story_req_by_req ON story_requirements (run_id, requirement_code);

CREATE TABLE tasks (
  run_id            uuid NOT NULL,
  code              text NOT NULL CHECK (code ~ '^T-[0-9]{3}$'),
  story_code        text NOT NULL,
  title             text NOT NULL,
  description       text NOT NULL DEFAULT '',
  layer             text NOT NULL CHECK (layer IN ('frontend','backend','database','devops',
                                                   'testing','design','integration')),
  points            smallint CHECK (points IN (1,2,3,5,8,13)),   -- NULL until stage 4
  hours             integer  CHECK (hours > 0),                  -- NULL until stage 4
  estimate_rationale text,
  PRIMARY KEY (run_id, code),
  FOREIGN KEY (run_id, story_code) REFERENCES stories(run_id, code) ON DELETE CASCADE
);

-- Edge (from_task_code -> to_task_code): "from must FINISH before to can START" (FS only in v1)
CREATE TABLE dependencies (
  run_id         uuid NOT NULL,
  from_task_code text NOT NULL,
  to_task_code   text NOT NULL,
  type           text NOT NULL DEFAULT 'FS' CHECK (type = 'FS'),
  source         text NOT NULL DEFAULT 'llm' CHECK (source IN ('llm','repair','user')),
  reason         text,
  PRIMARY KEY (run_id, from_task_code, to_task_code),
  CHECK (from_task_code <> to_task_code),
  FOREIGN KEY (run_id, from_task_code) REFERENCES tasks(run_id, code) ON DELETE CASCADE,
  FOREIGN KEY (run_id, to_task_code)   REFERENCES tasks(run_id, code) ON DELETE CASCADE
);
CREATE INDEX deps_to_idx ON dependencies (run_id, to_task_code);

-- Units: integer working HOURS from project start (one developer per task)
CREATE TABLE schedule (
  run_id               uuid NOT NULL,
  task_code            text NOT NULL,
  sprint_number        integer NOT NULL CHECK (sprint_number >= 1),
  early_start          integer NOT NULL CHECK (early_start >= 0),
  early_finish         integer NOT NULL,
  late_start           integer NOT NULL,
  late_finish          integer NOT NULL,
  slack                integer NOT NULL CHECK (slack >= 0),
  on_critical_path     boolean NOT NULL,
  planned_start        integer NOT NULL,     -- capacity-feasible timeline (Gantt)
  planned_finish       integer NOT NULL,
  descendant_count     integer NOT NULL DEFAULT 0,
  PRIMARY KEY (run_id, task_code),
  FOREIGN KEY (run_id, task_code) REFERENCES tasks(run_id, code) ON DELETE CASCADE,
  CHECK (early_finish >= early_start AND late_finish >= late_start)
);

CREATE TABLE sprints (
  run_id          uuid NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  number          integer NOT NULL CHECK (number >= 1),
  capacity_points integer NOT NULL,
  load_points     integer NOT NULL CHECK (load_points <= capacity_points),
  PRIMARY KEY (run_id, number)
);

CREATE TABLE risk_signals (
  run_id    uuid NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  code      text NOT NULL CHECK (code ~ '^SG-[0-9]{2,3}$'),
  kind      text NOT NULL,
  severity  text NOT NULL CHECK (severity IN ('low','medium','high')),
  value     numeric NOT NULL,
  threshold numeric,
  task_codes text[] NOT NULL DEFAULT '{}',
  message   text NOT NULL,                  -- generated by code, numeric
  PRIMARY KEY (run_id, code)
);

CREATE TABLE risks (
  run_id      uuid NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  code        text NOT NULL CHECK (code ~ '^RK-[0-9]{3}$'),
  severity    text NOT NULL CHECK (severity IN ('low','medium','high')),  -- computed by code
  title       text NOT NULL,
  description text NOT NULL,
  mitigation  text NOT NULL,
  origin      text NOT NULL DEFAULT 'llm' CHECK (origin IN ('llm','template')),
  PRIMARY KEY (run_id, code)
);

-- FIX (N5): structured evidence — every risk cites >= 1 signal (enforced in code + assembler check)
CREATE TABLE risk_evidence (
  run_id      uuid NOT NULL,
  risk_code   text NOT NULL,
  signal_code text NOT NULL,
  PRIMARY KEY (run_id, risk_code, signal_code),
  FOREIGN KEY (run_id, risk_code)   REFERENCES risks(run_id, code)        ON DELETE CASCADE,
  FOREIGN KEY (run_id, signal_code) REFERENCES risk_signals(run_id, code) ON DELETE CASCADE
);

-- Validation defects / warnings surfaced in the UI and the report
CREATE TABLE plan_issues (
  run_id     uuid NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  code       text NOT NULL CHECK (code ~ '^I-[0-9]{3}$'),
  stage      smallint NOT NULL,
  severity   text NOT NULL CHECK (severity IN ('error','warning','info')),
  kind       text NOT NULL,   -- unknown_reference|self_loop|duplicate_edge|cycle|cycle_repaired|
                              -- uncovered_requirement|story_without_tasks|oversized_task|
                              -- suspicious_edge|duplicate_task_suspect|risk_rejected
  message    text NOT NULL,
  refs       text[] NOT NULL DEFAULT '{}',
  resolution text,
  PRIMARY KEY (run_id, code)
);

-- Down Migration
-- Drops only the tables created above, in dependency order. Run it by hand (npm run migrate:down).
-- It deletes all data in those tables, so never run it against the production branch.
DROP TABLE IF EXISTS risk_evidence;
DROP TABLE IF EXISTS risks;
DROP TABLE IF EXISTS risk_signals;
DROP TABLE IF EXISTS plan_issues;
DROP TABLE IF EXISTS sprints;
DROP TABLE IF EXISTS schedule;
DROP TABLE IF EXISTS dependencies;
DROP TABLE IF EXISTS tasks;
DROP TABLE IF EXISTS story_requirements;
DROP TABLE IF EXISTS stories;
DROP TABLE IF EXISTS epics;
DROP TABLE IF EXISTS requirements;
DROP TABLE IF EXISTS stage_cache;
DROP TABLE IF EXISTS stage_executions;
DROP TABLE IF EXISTS runs;
DROP TABLE IF EXISTS projects;
