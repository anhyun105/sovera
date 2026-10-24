#!/usr/bin/env python3
"""Lightweight pre-deployment checks for the static Sovera website."""
from html.parser import HTMLParser
from pathlib import Path
import re
import subprocess
import tempfile

html_path = Path("index.html")
if not html_path.is_file():
    raise SystemExit("ERROR: index.html is missing")

source = html_path.read_text(encoding="utf-8")

class SiteParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.ids = set()
        self.duplicates = []
    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        item_id = attrs.get("id")
        if item_id:
            if item_id in self.ids:
                self.duplicates.append(item_id)
            self.ids.add(item_id)

parser = SiteParser()
parser.feed(source)
parser.close()
if parser.duplicates:
    raise SystemExit("ERROR: duplicate HTML id(s): " + ", ".join(sorted(set(parser.duplicates))))

required_ids = [
    "home", "atelier", "garmentCanvas", "dashboard", "materials",
    "explore", "authModal", "saveDesign", "publishDesign"
]
missing = [item for item in required_ids if item not in parser.ids]
if missing:
    raise SystemExit("ERROR: required website element(s) missing: " + ", ".join(missing))

match = re.search(r'<script\s+type=["\']module["\']\s*>(.*?)</script\s*>', source, re.I | re.S)
if not match:
    raise SystemExit("ERROR: inline JavaScript module was not found")

with tempfile.NamedTemporaryFile("w", suffix=".mjs", encoding="utf-8") as js_file:
    js_file.write(match.group(1))
    js_file.flush()
    result = subprocess.run(["node", "--check", js_file.name], text=True, capture_output=True)
    if result.returncode:
        print(result.stdout)
        print(result.stderr)
        raise SystemExit("ERROR: JavaScript syntax check failed")

print(f"OK: parsed index.html; checked {len(parser.ids)} unique IDs; JavaScript syntax passed.")
