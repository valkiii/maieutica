<p align="center"><img src="assets/logo-256.png" width="96" alt="Maieutica logo"></p>

# Maieutica

*Draw out what your organisation already knows.*

Maieutica maps a company as one graph of **goals, projects, people and skills**, then answers the questions leaders actually ask: who can do this, what breaks if someone leaves, where are we fragile, and which projects cost more than they return. All data in this repo is a **synthetic demo company** ("Aldermoor Systems").

- **Explorer**: `viz/maieutica-explorer.html` (open in a browser). Eight views: four-layer graph, three networks with betweenness and structural holes, gaps and alignment, portfolio economics, succession, an onboarding chat, a use-case advisor and a Jira / Kanban board with skill signals.
- **Jira / Kanban integration**: `integrations/boards.py` reads Jira (REST v3) or Kanban CSV exports into the graph and turns a use-case proposal into a Jira epic with stories. Tested offline against a Jira-shaped fixture; not yet run against a live Jira site (see `docs/DESIGN.md` section 9).
- **Deck**: `deck/index.html` (17 slides, real clips of the product; press `N` for speaker notes).
- **Design notes**: `docs/DESIGN.md` (data model, metric definitions, risks, roadmap).

## Build and test

```
python3 scripts/generate_sample.py          # synthetic data -> data/sample/*.json
python3 -m unittest discover -s tests       # schema + derived SQL views
python3 scripts/build_viz.py                # viz/src/* + data -> viz/maieutica-explorer.html
python3 integrations/boards.py map data/sample/jira_issues.json   # what a Jira sync derives
node tests/check_explorer.js                # end-to-end test in headless Chrome
node scripts/record_clips.js                # optional: re-record the deck clips
```

Needs Python 3, Node 22+, Google Chrome and ffmpeg (the last two only for the end-to-end test and clip recording).

## Layout

```
schema/schema.sql            tables, edges, derived views (SQLite and Postgres compatible)
data/sample/*.json           one file per table
viz/src/                     style.css, body.html, js/ (one module per view)
scripts/                     data + ticket generators, build, Chrome driver, clip recorder
integrations/                Jira and Kanban adapters, mapping, payloads
deck/                        pitch deck and recorded clips
tests/                       schema tests and end-to-end explorer test
```

The stored graph is four link tables; the people, use-case and skill networks are computed from them. CV reading and the use-case advisor are deterministic rule-based stand-ins for an LLM that would call the same functions as tools.
