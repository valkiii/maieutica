"""Load the sample data into schema.sql (SQLite) and check the derived views.

Run:  python3 -m unittest discover -s tests -v
"""
import json
import sqlite3
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LOAD_ORDER = ["tenant", "cost_band", "org_unit", "person", "skill", "skill_alias", "project", "goal",
              "person_skill", "person_project", "project_skill", "project_goal",
              "hiring_need", "person_aspiration", "evidence"]


def load_db():
    db = sqlite3.connect(":memory:")
    db.row_factory = sqlite3.Row
    db.executescript((ROOT / "schema" / "schema.sql").read_text())
    # self-references (person.manager_id) point forward in the file: check FKs at commit
    db.execute("PRAGMA defer_foreign_keys = ON")
    for table in LOAD_ORDER:
        rows = json.loads((ROOT / "data" / "sample" / f"{table}.json").read_text())
        for r in rows:
            cols = ", ".join(r)
            marks = ", ".join("?" for _ in r)
            db.execute(f"INSERT INTO {table} ({cols}) VALUES ({marks})", list(r.values()))
    db.commit()
    return db


class SchemaTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.db = load_db()

    def test_foreign_keys_hold(self):
        self.assertEqual(self.db.execute("PRAGMA foreign_key_check").fetchall(), [])

    def test_collaboration_is_symmetric_free(self):
        # each pair appears once (person_a < person_b)
        n = self.db.execute("SELECT COUNT(*) FROM v_person_collaboration").fetchone()[0]
        d = self.db.execute("SELECT COUNT(*) FROM (SELECT DISTINCT person_a, person_b FROM v_person_collaboration)").fetchone()[0]
        self.assertEqual(n, d)
        self.assertGreater(n, 50)

    def test_bus_factor_stories(self):
        risky = {r["skill_name"] for r in self.db.execute("SELECT * FROM v_skill_supply WHERE at_risk = 1")}
        self.assertEqual({"Kubernetes", "Cybersecurity", "GDPR & Compliance"}, risky)

    def test_orphan_project(self):
        names = [r["name"] for r in self.db.execute("SELECT * FROM v_orphan_project")]
        self.assertEqual(names, ["Hackathon Tooling"])

    def test_overallocation(self):
        full = {r["person_id"] for r in self.db.execute("SELECT * FROM v_person_load WHERE allocation_pct >= 100")}
        self.assertGreaterEqual(len(full), 3)

    def test_project_overlap(self):
        self.assertGreater(self.db.execute("SELECT COUNT(*) FROM v_project_overlap").fetchone()[0], 10)

    def test_project_economics(self):
        rows = {r["project_name"]: r for r in self.db.execute("SELECT * FROM v_project_economics")}
        self.assertEqual(len(rows), 12)
        self.assertAlmostEqual(sum(r["fte"] for r in rows.values()), 22.35, places=2)
        self.assertTrue(all(r["cost_eur"] > 0 for r in rows.values()))
        roi = {n: r["expected_value_eur"] * r["value_confidence"] / r["cost_eur"] for n, r in rows.items()}
        under = {n for n, v in roi.items() if v < 1.25}
        self.assertEqual(under, {"Warehouse Automation Pilot", "Finance Close Automation",
                                 "Mobile Driver App", "Hackathon Tooling"})

    def test_aliases_resolve_to_skills(self):
        n = self.db.execute("SELECT COUNT(*) FROM skill_alias a JOIN skill s ON s.id = a.skill_id").fetchone()[0]
        self.assertGreater(n, 100)


if __name__ == "__main__":
    unittest.main()
