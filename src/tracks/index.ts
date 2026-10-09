import { ALPEN } from './alpen';
import { BAUERNHOF } from './bauernhof';
import { DSCHUNGEL } from './dschungel';
import { HERBSTWALD } from './herbstwald';
import { REITTURNIER } from './reitturnier';
import { SANDSTRAND } from './sandstrand';
import type { TrackData } from './types';
import { VULKAN } from './vulkan';
import { WUESTE } from './wueste';

/** Alle Strecken in Reihenfolge (Schwierigkeit steigt). */
export const TRACKS: TrackData[] = [BAUERNHOF, REITTURNIER, SANDSTRAND, HERBSTWALD, WUESTE, ALPEN, DSCHUNGEL, VULKAN];

export interface CupDef {
  id: string;
  name: string;
  icon: string;
  tracks: string[];
}

/** Die beiden Cups mit je 4 Strecken */
export const CUPS: CupDef[] = [
  { id: 'pfoten', name: 'Pfoten-Cup', icon: '🐾', tracks: ['bauernhof', 'reitturnier', 'sandstrand', 'herbstwald'] },
  { id: 'hufeisen', name: 'Hufeisen-Cup', icon: '🐎', tracks: ['wueste', 'alpen', 'dschungel', 'vulkan'] },
];

export function getTrack(id: string): TrackData {
  const t = TRACKS.find((x) => x.id === id);
  if (!t) throw new Error(`Unbekannte Strecke: ${id}`);
  return t;
}
