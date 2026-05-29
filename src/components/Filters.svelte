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
