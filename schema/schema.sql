-- Maieutica core schema.
--
-- Portable SQL: runs unchanged on SQLite (dev/tests) and PostgreSQL (prod).
-- On Postgres, swap TEXT ids for UUIDs if you prefer, and add pgvector
-- embeddings to `skill` / `person` for semantic matching (see docs/DESIGN.md).
--
-- Design rules
--   1. STORE the bipartite layers (person-skill, person-project, project-skill,
--      project-goal). DERIVE the one-mode networks (people-people, project-project)
--      as views. Derived data can never drift out of sync.
--   2. Every edge is a row with attributes (level, confidence, source, validity),
--      never a bare foreign key. Edges are where the value lives.
--   3. Edges are temporal (valid_from / valid_to). Close an edge, don't delete it;
--      that is what lets you ask "what did the org look like last year?".
--   4. tenant_id on every table: multi-tenant from day one.

PRAGMA foreign_keys = ON;  -- SQLite only; Postgres ignores/rejects this line, strip it there.

-- ---------------------------------------------------------------- tenancy
CREATE TABLE tenant (
  id    TEXT PRIMARY KEY,
  name  TEXT NOT NULL
);

-- ------------------------------------------------------------------ nodes
-- Blended, fully loaded cost per FTE-month by seniority band. Deliberately a rate
-- card and NOT individual salaries: the cost model never needs anyone's pay.
CREATE TABLE cost_band (
  id                TEXT PRIMARY KEY,
  tenant_id         TEXT NOT NULL REFERENCES tenant(id),
  name              TEXT NOT NULL,
  eur_per_fte_month INTEGER NOT NULL
);

CREATE TABLE org_unit (
  id         TEXT PRIMARY KEY,
  tenant_id  TEXT NOT NULL REFERENCES tenant(id),
  name       TEXT NOT NULL,
  parent_id  TEXT REFERENCES org_unit(id)
);

CREATE TABLE person (
  id           TEXT PRIMARY KEY,
  tenant_id    TEXT NOT NULL REFERENCES tenant(id),
  external_ref TEXT,                                  -- HRIS employee id
  full_name    TEXT NOT NULL,
  title        TEXT,
  org_unit_id  TEXT REFERENCES org_unit(id),
  manager_id   TEXT REFERENCES person(id),
  cost_band_id TEXT REFERENCES cost_band(id),
  hired_on     TEXT,
  left_on      TEXT,
  status       TEXT NOT NULL DEFAULT 'active'
               CHECK (status IN ('active', 'leaving', 'left'))
);

CREATE TABLE skill (
  id           TEXT PRIMARY KEY,
  tenant_id    TEXT NOT NULL REFERENCES tenant(id),
  name         TEXT NOT NULL,
  category     TEXT,
  parent_id    TEXT REFERENCES skill(id),             -- taxonomy: Kubernetes -> Cloud -> Engineering
  external_uri TEXT                                   -- ESCO / O*NET concept, so you never own the taxonomy alone
);

CREATE TABLE skill_alias (                            -- "k8s" = Kubernetes; used by CV extraction
  skill_id TEXT NOT NULL REFERENCES skill(id),
  alias    TEXT NOT NULL,
  PRIMARY KEY (skill_id, alias)
);

CREATE TABLE project (
  id          TEXT PRIMARY KEY,
  tenant_id   TEXT NOT NULL REFERENCES tenant(id),
  name        TEXT NOT NULL,
  description TEXT,
  status      TEXT NOT NULL CHECK (status IN ('proposed', 'planned', 'active', 'done', 'cancelled')),
  start_on    TEXT,
  end_on      TEXT,
  planned_months REAL,                                -- duration used by the cost model
  expected_value_eur INTEGER,                         -- annual value if it works
  value_type  TEXT CHECK (value_type IN ('revenue', 'savings', 'risk_avoided', 'strategic', 'none')),
  value_basis TEXT,                                   -- how the value was derived (auditable)
  value_confidence REAL CHECK (value_confidence BETWEEN 0 AND 1),
  external_ref TEXT                                   -- Jira / Asana / Azure DevOps id
);
-- A "use case" is a project in status 'proposed'. Approving it flips the status;
-- the proposed team lives in person_project and the missing skills in hiring_need.

CREATE TABLE goal (                                   -- company strategy tree: vision > objective > key result
  id          TEXT PRIMARY KEY,
  tenant_id   TEXT NOT NULL REFERENCES tenant(id),
  name        TEXT NOT NULL,
  level       TEXT NOT NULL CHECK (level IN ('vision', 'objective', 'key_result')),
  parent_id   TEXT REFERENCES goal(id),
  owner_id    TEXT REFERENCES person(id),
  period      TEXT
);

-- ------------------------------------------------------------------ edges
CREATE TABLE person_skill (
  tenant_id    TEXT NOT NULL REFERENCES tenant(id),
  person_id    TEXT NOT NULL REFERENCES person(id),
  skill_id     TEXT NOT NULL REFERENCES skill(id),
  level        INTEGER NOT NULL CHECK (level BETWEEN 1 AND 5),
  confidence   REAL NOT NULL CHECK (confidence BETWEEN 0 AND 1),
  source       TEXT NOT NULL CHECK (source IN
               ('cv', 'self_reported', 'manager_confirmed', 'project_inferred', 'assessment')),
  last_used_on TEXT,
  valid_from   TEXT NOT NULL,
  valid_to     TEXT,                                  -- NULL = current
  PRIMARY KEY (person_id, skill_id, valid_from)
);

CREATE TABLE person_project (
  tenant_id      TEXT NOT NULL REFERENCES tenant(id),
  person_id      TEXT NOT NULL REFERENCES person(id),
  project_id     TEXT NOT NULL REFERENCES project(id),
  role           TEXT,
  allocation_pct INTEGER NOT NULL CHECK (allocation_pct BETWEEN 0 AND 100),
  valid_from     TEXT NOT NULL,
  valid_to       TEXT,
  PRIMARY KEY (person_id, project_id, valid_from)
);

CREATE TABLE project_skill (                          -- demand side: what the project needs
  tenant_id  TEXT NOT NULL REFERENCES tenant(id),
  project_id TEXT NOT NULL REFERENCES project(id),
  skill_id   TEXT NOT NULL REFERENCES skill(id),
  min_level  INTEGER NOT NULL CHECK (min_level BETWEEN 1 AND 5),
  importance REAL NOT NULL DEFAULT 1.0,
  PRIMARY KEY (project_id, skill_id)
);

CREATE TABLE project_goal (                           -- strategy alignment
  tenant_id    TEXT NOT NULL REFERENCES tenant(id),
  project_id   TEXT NOT NULL REFERENCES project(id),
  goal_id      TEXT NOT NULL REFERENCES goal(id),
  contribution REAL NOT NULL CHECK (contribution BETWEEN 0 AND 1),
  PRIMARY KEY (project_id, goal_id)
);

-- -------------------------------------------------------------- provenance
-- LLM/CV extraction never writes person_skill directly. It writes a proposed
-- claim here; the person (or manager) confirms it; only then does an edge appear.
CREATE TABLE evidence (
  id          TEXT PRIMARY KEY,
  tenant_id   TEXT NOT NULL REFERENCES tenant(id),
  person_id   TEXT NOT NULL REFERENCES person(id),
  skill_id    TEXT REFERENCES skill(id),
  source_type TEXT NOT NULL,                          -- cv | interview | project_history | assessment
  source_ref  TEXT,                                   -- file id, ticket id, ...
  excerpt     TEXT,
  proposed_level INTEGER,
  extracted_by TEXT,                                  -- model name + version
  status      TEXT NOT NULL DEFAULT 'proposed'
              CHECK (status IN ('proposed', 'confirmed', 'rejected')),
  created_at  TEXT NOT NULL
);

-- Skills a proposed project needs that nobody available can cover: a hiring proposal.
CREATE TABLE hiring_need (
  id         TEXT PRIMARY KEY,
  tenant_id  TEXT NOT NULL REFERENCES tenant(id),
  project_id TEXT NOT NULL REFERENCES project(id),
  skill_id   TEXT NOT NULL REFERENCES skill(id),
  min_level  INTEGER NOT NULL CHECK (min_level BETWEEN 1 AND 5),
  fte        REAL NOT NULL,
  rationale  TEXT,
  status     TEXT NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed', 'approved', 'filled', 'dropped'))
);

-- What people WANT to do (collected during onboarding); a first-class signal for staffing.
CREATE TABLE person_aspiration (
  tenant_id TEXT NOT NULL REFERENCES tenant(id),
  person_id TEXT NOT NULL REFERENCES person(id),
  skill_id  TEXT NOT NULL REFERENCES skill(id),
  kind      TEXT NOT NULL CHECK (kind IN ('use_more', 'learn')),
  created_at TEXT NOT NULL,
  PRIMARY KEY (person_id, skill_id, kind)
);

CREATE INDEX ix_person_skill_skill    ON person_skill(skill_id);
CREATE INDEX ix_person_project_proj   ON person_project(project_id);
CREATE INDEX ix_project_goal_goal     ON project_goal(goal_id);

-- ------------------------------------------------------------ derived layers
-- People <-> People: two people are linked when they share a project.
-- weight = sum over shared projects of min(allocation_a, allocation_b) / 100
CREATE VIEW v_person_collaboration AS
SELECT a.tenant_id,
       a.person_id AS person_a,
       b.person_id AS person_b,
       COUNT(*)    AS shared_projects,
       SUM(CASE WHEN a.allocation_pct < b.allocation_pct
                THEN a.allocation_pct ELSE b.allocation_pct END) / 100.0 AS weight
FROM person_project a
JOIN person_project b
  ON a.project_id = b.project_id AND a.person_id < b.person_id
WHERE a.valid_to IS NULL AND b.valid_to IS NULL
GROUP BY a.tenant_id, a.person_id, b.person_id;

-- Projects <-> Projects: linked when they share people.
CREATE VIEW v_project_overlap AS
SELECT a.tenant_id,
       a.project_id AS project_a,
       b.project_id AS project_b,
       COUNT(*)     AS shared_people
FROM person_project a
JOIN person_project b
  ON a.person_id = b.person_id AND a.project_id < b.project_id
WHERE a.valid_to IS NULL AND b.valid_to IS NULL
GROUP BY a.tenant_id, a.project_id, b.project_id;

-- Supply vs demand per skill. `at_risk` = two or more live projects need the
-- skill, at most one person is an expert (level >= 4) and at most two people
-- hold it at working level (>= 3). A deep bench of level-3s is not a bus-factor problem.
CREATE VIEW v_skill_supply AS
SELECT tenant_id, skill_id, skill_name, holders, experts, demand,
       CASE WHEN experts <= 1 AND holders <= 2 AND demand >= 2 THEN 1 ELSE 0 END AS at_risk
FROM (
  SELECT s.tenant_id,
         s.id   AS skill_id,
         s.name AS skill_name,
         (SELECT COUNT(*) FROM person_skill ps
           WHERE ps.skill_id = s.id AND ps.valid_to IS NULL AND ps.level >= 3) AS holders,
         (SELECT COUNT(*) FROM person_skill ps
           WHERE ps.skill_id = s.id AND ps.valid_to IS NULL AND ps.level >= 4) AS experts,
         (SELECT COUNT(*) FROM project_skill pk
            JOIN project pr ON pr.id = pk.project_id
           WHERE pk.skill_id = s.id AND pr.status IN ('active', 'planned'))    AS demand
  FROM skill s
) t;

-- Person load: total current allocation (>= 100 means no slack).
CREATE VIEW v_person_load AS
SELECT tenant_id, person_id, SUM(allocation_pct) AS allocation_pct
FROM person_project
WHERE valid_to IS NULL
GROUP BY tenant_id, person_id;

-- Projects that serve no goal: candidates for a strategy conversation.
CREATE VIEW v_orphan_project AS
SELECT p.tenant_id, p.id AS project_id, p.name
FROM project p
WHERE p.status IN ('active', 'planned')
  AND NOT EXISTS (SELECT 1 FROM project_goal g WHERE g.project_id = p.id);

-- Cost and effort per project. FTE is the average team size implied by allocations;
-- cost = sum(allocation x planned_months x band rate). The verdict (ROI bands, complexity)
-- is applied in the application layer so the thresholds stay configurable.
CREATE VIEW v_project_economics AS
SELECT p.tenant_id,
       p.id   AS project_id,
       p.name AS project_name,
       p.status,
       p.planned_months,
       p.expected_value_eur,
       p.value_confidence,
       SUM(pp.allocation_pct) / 100.0                                              AS fte,
       SUM(pp.allocation_pct) / 100.0 * p.planned_months                           AS fte_months,
       SUM(pp.allocation_pct / 100.0 * p.planned_months * cb.eur_per_fte_month)    AS cost_eur,
       (SELECT COUNT(*) FROM project_skill ps WHERE ps.project_id = p.id)          AS skill_sets
FROM project p
JOIN person_project pp ON pp.project_id = p.id AND pp.valid_to IS NULL
JOIN person pe         ON pe.id = pp.person_id
JOIN cost_band cb      ON cb.id = pe.cost_band_id
GROUP BY p.tenant_id, p.id, p.name, p.status, p.planned_months, p.expected_value_eur, p.value_confidence;
