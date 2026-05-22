# Slachthuis Monitor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Slachthuis Monitor — an Astro static site visualising 113 NVWA violations at Dutch slaughterhouses on an interactive map, deployable to GitHub Pages.

**Architecture:** Astro produces static HTML for editorial pages and per-slaughterhouse profiles. A single Svelte client island on the home page owns the map + filters + case list and syncs state to URL params. Build-time Python script geocodes slaughterhouses via PDOK Locatieserver; output is committed so builds never hit external services.

**Tech Stack:** Astro 6, Svelte 5 (`@astrojs/svelte`), Leaflet, CARTO Voyager tiles, hand-written CSS, TypeScript, Python 3 (geocoding), GitHub Actions (`withastro/action@v6` + `actions/deploy-pages@v5`).

**Verification model:** No unit-test suite (per spec). Each task's verification step is `npm run build` succeeding, optionally combined with a manual visual check via `npm run dev` and a browser. Treat build failure as the loud signal.

---

## File map

| Path | Created in | Purpose |
|---|---|---|
| `package.json`, `astro.config.mjs`, `tsconfig.json` | Task 1 | Project config |
| `src/layouts/Layout.astro` | Task 1 | Shared HTML shell, header/footer, global CSS |
| `src/styles/global.css` | Task 1 | Site-wide CSS |
| `scripts/geocode.py` | Task 2 | One-off offline geocoder |
| `data/geocoded.json` | Task 2 | Geocoder output (committed) |
| `src/lib/data.ts` | Task 3 | Load + join boetes.json + geocoded.json |
| `src/lib/filters.ts` | Task 3 | Filter logic + URL param sync |
| `src/components/Map.svelte` | Task 4 | Leaflet map island |
| `src/components/Filters.svelte` | Task 5 | Filter sidebar |
| `src/components/CaseList.svelte` | Task 5 | Filtered case list |
| `src/components/HomeApp.svelte` | Task 5 | Wires Map + Filters + CaseList |
| `src/pages/index.astro` | Task 5 | Home page |
| `src/pages/slachthuis/[slug].astro` | Task 6 | Per-slaughterhouse profile pages |
| `src/pages/over.astro`, `src/pages/ernst.astro` | Task 7 | Editorial pages |
| `src/components/Charts.astro` | Task 8 | Static SVG aggregates |
| `.github/workflows/deploy.yml` | Task 9 | GitHub Pages deploy |

---

## Task 1: Scaffold Astro project with Svelte and Layout

**Files:**
- Create: `package.json`, `astro.config.mjs`, `tsconfig.json`, `src/env.d.ts`
- Create: `src/layouts/Layout.astro`
- Create: `src/styles/global.css`
- Create: `src/pages/index.astro` (placeholder, replaced in Task 5)

- [ ] **Step 1: Initialise package.json**

Create `package.json`:

```json
{
  "name": "slachthuis-monitor",
  "type": "module",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "astro dev",
    "build": "astro build",
    "preview": "astro preview",
    "check": "astro check"
  }
}
```

- [ ] **Step 2: Install dependencies**

Run:
```bash
npm install astro@^6 @astrojs/svelte@^7 @astrojs/check svelte@^5 typescript leaflet
npm install -D @types/leaflet
```

Expected: `node_modules/` populated, lockfile written. No errors.

- [ ] **Step 3: Create astro.config.mjs**

```js
import { defineConfig } from 'astro/config';
import svelte from '@astrojs/svelte';

export default defineConfig({
  site: 'https://example.github.io',
  base: '/slachthuis_monitor',
  trailingSlash: 'always',
  integrations: [svelte()],
});
```

Note: replace `example` with the actual GitHub username before deploying (Task 9).

- [ ] **Step 4: Create tsconfig.json**

```json
{
  "extends": "astro/tsconfigs/strict",
  "include": ["src/**/*", "data/**/*.json"],
  "compilerOptions": {
    "resolveJsonModule": true
  }
}
```

- [ ] **Step 5: Create src/env.d.ts**

```ts
/// <reference types="astro/client" />
```

- [ ] **Step 6: Create src/styles/global.css**

```css
:root {
  --c-bg: #ffffff;
  --c-text: #1a1a1a;
  --c-muted: #555;
  --c-border: #e3e3e3;
  --c-accent: #7f1d1d;
  --c-ernst-1: #fde68a;
  --c-ernst-2: #fb923c;
  --c-ernst-3: #dc2626;
  --c-ernst-4: #7f1d1d;
  --max-width: 1200px;
  font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
}

* { box-sizing: border-box; }
body { margin: 0; color: var(--c-text); background: var(--c-bg); line-height: 1.5; }
a { color: var(--c-accent); }
a:hover { text-decoration: underline; }

.container { max-width: var(--max-width); margin: 0 auto; padding: 1rem 1.25rem; }

header.site-header {
  border-bottom: 1px solid var(--c-border);
  padding: 0.8rem 1.25rem;
}
header.site-header .container {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 1rem;
  padding: 0;
}
header.site-header h1 { font-size: 1.2rem; margin: 0; }
header.site-header nav a { margin-left: 1rem; font-size: 0.9rem; color: var(--c-muted); text-decoration: none; }

footer.site-footer {
  border-top: 1px solid var(--c-border);
  margin-top: 3rem;
  padding: 1rem 1.25rem;
  color: var(--c-muted);
  font-size: 0.85rem;
}
```

- [ ] **Step 7: Create src/layouts/Layout.astro**

```astro
---
import '../styles/global.css';

type Props = { title: string };
const { title } = Astro.props;
const base = import.meta.env.BASE_URL.replace(/\/$/, '');
---
<!doctype html>
<html lang="nl">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>{title} — Slachthuis Monitor</title>
  </head>
  <body>
    <header class="site-header">
      <div class="container">
        <h1><a href={`${base}/`} style="color: inherit; text-decoration: none;">Slachthuis Monitor</a></h1>
        <nav>
          <a href={`${base}/`}>Kaart</a>
          <a href={`${base}/ernst/`}>Ernstgradering</a>
          <a href={`${base}/over/`}>Over de data</a>
        </nav>
      </div>
    </header>
    <main class="container">
      <slot />
    </main>
    <footer class="site-footer">
      <div class="container">
        Bron: NVWA WOO-besluit (2017–2023). Code op
        <a href="https://github.com/">GitHub</a>.
      </div>
    </footer>
  </body>
</html>
```

- [ ] **Step 8: Create placeholder src/pages/index.astro**

```astro
---
import Layout from '../layouts/Layout.astro';
---
<Layout title="Kaart">
  <p>Placeholder — replaced in Task 5.</p>
</Layout>
```

- [ ] **Step 9: Verify build**

Run: `npm run build`
Expected: build succeeds, output in `dist/`. No errors.

Run: `npm run dev`, open `http://localhost:4321/slachthuis_monitor/`, confirm the placeholder page loads with header/footer. Then stop the dev server.

- [ ] **Step 10: Commit**

```bash
git add package.json package-lock.json astro.config.mjs tsconfig.json src/
git commit -m "Scaffold Astro project with Svelte integration and shared layout"
```

---

## Task 2: Geocoding script

**Files:**
- Create: `scripts/geocode.py`
- Create: `data/geocoded.json` (output)

- [ ] **Step 1: Write scripts/geocode.py**

```python
#!/usr/bin/env python3
"""Geocode unique slaughterhouses in boetes.json via PDOK Locatieserver.

Idempotent: only fetches lat/lon for slaughterhouses not already in geocoded.json.
Run from project root: python3 scripts/geocode.py
"""

import json
import re
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BOETES = ROOT / "data" / "boetes.json"
GEOCODED = ROOT / "data" / "geocoded.json"
API = "https://api.pdok.nl/bzk/locatieserver/search/v3_1/free"


def dedupe_key(slh: dict) -> str:
    return f"{slh.get('naam', '')}|{slh.get('postcode_plaats') or ''}"


def build_query(slh: dict) -> str:
    parts = [slh.get("adres"), slh.get("postcode_plaats")]
    q = ", ".join(p for p in parts if p)
    return q or slh.get("naam", "")


def geocode(query: str) -> dict | None:
    params = {
        "q": query,
        "fl": "id,weergavenaam,centroide_ll,type",
        "fq": "type:adres",
        "rows": 1,
    }
    url = f"{API}?{urllib.parse.urlencode(params)}"
    with urllib.request.urlopen(url, timeout=15) as r:
        data = json.load(r)
    docs = data.get("response", {}).get("docs", [])
    if not docs:
        return None
    m = re.match(r"POINT\(([\d.\-]+) ([\d.\-]+)\)", docs[0].get("centroide_ll", ""))
    if not m:
        return None
    lon, lat = float(m.group(1)), float(m.group(2))
    return {"lat": lat, "lon": lon, "matched": docs[0].get("weergavenaam")}


def main() -> None:
    cases = json.loads(BOETES.read_text(encoding="utf-8"))
    unique: dict[str, dict] = {}
    for c in cases:
        unique.setdefault(dedupe_key(c["slachthuis"]), c["slachthuis"])

    existing: dict[str, dict] = {}
    if GEOCODED.exists():
        existing = json.loads(GEOCODED.read_text(encoding="utf-8"))

    fetched = 0
    for key, slh in unique.items():
        if key in existing and existing[key].get("lat") is not None:
            continue
        query = build_query(slh)
        print(f"Geocoding: {slh['naam']!r} ({query!r})", file=sys.stderr)
        try:
            result = geocode(query)
        except Exception as e:
            print(f"  ERROR: {e}", file=sys.stderr)
            result = None
        record = {
            "naam": slh["naam"],
            "adres": slh.get("adres"),
            "postcode_plaats": slh.get("postcode_plaats"),
            "lat": None,
            "lon": None,
            "matched": None,
        }
        if result:
            record.update(result)
            print(f"  -> {result['lat']:.5f}, {result['lon']:.5f}", file=sys.stderr)
        else:
            print("  NOT FOUND", file=sys.stderr)
        existing[key] = record
        fetched += 1
        time.sleep(0.3)

    GEOCODED.write_text(
        json.dumps(existing, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    print(f"Done. {fetched} new/refreshed entries. Total: {len(existing)}", file=sys.stderr)


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Run the script**

Run: `python3 scripts/geocode.py`
Expected: stderr shows ~17 "Geocoding: …" lines followed by lat/lon results, no NOT FOUND results (or at most a handful). `data/geocoded.json` is written.

- [ ] **Step 3: Inspect the output**

Run: `python3 -c "import json; d=json.load(open('data/geocoded.json')); print(f'{len(d)} entries, {sum(1 for v in d.values() if v[\"lat\"] is not None)} geocoded')"`
Expected: ~17 entries, all (or nearly all) with lat/lon.

If any slaughterhouses failed to geocode: manually look up the address (e.g. on Google Maps), open `data/geocoded.json`, and fill in lat/lon by hand. Note that in the docstring.

- [ ] **Step 4: Commit**

```bash
git add scripts/geocode.py data/geocoded.json
git commit -m "Add PDOK geocoding script and geocoded slaughterhouse coordinates"
```

---

## Task 3: Data layer and filter library

**Files:**
- Create: `src/lib/data.ts`
- Create: `src/lib/filters.ts`

- [ ] **Step 1: Create src/lib/data.ts**

```ts
import boetes from '../../data/boetes.json';
import geocoded from '../../data/geocoded.json';

export type Ernst = 1 | 2 | 3 | 4;

export type Case = {
  nr: number;
  rapport_nr: string | null;
  datum: string;
  jaar: number | null;
  overtreding: string;
  boetebedrag: string | null;
  reactie: string | null;
  samenvatting: string;
  ernst: Ernst;
  ernst_tags: string[];
};

export type Slaughterhouse = {
  slug: string;
  naam: string;
  adres: string | null;
  postcode_plaats: string | null;
  lat: number | null;
  lon: number | null;
  cases: Case[];
};

type RawBoete = {
  nr: number;
  rapport_nr: string | null;
  datum: string;
  slachthuis: { naam: string; adres: string | null; postcode_plaats: string | null };
  overtreding: string;
  boetebedrag: string | null;
  reactie: string | null;
  samenvatting: string;
  ernst: number;
  ernst_tags: string[];
};

type RawGeo = Record<string, {
  naam: string;
  adres: string | null;
  postcode_plaats: string | null;
  lat: number | null;
  lon: number | null;
  matched: string | null;
}>;

function extractYear(datum: string): number | null {
  const m = datum.match(/\b(19|20)\d{2}\b/);
  return m ? parseInt(m[0], 10) : null;
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function slugFor(naam: string, postcode_plaats: string | null): string {
  const plaats = (postcode_plaats || '').replace(/^\d{4}\s*[A-Z]{0,2}\s*/i, '').trim();
  return slugify(plaats ? `${naam} ${plaats}` : naam);
}

function dedupeKey(naam: string, postcode_plaats: string | null): string {
  return `${naam}|${postcode_plaats || ''}`;
}

let cache: { slaughterhouses: Slaughterhouse[]; cases: Case[] } | null = null;

export function loadData(): { slaughterhouses: Slaughterhouse[]; cases: Case[] } {
  if (cache) return cache;

  const raw = boetes as RawBoete[];
  const geo = geocoded as RawGeo;

  const bySlh = new Map<string, Slaughterhouse>();

  for (const b of raw) {
    const key = dedupeKey(b.slachthuis.naam, b.slachthuis.postcode_plaats);
    const g = geo[key] ?? {};
    if (!bySlh.has(key)) {
      bySlh.set(key, {
        slug: slugFor(b.slachthuis.naam, b.slachthuis.postcode_plaats),
        naam: b.slachthuis.naam,
        adres: b.slachthuis.adres,
        postcode_plaats: b.slachthuis.postcode_plaats,
        lat: g.lat ?? null,
        lon: g.lon ?? null,
        cases: [],
      });
    }
    bySlh.get(key)!.cases.push({
      nr: b.nr,
      rapport_nr: b.rapport_nr,
      datum: b.datum,
      jaar: extractYear(b.datum),
      overtreding: b.overtreding,
      boetebedrag: b.boetebedrag,
      reactie: b.reactie,
      samenvatting: b.samenvatting,
      ernst: b.ernst as Ernst,
      ernst_tags: b.ernst_tags,
    });
  }

  // Ensure slugs are unique (defensive — should already be by construction)
  const slugCounts = new Map<string, number>();
  for (const s of bySlh.values()) {
    const n = (slugCounts.get(s.slug) ?? 0) + 1;
    slugCounts.set(s.slug, n);
    if (n > 1) s.slug = `${s.slug}-${n}`;
  }

  const slaughterhouses = Array.from(bySlh.values()).sort((a, b) => a.naam.localeCompare(b.naam, 'nl'));
  const cases = slaughterhouses.flatMap(s => s.cases);

  cache = { slaughterhouses, cases };
  return cache;
}

export function parseFineCents(boetebedrag: string | null): number {
  if (!boetebedrag) return 0;
  // Dutch format: "5.000,00" -> 500000 cents
  const normalized = boetebedrag.replace(/\./g, '').replace(',', '.');
  const n = parseFloat(normalized);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

export function formatEUR(cents: number): string {
  return new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(cents / 100);
}
```

- [ ] **Step 2: Create src/lib/filters.ts**

```ts
import type { Case } from './data';

export type Filters = {
  ernst: Set<number>;
  tags: Set<string>;
  yearMin: number | null;
  yearMax: number | null;
};

export function emptyFilters(): Filters {
  return { ernst: new Set(), tags: new Set(), yearMin: null, yearMax: null };
}

export function applyFilters(cases: Case[], f: Filters): Case[] {
  return cases.filter(c => {
    if (f.ernst.size > 0 && !f.ernst.has(c.ernst)) return false;
    if (f.tags.size > 0 && !c.ernst_tags.some(t => f.tags.has(t))) return false;
    if (f.yearMin != null && (c.jaar == null || c.jaar < f.yearMin)) return false;
    if (f.yearMax != null && (c.jaar == null || c.jaar > f.yearMax)) return false;
    return true;
  });
}

export function filtersToParams(f: Filters): URLSearchParams {
  const p = new URLSearchParams();
  if (f.ernst.size) p.set('ernst', Array.from(f.ernst).sort().join(','));
  if (f.tags.size) p.set('tag', Array.from(f.tags).sort().join(','));
  if (f.yearMin != null) p.set('vanaf', String(f.yearMin));
  if (f.yearMax != null) p.set('tot', String(f.yearMax));
  return p;
}

export function paramsToFilters(p: URLSearchParams): Filters {
  const f = emptyFilters();
  const ernstStr = p.get('ernst');
  if (ernstStr) {
    for (const n of ernstStr.split(',').map(s => parseInt(s, 10))) {
      if (n >= 1 && n <= 4) f.ernst.add(n);
    }
  }
  const tagStr = p.get('tag');
  if (tagStr) for (const t of tagStr.split(',')) if (t) f.tags.add(t);
  const vanaf = p.get('vanaf');
  if (vanaf && /^\d{4}$/.test(vanaf)) f.yearMin = parseInt(vanaf, 10);
  const tot = p.get('tot');
  if (tot && /^\d{4}$/.test(tot)) f.yearMax = parseInt(tot, 10);
  return f;
}
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: build succeeds. TypeScript may emit `astro check` warnings but no errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/
git commit -m "Add data loader and filter library"
```

---

## Task 4: Map island

**Files:**
- Create: `src/components/Map.svelte`

- [ ] **Step 1: Create src/components/Map.svelte**

```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import type { Slaughterhouse } from '../lib/data';

  type Props = {
    slaughterhouses: Slaughterhouse[];
    visibleCaseNrs: Set<number>;
    base: string;
  };

  let { slaughterhouses, visibleCaseNrs, base }: Props = $props();

  let mapEl: HTMLDivElement;
  let map: any = null;
  let layerGroup: any = null;
  let L: any = null;

  onMount(async () => {
    const leaflet = await import('leaflet');
    await import('leaflet/dist/leaflet.css');
    L = leaflet.default;

    map = L.map(mapEl, {
      center: [52.15, 5.4],
      zoom: 7,
      scrollWheelZoom: true,
    });
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, ' +
        '&copy; <a href="https://carto.com/attributions">CARTO</a>',
      maxZoom: 19,
    }).addTo(map);

    layerGroup = L.layerGroup().addTo(map);
    renderMarkers();
  });

  function severityColor(ernst: number): string {
    return ['#cccccc', '#fde68a', '#fb923c', '#dc2626', '#7f1d1d'][ernst] || '#888888';
  }

  function escapeHtml(s: string): string {
    return s.replace(/[&<>"']/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!)
    );
  }

  function renderMarkers() {
    if (!map || !L || !layerGroup) return;
    layerGroup.clearLayers();

    for (const s of slaughterhouses) {
      if (s.lat == null || s.lon == null) continue;
      const visibleCases = s.cases.filter(c => visibleCaseNrs.has(c.nr));
      if (visibleCases.length === 0) continue;

      const maxErnst = Math.max(...visibleCases.map(c => c.ernst));
      const color = severityColor(maxErnst);

      const marker = L.circleMarker([s.lat, s.lon], {
        radius: 6 + Math.min(visibleCases.length * 1.5, 12),
        color: '#222',
        weight: 1,
        fillColor: color,
        fillOpacity: 0.85,
      });

      const popup = `
        <strong>${escapeHtml(s.naam)}</strong><br>
        <span style="color:#555">${escapeHtml(s.postcode_plaats || '')}</span><br>
        <strong>${visibleCases.length}</strong> ${visibleCases.length === 1 ? 'zaak' : 'zaken'} ·
        max ernst <strong>${maxErnst}</strong><br>
        <a href="${base}/slachthuis/${s.slug}/">Bekijk profiel &rarr;</a>
      `;
      marker.bindPopup(popup);
      marker.addTo(layerGroup);
    }
  }

  $effect(() => {
    // Reading these props inside the effect registers them as dependencies,
    // so renderMarkers() re-runs whenever either changes.
    void visibleCaseNrs;
    void slaughterhouses;
    renderMarkers();
  });
</script>

<div bind:this={mapEl} class="map" role="application" aria-label="Kaart van slachthuizen"></div>

<style>
  .map {
    width: 100%;
    height: 65vh;
    min-height: 420px;
    border-radius: 6px;
    overflow: hidden;
    border: 1px solid #e3e3e3;
  }
  :global(.leaflet-popup-content) { font-family: inherit; font-size: 0.9rem; }
</style>
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: succeeds. The map isn't wired into any page yet, but the component compiles.

- [ ] **Step 3: Commit**

```bash
git add src/components/Map.svelte
git commit -m "Add Leaflet map component"
```

---

## Task 5: Filters, case list, home page wiring

**Files:**
- Create: `src/components/Filters.svelte`
- Create: `src/components/CaseList.svelte`
- Create: `src/components/HomeApp.svelte`
- Modify: `src/pages/index.astro`

- [ ] **Step 1: Create src/components/Filters.svelte**

```svelte
<script lang="ts">
  import type { Filters } from '../lib/filters';

  type Props = {
    filters: Filters;
    allTags: string[];
    yearMin: number;
    yearMax: number;
    onChange: (next: Filters) => void;
  };

  let { filters, allTags, yearMin, yearMax, onChange }: Props = $props();

  const ERNST_LABELS: Record<number, string> = {
    1: 'Laag', 2: 'Midden', 3: 'Hoog', 4: 'Zeer hoog',
  };

  function toggleErnst(n: number) {
    const next = new Set(filters.ernst);
    next.has(n) ? next.delete(n) : next.add(n);
    onChange({ ...filters, ernst: next });
  }
  function toggleTag(t: string) {
    const next = new Set(filters.tags);
    next.has(t) ? next.delete(t) : next.add(t);
    onChange({ ...filters, tags: next });
  }
  function setYearMin(v: string) {
    onChange({ ...filters, yearMin: v ? parseInt(v, 10) : null });
  }
  function setYearMax(v: string) {
    onChange({ ...filters, yearMax: v ? parseInt(v, 10) : null });
  }
  function reset() {
    onChange({ ernst: new Set(), tags: new Set(), yearMin: null, yearMax: null });
  }
</script>

<aside class="filters">
  <h3>Ernst</h3>
  <div class="chips">
    {#each [1, 2, 3, 4] as n}
      <button class="chip ernst-{n}" class:active={filters.ernst.has(n)} onclick={() => toggleErnst(n)}>
        {n} · {ERNST_LABELS[n]}
      </button>
    {/each}
  </div>

  <h3>Jaar</h3>
  <div class="years">
    <input type="number" min={yearMin} max={yearMax} value={filters.yearMin ?? ''} placeholder="vanaf"
      oninput={e => setYearMin((e.target as HTMLInputElement).value)} />
    <span>–</span>
    <input type="number" min={yearMin} max={yearMax} value={filters.yearMax ?? ''} placeholder="tot"
      oninput={e => setYearMax((e.target as HTMLInputElement).value)} />
  </div>

  <h3>Tags</h3>
  <div class="chips tags">
    {#each allTags as t}
      <button class="chip tag" class:active={filters.tags.has(t)} onclick={() => toggleTag(t)}>
        {t}
      </button>
    {/each}
  </div>

  <button class="reset" onclick={reset}>Filters wissen</button>
</aside>

<style>
  .filters { padding: 0.25rem; }
  h3 { margin: 1.2rem 0 0.4rem; font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.05em; color: #555; }
  h3:first-of-type { margin-top: 0; }
  .chips { display: flex; flex-wrap: wrap; gap: 0.35rem; }
  .chip {
    border: 1px solid #ccc; background: white; padding: 0.3rem 0.65rem;
    border-radius: 999px; cursor: pointer; font-size: 0.85rem; font-family: inherit;
  }
  .chip:hover { border-color: #888; }
  .chip.active { background: #222; color: white; border-color: #222; }
  .chip.ernst-1.active { background: #fde68a; color: #222; border-color: #ca8a04; }
  .chip.ernst-2.active { background: #fb923c; color: white; border-color: #c2410c; }
  .chip.ernst-3.active { background: #dc2626; color: white; border-color: #991b1b; }
  .chip.ernst-4.active { background: #7f1d1d; color: white; border-color: #450a0a; }
  .chip.tag { font-family: ui-monospace, "SF Mono", Menlo, monospace; font-size: 0.78rem; }
  .years { display: flex; align-items: center; gap: 0.5rem; }
  .years input { width: 5rem; padding: 0.3rem 0.4rem; border: 1px solid #ccc; border-radius: 4px; font-family: inherit; }
  .reset { margin-top: 1.5rem; background: none; border: 1px solid #888; padding: 0.4rem 0.8rem; cursor: pointer; font-family: inherit; }
  .reset:hover { background: #f5f5f5; }
</style>
```

- [ ] **Step 2: Create src/components/CaseList.svelte**

```svelte
<script lang="ts">
  import type { Case, Slaughterhouse } from '../lib/data';

  type Props = {
    cases: Case[];
    slaughterhouses: Slaughterhouse[];
    base: string;
  };
  let { cases, slaughterhouses, base }: Props = $props();

  const ERNST_LABEL: Record<number, string> = {1: 'Laag', 2: 'Midden', 3: 'Hoog', 4: 'Zeer hoog'};

  let slugByCase = $derived.by(() => {
    const m = new Map<number, string>();
    for (const s of slaughterhouses) for (const c of s.cases) m.set(c.nr, s.slug);
    return m;
  });
  let naamByCase = $derived.by(() => {
    const m = new Map<number, string>();
    for (const s of slaughterhouses) for (const c of s.cases) m.set(c.nr, s.naam);
    return m;
  });
  let sortedCases = $derived(
    [...cases].sort((a, b) => b.ernst - a.ernst || (b.jaar ?? 0) - (a.jaar ?? 0))
  );
</script>

<section class="case-list">
  <h2>{cases.length} {cases.length === 1 ? 'zaak' : 'zaken'}</h2>
  <ol>
    {#each sortedCases as c (c.nr)}
      <li class="case">
        <a href="{base}/slachthuis/{slugByCase.get(c.nr)}/#case-{c.nr}">
          <span class="badge ernst-{c.ernst}">{c.ernst} · {ERNST_LABEL[c.ernst]}</span>
          <span class="naam">{naamByCase.get(c.nr)}</span>
          <span class="datum">{c.datum}</span>
          <span class="boete">{c.boetebedrag ? `€ ${c.boetebedrag}` : '—'}</span>
          <p class="samenvatting">{c.samenvatting}</p>
        </a>
      </li>
    {/each}
  </ol>
</section>

<style>
  .case-list h2 { margin: 0 0 0.6rem; font-size: 1rem; color: #555; }
  ol { list-style: none; padding: 0; margin: 0; }
  .case { margin-bottom: 0.4rem; }
  .case a {
    display: grid; grid-template-columns: auto 1fr auto auto;
    gap: 0.6rem; padding: 0.6rem 0.8rem;
    text-decoration: none; color: inherit;
    background: #fafafa; border: 1px solid #eee; border-radius: 4px;
    align-items: baseline;
  }
  .case a:hover { background: #f0f0f0; }
  .badge {
    font-size: 0.72rem; padding: 0.15rem 0.5rem; border-radius: 3px;
    color: white; background: #888; white-space: nowrap;
  }
  .badge.ernst-1 { background: #fde68a; color: #222; }
  .badge.ernst-2 { background: #fb923c; }
  .badge.ernst-3 { background: #dc2626; }
  .badge.ernst-4 { background: #7f1d1d; }
  .naam { font-weight: 600; }
  .datum, .boete { color: #555; font-size: 0.88rem; white-space: nowrap; }
  .samenvatting { grid-column: 1 / -1; margin: 0.3rem 0 0; color: #333; font-size: 0.94rem; }
</style>
```

- [ ] **Step 3: Create src/components/HomeApp.svelte**

```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import Map from './Map.svelte';
  import Filters from './Filters.svelte';
  import CaseList from './CaseList.svelte';
  import {
    emptyFilters, applyFilters, filtersToParams, paramsToFilters,
  } from '../lib/filters';
  import type { Slaughterhouse, Case } from '../lib/data';

  type Props = {
    slaughterhouses: Slaughterhouse[];
    cases: Case[];
    allTags: string[];
    yearMin: number;
    yearMax: number;
    base: string;
  };
  let { slaughterhouses, cases, allTags, yearMin, yearMax, base }: Props = $props();

  let filters = $state(emptyFilters());

  onMount(() => {
    filters = paramsToFilters(new URLSearchParams(window.location.search));
  });

  function setFilters(next: typeof filters) {
    filters = next;
    const qs = filtersToParams(next).toString();
    const url = qs ? `?${qs}` : window.location.pathname;
    history.replaceState(null, '', url);
  }

  let filteredCases = $derived(applyFilters(cases, filters));
  let visibleCaseNrs = $derived(new Set(filteredCases.map(c => c.nr)));
</script>

<div class="home-app">
  <Filters {filters} {allTags} {yearMin} {yearMax} onChange={setFilters} />
  <div class="main">
    <Map {slaughterhouses} {visibleCaseNrs} {base} />
    <CaseList cases={filteredCases} {slaughterhouses} {base} />
  </div>
</div>

<style>
  .home-app { display: grid; grid-template-columns: 260px 1fr; gap: 1.5rem; }
  .main { display: flex; flex-direction: column; gap: 1.5rem; min-width: 0; }
  @media (max-width: 800px) {
    .home-app { grid-template-columns: 1fr; }
  }
</style>
```

- [ ] **Step 4: Replace src/pages/index.astro**

```astro
---
import Layout from '../layouts/Layout.astro';
import HomeApp from '../components/HomeApp.svelte';
import { loadData } from '../lib/data';

const { slaughterhouses, cases } = loadData();
const allTags = Array.from(new Set(cases.flatMap(c => c.ernst_tags))).sort();
const years = cases.map(c => c.jaar).filter((y): y is number => y != null);
const yearMin = Math.min(...years);
const yearMax = Math.max(...years);
const base = import.meta.env.BASE_URL.replace(/\/$/, '');
---
<Layout title="Kaart">
  <p class="intro">
    Visualisatie van <strong>{cases.length}</strong> NVWA-bevindingen bij Nederlandse
    roodvleesslachthuizen ({yearMin}–{yearMax}). Klik een pin voor details, of filter via de zijbalk.
    Zie <a href={`${base}/over/`}>Over de data</a> voor methodologie.
  </p>
  <HomeApp client:only="svelte" {slaughterhouses} {cases} {allTags} {yearMin} {yearMax} {base} />
</Layout>

<style>
  .intro { color: #444; margin: 0 0 1.25rem; max-width: 70ch; }
</style>
```

- [ ] **Step 5: Verify build and dev server**

Run: `npm run build`
Expected: succeeds, output in `dist/`.

Run: `npm run dev`, open `http://localhost:4321/slachthuis_monitor/`. Verify:
- Map renders with pins at slaughterhouse locations.
- Sidebar shows severity chips, year inputs, tag chips.
- Clicking a severity chip filters the map and case list immediately.
- The URL updates with `?ernst=...` etc.
- Reloading the page preserves the filter state.
- Clicking a case row navigates to `/slachthuis/<slug>/#case-<nr>` (the profile page is 404 until Task 6 — that's expected).

Stop the dev server.

- [ ] **Step 6: Commit**

```bash
git add src/components/ src/pages/index.astro
git commit -m "Wire map, filters, and case list into the home page"
```

---

## Task 6: Slaughterhouse profile pages

**Files:**
- Create: `src/pages/slachthuis/[slug].astro`

- [ ] **Step 1: Create src/pages/slachthuis/[slug].astro**

```astro
---
import Layout from '../../layouts/Layout.astro';
import { loadData, parseFineCents, formatEUR, type Slaughterhouse } from '../../lib/data';

export async function getStaticPaths() {
  const { slaughterhouses } = loadData();
  return slaughterhouses.map(s => ({
    params: { slug: s.slug },
    props: { slaughterhouse: s },
  }));
}

type Props = { slaughterhouse: Slaughterhouse };
const { slaughterhouse: s } = Astro.props;

const totalCents = s.cases.reduce((sum, c) => sum + parseFineCents(c.boetebedrag), 0);
const ernstCounts = [1, 2, 3, 4].map(n => ({
  ernst: n,
  count: s.cases.filter(c => c.ernst === n).length,
}));
const ERNST_LABEL: Record<number, string> = {1: 'Laag', 2: 'Midden', 3: 'Hoog', 4: 'Zeer hoog'};
const base = import.meta.env.BASE_URL.replace(/\/$/, '');
---
<Layout title={s.naam}>
  <p><a href={`${base}/`}>&larr; Terug naar kaart</a></p>
  <h1>{s.naam}</h1>
  <p class="address">
    {s.adres ?? ''}{s.adres && s.postcode_plaats ? ', ' : ''}{s.postcode_plaats ?? ''}
  </p>

  <div class="summary">
    <div><strong>{s.cases.length}</strong> {s.cases.length === 1 ? 'zaak' : 'zaken'}</div>
    <div><strong>{formatEUR(totalCents)}</strong> totale boete</div>
    <div class="ernst-bar">
      {ernstCounts.filter(e => e.count > 0).map(e => (
        <span class={`ernst-pill ernst-${e.ernst}`} title={`Ernst ${e.ernst} — ${ERNST_LABEL[e.ernst]}`}>
          {e.count} × {e.ernst}
        </span>
      ))}
    </div>
  </div>

  <ol class="cases">
    {s.cases.map(c => (
      <li id={`case-${c.nr}`} class="case">
        <header>
          <span class={`badge ernst-${c.ernst}`}>Ernst {c.ernst} — {ERNST_LABEL[c.ernst]}</span>
          <span class="date">{c.datum}</span>
          <span class="fine">{c.boetebedrag ? `€ ${c.boetebedrag}` : 'Geen boete'}</span>
        </header>
        <p class="samenvatting">{c.samenvatting}</p>
        {c.ernst_tags.length > 0 && (
          <div class="tags">
            {c.ernst_tags.map(t => <span class="tag">{t}</span>)}
          </div>
        )}
        <details>
          <summary>Volledige bevinding</summary>
          <blockquote>{c.overtreding}</blockquote>
          {c.reactie && (
            <>
              <h4>Reactie slachthuis</h4>
              <blockquote class="reactie">{c.reactie}</blockquote>
            </>
          )}
        </details>
      </li>
    ))}
  </ol>
</Layout>

<style>
  .address { color: #555; margin: -0.5rem 0 1rem; }
  .summary { display: flex; gap: 2rem; flex-wrap: wrap; padding: 0.8rem 1rem; background: #fafafa; border: 1px solid #eee; border-radius: 4px; margin-bottom: 2rem; }
  .summary strong { font-size: 1.2rem; }
  .ernst-bar { display: flex; gap: 0.4rem; align-items: center; }
  .ernst-pill { padding: 0.2rem 0.5rem; border-radius: 3px; font-size: 0.85rem; color: white; }
  .ernst-pill.ernst-1 { background: #fde68a; color: #222; }
  .ernst-pill.ernst-2 { background: #fb923c; }
  .ernst-pill.ernst-3 { background: #dc2626; }
  .ernst-pill.ernst-4 { background: #7f1d1d; }
  .cases { list-style: none; padding: 0; margin: 0; }
  .case { padding: 1rem; border: 1px solid #eee; border-radius: 4px; margin-bottom: 0.8rem; background: white; }
  .case:target { border-color: #7f1d1d; box-shadow: 0 0 0 2px rgba(127,29,29,0.15); }
  .case header { display: flex; gap: 1rem; align-items: baseline; margin-bottom: 0.5rem; flex-wrap: wrap; }
  .badge { font-size: 0.78rem; padding: 0.2rem 0.55rem; border-radius: 3px; color: white; }
  .badge.ernst-1 { background: #fde68a; color: #222; }
  .badge.ernst-2 { background: #fb923c; }
  .badge.ernst-3 { background: #dc2626; }
  .badge.ernst-4 { background: #7f1d1d; }
  .date, .fine { color: #555; font-size: 0.9rem; }
  .samenvatting { margin: 0.4rem 0; }
  .tags { display: flex; flex-wrap: wrap; gap: 0.3rem; margin: 0.4rem 0; }
  .tag { font-family: ui-monospace, "SF Mono", Menlo, monospace; font-size: 0.78rem; background: #eee; padding: 0.15rem 0.45rem; border-radius: 3px; }
  details { margin-top: 0.5rem; }
  summary { cursor: pointer; color: #555; font-size: 0.9rem; }
  blockquote { border-left: 3px solid #ccc; padding: 0.4rem 0.9rem; margin: 0.6rem 0; color: #333; font-size: 0.95rem; white-space: pre-wrap; }
  blockquote.reactie { border-left-color: #888; background: #fafafa; }
  h4 { margin: 1rem 0 0.3rem; font-size: 0.95rem; }
</style>
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: succeeds. Output includes one HTML file per slaughterhouse under `dist/slachthuis/<slug>/index.html`.

Run: `npm run dev`. From the home page, click a case row → it should navigate to the profile page, scroll-anchor to the matching `#case-<nr>`, and the targeted case should be visually highlighted.

Stop dev server.

- [ ] **Step 3: Commit**

```bash
git add src/pages/slachthuis/
git commit -m "Add per-slaughterhouse profile pages"
```

---

## Task 7: Editorial pages

**Files:**
- Create: `src/pages/over.astro`
- Create: `src/pages/ernst.astro`

- [ ] **Step 1: Create src/pages/over.astro**

```astro
---
import Layout from '../layouts/Layout.astro';
import { loadData } from '../lib/data';

const { cases, slaughterhouses } = loadData();
const years = cases.map(c => c.jaar).filter((y): y is number => y != null);
const yearMin = Math.min(...years);
const yearMax = Math.max(...years);
const withFine = cases.filter(c => c.boetebedrag).length;
---
<Layout title="Over de data">
  <h1>Over de data</h1>

  <p class="lede">
    De Slachthuis Monitor toont <strong>{cases.length} bevindingen</strong> van de NVWA bij
    <strong>{slaughterhouses.length} Nederlandse roodvleesslachthuizen</strong> over de periode
    {yearMin}–{yearMax}. Hiervan zijn er {withFine} bestraft met een formele boete.
  </p>

  <h2>Bron</h2>
  <p>
    De gegevens zijn afkomstig uit een WOO-besluit van de Nederlandse Voedsel- en Warenautoriteit
    (NVWA). Een WOO-besluit is de openbaarmaking van overheidsdocumenten op grond van de
    <a href="https://wetten.overheid.nl/BWBR0045754/" target="_blank" rel="noopener">Wet open overheid</a>.
    Het besluit bevat alle Rapporten van Bevindingen en bijbehorende boetebeschikkingen die de NVWA
    heeft opgesteld over roodvleesslachthuizen in de genoemde periode.
  </p>

  <h2>Werkwijze</h2>
  <p>
    Het bron-PDF (987 pagina's) is omgezet naar platte tekst en met een Python-script geparseerd. Per
    geval zijn vastgelegd: het slachthuis (naam + adres), de datum, de letterlijke bevinding, de
    boete (indien opgelegd), de eventuele reactie van het slachthuis, een korte Nederlandstalige
    samenvatting, een welzijnsernst-classificatie (1–4) en passende tags. Het geocoderen van adressen
    is gedaan via de PDOK Locatieserver. Alle data en code zijn open source.
  </p>

  <h2>Bekende beperkingen</h2>
  <ul>
    <li>
      De NVWA-inventaris vermeldt 146 documentnummers. Het vrijgegeven tekstcorpus bevat 112
      Rapporten van Bevindingen en 11 Schriftelijke Waarschuwingen. Ongeveer 23 documenten zijn dus
      uitgesloten van het gepubliceerde corpus — meestal omdat ze al elders openbaar zijn, onder een
      WOO-uitzondering vallen (5.1.2.i), of buiten de reikwijdte vallen.
    </li>
    <li>
      De 11 Schriftelijke Waarschuwingen zijn (nog) niet opgenomen in deze visualisatie. Dat zijn
      waarschuwingen zonder boete, die wel inzicht geven in lichtere overtredingen.
    </li>
    <li>
      De ernst-tier is een welzijnsclassificatie en is bewust losgekoppeld van het boetebedrag. De
      boete reflecteert het juridisch oordeel van de NVWA; de ernst-tier reflecteert de impact op
      het dier. Zie <a href={`${import.meta.env.BASE_URL.replace(/\/$/, '')}/ernst/`}>Ernstgradering</a>.
    </li>
  </ul>

  <h2>Code en data</h2>
  <p>
    De geparseerde dataset, het extractie- en geocodeer-script en de site-code zijn beschikbaar op
    <a href="https://github.com/">GitHub</a>. Issues en verbeteringen zijn welkom.
  </p>
</Layout>

<style>
  .lede { font-size: 1.1rem; max-width: 70ch; color: #333; }
  h2 { margin-top: 2rem; }
  p, li { max-width: 70ch; }
</style>
```

- [ ] **Step 2: Create src/pages/ernst.astro**

```astro
---
import Layout from '../layouts/Layout.astro';
import { loadData } from '../lib/data';

const { cases } = loadData();

const TIERS = [
  {
    n: 1, label: 'Laag',
    description: 'Administratief, hygiëne zonder dier-impact, of kleine welzijnstekorten zonder lijden.',
  },
  {
    n: 2, label: 'Midden',
    description: 'Welzijn aangetast (overbezetting, vies of nat strooisel, ontbrekend drinkwater, slechte transportomstandigheden) — geen direct lijden tijdens de slacht.',
  },
  {
    n: 3, label: 'Hoog',
    description: 'Onnodig pijn of stress tijdens de slacht: te late nabedwelming, fixatiefout met loskomende dieren, herhaalde bedwelmingsfouten, overmatig gebruik van de elektrische prikker.',
  },
  {
    n: 4, label: 'Zeer hoog',
    description: 'Dier was bewust of levend tijdens halssnede of uitslachten; óf actief geweld (slaan, schoppen, slepen aan ketens); óf meermalen mislukte bedwelming met aanhoudend lijden.',
  },
] as const;

// Pick one example case per tier — highest case-number with that tier
const examples = TIERS.map(t => {
  const matching = cases.filter(c => c.ernst === t.n).sort((a, b) => b.nr - a.nr);
  return { ...t, example: matching[0] ?? null };
});
---
<Layout title="Ernstgradering">
  <h1>Ernstgradering</h1>
  <p class="lede">
    Elke bevinding is geclassificeerd op welzijnsimpact in vier tiers. Deze classificatie staat
    los van het boetebedrag — de boete reflecteert het juridisch oordeel van de NVWA, de tier
    reflecteert het effect op het dier.
  </p>

  <ol class="tiers">
    {examples.map(t => (
      <li class={`tier ernst-${t.n}`}>
        <header>
          <span class={`badge ernst-${t.n}`}>{t.n}</span>
          <h2>{t.label}</h2>
        </header>
        <p>{t.description}</p>
        {t.example && (
          <blockquote>
            <p>{t.example.samenvatting}</p>
            <footer>— bevinding #{t.example.nr}, {t.example.datum}</footer>
          </blockquote>
        )}
      </li>
    ))}
  </ol>
</Layout>

<style>
  .lede { font-size: 1.05rem; max-width: 70ch; color: #333; }
  .tiers { list-style: none; padding: 0; margin: 2rem 0 0; }
  .tier { padding: 1rem 1.2rem; border-left: 6px solid #ccc; margin-bottom: 1.2rem; background: #fafafa; }
  .tier.ernst-1 { border-left-color: #fde68a; }
  .tier.ernst-2 { border-left-color: #fb923c; }
  .tier.ernst-3 { border-left-color: #dc2626; }
  .tier.ernst-4 { border-left-color: #7f1d1d; }
  .tier header { display: flex; gap: 0.8rem; align-items: center; margin-bottom: 0.4rem; }
  .tier h2 { margin: 0; font-size: 1.15rem; }
  .badge { width: 2rem; height: 2rem; display: inline-flex; align-items: center; justify-content: center; border-radius: 50%; color: white; font-weight: 700; }
  .badge.ernst-1 { background: #fde68a; color: #222; }
  .badge.ernst-2 { background: #fb923c; }
  .badge.ernst-3 { background: #dc2626; }
  .badge.ernst-4 { background: #7f1d1d; }
  blockquote { border-left: 3px solid #ccc; margin: 0.8rem 0 0; padding: 0.4rem 0.9rem; font-style: italic; color: #333; max-width: 70ch; }
  blockquote footer { font-style: normal; font-size: 0.85rem; color: #666; margin-top: 0.3rem; }
</style>
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Run: `npm run dev`, visit `/slachthuis_monitor/over/` and `/slachthuis_monitor/ernst/`. Confirm both render with correct content and styling.

Stop dev server.

- [ ] **Step 4: Commit**

```bash
git add src/pages/over.astro src/pages/ernst.astro
git commit -m "Add 'over' and 'ernst' editorial pages"
```

---

## Task 8: Aggregate charts

**Files:**
- Create: `src/components/Charts.astro`
- Modify: `src/pages/over.astro` (embed Charts at bottom)

- [ ] **Step 1: Create src/components/Charts.astro**

```astro
---
import { loadData, parseFineCents } from '../lib/data';

const { slaughterhouses, cases } = loadData();

// Fines per slaughterhouse (sorted descending)
const finesPerSlh = slaughterhouses
  .map(s => ({
    naam: s.naam,
    cents: s.cases.reduce((sum, c) => sum + parseFineCents(c.boetebedrag), 0),
    count: s.cases.length,
  }))
  .filter(x => x.cents > 0)
  .sort((a, b) => b.cents - a.cents);

const maxFine = Math.max(...finesPerSlh.map(x => x.cents), 1);

// Severity distribution
const ernstCounts = [1, 2, 3, 4].map(n => ({ n, count: cases.filter(c => c.ernst === n).length }));
const maxErnstCount = Math.max(...ernstCounts.map(x => x.count), 1);

// Cases per year
const byYear = new Map<number, number>();
for (const c of cases) if (c.jaar != null) byYear.set(c.jaar, (byYear.get(c.jaar) ?? 0) + 1);
const yearEntries = Array.from(byYear.entries()).sort((a, b) => a[0] - b[0]);
const maxYearCount = Math.max(...yearEntries.map(([, n]) => n), 1);

const fmt = new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
---

<section class="charts">
  <h2>Cijfers in een oogopslag</h2>

  <div class="chart">
    <h3>Totale boete per slachthuis</h3>
    <div class="bars">
      {finesPerSlh.map(x => (
        <div class="row">
          <div class="label">{x.naam}</div>
          <div class="bar-wrap"><div class="bar" style={`width: ${(x.cents / maxFine) * 100}%`}></div></div>
          <div class="value">{fmt.format(x.cents / 100)}</div>
        </div>
      ))}
    </div>
  </div>

  <div class="chart">
    <h3>Verdeling naar ernst</h3>
    <div class="bars">
      {ernstCounts.map(x => (
        <div class="row">
          <div class="label">Ernst {x.n}</div>
          <div class="bar-wrap"><div class={`bar ernst-${x.n}`} style={`width: ${(x.count / maxErnstCount) * 100}%`}></div></div>
          <div class="value">{x.count}</div>
        </div>
      ))}
    </div>
  </div>

  <div class="chart">
    <h3>Bevindingen per jaar</h3>
    <div class="bars">
      {yearEntries.map(([year, count]) => (
        <div class="row">
          <div class="label">{year}</div>
          <div class="bar-wrap"><div class="bar" style={`width: ${(count / maxYearCount) * 100}%`}></div></div>
          <div class="value">{count}</div>
        </div>
      ))}
    </div>
  </div>
</section>

<style>
  .charts { margin-top: 3rem; }
  .chart { margin-bottom: 2rem; }
  .chart h3 { font-size: 1rem; margin-bottom: 0.6rem; color: #555; }
  .bars { display: grid; gap: 0.25rem; }
  .row { display: grid; grid-template-columns: 14rem 1fr 5rem; gap: 0.5rem; align-items: center; font-size: 0.9rem; }
  .label { color: #333; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .bar-wrap { background: #f0f0f0; height: 18px; border-radius: 3px; overflow: hidden; }
  .bar { height: 100%; background: #7f1d1d; }
  .bar.ernst-1 { background: #fde68a; }
  .bar.ernst-2 { background: #fb923c; }
  .bar.ernst-3 { background: #dc2626; }
  .bar.ernst-4 { background: #7f1d1d; }
  .value { text-align: right; color: #555; font-variant-numeric: tabular-nums; }
  @media (max-width: 700px) {
    .row { grid-template-columns: 10rem 1fr 4rem; font-size: 0.85rem; }
  }
</style>
```

- [ ] **Step 2: Embed Charts in over.astro**

In `src/pages/over.astro`, add at the top of frontmatter:

```astro
import Charts from '../components/Charts.astro';
```

And insert just before the closing `</Layout>` tag (after the "Code en data" `<p>`):

```astro
  <Charts />
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Run: `npm run dev`, visit `/slachthuis_monitor/over/`. Scroll to the bottom — confirm three bar charts render: total fine per slaughterhouse, severity distribution, and cases per year. Bars should be sensibly proportioned and labels readable.

Stop dev server.

- [ ] **Step 4: Commit**

```bash
git add src/components/Charts.astro src/pages/over.astro
git commit -m "Add aggregate SVG-free bar charts on the 'over' page"
```

---

## Task 9: GitHub Pages deploy workflow

**Files:**
- Create: `.github/workflows/deploy.yml`
- Modify: `astro.config.mjs` (set real GitHub username)

- [ ] **Step 1: Set the real site URL in astro.config.mjs**

Determine the GitHub username/org that will own the repo (ask the user if unknown). Update `astro.config.mjs`:

```js
import { defineConfig } from 'astro/config';
import svelte from '@astrojs/svelte';

export default defineConfig({
  site: 'https://<github-username>.github.io',
  base: '/slachthuis_monitor',
  trailingSlash: 'always',
  integrations: [svelte()],
});
```

Replace `<github-username>` with the actual username. If the user doesn't know yet, leave the placeholder and note that the deploy URL will be wrong until it's set.

- [ ] **Step 2: Create .github/workflows/deploy.yml**

```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: "pages"
  cancel-in-progress: false

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v6
      - name: Build with Astro
        uses: withastro/action@v6

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - name: Deploy to GitHub Pages
        id: deployment
        uses: actions/deploy-pages@v5
```

- [ ] **Step 3: Verify the build still passes locally**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 4: Commit and document follow-up steps**

```bash
git add .github/workflows/deploy.yml astro.config.mjs
git commit -m "Add GitHub Pages deploy workflow"
```

After pushing to GitHub, the user must do this one-time setup:
1. Go to Settings → Pages → Source: select **"GitHub Actions"**.
2. Push to `main`; the workflow runs, builds, and publishes.
3. The site will be live at `https://<github-username>.github.io/slachthuis_monitor/`.

Surface these steps to the user in the final report.

---

## Final verification

After all tasks complete:

- [ ] Run `npm run build` — succeeds, `dist/` contains: `index.html`, `over/index.html`, `ernst/index.html`, and `slachthuis/<slug>/index.html` for every slaughterhouse.
- [ ] Run `npm run preview` and click through every page in a browser. Verify: map renders, filters work, URL params persist, profile pages load, scroll-anchor to specific cases works, charts render.
- [ ] Confirm `git status` is clean.

---

## Self-review notes (from the plan author)

**Spec coverage check:** Every requirement in `docs/superpowers/specs/2026-05-22-stack-and-architecture-design.md` is implemented by a task:
- Stack choices (Astro / Svelte / Leaflet / CARTO / hand-CSS) → Task 1 + Task 4
- Project layout → Tasks 1–8 create the listed paths
- Build-time geocoding (offline, idempotent, PDOK, committed output) → Task 2
- Build-time join into typed `Slaughterhouse`/`Case` shape → Task 3
- One pin per slaughterhouse with popup → Task 4
- `/` home with map + sidebar filters + URL-synced state + case list → Task 5
- `/over` methodology page (incl. gap notes) → Task 7
- `/ernst` severity explainer → Task 7
- `/slachthuis/[slug]` static-generated profiles → Task 6
- Aggregate charts → Task 8
- GitHub Pages deploy via `withastro/action@v6` + `actions/deploy-pages@v5` → Task 9
- `import.meta.env.BASE_URL` respected in internal links → done in every page/component

**Deferred open questions (from the spec, intentionally not in this plan):** tile-provider final choice (CARTO Positron used as default; switchable later) and inclusion of the 11 Schriftelijke Waarschuwing records.

**Type consistency:** `Slaughterhouse`/`Case` types defined in Task 3 are imported and used unchanged in Tasks 4–8. Filter type matches across `filters.ts`, `Filters.svelte`, and `HomeApp.svelte`. `loadData()` cached + called from Tasks 5, 6, 7, 8.
