import { loadData } from './data';

// The site's base path with any trailing slash stripped, so callers can write
// `${BASE}/over/`. Vite inlines import.meta.env.BASE_URL at build time, so this
// works in both .astro pages and client .svelte components.
export const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

// Headline figures shared by the Kaart and Over pages, so both quote identical
// numbers and phrasing from one place.
export function siteStats() {
  const { cases, slaughterhouses } = loadData();
  const years = cases.map(c => c.jaar).filter((y): y is number => y != null);
  return {
    caseCount: cases.length,
    slhCount: slaughterhouses.length,
    yearMin: Math.min(...years),
    yearMax: Math.max(...years),
    withFine: cases.filter(c => c.boetebedrag).length,
  };
}
