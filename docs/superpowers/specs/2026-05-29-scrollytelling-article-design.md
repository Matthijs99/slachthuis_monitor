# Slachthuis Monitor — Scrollytelling Article (source-data-only) — Design

**Date:** 2026-05-29
**Status:** Approved (design phase)
**Scope:** Turn the home page from a map-dashboard into a single-page scrollytelling article that tours the dataset and then hands off to the existing interactive tool. Remove all AI-generated interpretation from the site. Supersedes the home-page and `/ernst` portions of `2026-05-22-stack-and-architecture-design.md`. Implementation is planned in a follow-up document.

## Motivation

The site today opens on a tool: a map with severity-coloured pins, tier/tag filters, and a case list. Two changes:

1. **Make it read as an article.** A cold visitor should land in a narrative — a guided tour across the map — and only then reach the interactive tool. Chosen page shape: one long page where the story scrolls down into the live tool.
2. **Let the data speak for itself.** The `ernst` severity tiers, `ernst_tags`, and the one-line `samenvatting` are AI-generated interpretations. They are removed from the entire UI. The piece is built only on source fields: the verbatim NVWA finding, the fine, the date, the slaughterhouse, the source-PDF page, and the operator's response. The NVWA fine — the regulator's own assessment — is the one quantitative axis we keep, because it is data, not our interpretation.

(Principle recorded in the project memory: *data-speaks-for-itself*.)

## Goals

- A single page `/` that flows: hook → guided map tour → interactive tool.
- The map is the sticky protagonist; it flies between stops as the reader scrolls.
- Every value on screen is traceable to the source document.
- Preserve the interactive exploration tool, with factual filters.
- Stay a zero-cost static GitHub Pages build; no new runtime dependency.

## Non-goals

- No backend, auth, analytics, or i18n (unchanged).
- No automated test suite (unchanged); manual QA plus build-time assertions.
- No new data extraction; the dataset is frozen.
- No change to deployment.

## Core principle: source data only

- **Shown (source fields):** `overtreding` (verbatim finding), `boetebedrag`, `datum`, `slachthuis` (naam / adres / postcode_plaats), `bron_pagina`, `reactie`.
- **Removed from all UI:** `ernst`, `ernst_tags`, `samenvatting`.
- **Quantitative axes:** `boetebedrag` (official) and counts of findings. No severity tier anywhere.

The three AI fields remain in `data/boetes.json` (decision was "remove from UI", not "delete from data") but are never read by any page or component, and are not mentioned anywhere on the site.

**Copy rule.** All prose is factual and descriptive. Present numbers and verbatim quotes without interpretive or emotive framing; let juxtaposition (a small fine beside a verbatim finding) do the work. No rhetorical sentences (e.g. *not* "jaar na jaar … de overtredingen bleven").

## Page structure — `/`

One page, three acts, **one persistent Leaflet map**.

From Act 2 onward the page is two columns: a **left rail** of scrolling content and, on the right, a **sticky, full-height Leaflet map** that persists as a single instance through the tour and into the tool. The rail's content changes as you scroll — story steps during the tour, then the tool's filters and case list. The map is never torn down or replaced: the map you are guided through is the one you end up controlling.

### Act 1 — Hook

Full-width intro: title, one short factual framing paragraph, a brief content note (graphic descriptions of animal handling), and the headline figures drawn straight from the data: **112 findings, 16 slaughterhouses, 2017–2023, €398.000 in fines**; one site accounts for 20 of them. As the reader scrolls in, the map settles into its sticky right column with all sites plotted (pins sized by number of findings).

### Act 2 — The tour (scrollytelling)

The rail is a sequence of **stops**. As each stop crosses the trigger zone it becomes active: the map flies to that site, enlarges its pin, dims the others. Stops are ordered **most-documented first** (by the app's merged per-site case count).

| Stop | Content |
|---|---|
| 1–6 | The six most-documented sites (see appendix), each a data portrait. |
| 7 | **The fines** — a data stop: total €398.000; 104 of 112 findings carried a fine, 8 did not; amounts range €2.500–€12.500. The distribution, computed at build. No claim, just the spread. |
| 8 | **Hand-off** — the map flies back to the full-country view; a short factual line; the interactive controls appear. |

Each site stop's **anchor finding** defaults to the case carrying that site's **largest single fine** — a transparent, official rule. Ties are broken by earliest date, then lowest case number (deterministic, non-editorial). A documented per-site **override table** allows choosing a specific case where editorially warranted; overrides are explicit in code and validated at build. (Example where it matters: ESA's largest fine is #15 at €5.000, an electric-prod case; an override could instead surface #16, the stick-beating, at €2.500.)

### Act 3 — Interactive tool (hand-off)

The same map switches to interactive mode (pan/zoom enabled, popups, all pins shown). The rail becomes the tool's controls: **year**, **slaughterhouse**, and **wel/geen boete** filters (URL-synced, as today), plus the filtered **case list**. Clicking a case opens its `/slachthuis/[slug]` profile anchored to that case (as today).

## Per-stop data portrait (rail, one site stop)

- Stop label (e.g. "STOP 01") + site name + place.
- Stat row: number of findings · total fine · period (year range). All factual.
- "Bevindingen per jaar" — a small per-year count bar (neutral label, no caption).
- One verbatim `overtreding` quote, with meta `#nr · datum · boete €… · bron, p.N →` deep-linking the source PDF page. Full verbatim by default; an honest "[…]" elision only on the longest quotes.

## Map behaviour

- **Pins:** one colour (the site accent), **sized by number of findings**. No tier colours. (Shading by total fine is deferred; v1 is size-by-count only.)
- **Tour mode:** interactions disabled; camera driven by the active stop via `flyTo` (or `setView` under reduced-motion); active site emphasised, others dimmed.
- **Interactive mode:** current tool behaviour — all pins, filtered by visible case numbers, popups, controls enabled.
- **Single instance:** the map component mounts once and switches modes; it is not unmounted between acts.
- **Mobile:** the two-column layout collapses; the map becomes sticky at the top (≈55vh) with the rail scrolling beneath. The tool stacks filters → list as today.

## Components & files

**New**
- `src/lib/story.ts` — build-time: per-site aggregates (case count, total-fine cents, counts-by-year, largest-fine case), the ordered site list, the curated `STOPS` itinerary, the optional anchor-override table, and the build-time assertions below.
- `src/lib/scrollytell.ts` — a Svelte action wrapping `IntersectionObserver`; reports the active step as steps cross a trigger line. ~40 lines, no dependency.
- `src/components/Story.svelte` — orchestrates the page: owns the persistent map, runs the rail's state machine (steps → tool), wires the scroll action to map camera + active site. The stop content is server-rendered (for the no-JS fallback) and enhanced in place; only the map island is `client:only` (Leaflet has no SSR).
- `src/components/StoryStep.svelte` — renders one data portrait.

**Modified**
- `src/pages/index.astro` — becomes the article: Act 1 markup + the `Story` island.
- `src/components/Map.svelte` — add `mode` (`'tour' | 'interactive'`), `activeSlug`, pins sized by count, dim/emphasise, imperative camera control, interaction toggle; reduced-motion aware.
- `src/components/Filters.svelte` — replace severity chips + tag multiselect with year, slaughterhouse, and wel/geen boete.
- `src/lib/filters.ts` — rework the filter model + URL params to the new factual filters.
- `src/lib/data.ts` — drop the `ernst.ts` import; retype `Case.ernst` as `number` (field retained in data, unused by the UI). `parseFineCents` / `formatEUR` are reused by `story.ts`.
- `src/components/CaseList.svelte` — show a verbatim finding snippet + fine + date + source link; drop `samenvatting` and the tier badge.
- `src/pages/slachthuis/[slug].astro` — drop tier/tag/`samenvatting`; show verbatim findings + fines + responses.
- `src/components/Charts.astro` — remove the "verdeling naar ernst" chart; keep fines-per-slaughterhouse and findings-per-year (both factual).
- `src/pages/over.astro` — add a factual "Hoe de data is samengesteld" note (taking over `/ernst`'s methodology role) covering extraction, geocoding and known gaps; it stays silent about the AI classification. Remove any tier framing.
- `src/layouts/Layout.astro` — remove the `/ernst` nav link.
- `src/styles/global.css` — remove the `--c-ernst-*` tier variables and badge styles (reduce to the single pin colour).
- `src/components/HomeApp.svelte` — absorbed by / refactored into `Story.svelte` (the page is now one orchestrated island), or retained as the Act-3 sub-view; settled in the plan.

**Removed**
- `src/pages/ernst.astro`
- `src/components/ErnstBadge.svelte`
- `src/lib/ernst.ts` — no remaining consumers once tier colours/labels are gone. The `Case.ernst` field stays in the data, typed as `number`.

## Data flow

`loadData()` (existing) → `story.ts` computes aggregates + the `STOPS` itinerary at build → `index.astro` passes them as props to `Story.svelte` (client island) → the `scrollytell` action reports the active step → `Story` sets the map's `activeSlug` / mode and marks the active rail item. At hand-off, `Story` flips the map to interactive mode and renders `Filters` + `CaseList` (URL-synced) in the rail.

## Progressive enhancement & accessibility

- **No JS:** `index.astro` renders the stops as plain article sections (each: site, stats, verbatim quote, source link) followed by the full case list. The tour map simply does not hydrate; the article remains fully readable. The fly-through is enhancement.
- **`prefers-reduced-motion`:** `setView` instead of animated `flyTo`; no incidental motion.
- **Keyboard / semantics:** stops are real sections with headings; the sticky map has an accessible label; the tool's controls keep their current labelled inputs.
- **Scroll:** native scrolling; `position: sticky` for the map.

## Performance

Still a static build. The only new client JS is `scrollytell.ts` (tiny) plus `Story` / `StoryStep`. Leaflet is already shipped for the tool — reused, not duplicated. No second map library, no charting library. Lighthouse profile unchanged.

## Testing & verification

Consistent with the project's "no automated suite" stance:

- **Build-time assertions in `story.ts`:** every `STOPS` entry (and every anchor / override case number) resolves to a real case; per-site counts sum to the dataset total (112); every featured site has coordinates. A failed assertion fails `astro build`.
- **Manual QA:** `astro build` + a desktop and mobile pass — tour fly-through, reduced-motion, no-JS fallback, hand-off to the tool, filters, deep links.
- Verify in a real browser before merge.

## Itinerary appendix (exact values from `data/boetes.json`, merge applied)

| # | Site (place) | Findings | Total fine | Period | Default anchor (largest fine) |
|---|---|---:|---:|---|---|
| 1 | Exportslachterij Gosschalk (Epe) | 20 | €90.000 | 2019–2022 | #35 — €10.000 |
| 2 | Slachterij Amstelland (De Hoef)¹ | 14 | €50.000 | 2018–2019 | #76 — €12.500 |
| 3 | VION Boxtel | 10 | €30.000 | 2018–2023 | #100 — €7.500 |
| 4 | ESA (Apeldoorn) | 10 | €20.000 | 2017–2022 | #15 — €5.000² |
| 5 | Pali Geldrop | 9 | €35.000 | 2017–2020 | #59 — €5.000 |
| 6 | International Meat Processing Services (Breukelen) | 8 | €50.000 | 2018–2022 | #53 — €12.500 |

¹ Includes former operator Slachterij/Grossierderij Wouters, folded in per the app's site-merge rule.
² ESA's largest fine is an electric-prod case; a documented override may instead surface #16 (the stick-beating, €2.500). This is the canonical example of the override table.

Aggregate totals: 112 findings · €398.000 in fines · 104 with a fine, 8 without · individual fines €2.500–€12.500.

## Minor decisions (chosen defaults, easily reversible)

- **Methodology note:** stays silent about the AI classification. *(Considered a one-line disclosure; declined.)*
- **Verbatim quotes:** full text by default, honest "[…]" elision only on the longest. *Alternative: never elide.*
- **Pins:** size by case count, single colour. *Alternative: also shade by total fine.*
- **AI data fields:** kept in `boetes.json`, unused. *Alternative: delete from data.*
