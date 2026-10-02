"""Extract a Qualification Pack PDF into pack JSON (TRD section 4, M2).

Reads the official QP PDF published by the Sector Skill Council and writes the parts the mapper
and the assessor checklist need: QP header, every NOS with its elements (the "outcomes" that carry
marks), every performance criterion (PC) under its element, element marks, NOS parameters and the
NOS weightage. Text is kept verbatim apart from whitespace and dash normalisation, so a reviewer can
compare it line by line with the PDF (tools/side_by_side.py builds that table).

Hand-written content (judgement anchors, observables, measurement tolerances, Hindi synonyms) is
NOT produced here. It lives in packs/qp/overlays/ and is merged by tools/build_pack.py, so a
re-extraction never overwrites a human decision.

Usage:
    python tools/extract_qp.py <qp.pdf> <out.json> --url <source url> [--weightage N1=20,N2=5,...]

Requires PyMuPDF (pip install pymupdf).
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
import unicodedata
from datetime import date
from pathlib import Path

import fitz  # PyMuPDF

NOS_HEADING = re.compile(r"^((?:CON|DGT/VSQ)/N\d{4}):\s*(.+)$")
PC_START = re.compile(r"^PC(\d+)\.\s*(.*)$")
COMPETENT = "To be competent, the user/individual on the job must be able to:"
NOISE = (
    re.compile(r"^(Deactivated-)?NSQC Approved \|\|"),
    re.compile(r"^Qualification Pack$"),
)


def clean(text: str) -> str:
    """NFKC (so the ligatures fi and ff become plain letters), whitespace collapsed; en dash, em
    dash and the broken glyph some PDFs emit become a hyphen."""
    text = unicodedata.normalize("NFKC", text)
    text = text.replace("\u2013", "-").replace("\u2014", "-").replace("\ufffd", "-")
    return re.sub(r"\s+", " ", text).strip()


NUMBER = re.compile(r"\d+(?:\.\d+)?")


def as_number(text: str) -> int | float:
    """Marks are whole numbers in most QPs and halves in some (Mason General has 4.5)."""
    value = float(text)
    return int(value) if value.is_integer() else value


def key(text: str) -> str:
    """Comparison key: letters and digits only, lower case."""
    return re.sub(r"[^a-z0-9]", "", clean(text).lower())


def page_lines(doc: fitz.Document) -> list[tuple[int, str]]:
    """Content lines in reading order. The running header ("Qualification Pack") and the footer
    block (approval line plus page number) are dropped as whole blocks, so a bare number inside
    the content, such as an NSQF level, is never mistaken for a page number."""
    out: list[tuple[int, str]] = []
    for pno, page in enumerate(doc, start=1):
        for block in page.get_text("blocks"):
            text = unicodedata.normalize("NFKC", block[4])
            first = text.strip().splitlines()[0] if text.strip() else ""
            if not first or any(p.search(first) for p in NOISE):
                continue
            for raw in text.splitlines():
                line = raw.strip()
                if line:
                    out.append((pno, line))
    return out


def element_marks(doc: fitz.Document) -> list[list[dict]]:
    """Per NOS, in document order: [{title, theory, practical, project, viva}] from the
    'Assessment Criteria for Outcomes' tables. A NOS ends at its 'NOS Total' row."""
    per_nos: list[list[dict]] = []
    current: list[dict] = []
    for page in doc:
        if "Assessment Criteria for Outcomes" not in page.get_text("text"):
            continue
        for table in page.find_tables().tables:
            for row in table.extract():
                cells = [clean(c or "") for c in row]
                if not cells or not cells[0] or cells[0].startswith("PC"):
                    continue
                nums = cells[1:5]
                if cells[0].startswith("NOS Total"):
                    per_nos.append(current)
                    current = []
                    continue
                if any(NUMBER.fullmatch(c) for c in nums):
                    val = [as_number(c) if NUMBER.fullmatch(c) else 0 for c in nums]
                    val += [0] * (4 - len(val))
                    current.append(
                        {
                            "title": cells[0],
                            "theory": val[0],
                            "practical": val[1],
                            "project": val[2],
                            "viva": val[3],
                        }
                    )
    return per_nos


def nos_parameters(lines: list[tuple[int, str]]) -> dict[str, dict]:
    """'National Occupational Standards (NOS) Parameters' blocks: version, level, credits."""
    params: dict[str, dict] = {}
    text = "\n".join(line for _, line in lines)
    for block in text.split("National Occupational Standards (NOS) Parameters")[1:]:
        code = re.search(r"NOS Code\s*\n?\s*((?:CON|DGT/VSQ)/N\d{4})", block)
        if not code:
            continue
        def field(name: str) -> str | None:
            m = re.search(rf"{name}\s*\n?\s*([0-9.]+|NA)\b", block)
            return m.group(1) if m else None
        params[code.group(1)] = {
            "version": field("Version"),
            "nsqfLevel": field("NSQF Level"),
            "credits": field("Credits"),
        }
    return params


def parse(pdf: Path, url: str, weightage: dict[str, int]) -> dict:
    doc = fitz.open(pdf)
    lines = page_lines(doc)
    head = "\n".join(line for _, line in lines[:80])

    qp_code = re.search(r"QP Code:\s*(\S+)", head).group(1)
    qp_version = re.search(r"Version:\s*([0-9.]+)", head).group(1)
    nsqf = re.search(r"NSQF Level:\s*([0-9.]+)", head).group(1)
    title = lines[0][1] if lines[0][1] != "Qualification Pack" else lines[1][1]

    # NOS sections start where a heading line is followed (within a few lines) by "Description".
    starts: list[int] = []
    for i, (_, line) in enumerate(lines):
        m = NOS_HEADING.match(line)
        if m and any(l == "Description" for _, l in lines[i + 1 : i + 4]):
            starts.append(i)
    marks = element_marks(doc)
    params = nos_parameters(lines)
    if len(marks) != len(starts):
        sys.exit(f"marks tables ({len(marks)}) do not match NOS sections ({len(starts)})")

    nos_list = []
    for k, i in enumerate(starts):
        end = starts[k + 1] if k + 1 < len(starts) else len(lines)
        section = lines[i:end]
        m = NOS_HEADING.match(section[0][1])
        nos_id = m.group(1)
        # The heading can wrap onto the next line, before "Description".
        heading = [m.group(2)]
        for _, line in section[1:4]:
            if line == "Description":
                break
            heading.append(line)
        nos_title = clean(" ".join(heading))

        try:
            a = next(j for j, (_, l) in enumerate(section) if l == "Elements and Performance Criteria")
            b = next(j for j, (_, l) in enumerate(section) if l.startswith("Knowledge and Understanding"))
        except StopIteration:
            sys.exit(f"{nos_id}: no PC block found")
        block = section[a + 1 : b]

        element_titles = [m["title"] for m in marks[k]]
        # Each element title sits on the line(s) right before "To be competent". Which lines exactly
        # is decided by the title in the marks table, so the last line of a PC that ends just before
        # a new element is never mistaken for part of that element's title.
        title_lines: dict[int, int] = {}  # index of first title line -> element number
        skip: set[int] = set()
        competent = [j for j, (_, l) in enumerate(block) if l == COMPETENT]
        if len(competent) != len(element_titles):
            sys.exit(f"{nos_id}: {len(competent)} elements in text, {len(element_titles)} in marks table")
        for n_el, c in enumerate(competent):
            want = key(element_titles[n_el])
            span = 1
            for size in (1, 2, 3):
                if c - size < 0:
                    break
                got = key(" ".join(l for _, l in block[c - size : c]))
                if got == want:
                    span = size
                    break
            else:
                print(f"warning: {nos_id} element {n_el + 1} title not matched; using one line",
                      file=sys.stderr)
            title_lines[c - span] = n_el
            skip.update(range(c - span, c + 1))

        elements: list[dict] = []
        pcs: list[dict] = []
        current_pc: dict | None = None
        for j, (pno, line) in enumerate(block):
            if j in title_lines:
                n_el = title_lines[j]
                c = competent[n_el]
                elements.append(
                    {
                        "id": f"E{n_el + 1}",
                        "title": clean(" ".join(l for _, l in block[j:c])),
                        "page": pno,
                    }
                )
                current_pc = None
            if j in skip:
                continue
            pc = PC_START.match(line)
            if pc:
                current_pc = {
                    "code": f"PC{pc.group(1)}",
                    "element": elements[-1]["id"] if elements else "E1",
                    "text": pc.group(2),
                    "page": pno,
                }
                pcs.append(current_pc)
                continue
            if current_pc is None:
                sys.exit(f"{nos_id}: text before the first PC: {line!r}")
            current_pc["text"] += " " + line

        if len(elements) != len(element_titles):
            sys.exit(f"{nos_id}: {len(elements)} elements in text, {len(element_titles)} in marks table")
        for el, mk in zip(elements, marks[k]):
            el["titleInMarksTable"] = mk["title"]
            el["marks"] = {key: mk[key] for key in ("theory", "practical", "project", "viva")}
        numbers = [int(p["code"][2:]) for p in pcs]
        if numbers != list(range(1, len(pcs) + 1)):
            sys.exit(f"{nos_id}: PC numbering is not 1..n: {numbers}")

        nos_marks = {
            k_: as_number(str(sum(e["marks"][k_] for e in elements)))
            for k_ in ("theory", "practical", "project", "viva")
        }
        p = params.get(nos_id, {})
        nos_list.append(
            {
                "id": nos_id,
                "title": nos_title,
                "version": p.get("version"),
                "nsqfLevel": p.get("nsqfLevel"),
                "credits": p.get("credits"),
                "weightagePct": weightage.get(nos_id),
                "marks": nos_marks,
                "elements": [
                    {"id": e["id"], "title": clean(e["title"]), "marks": e["marks"], "page": e["page"]}
                    for e in elements
                ],
                "pcs": [
                    {
                        "id": f"{nos_id}.{p_['code']}",
                        "code": p_["code"],
                        "element": p_["element"],
                        "text": clean(p_["text"]),
                        "page": p_["page"],
                    }
                    for p_ in pcs
                ],
            }
        )

    return {
        "id": qp_code,
        "version": qp_version,
        "title": clean(title),
        "nsqfLevel": nsqf,
        "nos": nos_list,
        "source": {
            "url": url,
            "sha256": hashlib.sha256(pdf.read_bytes()).hexdigest(),
            "pages": len(doc),
            "extractedAt": date.today().isoformat(),
            "extractor": "tools/extract_qp.py",
        },
    }


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("pdf", type=Path)
    ap.add_argument("out", type=Path)
    ap.add_argument("--url", required=True)
    ap.add_argument("--weightage", default="", help="NOS=pct pairs from the QP's weightage table")
    args = ap.parse_args()
    weightage = {}
    for pair in filter(None, args.weightage.split(",")):
        k, v = pair.split("=")
        weightage[k.strip()] = int(v)
    pack = parse(args.pdf, args.url, weightage)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(pack, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    total = sum(len(n["pcs"]) for n in pack["nos"])
    print(f"{pack['id']} v{pack['version']}: {len(pack['nos'])} NOS, {total} PCs -> {args.out}")
    for n in pack["nos"]:
        print(f"  {n['id']:<16} v{n['version']} L{n['nsqfLevel']} credits {n['credits']} w={n['weightagePct']}  "
              f"{len(n['elements'])} elements  {len(n['pcs']):>3} PCs  marks {n['marks']}")


if __name__ == "__main__":
    main()
