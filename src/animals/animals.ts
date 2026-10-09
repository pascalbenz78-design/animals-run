/**
 * Tier-Definitionen: Tierart, Grundwerte (1–5), Aussehen, Icon und Superkraft.
 * Texte (Beschreibung, Superkraft) stehen in config/texts.ts.
 */

export type Species = 'pferd' | 'katze' | 'hund' | 'hamster';

export interface BaseStats {
  tempo: number;
  beschleunigung: number;
  sprung: number;
  schwimmen: number;
  wendigkeit: number;
}

/** Grundwerte nach Tierart (Skala 1–5). */
export const SPECIES_STATS: Record<Species, BaseStats> = {
  pferd: { tempo: 5, beschleunigung: 3, sprung: 5, schwimmen: 3, wendigkeit: 2 },
  katze: { tempo: 3, beschleunigung: 5, sprung: 4, schwimmen: 1, wendigkeit: 5 },
  hund: { tempo: 4, beschleunigung: 4, sprung: 3, schwimmen: 5, wendigkeit: 3 },
  hamster: { tempo: 2, beschleunigung: 5, sprung: 2, schwimmen: 2, wendigkeit: 5 },
};

export type PowerId =
  | 'turboGalopp'
  | 'sprungAttacke'
  | 'apfelRegen'
  | 'schutzpflaster'
  | 'wirbelsturm'
  | 'maeusejagd'
  | 'erdbeben'
  | 'miauSchrei'
  | 'spuernase'
  | 'hamsterkugel';

/** Farben und Merkmale für das prozedurale Modell (Hex-Werte). */
export interface Appearance {
  body: number;
  belly?: number;
  mane: number;
  /** Zweite Mähnenfarbe (gescheckte Mähne oder dunkler Mittelstreifen der Stehmähne) */
  mane2?: number;
  tail: number;
  legs?: number;
  hooves?: number;
  muzzle?: number;
  /** Getigert: Farbe der Streifen */
  stripes?: number;
  /** Flecken (Scheckung, weisse Stellen) */
  patches?: { color: number; spots: [number, number, number, number][] };
  /** Weisser Fleck im Nacken (Ray) */
  neckSpot?: number;
  /** Fesselbehang (Tinker) */
  feathering?: number;
  /** Stehmähne (Fjordpferd) */
  standingMane?: boolean;
  /** Aalstrich über den Rücken */
  dorsalStripe?: number;
  /** Weisses Gesicht / Blesse / Maske */
  face?: number;
  /** Weisse Pfoten */
  paws?: number;
  eyes?: number;
  /** Körperbau */
  build?: 'kraeftig' | 'kompakt' | 'normal';
}

export interface AnimalDef {
  id: string;
  name: string;
  species: Species;
  appearance: Appearance;
  /** Persönliches Icon (Emoji) zum Sammeln */
  icon: string;
  power: PowerId;
  /** Farbe für Minikarte und Listen */
  uiColor: string;
  /** Besonderheiten innerhalb der Tierart */
  traits?: {
    /** Wird bei Zusammenstössen weniger weggestossen (0–1, kleiner = robuster) */
    pushFactor?: number;
    /** Rutscht auf Eis und Matsch weniger (0–1, Anteil der Bremswirkung) */
    surefoot?: number;
  };
}

export const ANIMALS: AnimalDef[] = [
  {
    id: 'lenni',
    name: 'Lenni',
    species: 'pferd',
    appearance: { body: 0xa8501f, mane: 0x8a3d14, tail: 0x8a3d14, hooves: 0x3a2a20, muzzle: 0x7a3a18 },
    icon: '🥕',
    power: 'turboGalopp',
    uiColor: '#d9662b',
  },
  {
    id: 'furiel',
    name: 'Furiel',
    species: 'pferd',
    appearance: { body: 0xeceae6, mane: 0xd4d3cf, tail: 0xd8d7d3, hooves: 0x5a5a5a, muzzle: 0xbdbcb8, eyes: 0x2a2a2a },
    icon: '⚖️',
    power: 'sprungAttacke',
    uiColor: '#c9c9d6',
  },
  {
    id: 'ray',
    name: 'Ray',
    species: 'pferd',
    appearance: { body: 0x76482a, mane: 0x16110d, tail: 0x16110d, legs: 0x5b3820, hooves: 0x1e1712, muzzle: 0x5a3720, neckSpot: 0xffffff },
    icon: '🍎',
    power: 'apfelRegen',
    uiColor: '#8a4f2a',
  },
  {
    id: 'athena',
    name: 'Athena',
    species: 'pferd',
    appearance: {
      body: 0x8a5631,
      mane: 0x151515,
      mane2: 0xf3f3f3,
      tail: 0x262626,
      hooves: 0x3a3a3a,
      muzzle: 0xf3f3f3,
      feathering: 0xf3f3f3,
      build: 'kraeftig',
      face: 0xf3f3f3,
      patches: {
        color: 0xf3f3f3,
        spots: [
          [0.25, 0.25, 0.1, 0.32],
          [-0.28, 0.2, -0.35, 0.3],
          [0, 0.05, 0.55, 0.26],
        ],
      },
    },
    icon: '🩹',
    power: 'schutzpflaster',
    uiColor: '#b07a4a',
    traits: { pushFactor: 0.45 },
  },
  {
    id: 'helja',
    name: 'Helja',
    species: 'pferd',
    appearance: {
      body: 0xd9bb8a,
      mane: 0xf1e4c6,
      mane2: 0x2a2018,
      tail: 0xcdb48a,
      legs: 0xb89a6c,
      hooves: 0x2a2018,
      muzzle: 0xa48a62,
      standingMane: true,
      dorsalStripe: 0x3a2c1e,
      build: 'kompakt',
    },
    icon: '🌪️',
    power: 'wirbelsturm',
    uiColor: '#e0c48f',
    traits: { surefoot: 0.5 },
  },
  {
    id: 'aramis',
    name: 'Aramis',
    species: 'katze',
    appearance: { body: 0x7a5434, belly: 0xf4efe6, mane: 0x7a5434, tail: 0x7a5434, stripes: 0x241a12, muzzle: 0xf4efe6 },
    icon: '🐭',
    power: 'maeusejagd',
    uiColor: '#8b5a2b',
  },
  {
    id: 'simba',
    name: 'Simba',
    species: 'katze',
    appearance: { body: 0xe98a2f, belly: 0xf7dcb0, mane: 0xe98a2f, tail: 0xe98a2f, stripes: 0xb2560f, muzzle: 0xf7dcb0 },
    icon: '🥫',
    power: 'erdbeben',
    uiColor: '#f08a24',
  },
  {
    id: 'shadow',
    name: 'Shadow',
    species: 'katze',
    appearance: {
      body: 0x1c1c22,
      belly: 0xf4f4f4,
      mane: 0x1c1c22,
      tail: 0x1c1c22,
      muzzle: 0xf4f4f4,
      face: 0xf4f4f4,
      paws: 0xf4f4f4,
      eyes: 0xf2c84b,
      patches: { color: 0xf4f4f4, spots: [[0.2, 0.32, -0.2, 0.12], [-0.18, 0.3, 0.15, 0.1]] },
    },
    icon: '🎵',
    power: 'miauSchrei',
    uiColor: '#3a3a4a',
  },
  {
    id: 'tira',
    name: 'Tira',
    species: 'hund',
    appearance: { body: 0x1e1e24, belly: 0xf2f2f2, mane: 0x1e1e24, tail: 0x1e1e24, muzzle: 0xf2f2f2, face: 0xf2f2f2, paws: 0xf2f2f2, eyes: 0x5ab8f0 },
    icon: '🦴',
    power: 'spuernase',
    uiColor: '#4a5a7a',
  },
  {
    id: 'gonzi',
    name: 'Gonzi',
    species: 'hamster',
    appearance: { body: 0xc6b8a2, belly: 0xece4d6, mane: 0xc6b8a2, tail: 0xc6b8a2, muzzle: 0xece4d6, paws: 0xf0c8c0 },
    icon: '🎡',
    power: 'hamsterkugel',
    uiColor: '#bfa98a',
  },
];

export function getAnimal(id: string): AnimalDef {
  const a = ANIMALS.find((x) => x.id === id);
  if (!a) throw new Error(`Unbekanntes Tier: ${id}`);
  return a;
}
