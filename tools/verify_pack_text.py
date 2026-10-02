"""Check every PC text in a pack against a second, independent text extraction of the source PDF.

The pack text comes from PyMuPDF (tools/extract_qp.py). This script extracts the PDF again with
poppler's pdftotext, a different engine, and checks that each PC's text occurs in it once spaces
and punctuation spacing are ignored. A PC that straddles a page break is checked against the text
with the page furniture (running header, footer, page number) removed.

Usage:
    python tools/verify_pack_text.py CON-Q0602-v4.0 docs/internal/research/CON_Q0602_v4.0.pdf
"""

from __future__ import annotations

import json
import re
import subprocess
import sys
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FURNITURE = re.compile(r"(Deactivated-)?NSQC Approved \|\|[^\n]*|Qualification Pack|\f")


def squash(text: str) -> str:
    text = unicodedata.normalize("NFKC", text)
    text = text.replace("\u2013", "-").replace("\u2014", "-").replace("\ufffd", "-")
    return re.sub(r"[\s]+", "", text).lower()


def main() -> None:
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    pack = json.loads((ROOT / "packs/qp" / f"{sys.argv[1]}.json").read_text(encoding="utf-8"))
    raw = subprocess.run(["pdftotext", "-enc", "UTF-8", sys.argv[2], "-"], capture_output=True, check=True).stdout.decode("utf-8")
    plain = squash(raw)
    no_furniture = squash(re.sub(r"(?m)^\s*\d{1,3}\s*$", "", FURNITURE.sub("", raw)))
    exact = across = 0
    missing: list[str] = []
    for nos in pack["nos"]:
        for pc in nos["pcs"]:
            needle = squash(f"{pc['code']}. {pc['text']}")
            if needle in plain:
                exact += 1
            elif needle in no_furniture:
                across += 1
            else:
                missing.append(f"{pc['id']}: {pc['text'][:90]}")
    total = exact + across + len(missing)
    print(f"{pack['id']} v{pack['version']}: {total} PCs checked against pdftotext output")
    print(f"  found verbatim (ignoring spaces): {exact}")
    print(f"  found once page headers and footers are removed: {across}")
    print(f"  not found: {len(missing)}")
    for m in missing:
        print(f"    {m}")
    sys.exit(1 if missing else 0)


if __name__ == "__main__":
    main()
