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
