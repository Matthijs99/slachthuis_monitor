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

<div bind:this={mapEl} class="map" role="application" aria-label="Kaart van slachthuizen"></div>

<style>
  .map {
    width: 100%;
    height: 65vh;
    min-height: 420px;
    border-radius: var(--radius);
    overflow: hidden;
    border: 1px solid var(--c-border);
  }
  :global(.leaflet-popup-content) { font-family: inherit; font-size: 0.9rem; }
</style>
