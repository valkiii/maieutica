# Maieutica: design notes

*Maieutics: the Socratic "midwife" method of drawing out knowledge someone already has.*
The product does this for an organisation: it surfaces skills, connections and misalignments
that already exist but that nobody can see.

## 1. Does the idea hold up?

Yes, with one reframing. **The product is the graph and the analyses on it. The chatbot is just one interface to it.**
Copilot-style chat is a commodity; a trustworthy, current, queryable map of *who can do what, who works
with whom, and what the company is trying to achieve* is not. Build the map first, then let chat, dashboards
and proactive nudges sit on top.

Value for a 200 to 2,000 person company, in the order buyers feel it:

| Question | Analysis |
|---|---|
| Who is the best person for this project? | Skill fit + network fit + free capacity, with an explanation |
| What happens if X leaves? | Last-expert-standing skills, project impact, ranked internal successors, draft role profile |
| Where are we fragile? | Skills needed by live work but held by 1-2 people |
| Are our projects serving our strategy? | Goal -> project -> skill exposure; orphan projects |
| Where is knowledge trapped? | Unit pairs that never share a project; brokers holding the network together |
| Who is at 100% and cannot absorb more? | Allocation view |

## 2. The graph: layers, and what is stored vs derived

```
  Goals (strategy)        objective  --contribution-->  project
  Projects                project    --role, allocation-->  person
  People                  person     --level, confidence, source-->  skill
  Skills                  project    --min level-->  skill        (demand)
```

* **Stored: four bipartite link tables** (`project_goal`, `person_project`, `person_skill`, `project_skill`).
* **Derived: the one-mode networks.** The people-to-people social network is `person_project` joined to itself
  (`v_person_collaboration`); project-to-project overlap is the same trick the other way (`v_project_overlap`).
  You described this as "two layers, a bipartite graph you can also see as a social network": that is exactly
  a bipartite graph and its two *projections*. Store the bipartite graph, project on demand, and the
  projections can never contradict the source.
* Every edge is a **row with attributes**: level, confidence, source, `valid_from`/`valid_to`. Edges are closed,
  never deleted, so "what did the organisation look like in March?" is a query.
* Skills point at an external taxonomy (ESCO / O*NET) through `skill.external_uri`, plus `skill_alias`
  ("k8s" = Kubernetes) so CV extraction lands on canonical nodes and you never own the taxonomy alone.
* `tenant_id` on every table: multi-tenant from the first commit.

Why Postgres and not a graph database yet: a 2,000-person company is a graph of about 10^4 nodes and
10^5 edges. Recursive CTEs, plus `networkx` for centrality, handle that trivially. Adding pgvector later gives
semantic skill matching. Revisit Neo4j only if a real workload demands multi-hop traversal at scale.

## 3. Suggested additions

1. **Provenance and confidence on every skill claim.** "Seen in project work" beats "self-reported". Skills decay (`last_used_on`).
2. **Human-in-the-loop extraction.** CV or chat extraction writes *proposed* rows to `evidence`; the person confirms;
   only then does a `person_skill` edge exist. The model never edits the graph unsupervised.
3. **Infer from work, not only from questionnaires.** Importing project membership from Jira, Asana or
   Azure DevOps gives you `person_project` edges on day one, with no survey fatigue.
4. **Demand side.** `project_skill` (what work needs) is what turns a skill inventory into gap analysis.
5. **Capacity.** Allocation percentage is cheap and makes "best person" honest: the best-fit person at 100% is not the answer.
6. **Adjacent skills.** A skill graph lets you say "not a Kubernetes expert, but two steps away via AWS + Docker".
7. **Explanations, always.** Every recommendation shows the edges that produced it. This is also your legal defence (section 6).
8. **Snapshots.** Monthly frozen views enable trend lines ("Kubernetes cover, last 6 months").

## 4. Suggested cuts and deferrals

* **Do not start with proactive outreach.** Pull first ("who can do X?"). Proactive nudges need trust you have not earned yet.
* **Do not scrape email, Slack or Teams for skills or collaboration in v1.** It is the fastest way to lose employee trust
  and to trigger works-council and privacy objections. Use explicit sources: CV, self-report, project tools, manager confirmation.
* **Do not add performance scoring, sentiment analysis or "productivity" signals.** Out of scope, and it moves you into the highest regulatory tier.
* **Defer the local-LLM path** but design for it (section 5). Do not build it until a customer's data-residency requirement forces it.
* **Keep goals to two levels** (objective, and optionally key result) at first. Full OKR trees are a rabbit hole.

## 5. Architecture

```
  sources            ingestion                 core                       interfaces
  HRIS  ----.
  CVs   -----+-->  extractors (LLM)  -->  evidence (proposed)  -->  graph tables  -->  analyses (SQL + networkx)
  Jira  ----'       confirm step            person confirms          + views              |
                                                                                          +--> chat (LLM + tools)
                                                                                          +--> dashboards
                                                                                          +--> nudges (later)
```

* **The LLM never answers from memory about your people.** It calls deterministic tools
  (`find_candidates`, `gap_analysis`, `leaver_impact`, ...) that query the graph, then explains the result.
  Numbers come from SQL; prose comes from the model. This is what makes it auditable and cheap.
* **Provider adapter.** One interface (`complete(messages, tools)`) with a Claude implementation now and a local-model
  implementation later. Keep prompts and tool schemas provider-neutral.
* **Job-description generation** is a pure function of the graph: `leaverModel()` in `viz/src/js/60-leaver.js` is the reference
  (skills weighted by how many of the person's projects need them, plus collaborators and time split). The LLM only turns the structured
  profile into prose, and the manager confirms it.
* **Interchange format.** One JSON (or CSV) file per table, exactly as in `data/sample/`. Any HRIS or project-tool
  importer just has to produce these files, and the whole system, including the visualization, works.

## 6. Risks to take seriously before selling

* **EU AI Act.** Systems that allocate tasks or influence promotion or termination decisions about employees are
  listed as *high-risk* (Annex III, employment). Design for human oversight, logging, explanations and no automated
  decisions from day one, and get a lawyer's read before you sell into the EU.
* **GDPR and works councils.** Employees are data subjects. Give them a page showing *their own* profile, let them
  correct it, and be clear about purpose. Skills are lower-risk than behavioural data, but "who is critical and who is replaceable" is sensitive:
  restrict who can see the leaver view.
* **Cold start and stale data.** A graph nobody maintains is worse than none. Data must refresh from systems people
  already use (project tools, HRIS), and every claim carries a `last_used_on`.
* **Bias in matching.** "Best fit" ranking on incomplete self-reports rewards people who write good CVs. Show confidence, surface
  under-documented people, and never rank without the underlying evidence visible.

## 7. Suggested roadmap

1. **Import + graph + explorer** (this repo): CSV/JSON import, the four views, schema on Postgres.
2. **CV and profile ingestion** with the confirm step; skill normalisation against ESCO.
3. **Chat over the tools** (Claude): "who could lead the EU rollout?", "what if Elena leaves?".
4. **Jira/Asana connectors** for automatic `person_project` and `project_skill` edges.
5. **Snapshots + trends**, then proactive nudges ("Kubernetes cover dropped to one person").
6. **Local-model adapter** for customers with data-residency needs.

## 8. Capabilities and how they are computed

| View | What it does | How |
|---|---|---|
| Four layers | Goal > project > person > skill explorer | Four link tables |
| **Networks** | Three graphs (people, use cases, skills), separate or overlapped, per-node betweenness and structural holes | `graphMetrics()` in `viz/src/js/10-metrics.js` |
| Gaps and alignment | Single points of failure, goal exposure, orphan projects, no-slack people | `skillStats()`, `goalExposure()` |
| **Portfolio economics** | FTE, cost, complexity, risk-adjusted value, ROI, verdict per use case | `projectEconomics()`; SQL twin: `v_project_economics` |
| Leaver | Last-expert skills, collaboration gaps, ranked successors, draft role profile | `leaverModel()` |
| **Onboarding chat** | CV or questions -> proposed claims with evidence -> person confirms -> graph updated | `extractSkills()`, `obSave()` |
| **Use-case advisor** | Idea -> complexity, editable value model, team from skills AND time, hiring proposal | `ucInterpret()`, `proposeTeam()` |

**Network definitions.** The three graphs are projections of the stored links.
People are linked by shared (non-proposed) projects, weight = overlapping allocation.
Use cases are linked by shared people (1 each) and shared required skills (0.5 each).
Skills are linked when the same person holds both at level 3+.
In overlapped mode the three graphs are joined by the person-project, person-skill and project-skill links, and metrics are computed on the combined graph as well as within each layer.

**Metrics** (per node, weighted, undirected):
* *Betweenness*: Brandes on shortest paths with distance = 1 / weight (stronger tie = shorter path), normalised to 0-1.
* *Structural holes* (Burt 1992): *constraint* (low = the node's contacts are not connected to each other, so it spans holes) and *effective size* (contacts minus redundancy). The inspector also lists the concrete unconnected pairs a node bridges.
* *Role*: Broker, Embedded, Connector, Peripheral or Isolated, a plain-language reading of the three numbers.
* Verified in `tests/check_explorer.js` on graphs with known answers (path graph centre = full betweenness and constraint 0.5; triangle = no brokerage).

**Economics.** cost = sum(allocation x planned months x seniority-band rate) + hires. Rates are a rate card per band, never individual pay (`cost_band`).
Value is `expected_value_eur x value_confidence`. ROI = risk-adjusted annual value / cost. Under 1.25x = under-optimised, 1.25-2.5x = watch, above = healthy.
Complexity is the mean of three 1-5 scores: breadth (number of skill sets), duration, depth (average required level).

**Use-case advisor.** Templates map keywords to required skills, effort and a value model with editable assumptions; unknown ideas fall back to skills detected through `skill_alias` and the portfolio's median value per FTE-month at low confidence.
The team is a greedy skill cover weighted by required level and *available* time (free capacity, plus time that could be released from under-optimised projects), with a bonus for people who already work together.
A hire is proposed only for skills nobody available covers, plus capacity hires for any remaining FTE gap. Approving a use case flips a `proposed` project to `planned`; proposals never consume capacity.
In the product an LLM does the interpretation and calls these same functions as tools.

**Onboarding.** Claims carry evidence, confidence and source; a CV alone never scores above Advanced (4). Nothing is written to `person_skill` until the person confirms; each confirmed CV claim also writes an `evidence` row.

## 9. Board integration (Jira and Kanban)

Code: `integrations/boards.py` (pure functions, plus `JiraClient`). UI: the Jira / Kanban tab and the advisor's "Preview Jira tickets".

**Board -> graph**
* Adapters normalise a Jira issue (REST v3 shape, ADF descriptions flattened) or a generic Kanban CSV row into one ticket dict.
* `map_tickets()` resolves assignees through `external_identity` (Jira `accountId`, or e-mail for CSV; never by name), links each ticket to a project through `project.external_ref` (the Jira key) and detects skills from labels, components and title with the same `skill_alias` table the CV reader uses. Result: `work_item` and `work_item_skill` rows.
* **Observed allocation**: story points in flight, or closed in the last 30 days, per person and project; about 20 points = 1 FTE-month (a calibration constant, `POINTS_PER_FTE_MONTH`). Compared with the planned allocation, this shows people who are over-committed or "not visible in Jira".
* **Concentration**: three or more open tickets on one skill in a project with at least 75% on one person. Combined with the fragility analysis this yields the **Key-person** signal on a card.
* **Skill evidence**: tickets are evidence, not claims. A ticket can raise the confidence of an existing claim (to 0.85, source `project_inferred`), or *propose* a new skill (`evidence.status = proposed`) that waits for the person to confirm. Applying a sync never writes to `person_skill` for a new skill.
* **Suggested assignees** for an unassigned ticket: skill fit x free capacity, with a small bonus for people already on the project. A suggestion for the team lead; nothing is reassigned in Jira.

**Graph -> board**: `build_issue_payloads()` turns an approved use case into one epic and one story per skill (points from the required level, owner from the proposed team, a `hiring` story for skills nobody can cover). Two calls: `POST /rest/api/3/issue` for the epic, then `POST /rest/api/3/issue/bulk` for the stories with the epic as parent.

**What is verified and what is not.** The mapping, analyses and payload builders are unit-tested (`tests/test_boards.py`), the browser implementation is checked against the Python one on the same fixture (`tests/check_explorer.js`, parity of observed allocation and evidence), and `JiraClient` is exercised against a fake transport (token pagination on `POST /rest/api/3/search/jql`, basic auth, epic-before-children). It has **not** been run against a live Jira Cloud site. Before a pilot: confirm the story-points field id (`JIRA_POINTS_FIELD`, default `customfield_10016`), the issue types and workflow status names, and API token scopes. The demo fixture (`data/sample/jira_issues.json`) follows Atlassian's documented response shape.

**Privacy.** Board data is work data about people. Keep the same rules as elsewhere: read-only by default, explicit sources, no ranking of individuals by ticket counts. "Observed allocation" is a planning check against the plan, not a productivity score, and should not be shown as one.

## 9. Repo layout

```
schema/schema.sql            tables, edges, derived views (SQLite and Postgres compatible)
data/sample/*.json           synthetic company "Aldermoor Systems", one file per table
scripts/generate_sample.py   regenerates the sample data (hand-designed stories inside)
scripts/gen_tickets.py       generates the demo Jira export (REST v3 shape) and its planted stories
integrations/boards.py       Jira + Kanban CSV adapters, mapping, analyses, issue payloads, JiraClient
data/config/ticket_titles.json  ticket title library per skill (fixtures and the advisor's Jira export)
scripts/build_viz.py         assembles viz/src/* + data -> viz/maieutica-explorer.html (fails on JS syntax errors)
viz/src/                     style.css, body.html, js/00-core ... 99-main (one module per view)
scripts/cdp.js               dependency-free Chrome driver used for tests and recording
scripts/record_clips.js      records the demo clips for the deck (real interactions, MP4 + poster)
deck/index.html              the pitch deck (16:9, keyboard nav, speaker notes on N, click a clip to enlarge)
deck/clips/                  recorded clips referenced by the deck
tests/test_schema.py         loads sample data into the schema and checks the derived views
tests/test_boards.py         board integration: mapping, CSV adapter, payloads, client on a fake transport
tests/check_explorer.js      end-to-end test of the built explorer in headless Chrome
```

Run everything:
```
python3 scripts/generate_sample.py
python3 -m unittest discover -s tests
python3 scripts/build_viz.py
node tests/check_explorer.js
node scripts/record_clips.js          # optional: re-record the deck clips
python3 integrations/boards.py map data/sample/jira_issues.json   # what a Jira sync derives
```
