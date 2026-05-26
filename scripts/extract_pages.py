#!/usr/bin/env python3
"""Map each boete case to the PDF page of its finding in the source WOO-besluit.

Reads the OCR'd source text (besluit.txt, NOT in the repo) plus data/boetes.json,
locates each case's `overtreding` quote within that case's own report region
(bounded by where its `rapport_nr` appears), and writes data/pages.json.

Run from the repo root:
    python3 scripts/extract_pages.py
The OCR text is not committed; override its path with --besluit if needed.
"""
import argparse
import bisect
import json
import re
import sys
import unicodedata
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
BOETES = REPO / "data" / "boetes.json"
PAGES_OUT = REPO / "data" / "pages.json"
DEFAULT_TXT = Path("/home/matthijs/data/slachthuis_monitor/besluit.txt")

# Manual page overrides (case nr -> page), applied last. Populate only for cases
# where reviewing the PDF shows the matcher is wrong. See plan Task 2.
OVERRIDES: dict[int, int] = {}

PREAMBLE_MAX_PAGE = 50   # rapport_nr hits at/below this are TOC/preamble; ignore
REGION_PAD = 3           # pages of slack around the rapport_nr cluster


def normalize(s: str) -> str:
    s = s.replace("ﬁ", "fi").replace("ﬂ", "fl")  # ﬁ ﬂ ligatures
    s = unicodedata.normalize("NFKD", s)
    s = "".join(c for c in s if not unicodedata.combining(c)).lower()
    return re.sub(r"[^a-z0-9]+", " ", s).strip()


def build_index(txt: str):
    """Return (ntxt, idx_map, page_of, ff).

    ntxt    : normalized projection of txt (lowercase alnum, single spaces)
    idx_map : idx_map[i] = raw offset in txt that produced ntxt[i]
    page_of : page_of(raw_offset) -> 1-based PDF page (form-feed = page break)
    ff      : list of form-feed offsets
    """
    ff = [m.start() for m in re.finditer("\f", txt)]

    def page_of(off):
        return bisect.bisect_right(ff, off) + 1

    nchars, idx_map, prev_space = [], [], False
    for i, ch in enumerate(txt):
        c = ch.replace("ﬁ", "fi").replace("ﬂ", "fl")
        c = unicodedata.normalize("NFKD", c)
        c = "".join(x for x in c if not unicodedata.combining(x)).lower()
        c = re.sub(r"[^a-z0-9]+", " ", c) if c else c
        for cc in c:
            if cc == " ":
                if prev_space:
                    continue
                prev_space = True
            else:
                prev_space = False
            nchars.append(cc)
            idx_map.append(i)
    return "".join(nchars), idx_map, page_of, ff


def occurrences(ntxt, idx_map, page_of, snippet):
    """All PDF pages where `snippet` occurs in the normalized text."""
    if not snippet:
        return []
    pages, start = [], 0
    while True:
        p = ntxt.find(snippet, start)
        if p == -1:
            break
        pages.append(page_of(idx_map[p]))
        start = p + 1
    return pages


def resolve(case, ntxt, idx_map, page_of):
    """Return (page, method) for one case."""
    rn = case.get("rapport_nr")
    region = None
    region_pages = []
    if rn:
        region_pages = [p for p in occurrences(ntxt, idx_map, page_of, normalize(rn))
                        if p > PREAMBLE_MAX_PAGE]
        if region_pages:
            region = (min(region_pages) - REGION_PAD, max(region_pages) + REGION_PAD)

    q = normalize(case["overtreding"])
    cands = []
    for length in (40, 60, 90, 120):
        for st in range(0, max(1, len(q) - length), 20):
            cands += occurrences(ntxt, idx_map, page_of, q[st:st + length])

    if region:
        in_region = [p for p in cands if region[0] <= p <= region[1]]
        if in_region:
            return max(set(in_region), key=in_region.count), "region"
        return min(region_pages), "rapport-start"
    if cands:
        return max(set(cands), key=cands.count), "nomatch"
    return None, "none"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--besluit", type=Path, default=DEFAULT_TXT)
    args = ap.parse_args()
    if not args.besluit.exists():
        sys.exit(f"ERROR: OCR text not found at {args.besluit}\n"
                 f"It is not committed. Pass --besluit <path-to-besluit.txt>.")

    txt = args.besluit.read_text(encoding="utf-8", errors="replace")
    ntxt, idx_map, page_of, ff = build_index(txt)
    print(f"OCR: {len(txt):,} chars, {len(ff)} page breaks")

    boetes = json.loads(BOETES.read_text(encoding="utf-8"))
    out, methods = {}, {}
    for b in boetes:
        page, method = resolve(b, ntxt, idx_map, page_of)
        if b["nr"] in OVERRIDES:
            page, method = OVERRIDES[b["nr"]], "override"
        out[str(b["nr"])] = {"page": page, "method": method}
        methods[method] = methods.get(method, 0) + 1

    resolved = sum(1 for v in out.values() if v["page"])
    print(f"resolved {resolved}/{len(boetes)} | methods: {methods}")

    prevmax, ooo = 0, []
    for b in boetes:
        p = out[str(b["nr"])]["page"]
        if p is None:
            continue
        if p < prevmax:
            ooo.append((b["nr"], p, prevmax))
        prevmax = max(prevmax, p)
    if ooo:
        print("out-of-order (verify against PDF):")
        for nr, p, pm in ooo:
            print(f"  case {nr} -> p.{p} (running max {pm})")
    else:
        print("no out-of-order pages")

    PAGES_OUT.write_text(json.dumps(out, ensure_ascii=False, indent=2) + "\n",
                         encoding="utf-8")
    print(f"wrote {PAGES_OUT.relative_to(REPO)}")


if __name__ == "__main__":
    main()
