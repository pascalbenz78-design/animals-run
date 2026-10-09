import { BAUERNHOF } from './bauernhof';
import type { TrackData } from './types';

/** Alle Strecken in Reihenfolge. */
export const TRACKS: TrackData[] = [BAUERNHOF];

export function getTrack(id: string): TrackData {
  const t = TRACKS.find((x) => x.id === id);
  if (!t) throw new Error(`Unbekannte Strecke: ${id}`);
  return t;
}
