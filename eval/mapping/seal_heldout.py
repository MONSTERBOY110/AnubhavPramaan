"""Seal the held-out labels before the mapper runs on them (eval/mapping/README.md, "Held-out set").

Writes docs/internal/heldout/SEALED.md with the SHA-256 of each labelled role-play declaration and
one hash over the set, stamped in IST. The eval runner (run.eval.ts) refuses the held-out set
unless SEALED.md exists and every file still matches it, so labels cannot change after a result
is seen without a logged amendment that says why.

Before sealing, every file must be labelled and checked:
    python eval/mapping/check_labels.py --dir docs/internal/heldout --write

Usage:
    python eval/mapping/seal_heldout.py                        # first seal; refuses if SEALED.md exists
    python eval/mapping/seal_heldout.py --amend "R02: reason"  # logged correction, hashes re-recorded
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DIR = ROOT / "docs/internal/heldout"
IST = timezone(timedelta(hours=5, minutes=30))


def sha(path: Path) -> str:
    # Same rule as freeze.py: hash the bytes with line endings normalised to LF.
    return hashlib.sha256(path.read_bytes().replace(b"\r\n", b"\n")).hexdigest()


def files(folder: Path) -> list[Path]:
    return sorted(p for p in folder.glob("R*.json") if p.stem[1:].isdigit())


def problems(path: Path) -> list[str]:
    doc = json.loads(path.read_text(encoding="utf-8"))
    out = []
    if not doc.get("turns"):
        out.append("no transcribed answers")
    exp = doc.get("expected", {})
    for key in ("qp", "pcIds", "routeFlat", "routeWeighted"):
        if key not in exp:
            out.append(f"expected.{key} missing (run check_labels.py --dir docs/internal/heldout --write)")
    if not doc.get("labels") and not doc.get("notes", "").strip():
        out.append("no labels and no note saying why")
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--amend", default="", help="reason for a logged correction")
    ap.add_argument("--dir", default=str(DIR), help="folder of held-out declarations (default: docs/internal/heldout)")
    args = ap.parse_args()
    folder = Path(args.dir)
    sealed_md = folder / "SEALED.md"
    found = files(folder)
    if not found:
        sys.exit(f"no held-out declarations under {folder}")
    bad = {p.name: problems(p) for p in found}
    bad = {k: v for k, v in bad.items() if v}
    if bad:
        for name, issues in bad.items():
            print(f"{name}: " + "; ".join(issues))
        sys.exit("not sealed: fix the files above first")

    rows = [(p.name, sha(p)) for p in found]
    set_hash = hashlib.sha256("".join(f"{h}  {n}\n" for n, h in rows).encode()).hexdigest()
    now = datetime.now(IST).strftime("%Y-%m-%d %H:%M IST")
    if sealed_md.exists():
        if not args.amend:
            sys.exit("SEALED.md exists. A change needs --amend \"<id>: <reason>\".")
        old = sealed_md.read_text(encoding="utf-8")
        corrections = old.split("## Corrections", 1)[1].split("## Runs", 1)[0].strip()
        old_set = old.split("Set hash: `", 1)[1].split("`", 1)[0]
        entry = f"- {now}: {args.amend} (set hash {old_set[:12]}... to {set_hash[:12]}...)"
        corrections = (corrections.replace("None so far.", "").strip() + "\n" + entry).strip()
        runs = old.split("## Runs", 1)[1].strip()
        sealed_at = old.split("Sealed at: ", 1)[1].split("\n", 1)[0]
    else:
        corrections, runs, sealed_at = "None so far.", "None so far.", now

    body = (
        "# SEALED: held-out role-play set\n\n"
        f"Sealed at: {sealed_at}\n"
        f"Set hash: `{set_hash}`\n\n"
        f"The {len(rows)} role-play declarations below were transcribed by the app's own speech route and\n"
        "labelled from those transcripts with the rules in `eval/mapping/README.md`, then sealed here\n"
        "**before the mapper ran on them**. Results on this set are reported as \"role-play recordings\",\n"
        "with the set size. Audio and transcripts stay private in `docs/internal/`.\n\n"
        "## Files\n\n| File | SHA-256 (LF line endings) |\n|---|---|\n"
        + "\n".join(f"| {n} | `{h}` |" for n, h in rows)
        + f"\n\n## Corrections\n\n{corrections}\n\n## Runs\n\n{runs}\n"
    )
    sealed_md.write_text(body, encoding="utf-8", newline="\n")
    print(f"sealed {len(rows)} files, set hash {set_hash}")


if __name__ == "__main__":
    main()
