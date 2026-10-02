"""Freeze the mapping eval set: write eval/mapping/FROZEN.md with a SHA-256 per declaration and
one hash over the whole set. tests/unit/frozen-set.test.ts recomputes them on every test run, so a
label cannot change silently: after freezing, a change needs a logged correction (reason, old hash,
new hash) in the "Corrections" section, and the hashes are re-recorded by this script with --amend.

Usage:
    python eval/mapping/freeze.py              # first freeze; refuses if FROZEN.md exists
    python eval/mapping/freeze.py --amend "D07: reason for the correction"
"""

from __future__ import annotations

import argparse
import hashlib
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
FROZEN = HERE / "FROZEN.md"
IST = timezone(timedelta(hours=5, minutes=30))


def sha(path: Path) -> str:
    # Hash the bytes with line endings normalised to LF, so a Windows checkout and a Linux CI agree.
    return hashlib.sha256(path.read_bytes().replace(b"\r\n", b"\n")).hexdigest()


def table() -> tuple[list[tuple[str, str]], str]:
    files = sorted((HERE / "declarations").glob("D*.json"))
    rows = [(f.name, sha(f)) for f in files]
    set_hash = hashlib.sha256("".join(f"{h}  {n}\n" for n, h in rows).encode()).hexdigest()
    return rows, set_hash


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--amend", default="", help="reason for a logged correction")
    args = ap.parse_args()
    rows, set_hash = table()
    now = datetime.now(IST).strftime("%Y-%m-%d %H:%M IST")

    corrections = ""
    if FROZEN.exists():
        if not args.amend:
            sys.exit("FROZEN.md exists. A change needs --amend \"<id>: <reason>\".")
        old = FROZEN.read_text(encoding="utf-8")
        corrections = old.split("## Corrections", 1)[1].split("## Runs", 1)[0].strip() if "## Corrections" in old else ""
        old_set = old.split("Set hash: `", 1)[1].split("`", 1)[0] if "Set hash: `" in old else "?"
        entry = f"- {now}: {args.amend} (set hash {old_set[:12]}... to {set_hash[:12]}...)"
        corrections = (corrections.replace("None so far.", "").strip() + "\n" + entry).strip()
        runs = old.split("## Runs", 1)[1].strip() if "## Runs" in old else "None so far."
        frozen_at = old.split("Frozen at: ", 1)[1].split("\n", 1)[0] if "Frozen at: " in old else now
    else:
        corrections = "None so far."
        runs = "None so far."
        frozen_at = now

    readme_hash = sha(HERE / "README.md")
    packs = {
        "CON/Q0602 v4.0 (extracted)": ROOT / "packs/qp/source/CON-Q0602-v4.0.extracted.json",
        "CON/Q0103 v1.0 (extracted)": ROOT / "packs/qp/source/CON-Q0103-v1.0.extracted.json",
    }
    pack_lines = "\n".join(f"| {k} | `{sha(v)}` |" for k, v in packs.items())
    body = f"""# FROZEN: mapping eval set

Frozen at: {frozen_at}
Set hash: `{set_hash}`

The {len(rows)} declarations below were written and labelled **before any mapper code existed**:
at the time of freezing `lib/mapping/` did not exist and there was no claim-extraction logic (no
extraction prompt and no model call; only a browser fetch stub for an endpoint not yet built). The
label rules are in `README.md`. `tests/unit/frozen-set.test.ts` recomputes every hash on each test
run.

What this set is: a frozen synthetic set written by AI agents (D01 by the build agent, the rest by
three writing agents following the same rules), checked by `check_labels.py` (spans verbatim, PC
ids valid) and `review_set.py` (label rules 7 and 8, no dashes, no identifier-like digits). Numbers
measured on it are reported as "frozen synthetic set". It is not real worker data, and nobody
outside the build has labelled it.

Known limitations, stated before any result exists:
- The same agents wrote the text and the labels, so the set measures agreement with these label
  rules, not with an independent human labeller. The held-out role-play recordings are the
  independent check.
- The six full-experience declarations cover most PCs by design, so their labels overlap heavily
  (largest pairwise Jaccard 0.88, D02 and D05).
- D16 (Roman-script Hinglish) follows a similar structure to D01 with a different persona and
  different labels (Jaccard 0.71).
- D13 has no supported PC at all ("हाँ, किया है"): any QP or route suggestion for it is wrong by
  construction unless the mapper declines to suggest.

## Files

| File | SHA-256 (LF line endings) |
|---|---|
""" + "\n".join(f"| {n} | `{h}` |" for n, h in rows) + f"""

## Inputs the labels refer to

| Input | SHA-256 |
|---|---|
| eval/mapping/README.md (label rules) | `{readme_hash}` |
{pack_lines}

## Route labels

Each file stores the route under both rules, derived by `check_labels.py` from the PC labels:
`routeFlat` (covered PCs / all PCs, the TRD rule) and `routeWeighted` (QP weightage and element
marks). Which rule the product uses is a design decision recorded in the project docs; the eval
reports agreement under the rule in use and states which.

## Corrections

{corrections}

## Runs

{runs}
"""
    FROZEN.write_text(body, encoding="utf-8", newline="\n")
    print(f"{len(rows)} files, set hash {set_hash}")


if __name__ == "__main__":
    main()
