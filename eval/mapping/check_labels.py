"""Check and summarise the frozen mapping eval set (eval/mapping/declarations/*.json).

Label-side tooling, written before any mapper code existed and kept independent of it: coverage
here is computed in Python from the pack JSON, so the TypeScript mapper's coverage code can later be
tested against these numbers rather than against itself.

Checks, for every declaration:
  - the shape (id, category, style, turns, labels, expected qp);
  - every labelled PC id exists in the expected pack, and none is labelled twice;
  - every label's evidence is a verbatim substring of one of the worker's answers;
  - expected.pcIds equals the set of labelled PCs (it is derived, never typed by hand).
Then it computes, from the labels alone, flat coverage (covered PCs / all PCs) and weighted
coverage (QP weightage per NOS, element marks within a NOS, PCs equal within an element) and the
route each rule gives at the NCVET 70% threshold.

Usage:
    python eval/mapping/check_labels.py           # check and print the table
    python eval/mapping/check_labels.py --write   # also write expected.pcIds / coverage / routes
    python eval/mapping/check_labels.py --write --only D02,D03   # touch only these files
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DECL_DIR = Path(__file__).resolve().parent / "declarations"
PACKS = {
    "CON/Q0602": ROOT / "packs/qp/source/CON-Q0602-v4.0.extracted.json",
    "CON/Q0103": ROOT / "packs/qp/source/CON-Q0103-v1.0.extracted.json",
}
THRESHOLD = 0.70  # NCVET RPL Guidelines 2023: 70% or more of learning outcomes -> direct assessment
CATEGORIES = {"full", "partial", "other-trade", "short", "hinglish", "heldout"}
STYLES = {"hindi", "hinglish-devanagari", "hinglish-roman"}


def load_pack(qp: str) -> dict:
    return json.loads(PACKS[qp].read_text(encoding="utf-8"))


def pc_weights(pack: dict) -> dict[str, float]:
    """Each PC's share of the whole QP: NOS weightage x element share of NOS marks / PCs in element."""
    weights: dict[str, float] = {}
    for nos in pack["nos"]:
        nos_marks = sum(nos["marks"].values())
        for el in nos["elements"]:
            el_marks = sum(el["marks"].values())
            pcs = [pc for pc in nos["pcs"] if pc["element"] == el["id"]]
            for pc in pcs:
                weights[pc["id"]] = (nos["weightagePct"] / 100) * (el_marks / nos_marks) / len(pcs)
    return weights


def coverage(pack: dict, covered: set[str]) -> tuple[float, float, dict[str, float]]:
    all_ids = [pc["id"] for nos in pack["nos"] for pc in nos["pcs"]]
    weights = pc_weights(pack)
    flat = len(covered) / len(all_ids)
    weighted = sum(weights[i] for i in covered)
    per_nos = {
        nos["id"]: sum(1 for pc in nos["pcs"] if pc["id"] in covered) / len(nos["pcs"])
        for nos in pack["nos"]
    }
    return flat, weighted, per_nos


def route(pct: float) -> str:
    return "direct-assessment" if pct >= THRESHOLD else "upskill-first"


def check(path: Path, write: bool) -> tuple[dict, list[str]]:
    errors: list[str] = []
    d = json.loads(path.read_text(encoding="utf-8"))
    for field in ("id", "category", "style", "persona", "turns", "labels", "expected"):
        if field not in d:
            errors.append(f"missing field {field}")
    if errors:
        return d, errors
    if d["id"] != path.stem:
        errors.append(f"id {d['id']} does not match file name {path.stem}")
    if d["category"] not in CATEGORIES:
        errors.append(f"category {d['category']!r} not in {sorted(CATEGORIES)}")
    if d["style"] not in STYLES:
        errors.append(f"style {d['style']!r} not in {sorted(STYLES)}")
    qp = d["expected"].get("qp")
    if qp not in PACKS:
        return d, errors + [f"expected.qp {qp!r} is not a loaded pack"]
    pack = load_pack(qp)
    valid = {pc["id"] for nos in pack["nos"] for pc in nos["pcs"]}
    answers = [t.get("answer", "") for t in d["turns"]]
    if not answers or not all(isinstance(a, str) for a in answers):
        errors.append("turns must each carry an answer string")
    seen: set[str] = set()
    for lab in d["labels"]:
        pc, ev = lab.get("pc"), lab.get("evidence", "")
        if pc not in valid:
            errors.append(f"unknown PC id {pc!r} for {qp}")
        if pc in seen:
            errors.append(f"PC {pc} labelled twice")
        seen.add(pc)
        if not ev or not any(ev in a for a in answers):
            errors.append(f"{pc}: evidence is not a verbatim substring of any answer: {ev!r}")
    flat, weighted, per_nos = coverage(pack, seen)
    derived = {
        "qp": qp,
        "pcIds": sorted(seen, key=lambda s: (s.split(".PC")[0], int(s.split(".PC")[1]))),
        "coverageFlat": round(flat, 4),
        "coverageWeighted": round(weighted, 4),
        "routeFlat": route(flat),
        "routeWeighted": route(weighted),
    }
    if write:
        d["expected"] = derived
        path.write_text(json.dumps(d, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    else:
        for k, v in derived.items():
            if d["expected"].get(k) != v:
                errors.append(f"expected.{k} is stale; run with --write")
                break
    d["_per_nos"] = per_nos
    return d, errors


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--write", action="store_true")
    ap.add_argument("--only", default="", help="comma list of ids, e.g. D02,D03")
    ap.add_argument("--dir", default=str(DECL_DIR), help="folder of declarations (default: the frozen set)")
    args = ap.parse_args()
    files = sorted(Path(args.dir).glob("[DXR]*.json"))
    if args.only:
        wanted = {x.strip() for x in args.only.split(",") if x.strip()}
        files = [f for f in files if f.stem in wanted]
    if not files:
        sys.exit("no declarations found")
    bad = 0
    print(f"{'id':<4} {'category':<12} {'style':<20} {'qp':<10} {'PCs':>4} {'flat':>6} {'wtd':>6}  route(flat)        route(weighted)    words")
    for f in files:
        d, errors = check(f, args.write)
        e = d.get("expected", {})
        words = sum(len(t.get("answer", "").split()) for t in d.get("turns", []))
        print(f"{d.get('id','?'):<4} {d.get('category','?'):<12} {d.get('style','?'):<20} {e.get('qp','?'):<10} "
              f"{len(e.get('pcIds', [])):>4} {e.get('coverageFlat',0):>6.2%} {e.get('coverageWeighted',0):>6.2%}  "
              f"{e.get('routeFlat','?'):<18} {e.get('routeWeighted','?'):<18} {words}")
        for err in errors:
            bad += 1
            print(f"     ERROR {err}")
    print(f"\n{len(files)} declarations, {bad} errors")
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
