<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import type { Slaughterhouse } from '../lib/data';

  // Single pin colour. Keep in sync with --c-pin in src/styles/global.css.
  const PIN_COLOR = '#7f1d1d';
  const NL_CENTER: [number, number] = [52.15, 5.4];
  const NL_ZOOM = 7;

  type Props = {
    slaughterhouses: Slaughterhouse[];
    visibleCaseNrs: Set<number>;
    base: string;
    mode?: 'tour' | 'interactive';
    activeSlug?: string | null;
  };
  let { slaughterhouses, visibleCaseNrs, base, mode = 'interactive', activeSlug = null }: Props = $props();

  let mapEl: HTMLDivElement;
  let map: any = null;
  let layerGroup: any = null;
  let L: any = null;
  let ready = $state(false);
  const reduceMotion = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  onMount(async () => {
    const leaflet = await import('leaflet/dist/leaflet.js');
    await import('leaflet/dist/leaflet.css');
    L = leaflet.default;

    map = L.map(mapEl, {
      center: NL_CENTER,
      zoom: NL_ZOOM,
      scrollWheelZoom: mode === 'interactive',
      // Always create the zoom control so setInteractions() can add/remove it;
      // the mode effect removes it in tour mode. (If created false, map.zoomControl
      // never exists and could never be re-added when flipping to interactive.)
      zoomControl: true,
      dragging: mode === 'interactive',
    });
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, ' +
        '&copy; <a href="https://carto.com/attributions">CARTO</a>',
      maxZoom: 19,
    }).addTo(map);

    layerGroup = L.layerGroup().addTo(map);
    ready = true;
  });

  onDestroy(() => { map?.remove(); });

  function escapeHtml(s: string): string {
    return s.replace(/[&<>"']/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!)
    );
  }
  function radiusFor(count: number): number { return 6 + Math.min(count * 1.2, 16); }

  function setInteractions(on: boolean) {
    if (!map) return;
    const fns = ['dragging', 'scrollWheelZoom', 'doubleClickZoom', 'boxZoom', 'keyboard'];
    for (const f of fns) on ? map[f]?.enable() : map[f]?.disable();
    map.touchZoom?.[on ? 'enable' : 'disable']?.();
    if (map.zoomControl) on ? map.zoomControl.addTo(map) : map.zoomControl.remove();
  }

  function renderMarkers() {
    if (!ready) return;
    layerGroup.clearLayers();
    for (const s of slaughterhouses) {
      if (s.lat == null || s.lon == null) continue;
      const visibleCases = mode === 'tour' ? s.cases : s.cases.filter(c => visibleCaseNrs.has(c.nr));
      if (visibleCases.length === 0) continue;

      const isActive = mode === 'tour' && s.slug === activeSlug;
      const dimmed = mode === 'tour' && activeSlug != null && !isActive;

      const marker = L.circleMarker([s.lat, s.lon], {
        radius: radiusFor(visibleCases.length) * (isActive ? 1.4 : 1),
        color: '#222',
        weight: isActive ? 2 : 1,
        fillColor: PIN_COLOR,
        fillOpacity: dimmed ? 0.25 : 0.85,
      });

      if (mode === 'interactive') {
        const voorheen = s.voormalige_namen.length
          ? `<span style="color:#777;font-style:italic">voorheen ${escapeHtml(s.voormalige_namen.join(', '))}</span><br>`
          : '';
        marker.bindPopup(`
          <strong>${escapeHtml(s.naam)}</strong><br>${voorheen}
          <span style="color:#555">${escapeHtml(s.postcode_plaats || '')}</span><br>
          <strong>${visibleCases.length}</strong> ${visibleCases.length === 1 ? 'bevinding' : 'bevindingen'}<br>
          <a href="${base}/slachthuis/${s.slug}/">Bekijk profiel &rarr;</a>
        `);
      }
      marker.addTo(layerGroup);
    }
  }

  // Re-render markers when inputs change.
  $effect(() => { void visibleCaseNrs; void slaughterhouses; void mode; void activeSlug; void ready; renderMarkers(); });

  // Drive the camera in tour mode when the active site changes.
  $effect(() => {
    if (!ready || mode !== 'tour') return;
    const s = slaughterhouses.find(x => x.slug === activeSlug);
    if (s && s.lat != null && s.lon != null) {
      if (reduceMotion) map.setView([s.lat, s.lon], 11);
      else map.flyTo([s.lat, s.lon], 11, { duration: 1.2 });
    } else {
      reduceMotion ? map.setView(NL_CENTER, NL_ZOOM) : map.flyTo(NL_CENTER, NL_ZOOM, { duration: 1.2 });
    }
  });

  // Toggle interactivity when the mode flips.
  $effect(() => {
    if (!ready) return;
    setInteractions(mode === 'interactive');
    if (mode === 'interactive') map.setView(NL_CENTER, NL_ZOOM);
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
