#!/usr/bin/env python3
"""Assemble viz/src/{style.css, body.html, js/*.js} + data/sample/*.json -> viz/maieutica-explorer.html (one file)."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "viz" / "src"
TABLES = ["tenant", "cost_band", "org_unit", "person", "skill", "skill_alias", "project", "goal",
          "person_skill", "person_project", "project_skill", "project_goal",
          "hiring_need", "person_aspiration", "evidence"]

data = {t: json.loads((ROOT / "data" / "sample" / f"{t}.json").read_text(encoding="utf-8")) for t in TABLES}
blob = json.dumps(data, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")
import base64
def data_uri(path):
    return "data:image/png;base64," + base64.b64encode((ROOT / "assets" / path).read_bytes()).decode()
js = "\n".join(p.read_text(encoding="utf-8") for p in sorted((SRC / "js").glob("*.js")))

html = f"""<title>Maieutica Explorer</title>
<link rel="icon" type="image/png" href="{data_uri("logo-64.png")}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,700&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap">
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

out = ROOT / "viz" / "maieutica-explorer.html"
out.write_text(html, encoding="utf-8")
print(f"wrote {out} ({out.stat().st_size // 1024} KB)")
