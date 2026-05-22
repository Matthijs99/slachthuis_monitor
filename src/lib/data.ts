import boetes from '../../data/boetes.json';
import geocoded from '../../data/geocoded.json';

export type Ernst = 1 | 2 | 3 | 4;

export type Case = {
  nr: number;
  rapport_nr: string | null;
  datum: string;
  jaar: number | null;
  overtreding: string;
  boetebedrag: string | null;
  reactie: string | null;
  samenvatting: string;
  ernst: Ernst;
  ernst_tags: string[];
};

export type Slaughterhouse = {
  slug: string;
  naam: string;
  adres: string | null;
  postcode_plaats: string | null;
  lat: number | null;
  lon: number | null;
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

let cache: { slaughterhouses: Slaughterhouse[]; cases: Case[] } | null = null;

export function loadData(): { slaughterhouses: Slaughterhouse[]; cases: Case[] } {
  if (cache) return cache;

  const raw = boetes as RawBoete[];
  const geo = geocoded as RawGeo;

  const bySlh = new Map<string, Slaughterhouse>();

  for (const b of raw) {
    const key = dedupeKey(b.slachthuis.naam, b.slachthuis.postcode_plaats);
    const g = geo[key] ?? {};
    if (!bySlh.has(key)) {
      bySlh.set(key, {
        slug: slugFor(b.slachthuis.naam, b.slachthuis.postcode_plaats),
        naam: b.slachthuis.naam,
        adres: b.slachthuis.adres,
        postcode_plaats: b.slachthuis.postcode_plaats,
        lat: g.lat ?? null,
        lon: g.lon ?? null,
        cases: [],
      });
    }
    bySlh.get(key)!.cases.push({
      nr: b.nr,
      rapport_nr: b.rapport_nr,
      datum: b.datum,
      jaar: extractYear(b.datum),
      overtreding: b.overtreding,
      boetebedrag: b.boetebedrag,
      reactie: b.reactie,
      samenvatting: b.samenvatting,
      ernst: b.ernst as Ernst,
      ernst_tags: b.ernst_tags,
    });
  }

  // Ensure slugs are unique (defensive — should already be by construction)
  const slugCounts = new Map<string, number>();
  for (const s of bySlh.values()) {
    const n = (slugCounts.get(s.slug) ?? 0) + 1;
    slugCounts.set(s.slug, n);
    if (n > 1) s.slug = `${s.slug}-${n}`;
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
