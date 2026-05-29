import type { Case } from './data';

export type Filters = {
  slh: string | null;            // slaughterhouse slug, or null for all
  fine: 'wel' | 'geen' | null;   // has a fine / has no fine / either
  yearMin: number | null;
  yearMax: number | null;
};

export function emptyFilters(): Filters {
  return { slh: null, fine: null, yearMin: null, yearMax: null };
}

export function applyFilters(cases: Case[], f: Filters): Case[] {
  return cases.filter(c => {
    if (f.slh != null && c.slug !== f.slh) return false;
    if (f.fine === 'wel' && !c.boetebedrag) return false;
    if (f.fine === 'geen' && c.boetebedrag) return false;
    if (f.yearMin != null && (c.jaar == null || c.jaar < f.yearMin)) return false;
    if (f.yearMax != null && (c.jaar == null || c.jaar > f.yearMax)) return false;
    return true;
  });
}

export function filtersToParams(f: Filters): URLSearchParams {
  const p = new URLSearchParams();
  if (f.slh) p.set('slh', f.slh);
  if (f.fine) p.set('boete', f.fine);
  if (f.yearMin != null) p.set('vanaf', String(f.yearMin));
  if (f.yearMax != null) p.set('tot', String(f.yearMax));
  return p;
}

export function paramsToFilters(p: URLSearchParams): Filters {
  const f = emptyFilters();
  const slh = p.get('slh');
  if (slh) f.slh = slh;
  const boete = p.get('boete');
  if (boete === 'wel' || boete === 'geen') f.fine = boete;
  const vanaf = p.get('vanaf');
  if (vanaf && /^\d{4}$/.test(vanaf)) f.yearMin = parseInt(vanaf, 10);
  const tot = p.get('tot');
  if (tot && /^\d{4}$/.test(tot)) f.yearMax = parseInt(tot, 10);
  return f;
}
