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

<div class="home-app">
  <Filters {filters} {slhOptions} {yearMin} {yearMax} onChange={setFilters} />
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
