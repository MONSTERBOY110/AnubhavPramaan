"""Freeze the evidence hints of a calibration set, once, before anyone scores it.

The study protocol (docs/STUDY-PROTOCOL.md, section 7) shows every assisted rater the same hints,
generated once and stored with their source, never a live model call during scoring. This script
asks the running app's own hint route (POST /api/hints/evidence, the same path the assessor tablet
uses) about every (photo, criterion) pair of a set and writes the answers into the set file, with
the model and the time in "hintSource". It refuses to overwrite hints that already exist.

Usage (app running on localhost:3000, the Azure AI Foundry settings in .env.local):
    python tools/freeze_hints.py data/calibration/demo-set.json
"""

from __future__ import annotations

import base64
import io
import json
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
APP = "http://localhost:3000"
IST = timezone(timedelta(hours=5, minutes=30))


def jpeg_base64(path: Path, longest: int = 1024) -> str:
    # The tablet downscales to at most 1024 px before asking for a hint; do the same.
    im = Image.open(path).convert("RGB")
    im.thumbnail((longest, longest))
    buf = io.BytesIO()
    im.save(buf, "JPEG", quality=85)
    return base64.b64encode(buf.getvalue()).decode()


def ask(qp: str, pc_id: str, image: str) -> dict:
    body = json.dumps({"qp": qp, "pcId": pc_id, "image": image, "mime": "image/jpeg"}).encode()
    req = urllib.request.Request(f"{APP}/api/hints/evidence", data=body, headers={"content-type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=120) as res:
            return json.loads(res.read().decode("utf-8"))
    except urllib.error.HTTPError as err:
        return {"ok": False, "status": err.code, **json.loads(err.read().decode("utf-8") or "{}")}


def main() -> None:
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    path = Path(sys.argv[1])
    data = json.loads(path.read_text(encoding="utf-8"))
    if any(item.get("hints") for item in data["items"]):
        sys.exit(f"{path} already has frozen hints; they are generated once and never redone.")
    models = set()
    for item in data["items"]:
        image = jpeg_base64(ROOT / "public" / item["image"].lstrip("/"))
        item["hints"] = {}
        for pc_id in item["pcs"]:
            out = ask(data["qp"], pc_id, image)
            if not out.get("ok", True) or "hints" not in out:
                sys.exit(f"{item['id']} {pc_id}: no hint ({out.get('message') or out.get('error')}); nothing written")
            item["hints"][pc_id] = [{"status": h["status"], "reason": h["reason"]} for h in out["hints"]]
            models.add(out.get("model", "unknown model"))
            print(f"{item['id']} {pc_id}: " + ", ".join(h["status"] for h in out["hints"]))
            time.sleep(1)  # stay well inside the route's rate limit
    stamp = datetime.now(IST).strftime("%Y-%m-%d %H:%M IST")
    data["hintSource"] = f"{', '.join(sorted(models))} through /api/hints/evidence, frozen {stamp}"
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8", newline="\n")
    print(f"frozen: {data['hintSource']}")


if __name__ == "__main__":
    main()
