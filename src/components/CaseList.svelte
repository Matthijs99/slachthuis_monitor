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
