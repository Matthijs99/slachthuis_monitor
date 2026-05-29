# Scrollytelling Article Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the home page into a single-page scrollytelling article that tours the dataset across a sticky map and hands off to the interactive tool, and remove every AI-generated field (`ernst`, `ernst_tags`, `samenvatting`) from the UI.

**Architecture:** Two phases. **Phase A** strips the AI labels from the existing dashboard, leaving a working, factual map+filter tool (build stays green after every task). **Phase B** builds the article on top: a build-time `story.ts` computes per-site aggregates and the itinerary; a single `Story.svelte` island owns one Leaflet map that flies between stops in `tour` mode then flips to `interactive` mode for the tool; a server-rendered static article provides the no-JS fallback.

**Tech Stack:** Astro 6, Svelte 5 (runes), Leaflet 1.9, hand-written CSS. No new dependencies. **No automated test suite** (per `CLAUDE.md` and the design spec): each task is verified with `npm run check` (types) + `npm run build`, and Phase C adds browser QA. Reference spec: `docs/superpowers/specs/2026-05-29-scrollytelling-article-design.md`.

**Verification commands (used throughout):**
- `npm run check` — Astro+TS type check. Expected: `0 errors`.
- `npm run build` — full static build. Expected: `Complete!` with no errors; build-time `story.ts` assertions pass.
- `npm run dev` — dev server at `http://localhost:4321/slachthuis_monitor/` for browser QA.

---

## Phase A — Remove AI labels from the existing UI

Ordering keeps the build green: add the new `slug` field first, rewrite every consumer to stop reading `ernst`/`ernst_tags`/`samenvatting` (the fields still exist, just unused), then delete the fields, the `ernst.ts` module, and `ErnstBadge` last.

### Task A1: Add `slug` to each `Case`

**Files:**
- Modify: `src/lib/data.ts`

- [ ] **Step 1: Add `slug` to the `Case` type**

In `src/lib/data.ts`, add a `slug` field to the `Case` type (place it right after `nr`):

```ts
export type Case = {
  nr: number;
  slug: string;           // slug of the slaughterhouse this case belongs to
  rapport_nr: string | null;
  datum: string;
  jaar: number | null;
  bron_pagina: number | null;
  overtreding: string;
  boetebedrag: string | null;
  reactie: string | null;
  samenvatting: string;
  ernst: Ernst;
  ernst_tags: string[];
  operator_naam: string | null;
};
```

- [ ] **Step 2: Populate `slug` after slug-uniqueness is finalised**

In `loadData()`, the per-slaughterhouse `slug` is only final after the uniqueness pass. Add a loop that stamps each case's `slug` from its slaughterhouse, immediately **after** the existing "Ensure slugs are unique" block and **before** `const slaughterhouses = ...`. Insert a placeholder `slug: ''` in the case-construction object (where cases are pushed) so the type is satisfied:

In the `bySlh.get(key)!.cases.push({ ... })` object, add `slug: '',` right after `nr: b.nr,`. Then add this loop after the uniqueness pass:

```ts
  // Stamp each case with its (now-final) slaughterhouse slug.
  for (const s of bySlh.values()) {
    for (const c of s.cases) c.slug = s.slug;
  }
```

- [ ] **Step 3: Verify**

Run: `npm run check && npm run build`
Expected: `0 errors`, build `Complete!`.

- [ ] **Step 4: Commit**

```bash
git add src/lib/data.ts
git commit -m "Add slug to Case for slaughterhouse filtering"
```

---

### Task A2: Rework the filter model (`filters.ts`)

Replace the `ernst`/`tags` filters with `slh` (slaughterhouse slug) and `fine` (wel/geen), keeping the year range.

**Files:**
- Modify: `src/lib/filters.ts`

- [ ] **Step 1: Replace the file contents**

```ts
import type { Case } from './data';

export type Filters = {
  slh: string | null;            // slaughterhouse slug, or null for all
  fine: 'wel' | 'geen' | null;   // has a fine / has no fine / either
  yearMin: number | null;
  yearMax: number | null;
};

export function emptyFilters(): Filters {
  return { slh: null, fine: null, yearMin: null, yearMax: null };
}

export function applyFilters(cases: Case[], f: Filters): Case[] {
  return cases.filter(c => {
    if (f.slh != null && c.slug !== f.slh) return false;
    if (f.fine === 'wel' && !c.boetebedrag) return false;
    if (f.fine === 'geen' && c.boetebedrag) return false;
    if (f.yearMin != null && (c.jaar == null || c.jaar < f.yearMin)) return false;
    if (f.yearMax != null && (c.jaar == null || c.jaar > f.yearMax)) return false;
    return true;
  });
}

export function filtersToParams(f: Filters): URLSearchParams {
  const p = new URLSearchParams();
  if (f.slh) p.set('slh', f.slh);
  if (f.fine) p.set('boete', f.fine);
  if (f.yearMin != null) p.set('vanaf', String(f.yearMin));
  if (f.yearMax != null) p.set('tot', String(f.yearMax));
  return p;
}

export function paramsToFilters(p: URLSearchParams): Filters {
  const f = emptyFilters();
  const slh = p.get('slh');
  if (slh) f.slh = slh;
  const boete = p.get('boete');
  if (boete === 'wel' || boete === 'geen') f.fine = boete;
  const vanaf = p.get('vanaf');
  if (vanaf && /^\d{4}$/.test(vanaf)) f.yearMin = parseInt(vanaf, 10);
  const tot = p.get('tot');
  if (tot && /^\d{4}$/.test(tot)) f.yearMax = parseInt(tot, 10);
  return f;
}
```

- [ ] **Step 2: Verify** — `npm run check` will now report errors in `Filters.svelte` and `HomeApp.svelte` (they reference the old shape). That is expected; the next tasks fix them. Run `npm run check` and confirm the **only** errors are in `Filters.svelte` / `HomeApp.svelte`.

- [ ] **Step 3: Commit**

```bash
git add src/lib/filters.ts
git commit -m "Rework filter model: slaughterhouse + wel/geen boete + year"
```

---

### Task A3: Rework `Filters.svelte`

A slaughterhouse `<select>`, a wel/geen-boete chip group, and the year inputs. No ernst, no tags.

**Files:**
- Modify: `src/components/Filters.svelte`

- [ ] **Step 1: Replace the file contents**

```svelte
<script lang="ts">
  import type { Filters } from '../lib/filters';

  type SlhOption = { slug: string; naam: string };
  type Props = {
    filters: Filters;
    slhOptions: SlhOption[];
    yearMin: number;
    yearMax: number;
    onChange: (next: Filters) => void;
  };
  let { filters, slhOptions, yearMin, yearMax, onChange }: Props = $props();

  function setSlh(v: string) {
    onChange({ ...filters, slh: v || null });
  }
  function setFine(v: 'wel' | 'geen') {
    onChange({ ...filters, fine: filters.fine === v ? null : v });
  }
  function setYearMin(v: string) {
    onChange({ ...filters, yearMin: v ? parseInt(v, 10) : null });
  }
  function setYearMax(v: string) {
    onChange({ ...filters, yearMax: v ? parseInt(v, 10) : null });
  }
  function reset() {
    onChange({ slh: null, fine: null, yearMin: null, yearMax: null });
  }
</script>

<aside class="filters">
  <h3>Slachthuis</h3>
  <select aria-label="Slachthuis" value={filters.slh ?? ''} onchange={e => setSlh((e.target as HTMLSelectElement).value)}>
    <option value="">Alle slachthuizen</option>
    {#each slhOptions as o}
      <option value={o.slug}>{o.naam}</option>
    {/each}
  </select>

  <h3>Boete</h3>
  <div class="chips">
    <button class="chip" class:active={filters.fine === 'wel'} onclick={() => setFine('wel')}>Met boete</button>
    <button class="chip" class:active={filters.fine === 'geen'} onclick={() => setFine('geen')}>Zonder boete</button>
  </div>

  <h3>Jaar</h3>
  <div class="years">
    <input type="number" min={yearMin} max={yearMax} value={filters.yearMin ?? ''} placeholder="vanaf"
      aria-label="Jaar vanaf" oninput={e => setYearMin((e.target as HTMLInputElement).value)} />
    <span>–</span>
    <input type="number" min={yearMin} max={yearMax} value={filters.yearMax ?? ''} placeholder="tot"
      aria-label="Jaar tot" oninput={e => setYearMax((e.target as HTMLInputElement).value)} />
  </div>

  <button class="reset" onclick={reset}>Filters wissen</button>
</aside>

<style>
  .filters { padding: 0.25rem; }
  h3 { margin: 1.2rem 0 0.4rem; font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--c-muted); }
  h3:first-of-type { margin-top: 0; }
  select { width: 100%; padding: 0.4rem 0.5rem; border: 1px solid var(--c-border-strong); border-radius: var(--radius); font-family: inherit; background: var(--c-bg); }
  .chips { display: flex; flex-wrap: wrap; gap: 0.35rem; }
  .chip {
    border: 1px solid var(--c-border-strong); background: var(--c-bg); padding: 0.3rem 0.65rem;
    border-radius: var(--radius-pill); cursor: pointer; font-size: 0.85rem; font-family: inherit;
  }
  .chip:hover { border-color: var(--c-muted-soft); }
  .chip.active { background: #222; color: white; border-color: #222; }
  .years { display: flex; align-items: center; gap: 0.5rem; }
  .years input { width: 5rem; padding: 0.3rem 0.4rem; border: 1px solid var(--c-border-strong); border-radius: var(--radius); font-family: inherit; }
  .reset { margin-top: 1.5rem; background: none; border: 1px solid var(--c-muted-soft); padding: 0.4rem 0.8rem; cursor: pointer; font-family: inherit; border-radius: var(--radius); }
  .reset:hover { background: var(--c-surface); }
</style>
```

- [ ] **Step 2: Commit** (verify after A4, since `HomeApp` still needs updating)

```bash
git add src/components/Filters.svelte
git commit -m "Rework Filters UI: slaughterhouse select + wel/geen boete"
```

---

### Task A4: Update `HomeApp.svelte` to the new filter props

**Files:**
- Modify: `src/components/HomeApp.svelte`

- [ ] **Step 1: Replace the `Props` type, the `allTags` prop, and the `<Filters>` usage**

Change the `Props` type to drop `allTags` and add `slhOptions`, and pass it through. The new `<script>` block:

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
    yearMin: number;
    yearMax: number;
    base: string;
  };
  let { slaughterhouses, cases, yearMin, yearMax, base }: Props = $props();

  let slhOptions = $derived(
    slaughterhouses.map(s => ({ slug: s.slug, naam: s.naam }))
  );

  let filters = $state(emptyFilters());

  onMount(() => {
    filters = paramsToFilters(new URLSearchParams(window.location.search));
    const onPop = () => {
      filters = paramsToFilters(new URLSearchParams(window.location.search));
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  });

  function setFilters(next: typeof filters) {
    filters = next;
    const qs = filtersToParams(next).toString();
    const url = qs ? `?${qs}` : window.location.pathname;
    if (url !== window.location.pathname + window.location.search) {
      history.pushState(null, '', url);
    }
  }

  let filteredCases = $derived(applyFilters(cases, filters));
  let visibleCaseNrs = $derived(new Set(filteredCases.map(c => c.nr)));
</script>
```

Update the markup's `<Filters>` line to pass `slhOptions` instead of `allTags`:

```svelte
  <Filters {filters} {slhOptions} {yearMin} {yearMax} onChange={setFilters} />
```

(Leave the `<Map>` and `<CaseList>` lines and the `<style>` unchanged.)

- [ ] **Step 2: Update `index.astro` to stop passing `allTags`**

In `src/pages/index.astro`, delete the `allTags` line and remove `allTags` from the `<HomeApp>` props. The frontmatter becomes:

```astro
---
import Layout from '../layouts/Layout.astro';
import HomeApp from '../components/HomeApp.svelte';
import { loadData } from '../lib/data';
import { BASE as base, siteStats } from '../lib/site';

const { slaughterhouses, cases } = loadData();
const { caseCount, slhCount, yearMin, yearMax } = siteStats();
---
```

And the island:

```astro
  <HomeApp client:only="svelte" {slaughterhouses} {cases} {yearMin} {yearMax} {base} />
```

> Note: `index.astro` is fully rewritten in Phase B. This minimal edit just keeps Phase A building.

- [ ] **Step 3: Verify** — `npm run check` should now only report errors in `Map.svelte`, `CaseList.svelte`, `Charts.astro`, `[slug].astro`, and `ernst.astro` (still reading ernst). Confirm no errors in `filters.ts`, `Filters.svelte`, `HomeApp.svelte`, `index.astro`.

- [ ] **Step 4: Commit**

```bash
git add src/components/HomeApp.svelte src/pages/index.astro
git commit -m "Wire HomeApp/index to factual filters"
```

---

### Task A5: De-AI `Map.svelte` (single-colour pins sized by count)

**Files:**
- Modify: `src/components/Map.svelte`

- [ ] **Step 1: Replace the `<script>` block**

Remove the `ernst` import and `severityColor`; size pins by case count; drop "max ernst" from the popup. (Tour-mode camera control is added later in Task B5 — this task only de-AIs the existing interactive map.)

```svelte
<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import type { Slaughterhouse } from '../lib/data';

  // Single pin colour. Keep in sync with --c-pin in src/styles/global.css.
  const PIN_COLOR = '#7f1d1d';

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
    const leaflet = await import('leaflet/dist/leaflet.js');
    await import('leaflet/dist/leaflet.css');
    L = leaflet.default;

    map = L.map(mapEl, { center: [52.15, 5.4], zoom: 7, scrollWheelZoom: true });
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, ' +
        '&copy; <a href="https://carto.com/attributions">CARTO</a>',
      maxZoom: 19,
    }).addTo(map);

    layerGroup = L.layerGroup().addTo(map);
    renderMarkers();
  });

  onDestroy(() => { map?.remove(); });

  function escapeHtml(s: string): string {
    return s.replace(/[&<>"']/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!)
    );
  }

  function radiusFor(count: number): number {
    return 6 + Math.min(count * 1.2, 16);
  }

  function renderMarkers() {
    if (!map || !L || !layerGroup) return;
    layerGroup.clearLayers();

    for (const s of slaughterhouses) {
      if (s.lat == null || s.lon == null) continue;
      const visibleCases = s.cases.filter(c => visibleCaseNrs.has(c.nr));
      if (visibleCases.length === 0) continue;

      const marker = L.circleMarker([s.lat, s.lon], {
        radius: radiusFor(visibleCases.length),
        color: '#222',
        weight: 1,
        fillColor: PIN_COLOR,
        fillOpacity: 0.85,
      });

      const voorheen = s.voormalige_namen.length
        ? `<span style="color:#777;font-style:italic">voorheen ${escapeHtml(s.voormalige_namen.join(', '))}</span><br>`
        : '';
      const popup = `
        <strong>${escapeHtml(s.naam)}</strong><br>
        ${voorheen}
        <span style="color:#555">${escapeHtml(s.postcode_plaats || '')}</span><br>
        <strong>${visibleCases.length}</strong> ${visibleCases.length === 1 ? 'bevinding' : 'bevindingen'}<br>
        <a href="${base}/slachthuis/${s.slug}/">Bekijk profiel &rarr;</a>
      `;
      marker.bindPopup(popup);
      marker.addTo(layerGroup);
    }
  }

  $effect(() => {
    void visibleCaseNrs;
    void slaughterhouses;
    renderMarkers();
  });
</script>
```

(Leave the `<div bind:this={mapEl} ...>` and `<style>` unchanged.)

- [ ] **Step 2: Verify** — `npm run check`: errors remain only in `CaseList.svelte`, `Charts.astro`, `[slug].astro`, `ernst.astro`.

- [ ] **Step 3: Commit**

```bash
git add src/components/Map.svelte
git commit -m "Map: single-colour pins sized by finding count; drop ernst"
```

---

### Task A6: De-AI `CaseList.svelte`

Drop the badge and the AI summary; sort by date (newest first); show a verbatim-finding snippet.

**Files:**
- Modify: `src/components/CaseList.svelte`

- [ ] **Step 1: Replace the file contents**

```svelte
<script lang="ts">
  import type { Case, Slaughterhouse } from '../lib/data';

  type Props = {
    cases: Case[];
    slaughterhouses: Slaughterhouse[];
    base: string;
  };
  let { cases, slaughterhouses, base }: Props = $props();

  let naamByCase = $derived.by(() => {
    const m = new Map<number, string>();
    for (const s of slaughterhouses) for (const c of s.cases) m.set(c.nr, s.naam);
    return m;
  });
  let sortedCases = $derived(
    [...cases].sort((a, b) => (b.jaar ?? 0) - (a.jaar ?? 0) || a.nr - b.nr)
  );

  function snippet(s: string, max = 160): string {
    return s.length > max ? s.slice(0, max).trimEnd() + '…' : s;
  }
</script>

<section class="case-list">
  <h2>{cases.length} {cases.length === 1 ? 'bevinding' : 'bevindingen'}</h2>
  <ol>
    {#each sortedCases as c (c.nr)}
      <li class="case">
        <a href="{base}/slachthuis/{c.slug}/#case-{c.nr}">
          <span class="naam">{naamByCase.get(c.nr)}</span>
          <span class="datum">{c.datum}</span>
          <span class="boete">{c.boetebedrag ? `€ ${c.boetebedrag}` : 'Geen boete'}</span>
          <span class="overtreding">{snippet(c.overtreding)}</span>
        </a>
      </li>
    {/each}
  </ol>
</section>

<style>
  .case-list h2 { margin: 0 0 0.6rem; font-size: 1rem; color: var(--c-muted); }
  ol { list-style: none; padding: 0; margin: 0; }
  .case { margin-bottom: 0.4rem; }
  .case a {
    display: grid; grid-template-columns: 1fr auto auto;
    gap: 0.6rem; padding: 0.6rem 0.8rem;
    text-decoration: none; color: inherit;
    background: var(--c-surface); border: 1px solid var(--c-border-soft); border-radius: var(--radius);
    align-items: baseline;
  }
  .case a:hover { background: var(--c-surface-hover); }
  .naam { font-weight: 600; }
  .datum, .boete { color: var(--c-muted); font-size: 0.88rem; white-space: nowrap; }
  .overtreding { grid-column: 1 / -1; margin: 0.3rem 0 0; color: var(--c-text-soft); font-size: 0.94rem; }
</style>
```

- [ ] **Step 2: Verify** — `npm run check`: errors remain only in `Charts.astro`, `[slug].astro`, `ernst.astro`.

- [ ] **Step 3: Commit**

```bash
git add src/components/CaseList.svelte
git commit -m "CaseList: verbatim snippet + fine + date; drop badge/summary"
```

---

### Task A7: De-AI `[slug].astro` (per-slaughterhouse profile)

**Files:**
- Modify: `src/pages/slachthuis/[slug].astro`

- [ ] **Step 1: Replace the frontmatter** (drop ernst imports/counts)

```astro
---
import Layout from '../../layouts/Layout.astro';
import { loadData, parseFineCents, formatEUR, SOURCE_DOCUMENT_URL, type Slaughterhouse } from '../../lib/data';
import { BASE as base } from '../../lib/site';

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
const fined = s.cases.filter(c => c.boetebedrag).length;
---
```

- [ ] **Step 2: Replace the summary + cases markup** (drop badges, AI summary, tags; lead with the verbatim finding)

```astro
<Layout title={s.naam}>
  <p><a href={`${base}/`}>&larr; Terug naar kaart</a></p>
  <h1>{s.naam}</h1>
  {s.voormalige_namen.length > 0 && (
    <p class="voorheen">Voorheen: {s.voormalige_namen.join(', ')}</p>
  )}
  <p class="address">
    {s.adres ?? ''}{s.adres && s.postcode_plaats ? ', ' : ''}{s.postcode_plaats ?? ''}
  </p>

  <div class="summary">
    <div><strong>{s.cases.length}</strong> {s.cases.length === 1 ? 'bevinding' : 'bevindingen'}</div>
    <div><strong>{formatEUR(totalCents)}</strong> totale boete</div>
    <div><strong>{fined}</strong> met boete</div>
  </div>

  <ol class="cases">
    {s.cases.map(c => (
      <li id={`case-${c.nr}`} class="case card">
        <header>
          <span class="nr">#{c.nr}</span>
          <span class="date">{c.datum}</span>
          <span class="fine">{c.boetebedrag ? `€ ${c.boetebedrag}` : 'Geen boete'}</span>
          {c.operator_naam && <span class="operator" title="Exploitant ten tijde van de bevinding">Exploitant: {c.operator_naam}</span>}
        </header>
        <blockquote>{c.overtreding}</blockquote>
        {c.reactie && (
          <details>
            <summary>Reactie slachthuis</summary>
            <blockquote class="reactie">{c.reactie}</blockquote>
          </details>
        )}
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
      </li>
    ))}
  </ol>
</Layout>
```

- [ ] **Step 3: Replace the `<style>`** (drop `.ernst-bar`, `.samenvatting`, `.tags`, `.tag`; show the finding inline rather than behind a `<details>`)

```astro
<style>
  .voorheen { color: var(--c-muted-soft); font-size: 0.9rem; margin: -0.5rem 0 0.2rem; font-style: italic; }
  .address { color: var(--c-muted); margin: 0.2rem 0 1rem; }
  .operator { color: var(--c-muted); font-size: 0.82rem; background: var(--c-surface-hover); padding: 0.1rem 0.45rem; border-radius: var(--radius); }
  .summary { display: flex; gap: 2rem; flex-wrap: wrap; padding: 0.8rem 1rem; background: var(--c-surface); border: 1px solid var(--c-border-soft); border-radius: var(--radius); margin-bottom: 2rem; }
  .summary strong { font-size: 1.2rem; }
  .cases { list-style: none; padding: 0; margin: 0; }
  .case { padding: 1rem; margin-bottom: 0.8rem; }
  .case:target { border-color: var(--c-accent); box-shadow: 0 0 0 2px rgba(127,29,29,0.15); }
  .case header { display: flex; gap: 1rem; align-items: baseline; margin-bottom: 0.5rem; flex-wrap: wrap; }
  .nr { font-weight: 600; color: var(--c-muted); }
  .date, .fine { color: var(--c-muted); font-size: 0.9rem; }
  blockquote { font-size: 0.95rem; white-space: pre-wrap; margin: 0.5rem 0; }
  blockquote.reactie { border-left-color: var(--c-muted-soft); background: var(--c-surface); }
  details { margin-top: 0.5rem; }
  summary { cursor: pointer; color: var(--c-muted); font-size: 0.9rem; }
  .bron { margin: 0.8rem 0 0; font-size: 0.85rem; color: var(--c-muted-soft); }
  .bron code { font-family: ui-monospace, "SF Mono", Menlo, monospace; background: var(--c-chip-bg); padding: 0.1rem 0.35rem; border-radius: var(--radius); }
</style>
```

- [ ] **Step 4: Verify** — `npm run check`: errors remain only in `Charts.astro` and `ernst.astro`.

- [ ] **Step 5: Commit**

```bash
git add src/pages/slachthuis/\[slug\].astro
git commit -m "Profile page: verbatim findings + fines; drop ernst/tags/summary"
```

---

### Task A8: Drop the "verdeling naar ernst" chart (`Charts.astro`)

**Files:**
- Modify: `src/components/Charts.astro`

- [ ] **Step 1: Remove the ernst import and the ernst chart**

In the frontmatter, delete `import { ERNST_TIERS } from '../lib/ernst';` and delete the `ernstCounts` / `maxErnstCount` lines.

In the markup, delete the entire `<div class="chart">` block whose heading is `Verdeling naar ernst` (the one iterating `ernstCounts`).

In the `<style>`, delete the four `.bar.ernst-N { ... }` rules.

- [ ] **Step 2: Verify** — `npm run check`: errors remain only in `ernst.astro`.

- [ ] **Step 3: Commit**

```bash
git add src/components/Charts.astro
git commit -m "Charts: remove severity-distribution chart"
```

---

### Task A9: Retire `/ernst` and add the methodology note to `/over`

**Files:**
- Delete: `src/pages/ernst.astro`
- Modify: `src/layouts/Layout.astro`
- Modify: `src/pages/over.astro`

- [ ] **Step 1: Delete the page**

```bash
git rm src/pages/ernst.astro
```

- [ ] **Step 2: Remove the `/ernst` nav link**

In `src/layouts/Layout.astro`, delete this line from the `<nav>`:

```astro
          <a href={`${base}/ernst/`}>Ernstgradering</a>
```

- [ ] **Step 3: Add a factual methodology note to `/over`** (stays silent about the AI classification)

In `src/pages/over.astro`, the existing "Werkwijze" section already describes extraction. Replace that `<h2>Werkwijze</h2>` paragraph with a version that drops the "welzijnsernst-classificatie (1–4) en passende tags" clause, so no AI judgement is described:

```astro
  <h2>Hoe de data is samengesteld</h2>
  <p>
    Het <a href={SOURCE_DOCUMENT_URL} target="_blank" rel="noopener">bron-PDF</a> (987 pagina's) is omgezet naar
    platte tekst en met een Python-script geparseerd. Per geval zijn de feitelijke gegevens uit het document
    vastgelegd: het slachthuis (naam + adres), de datum, de letterlijke bevinding, de boete (indien opgelegd),
    de eventuele reactie van het slachthuis, het NVWA-rapportnummer en de bronpagina. Adressen zijn gegeocodeerd
    via de PDOK Locatieserver. Alle data en code zijn open source.
  </p>
```

Also, in the "Bekende beperkingen" list, delete the third `<li>` (the one beginning "De ernst-tier is een welzijnsclassificatie…"), since it references the removed classification.

- [ ] **Step 4: Verify** — `npm run check`: **0 errors** now (the last ernst consumer is gone). `npm run build`: `Complete!`.

- [ ] **Step 5: Commit**

```bash
git add src/pages/over.astro src/layouts/Layout.astro
git commit -m "Retire /ernst; add factual methodology note to /over"
```

---

### Task A10: Remove the AI fields, `ernst.ts`, and `ErnstBadge.svelte`

Now that nothing reads them, delete the AI surface area. The fields stay in `data/boetes.json` (untouched), just no longer typed or copied into the domain `Case`.

**Files:**
- Modify: `src/lib/data.ts`
- Delete: `src/lib/ernst.ts`, `src/components/ErnstBadge.svelte`
- Modify: `src/styles/global.css`

- [ ] **Step 1: Drop the AI fields from the `Case` type and loader**

In `src/lib/data.ts`:
- Delete `import type { Ernst } from './ernst';` and `export type { Ernst } from './ernst';`.
- In the `Case` type, delete the `samenvatting`, `ernst`, and `ernst_tags` lines.
- In the `RawBoete` type, **keep** `samenvatting`, `ernst`, `ernst_tags` (they still exist in the JSON; we simply stop reading them).
- In the `bySlh.get(key)!.cases.push({ ... })` object, delete the `samenvatting: b.samenvatting,`, `ernst: b.ernst as Ernst,`, and `ernst_tags: b.ernst_tags,` lines.

- [ ] **Step 2: Delete the dead modules**

```bash
git rm src/lib/ernst.ts src/components/ErnstBadge.svelte
```

- [ ] **Step 3: Clean `global.css`**

In `src/styles/global.css`, delete the four `--c-ernst-N` custom properties and the comment above them, and add a single pin colour token next to `--c-accent`:

```css
  --c-accent: #7f1d1d;
  /* Map pin colour — keep in sync with PIN_COLOR in Map.svelte */
  --c-pin: #7f1d1d;
```

- [ ] **Step 4: Verify**

Run: `npm run check && npm run build`
Expected: `0 errors`, `Complete!`. Grep proves the AI surface is gone:

```bash
grep -rn "ernst\|samenvatting\|ErnstBadge" src/ ; echo "exit: $?"
```
Expected: no matches (`exit: 1`).

- [ ] **Step 5: Commit**

```bash
git add src/lib/data.ts src/styles/global.css
git commit -m "Remove ernst/tags/samenvatting from the domain model and styles"
```

**Phase A done:** the site is a working, source-data-only dashboard. Browser-check once (`npm run dev`): home filters by slaughterhouse / wel-geen-boete / year; pins resize; profiles show verbatim findings.

---

## Phase B — Build the scrollytelling article

### Task B1: `story.ts` — aggregates, itinerary, build-time assertions

**Files:**
- Create: `src/lib/story.ts`

- [ ] **Step 1: Write the module**

```ts
import { loadData, parseFineCents, type Case } from './data';

const SITE_STOP_COUNT = 6;

// slug -> case nr, to override the default (largest-fine) anchor for a site.
// Empty by default; the default rule is used for every site. Documented escape
// hatch (e.g. ESA's largest fine is an electric-prod case; an override could
// surface the stick-beating #16 instead).
const ANCHOR_OVERRIDES: Record<string, number> = {};

export type YearCount = { year: number; count: number };

export type Anchor = {
  nr: number;
  datum: string;
  boetebedrag: string | null;
  overtreding: string;
  bron_pagina: number | null;
};

export type SiteStop = {
  slug: string;
  naam: string;
  plaats: string;
  lat: number;
  lon: number;
  caseCount: number;
  totalFineCents: number;
  periodStart: number;
  periodEnd: number;
  countsByYear: YearCount[];
  anchor: Anchor;
};

export type FinesSummary = {
  totalCents: number;
  withFine: number;
  withoutFine: number;
  minCents: number;
  maxCents: number;
};

const MONTHS: Record<string, number> = {
  januari: 1, februari: 2, maart: 3, april: 4, mei: 5, juni: 6,
  juli: 7, augustus: 8, september: 9, oktober: 10, november: 11, december: 12,
};

// Sortable key for a Dutch date like "17 juni 2021" -> 20210617. Falls back to
// year*10000 when the day/month can't be parsed. Used only for deterministic
// tie-breaking, never displayed.
function dateKey(datum: string): number {
  const m = datum.match(/(\d{1,2})\s+([a-zA-Z]+)\s+(\d{4})/);
  if (!m) {
    const y = datum.match(/(19|20)\d{2}/);
    return y ? parseInt(y[0], 10) * 10000 : 0;
  }
  const day = parseInt(m[1], 10);
  const month = MONTHS[m[2].toLowerCase()] ?? 0;
  const year = parseInt(m[3], 10);
  return year * 10000 + month * 100 + day;
}

function anchorFor(cases: Case[], slug: string): Anchor {
  const override = ANCHOR_OVERRIDES[slug];
  const chosen = override != null
    ? cases.find(c => c.nr === override)
    : pickLargestFine(cases);
  if (!chosen) throw new Error(`[story] no anchor case for site "${slug}"`);
  return {
    nr: chosen.nr,
    datum: chosen.datum,
    boetebedrag: chosen.boetebedrag,
    overtreding: chosen.overtreding,
    bron_pagina: chosen.bron_pagina,
  };
}

// Largest single fine; ties broken by earliest date, then lowest case nr.
function pickLargestFine(cases: Case[]): Case | undefined {
  const fined = cases.filter(c => c.boetebedrag);
  const pool = fined.length ? fined : cases;
  return [...pool].sort((a, b) =>
    parseFineCents(b.boetebedrag) - parseFineCents(a.boetebedrag) ||
    dateKey(a.datum) - dateKey(b.datum) ||
    a.nr - b.nr
  )[0];
}

function plaatsOf(postcode_plaats: string | null): string {
  return (postcode_plaats || '').replace(/^\d{4}\s*[A-Z]{0,2}\s*/i, '').trim();
}

let cache: { siteStops: SiteStop[]; fines: FinesSummary; yearMin: number; yearMax: number } | null = null;

function build() {
  if (cache) return cache;
  const { slaughterhouses, cases } = loadData();

  const years = cases.map(c => c.jaar).filter((y): y is number => y != null);
  const yearMin = Math.min(...years);
  const yearMax = Math.max(...years);

  const ranked = [...slaughterhouses]
    .filter(s => s.lat != null && s.lon != null)
    .map(s => {
      const fineCents = s.cases.reduce((sum, c) => sum + parseFineCents(c.boetebedrag), 0);
      const sYears = s.cases.map(c => c.jaar).filter((y): y is number => y != null);
      const byYear = new Map<number, number>();
      for (const c of s.cases) if (c.jaar != null) byYear.set(c.jaar, (byYear.get(c.jaar) ?? 0) + 1);
      const countsByYear: YearCount[] = [];
      for (let y = yearMin; y <= yearMax; y++) countsByYear.push({ year: y, count: byYear.get(y) ?? 0 });
      const stop: SiteStop = {
        slug: s.slug,
        naam: s.naam,
        plaats: plaatsOf(s.postcode_plaats),
        lat: s.lat!,
        lon: s.lon!,
        caseCount: s.cases.length,
        totalFineCents: fineCents,
        periodStart: sYears.length ? Math.min(...sYears) : yearMin,
        periodEnd: sYears.length ? Math.max(...sYears) : yearMax,
        countsByYear,
        anchor: anchorFor(s.cases, s.slug),
      };
      return stop;
    })
    .sort((a, b) =>
      b.caseCount - a.caseCount ||
      b.totalFineCents - a.totalFineCents ||
      a.naam.localeCompare(b.naam, 'nl')
    );

  const siteStops = ranked.slice(0, SITE_STOP_COUNT);

  const fineVals = cases.map(c => parseFineCents(c.boetebedrag)).filter(v => v > 0);
  const fines: FinesSummary = {
    totalCents: fineVals.reduce((a, b) => a + b, 0),
    withFine: cases.filter(c => c.boetebedrag).length,
    withoutFine: cases.filter(c => !c.boetebedrag).length,
    minCents: Math.min(...fineVals),
    maxCents: Math.max(...fineVals),
  };

  // --- build-time assertions (fail the build on bad data) ---
  const allNrs = new Set(cases.map(c => c.nr));
  for (const [slug, nr] of Object.entries(ANCHOR_OVERRIDES)) {
    if (!cases.some(c => c.slug === slug && c.nr === nr)) {
      throw new Error(`[story] override ${slug} -> #${nr} does not match a case at that site`);
    }
  }
  for (const s of siteStops) {
    if (!allNrs.has(s.anchor.nr)) throw new Error(`[story] anchor #${s.anchor.nr} for ${s.slug} is not a real case`);
    if (!Number.isFinite(s.lat) || !Number.isFinite(s.lon)) throw new Error(`[story] ${s.slug} lacks coordinates`);
  }
  if (siteStops.length !== SITE_STOP_COUNT) {
    throw new Error(`[story] expected ${SITE_STOP_COUNT} site stops, got ${siteStops.length}`);
  }
  const totalCases = slaughterhouses.reduce((sum, s) => sum + s.cases.length, 0);
  if (totalCases !== cases.length) throw new Error(`[story] case-count mismatch: ${totalCases} vs ${cases.length}`);

  cache = { siteStops, fines, yearMin, yearMax };
  return cache;
}

export function siteStops(): SiteStop[] { return build().siteStops; }
export function finesSummary(): FinesSummary { return build().fines; }
export function storyYears(): { yearMin: number; yearMax: number } {
  const b = build();
  return { yearMin: b.yearMin, yearMax: b.yearMax };
}
```

- [ ] **Step 2: Verify the assertions run and the numbers are right**

Run: `npm run build`
Expected: `Complete!` (no thrown assertion). To eyeball the computed itinerary, temporarily run:

```bash
npx astro check 2>/dev/null; node --input-type=module -e "
import('./src/lib/story.ts').then(m => console.log(m.siteStops().map(s => [s.naam, s.caseCount, s.totalFineCents/100, '#'+s.anchor.nr])))
" 2>/dev/null || echo "(node ESM/TS import may not run standalone — rely on the in-page render in B6 instead)"
```
Expected (from the spec appendix): Gosschalk 20 / 90000 / #35; Amstelland 14 / 50000 / #76; ESA 10 / 20000 / #15; VION Boxtel 10 / 30000 / #100; Pali 9 / 35000 / #59; IMPS 8 / 50000 / #53. (If the standalone import fails, this is verified visually in Task B6.)

- [ ] **Step 3: Commit**

```bash
git add src/lib/story.ts
git commit -m "story.ts: per-site aggregates, largest-fine anchors, build assertions"
```

---

### Task B2: `scrollytell` action (IntersectionObserver)

**Files:**
- Create: `src/lib/scrollytell.ts`

- [ ] **Step 1: Write the action**

```ts
// Svelte action: observes elements marked with [data-step] inside `node` and
// reports the index of the step crossing the viewport's vertical midline.
// No dependency — native IntersectionObserver. Honours reduced-motion only at
// the consumer side (this just reports the active index).
export type ScrollytellParams = { onActive: (index: number) => void };

export function scrollytell(node: HTMLElement, params: ScrollytellParams) {
  let onActive = params.onActive;
  let active = -1;

  const io = new IntersectionObserver(
    entries => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        const idx = Number((e.target as HTMLElement).dataset.index ?? -1);
        if (idx !== active) {
          active = idx;
          onActive(idx);
        }
      }
    },
    // Shrink the root to a thin band at the vertical centre, so the step
    // currently over the midline is the one reported as active.
    { rootMargin: '-50% 0px -50% 0px', threshold: 0 }
  );

  const steps = Array.from(node.querySelectorAll<HTMLElement>('[data-step]'));
  steps.forEach((s, i) => { s.dataset.index = String(i); io.observe(s); });

  return {
    update(next: ScrollytellParams) { onActive = next.onActive; },
    destroy() { io.disconnect(); },
  };
}
```

- [ ] **Step 2: Verify** — `npm run check`: `0 errors` (unused module compiles).

- [ ] **Step 3: Commit**

```bash
git add src/lib/scrollytell.ts
git commit -m "Add scrollytell IntersectionObserver action"
```

---

### Task B3: `StoryStep.svelte` — the data portrait

**Files:**
- Create: `src/components/StoryStep.svelte`

- [ ] **Step 1: Write the component**

```svelte
<script lang="ts">
  import type { SiteStop } from '../lib/story';
  import { SOURCE_DOCUMENT_URL, formatEUR } from '../lib/data';

  type Props = { stop: SiteStop; index: number; total: number; active?: boolean };
  let { stop, index, total, active = false }: Props = $props();

  let maxYear = $derived(Math.max(1, ...stop.countsByYear.map(y => y.count)));
  let sourceHref = $derived(
    stop.anchor.bron_pagina ? `${SOURCE_DOCUMENT_URL}#page=${stop.anchor.bron_pagina}` : SOURCE_DOCUMENT_URL
  );
  function pad(n: number) { return String(n).padStart(2, '0'); }
</script>

<div class="step" class:active data-step>
  <div class="stepno">STOP {pad(index + 1)} / {pad(total)}</div>
  <h2>{stop.naam}</h2>
  <p class="plaats">{stop.plaats}</p>

  <div class="stats">
    <div class="stat"><div class="big">{stop.caseCount}</div><div class="lab">bevindingen</div></div>
    <div class="stat"><div class="big">{formatEUR(stop.totalFineCents)}</div><div class="lab">totale boete</div></div>
    <div class="stat"><div class="big">{stop.periodStart}–{String(stop.periodEnd).slice(2)}</div><div class="lab">periode</div></div>
  </div>

  <p class="blocklabel">Bevindingen per jaar</p>
  <div class="yr">
    {#each stop.countsByYear as y}
      <div class="col">
        <div class="bar" class:zero={y.count === 0} style={`height:${y.count === 0 ? 2 : Math.round((y.count / maxYear) * 100)}%`}></div>
        <div class="y">{String(y.year).slice(2)}</div>
      </div>
    {/each}
  </div>

  <blockquote>
    <p>{stop.anchor.overtreding}</p>
    <div class="src">
      Bevinding #{stop.anchor.nr} · {stop.anchor.datum} ·
      {stop.anchor.boetebedrag ? `boete € ${stop.anchor.boetebedrag}` : 'geen boete'} ·
      <a href={sourceHref} target="_blank" rel="noopener">bron{stop.anchor.bron_pagina ? `, p. ${stop.anchor.bron_pagina}` : ''} &rarr;</a>
    </div>
  </blockquote>
</div>

<style>
  .step { min-height: 90vh; display: flex; flex-direction: column; justify-content: center; padding: 2rem 0; max-width: 38rem; opacity: 0.45; transition: opacity 0.3s; }
  .step.active { opacity: 1; }
  .stepno { font-size: 0.75rem; letter-spacing: 0.18em; color: var(--c-muted-soft); font-variant-numeric: tabular-nums; }
  h2 { margin: 0.4rem 0 0.1rem; font-size: 1.6rem; line-height: 1.12; }
  .plaats { color: var(--c-muted); margin: 0 0 1.3rem; }
  .stats { display: flex; gap: 1.8rem; margin-bottom: 1.2rem; }
  .big { font-size: 1.7rem; font-weight: 700; font-variant-numeric: tabular-nums; }
  .lab { font-size: 0.72rem; color: var(--c-muted-soft); margin-top: 0.1rem; }
  .blocklabel { font-size: 0.65rem; letter-spacing: 0.1em; text-transform: uppercase; color: var(--c-muted-soft); margin: 0 0 0.4rem; }
  .yr { display: flex; align-items: flex-end; gap: 0.45rem; height: 2.6rem; margin-bottom: 1.4rem; }
  .col { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 0.25rem; justify-content: flex-end; height: 100%; }
  .bar { width: 100%; background: var(--c-pin); border-radius: 2px 2px 0 0; }
  .bar.zero { background: var(--c-border); }
  .y { font-size: 0.6rem; color: var(--c-muted-soft); }
  blockquote { border-left: 3px solid var(--c-pin); padding: 0.2rem 0 0.2rem 0.9rem; margin: 0; }
  blockquote p { margin: 0; font-size: 1.05rem; line-height: 1.5; white-space: pre-wrap; }
  .src { margin-top: 0.7rem; font-size: 0.78rem; color: var(--c-muted-soft); }
</style>
```

- [ ] **Step 2: Verify** — `npm run check`: `0 errors`.

- [ ] **Step 3: Commit**

```bash
git add src/components/StoryStep.svelte
git commit -m "Add StoryStep data-portrait component"
```

---

### Task B4: Add `tour` / `interactive` modes to `Map.svelte`

**Files:**
- Modify: `src/components/Map.svelte`

- [ ] **Step 1: Extend props and add camera/emphasis logic**

Replace the `<script>` block from Task A5 with this version (adds `mode`, `activeSlug`, camera control, dim/emphasise, interaction toggle, reduced-motion):

```svelte
<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import type { Slaughterhouse } from '../lib/data';

  // Single pin colour. Keep in sync with --c-pin in src/styles/global.css.
  const PIN_COLOR = '#7f1d1d';
  const NL_CENTER: [number, number] = [52.15, 5.4];
  const NL_ZOOM = 7;

  type Props = {
    slaughterhouses: Slaughterhouse[];
    visibleCaseNrs: Set<number>;
    base: string;
    mode?: 'tour' | 'interactive';
    activeSlug?: string | null;
  };
  let { slaughterhouses, visibleCaseNrs, base, mode = 'interactive', activeSlug = null }: Props = $props();

  let mapEl: HTMLDivElement;
  let map: any = null;
  let layerGroup: any = null;
  let L: any = null;
  let ready = $state(false);
  const reduceMotion = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  onMount(async () => {
    const leaflet = await import('leaflet/dist/leaflet.js');
    await import('leaflet/dist/leaflet.css');
    L = leaflet.default;

    map = L.map(mapEl, {
      center: NL_CENTER,
      zoom: NL_ZOOM,
      scrollWheelZoom: mode === 'interactive',
      zoomControl: mode === 'interactive',
      dragging: mode === 'interactive',
    });
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, ' +
        '&copy; <a href="https://carto.com/attributions">CARTO</a>',
      maxZoom: 19,
    }).addTo(map);

    layerGroup = L.layerGroup().addTo(map);
    ready = true;
  });

  onDestroy(() => { map?.remove(); });

  function escapeHtml(s: string): string {
    return s.replace(/[&<>"']/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!)
    );
  }
  function radiusFor(count: number): number { return 6 + Math.min(count * 1.2, 16); }

  function setInteractions(on: boolean) {
    if (!map) return;
    const fns = ['dragging', 'scrollWheelZoom', 'doubleClickZoom', 'boxZoom', 'keyboard'];
    for (const f of fns) on ? map[f]?.enable() : map[f]?.disable();
    map.touchZoom?.[on ? 'enable' : 'disable']?.();
    if (map.zoomControl) on ? map.zoomControl.addTo(map) : map.zoomControl.remove();
  }

  function renderMarkers() {
    if (!ready) return;
    layerGroup.clearLayers();
    for (const s of slaughterhouses) {
      if (s.lat == null || s.lon == null) continue;
      const visibleCases = mode === 'tour' ? s.cases : s.cases.filter(c => visibleCaseNrs.has(c.nr));
      if (visibleCases.length === 0) continue;

      const isActive = mode === 'tour' && s.slug === activeSlug;
      const dimmed = mode === 'tour' && activeSlug != null && !isActive;

      const marker = L.circleMarker([s.lat, s.lon], {
        radius: radiusFor(visibleCases.length) * (isActive ? 1.4 : 1),
        color: '#222',
        weight: isActive ? 2 : 1,
        fillColor: PIN_COLOR,
        fillOpacity: dimmed ? 0.25 : 0.85,
      });

      if (mode === 'interactive') {
        const voorheen = s.voormalige_namen.length
          ? `<span style="color:#777;font-style:italic">voorheen ${escapeHtml(s.voormalige_namen.join(', '))}</span><br>`
          : '';
        marker.bindPopup(`
          <strong>${escapeHtml(s.naam)}</strong><br>${voorheen}
          <span style="color:#555">${escapeHtml(s.postcode_plaats || '')}</span><br>
          <strong>${visibleCases.length}</strong> ${visibleCases.length === 1 ? 'bevinding' : 'bevindingen'}<br>
          <a href="${base}/slachthuis/${s.slug}/">Bekijk profiel &rarr;</a>
        `);
      }
      marker.addTo(layerGroup);
    }
  }

  // Re-render markers when inputs change.
  $effect(() => { void visibleCaseNrs; void slaughterhouses; void mode; void activeSlug; void ready; renderMarkers(); });

  // Drive the camera in tour mode when the active site changes.
  $effect(() => {
    if (!ready || mode !== 'tour') return;
    const s = slaughterhouses.find(x => x.slug === activeSlug);
    if (s && s.lat != null && s.lon != null) {
      if (reduceMotion) map.setView([s.lat, s.lon], 11);
      else map.flyTo([s.lat, s.lon], 11, { duration: 1.2 });
    } else {
      reduceMotion ? map.setView(NL_CENTER, NL_ZOOM) : map.flyTo(NL_CENTER, NL_ZOOM, { duration: 1.2 });
    }
  });

  // Toggle interactivity when the mode flips.
  $effect(() => {
    if (!ready) return;
    setInteractions(mode === 'interactive');
    if (mode === 'interactive') map.setView(NL_CENTER, NL_ZOOM);
  });
</script>
```

(Leave the `<div bind:this={mapEl} ...>` and `<style>` unchanged.)

- [ ] **Step 2: Verify** — `npm run check`: `0 errors` (the existing `HomeApp` call still works: `mode`/`activeSlug` are optional and default to interactive). `npm run build`: `Complete!`.

- [ ] **Step 3: Commit**

```bash
git add src/components/Map.svelte
git commit -m "Map: add tour/interactive modes with camera control"
```

---

### Task B5: `Story.svelte` — orchestrate steps, map, and hand-off

**Files:**
- Create: `src/components/Story.svelte`

- [ ] **Step 1: Write the orchestrator**

```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import Map from './Map.svelte';
  import StoryStep from './StoryStep.svelte';
  import Filters from './Filters.svelte';
  import CaseList from './CaseList.svelte';
  import { scrollytell } from '../lib/scrollytell';
  import { formatEUR } from '../lib/data';
  import type { Slaughterhouse, Case } from '../lib/data';
  import type { SiteStop, FinesSummary } from '../lib/story';
  import { emptyFilters, applyFilters, filtersToParams, paramsToFilters } from '../lib/filters';

  type Props = {
    siteStops: SiteStop[];
    fines: FinesSummary;
    slaughterhouses: Slaughterhouse[];
    cases: Case[];
    yearMin: number;
    yearMax: number;
    base: string;
  };
  let { siteStops, fines, slaughterhouses, cases, yearMin, yearMax, base }: Props = $props();

  // Step indices: 0..N-1 site stops, N = fines, N+1 = hand-off (tool).
  const finesIndex = siteStops.length;
  const toolIndex = siteStops.length + 1;

  let activeIndex = $state(0);
  let mode: 'tour' | 'interactive' = $derived(activeIndex >= toolIndex ? 'interactive' : 'tour');
  let activeSlug = $derived(activeIndex < siteStops.length ? siteStops[activeIndex].slug : null);

  let slhOptions = $derived(slaughterhouses.map(s => ({ slug: s.slug, naam: s.naam })));

  // Interactive-tool filter state (only meaningful once mode === 'interactive').
  let filters = $state(emptyFilters());
  onMount(() => {
    filters = paramsToFilters(new URLSearchParams(window.location.search));
    const onPop = () => { filters = paramsToFilters(new URLSearchParams(window.location.search)); };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  });
  function setFilters(next: typeof filters) {
    filters = next;
    const qs = filtersToParams(next).toString();
    const url = qs ? `?${qs}` : window.location.pathname;
    if (url !== window.location.pathname + window.location.search) history.pushState(null, '', url);
  }
  let filteredCases = $derived(applyFilters(cases, filters));
  let visibleCaseNrs = $derived(mode === 'interactive' ? new Set(filteredCases.map(c => c.nr)) : new Set<number>());
</script>

<div class="story">
  <div class="rail" use:scrollytell={{ onActive: i => (activeIndex = i) }}>
    {#each siteStops as stop, i}
      <StoryStep {stop} index={i} total={siteStops.length} active={activeIndex === i} />
    {/each}

    <div class="step fines" class:active={activeIndex === finesIndex} data-step>
      <div class="stepno">DE BOETES</div>
      <h2>{formatEUR(fines.totalCents)} aan boetes</h2>
      <p>
        {cases.length} bevindingen. {fines.withFine} kregen een boete, {fines.withoutFine} niet.
        De opgelegde boetes liggen tussen {formatEUR(fines.minCents)} en {formatEUR(fines.maxCents)}.
      </p>
    </div>

    <div class="step handoff" class:active={activeIndex >= toolIndex} data-step>
      <h2>Verken alle {cases.length} bevindingen</h2>
      <p>Filter op slachthuis, jaar of boete. Klik een bevinding voor de volledige tekst en de bron.</p>
      {#if mode === 'interactive'}
        <Filters {filters} {slhOptions} {yearMin} {yearMax} onChange={setFilters} />
        <CaseList cases={filteredCases} {slaughterhouses} {base} />
      {/if}
    </div>
  </div>

  <div class="sticky-map">
    <Map {slaughterhouses} {visibleCaseNrs} {base} {mode} {activeSlug} />
  </div>
</div>

<style>
  .story { display: grid; grid-template-columns: minmax(0, 1fr) 1fr; gap: 2rem; align-items: start; }
  .rail { min-width: 0; }
  .sticky-map { position: sticky; top: 0; height: 100vh; display: flex; align-items: stretch; }
  .sticky-map :global(.map) { height: 100vh; min-height: 0; border-radius: 0; border: none; border-left: 1px solid var(--c-border); }
  .step { min-height: 90vh; display: flex; flex-direction: column; justify-content: center; max-width: 38rem; }
  .step.fines, .step.handoff { opacity: 0.45; transition: opacity 0.3s; }
  .step.fines.active, .step.handoff.active { opacity: 1; }
  .stepno { font-size: 0.75rem; letter-spacing: 0.18em; color: var(--c-muted-soft); }
  .handoff { min-height: auto; padding-bottom: 3rem; }
  @media (max-width: 800px) {
    .story { grid-template-columns: 1fr; }
    .sticky-map { position: sticky; top: 0; height: 55vh; order: -1; }
    .sticky-map :global(.map) { height: 55vh; }
    .step { min-height: 70vh; }
  }
</style>
```

- [ ] **Step 2: Verify** — `npm run check`: `0 errors`.

- [ ] **Step 3: Commit**

```bash
git add src/components/Story.svelte
git commit -m "Add Story orchestrator: steps drive map, hand-off to tool"
```

---

### Task B6: Rewrite `index.astro` (hook + island + no-JS fallback)

**Files:**
- Modify: `src/pages/index.astro`

- [ ] **Step 1: Replace the file**

The `Story` island (`client:only`) is the enhanced experience; a server-rendered static article is the no-JS/SEO fallback, hidden once the island mounts (Task B7 adds the `.story-enhanced` CSS that hides it).

```astro
---
import Layout from '../layouts/Layout.astro';
import Story from '../components/Story.svelte';
import StoryStep from '../components/StoryStep.svelte';
import { loadData, formatEUR } from '../lib/data';
import { BASE as base, siteStats } from '../lib/site';
import { siteStops, finesSummary, storyYears } from '../lib/story';

const { slaughterhouses, cases } = loadData();
const stops = siteStops();
const fines = finesSummary();
const { yearMin, yearMax } = storyYears();
const { caseCount, slhCount } = siteStats();
---
<Layout title="Een rondgang langs de slachthuizen">
  <section class="hook">
    <h1>Een rondgang langs de slachthuizen</h1>
    <p class="lede">
      Tussen {yearMin} en {yearMax} legde de NVWA <strong>{caseCount} bevindingen</strong> vast bij
      <strong>{slhCount} Nederlandse roodvleesslachthuizen</strong>, samen goed voor
      <strong>{formatEUR(fines.totalCents)}</strong> aan boetes. Eén bedrijf is goed voor {stops[0].caseCount}
      ervan. Scroll mee langs de meest gedocumenteerde locaties.
    </p>
    <p class="note">Let op: deze pagina citeert letterlijke NVWA-bevindingen met expliciete beschrijvingen van dierenleed.</p>
  </section>

  <Story client:only="svelte" siteStops={stops} {fines} {slaughterhouses} {cases} {yearMin} {yearMax} {base} />

  <div class="static-article">
    {stops.map((stop, i) => (
      <StoryStep stop={stop} index={i} total={stops.length} active={true} />
    ))}
    <p class="static-link"><a href={`${base}/over/`}>Over de data &rarr;</a></p>
  </div>
</Layout>

<style>
  .hook { max-width: 42rem; margin: 2rem auto 1rem; }
  .hook h1 { font-size: 2.1rem; line-height: 1.1; }
  .lede { font-size: 1.2rem; color: var(--c-text-soft); }
  .note { font-size: 0.85rem; color: var(--c-muted-soft); border-left: 3px solid var(--c-border-strong); padding-left: 0.8rem; }
  .static-article { max-width: 42rem; margin: 0 auto; }
  .static-link { margin: 2rem 0; }
</style>
```

- [ ] **Step 2: Verify the build and the computed numbers**

Run: `npm run build`
Expected: `Complete!`. The `story.ts` assertions pass during the build (proves anchors/coords/counts are valid).

Then `npm run dev` and open `http://localhost:4321/slachthuis_monitor/`. Expected: the hook shows `112 bevindingen`, `16 … slachthuizen`, `€ 398.000`, "Eén bedrijf is goed voor 20 ervan." Confirms `story.ts` numbers visually.

- [ ] **Step 3: Delete the now-unused `HomeApp.svelte`**

`index.astro` no longer imports it and `Story.svelte` has absorbed its filter/popstate logic, so it is orphaned. Remove it:

```bash
git rm src/components/HomeApp.svelte
```

Run `npm run check` → expected `0 errors` (no remaining importer).

- [ ] **Step 4: Commit**

```bash
git add src/pages/index.astro
git commit -m "Home page: scrollytelling hook + Story island + static fallback; drop HomeApp"
```

---

### Task B7: Enhancement CSS — hide the fallback once JS mounts

**Files:**
- Modify: `src/components/Story.svelte`
- Modify: `src/styles/global.css`

- [ ] **Step 1: Mark the document as enhanced on mount**

In `src/components/Story.svelte`, extend the existing `onMount` so it also flags the document (add the two `classList` lines; keep the popstate logic):

```svelte
  onMount(() => {
    document.documentElement.classList.add('story-enhanced');
    filters = paramsToFilters(new URLSearchParams(window.location.search));
    const onPop = () => { filters = paramsToFilters(new URLSearchParams(window.location.search)); };
    window.addEventListener('popstate', onPop);
    return () => {
      document.documentElement.classList.remove('story-enhanced');
      window.removeEventListener('popstate', onPop);
    };
  });
```

- [ ] **Step 2: Hide the fallback when enhanced; constrain the story to full width**

Append to `src/styles/global.css`:

```css
/* Scrollytelling: show the static article only when the JS island is absent. */
.story-enhanced .static-article { display: none; }
/* The story island manages its own two-column width; let it use the viewport. */
.story-enhanced main.container { max-width: none; padding-left: 0; padding-right: 0; }
.story-enhanced .hook { padding: 0 1.25rem; }
```

- [ ] **Step 3: Verify** — `npm run build` → `Complete!`. In `npm run dev`: with JS on, only the scrolly experience shows (no duplicated static list). Temporarily disable JS in DevTools → the static article (stops + "Over de data" link) shows instead.

- [ ] **Step 4: Commit**

```bash
git add src/components/Story.svelte src/styles/global.css
git commit -m "Hide static fallback when the Story island is active"
```

---

## Phase C — QA & verification

### Task C1: Type + build gate

- [ ] **Step 1:** Run `npm run check` → expected `0 errors, 0 warnings`.
- [ ] **Step 2:** Run `npm run build` → expected `Complete!`, no assertion failures.
- [ ] **Step 3:** Confirm the AI surface is gone: `grep -rn "ernst\|samenvatting\|ErnstBadge" src/` → no matches (the only remaining mentions allowed are in `data/boetes.json`, which is intentionally untouched).

### Task C2: Browser QA (`npm run dev`, `http://localhost:4321/slachthuis_monitor/`)

- [ ] **Step 1: Tour** — scrolling advances stops; the map flies between sites; the active site's pin enlarges and others dim; the active step brightens.
- [ ] **Step 2: Hand-off** — after the fines step, the map zooms out and becomes draggable/zoomable; the filters + case list appear.
- [ ] **Step 3: Filters** — slaughterhouse select, wel/geen boete, and year inputs filter the map + list; the URL updates (`?slh=…&boete=…&vanaf=…`); back button restores state.
- [ ] **Step 4: Deep links** — a case row links to `/slachthuis/<slug>/#case-<nr>`; the target case highlights; the "bron, p.N" link opens the source PDF at the right page.
- [ ] **Step 5: Reduced motion** — with OS "reduce motion" on (or emulated in DevTools Rendering), the map jumps (no fly animation) between stops.
- [ ] **Step 6: No-JS** — disable JavaScript: the static article (stops with verbatim findings + source links) renders and is readable; no error.
- [ ] **Step 7: Mobile** — at ≤800px, the map is sticky on top (~55vh) and steps scroll beneath; the tool stacks.
- [ ] **Step 8:** Fix any issue found, then re-run `npm run build` and commit with a descriptive message.

---

## Self-review notes (author)

- **Spec coverage:** one-page three-act flow (B5/B6), source-data-only across map/list/profile/over (A5–A9), `ernst`/tags/`samenvatting` removed (A10), factual filters (A2–A4), single persistent map with tour/interactive modes (B4/B5), most-documented-first order + largest-fine anchor + override table + assertions (B1), per-stop portrait (B3), fines stop (B5), PE fallback + reduced-motion (B6/B7/C2), `/ernst` retired (A9). All present. `HomeApp.svelte` is absorbed by `Story` and deleted in B6 (resolves the spec's "settled in the plan"). Verbatim quotes render in full in the portrait (no elision) — a deliberate, more-faithful choice over the spec's optional "[…]" default; the dense case list still truncates to a 160-char snippet.
- **No new dependency:** Leaflet reused; `scrollytell` is native IntersectionObserver. ✔
- **Type consistency:** `Filters` shape (`slh`/`fine`/`yearMin`/`yearMax`) is identical across `filters.ts`, `Filters.svelte`, `HomeApp.svelte`, `Story.svelte`. `SiteStop`/`FinesSummary` consumed by `StoryStep`/`Story` match `story.ts` exports. `Map` props (`mode`,`activeSlug`) optional → existing `HomeApp` call stays valid. `Case.slug` added in A1 before any consumer uses it.
