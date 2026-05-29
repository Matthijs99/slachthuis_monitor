import { loadData, parseFineCents, type Case } from './data';

const SITE_STOP_COUNT = 6;

// slug -> case nr, to override the default (largest-fine) anchor for a site.
// Empty by default; the default rule is used for every site. Documented escape
// hatch (e.g. ESA's largest fine is an electric-prod case; an override could
// surface the stick-beating #16 instead).
const ANCHOR_OVERRIDES: Record<string, number> = {};

export type YearCount = { year: number; count: number };

export type Anchor = {
  nr: number;
  datum: string;
  boetebedrag: string | null;
  overtreding: string;
  bron_pagina: number | null;
};

export type SiteStop = {
  slug: string;
  naam: string;
  plaats: string;
  lat: number;
  lon: number;
  caseCount: number;
  totalFineCents: number;
  periodStart: number;
  periodEnd: number;
  countsByYear: YearCount[];
  anchor: Anchor;
};

export type FinesSummary = {
  totalCents: number;
  withFine: number;
  withoutFine: number;
  minCents: number;
  maxCents: number;
};

const MONTHS: Record<string, number> = {
  januari: 1, februari: 2, maart: 3, april: 4, mei: 5, juni: 6,
  juli: 7, augustus: 8, september: 9, oktober: 10, november: 11, december: 12,
};

// Sortable key for a Dutch date like "17 juni 2021" -> 20210617. Falls back to
// year*10000 when the day/month can't be parsed. Used only for deterministic
// tie-breaking, never displayed.
function dateKey(datum: string): number {
  const m = datum.match(/(\d{1,2})\s+([a-zA-Z]+)\s+(\d{4})/);
  if (!m) {
    const y = datum.match(/(19|20)\d{2}/);
    return y ? parseInt(y[0], 10) * 10000 : 0;
  }
  const day = parseInt(m[1], 10);
  const month = MONTHS[m[2].toLowerCase()] ?? 0;
  const year = parseInt(m[3], 10);
  return year * 10000 + month * 100 + day;
}

function anchorFor(cases: Case[], slug: string): Anchor {
  const override = ANCHOR_OVERRIDES[slug];
  const chosen = override != null
    ? cases.find(c => c.nr === override)
    : pickLargestFine(cases);
  if (!chosen) throw new Error(`[story] no anchor case for site "${slug}"`);
  return {
    nr: chosen.nr,
    datum: chosen.datum,
    boetebedrag: chosen.boetebedrag,
    overtreding: chosen.overtreding,
    bron_pagina: chosen.bron_pagina,
  };
}

// Largest single fine; ties broken by earliest date, then lowest case nr.
function pickLargestFine(cases: Case[]): Case | undefined {
  const fined = cases.filter(c => c.boetebedrag);
  const pool = fined.length ? fined : cases;
  return [...pool].sort((a, b) =>
    parseFineCents(b.boetebedrag) - parseFineCents(a.boetebedrag) ||
    dateKey(a.datum) - dateKey(b.datum) ||
    a.nr - b.nr
  )[0];
}

function plaatsOf(postcode_plaats: string | null): string {
  return (postcode_plaats || '').replace(/^\d{4}\s*[A-Z]{0,2}\s*/i, '').trim();
}

let cache: { siteStops: SiteStop[]; fines: FinesSummary; yearMin: number; yearMax: number } | null = null;

function build() {
  if (cache) return cache;
  const { slaughterhouses, cases } = loadData();

  const years = cases.map(c => c.jaar).filter((y): y is number => y != null);
  const yearMin = Math.min(...years);
  const yearMax = Math.max(...years);

  const ranked = [...slaughterhouses]
    .filter(s => s.lat != null && s.lon != null)
    .map(s => {
      const fineCents = s.cases.reduce((sum, c) => sum + parseFineCents(c.boetebedrag), 0);
      const sYears = s.cases.map(c => c.jaar).filter((y): y is number => y != null);
      const byYear = new Map<number, number>();
      for (const c of s.cases) if (c.jaar != null) byYear.set(c.jaar, (byYear.get(c.jaar) ?? 0) + 1);
      const countsByYear: YearCount[] = [];
      for (let y = yearMin; y <= yearMax; y++) countsByYear.push({ year: y, count: byYear.get(y) ?? 0 });
      const stop: SiteStop = {
        slug: s.slug,
        naam: s.naam,
        plaats: plaatsOf(s.postcode_plaats),
        lat: s.lat!,
        lon: s.lon!,
        caseCount: s.cases.length,
        totalFineCents: fineCents,
        periodStart: sYears.length ? Math.min(...sYears) : yearMin,
        periodEnd: sYears.length ? Math.max(...sYears) : yearMax,
        countsByYear,
        anchor: anchorFor(s.cases, s.slug),
      };
      return stop;
    })
    .sort((a, b) =>
      b.caseCount - a.caseCount ||
      b.totalFineCents - a.totalFineCents ||
      a.naam.localeCompare(b.naam, 'nl')
    );

  const siteStops = ranked.slice(0, SITE_STOP_COUNT);

  const fineVals = cases.map(c => parseFineCents(c.boetebedrag)).filter(v => v > 0);
  const fines: FinesSummary = {
    totalCents: fineVals.reduce((a, b) => a + b, 0),
    withFine: cases.filter(c => c.boetebedrag).length,
    withoutFine: cases.filter(c => !c.boetebedrag).length,
    minCents: Math.min(...fineVals),
    maxCents: Math.max(...fineVals),
  };

  // --- build-time assertions (fail the build on bad data) ---
  const allNrs = new Set(cases.map(c => c.nr));
  for (const [slug, nr] of Object.entries(ANCHOR_OVERRIDES)) {
    if (!cases.some(c => c.slug === slug && c.nr === nr)) {
      throw new Error(`[story] override ${slug} -> #${nr} does not match a case at that site`);
    }
  }
  for (const s of siteStops) {
    if (!allNrs.has(s.anchor.nr)) throw new Error(`[story] anchor #${s.anchor.nr} for ${s.slug} is not a real case`);
    if (!Number.isFinite(s.lat) || !Number.isFinite(s.lon)) throw new Error(`[story] ${s.slug} lacks coordinates`);
  }
  if (siteStops.length !== SITE_STOP_COUNT) {
    throw new Error(`[story] expected ${SITE_STOP_COUNT} site stops, got ${siteStops.length}`);
  }
  const totalCases = slaughterhouses.reduce((sum, s) => sum + s.cases.length, 0);
  if (totalCases !== cases.length) throw new Error(`[story] case-count mismatch: ${totalCases} vs ${cases.length}`);

  cache = { siteStops, fines, yearMin, yearMax };
  return cache;
}

export function siteStops(): SiteStop[] { return build().siteStops; }
export function finesSummary(): FinesSummary { return build().fines; }
export function storyYears(): { yearMin: number; yearMax: number } {
  const b = build();
  return { yearMin: b.yearMin, yearMax: b.yearMax };
}
