"""Board integration: Jira mapping, Kanban CSV adapter, analyses, payloads, and the client on a fake transport."""
import io
import json
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from integrations import boards  # noqa: E402

S = ROOT / "data" / "sample"
load = lambda n: json.loads((S / f"{n}.json").read_text(encoding="utf-8"))


def ctx():
    ident = load("external_identity")
    return {"tenant": "t_demo", "people_by_account": {i["external_id"]: i["person_id"] for i in ident},
            "people_by_email": {"sanne@aldermoor.example": "per_37"}, "project_by_key": {p["external_ref"]: p["id"] for p in load("project")},
            "skills": load("skill"), "aliases": load("skill_alias")}


class Mapping(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.issues = json.loads((S / "jira_issues.json").read_text(encoding="utf-8"))["issues"]
        cls.tickets = [boards.from_jira_issue(i) for i in cls.issues]
        cls.mapped = boards.map_tickets(cls.tickets, ctx())
        cls.wi = cls.mapped["work_item"]

    def test_every_assignee_and_project_resolves(self):
        self.assertEqual(self.mapped["unmatched_assignees"], [])
        self.assertEqual(self.mapped["unknown_projects"], [])
        self.assertEqual(len(self.wi), len(self.issues))

    def test_fixture_matches_jira_rest_shape(self):
        f = self.issues[5]["fields"]
        for k in ("summary", "issuetype", "status", "assignee", "labels", "customfield_10016", "project", "created"):
            self.assertIn(k, f)
        self.assertIn(f["status"]["statusCategory"]["key"], ("new", "indeterminate", "done"))

    def test_skills_come_from_labels(self):
        k8s = next(w for w in self.wi if w["external_ref"] == "CLOUD-2")
        skills = {r["skill_id"] for r in self.mapped["work_item_skill"] if r["work_item_id"] == k8s["id"]}
        self.assertTrue(skills)

    def test_observed_allocation_and_planted_stories(self):
        obs = boards.observed_allocation(self.wi)
        self.assertEqual(obs[("per_01", "prj_cloud_migration")], 95)          # Marta: planned 60%, over-committed
        self.assertEqual(obs.get(("per_02", "prj_predictive_eta_engine"), 0), 0)   # Jonas planned 30%, invisible in Jira
        self.assertLess(obs[("per_03", "prj_customer_portal_2_0")], 30)       # Priya planned 60%

    def test_evidence_never_adds_a_skill_by_itself(self):
        props = boards.evidence_proposals(self.wi, self.mapped["work_item_skill"], load("person_skill"))
        mateo_aws = [p for p in props if p["person_id"] == "per_10" and p["skill_id"] == "skl_aws"]
        self.assertEqual(len(mateo_aws), 1)
        self.assertEqual(mateo_aws[0]["kind"], "new")                         # a proposal, not a claim
        self.assertTrue(all(p["to"] == 0.85 for p in props if p["kind"] == "raise"))

    def test_summary_file_matches(self):
        summary = json.loads((S / "jira_summary.json").read_text())
        obs = boards.observed_allocation(self.wi)
        self.assertEqual(summary["observed_sum_pct"], sum(obs.values()))
        self.assertEqual(summary["work_items"], len(self.wi))


class Adf(unittest.TestCase):
    def test_roundtrip(self):
        text = "First paragraph.\n\nSecond one."
        self.assertEqual(boards.adf_text(boards.to_adf(text)).strip().split("\n"), ["First paragraph.", "Second one."])

    def test_none_and_empty(self):
        self.assertEqual(boards.adf_text(None), "")
        self.assertEqual(boards.to_adf("")["type"], "doc")


class KanbanCsv(unittest.TestCase):
    def test_generic_board_export(self):
        csv_text = ("id,project,title,status,assignee,points,labels,resolved\n"
                    "CLOUD-90,CLOUD,Rotate cluster secrets,Doing,sanne@aldermoor.example,3,cybersecurity;security,\n"
                    "CLOUD-91,CLOUD,Write runbook,Backlog,,2,,\n")
        import csv
        tickets = boards.from_csv_rows(list(csv.DictReader(io.StringIO(csv_text))))
        self.assertEqual([t["status_category"] for t in tickets], ["indeterminate", "new"])
        mapped = boards.map_tickets(tickets, ctx())
        first = mapped["work_item"][0]
        self.assertEqual(first["assignee_id"], "per_37")                      # matched by email
        self.assertIn("skl_cybersecurity", {r["skill_id"] for r in mapped["work_item_skill"] if r["work_item_id"] == first["id"]})


class Payloads(unittest.TestCase):
    plan = {"key": "MRZP", "title": "Multi-region platform", "description": "Zero downtime.\n\nValue: 5 deals.",
            "stories": [{"summary": "Enable autoscaling", "skill": "Kubernetes", "min_level": 5, "assignee_person_id": "per_01", "hiring": False},
                        {"summary": "Hire: Site Reliability Engineer", "skill": "Kubernetes", "min_level": 5, "assignee_person_id": None, "hiring": True}]}

    def test_epic_then_stories(self):
        p = boards.build_issue_payloads(self.plan, load("external_identity"))
        self.assertEqual(p["epic"]["fields"]["issuetype"]["name"], "Epic")
        self.assertEqual(p["epic"]["fields"]["description"]["type"], "doc")
        s0, s1 = (s["fields"] for s in p["stories"])
        self.assertEqual(s0["customfield_10016"], 8)
        self.assertEqual(s0["assignee"]["accountId"], next(i["external_id"] for i in load("external_identity") if i["person_id"] == "per_01"))
        self.assertNotIn("assignee", s1)
        self.assertIn("hiring", s1["labels"])
        self.assertIn("kubernetes", s0["labels"])


class FakeTransport:
    def __init__(self, replies):
        self.replies, self.calls = list(replies), []

    def __call__(self, req, timeout=None):
        self.calls.append((req.get_method(), req.full_url, json.loads(req.data) if req.data else None, req.headers))
        body = json.dumps(self.replies.pop(0)).encode()
        return type("R", (), {"read": lambda s: body, "__enter__": lambda s: s, "__exit__": lambda s, *a: None})()


class Client(unittest.TestCase):
    def test_search_follows_token_pagination_and_authenticates(self):
        t = FakeTransport([{"issues": [{"key": "A-1"}], "nextPageToken": "tok", "isLast": False}, {"issues": [{"key": "A-2"}], "isLast": True}])
        c = boards.JiraClient("https://x.atlassian.net/", "me@x.com", "secret", opener=t)
        self.assertEqual([i["key"] for i in c.search("project = A")], ["A-1", "A-2"])
        self.assertTrue(t.calls[0][1].endswith("/rest/api/3/search/jql"))
        self.assertEqual(t.calls[1][2]["nextPageToken"], "tok")
        self.assertTrue(t.calls[0][3]["Authorization"].startswith("Basic "))

    def test_push_plan_creates_epic_before_children(self):
        t = FakeTransport([{"key": "MRZP-1"}, {"issues": [{"key": "MRZP-2"}, {"key": "MRZP-3"}]}])
        c = boards.JiraClient("https://x.atlassian.net", "me@x.com", "secret", opener=t)
        made = c.push_plan(Payloads.plan, load("external_identity"))
        self.assertEqual(made, {"epic": "MRZP-1", "stories": ["MRZP-2", "MRZP-3"]})
        self.assertTrue(t.calls[0][1].endswith("/rest/api/3/issue"))
        self.assertTrue(t.calls[1][1].endswith("/rest/api/3/issue/bulk"))
        self.assertEqual(t.calls[1][2]["issueUpdates"][0]["fields"]["parent"]["key"], "MRZP-1")


if __name__ == "__main__":
    unittest.main()
