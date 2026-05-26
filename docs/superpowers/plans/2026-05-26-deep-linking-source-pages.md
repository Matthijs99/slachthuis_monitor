# Deep-linking Cases to Source PDF Pages — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make each case's "Bron: volledig WOO-besluit" link jump to the exact PDF page of that case's finding via a `#page=N` fragment.

**Architecture:** A one-shot, offline Python script maps each case to a PDF page by counting form-feed page-breaks in the OCR text and locating the case's `overtreding` quote *within that case's own report region* (bounded by where its `rapport_nr` appears). The result is committed as `data/pages.json` (mirrors the existing `scripts/geocode.py` → `data/geocoded.json` pattern), joined onto `Case` at build time, and rendered as a `#page=` anchor on the slaughterhouse profile.

**Tech Stack:** Python 3 (stdlib only) for extraction; Astro 6 + TypeScript for the site. Source spec: `docs/superpowers/specs/2026-05-26-deep-linking-source-pages-design.md`.

**Testing note:** This repo has no test framework by design (frozen dataset, manual QA — see the stack design doc). Verification is the extraction script's built-in QA report run against the real OCR, plus build-output grep and a browser check. There is no `pytest`.

**Preconditions:** The OCR text `besluit.txt` exists at `/home/matthijs/data/slachthuis_monitor/besluit.txt` (987 page-breaks; not committed). The source URL constant `SOURCE_DOCUMENT_URL` already exists in `src/lib/data.ts`.

---

### Task 1: Extraction script + generated `data/pages.json`

**Files:**
- Create: `scripts/extract_pages.py`
- Create (generated): `data/pages.json`

- [ ] **Step 1: Write `scripts/extract_pages.py`**

```python
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
# where reviewing the PDF shows the matcher is wrong. See Task 2.
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
```

- [ ] **Step 2: Run the script**

Run: `python3 scripts/extract_pages.py`
Expected output (approximately):
```
OCR: 1,823,757 chars, 987 page breaks
resolved 113/113 | methods: {'region': 105, 'rapport-start': 2, 'nomatch': 6}
out-of-order (verify against PDF):
  case 68 -> p.580 (running max 586)
wrote data/pages.json
```
Confirm: `resolved 113/113`, and the out-of-order list has **only** the case 68/69 boundary (≤1 entry). If more cases appear out-of-order, stop and re-investigate before continuing (do not hand-tune blindly).

- [ ] **Step 3: Sanity-check `data/pages.json`**

Run: `python3 -c "import json; d=json.load(open('data/pages.json')); print(len(d), d['57'], d['34'], d['21'])"`
Expected: `113 {'page': 497, 'method': 'region'} {'page': 258, 'method': 'region'} {'page': <int>, 'method': 'nomatch'}`
(Case 21 has no `rapport_nr`, so its method is `nomatch`; that is expected.)

- [ ] **Step 4: Commit**

```bash
git add scripts/extract_pages.py data/pages.json
git commit -m "Add page-extraction script and committed page map

Maps each case to its source-PDF page via OCR form-feed counting +
rapport_nr-region-constrained quote matching. Output committed so the
site build stays offline.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 2: Verify the residual out-of-order case and lock in overrides

**Files:**
- Modify: `scripts/extract_pages.py` (the `OVERRIDES` dict only)
- Regenerate: `data/pages.json`

- [ ] **Step 1: Inspect the flagged case(s) against the OCR**

For each case `N` printed as out-of-order in Task 1 Step 2 (expected: case 68), print the OCR around its candidate page and around its `rapport_nr` cluster:

```bash
python3 - <<'PY'
import json, re, bisect, unicodedata
from pathlib import Path
import importlib.util
spec = importlib.util.spec_from_file_location("ep", "scripts/extract_pages.py")
ep = importlib.util.module_from_spec(spec); spec.loader.exec_module(ep)
txt = Path("/home/matthijs/data/slachthuis_monitor/besluit.txt").read_text(errors="replace")
ntxt, idx_map, page_of, ff = ep.build_index(txt)
boetes = {b["nr"]: b for b in json.loads(Path("data/boetes.json").read_text())}
for nr in (67, 68, 69):                      # the boundary neighbourhood
    b = boetes[nr]
    rn_pages = [p for p in ep.occurrences(ntxt, idx_map, page_of, ep.normalize(b["rapport_nr"])) if p > 50] if b.get("rapport_nr") else []
    print(f"\ncase {nr} rapport_nr={b['rapport_nr']} report pages={rn_pages}")
    print("  finding:", ep.normalize(b["overtreding"])[:120])
PY
```

Decide the correct page for the flagged case: the page where that case's *Bevinding* text actually sits, which must fall inside its own `rapport_nr` page cluster. Case 68 and 69 have adjacent/overlapping report regions; pick the page carrying each case's finding.

- [ ] **Step 2: Add an override only if the matcher is genuinely wrong**

If review shows the matcher's page is correct (the cases are simply adjacent in the document), leave `OVERRIDES` empty — an out-of-order entry that is *verified legitimate* is acceptable. Only if a page is wrong, add it, e.g.:

```python
OVERRIDES: dict[int, int] = {
    68: 581,   # verified: Bevinding for rapport_nr <...> is on p.581, not p.580
}
```

- [ ] **Step 3: Regenerate and confirm**

Run: `python3 scripts/extract_pages.py`
Expected: `resolved 113/113`, and either "no out-of-order pages" or only entries you have confirmed legitimate.

- [ ] **Step 4: Commit (only if `OVERRIDES` or `pages.json` changed)**

```bash
git add scripts/extract_pages.py data/pages.json
git commit -m "Verify residual page match; record any manual overrides

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```
If nothing changed in this task, skip the commit.

---

### Task 3: Join `bron_pagina` onto `Case` in `data.ts`

**Files:**
- Modify: `src/lib/data.ts`

- [ ] **Step 1: Import `pages.json` and add the type**

At the top of `src/lib/data.ts`, add the import beside the existing data imports (currently lines 1-2):

```ts
import pagesData from '../../data/pages.json';
```

Add `bron_pagina` to the `Case` type (after `jaar` in the existing type, around line 8):

```ts
  jaar: number | null;
  bron_pagina: number | null;
```

Add a raw type for the pages map near the other `Raw*` types (after `RawGeo`, around line 49):

```ts
type RawPages = Record<string, { page: number | null; method: string }>;
```

- [ ] **Step 2: Populate `bron_pagina` in `loadData()`**

In `loadData()`, add a lookup alongside `const geo = geocoded as RawGeo;` (around line 80):

```ts
  const pages = pagesData as RawPages;
```

In the `bySlh.get(key)!.cases.push({ ... })` object (around lines 101-112), add the field next to `jaar`:

```ts
      jaar: extractYear(b.datum),
      bron_pagina: pages[String(b.nr)]?.page ?? null,
```

- [ ] **Step 3: Type-check via build**

Run: `npm run build`
Expected: build completes with no TypeScript errors and the same page count as before (`21 page(s) built`). If TS complains that `pages.json` has no type, confirm `resolveJsonModule` is on (it is — `boetes.json`/`geocoded.json` import the same way).

- [ ] **Step 4: Commit**

```bash
git add src/lib/data.ts
git commit -m "Join bron_pagina (source PDF page) onto Case

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 4: Render the `#page=` deep link on the profile page

**Files:**
- Modify: `src/pages/slachthuis/[slug].astro`

- [ ] **Step 1: Build the per-case href with a page anchor**

In `src/pages/slachthuis/[slug].astro`, the per-case `<p class="bron">` block (added previously) currently links to `SOURCE_DOCUMENT_URL`. Replace that `<p class="bron">…</p>` block with one that appends `#page=` when a page is known and shows the page in the link text:

```astro
          <p class="bron">
            {c.rapport_nr && <>NVWA-rapport <code>{c.rapport_nr}</code> · </>}
            <a
              href={c.bron_pagina ? `${SOURCE_DOCUMENT_URL}#page=${c.bron_pagina}` : SOURCE_DOCUMENT_URL}
              target="_blank"
              rel="noopener"
            >
              Bron: WOO-besluit{c.bron_pagina ? `, p. ${c.bron_pagina}` : ''}
            </a>
          </p>
```

(No new imports — `SOURCE_DOCUMENT_URL` is already imported; `.bron` styles already exist.)

- [ ] **Step 2: Build and verify the anchors render**

Run: `npm run build`
Then verify a matched case carries `#page=` and a `nomatch`/null case does not:

```bash
grep -o 'href="[^"]*#page=[0-9]*"' dist/slachthuis/*/index.html | head
```
Expected: multiple `…/attachment/…#page=NNN` hrefs. Then confirm a known case page renders, e.g. case 57 (page 497) on its profile — find its slug and grep:
```bash
grep -l '#page=497' dist/slachthuis/*/index.html
```
Expected: the file for the slaughterhouse owning case 57.

- [ ] **Step 3: Commit**

```bash
git add 'src/pages/slachthuis/[slug].astro'
git commit -m "Deep-link each case to its page in the source PDF

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 5: End-to-end verification

**Files:** none (verification only)

- [ ] **Step 1: Fresh build**

Run: `npm run build`
Expected: clean build, `21 page(s) built`.

- [ ] **Step 2: Browser spot-check**

Run: `npm run dev` (then open the printed localhost URL).
- Open a `/slachthuis/<slug>` profile, expand "Volledige bevinding".
- The Bron line reads "Bron: WOO-besluit, p. NNN".
- Click it → the open.overheid.nl PDF opens in the browser viewer **scrolled to page NNN**, and that page shows the case's finding.
- Spot-check the previously-mis-paged cases 34 (p.258) and 57 (p.497).

- [ ] **Step 3: Confirm fallback for unmatched cases**

For a case with no `rapport_nr` (21, 49, or 81) whose `method` is `nomatch`, confirm its link still works (either a plausible `#page=` or, if its page is null, the plain document URL — no broken anchor).

- [ ] **Step 4: Final state**

The branch `feat/deep-link-source-pages` now contains: the spec, `scripts/extract_pages.py`, `data/pages.json`, the `data.ts` join, and the `[slug].astro` deep link. Stop here and report; integration (merge to `main` → triggers GitHub Pages deploy) is a separate, user-approved step.

---

## Self-Review

- **Spec coverage:** script + `pages.json` (spec §1) → Task 1; region-constrained algorithm (spec §1 step 3) → embedded in `resolve()`; flagged-case verification (spec §2) → Task 2; `data.ts` join / `bron_pagina` (spec §3) → Task 3; `#page=` render with fallback (spec §4) → Task 4; verification (spec) → Task 5. Error handling (missing `besluit.txt` fails loudly; null page → plain URL) covered in Task 1 Step 1 and Task 4 Step 1.
- **Placeholders:** none — full script and full edits are inline.
- **Type consistency:** `RawPages` (`{page, method}`) matches the script's output shape and the `pages[String(b.nr)]?.page` access; `bron_pagina: number | null` matches `Case` usage in `[slug].astro`.
