#!/usr/bin/env python3
"""deck/index.html is the source (Studio look by default, Modern switchable with T).
Writes deck/index-modern.html: identical, but opens in the Modern look."""
from pathlib import Path

DECK = Path(__file__).resolve().parent.parent / "deck"
src = (DECK / "index.html").read_text(encoding="utf-8")
marker = '/*DEFAULT_SKIN*/"studio"'
assert marker in src, "default-skin marker missing"
(DECK / "index-modern.html").write_text(src.replace(marker, '/*DEFAULT_SKIN*/"modern"'), encoding="utf-8")
print("wrote", DECK / "index-modern.html")
