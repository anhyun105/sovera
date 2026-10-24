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
        self.missing_alt = []
    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        item_id = attrs.get("id")
        if tag == "img" and not attrs.get("alt", "").strip():
            self.missing_alt.append("img")
        if item_id:
            if item_id in self.ids:
                self.duplicates.append(item_id)
            self.ids.add(item_id)

parser = SiteParser()
parser.feed(source)
parser.close()

if parser.duplicates:
    raise SystemExit("ERROR: duplicate HTML id(s): " + ", ".join(sorted(set(parser.duplicates))))
if parser.missing_alt:
    raise SystemExit("ERROR: every content image needs alt text")
if re.search(r"\${3,}\(", source):
    raise SystemExit("ERROR: malformed multi-selector helper call detected")
if re.search(r"(?<!\$)\$\([^)]*\)\.(forEach|map|filter|find|some|every|reduce)", source):
    raise SystemExit("ERROR: a single-element query helper is being used as a collection")


required_ids = [
    "home", "atelier", "garmentCanvas", "dashboard", "materials",
    "explore", "authModal", "saveDesign", "publishDesign", "studioLock"
]
missing = [item for item in required_ids if item not in parser.ids]
if missing:
    raise SystemExit("ERROR: required website element(s) missing: " + ", ".join(missing))
if source.count('data-material="') < 12:
    raise SystemExit("ERROR: expected at least 12 selectable material options")
if 'id="embroidery"' not in source:
    raise SystemExit("ERROR: garment embellishment control is missing")
auth_form = re.search(r'<form\b[^>]*\bid=["\']authForm["\'][^>]*>(.*?)</form\s*>', source, re.I | re.S)
if not auth_form:
    raise SystemExit("ERROR: account form is missing")
if re.search(r"<input\b[^>]*\btype\s*=\s*['\"]password", auth_form.group(1), re.I):
    raise SystemExit("ERROR: preview/auth form must not contain a password field in static HTML; cloud auth fields are inserted only when Supabase is configured")
if 'id="cloudPasswordWrap" hidden' not in source:
    raise SystemExit("ERROR: real-auth password field must remain hidden until the cloud backend is configured")

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

print(f"OK: parsed index.html; checked {len(parser.ids)} unique IDs, alt text, guest lock, 12 fabrics and passwordless preview; JavaScript syntax passed.")
