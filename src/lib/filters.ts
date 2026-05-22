import type { Case } from './data';

export type Filters = {
  ernst: Set<number>;
  tags: Set<string>;
  yearMin: number | null;
  yearMax: number | null;
};

export function emptyFilters(): Filters {
  return { ernst: new Set(), tags: new Set(), yearMin: null, yearMax: null };
}

export function applyFilters(cases: Case[], f: Filters): Case[] {
  return cases.filter(c => {
    if (f.ernst.size > 0 && !f.ernst.has(c.ernst)) return false;
    if (f.tags.size > 0 && !c.ernst_tags.some(t => f.tags.has(t))) return false;
    if (f.yearMin != null && (c.jaar == null || c.jaar < f.yearMin)) return false;
    if (f.yearMax != null && (c.jaar == null || c.jaar > f.yearMax)) return false;
    return true;
  });
}

export function filtersToParams(f: Filters): URLSearchParams {
  const p = new URLSearchParams();
  if (f.ernst.size) p.set('ernst', Array.from(f.ernst).sort().join(','));
  if (f.tags.size) p.set('tag', Array.from(f.tags).sort().join(','));
  if (f.yearMin != null) p.set('vanaf', String(f.yearMin));
  if (f.yearMax != null) p.set('tot', String(f.yearMax));
  return p;
}

export function paramsToFilters(p: URLSearchParams): Filters {
  const f = emptyFilters();
  const ernstStr = p.get('ernst');
  if (ernstStr) {
    for (const n of ernstStr.split(',').map(s => parseInt(s, 10))) {
      if (n >= 1 && n <= 4) f.ernst.add(n);
    }
  }
  const tagStr = p.get('tag');
  if (tagStr) for (const t of tagStr.split(',')) if (t) f.tags.add(t);
  const vanaf = p.get('vanaf');
  if (vanaf && /^\d{4}$/.test(vanaf)) f.yearMin = parseInt(vanaf, 10);
  const tot = p.get('tot');
  if (tot && /^\d{4}$/.test(tot)) f.yearMax = parseInt(tot, 10);
  return f;
}
