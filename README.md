# Maieutica

*Draw out what your organisation already knows.*

Maieutica maps a company as one graph of **goals, projects, people and skills**, then answers the questions leaders actually ask: who can do this, what breaks if someone leaves, where are we fragile, and which projects cost more than they return. All data in this repo is a **synthetic demo company** ("Aldermoor Systems").

- **Explorer**: `viz/maieutica-explorer.html` (open in a browser). Seven views: four-layer graph, three networks with betweenness and structural holes, gaps and alignment, portfolio economics, succession, an onboarding chat and a use-case advisor.
- **Deck**: `deck/index.html` (16 slides, real clips of the product; press `N` for speaker notes).
- **Design notes**: `docs/DESIGN.md` (data model, metric definitions, risks, roadmap).

## Build and test

```
python3 scripts/generate_sample.py          # synthetic data -> data/sample/*.json
python3 -m unittest discover -s tests       # schema + derived SQL views
python3 scripts/build_viz.py                # viz/src/* + data -> viz/maieutica-explorer.html
node tests/check_explorer.js                # end-to-end test in headless Chrome
node scripts/record_clips.js                # optional: re-record the deck clips
```

Needs Python 3, Node 22+, Google Chrome and ffmpeg (the last two only for the end-to-end test and clip recording).

## Layout

```
schema/schema.sql            tables, edges, derived views (SQLite and Postgres compatible)
data/sample/*.json           one file per table
viz/src/                     style.css, body.html, js/ (one module per view)
scripts/                     data generator, build, Chrome driver, clip recorder
deck/                        pitch deck and recorded clips
tests/                       schema tests and end-to-end explorer test
```

The stored graph is four link tables; the people, use-case and skill networks are computed from them. CV reading and the use-case advisor are deterministic rule-based stand-ins for an LLM that would call the same functions as tools.
