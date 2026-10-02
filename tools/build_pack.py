"""Merge an extracted QP with its reviewed overlay into the pack the app loads (TRD section 4, M2).

    packs/qp/source/<PACK>.extracted.json   produced by tools/extract_qp.py from the official PDF
  + packs/qp/overlays/<PACK>.overlay.json   written and reviewed by people: header facts the
                                            extractor does not read, the pass rule with quotes, and
                                            per-PC item type, observables, anchors, tolerances,
                                            synonyms
  = packs/qp/<PACK>.json                    validated by lib/packs/schema.ts in tests/unit/packs.test.ts

The overlay can only add assessment content. It cannot change a PC's id, text, element or page,
which always come from the PDF, so a reviewer comparing the pack with the PDF compares like with like.

Usage:
    python tools/build_pack.py CON-Q0602-v4.0
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FROM_PDF = {"id", "code", "element", "text", "page"}
OVERLAY_PC_FIELDS = {
    "type", "measurementTask", "tolerance", "anchors", "observables", "observablesSource",
    "synonyms", "textHi",
}


def build(name: str) -> dict:
    extracted = json.loads((ROOT / "packs/qp/source" / f"{name}.extracted.json").read_text(encoding="utf-8"))
    overlay_path = ROOT / "packs/qp/overlays" / f"{name}.overlay.json"
    overlay = json.loads(overlay_path.read_text(encoding="utf-8"))

    header = overlay.get("header", {})
    pack: dict = {
        "id": extracted["id"],
        "version": extracted["version"],
        "title": extracted["title"],
        "nsqfLevel": extracted["nsqfLevel"],
        **header,
        "nos": [],
        "source": {**extracted["source"], "overlay": f"packs/qp/overlays/{name}.overlay.json"},
    }
    pc_overlay: dict = overlay.get("pcs", {})
    known = {pc["id"] for nos in extracted["nos"] for pc in nos["pcs"]}
    unknown = sorted(set(pc_overlay) - known)
    if unknown:
        sys.exit(f"overlay names PCs that are not in the QP: {unknown}")

    for nos in extracted["nos"]:
        pcs = []
        for pc in nos["pcs"]:
            extra = pc_overlay.get(pc["id"], {})
            bad = set(extra) - OVERLAY_PC_FIELDS
            if bad:
                sys.exit(f"{pc['id']}: overlay may not set {sorted(bad)}")
            merged = {k: pc[k] for k in ("id", "code", "element", "text", "page")}
            merged["type"] = extra.get("type", "judgement")
            for k in sorted(OVERLAY_PC_FIELDS - {"type"}):
                if k in extra:
                    merged[k] = extra[k]
            pcs.append(merged)
        pack["nos"].append({**{k: v for k, v in nos.items() if k != "pcs"}, "pcs": pcs})
    return pack


def main() -> None:
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    name = sys.argv[1]
    pack = build(name)
    out = ROOT / "packs/qp" / f"{name}.json"
    out.write_text(json.dumps(pack, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    pcs = [pc for nos in pack["nos"] for pc in nos["pcs"]]
    kinds = {t: sum(1 for pc in pcs if pc["type"] == t) for t in ("judgement", "measurement")}
    anchored = sum(1 for pc in pcs if "anchors" in pc)
    print(f"{pack['id']} v{pack['version']} ({pack.get('status')}, {pack.get('use')}): {len(pcs)} PCs, "
          f"{kinds['judgement']} judgement ({anchored} with anchors), {kinds['measurement']} measurement -> {out}")


if __name__ == "__main__":
    main()
