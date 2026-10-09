/**
 * Tier-Definitionen: Tierart, Grundwerte (1–5), Aussehen und Icon.
 * Phase 1 enthält Lenni und Aramis; die übrigen Tiere folgen in Phase 2.
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

export const SPECIES_NAME: Record<Species, string> = {
  pferd: 'Pferd',
  katze: 'Katze',
  hund: 'Hund (Husky)',
  hamster: 'Hamster',
};

/** Farben für das prozedurale Modell (Hex-Werte). */
export interface Appearance {
  body: number;
  belly?: number;
  mane: number;
  tail: number;
  legs?: number;
  hooves?: number;
  muzzle?: number;
  /** Getigert: Farbe der Streifen. */
  stripes?: number;
}

export interface AnimalDef {
  id: string;
  name: string;
  species: Species;
  appearance: Appearance;
  /** Persönliches Icon (Emoji) für Superkraft-Sammeln (ab Phase 2). */
  icon: string;
  /** Kurze Beschreibung des Aussehens fürs Menü. */
  description: string;
  /** Farbe für Minikarte und Ergebnisliste. */
  uiColor: string;
}

export const ANIMALS: AnimalDef[] = [
  {
    id: 'lenni',
    name: 'Lenni',
    species: 'pferd',
    appearance: { body: 0xa8501f, mane: 0x8a3d14, tail: 0x8a3d14, hooves: 0x3a2a20, muzzle: 0x7a3a18 },
    icon: '🥕',
    description: 'Fuchs mit rotbraunem Fell, Mähne und Schweif.',
    uiColor: '#d9662b',
  },
  {
    id: 'aramis',
    name: 'Aramis',
    species: 'katze',
    appearance: { body: 0x7a5434, belly: 0xf4efe6, mane: 0x7a5434, tail: 0x7a5434, stripes: 0x241a12, muzzle: 0xf4efe6 },
    icon: '🐭',
    description: 'Braun-schwarz getigerter Kater mit weissem Bauch.',
    uiColor: '#8b5a2b',
  },
];

export function getAnimal(id: string): AnimalDef {
  const a = ANIMALS.find((x) => x.id === id);
  if (!a) throw new Error(`Unbekanntes Tier: ${id}`);
  return a;
}
