#!/usr/bin/env python3
"""Generate the synthetic demo company ("Aldermoor Systems") as one JSON file per table.

Output matches schema/schema.sql table-for-table, so the same files can be
bulk-loaded into SQLite/Postgres or fed to the visualization.

The data is hand-designed (not random) so it contains known stories:
  - Kubernetes, Cybersecurity and GDPR each have exactly ONE expert (bus factor 1)
  - Objective "Earn enterprise trust" is served by one thin project
  - "Hackathon Tooling" serves no goal (orphan)
  - Several people sit at 100% allocation
"""
import json
import re
import zlib
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "data" / "sample"
T = "t_demo"


def slug(text):
    return re.sub(r"[^a-z0-9]+", "_", text.lower()).strip("_")


# ------------------------------------------------------------------ org units
UNITS = ["Engineering", "Data & AI", "Product & Design", "Operations", "Commercial", "People & Finance"]
UNIT_ID = {n: "org_" + slug(n) for n in UNITS}

# ------------------------------------------------------------------ skills
SKILLS = {
    "Engineering": ["Python", "TypeScript", "AWS", "Kubernetes", "API Design", "Cybersecurity"],
    "Data & AI": ["SQL", "Data Engineering", "Machine Learning"],
    "Design & Product": ["UX Research", "UI Design", "Product Discovery", "Roadmapping"],
    "Delivery": ["Agile Delivery", "Program Management", "Risk Management", "Change Management",
                 "Vendor Management", "Stakeholder Communication"],
    "People": ["Coaching", "Recruiting"],
    "Domain": ["Supply Chain", "GDPR & Compliance", "Financial Reporting"],
    "Commercial": ["Enterprise Sales", "Customer Success", "Negotiation"],
}
SKILL_ID = {}
skills = []
for cat, names in SKILLS.items():
    for n in names:
        SKILL_ID[n] = "skl_" + slug(n)
        skills.append({"id": SKILL_ID[n], "tenant_id": T, "name": n, "category": cat,
                       "parent_id": None, "external_uri": None})

# ------------------------------------------------------------------ people
# (name, title, unit, tenure_years, manager_key, {skill: level})
PEOPLE = [
    # Engineering
    ("Marta Lindqvist", "Staff DevOps Engineer", "Engineering", 6, "Lukas Novak", {"Kubernetes": 5, "AWS": 5, "Cybersecurity": 3, "Python": 3, "API Design": 2}),
    ("Jonas Weber", "Senior Backend Engineer", "Engineering", 5, "Lukas Novak", {"Python": 4, "API Design": 4, "SQL": 3, "AWS": 3, "Kubernetes": 2}),
    ("Priya Nair", "Senior Frontend Engineer", "Engineering", 4, "Lukas Novak", {"TypeScript": 5, "UI Design": 3, "API Design": 3, "UX Research": 2}),
    ("Diego Ortiz", "Backend Engineer", "Engineering", 2, "Lukas Novak", {"TypeScript": 4, "API Design": 3, "AWS": 2, "SQL": 3}),
    ("Aiko Tanaka", "Frontend Engineer", "Engineering", 3, "Lukas Novak", {"TypeScript": 4, "UI Design": 4, "UX Research": 2}),
    ("Lukas Novak", "Engineering Manager", "Engineering", 7, None, {"Agile Delivery": 5, "Program Management": 4, "Stakeholder Communication": 4, "Coaching": 4, "Python": 3}),
    ("Fatima Bensaid", "Platform Engineer", "Engineering", 3, "Lukas Novak", {"AWS": 4, "Kubernetes": 3, "Python": 4, "Cybersecurity": 2}),
    ("Ewan MacLeod", "Security Engineer", "Engineering", 4, "Lukas Novak", {"Cybersecurity": 5, "AWS": 3, "Risk Management": 3, "GDPR & Compliance": 3}),
    ("Sofia Rossi", "QA Lead", "Engineering", 5, "Lukas Novak", {"Agile Delivery": 3, "Python": 3, "TypeScript": 2, "Stakeholder Communication": 3}),
    ("Mateo Silva", "Junior Engineer", "Engineering", 1, "Lukas Novak", {"Python": 2, "TypeScript": 2, "SQL": 2}),
    # Data & AI
    ("Ingrid Haugen", "Head of Data Science", "Data & AI", 6, None, {"Machine Learning": 5, "Python": 5, "SQL": 4, "Coaching": 3, "Stakeholder Communication": 4}),
    ("Ravi Menon", "ML Engineer", "Data & AI", 3, "Ingrid Haugen", {"Machine Learning": 4, "Python": 4, "AWS": 3, "Data Engineering": 3}),
    ("Chloe Dubois", "Data Engineer", "Data & AI", 4, "Ingrid Haugen", {"Data Engineering": 5, "SQL": 5, "Python": 4, "AWS": 3}),
    ("Omar Haddad", "Data Engineer", "Data & AI", 2, "Ingrid Haugen", {"Data Engineering": 4, "SQL": 4, "Python": 3}),
    ("Nia Okafor", "Data Analyst", "Data & AI", 3, "Ingrid Haugen", {"SQL": 4, "Financial Reporting": 3, "Stakeholder Communication": 3, "Python": 2}),
    ("Tobias Krüger", "Analytics Engineer", "Data & AI", 2, "Ingrid Haugen", {"SQL": 4, "Data Engineering": 3, "Python": 3}),
    # Product & Design
    ("Hannah Fischer", "Head of Product", "Product & Design", 6, None, {"Product Discovery": 5, "Roadmapping": 5, "Stakeholder Communication": 5, "Negotiation": 3}),
    ("Leo Martins", "Product Manager", "Product & Design", 4, "Hannah Fischer", {"Product Discovery": 4, "Roadmapping": 4, "Agile Delivery": 4, "UX Research": 3}),
    ("Yara Cohen", "Senior UX Researcher", "Product & Design", 4, "Hannah Fischer", {"UX Research": 5, "Product Discovery": 3, "Stakeholder Communication": 3}),
    ("Sven Berg", "UI Designer", "Product & Design", 3, "Hannah Fischer", {"UI Design": 5, "UX Research": 3}),
    ("Amara Diallo", "Product Manager", "Product & Design", 2, "Hannah Fischer", {"Product Discovery": 3, "Roadmapping": 3, "Agile Delivery": 3, "Customer Success": 3}),
    ("Kenji Watanabe", "Product Analyst", "Product & Design", 2, "Hannah Fischer", {"SQL": 3, "Product Discovery": 3, "Financial Reporting": 2}),
    # Operations
    ("Elena Petrova", "Program Director, Operations", "Operations", 8, None, {"Program Management": 5, "Change Management": 4, "Supply Chain": 4, "Vendor Management": 4, "Risk Management": 3}),
    ("Marcus Lee", "Supply Chain Lead", "Operations", 7, "Elena Petrova", {"Supply Chain": 5, "Vendor Management": 3, "Negotiation": 3}),
    ("Zoe Andersson", "Operations Analyst", "Operations", 2, "Elena Petrova", {"Supply Chain": 3, "SQL": 3, "Financial Reporting": 2}),
    ("Ahmed Yusuf", "Warehouse Systems Specialist", "Operations", 5, "Elena Petrova", {"Supply Chain": 4, "Change Management": 3, "Vendor Management": 2}),
    ("Clara Jensen", "Project Coordinator", "Operations", 2, "Elena Petrova", {"Program Management": 3, "Agile Delivery": 3, "Change Management": 2, "Stakeholder Communication": 3}),
    # Commercial
    ("Victor Alvarez", "VP Sales", "Commercial", 6, None, {"Enterprise Sales": 5, "Negotiation": 5, "Stakeholder Communication": 4}),
    ("Lina Haddad", "Account Executive", "Commercial", 3, "Victor Alvarez", {"Enterprise Sales": 4, "Negotiation": 3, "Customer Success": 3}),
    ("Pieter De Smet", "Customer Success Manager", "Commercial", 4, "Victor Alvarez", {"Customer Success": 5, "Stakeholder Communication": 4, "Change Management": 2}),
    ("Nadia Karimi", "Sales Engineer", "Commercial", 3, "Victor Alvarez", {"Enterprise Sales": 3, "API Design": 3, "Python": 2, "AWS": 2}),
    ("Hugo Bernard", "Pricing Analyst", "Commercial", 2, "Victor Alvarez", {"Financial Reporting": 3, "SQL": 3, "Negotiation": 2}),
    # People & Finance
    ("Ada Kowalski", "CFO", "People & Finance", 7, None, {"Financial Reporting": 5, "Risk Management": 4, "Vendor Management": 3}),
    ("Beatrice Oyelaran", "HR Business Partner", "People & Finance", 5, "Ada Kowalski", {"Recruiting": 5, "Coaching": 4, "Change Management": 3}),
    ("Henrik Solberg", "Compliance & Legal Counsel", "People & Finance", 5, "Ada Kowalski", {"GDPR & Compliance": 5, "Risk Management": 4, "Negotiation": 3}),
    ("Isabel Moreno", "Finance Controller", "People & Finance", 4, "Ada Kowalski", {"Financial Reporting": 4, "Python": 2, "Risk Management": 2}),
]
PERSON_ID = {p[0]: f"per_{i + 1:02d}" for i, p in enumerate(PEOPLE)}

# ------------------------------------------------------------------ goals
GOALS = [
    ("gol_vision", "Become Europe's default freight-visibility platform", "vision", None, "2026-2027"),
    ("gol_growth", "Grow recurring revenue 30%", "objective", "gol_vision", "2026-2027"),
    ("gol_platform", "Modernise the platform, cut cloud cost 20%", "objective", "gol_vision", "2026-2027"),
    ("gol_ops", "Automate operations end to end", "objective", "gol_vision", "2026-2027"),
    ("gol_trust", "Earn enterprise trust (security and compliance)", "objective", "gol_vision", "2026-2027"),
]

# ------------------------------------------------------------------ projects
# name, status, start, end, goals{goal: contribution}, required{skill: min_level}, members[(person, role, alloc)]
PROJECTS = [
    ("Customer Portal 2.0", "active", "2026-02-01", "2026-12-15",
     {"gol_growth": 0.9},
     {"TypeScript": 4, "UI Design": 4, "API Design": 3, "UX Research": 3, "Agile Delivery": 3},
     [("Priya Nair", "Lead", 60), ("Aiko Tanaka", "Contributor", 80), ("Diego Ortiz", "Contributor", 50),
      ("Sven Berg", "Contributor", 40), ("Yara Cohen", "Contributor", 30), ("Leo Martins", "Product owner", 50),
      ("Sofia Rossi", "Contributor", 30)]),
    ("Predictive ETA Engine", "active", "2026-03-01", "2027-01-31",
     {"gol_growth": 0.6, "gol_ops": 0.5},
     {"Machine Learning": 5, "Python": 4, "Data Engineering": 4, "AWS": 3},
     [("Ingrid Haugen", "Lead", 40), ("Ravi Menon", "Contributor", 80), ("Chloe Dubois", "Contributor", 40),
      ("Jonas Weber", "Contributor", 30), ("Fatima Bensaid", "Contributor", 30)]),
    ("Cloud Migration", "active", "2026-01-15", "2027-03-31",
     {"gol_platform": 1.0, "gol_trust": 0.3},
     {"AWS": 4, "Kubernetes": 5, "Cybersecurity": 3, "Program Management": 3},
     [("Marta Lindqvist", "Lead", 60), ("Fatima Bensaid", "Contributor", 50), ("Ewan MacLeod", "Contributor", 30),
      ("Jonas Weber", "Contributor", 30), ("Lukas Novak", "Sponsor", 20), ("Clara Jensen", "Coordinator", 40)]),
    ("Data Platform Consolidation", "active", "2026-04-01", "2027-02-28",
     {"gol_platform": 0.7, "gol_ops": 0.4},
     {"Data Engineering": 4, "SQL": 4, "AWS": 3, "Python": 3},
     [("Chloe Dubois", "Lead", 50), ("Omar Haddad", "Contributor", 80), ("Tobias Krüger", "Contributor", 60),
      ("Nia Okafor", "Contributor", 20), ("Fatima Bensaid", "Contributor", 20)]),
    ("Warehouse Automation Pilot", "active", "2026-05-01", "2026-12-31",
     {"gol_ops": 1.0},
     {"Supply Chain": 4, "Program Management": 4, "Vendor Management": 3, "Change Management": 3},
     [("Elena Petrova", "Lead", 40), ("Marcus Lee", "Contributor", 60), ("Ahmed Yusuf", "Contributor", 80),
      ("Zoe Andersson", "Contributor", 50), ("Clara Jensen", "Coordinator", 30)]),
    ("ISO 27001 Certification", "active", "2026-06-01", "2027-02-28",
     {"gol_trust": 1.0},
     {"Cybersecurity": 4, "GDPR & Compliance": 4, "Risk Management": 3, "Change Management": 3},
     [("Ewan MacLeod", "Lead", 50), ("Henrik Solberg", "Contributor", 30), ("Elena Petrova", "Advisor", 10),
      ("Beatrice Oyelaran", "Contributor", 10)]),
    ("EU Expansion Playbook", "active", "2026-07-01", "2027-03-31",
     {"gol_growth": 1.0},
     {"Enterprise Sales": 4, "Negotiation": 4, "GDPR & Compliance": 3, "Customer Success": 3},
     [("Victor Alvarez", "Lead", 30), ("Lina Haddad", "Contributor", 60), ("Pieter De Smet", "Contributor", 40),
      ("Henrik Solberg", "Advisor", 20), ("Nadia Karimi", "Contributor", 30)]),
    ("Pricing Revamp", "active", "2026-08-01", "2026-12-20",
     {"gol_growth": 0.8},
     {"Product Discovery": 3, "SQL": 3, "Negotiation": 3, "Financial Reporting": 3},
     [("Hannah Fischer", "Sponsor", 20), ("Hugo Bernard", "Lead", 70), ("Kenji Watanabe", "Contributor", 50),
      ("Nia Okafor", "Contributor", 30), ("Victor Alvarez", "Advisor", 10)]),
    ("API Platform", "active", "2026-03-15", "2027-01-15",
     {"gol_platform": 0.6, "gol_growth": 0.5},
     {"API Design": 4, "TypeScript": 3, "Kubernetes": 3, "Python": 3},
     [("Jonas Weber", "Lead", 40), ("Diego Ortiz", "Contributor", 40), ("Marta Lindqvist", "Contributor", 25),
      ("Nadia Karimi", "Advisor", 20), ("Mateo Silva", "Contributor", 60), ("Lukas Novak", "Sponsor", 20)]),
    ("Finance Close Automation", "active", "2026-06-15", "2027-01-31",
     {"gol_ops": 0.8},
     {"Financial Reporting": 4, "SQL": 3, "Python": 3, "Change Management": 2},
     [("Isabel Moreno", "Lead", 60), ("Ada Kowalski", "Sponsor", 10), ("Nia Okafor", "Contributor", 30),
      ("Tobias Krüger", "Contributor", 20), ("Mateo Silva", "Contributor", 20)]),
    ("Mobile Driver App", "planned", "2026-11-01", "2027-06-30",
     {"gol_growth": 0.7, "gol_ops": 0.4},
     {"TypeScript": 4, "UI Design": 3, "UX Research": 3, "Product Discovery": 3},
     [("Amara Diallo", "Lead", 50), ("Aiko Tanaka", "Contributor", 20), ("Sven Berg", "Contributor", 20),
      ("Yara Cohen", "Contributor", 30)]),
    ("Hackathon Tooling", "active", "2026-08-15", "2026-11-30",
     {},
     {"Python": 2, "Coaching": 2},
     [("Sofia Rossi", "Lead", 10), ("Omar Haddad", "Contributor", 10), ("Beatrice Oyelaran", "Sponsor", 10)]),
]

# ------------------------------------------------------------------ build tables
org_units = [{"id": UNIT_ID[n], "tenant_id": T, "name": n, "parent_id": None} for n in UNITS]

people = []
for name, title, unit, tenure, mgr, _ in PEOPLE:
    people.append({
        "id": PERSON_ID[name], "tenant_id": T, "external_ref": f"E{1000 + int(PERSON_ID[name][4:])}",
        "full_name": name, "title": title, "org_unit_id": UNIT_ID[unit],
        "manager_id": PERSON_ID[mgr] if mgr else None,
        "hired_on": f"{2026 - tenure}-09-01", "left_on": None, "status": "active",
    })

goals = [{"id": g, "tenant_id": T, "name": n, "level": lvl, "parent_id": par, "owner_id": None, "period": per}
         for g, n, lvl, par, per in GOALS]

# skills a person actually exercises on a live project ("project_inferred" evidence)
required_on_own_projects = set()
for pname, status, start, end, gls, req, members in PROJECTS:
    for person, role, alloc in members:
        for sk, lvl in req.items():
            required_on_own_projects.add((PERSON_ID[person], SKILL_ID[sk]))

SOURCES = [("cv", 0.70), ("self_reported", 0.55), ("manager_confirmed", 0.90)]
person_skill = []
for name, _, _, _, _, sk in PEOPLE:
    pid = PERSON_ID[name]
    for skill, level in sk.items():
        sid = SKILL_ID[skill]
        if (pid, sid) in required_on_own_projects and level >= 3:
            source, conf, last_used = "project_inferred", 0.85, "2026-09-01"
        else:
            h = zlib.crc32(f"{pid}{sid}".encode())
            source, conf = SOURCES[h % 3]
            months_back = h % 30
            y, m = divmod(2026 * 12 + 8 - months_back, 12)
            last_used = f"{y}-{m + 1:02d}-01"
        person_skill.append({"tenant_id": T, "person_id": pid, "skill_id": sid, "level": level,
                             "confidence": conf, "source": source, "last_used_on": last_used,
                             "valid_from": "2026-01-01", "valid_to": None})

projects, person_project, project_skill, project_goal = [], [], [], []
for pname, status, start, end, gls, req, members in PROJECTS:
    prj = "prj_" + slug(pname)
    projects.append({"id": prj, "tenant_id": T, "name": pname, "description": None, "status": status,
                     "start_on": start, "end_on": end, "external_ref": None})
    for g, c in gls.items():
        project_goal.append({"tenant_id": T, "project_id": prj, "goal_id": g, "contribution": c})
    for sk, lvl in req.items():
        project_skill.append({"tenant_id": T, "project_id": prj, "skill_id": SKILL_ID[sk],
                              "min_level": lvl, "importance": 1.0})
    for person, role, alloc in members:
        person_project.append({"tenant_id": T, "person_id": PERSON_ID[person], "project_id": prj,
                               "role": role, "allocation_pct": alloc, "valid_from": start, "valid_to": None})

# ------------------------------------------------------------------ economics
# Blended, fully loaded cost per FTE-month by seniority band. NEVER individual salaries:
# the model needs a rate card, not anyone's pay.
COST_BANDS = [("cb_junior", "Junior", 5500), ("cb_mid", "Mid", 7500),
              ("cb_senior", "Senior", 9500), ("cb_lead", "Lead / Head", 12000)]
LEAD_TITLES = ("Head of", "VP ", "CFO", "Program Director", "Engineering Manager")
SENIOR_WORDS = ("Senior", "Staff", "Lead", "Product Manager", "Manager", "Counsel", "Head")


def band_for(title, tenure):
    if "Junior" in title:
        return "cb_junior"
    if title.startswith(LEAD_TITLES) or any(t in title for t in LEAD_TITLES):
        return "cb_lead"
    if any(w in title for w in SENIOR_WORDS) or tenure >= 5:
        return "cb_senior"
    return "cb_junior" if tenure <= 1 else "cb_mid"


for row, (name, title, unit, tenure, mgr, _) in zip(people, PEOPLE):
    row["cost_band_id"] = band_for(title, tenure)
cost_band = [{"id": i, "tenant_id": T, "name": n, "eur_per_fte_month": r} for i, n, r in COST_BANDS]

# expected annual value (EUR), how it was derived, and how sure we are.
# value_type: revenue | savings | risk_avoided | strategic | none
VALUES = {
    "Customer Portal 2.0": (1_100_000, "revenue", "Retention + upsell on 140 portal-active accounts", 0.6),
    "Predictive ETA Engine": (1_500_000, "revenue", "Premium tier priced on ETA accuracy; 3 pilot accounts signed", 0.7),
    "Cloud Migration": (900_000, "savings", "Cloud cost -20% on EUR 4.5M annual spend", 0.8),
    "Data Platform Consolidation": (420_000, "savings", "Retire 3 duplicate warehouses and reporting licences", 0.7),
    "Warehouse Automation Pilot": (210_000, "savings", "Pilot site only; scale-up case not yet proven", 0.4),
    "ISO 27001 Certification": (1_300_000, "revenue", "Unblocks 5 enterprise deals currently gated on certification", 0.75),
    "EU Expansion Playbook": (1_400_000, "revenue", "Pipeline of 9 qualified EU accounts at 50% win rate", 0.5),
    "Pricing Revamp": (700_000, "revenue", "+2.5% net price realisation on EUR 28M ARR", 0.6),
    "API Platform": (600_000, "revenue", "Partner integrations: 12 signed intents", 0.55),
    "Finance Close Automation": (110_000, "savings", "5 days -> 2 days close; 1.1 FTE of manual work", 0.8),
    "Mobile Driver App": (250_000, "revenue", "Driver-side upsell; demand validated by 4 interviews only", 0.35),
    "Hackathon Tooling": (0, "none", "No business case recorded", 0.0),
}
PLANNED_MONTHS = {}
from datetime import date
for p in projects:
    a, b = date.fromisoformat(p["start_on"]), date.fromisoformat(p["end_on"])
    p["planned_months"] = round((b - a).days / 30.4, 1)
    v, vt, basis, conf = VALUES[p["name"]]
    p.update({"expected_value_eur": v, "value_type": vt, "value_basis": basis, "value_confidence": conf})

ALIASES = {
    "Python": ["python3", "pandas", "numpy", "fastapi", "django"],
    "TypeScript": ["typescript", "javascript", "react", "node.js", "nodejs", "react native", "vue"],
    "AWS": ["amazon web services", "ec2", "s3", "lambda", "cloudformation", "terraform", "gcp", "azure"],
    "Kubernetes": ["k8s", "helm", "docker", "containers", "eks", "openshift"],
    "API Design": ["rest api", "rest apis", "openapi", "graphql", "microservices", "api gateway"],
    "Cybersecurity": ["infosec", "security audit", "penetration testing", "pentest", "iso 27001", "soc 2", "soc2", "siem", "incident response", "information security"],
    "SQL": ["postgresql", "postgres", "mysql", "bigquery", "snowflake", "data modelling", "data modeling", "dbt"],
    "Data Engineering": ["etl", "airflow", "spark", "data pipelines", "data pipeline", "data warehouse", "kafka"],
    "Machine Learning": ["ml", "llm", "llms", "deep learning", "scikit-learn", "pytorch", "tensorflow", "nlp", "forecasting", "predictive model", "predictive models", "generative ai"],
    "UX Research": ["user research", "usability testing", "user interviews", "ux"],
    "UI Design": ["figma", "design system", "interface design", "ui"],
    "Product Discovery": ["product discovery", "customer discovery", "product management", "jobs to be done"],
    "Roadmapping": ["roadmap", "product strategy", "okrs"],
    "Agile Delivery": ["scrum", "kanban", "agile", "sprint planning"],
    "Program Management": ["programme management", "program manager", "pmo", "portfolio management", "pmp", "prince2"],
    "Risk Management": ["risk assessment", "risk register", "enterprise risk", "iso 31000", "grc"],
    "Change Management": ["change management", "adkar", "organisational change", "organizational change", "transformation"],
    "Vendor Management": ["procurement", "supplier management", "vendor selection", "sourcing"],
    "Stakeholder Communication": ["stakeholder management", "executive reporting", "presentations", "board reporting"],
    "Coaching": ["mentoring", "mentor", "coaching", "training delivery", "people development"],
    "Recruiting": ["talent acquisition", "recruitment", "hiring", "sourcing candidates"],
    "Supply Chain": ["logistics", "warehouse", "inventory", "demand planning", "s&op", "freight"],
    "GDPR & Compliance": ["gdpr", "data protection", "dpo", "privacy", "dpia", "compliance", "regulatory", "ai act"],
    "Financial Reporting": ["ifrs", "gaap", "month-end close", "financial statements", "controlling", "budgeting", "forecast accuracy"],
    "Enterprise Sales": ["b2b sales", "enterprise sales", "account executive", "pipeline management", "solution selling"],
    "Customer Success": ["customer success", "account management", "churn", "onboarding customers", "nps", "retention"],
    "Negotiation": ["negotiation", "contract negotiation", "commercial terms"],
}
skill_alias = [{"skill_id": SKILL_ID[k], "alias": a} for k, v in ALIASES.items() for a in v]

TABLES = {
    "tenant": [{"id": T, "name": "Aldermoor Systems (synthetic demo)"}],
    "org_unit": org_units, "person": people, "skill": skills, "project": projects, "goal": goals,
    "cost_band": cost_band, "skill_alias": skill_alias, "hiring_need": [], "person_aspiration": [], "evidence": [],
    "person_skill": person_skill, "person_project": person_project,
    "project_skill": project_skill, "project_goal": project_goal,
}

if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    for table, rows in TABLES.items():
        (OUT / f"{table}.json").write_text(json.dumps(rows, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    print({k: len(v) for k, v in TABLES.items()})
