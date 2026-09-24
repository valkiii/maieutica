"""Generate a demo Jira export (REST v3 issue shape) for the synthetic company.

Hand-designed stories inside:
  * Cloud Migration: every open Kubernetes ticket sits with Marta (key-person concentration)
  * ISO 27001: an unassigned GDPR ticket (only one real expert), and a blocked ticket
  * planned vs observed: Marta over-committed, Priya and Jonas far below plan, Ewan over-committed
  * Mateo works AWS tickets and Nia a Data Engineering ticket without having those skills on file
"""
import re
import zlib
from datetime import date, timedelta

ASOF = date(2026, 9, 24)
KEYS = {"Customer Portal 2.0": "PORT", "Predictive ETA Engine": "ETA", "Cloud Migration": "CLOUD", "Data Platform Consolidation": "DATA",
        "Warehouse Automation Pilot": "WH", "ISO 27001 Certification": "ISO", "EU Expansion Playbook": "EU", "Pricing Revamp": "PRICE",
        "API Platform": "API", "Finance Close Automation": "FIN", "Mobile Driver App": "MOB", "Hackathon Tooling": "HACK"}
FACTORS = [1.0, 0.9, 1.1, 0.7, 1.0, 1.3, 0.5, 1.0]
FACTOR_OVERRIDE = {("Marta Lindqvist", "Cloud Migration"): 1.5, ("Priya Nair", "Customer Portal 2.0"): 0.4, ("Jonas Weber", "Predictive ETA Engine"): 0.0,
                   ("Aiko Tanaka", "Customer Portal 2.0"): 1.3, ("Fatima Bensaid", "Data Platform Consolidation"): 0.0, ("Ewan MacLeod", "ISO 27001 Certification"): 1.6}
FORCE_SKILLS = {("Marta Lindqvist", "Cloud Migration"): ["Kubernetes", "Kubernetes", "Kubernetes", "AWS"], ("Fatima Bensaid", "Cloud Migration"): ["AWS"],
                ("Mateo Silva", "API Platform"): ["AWS", "AWS", "Python"], ("Nia Okafor", "Data Platform Consolidation"): ["Data Engineering", "SQL"]}
STATUS_CYCLE = {("Marta Lindqvist", "Cloud Migration"): ["In Progress", "In Progress", "In Review", "Done"]}
DEFAULT_CYCLE = ["In Progress", "In Review", "Done", "In Progress", "Done", "In Review"]
BACKLOG_SKILLS = {"ISO 27001 Certification": ["GDPR & Compliance", "Cybersecurity"], "Cloud Migration": ["Cybersecurity", "Kubernetes"],
                  "Predictive ETA Engine": ["Machine Learning", "Data Engineering"], "Customer Portal 2.0": ["UX Research", "TypeScript"]}
CATEGORY = {"To Do": ("new", "To Do"), "In Progress": ("indeterminate", "In Progress"), "In Review": ("indeterminate", "In Progress"), "Done": ("done", "Done")}


def _slug(s):
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


def _iso(d, hour=9):
    return "%sT%02d:12:00.000+0000" % (d.isoformat(), hour)


def account_id(name):
    return "712020:%08x-%s" % (zlib.crc32(name.encode()), _slug(name)[:8])


def email(name):
    return "%s@aldermoor.example" % _slug(name).replace("-", ".")


def build(PEOPLE, PERSON_ID, PROJECTS, titles, tenant):
    mine = {p[0]: p[5] for p in PEOPLE}
    identities = [{"tenant_id": tenant, "person_id": PERSON_ID[p[0]], "system": "jira", "external_id": account_id(p[0])} for p in PEOPLE]
    issues, counter, num = [], 0, {}

    def add(pname, summary, itype, status, pts, who, skill, created, resolved=None, flagged=False, priority="Medium"):
        nonlocal counter
        key = KEYS[pname]; num[key] = num.get(key, 0) + 1; counter += 1
        cat, cname = CATEGORY[status]
        who_obj = None if not who else {"accountId": account_id(who), "displayName": who, "emailAddress": email(who)}
        f = {"summary": summary, "issuetype": {"name": itype}, "project": {"key": key, "name": pname},
             "status": {"name": status, "statusCategory": {"key": cat, "name": cname}}, "priority": {"name": priority}, "assignee": who_obj,
             "labels": [_slug(skill)] if skill else [], "components": [], "created": _iso(created), "resolutiondate": _iso(resolved, 16) if resolved else None,
             "customfield_10016": pts, "customfield_10021": [{"value": "Impediment"}] if flagged else None,
             "description": {"type": "doc", "version": 1, "content": [{"type": "paragraph", "content": [{"type": "text", "text": summary + ". Reviewed with the team before merge."}]}]} if itype != "Epic" else None}
        if itype != "Epic":
            f["parent"] = {"key": key + "-1", "fields": {"summary": pname, "issuetype": {"name": "Epic"}}}
        issues.append({"id": str(10000 + counter), "key": "%s-%d" % (key, num[key]), "fields": f})

    for pname, status, start, end, gls, req, members in PROJECTS:
        key = KEYS[pname]; used = {}
        ROUNDS = ["", " (phase 2)", " (follow-up)", " (phase 3)", " (hardening)", " (handover)"]      # a skill has two titles; later tickets get a suffix

        def title(skill):
            n = used.get(skill, -1) + 1
            used[skill] = n
            return titles[skill][n % 2] + ROUNDS[min(n // 2, len(ROUNDS) - 1)]

        add(pname, pname, "Epic", "To Do" if status == "planned" else "In Progress", None, None, None, date.fromisoformat(start))
        if status != "planned":
            for ti, (person, role, alloc) in enumerate(members):
                f = FACTOR_OVERRIDE.get((person, pname), FACTORS[zlib.crc32((person + pname).encode()) % len(FACTORS)])
                target = round(alloc / 100 * 20 * f)
                if target <= 0:
                    continue
                cycle = STATUS_CYCLE.get((person, pname), DEFAULT_CYCLE)
                forced = FORCE_SKILLS.get((person, pname))
                cands = sorted([s for s in req if s in mine[person]], key=lambda s: (-mine[person][s], -req[s]))
                left, j = target, 0
                while left > 0 and j < 4:
                    pts = min([8, 5, 3, 2, 1], key=lambda x: abs(x - min(left, [5, 3, 3, 2][j % 4]))) if j < 3 else min([8, 5, 3, 2, 1], key=lambda x: abs(x - left))
                    skill = forced[j % len(forced)] if forced else (cands[j % min(len(cands), 2)] if cands else max(mine[person], key=mine[person].get))
                    st = cycle[j % len(cycle)]
                    resolved = ASOF - timedelta(days=3 + (j * 5 + ti * 3) % 24) if st == "Done" else None
                    created = (resolved or ASOF) - timedelta(days=5 + (j * 3 + ti) % 15)
                    flagged = pname in ("ISO 27001 Certification", "Warehouse Automation Pilot") and role == "Lead" and st == "In Progress" and j == 0
                    itype = "Bug" if (j == 3 and ti % 2) else "Story" if j % 2 == 0 else "Task"
                    add(pname, title(skill), itype, st, pts, person, skill, created, resolved, flagged, ["High", "Medium", "Medium", "Low"][j % 4])
                    left -= pts; j += 1
            lead = members[0][0]
            for k, skill in enumerate([s for s in req][:2]):          # older closed work, outside the 30-day window
                d = ASOF - timedelta(days=45 + 20 * k)
                add(pname, title(skill), "Story", "Done", 3, lead, skill, d - timedelta(days=9), d)
        backlog = BACKLOG_SKILLS.get(pname) or sorted(req, key=lambda s: -req[s])[:2 if status != "planned" else 4]
        for k, skill in enumerate(backlog):
            add(pname, title(skill), "Story", "To Do", 5 if req.get(skill, 3) >= 4 else 3, None, skill, ASOF - timedelta(days=2 + k), priority="High" if k == 0 else "Medium")
    return issues, identities
