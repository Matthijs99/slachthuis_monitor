<script lang="ts">
  import { onMount } from 'svelte';
  import type { Slaughterhouse } from '../lib/data';

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
    const leaflet = await import('leaflet');
    await import('leaflet/dist/leaflet.css');
    L = leaflet.default;

    map = L.map(mapEl, {
      center: [52.15, 5.4],
      zoom: 7,
      scrollWheelZoom: true,
    });
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, ' +
        '&copy; <a href="https://carto.com/attributions">CARTO</a>',
      maxZoom: 19,
    }).addTo(map);

    layerGroup = L.layerGroup().addTo(map);
    renderMarkers();
  });

  function severityColor(ernst: number): string {
    return ['#cccccc', '#fde68a', '#fb923c', '#dc2626', '#7f1d1d'][ernst] || '#888888';
  }

  function escapeHtml(s: string): string {
    return s.replace(/[&<>"']/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!)
    );
  }

  function renderMarkers() {
    if (!map || !L || !layerGroup) return;
    layerGroup.clearLayers();

    for (const s of slaughterhouses) {
      if (s.lat == null || s.lon == null) continue;
      const visibleCases = s.cases.filter(c => visibleCaseNrs.has(c.nr));
      if (visibleCases.length === 0) continue;

      const maxErnst = Math.max(...visibleCases.map(c => c.ernst));
      const color = severityColor(maxErnst);

      const marker = L.circleMarker([s.lat, s.lon], {
        radius: 6 + Math.min(visibleCases.length * 1.5, 12),
        color: '#222',
        weight: 1,
        fillColor: color,
        fillOpacity: 0.85,
      });

      const popup = `
        <strong>${escapeHtml(s.naam)}</strong><br>
        <span style="color:#555">${escapeHtml(s.postcode_plaats || '')}</span><br>
        <strong>${visibleCases.length}</strong> ${visibleCases.length === 1 ? 'zaak' : 'zaken'} ·
        max ernst <strong>${maxErnst}</strong><br>
        <a href="${base}/slachthuis/${s.slug}/">Bekijk profiel &rarr;</a>
      `;
      marker.bindPopup(popup);
      marker.addTo(layerGroup);
    }
  }

  $effect(() => {
    // Reading these props inside the effect registers them as dependencies,
    // so renderMarkers() re-runs whenever either changes.
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
    border-radius: 6px;
    overflow: hidden;
    border: 1px solid #e3e3e3;
  }
  :global(.leaflet-popup-content) { font-family: inherit; font-size: 0.9rem; }
</style>
