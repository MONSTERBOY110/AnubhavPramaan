"""Cut the raw demo recording into a short rough cut for the voiceover.

Reads docs/internal/video/demo-av.mp4 and its demo-av.markers.json (written by
tools/record_demo_av.mjs), keeps the moments listed in SECTIONS, joins them with short audio
fades so no cut clicks, and writes:

  docs/internal/video/demo-cut.mp4            the rough cut, 1080p, with the app's own voices
  docs/internal/video/demo-cut.timeline.json  where each section starts in the cut (for the script)

Every interval is computed from the markers and the measured length of each sound, so a new
recording (for example with the lead's own voice) cuts the same way:  python tools/cut_demo.py
"""

from __future__ import annotations

import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
VIDEO = ROOT / "docs" / "internal" / "video"
RAW = VIDEO / "demo-av.mp4"
MARKERS = VIDEO / "demo-av.markers.json"
OUT = VIDEO / "demo-cut.mp4"
TIMELINE = VIDEO / "demo-cut.timeline.json"
CLIPS = VIDEO / "worker-clips"
FADE = 0.08


def seconds(path: Path) -> float:
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)],
        capture_output=True, text=True, check=True,
    ).stdout
    return float(out)


def main() -> None:
    m = json.loads(MARKERS.read_text(encoding="utf-8"))
    at = {s["name"]: s["at"] for s in m["shots"]}
    total = m["seconds"]
    app = [s["at"] for s in m["sounds"] if s["kind"] == "app voice"]
    worker = [s["at"] for s in m["sounds"] if s["kind"] == "worker"]
    tts = sorted((VIDEO / "av-work").glob("tts-*.wav"), key=lambda p: int(p.stem.split("-")[1]))
    tts_len = [seconds(p) for p in tts]
    clip_len = [seconds(CLIPS / f"clip-{k}.wav") for k in range(1, 9)]

    # (section name, start, end, fade the audio out at the end)
    sections = [
        ("Title card", 0.0, 3.4, False),
        ("Home: the four steps", at["home"], at["home"] + 3.3, False),
        ("Bolo: consent first", at["bolo-consent"], at["bolo-consent"] + 3.4, False),
        ("Bolo: the app asks question 1 aloud", at["bolo-q1"], app[0] + tts_len[0] + 0.5, False),
        ("Bolo: the worker answers", worker[0] - 0.8, worker[0] + clip_len[0] + 0.8, False),
        ("Bolo: what the AI heard, in the worker's words", at["bolo-q2"] - 4.0, at["bolo-q2"] - 0.1, False),
        ("Bolo: answer 3, how they do the wiring", worker[2] - 0.6, worker[2] + clip_len[2] + 0.6, False),
        ("Bolo: claims for answer 3", at["bolo-q4"] - 4.0, at["bolo-q4"] - 0.1, False),
        ("Bolo: read back to the worker", at["bolo-readback"], app[8] + 12.0, True),
        ("Bolo: the worker confirms", at["bolo-done"] - 0.8, at["milao"] - 0.05, False),
        ("Milao: qualification match and the 70% rule", at["milao"], at["milao-decide"] + 3.0, False),
        ("Parkho: anchored checklist and a measured criterion", at["parkho"], at["parkho-photo"] + 1.5, False),
        ("Parkho: the AI hint asks", at["parkho-hint"], at["parkho-hint"] + 2.0, False),
        ("Parkho: the hint says only what it can see", at["parkho-offline"] - 4.5, at["parkho-offline"], False),
        ("Parkho: offline, then sync", at["parkho-offline"], at["parkho-sync"] + 4.0, False),
        ("Pramaan: PIN sign-off by the assessor", at["pramaan"], at["verify"], False),
        ("Pramaan: the verifiable record", at["verify"], at["samaan"], False),
        ("Samaan: consistency between assessors", at["samaan"], at["end"], False),
        ("End card", at["end"], total - 0.05, False),
    ]

    parts, labels = [], []
    for i, (name, a, b, fade_out) in enumerate(sections):
        a, b = max(0.0, a), min(total, b)
        if b - a < 0.3:
            raise SystemExit(f"section too short: {name} ({a:.2f} to {b:.2f})")
        d = b - a
        afade = f"afade=t=in:d={FADE},afade=t=out:st={d - (0.6 if fade_out else FADE):.3f}:d={0.6 if fade_out else FADE}"
        parts.append(
            f"[0:v]trim=start={a:.3f}:end={b:.3f},setpts=PTS-STARTPTS[v{i}];"
            f"[0:a]atrim=start={a:.3f}:end={b:.3f},asetpts=PTS-STARTPTS,{afade}[a{i}]"
        )
        labels.append(f"[v{i}][a{i}]")
    graph = ";".join(parts) + ";" + "".join(labels) + f"concat=n={len(sections)}:v=1:a=1[v][a]"
    subprocess.run(
        ["ffmpeg", "-y", "-loglevel", "error", "-i", str(RAW), "-filter_complex", graph,
         "-map", "[v]", "-map", "[a]", "-c:v", "libx264", "-crf", "18", "-preset", "medium",
         "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", str(OUT)],
        check=True,
    )

    t = 0.0
    timeline = []
    for name, a, b, _ in sections:
        a, b = max(0.0, a), min(total, b)
        timeline.append({"section": name, "start": round(t, 1), "length": round(b - a, 1), "raw": [round(a, 1), round(b, 1)]})
        t += b - a
    TIMELINE.write_text(json.dumps({"seconds": round(t, 1), "sections": timeline}, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"{OUT}: {seconds(OUT):.1f} s in {len(sections)} sections")
    for s in timeline:
        print(f"  {s['start']:6.1f}  {s['length']:5.1f}s  {s['section']}")


if __name__ == "__main__":
    main()
