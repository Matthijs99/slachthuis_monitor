// Single source of truth for the welfare-severity ("ernst") domain: the tier
// type and the four parallel maps that describe each tier. Every page, component
// and the map marker colors derive from here — see also the `--c-ernst-N` CSS
// variables in src/styles/global.css, which MUST stay in sync with ERNST_COLORS
// (CSS consumers use the vars; JS consumers, i.e. the Leaflet map, use the map).

export type Ernst = 1 | 2 | 3 | 4;

export const ERNST_TIERS = [1, 2, 3, 4] as const;

export const ERNST_LABELS: Record<Ernst, string> = {
  1: 'Laag',
  2: 'Midden',
  3: 'Hoog',
  4: 'Zeer hoog',
};

export const ERNST_DESCRIPTIONS: Record<Ernst, string> = {
  1: 'Administratief, hygiëne zonder dier-impact, of kleine welzijnstekorten zonder lijden.',
  2: 'Welzijn aangetast (overbezetting, vies of nat strooisel, ontbrekend drinkwater, slechte transportomstandigheden) — geen direct lijden tijdens de slacht.',
  3: 'Onnodig pijn of stress tijdens de slacht: te late nabedwelming, fixatiefout met loskomende dieren, herhaalde bedwelmingsfouten, overmatig gebruik van de elektrische prikker.',
  4: 'Dier was bewust of levend tijdens halssnede of uitslachten; óf actief geweld (slaan, schoppen, slepen aan ketens); óf meermalen mislukte bedwelming met aanhoudend lijden.',
};

// Canonical for JS consumers. Mirror of the --c-ernst-N CSS vars (keep in sync).
export const ERNST_COLORS: Record<Ernst, string> = {
  1: '#fde68a',
  2: '#fb923c',
  3: '#dc2626',
  4: '#7f1d1d',
};
