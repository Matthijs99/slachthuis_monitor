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
