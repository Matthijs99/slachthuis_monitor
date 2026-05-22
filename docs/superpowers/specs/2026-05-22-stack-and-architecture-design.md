# Slachthuis Monitor — Stack & Architecture Design

**Date:** 2026-05-22
**Status:** Approved (design phase)
**Scope:** Pick the stack and lay out the architecture for the interactive map web app. Implementation planned in a follow-up document.

## Goals

Build a public, static web app that visualises ~113 NVWA violations at Dutch red-meat slaughterhouses (2017–2023) on an interactive map of the Netherlands. The app should:

- Show one pin per slaughterhouse with click-through to violation details.
- Let users filter by severity tier, year, and tag.
- Carry editorial framing (about/methodology, severity-tier explainer) so a journalist or curious citizen can land cold and understand what they're looking at.
- Show aggregate views (e.g. fines per slaughterhouse, severity distribution).
- Be hosted on GitHub Pages with zero recurring cost and zero secrets.

## Non-goals

- No backend, no auth, no analytics.
- No automated test suite — this is a static viz over a frozen dataset; the build pipeline plus manual QA is sufficient.
- No internationalisation — the source data is Dutch and the audience is Dutch.
- No live data ingestion — the dataset is a one-time WOO release.

## Stack

| Concern | Choice | Why |
|---|---|---|
| Site framework | **Astro 6** | Purpose-built for content + islands of interactivity. Ships ~0 KB JS by default, has a first-class GitHub Pages deploy path with an official Action. |
| Interactive islands | **Svelte 5** via `@astrojs/svelte` | Small bundle, ergonomic reactivity for the map + filter state. Used only in the map island; the rest of the site is static HTML. |
| Map | **Leaflet** | MIT-licensed, no API key, mature. |
| Tiles | **CARTO Positron** | Free, clean cartography, attribution only. Final choice deferred — see Open questions. |
| Charts | **Hand-written SVG** | 113 records and a handful of aggregates does not justify a chart library. |
| Editorial content | **Astro content collections** (Markdown) | Native to Astro. |
| Styling | **Hand-written CSS**, scoped via Astro/Svelte | No CSS framework needed at this scale. |
| Geocoding (build-time) | **Python** script hitting **PDOK Locatieserver** | Dutch government geocoder, free, no key, NL-tuned. Reuses the existing Python tooling from the extraction phase. |
| Deployment | **GitHub Actions** + `withastro/action@v6` + `actions/deploy-pages@v5` | Official, documented path. |

### Rejected alternatives

- **SvelteKit static** — uniform component model, but slightly more JS shipped for the same content, and editorial pages get more ceremony than Markdown collections.
- **Vite + vanilla JS** — smallest dep tree, but the combination of filters + charts + multiple editorial pages without a component model becomes painful fast.
- **Next.js static export** — heavyweight for this scope; would carry React, hydration, and routing complexity that the project does not need.
- **Tailwind / other CSS framework** — fine but unnecessary at this scale; revisit only if hand-written CSS grows unwieldy.

## Project layout

```
slachthuis_monitor/
├── astro.config.mjs           # site + base config for GH Pages
├── package.json
├── data/
│   ├── boetes.json            # canonical violation data (already exists)
│   └── geocoded.json          # built by scripts/geocode.py, committed
├── scripts/
│   └── geocode.py             # idempotent: only fetches missing slaughterhouses
├── src/
│   ├── pages/
│   │   ├── index.astro                 # main map + filters + list
│   │   ├── over.astro                  # about + methodology
│   │   ├── ernst.astro                 # severity tiers explained
│   │   └── slachthuis/[slug].astro     # per-slaughterhouse profile (static)
│   ├── components/
│   │   ├── Map.svelte                  # Leaflet + reactive pins
│   │   ├── Filters.svelte              # severity / year / tag, URL-synced
│   │   ├── CaseList.svelte             # filtered results list
│   │   └── Charts.astro                # static SVG aggregates
│   ├── content/
│   │   └── pages/                      # editorial markdown
│   └── lib/
│       ├── data.ts                     # load + join boetes.json + geocoded.json at build time
│       └── filters.ts                  # filter logic + URL param sync
└── .github/workflows/deploy.yml
```

## Data pipeline

**Geocoding is offline and cached.** `scripts/geocode.py`:

1. Reads `data/boetes.json`.
2. Dedupes the ~17 unique slaughterhouses by name + address.
3. For each one not already present in `data/geocoded.json`, queries PDOK Locatieserver and records the lat/lon.
4. Writes `data/geocoded.json` back to disk.

The script is idempotent: re-running it only fetches new or missing entries. The output is committed to the repo, so the build never depends on an external service.

**Build-time join.** `src/lib/data.ts` loads both JSON files and joins them by slaughterhouse name into a structured shape:

```ts
type Slaughterhouse = {
  slug: string;         // url-safe identifier
  naam: string;
  adres: string | null;
  postcode_plaats: string | null;
  lat: number;
  lon: number;
  cases: Case[];        // all violations at this location
};

type Case = {
  nr: number;
  datum: string;
  overtreding: string;
  boetebedrag: string | null;
  reactie: string | null;
  samenvatting: string;
  ernst: 1 | 2 | 3 | 4;
  ernst_tags: string[];
};
```

Pages and components consume this shape directly — no per-component reshaping.

**One pin per slaughterhouse, not per case.** The popup shows: case count, max-severity badge, link to the slaughterhouse profile page. Per-case detail lives on `/slachthuis/[slug]`.

## UI architecture

### `/` — home

- Brief editorial intro (2–3 sentences + link to `/over`) above the fold.
- Full-width Leaflet map of the Netherlands with one pin per slaughterhouse.
- Left sidebar: severity-tier chips (1–4), year range, tag multiselect.
- Filter state lives in URL query params (e.g. `?ernst=3,4&tag=bedwelming_mislukt`) so a filtered view is shareable.
- Below the map: filtered case list. Each row shows date, slaughterhouse, summary, severity badge, fine; clicking the row navigates to the corresponding `/slachthuis/[slug]` profile page anchored to that case.

### `/over` — methodology

Editorial page (Markdown) covering: what the NVWA is, what a WOO-besluit is, how the data was extracted, known gaps (~23 documents excluded from the released body; 11 *Schriftelijke Waarschuwing* not yet included), and how to read the severity-tier rubric.

### `/ernst` — severity tiers

Visual explainer of the 4 tiers (`laag`, `midden`, `hoog`, `zeer hoog`) with one example case drawn from the dataset per tier.

### `/slachthuis/[slug]` — per-slaughterhouse profile

Static-generated at build time, one page per slaughterhouse. Shows: name, address, total fines summed, severity distribution, and the full list of cases with `overtreding` quote, fine amount, and `reactie` (if any).

## Deployment

- `astro.config.mjs` (the `<github-username>` value is filled in during implementation once the deploy target is known):
  ```js
  export default defineConfig({
    site: 'https://<github-username>.github.io',
    base: '/slachthuis_monitor',
    integrations: [svelte()],
  });
  ```
- `.github/workflows/deploy.yml` uses `withastro/action@v6` to build and `actions/deploy-pages@v5` to publish. Triggered on push to `main`.
- One-time setup: GitHub Settings → Pages → Source = "GitHub Actions".
- Every internal link must respect `import.meta.env.BASE_URL` (or use Astro's link helpers) because the site lives at `/slachthuis_monitor/`, not the root.

## Open questions

None blocking. To be decided during implementation:

- Exact tile provider (CARTO Positron vs. PDOK BRT-Achtergrond) — defer until we render the first map and compare visually.
- Whether to include the 11 *Schriftelijke Waarschuwing* records in a second extraction pass — out of scope for the initial build; the methodology page will note the gap.
