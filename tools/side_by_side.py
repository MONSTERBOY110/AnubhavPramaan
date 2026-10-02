"""Side-by-side review of a pack against its source PDF.

For every PC: an image cropped from the official PDF page where the PC appears, next to what the
pack JSON says (text, element, item type, anchors or tolerance, observables). A reviewer compares
the picture of the PDF with the JSON, so the check does not depend on any text extractor.

The first table holds 10 rows drawn with a fixed seed for a quick spot-check; the full table
follows. Header facts (level, credits, weightage, pass marks) get their own table with page refs.

Usage:
    python tools/side_by_side.py CON-Q0602-v4.0 <qp.pdf> <out.html> [--seed N]
"""

from __future__ import annotations

import argparse
import base64
import html
import json
import random
from pathlib import Path

import fitz  # PyMuPDF

ROOT = Path(__file__).resolve().parents[1]
TEXT_TOP, TEXT_BOTTOM = 102.0, 798.0  # below the running header, above the footer


def crop(doc: fitz.Document, page_no: int, code: str, next_code: str | None) -> tuple[str, bool]:
    """PNG (base64) of the PC on its page, from its label down to the next PC or section end."""
    page = doc[page_no - 1]
    hits = page.search_for(f"{code}.")
    if not hits:
        return "", False
    top = hits[0].y0 - 3
    bottom = TEXT_BOTTOM
    continues = True
    candidates = []
    if next_code:
        candidates += [r.y0 for r in page.search_for(f"{next_code}.") if r.y0 > top + 2]
    for marker in ("Knowledge and Understanding", "To be competent"):
        candidates += [r.y0 for r in page.search_for(marker) if r.y0 > top + 2]
    if candidates:
        nxt = min(candidates)
        # An element title sits just above "To be competent"; stop above it too.
        bottom = nxt - 3
        continues = False
    clip = fitz.Rect(40, top, page.rect.width - 40, min(bottom, TEXT_BOTTOM))
    pix = page.get_pixmap(clip=clip, matrix=fitz.Matrix(2, 2))
    return base64.b64encode(pix.tobytes("png")).decode(), continues


def esc(x: object) -> str:
    return html.escape(str(x))


def pc_row(n: int, pc: dict, img: str, continues: bool) -> str:
    if pc["type"] == "measurement":
        t = pc["tolerance"]
        band = {"band": f"{t.get('target')} &plusmn; {t.get('plusMinus')} {t['unit']}",
                "min": f"at least {t.get('min')} {t['unit']}",
                "max": f"at most {t.get('max')} {t['unit']}"}[t["kind"]]
        assess = f"<b>Measurement</b>: {esc(pc.get('measurementTask', ''))}<br>Pass band: {band}<br><i>{esc(t['source'])}</i>"
    else:
        anchors = pc.get("anchors") or []
        assess = "<b>Judgement</b>" + ("<ol start=0>" + "".join(f"<li>{esc(a)}</li>" for a in anchors) + "</ol>" if anchors else " (no anchors: mapping only)")
    obs = pc.get("observables") or []
    obs_html = ("<ul>" + "".join(f"<li>{esc(o)}</li>" for o in obs) + "</ul>"
                f"<i>{esc(pc.get('observablesSource', ''))}</i>") if obs else ""
    syn = ", ".join(pc.get("synonyms") or [])
    pdf = (f'<img src="data:image/png;base64,{img}" alt="PDF crop">' if img else "<i>not found on page</i>")
    if continues:
        pdf += '<div class="note">continues on the next page</div>'
    return (
        f"<tr><td class=n>{n}</td><td class=id>{esc(pc['id'])}<br><span class=muted>{esc(pc['element'])}, PDF page {pc['page']}</span></td>"
        f"<td class=pdf>{pdf}</td>"
        f"<td><div class=json>{esc(pc['text'])}</div><div class=muted>synonyms: {esc(syn)}</div></td>"
        f"<td class=assess>{assess}{obs_html}</td><td class=tick>&#9744; same<br>&#9744; differs</td></tr>"
    )


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("pack")
    ap.add_argument("pdf", type=Path)
    ap.add_argument("out", type=Path)
    ap.add_argument("--seed", type=int, default=20261002)
    args = ap.parse_args()

    pack = json.loads((ROOT / "packs/qp" / f"{args.pack}.json").read_text(encoding="utf-8"))
    doc = fitz.open(args.pdf)
    rows: list[tuple[dict, str, bool]] = []
    for nos in pack["nos"]:
        pcs = nos["pcs"]
        for i, pc in enumerate(pcs):
            nxt = pcs[i + 1]["code"] if i + 1 < len(pcs) else None
            img, cont = crop(doc, pc["page"], pc["code"], nxt)
            rows.append((pc, img, cont))

    sample = sorted(random.Random(args.seed).sample(range(len(rows)), 10))
    head = "<tr><th>#</th><th>PC</th><th>Official PDF (image crop)</th><th>Pack JSON text</th><th>Assessment content (authored, not in the PDF)</th><th>Check</th></tr>"

    facts = [
        ("QP", f"{pack['id']} v{pack['version']}, {pack['title']}", "cover, page 1"),
        ("NSQF level", pack["nsqfLevel"], "page 4"),
        ("Credits", pack.get("credits", ""), "page 4"),
        ("NCO code", pack.get("ncoCode", ""), "page 4"),
        ("NQR code", pack.get("nqrCode", ""), "page 4"),
        ("Status / use", f"{pack.get('status')} / {pack.get('use')}", "overlay"),
    ]
    for nos in pack["nos"]:
        el = "; ".join(f"{e['id']} {e['title']} (T{e['marks']['theory']} P{e['marks']['practical']})" for e in nos["elements"])
        facts.append((nos["id"], f"{nos['title']} | weightage {nos['weightagePct']}% | marks T{nos['marks']['theory']} P{nos['marks']['practical']} | {len(nos['pcs'])} PCs | {el}", "Assessment Criteria tables; weightage pages 47 to 48"))
    for q in (pack.get("passRule") or {}).get("quotes", []):
        facts.append(("Pass rule", q["text"], q["source"]))
    facts_html = "".join(f"<tr><td>{esc(a)}</td><td>{esc(b)}</td><td class=muted>{esc(c)}</td></tr>" for a, b, c in facts)

    out = f"""<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>{esc(pack['id'])} side by side</title>
<style>
body{{font-family:'Noto Sans','Nirmala UI',system-ui,sans-serif;color:#1b2559;margin:24px auto;max-width:1600px;padding:0 16px}}
h1{{font-size:22px}} h2{{font-size:18px;margin-top:32px}}
table{{border-collapse:collapse;width:100%;table-layout:fixed}} td,th{{border:1px solid #d9dee8;padding:8px;vertical-align:top;font-size:13px;overflow-wrap:anywhere}}
th{{background:#f5f7fb;text-align:left}}
th:nth-child(1){{width:3%}} th:nth-child(2){{width:11%}} th:nth-child(3){{width:33%}} th:nth-child(4){{width:20%}} th:nth-child(5){{width:27%}} th:nth-child(6){{width:6%}}
.n{{color:#5f6b7a}} .id{{font-family:Consolas,monospace}}
.pdf img{{width:100%;height:auto;border:1px solid #d9dee8}} .json{{font-size:14px}} .muted{{color:#5f6b7a;font-size:12px}}
.tick{{white-space:nowrap}} .note{{color:#a8520a;font-size:12px}}
ol,ul{{margin:4px 0 4px 18px;padding:0}}
</style></head><body>
<h1>{esc(pack['id'])} v{esc(pack['version'])} {esc(pack['title'])}: PDF next to pack JSON</h1>
<p>Generated by <code>tools/side_by_side.py</code> from <code>packs/qp/{esc(args.pack)}.json</code> and the official PDF
(sha256 {esc(pack['source']['sha256'][:16])}...). The PDF column is an image of the page, so compare it with the JSON column by eye.
The assessment column is authored content: it is not in the PDF and is reviewed separately.</p>
<h2>Spot-check: 10 rows drawn with seed {args.seed}</h2>
<table>{head}{''.join(pc_row(i + 1, *rows[i]) for i in sample)}</table>
<h2>Header facts</h2>
<table><tr><th>Field</th><th>Pack JSON</th><th>Where to look in the PDF</th></tr>{facts_html}</table>
<h2>All {len(rows)} PCs</h2>
<table>{head}{''.join(pc_row(i + 1, *r) for i, r in enumerate(rows))}</table>
</body></html>"""
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(out, encoding="utf-8")
    missing = sum(1 for _, img, _ in rows if not img)
    print(f"{len(rows)} rows, {missing} without a crop, sample rows {[i + 1 for i in sample]} -> {args.out}")


if __name__ == "__main__":
    main()
