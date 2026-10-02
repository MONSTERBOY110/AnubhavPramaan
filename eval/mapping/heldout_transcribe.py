"""Transcribe the role-play recordings (held-out set) through the app's own speech route.

Reads docs/internal/recordings/<persona>/q<n>-<topic>.wav, posts each answer to the running app's
POST /api/voice/asr (the same path a worker's answer takes), and writes one declaration file per
persona to docs/internal/heldout/<persona>.json in the eval format, with an empty "labels" list and
the provider that produced each transcript. Labels are added by hand afterwards, following
eval/mapping/README.md, and hashed before the mapper runs (see "Held-out set" in that README).

Audio and transcripts stay in docs/internal/ (not published) unless the lead decides otherwise.

Usage (app running on localhost:3000):
    python eval/mapping/heldout_transcribe.py            # every persona folder
    python eval/mapping/heldout_transcribe.py R01 R02    # only these

The whole held-out procedure, in order (the runner refuses step 5 until step 4 is done):
    1. python eval/mapping/heldout_transcribe.py
    2. write the "labels" of each docs/internal/heldout/R*.json from its transcript (README rules)
    3. python eval/mapping/check_labels.py --dir docs/internal/heldout --write
    4. python eval/mapping/seal_heldout.py
    5. AP_EVAL_MODE=llm AP_EVAL_SET=heldout npx vitest run --config vitest.eval.config.mts (once)
"""

from __future__ import annotations

import argparse
import base64
import json
import re
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
REC = ROOT / "docs/internal/recordings"
OUT = ROOT / "docs/internal/heldout"
APP = "http://localhost:3000"

# The interview questions, in order (lib/declaration/topics.ts and eval/mapping/README.md).
QUESTIONS = {
    "intro": "अपने काम के बारे में बताइए। कितने साल से कर रहे हैं, कहाँ-कहाँ काम किया है?",
    "tools": "कौन-कौन से औज़ार और मीटर चलाते हैं, और उनसे क्या-क्या करते हैं?",
    "wiring": "मकान या बिल्डिंग में वायरिंग कैसे करते हैं? शुरू से आख़िर तक बताइए।",
    "site-lighting": "कंस्ट्रक्शन साइट पर अस्थायी लाइट का काम किया है? क्या-क्या करते हैं?",
    "panels": "डिस्ट्रीब्यूशन बोर्ड या पैनल लगाने, जोड़ने या ठीक करने का काम किया है?",
    "safety": "काम के समय अपनी और दूसरों की सुरक्षा के लिए क्या-क्या करते हैं?",
    "team-planning": "टीम में काम कैसे करते हैं, और काम शुरू करने से पहले तैयारी कैसे करते हैं?",
    "other": "फ़ोन से भुगतान, पैसों का हिसाब या ग्राहक से बात, ये सब कैसे करते हैं?",
}
def shown(path: Path) -> str:
    """A path as written into the files: relative to the repo when inside it."""
    return path.relative_to(ROOT).as_posix() if path.is_relative_to(ROOT) else path.as_posix()


NAME = re.compile(r"^q(\d+)-([a-z-]+)\.wav$")


def asr(wav: bytes) -> dict:
    body = json.dumps({"audio": base64.b64encode(wav).decode(), "language": "hi"}).encode()
    req = urllib.request.Request(f"{APP}/api/voice/asr", data=body, headers={"content-type": "application/json"})
    with urllib.request.urlopen(req, timeout=180) as res:
        return json.loads(res.read().decode("utf-8"))


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("personas", nargs="*", help="persona folders to transcribe, e.g. R01 R02 (default: all)")
    ap.add_argument("--rec", default=str(REC), help="folder of persona recordings (default: docs/internal/recordings)")
    ap.add_argument("--out", default=str(OUT), help="folder for the declaration files (default: docs/internal/heldout)")
    args = ap.parse_args()
    rec, out_dir = Path(args.rec), Path(args.out)
    wanted = set(args.personas)
    out_dir.mkdir(parents=True, exist_ok=True)
    personas = sorted(p for p in rec.iterdir() if p.is_dir() and (not wanted or p.name in wanted)) if rec.exists() else []
    if not personas:
        sys.exit(f"no recordings under {rec}")
    for folder in personas:
        files = sorted((f for f in folder.glob("q*.wav") if NAME.match(f.name)), key=lambda f: int(NAME.match(f.name).group(1)))
        turns = []
        for f in files:
            topic = NAME.match(f.name).group(2)
            out = asr(f.read_bytes())
            turns.append(
                {
                    "topic": topic,
                    "q": QUESTIONS.get(topic, ""),
                    "answer": out["transcript"],
                    "asr": {"provider": out.get("provider"), "label": out.get("label"), "seconds": out.get("seconds"), "redacted": out.get("redacted")},
                    "audio": shown(f),
                }
            )
            print(f"{folder.name} {f.name}: {out.get('provider')} {out.get('seconds')} s, {len(out['transcript'])} chars")
        doc = {
            "id": folder.name,
            "category": "heldout",
            "style": "hindi",
            "persona": "Role-play recording by the project lead; persona card in app/record/personas.ts.",
            "lang": "hi",
            "turns": turns,
            "labels": [],
            "expected": {"qp": "CON/Q0602"},
            "notes": "Transcribed by heldout_transcribe.py. Labels are written from these transcripts before the mapper runs.",
        }
        (out_dir / f"{folder.name}.json").write_text(json.dumps(doc, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"  -> {shown(out_dir / (folder.name + '.json'))} ({len(turns)} answers)")


if __name__ == "__main__":
    main()
