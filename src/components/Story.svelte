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
