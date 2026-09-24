#!/usr/bin/env python3
"""Assemble viz/src/{style.css, body.html, js/*.js} + data/sample/*.json -> viz/maieutica-explorer.html (one file)."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "viz" / "src"
TABLES = ["tenant", "cost_band", "org_unit", "person", "skill", "skill_alias", "project", "goal",
          "person_skill", "person_project", "project_skill", "project_goal",
          "hiring_need", "person_aspiration", "evidence", "external_identity", "work_item", "work_item_skill"]

data = {t: json.loads((ROOT / "data" / "sample" / f"{t}.json").read_text(encoding="utf-8")) for t in TABLES}
data["ticket_titles"] = json.loads((ROOT / "data" / "config" / "ticket_titles.json").read_text(encoding="utf-8"))
blob = json.dumps(data, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")
import base64
def data_uri(path):
    return "data:image/png;base64," + base64.b64encode((ROOT / "assets" / path).read_bytes()).decode()
js = "\n".join(p.read_text(encoding="utf-8") for p in sorted((SRC / "js").glob("*.js")))

EARLY_SKIN = """<script>(function () {{ var s = "{default}", q = new URLSearchParams(location.search).get("skin"), st = null; try {{ st = localStorage.getItem("maieutica-skin"); }} catch (e) {{}} if (q === "studio" || q === "modern") s = q; else if (st === "studio" || st === "modern") s = st; document.documentElement.dataset.skin = s; }})();</script>
"""


def page(default_skin):
    return f"""<title>Maieutica Explorer</title>
{EARLY_SKIN.format(default=default_skin)}<link rel="icon" type="image/png" href="{data_uri("logo-64.png")}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,700&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&family=Manrope:wght@600;700;800&family=Geist:wght@400;500;600&family=Geist+Mono:wght@400;500&display=swap">
<style>
{(SRC / "style.css").read_text(encoding="utf-8")}
</style>
{(SRC / "body.html").read_text(encoding="utf-8").replace("__LOGO_128__", data_uri("logo-128.png"))}
<script src="https://cdnjs.cloudflare.com/ajax/libs/d3/7.8.5/d3.min.js"></script>
<script>
const RAW0 = {blob};   // one array per schema table
{js}
</script>
"""


# fail the build on a JS syntax error rather than shipping a blank page
import shutil, subprocess, tempfile
if shutil.which("node"):
    with tempfile.NamedTemporaryFile("w", suffix=".js", delete=False) as f:
        f.write(f"const RAW0 = {{}};\n{js}")
    r = subprocess.run(["node", "--check", f.name], capture_output=True, text=True)
    if r.returncode:
        raise SystemExit("JS syntax error:\n" + r.stderr)

# one code base, two looks: the default look differs, and either can be switched in the page
for name, skin in (("maieutica-explorer.html", "studio"), ("maieutica-explorer-modern.html", "modern")):
    out = ROOT / "viz" / name
    out.write_text(page(skin), encoding="utf-8")
    print(f"wrote {out} ({out.stat().st_size // 1024} KB, default look: {skin})")
