<script lang="ts">
  import type { Case, Slaughterhouse } from '../lib/data';
  import ErnstBadge from './ErnstBadge.svelte';

  type Props = {
    cases: Case[];
    slaughterhouses: Slaughterhouse[];
    base: string;
  };
  let { cases, slaughterhouses, base }: Props = $props();

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
  <h2>{cases.length} {cases.length === 1 ? 'bevinding' : 'bevindingen'}</h2>
  <ol>
    {#each sortedCases as c (c.nr)}
      <li class="case">
        <a href="{base}/slachthuis/{slugByCase.get(c.nr)}/#case-{c.nr}">
          <ErnstBadge ernst={c.ernst} />
          <span class="naam">{naamByCase.get(c.nr)}</span>
          <span class="datum">{c.datum}</span>
          <span class="boete">{c.boetebedrag ? `€ ${c.boetebedrag}` : '—'}</span>
          <span class="samenvatting">{c.samenvatting}</span>
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
    display: grid; grid-template-columns: auto 1fr auto auto;
    gap: 0.6rem; padding: 0.6rem 0.8rem;
    text-decoration: none; color: inherit;
    background: var(--c-surface); border: 1px solid var(--c-border-soft); border-radius: var(--radius);
    align-items: baseline;
  }
  .case a:hover { background: var(--c-surface-hover); }
  .naam { font-weight: 600; }
  .datum, .boete { color: var(--c-muted); font-size: 0.88rem; white-space: nowrap; }
  .samenvatting { grid-column: 1 / -1; margin: 0.3rem 0 0; color: var(--c-text-soft); font-size: 0.94rem; }
</style>
