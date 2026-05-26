# Deep-linking cases to their page in the source PDF — Design

**Date:** 2026-05-26
**Status:** Proposed (design phase)
**Scope:** Make each case's "Bron: volledig WOO-besluit" link jump to the exact page of the
source PDF where that case's finding appears, instead of opening the document at page 1.

## Context

We recently linked every case to the official WOO-besluit
(`SOURCE_DOCUMENT_URL`, an `open.overheid.nl` attachment) and surfaced each case's
`rapport_nr`. The link currently opens the 987-page PDF at the top. A reader who wants to
verify a quote must then hunt through ~1000 pages. Deep-linking to the right page closes that
gap and is the payoff that makes the `rapport_nr` reference genuinely useful.

### Feasibility (verified during brainstorming)

- The remote PDF served at `SOURCE_DOCUMENT_URL` is **byte-identical** to our local copy
  (`/home/matthijs/data/slachthuis_monitor/besluit-woo-...pdf`, 113,413,053 bytes, 987 pages),
  so **page N on disk == page N at the URL**.
- The URL is served `content-disposition: inline; …application/pdf`, so browsers render it in
  the built-in viewer, which honors the `#page=N` PDF Open Parameter.
- The OCR text (`besluit.txt`) contains **exactly 987 form-feed (`\f`) characters**, one per
  page boundary — so any character offset in the OCR maps to a page by counting preceding
  form-feeds.
- Matching each case's verbatim `overtreding` quote against the OCR, **constrained to the
  case's own report region** (located via its `rapport_nr`), locates **112/112** cases with only
  **one** residual out-of-order page to verify by hand. (A naive whole-document quote search
  instead mislabels six cases — see "Verification of flagged cases" for why.)

## Approach

A build-time extraction step, mirroring the existing `scripts/geocode.py` → `data/geocoded.json`
pattern: compute page numbers once, commit the result, keep the site build offline and
independent of the 113 MB PDF / OCR text (neither is in the repo).

### 1. `scripts/extract_pages.py` (new)

Inputs: `besluit.txt` (local, not in repo) + `data/boetes.json`. Output: `data/pages.json`.

Algorithm:
1. Read `besluit.txt`; record the offsets of all `\f`; `page_of(offset)` = `bisect_right(ff,
   offset) + 1`.
2. Build a normalized projection of the OCR text with an index map back to raw offsets.
   Normalization: fix ligatures (`ﬁ`/`ﬂ`), NFKD-strip diacritics, lowercase, collapse all
   non-alphanumerics to single spaces.
3. **Constrain the search to the case's own report region.** A whole-document search for a
   short quote prefix is unsafe: NVWA findings open with recurring boilerplate ("Ik stelde
   vast dat bij het verplaatsen van dieren…", "Ik zag dat de medewerker die belast was met…"),
   so a short prefix can occur 10+ times and a first-occurrence `find()` lands on an unrelated
   earlier page. Instead:
   a. Find the pages where this case's `rapport_nr` appears, **excluding the preamble/TOC**
      (drop hits on pages ≤ ~50). Those remaining hits bound the report region
      `[min−3, max+3]`.
   b. Generate candidate pages by searching `overtreding` windows of length {40, 60, 90, 120}
      at offsets stepping by 20, and keep only candidates **inside the report region**; pick
      the most frequent in-region page.
   c. Fallbacks: if no in-region quote match, use the report's start page; if the case has no
      usable `rapport_nr` (3 cases), use the most frequent whole-document candidate.
   Record the resolved `page` and the `method` (`region` | `rapport-start` | `nomatch`).
4. Write `data/pages.json`: `{ "<nr>": { "page": <int|null>, "method": "<str>" }, ... }`.
5. Print a QA report: counts by method, and a list of cases whose page is **less than the max
   page seen so far** (out-of-order ⇒ likely residual ambiguity), so they can be checked by hand.

Output shape:
```json
{ "6": { "page": 59, "method": "quote" }, "1": { "page": null, "method": "none" } }
```

### 2. Verification of flagged cases

The naive whole-document matcher flagged six cases (34, 41, 56, 57, 61, 69); investigation
showed this was the boilerplate-prefix bug described above — four genuinely wrong pages (34, 41,
56, 57 → 258, 350, 487, 497) plus two false alarms (61, 69 were already correct). The
region-constrained algorithm in step 3 resolves all 112 cases and reduces the out-of-order set
to **one** residual (the case 68 ↔ 69 boundary, a genuine adjacent-report ambiguity, not a
false match). Verification work is therefore: confirm that lone residual against the PDF, and
spot-check 2–3 `region` matches. Honor a small hand-keyed override map in the script for any
page that manual review corrects, and re-run until the QA report is clean or every remaining
out-of-order entry is confirmed legitimate.

### 3. `src/lib/data.ts`

- Import `data/pages.json`.
- Add `bron_pagina: number | null` to the `Case` type and populate it in `loadData()` from
  `pages.json[nr].page` (default `null`).
- No other join logic changes; `pages.json` is keyed by `nr`, which is unique per case.

### 4. `src/pages/slachthuis/[slug].astro`

The per-case "Bron" line already renders `SOURCE_DOCUMENT_URL`. Change the `href` to append
`#page=${c.bron_pagina}` when `bron_pagina != null`; otherwise keep the plain document URL.
Optionally show the page in the link text ("Bron: WOO-besluit, p. 59"). No style changes.

## Components & boundaries

| Unit | Purpose | Depends on | Output |
|---|---|---|---|
| `scripts/extract_pages.py` | Map case → PDF page, offline | `besluit.txt`, `boetes.json` | `data/pages.json` (committed) |
| `data/pages.json` | Frozen page lookup | — | consumed by build |
| `data.ts` | Join page onto `Case` | `pages.json` | `bron_pagina` field |
| `[slug].astro` | Render `#page=` deep link | `Case.bron_pagina`, `SOURCE_DOCUMENT_URL` | anchored link |

## Non-goals

- No runtime PDF parsing or page lookup — all resolved at build, committed as JSON.
- No hosting/altering the PDF; we only append a `#page` fragment to the existing external URL.
- No deep-linking for the home `CaseList` rows — they already route to the profile page, which
  carries the verifiable link. (Revisit only if requested.)
- Not attempting page ranges or highlight anchors — a single landing page per case is enough.

## Error handling / edge cases

- Case with no match (`page: null`): link falls back to the whole-document URL — no broken
  `#page`.
- `pages.json` missing a case `nr`: treated as `null` (same fallback).
- Regeneration requires the local `besluit.txt`; the script must fail loudly with a clear
  message if it is absent, rather than emitting an empty mapping.

## Verification

1. `python3 scripts/extract_pages.py` → QA report shows 112/112 matched and a clean (or
   fully-explained) out-of-order list; `data/pages.json` written.
2. Spot-check 3–4 pages by opening `SOURCE_DOCUMENT_URL#page=<n>` in a browser and confirming
   the case's finding is on/near that page (including the previously-flagged 34, 57).
3. `npm run build` succeeds; grep the built profile HTML for `#page=` on matched cases and its
   absence on any `null` case.
4. `npm run dev`, open a `/slachthuis/<slug>` profile, expand "Volledige bevinding", click the
   Bron link → the PDF opens at the right page.
