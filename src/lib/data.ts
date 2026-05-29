import boetes from '../../data/boetes.json';
import geocoded from '../../data/geocoded.json';
import pagesData from '../../data/pages.json';
import type { Ernst } from './ernst';

// Re-exported for back-compat: the canonical definition now lives in ./ernst.
export type { Ernst } from './ernst';

// The official public WOO-besluit this dataset is extracted from, served as an
// inline PDF by open.overheid.nl. Kept as the direct attachment URL (not an HTML
// landing page) so the per-case `#page=N` deep links in slachthuis/[slug].astro
// resolve in the browser's PDF viewer.
export const SOURCE_DOCUMENT_URL = 'https://open.overheid.nl/overheid/openbaarmakingen/api/v0/attachment/e94307d9-9e5b-4ad2-a7c8-66b054155cfb';
export const SOURCE_REPO_URL = 'https://github.com/Matthijs99/slachthuis_monitor';

export type Case = {
  nr: number;
  rapport_nr: string | null;
  datum: string;
  jaar: number | null;
  bron_pagina: number | null;
  overtreding: string;
  boetebedrag: string | null;
  reactie: string | null;
  samenvatting: string;
  ernst: Ernst;
  ernst_tags: string[];
  // Original operator name when it differs from the merged site's primary name
  // (set for findings of a former operator at a site that has since changed hands).
  operator_naam: string | null;
};

export type Slaughterhouse = {
  slug: string;
  naam: string;
  adres: string | null;
  postcode_plaats: string | null;
  lat: number | null;
  lon: number | null;
  // Former operators of this physical site, if it changed hands over time.
  voormalige_namen: string[];
  cases: Case[];
};

type RawBoete = {
  nr: number;
  rapport_nr: string | null;
  datum: string;
  slachthuis: { naam: string; adres: string | null; postcode_plaats: string | null };
  overtreding: string;
  boetebedrag: string | null;
  reactie: string | null;
  samenvatting: string;
  ernst: number;
  ernst_tags: string[];
};

type RawGeo = Record<string, {
  naam: string;
  adres: string | null;
  postcode_plaats: string | null;
  lat: number | null;
  lon: number | null;
  matched: string | null;
}>;

type RawPages = Record<string, { page: number | null; method: string }>;

function extractYear(datum: string): number | null {
  const m = datum.match(/\b(19|20)\d{2}\b/);
  return m ? parseInt(m[0], 10) : null;
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function slugFor(naam: string, postcode_plaats: string | null): string {
  const plaats = (postcode_plaats || '').replace(/^\d{4}\s*[A-Z]{0,2}\s*/i, '').trim();
  return slugify(plaats ? `${naam} ${plaats}` : naam);
}

// IMPORTANT: keep this in sync with scripts/geocode.py:dedupe_key — case-insensitive on postcode_plaats
function dedupeKey(naam: string, postcode_plaats: string | null): string {
  return `${naam}|${(postcode_plaats || '').toLowerCase()}`;
}

// Sites where multiple legal operators occupied the same physical address over time.
// We can't group on the raw address (OCR noise inflates it), and name-based dedup keeps
// these as separate entries that geocode to identical coordinates — so they'd stack as
// overlapping pins. Merge them explicitly: `primary` is the current/most-recent operator
// whose name + slug represent the site; `merge` keys are former operators folded into it.
const SITE_MERGES: { primary: string; merge: string[] }[] = [
  {
    // De Hoef Westzijde 33, 1426 AS De Hoef — Wouters operated until mid-2018,
    // then Amstelland took over the same premises.
    primary: dedupeKey('Slachterij Amstelland B.V.', '1426 AS De Hoef'),
    merge: [dedupeKey('Slachterij/Grossierderij Wouters B.V.', '1426 AS De Hoef')],
  },
];

let cache: { slaughterhouses: Slaughterhouse[]; cases: Case[] } | null = null;

export function loadData(): { slaughterhouses: Slaughterhouse[]; cases: Case[] } {
  if (cache) return cache;

  const raw = boetes as RawBoete[];
  const geo = geocoded as RawGeo;
  const pages = pagesData as RawPages;

  const bySlh = new Map<string, Slaughterhouse>();

  for (const b of raw) {
    const key = dedupeKey(b.slachthuis.naam, b.slachthuis.postcode_plaats);
    const g = geo[key];
    if (!bySlh.has(key)) {
      if (!g) {
        console.warn(`[data] no geocode entry for key "${key}" (${b.slachthuis.naam})`);
      }
      bySlh.set(key, {
        slug: slugFor(b.slachthuis.naam, b.slachthuis.postcode_plaats),
        naam: b.slachthuis.naam,
        adres: b.slachthuis.adres,
        postcode_plaats: b.slachthuis.postcode_plaats,
        lat: g?.lat ?? null,
        lon: g?.lon ?? null,
        voormalige_namen: [],
        cases: [],
      });
    }
    bySlh.get(key)!.cases.push({
      nr: b.nr,
      rapport_nr: b.rapport_nr,
      datum: b.datum,
      jaar: extractYear(b.datum),
      bron_pagina: pages[String(b.nr)]?.page ?? null,
      overtreding: b.overtreding,
      boetebedrag: b.boetebedrag,
      reactie: b.reactie,
      samenvatting: b.samenvatting,
      ernst: b.ernst as Ernst,
      ernst_tags: b.ernst_tags,
      operator_naam: null,
    });
  }

  // Fold former operators into their site's current operator (see SITE_MERGES).
  for (const { primary, merge } of SITE_MERGES) {
    const target = bySlh.get(primary);
    if (!target) continue;
    for (const key of merge) {
      const former = bySlh.get(key);
      if (!former) continue;
      for (const c of former.cases) c.operator_naam = former.naam;
      target.cases.push(...former.cases);
      target.voormalige_namen.push(former.naam);
      bySlh.delete(key);
    }
    target.cases.sort((a, b) => a.nr - b.nr);
  }

  // Ensure slugs are unique (defensive — should already be by construction)
  const assignedSlugs = new Set<string>();
  for (const s of bySlh.values()) {
    if (!assignedSlugs.has(s.slug)) {
      assignedSlugs.add(s.slug);
      continue;
    }
    let n = 2;
    while (assignedSlugs.has(`${s.slug}-${n}`)) n++;
    s.slug = `${s.slug}-${n}`;
    assignedSlugs.add(s.slug);
  }

  const slaughterhouses = Array.from(bySlh.values()).sort((a, b) => a.naam.localeCompare(b.naam, 'nl'));
  const cases = slaughterhouses.flatMap(s => s.cases);

  cache = { slaughterhouses, cases };
  return cache;
}

export function parseFineCents(boetebedrag: string | null): number {
  if (!boetebedrag) return 0;
  // Dutch format: "5.000,00" -> 500000 cents
  const normalized = boetebedrag.replace(/\./g, '').replace(',', '.');
  const n = parseFloat(normalized);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

export function formatEUR(cents: number): string {
  return new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(cents / 100);
}
