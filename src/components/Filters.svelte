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
      aria-label="Jaar vanaf"
      oninput={e => setYearMin((e.target as HTMLInputElement).value)} />
    <span>–</span>
    <input type="number" min={yearMin} max={yearMax} value={filters.yearMax ?? ''} placeholder="tot"
      aria-label="Jaar tot"
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
