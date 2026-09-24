#!/usr/bin/env python3
"""Board integrations for Maieutica: Jira Cloud (REST v3) and generic Kanban CSV.

  board -> graph    normalise tickets, resolve assignees, detect skills, derive observed
                    allocation and skill evidence
  graph -> board    turn a proposed use case (team, skills, hires) into Jira issue payloads

Design rules (same as the rest of the product):
  * Evidence from a board never adds a skill by itself. It raises confidence on an existing
    claim, or PROPOSES a new one for the person to confirm.
  * Tickets are stored as `work_item` rows next to the graph; nothing here writes to person_skill.
  * Pure functions on plain dicts. Only JiraClient touches the network.

The Jira client follows Atlassian's documented REST v3 endpoints (token-paginated
POST /rest/api/3/search/jql, POST /rest/api/3/issue, POST /rest/api/3/issue/bulk).
It is exercised in tests against a fake transport, not against a live Jira: verify field ids
(story points are customfield_10016 on many sites, but not all) on your instance.

CLI:
  python3 integrations/boards.py map   data/sample/jira_issues.json   # summary of what a sync derives
  python3 integrations/boards.py csv   board.csv                      # same, for a Kanban CSV export
  python3 integrations/boards.py sync  "project in (PORT, CLOUD)"     # live: needs JIRA_BASE_URL/JIRA_EMAIL/JIRA_TOKEN
"""
import base64
import csv
import json
import os
import re
import sys
import urllib.request
from collections import defaultdict
from datetime import date, datetime, timedelta

POINTS_FIELD = os.environ.get("JIRA_POINTS_FIELD", "customfield_10016")
FLAG_FIELD = "customfield_10021"
ASOF = date(2026, 9, 24)            # demo "today"; live syncs pass date.today()
WINDOW_DAYS = 30
POINTS_PER_FTE_MONTH = 20           # calibration: one FTE closes about 20 points a month
JIRA_FIELDS = ["summary", "description", "issuetype", "status", "priority", "assignee", "labels", "components",
               "project", "parent", "created", "resolutiondate", POINTS_FIELD, FLAG_FIELD]


# ------------------------------------------------------------------ Atlassian Document Format
def adf_text(node):
    """Flatten an ADF document (Jira Cloud v3 descriptions) to plain text."""
    if node is None:
        return ""
    if isinstance(node, str):
        return node
    if isinstance(node, list):
        return "\n".join(adf_text(n) for n in node)
    t = node.get("type")
    if t == "text":
        return node.get("text", "")
    inner = "".join(adf_text(c) for c in node.get("content", []))
    return inner + ("\n" if t in ("paragraph", "heading", "listItem") else "")


def to_adf(text):
    """Plain text -> minimal ADF document (paragraphs split on blank lines)."""
    paras = [p.strip() for p in (text or "").split("\n\n") if p.strip()] or [""]
    return {"type": "doc", "version": 1,
            "content": [{"type": "paragraph", "content": [{"type": "text", "text": p}] if p else []} for p in paras]}


def _day(s):
    if not s:
        return None
    return datetime.strptime(s[:10], "%Y-%m-%d").date()


# ------------------------------------------------------------------ adapters -> normalised ticket
def from_jira_issue(issue):
    f = issue.get("fields", {})
    assignee = f.get("assignee") or {}
    cat = ((f.get("status") or {}).get("statusCategory") or {}).get("key", "new")
    return {
        "key": issue["key"], "project_key": (f.get("project") or {}).get("key") or issue["key"].split("-")[0],
        "summary": f.get("summary") or "", "description": adf_text(f.get("description")),
        "type": (f.get("issuetype") or {}).get("name", "Task"), "status": (f.get("status") or {}).get("name", "To Do"),
        "status_category": cat, "points": f.get(POINTS_FIELD),
        "assignee_account": assignee.get("accountId"), "assignee_email": assignee.get("emailAddress"), "assignee_name": assignee.get("displayName"),
        "labels": [l for l in (f.get("labels") or [])], "components": [c.get("name", "") for c in (f.get("components") or [])],
        "created": _day(f.get("created")), "resolved": _day(f.get("resolutiondate")),
        "blocked": bool(f.get(FLAG_FIELD)), "priority": (f.get("priority") or {}).get("name"),
    }


def from_csv_rows(rows):
    """Generic Kanban export (Trello, Planner, Azure Boards...). Columns: id,project,title,status,assignee,points,labels,resolved."""
    cat = {"backlog": "new", "to do": "new", "todo": "new", "doing": "indeterminate", "in progress": "indeterminate",
           "review": "indeterminate", "in review": "indeterminate", "done": "done", "closed": "done"}
    out = []
    for r in rows:
        status = (r.get("status") or "To Do").strip()
        out.append({
            "key": r["id"].strip(), "project_key": (r.get("project") or r["id"].split("-")[0]).strip(), "summary": (r.get("title") or "").strip(),
            "description": "", "type": (r.get("type") or "Task").strip(), "status": status, "status_category": cat.get(status.lower(), "new"),
            "points": float(r["points"]) if (r.get("points") or "").strip() else None,
            "assignee_account": None, "assignee_email": (r.get("assignee") or "").strip() or None, "assignee_name": None,
            "labels": [l.strip() for l in (r.get("labels") or "").replace(";", ",").split(",") if l.strip()], "components": [],
            "created": None, "resolved": _day(r.get("resolved")), "blocked": (r.get("blocked") or "").strip().lower() in ("1", "true", "yes"), "priority": None,
        })
    return out


# ------------------------------------------------------------------ mapping
def skill_matcher(skills, aliases):
    """text -> [skill_id]. Labels like `data-engineering` match the skill name `Data Engineering`."""
    terms = defaultdict(set)
    for s in skills:
        terms[s["id"]].add(s["name"].lower())
    for a in aliases:
        terms[a["skill_id"]].add(a["alias"].lower())
    res = {sid: [re.compile(r"(^|[^a-z0-9])" + re.escape(t) + r"(?![a-z0-9])", re.I) for t in ts] for sid, ts in terms.items()}

    def match(text):
        text = re.sub(r"[-_]", " ", text)
        return [sid for sid, rs in res.items() if any(r.search(text) for r in rs)]
    return match


def _slug(s):
    return re.sub(r"[^a-z0-9]+", "_", s.lower()).strip("_")


def map_tickets(tickets, ctx):
    """Normalised tickets -> Maieutica rows. ctx: tenant, people_by_account, people_by_email, project_by_key, skills, aliases."""
    match = skill_matcher(ctx["skills"], ctx["aliases"])
    work_items, item_skills, unmatched, unknown_projects = [], [], set(), set()
    for t in tickets:
        pid = ctx["project_by_key"].get(t["project_key"])
        if not pid:
            unknown_projects.add(t["project_key"])
            continue
        person = ctx["people_by_account"].get(t["assignee_account"]) or ctx["people_by_email"].get((t["assignee_email"] or "").lower())
        if (t["assignee_account"] or t["assignee_email"]) and not person:
            unmatched.add(t["assignee_name"] or t["assignee_account"] or t["assignee_email"])
        wid = "wi_" + _slug(t["key"])
        work_items.append({
            "id": wid, "tenant_id": ctx["tenant"], "project_id": pid, "external_ref": t["key"], "title": t["summary"], "item_type": t["type"],
            "status": t["status"], "status_category": t["status_category"], "story_points": t["points"], "assignee_id": person,
            "created_on": t["created"].isoformat() if t["created"] else None, "resolved_on": t["resolved"].isoformat() if t["resolved"] else None,
            "blocked": 1 if t["blocked"] else 0, "labels": ",".join(t["labels"]), "source": ctx.get("source", "jira"),
        })
        if t["type"] != "Epic":
            text = " ".join(t["labels"] + t["components"] + [t["summary"], t["description"]])
            for sid in dict.fromkeys(match(text)):
                item_skills.append({"work_item_id": wid, "skill_id": sid})
    return {"work_item": work_items, "work_item_skill": item_skills, "unmatched_assignees": sorted(unmatched), "unknown_projects": sorted(unknown_projects)}


# ------------------------------------------------------------------ analyses derived from a board
def _counts(w, asof):
    """A ticket counts toward observed allocation when it is in flight, or was closed inside the window."""
    if w["item_type"] == "Epic" or not w["assignee_id"] or not w["story_points"]:
        return False
    if w["status_category"] == "indeterminate":
        return True
    return w["status_category"] == "done" and bool(w["resolved_on"]) and _day(w["resolved_on"]) >= asof - timedelta(days=WINDOW_DAYS)


def observed_allocation(work_items, asof=ASOF):
    """{(person_id, project_id): percent of an FTE actually visible on the board in the last 30 days}"""
    pts = defaultdict(float)
    for w in work_items:
        if _counts(w, asof):
            pts[(w["assignee_id"], w["project_id"])] += w["story_points"]
    return {k: round(v / POINTS_PER_FTE_MONTH * 100) for k, v in pts.items()}


def evidence_proposals(work_items, item_skills, person_skills, asof=ASOF):
    """Skill evidence seen in work. 'raise' strengthens an existing claim; 'new' is only a proposal for the person to confirm."""
    skills_of = defaultdict(list)
    for r in item_skills:
        skills_of[r["work_item_id"]].append(r["skill_id"])
    seen = defaultdict(lambda: {"keys": [], "points": 0.0})
    for w in work_items:
        if w["item_type"] == "Epic" or not w["assignee_id"] or w["status_category"] == "new":
            continue
        for sid in skills_of.get(w["id"], []):
            e = seen[(w["assignee_id"], sid)]
            e["keys"].append(w["external_ref"]); e["points"] += w["story_points"] or 0
    claims = {(r["person_id"], r["skill_id"]): r for r in person_skills if not r.get("valid_to")}
    out = []
    for (pid, sid), e in sorted(seen.items()):
        claim = claims.get((pid, sid))
        if claim and claim["confidence"] < 0.85:
            out.append({"person_id": pid, "skill_id": sid, "kind": "raise", "tickets": e["keys"], "points": e["points"], "from": claim["confidence"], "to": 0.85})
        elif not claim:
            out.append({"person_id": pid, "skill_id": sid, "kind": "new", "tickets": e["keys"], "points": e["points"], "level": 3 if e["points"] >= 8 else 2})
    return out


# ------------------------------------------------------------------ graph -> board
STORY_POINTS_FOR_LEVEL = {5: 8, 4: 5}


def build_issue_payloads(plan, identities):
    """plan: {key, title, description, stories:[{summary, skill, min_level, assignee_person_id|None, hiring:bool, description}]}
       -> {"epic": <POST /rest/api/3/issue>, "stories": [<bodies for POST /rest/api/3/issue/bulk>]}  (stories reference the epic key created by step 1)"""
    acct = {i["person_id"]: i["external_id"] for i in identities if i["system"] == "jira"}
    epic = {"fields": {"project": {"key": plan["key"]}, "issuetype": {"name": "Epic"}, "summary": plan["title"],
                       "description": to_adf(plan.get("description", "")), "labels": ["maieutica"]}}
    stories = []
    for s in plan["stories"]:
        f = {"project": {"key": plan["key"]}, "issuetype": {"name": "Story"}, "summary": s["summary"], "description": to_adf(s.get("description", "")),
             "labels": ["maieutica", re.sub(r"[^a-z0-9]+", "-", s["skill"].lower()).strip("-")] + (["hiring"] if s.get("hiring") else []),
             POINTS_FIELD: STORY_POINTS_FOR_LEVEL.get(s["min_level"], 3), "parent": {"key": "{epic-key}"}}
        if s.get("assignee_person_id") and acct.get(s["assignee_person_id"]):
            f["assignee"] = {"accountId": acct[s["assignee_person_id"]]}
        stories.append({"fields": f})
    return {"epic": epic, "stories": stories}


# ------------------------------------------------------------------ live client (network; not covered by live tests)
class JiraClient:
    def __init__(self, base_url=None, email=None, token=None, opener=None):
        self.base = (base_url or os.environ["JIRA_BASE_URL"]).rstrip("/")
        cred = "%s:%s" % (email or os.environ["JIRA_EMAIL"], token or os.environ["JIRA_TOKEN"])
        self.auth = "Basic " + base64.b64encode(cred.encode()).decode()
        self.opener = opener or urllib.request.urlopen

    def _call(self, method, path, body=None):
        req = urllib.request.Request(self.base + path, method=method, data=None if body is None else json.dumps(body).encode(),
                                     headers={"Authorization": self.auth, "Accept": "application/json", "Content-Type": "application/json"})
        with self.opener(req, timeout=30) as r:
            raw = r.read()
        return json.loads(raw) if raw else {}

    def search(self, jql, page=100):
        """Yield every issue matching the JQL (token pagination)."""
        token = None
        while True:
            body = {"jql": jql, "fields": JIRA_FIELDS, "maxResults": page}
            if token:
                body["nextPageToken"] = token
            res = self._call("POST", "/rest/api/3/search/jql", body)
            for issue in res.get("issues", []):
                yield issue
            token = res.get("nextPageToken")
            if res.get("isLast", True) or not token:
                return

    def create_issue(self, payload):
        return self._call("POST", "/rest/api/3/issue", payload)

    def create_issues_bulk(self, payloads):
        return self._call("POST", "/rest/api/3/issue/bulk", {"issueUpdates": payloads})

    def push_plan(self, plan, identities):
        """Create the epic, then the stories under it. Returns the created keys."""
        p = build_issue_payloads(plan, identities)
        epic = self.create_issue(p["epic"])
        for s in p["stories"]:
            s["fields"]["parent"] = {"key": epic["key"]}
        made = self.create_issues_bulk(p["stories"])
        return {"epic": epic["key"], "stories": [i["key"] for i in made.get("issues", [])]}


# ------------------------------------------------------------------ CLI
def _demo_context(root):
    load = lambda n: json.loads(open(os.path.join(root, "data", "sample", n + ".json"), encoding="utf-8").read())
    people = load("person")
    ident = load("external_identity")
    return {"tenant": "t_demo", "people_by_account": {i["external_id"]: i["person_id"] for i in ident if i["system"] == "jira"},
            "people_by_email": {}, "project_by_key": {p["external_ref"]: p["id"] for p in load("project") if p.get("external_ref")},
            "skills": load("skill"), "aliases": load("skill_alias"), "people": people}


def summarize(mapped, ctx, root):
    wi = mapped["work_item"]
    person_skill = json.loads(open(os.path.join(root, "data", "sample", "person_skill.json"), encoding="utf-8").read())
    obs = observed_allocation(wi)
    props = evidence_proposals(wi, mapped["work_item_skill"], person_skill)
    return {"work_items": len(wi), "epics": sum(1 for w in wi if w["item_type"] == "Epic"), "assigned": sum(1 for w in wi if w["assignee_id"]),
            "skill_links": len(mapped["work_item_skill"]), "unmatched_assignees": mapped["unmatched_assignees"], "unknown_projects": mapped["unknown_projects"],
            "observed_pairs": len(obs), "observed_sum_pct": sum(obs.values()),
            "evidence": {"raise": sum(1 for p in props if p["kind"] == "raise"), "new": sum(1 for p in props if p["kind"] == "new")}}


def main(argv):
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    if len(argv) < 3 or argv[1] not in ("map", "csv", "sync"):
        print(__doc__); return 2
    ctx = _demo_context(root)
    if argv[1] == "map":
        tickets = [from_jira_issue(i) for i in json.load(open(argv[2], encoding="utf-8"))["issues"]]
    elif argv[1] == "csv":
        tickets = from_csv_rows(list(csv.DictReader(open(argv[2], encoding="utf-8"))))
    else:
        tickets = [from_jira_issue(i) for i in JiraClient().search(argv[2])]
    print(json.dumps(summarize(map_tickets(tickets, ctx), ctx, root), indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
