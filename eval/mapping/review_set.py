"""Pre-freeze review of the mapping eval set, beyond check_labels.py.

Checks: label rule 7 (CON/N0603 and CON/N0605 only for answers about site lighting or panels),
rule 8 (a tester alone does not support the meter PCs), no em or en dashes, no identifier-like
digit runs (phone, Aadhaar), and prints the category mix and the route split under both rules.

Usage:
    python eval/mapping/review_set.py
"""

from __future__ import annotations

import json
import re
import sys
from collections import Counter
from pathlib import Path

HERE = Path(__file__).resolve().parent
DASHES = (chr(0x2013), chr(0x2014))
METER_WORDS = ("मल्टी", "टोंग", "मेगर", "मीटर", "multi", "tong", "megger", "meter", "clamp", "क्लैंप", "एम्मीटर", "वोल्टमीटर")
DIGIT_RUN = re.compile(r"(?:[0-9०-९][\s-]?){8,}")


def main() -> None:
    files = sorted((HERE / "declarations").glob("D*.json"))
    problems: list[str] = []
    cats: Counter[str] = Counter()
    styles: Counter[str] = Counter()
    routes: Counter[tuple[str, str, str]] = Counter()
    for f in files:
        raw = f.read_text(encoding="utf-8")
        d = json.loads(raw)
        cats[d["category"]] += 1
        styles[d["style"]] += 1
        e = d["expected"]
        routes[(d["category"], e.get("routeFlat", "?"), e.get("routeWeighted", "?"))] += 1
        if any(ch in raw for ch in DASHES):
            problems.append(f"{d['id']}: contains an em or en dash")
        for t in d["turns"]:
            if DIGIT_RUN.search(t["answer"]):
                problems.append(f"{d['id']}: identifier-like digit run in answer '{t['topic']}'")
        if e.get("qp") != "CON/Q0602":
            continue
        for lab in d["labels"]:
            topic = next((t["topic"] for t in d["turns"] if lab["evidence"] in t["answer"]), "?")
            nos = lab["pc"].split(".PC")[0]
            if nos in ("CON/N0603", "CON/N0605") and topic not in ("site-lighting", "panels"):
                problems.append(f"{d['id']} {lab['pc']}: rule 7, evidence is in the '{topic}' answer")
            if lab["pc"] in ("CON/N0602.PC8", "CON/N0602.PC10"):
                ev = lab["evidence"].lower()
                if not any(w in ev for w in METER_WORDS):
                    problems.append(f"{d['id']} {lab['pc']}: rule 8, no meter named in '{lab['evidence'][:60]}'")
    print(f"{len(files)} declarations")
    print("categories:", dict(sorted(cats.items())))
    print("styles:", dict(sorted(styles.items())))
    print("routes (category, flat rule, weighted rule):")
    for k, v in sorted(routes.items()):
        print(f"  {k}: {v}")
    print(f"\n{len(problems)} problems")
    for p in problems:
        print("  " + p)
    sys.exit(1 if problems else 0)


if __name__ == "__main__":
    main()
